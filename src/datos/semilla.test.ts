import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { diasEntre, hoyISO, mesesEntre } from '@/dominio/fechas.ts';
import { estimarKm, kmAnuales } from '@/dominio/odometro.ts';
import { calcularVencimientos } from '@/dominio/vencimientos.ts';
import { resumirConsumo } from '@/dominio/consumo.ts';
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

/** Lo que enseñaría la app: el motor de vencimientos sobre los datos sembrados. */
async function vencimientosDe(alias: string) {
  const vehiculo = await porAlias(alias);
  const [puntos, alertas, ajustes] = await Promise.all([
    repo.puntosOdometro(vehiculo.id),
    repo.alertas.listarPorVehiculo(vehiculo.id),
    repo.ajustes.obtener(),
  ]);
  const estimacion = estimarKm(puntos, vehiculo);
  const lista = calcularVencimientos({ vehiculo, alertas, estimacion, ajustes });
  const por = (nombre: string) => {
    const v = lista.find((x) => x.titulo === nombre);
    if (!v) throw new Error(`${alias} no tiene la alerta «${nombre}»`);
    return v;
  };
  return { lista, por, alertas };
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

  it('tiene las alertas propias de una autocaravana', async () => {
    const { alertas } = await vencimientosDe('La Autocaravana');
    const nombres = alertas.map((a) => a.nombre);

    expect(nombres).toContain('Sellado del techo');
    expect(nombres).toContain('Instalación de gas');
    expect(alertas.find((a) => a.nombre === 'Sellado del techo')?.cadaMeses).toBe(12);
  });

  it('tiene el sellado del techo caducado', async () => {
    const { por, alertas } = await vencimientosDe('La Autocaravana');
    const sellado = alertas.find((a) => a.nombre === 'Sellado del techo')!;

    // Es anual y el último fue hace más de doce meses: sale en rojo en el
    // panel. Es el aviso que más caro sale ignorar.
    expect(mesesEntre(sellado.ultimaFecha!, hoyISO())).toBeGreaterThan(12);
    expect(por('Sellado del techo').semaforo).toBe('vencido');
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

  it('tiene alertas con recurrencia doble', async () => {
    const { alertas } = await vencimientosDe('El Golf');
    const aceite = alertas.find((a) => a.nombre === 'Cambio de aceite');
    expect(aceite?.cadaKm).toBe(15000);
    expect(aceite?.cadaMeses).toBe(12);
    // Toda alerta debe poder vencer por algo.
    expect(
      alertas.every((a) => a.cadaKm !== undefined || a.cadaMeses !== undefined || a.venceEl),
    ).toBe(true);
  });

  it('deja el panel con un vencimiento en rojo, uno en ámbar y uno en verde', async () => {
    const { por } = await vencimientosDe('El Golf');
    expect(por('ITV').semaforo).toBe('vencido');
    expect(por('Seguro').semaforo).toBe('proximo');
    expect(por('Impuesto de circulación').semaforo).toBe('ok');
  });

  it('enseña una alerta a la que le falta la última vez', async () => {
    // La correa no se ha cambiado nunca: el caso que pide el dato en vez de
    // inventarse un retraso de años.
    const { por } = await vencimientosDe('El Golf');
    expect(por('Correa de distribución').faltaUltimaVez).toBe(true);
  });

  it('un solo servicio reinicia dos alertas a la vez', async () => {
    // La revisión anual del taller incluye los filtros: el caso de «el
    // mantenimiento anual ya es un cambio de aceite y filtros».
    const { alertas } = await vencimientosDe('El Golf');
    const golf = await porAlias('El Golf');
    const servicios = await repo.mantenimientos.listarPorVehiculo(golf.id);
    const revision = servicios.find((m) => m.titulo === 'Revisión anual')!;
    const revisionAlerta = alertas.find((a) => a.nombre === 'Revisión / servicio')!;
    const filtros = alertas.find((a) => a.nombre === 'Filtros')!;

    expect(revision.alertaIds.sort()).toEqual([revisionAlerta.id, filtros.id].sort());
    expect(revisionAlerta.ultimaFecha).toBe(revision.fecha);
    expect(filtros.ultimaFecha).toBe(revision.fecha);
  });
});

describe('La Zoe — caso eléctrico', () => {
  it('carga en kWh, no en litros', async () => {
    const zoe = await porAlias('La Zoe');
    const cargas = await repo.repostajes.listarPorVehiculo(zoe.id);
    expect(cargas.length).toBeGreaterThan(0);
    expect(cargas.every((c) => c.unidad === 'kWh')).toBe(true);
  });

  it('no tiene alertas de aceite ni de distribución', async () => {
    const { alertas } = await vencimientosDe('La Zoe');
    const nombres = alertas.map((a) => a.nombre);
    expect(nombres).not.toContain('Cambio de aceite');
    expect(nombres).not.toContain('Correa de distribución');
    expect(nombres).toContain('Neumáticos');
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

describe('coherencia física de los repostajes', () => {
  it('el consumo calculado se parece al que se sembró', async () => {
    /*
     * Esto vigila las dos mitades a la vez: que la semilla genere datos
     * posibles y que el motor de consumo los lea bien. Si un repostaje parcial
     * no arrastrase su deuda al siguiente, la serie describiría un coche que
     * recorre kilómetros con combustible que nunca entró en el depósito, y el
     * consumo saldría muy por debajo del real.
     */
    const esperado: Record<string, { unidad: 'l' | 'kWh'; base: number }> = {
      'El Golf': { unidad: 'l', base: 5.6 },
      'La Zoe': { unidad: 'kWh', base: 17.4 },
      'La Autocaravana': { unidad: 'l', base: 10.6 },
      'El Ibiza': { unidad: 'l', base: 7.2 },
    };

    for (const [alias, { unidad, base }] of Object.entries(esperado)) {
      const v = await porAlias(alias);
      const repostajes = await repo.repostajes.listarPorVehiculo(v.id);
      const resumen = resumirConsumo(repostajes, unidad);

      expect(resumen.consumoMedio).not.toBeNull();
      // Un 12 % de margen: la semilla mete ruido y el Golf además deriva.
      expect(resumen.consumoMedio!).toBeGreaterThan(base * 0.88);
      expect(resumen.consumoMedio!).toBeLessThan(base * 1.12);
    }
  });

  it('la deriva del Golf se ve en los tramos recientes', async () => {
    // La semilla le mete un +11 % al final: es lo que la fase 6 tendrá que
    // detectar como anomalía, y si no se nota aquí, no habrá nada que detectar.
    const golf = await porAlias('El Golf');
    const repostajes = await repo.repostajes.listarPorVehiculo(golf.id);
    const resumen = resumirConsumo(repostajes, 'l');

    expect(resumen.consumoReciente!).toBeGreaterThan(resumen.consumoMedio!);
  });

  it('los tramos con un repostaje parcial no dan cifras imposibles', async () => {
    const golf = await porAlias('El Golf');
    const repostajes = await repo.repostajes.listarPorVehiculo(golf.id);
    const { tramos } = resumirConsumo(repostajes, 'l');

    for (const tramo of tramos) {
      // Ningún diésel de 150 CV baja de 3 l/100 km ni pasa de 12.
      expect(tramo.consumo).toBeGreaterThan(3);
      expect(tramo.consumo).toBeLessThan(12);
    }
  });
});
