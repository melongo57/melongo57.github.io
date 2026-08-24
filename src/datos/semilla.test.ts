import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { hoyISO } from '@/dominio/fechas.ts';
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
  it('crea los tres vehículos', async () => {
    const vehiculos = await repo.vehiculos.listar();
    expect(vehiculos.map((v) => v.alias).sort()).toEqual(['El Golf', 'El Ibiza', 'La Zoe']);
  });

  it('solo siembra si la base está vacía', async () => {
    expect(await estaVacia(repo)).toBe(false);
    expect(await sembrarSiHaceFalta(repo)).toBe(false);
    expect(await repo.vehiculos.contar()).toBe(3);
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
