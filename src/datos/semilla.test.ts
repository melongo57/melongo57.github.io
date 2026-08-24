import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { diasEntre, hoyISO, mesesEntre } from '@/dominio/fechas.ts';
import { kmAnuales } from '@/dominio/odometro.ts';
import { nuevoId } from '@/dominio/ids.ts';
import { BaseDatosGaraje } from './db.ts';
import type { Repositorio } from './repositorio.ts';
import { crearRepositorioDexie } from './repositorioDexie.ts';
import { cargarDatosEjemplo, estaVacia, sembrarSiHaceFalta } from './semilla.ts';

let base: BaseDatosGaraje;
let repo: Repositorio;

beforeEach(async () => {
  base = new BaseDatosGaraje(`semilla-${nuevoId()}`);
  await base.open();
  repo = crearRepositorioDexie(base);
  await cargarDatosEjemplo(repo);
});

afterEach(async () => {
  await base.delete();
});

async function porAlias(alias: string) {
  const vehiculos = await repo.vehiculos.listar();
  const v = vehiculos.find((x) => x.alias === alias);
  if (!v) throw new Error(`No existe el vehículo ${alias}`);
  return v;
}

describe('datos de ejemplo', () => {
  it('crea los cuatro vehículos', async () => {
    const vehiculos = await repo.vehiculos.listar();
    expect(vehiculos.map((v) => v.alias).sort()).toEqual([
      'El Golf',
      'El Ibiza',
      'La Autocaravana',
      'La Zoe',
    ]);
  });

  it('solo siembra si la base está vacía', async () => {
    expect(await estaVacia(repo)).toBe(false);
    expect(await sembrarSiHaceFalta(repo)).toBe(false);
    expect(await repo.vehiculos.contar()).toBe(4);
  });
});

describe('La Autocaravana — pocos kilómetros, mantenimiento por tiempo', () => {
  it('rueda muy poco al año, también según el ritmo reciente', async () => {
    const camper = await porAlias('La Autocaravana');
    const puntos = await repo.puntosOdometro(camper.id);
    const primero = puntos[0]!;
    const ultimo = puntos.at(-1)!;

    const anios = diasEntre(primero.fecha, ultimo.fecha) / 365;
    const mediaHistorica = (ultimo.km - primero.km) / anios;
    expect(mediaHistorica).toBeGreaterThan(3000);
    expect(mediaHistorica).toBeLessThan(8000);

    /*
     * Y, sobre todo, el ritmo de la ventana reciente, que es el que enseña la
     * app. Comprobar solo la media histórica dejaba pasar una semilla con los
     * nueve repostajes apiñados en cuatro meses: la media salía bien y el
     * panel anunciaba 19.000 km al año.
     */
    expect(kmAnuales(puntos)).toBeGreaterThan(2500);
    expect(kmAnuales(puntos)).toBeLessThan(8000);
  });

  it('no deja ningún registro con el odómetro a cero después de la compra', async () => {
    const camper = await porAlias('La Autocaravana');
    const puntos = await repo.puntosOdometro(camper.id);
    // Un mantenimiento anterior al primer repostaje se interpolaba hacia atrás
    // y quedaba recortado a 0 km.
    for (const punto of puntos) {
      expect(punto.km).toBeGreaterThanOrEqual(camper.kmCompra ?? 0);
    }
  });

  it('tiene las reglas propias de una autocaravana', async () => {
    const camper = await porAlias('La Autocaravana');
    const reglas = await repo.reglas.listarPorVehiculo(camper.id);
    const tipos = reglas.map((r) => r.tipo);

    expect(tipos).toContain('sellado_techo');
    expect(tipos).toContain('instalacion_gas');
    expect(reglas.find((r) => r.tipo === 'sellado_techo')?.cadaMeses).toBe(12);
  });

  it('tiene el sellado del techo caducado', async () => {
    const camper = await porAlias('La Autocaravana');
    const mantenimientos = await repo.mantenimientos.listarPorVehiculo(camper.id);
    const sellado = mantenimientos.find((m) => m.tipo === 'sellado_techo');

    expect(sellado).toBeDefined();
    // La regla es anual y del último hace más de doce meses: debe salir en
    // rojo en el panel. Es el aviso que más caro sale ignorar.
    expect(mesesEntre(sellado!.fecha, hoyISO())).toBeGreaterThan(12);
  });
});

