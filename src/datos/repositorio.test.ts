import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { nuevoId } from '@/dominio/ids.ts';
import type { Vehiculo } from '@/dominio/tipos.ts';
import { BaseDatosGaraje } from './db.ts';
import type { Repositorio } from './repositorio.ts';
import { crearRepositorioDexie } from './repositorioDexie.ts';

let base: BaseDatosGaraje;
let repo: Repositorio;

beforeEach(async () => {
  // Base nueva por test: los tests no pueden verse entre ellos.
  base = new BaseDatosGaraje(`prueba-${nuevoId()}`);
  await base.open();
  repo = crearRepositorioDexie(base);
});

afterEach(async () => {
  await base.delete();
});

async function crearVehiculo(alias = 'Coche'): Promise<Vehiculo> {
  return repo.vehiculos.crear({
    alias,
    categoria: 'turismo',
    marca: 'Marca',
    modelo: 'Modelo',
    matricula: '0000 AAA',
    anio: 2020,
    combustible: 'gasolina',
    estado: 'activo',
    orden: 0,
  });
}

describe('metadatos de los registros', () => {
  it('sella id y fechas al crear', async () => {
    const v = await crearVehiculo();
    expect(v.id).toMatch(/^[0-9a-f]{8}-/);
    expect(v.creadoEn).toBe(v.actualizadoEn);
    expect(v.borradoEn).toBeNull();
    // Reservado para multiusuario: existe desde el primer día.
    expect(v.propietarioId).toBeNull();
  });

  it('respeta un id proporcionado (importación de un JSON)', async () => {
    const v = await repo.vehiculos.crear({
      id: 'id-externo',
      alias: 'Importado',
      categoria: 'turismo',
      marca: 'M',
      modelo: 'M',
      matricula: '1111 BBB',
      anio: 2021,
      combustible: 'diesel',
      estado: 'activo',
      orden: 0,
    });
    expect(v.id).toBe('id-externo');
  });

  it('mueve actualizadoEn al modificar, sin tocar creadoEn', async () => {
    const v = await crearVehiculo();
    await new Promise((r) => setTimeout(r, 2));
    const modificado = await repo.vehiculos.actualizar(v.id, { alias: 'Otro nombre' });

    expect(modificado.alias).toBe('Otro nombre');
    expect(modificado.creadoEn).toBe(v.creadoEn);
    expect(modificado.actualizadoEn > v.actualizadoEn).toBe(true);
  });

  it('falla al actualizar un registro que no existe', async () => {
    await expect(repo.vehiculos.actualizar('fantasma', { alias: 'X' })).rejects.toThrow();
  });
});

describe('listarPorVehiculo', () => {
  it('devuelve los registros ordenados por fecha', async () => {
    const v = await crearVehiculo();
    // Se insertan desordenados a propósito.
    for (const fecha of ['2026-05-01', '2026-01-15', '2026-03-20']) {
      await repo.lecturas.crear({ vehiculoId: v.id, fecha, km: 1000, origen: 'manual' });
    }

    const lecturas = await repo.lecturas.listarPorVehiculo(v.id);
    expect(lecturas.map((l) => l.fecha)).toEqual(['2026-01-15', '2026-03-20', '2026-05-01']);
  });

  it('no mezcla registros de otros vehículos', async () => {
    const a = await crearVehiculo('A');
    const b = await crearVehiculo('B');
    await repo.lecturas.crear({ vehiculoId: a.id, fecha: '2026-01-01', km: 10, origen: 'manual' });
    await repo.lecturas.crear({ vehiculoId: b.id, fecha: '2026-01-01', km: 20, origen: 'manual' });

    expect(await repo.lecturas.listarPorVehiculo(a.id)).toHaveLength(1);
    expect((await repo.lecturas.listarPorVehiculo(a.id))[0]?.km).toBe(10);
  });
});

describe('puntosOdometro', () => {
  it('unifica lecturas manuales con los km de repostajes y mantenimientos', async () => {
    const v = await crearVehiculo();

    await repo.lecturas.crear({
      vehiculoId: v.id,
      fecha: '2026-01-01',
      km: 10000,
      origen: 'alta_vehiculo',
    });
    await repo.repostajes.crear({
      vehiculoId: v.id,
      fecha: '2026-02-01',
      cantidad: 40,
      unidad: 'l',
      importeCentimos: 6000,
      km: 10700,
      depositoLleno: true,
      rupturaSerie: false,
      adjuntoIds: [],
    });
    await repo.mantenimientos.crear({
      vehiculoId: v.id,
      tipo: 'aceite',
      fecha: '2026-03-01',
      km: 11500,
      costeCentimos: 9000,
      piezas: [],
      adjuntoIds: [],
    });
    await repo.gastos.crear({
      vehiculoId: v.id,
      categoria: 'peajes',
      fecha: '2026-04-01',
      importeCentimos: 1200,
      km: 12200,
      recurrente: false,
      adjuntoIds: [],
    });

    const puntos = await repo.puntosOdometro(v.id);
    expect(puntos.map((p) => p.km)).toEqual([10000, 10700, 11500, 12200]);
    expect(puntos.map((p) => p.origen)).toEqual([
      'alta_vehiculo',
      'repostaje',
      'mantenimiento',
      'gasto',
    ]);
  });

  it('descarta los registros sin kilómetros anotados', async () => {
    const v = await crearVehiculo();
    await repo.repostajes.crear({
      vehiculoId: v.id,
      fecha: '2026-02-01',
      cantidad: 40,
      unidad: 'l',
      importeCentimos: 6000,
      depositoLleno: true,
      rupturaSerie: false,
      adjuntoIds: [],
    });

    expect(await repo.puntosOdometro(v.id)).toEqual([]);
  });

  it('ordena por fecha y, a igualdad de fecha, por kilómetros', async () => {
    const v = await crearVehiculo();
    await repo.lecturas.crear({ vehiculoId: v.id, fecha: '2026-02-01', km: 500, origen: 'manual' });
    await repo.lecturas.crear({ vehiculoId: v.id, fecha: '2026-01-01', km: 900, origen: 'manual' });
    await repo.lecturas.crear({ vehiculoId: v.id, fecha: '2026-02-01', km: 300, origen: 'manual' });

    const puntos = await repo.puntosOdometro(v.id);
    // Nótese que la lectura del 01/01 tiene MÁS km que las de febrero: el
    // repositorio no juzga, solo ordena. Detectar la incoherencia es trabajo
    // del validador (fase 2).
    expect(puntos.map((p) => [p.fecha, p.km])).toEqual([
      ['2026-01-01', 900],
      ['2026-02-01', 300],
      ['2026-02-01', 500],
    ]);
  });
});