describe('El Golf — caso denso de combustión', () => {
  it('reposta en litros', async () => {
    const golf = await porAlias('El Golf');
    const repostajes = await repo.repostajes.listarPorVehiculo(golf.id);
    expect(repostajes).toHaveLength(34);
    expect(repostajes.every((r) => r.unidad === 'l')).toBe(true);
  });

  it('incluye repostajes parciales, que rompen el cálculo ingenuo de consumo', async () => {
    const golf = await porAlias('El Golf');
    const repostajes = await repo.repostajes.listarPorVehiculo(golf.id);
    expect(repostajes.some((r) => !r.depositoLleno)).toBe(true);
  });

  it('incluye una ruptura de serie', async () => {
    const golf = await porAlias('El Golf');
    const repostajes = await repo.repostajes.listarPorVehiculo(golf.id);
    expect(repostajes.filter((r) => r.rupturaSerie)).toHaveLength(1);
  });

  it('tiene un odómetro monótono creciente', async () => {
    const golf = await porAlias('El Golf');
    const puntos = await repo.puntosOdometro(golf.id);
    const soloRecientes = puntos.filter((p) => p.fecha >= '2020-01-01');
    for (let i = 1; i < soloRecientes.length; i += 1) {
      expect(soloRecientes[i]!.km).toBeGreaterThanOrEqual(soloRecientes[i - 1]!.km);
    }
  });

  it('tiene reglas de mantenimiento con recurrencia doble', async () => {
    const golf = await porAlias('El Golf');
    const reglas = await repo.reglas.listarPorVehiculo(golf.id);
    const aceite = reglas.find((r) => r.tipo === 'aceite');
    expect(aceite?.cadaKm).toBe(15000);
    expect(aceite?.cadaMeses).toBe(12);
    // Toda regla debe poder disparar por algo.
    expect(reglas.every((r) => r.cadaKm !== undefined || r.cadaMeses !== undefined)).toBe(true);
  });

  it('deja el panel con un vencimiento en rojo, uno en ámbar y uno en verde', async () => {
    const golf = await porAlias('El Golf');
    const hoy = hoyISO();
    const docs = await repo.documentos.listarPorVehiculo(golf.id);

    const itv = docs.find((d) => d.tipo === 'itv');
    const seguro = docs.find((d) => d.tipo === 'seguro');
    const impuesto = docs.find((d) => d.tipo === 'impuesto_circulacion');

    expect(itv?.fechaVencimiento! < hoy).toBe(true); // vencida
    expect(seguro?.fechaVencimiento! > hoy).toBe(true); // próxima
    expect(impuesto?.fechaVencimiento! > seguro!.fechaVencimiento!).toBe(true); // lejana
  });
});

describe('La Zoe — caso eléctrico', () => {
  it('carga en kWh, no en litros', async () => {
    const zoe = await porAlias('La Zoe');
    const cargas = await repo.repostajes.listarPorVehiculo(zoe.id);
    expect(cargas.length).toBeGreaterThan(0);
    expect(cargas.every((c) => c.unidad === 'kWh')).toBe(true);
  });

  it('no tiene reglas de aceite ni de distribución', async () => {
    const zoe = await porAlias('La Zoe');
    const reglas = await repo.reglas.listarPorVehiculo(zoe.id);
    const tipos = reglas.map((r) => r.tipo);
    expect(tipos).not.toContain('aceite');
    expect(tipos).not.toContain('distribucion');
    expect(tipos).toContain('neumaticos');
  });
});

describe('El Ibiza — cambio de titularidad', () => {
  it('queda marcado como vendido con fecha y kilómetros', async () => {
    const ibiza = await porAlias('El Ibiza');
    expect(ibiza.estado).toBe('vendido');
    expect(ibiza.fechaVenta).toBeDefined();
    expect(ibiza.kmVenta).toBe(198400);
    expect(ibiza.precioVentaCentimos).toBe(190000);
  });

  it('conserva su histórico completo', async () => {
    const ibiza = await porAlias('El Ibiza');
    expect((await repo.repostajes.listarPorVehiculo(ibiza.id)).length).toBeGreaterThan(0);
    expect((await repo.mantenimientos.listarPorVehiculo(ibiza.id)).length).toBeGreaterThan(0);
  });

  it('no registra nada después de la fecha de venta', async () => {
    const ibiza = await porAlias('El Ibiza');
    const puntos = await repo.puntosOdometro(ibiza.id);
    const ultimo = puntos.at(-1);
    expect(ultimo?.fecha).toBe(ibiza.fechaVenta);
  });
});

describe('coherencia de los importes', () => {
  it('guarda todos los importes como enteros', async () => {
    const vehiculos = await repo.vehiculos.listar();
    for (const v of vehiculos) {
      for (const r of await repo.repostajes.listarPorVehiculo(v.id)) {
        expect(Number.isInteger(r.importeCentimos)).toBe(true);
      }
      for (const g of await repo.gastos.listarPorVehiculo(v.id)) {
        expect(Number.isInteger(g.importeCentimos)).toBe(true);
      }
      for (const m of await repo.mantenimientos.listarPorVehiculo(v.id)) {
        expect(Number.isInteger(m.costeCentimos)).toBe(true);
      }
    }
  });

  it('da precios por unidad plausibles', async () => {
    const golf = await porAlias('El Golf');
    for (const r of await repo.repostajes.listarPorVehiculo(golf.id)) {
      const precio = r.importeCentimos / 100 / r.cantidad;
      expect(precio).toBeGreaterThan(1.3);
      expect(precio).toBeLessThan(1.8);
    }
  });
});