describe('eliminarVehiculo', () => {
  it('borra en cascada todo lo que cuelga del vehículo', async () => {
    const v = await crearVehiculo();
    const otro = await crearVehiculo('Intacto');

    await repo.lecturas.crear({ vehiculoId: v.id, fecha: '2026-01-01', km: 1, origen: 'manual' });
    await repo.reglas.crear({ vehiculoId: v.id, tipo: 'aceite', cadaKm: 15000, activa: true });
    await repo.gastos.crear({
      vehiculoId: v.id,
      categoria: 'seguro',
      fecha: '2026-01-01',
      importeCentimos: 100,
      recurrente: false,
      adjuntoIds: [],
    });
    await repo.lecturas.crear({
      vehiculoId: otro.id,
      fecha: '2026-01-01',
      km: 1,
      origen: 'manual',
    });

    await repo.eliminarVehiculo(v.id);

    expect(await repo.vehiculos.obtener(v.id)).toBeUndefined();
    expect(await repo.lecturas.listarPorVehiculo(v.id)).toHaveLength(0);
    expect(await repo.reglas.listarPorVehiculo(v.id)).toHaveLength(0);
    expect(await repo.gastos.listarPorVehiculo(v.id)).toHaveLength(0);
    // El otro vehículo no se toca.
    expect(await repo.lecturas.listarPorVehiculo(otro.id)).toHaveLength(1);
  });

  it('se lleva los adjuntos huérfanos, que ocupan la cuota del navegador', async () => {
    const v = await crearVehiculo();
    const factura = await repo.adjuntos.crear({
      nombre: 'factura.jpg',
      mime: 'image/jpeg',
      bytes: 3,
      datos: new Blob(['abc']),
    });
    const foto = await repo.adjuntos.crear({
      nombre: 'coche.jpg',
      mime: 'image/jpeg',
      bytes: 3,
      datos: new Blob(['xyz']),
    });
    const ajeno = await repo.adjuntos.crear({
      nombre: 'ajeno.jpg',
      mime: 'image/jpeg',
      bytes: 3,
      datos: new Blob(['zzz']),
    });

    await repo.vehiculos.actualizar(v.id, { fotoAdjuntoId: foto.id });
    await repo.mantenimientos.crear({
      vehiculoId: v.id,
      tipo: 'frenos',
      fecha: '2026-01-01',
      costeCentimos: 20000,
      piezas: [],
      adjuntoIds: [factura.id],
    });

    await repo.eliminarVehiculo(v.id);

    expect(await repo.adjuntos.obtener(factura.id)).toBeUndefined();
    expect(await repo.adjuntos.obtener(foto.id)).toBeUndefined();
    expect(await repo.adjuntos.obtener(ajeno.id)).toBeDefined();
  });
});

describe('ajustes', () => {
  it('crea los ajustes por defecto la primera vez', async () => {
    const ajustes = await repo.ajustes.obtener();
    expect(ajustes.tema).toBe('sistema');
    expect(ajustes.antelacionDocumentoDias.itv).toBe(30);
    expect(ajustes.antelacionMantenimiento.aceite.avisoKm).toBe(1000);
  });

  it('guarda cambios parciales sin perder el resto', async () => {
    await repo.ajustes.guardar({ tema: 'oscuro' });
    const ajustes = await repo.ajustes.guardar({ notificacionesActivadas: true });

    expect(ajustes.tema).toBe('oscuro');
    expect(ajustes.notificacionesActivadas).toBe(true);
    expect(await repo.ajustes.obtener()).toMatchObject({ tema: 'oscuro' });
  });
});

describe('vaciar', () => {
  it('deja la base limpia para una importación completa', async () => {
    const v = await crearVehiculo();
    await repo.lecturas.crear({ vehiculoId: v.id, fecha: '2026-01-01', km: 1, origen: 'manual' });

    await repo.vaciar();

    expect(await repo.vehiculos.contar()).toBe(0);
    expect(await repo.lecturas.contar()).toBe(0);
  });
});
