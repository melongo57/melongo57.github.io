import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Alerta, Vehiculo } from '@/dominio/tipos.ts';
import {
  crearAlerta,
  crearVehiculo,
  guardarAlerta,
  guardarMantenimiento,
  marcarHecha,
} from './acciones.ts';
import { db } from './db.ts';
import { repo } from './repositorioDexie.ts';

/*
 * Las acciones escriben en el repositorio global, como en la app de verdad.
 * Cada test limpia las tablas para no arrastrar estado.
 */
async function limpiar(): Promise<void> {
  await db.transaction('rw', db.tables, async () => {
    await Promise.all(db.tables.map((t) => t.clear()));
  });
}

beforeEach(limpiar);
afterEach(limpiar);

function nuevoVehiculo(): Promise<Vehiculo> {
  return crearVehiculo({
    alias: 'El Audi',
    categoria: 'turismo',
    marca: 'Audi',
    modelo: 'A4',
    matricula: '0000 AAA',
    anio: 2020,
    combustible: 'diesel',
    estado: 'activo',
    orden: 0,
    alertas: [],
  });
}

function alerta(vehiculoId: string, cambios: Partial<Alerta> = {}): Promise<Alerta> {
  return crearAlerta({
    vehiculoId,
    nombre: 'Servicio anual Audi',
    icono: '🔧',
    cadaKm: 15000,
    cadaMeses: 12,
    apunte: 'mantenimiento',
    ...cambios,
  });
}

describe('alertas al dar de alta un vehículo', () => {
  it('sin elegir nada, crea solo las básicas', async () => {
    const v = await crearVehiculo({
      alias: 'Coche',
      categoria: 'turismo',
      marca: 'M',
      modelo: 'M',
      matricula: '1111 BBB',
      anio: 2020,
      combustible: 'diesel',
      estado: 'activo',
      orden: 0,
    });
    const nombres = (await repo.alertas.listarPorVehiculo(v.id)).map((a) => a.nombre).sort();
    expect(nombres).toEqual(['ITV', 'Revisión / servicio', 'Seguro']);
  });

  it('crea exactamente las elegidas, ni una más', async () => {
    const v = await crearVehiculo({
      alias: 'Coche',
      categoria: 'turismo',
      marca: 'M',
      modelo: 'M',
      matricula: '1111 BBB',
      anio: 2020,
      combustible: 'diesel',
      estado: 'activo',
      orden: 0,
      alertas: ['itv', 'aceite'],
    });
    const nombres = (await repo.alertas.listarPorVehiculo(v.id)).map((a) => a.nombre).sort();
    expect(nombres).toEqual(['Cambio de aceite', 'ITV']);
  });

  it('una alerta borrada no vuelve sola', async () => {
    // Era la queja: las alertas de serie se regeneraban al abrir el editor.
    const v = await crearVehiculo({
      alias: 'Coche',
      categoria: 'turismo',
      marca: 'M',
      modelo: 'M',
      matricula: '1111 BBB',
      anio: 2020,
      combustible: 'diesel',
      estado: 'activo',
      orden: 0,
      alertas: ['filtros'],
    });
    const [filtros] = await repo.alertas.listarPorVehiculo(v.id);
    await repo.alertas.borrar(filtros!.id);
    expect(await repo.alertas.listarPorVehiculo(v.id)).toHaveLength(0);
  });
});

describe('marcarHecha', () => {
  it('reinicia la alerta y deja el servicio en el histórico', async () => {
    const v = await nuevoVehiculo();
    const a = await alerta(v.id, { venceEl: '2026-09-01' });

    await marcarHecha(a, { fecha: '2026-08-20', km: 60000, costeCentimos: 32000 });

    const reiniciada = await repo.alertas.obtener(a.id);
    expect(reiniciada?.ultimaFecha).toBe('2026-08-20');
    expect(reiniciada?.ultimoKm).toBe(60000);
    // La fecha fija era la del ciclo que se acaba de cerrar.
    expect(reiniciada?.venceEl).toBeUndefined();

    const [servicio] = await repo.mantenimientos.listarPorVehiculo(v.id);
    expect(servicio?.titulo).toBe('Servicio anual Audi');
    expect(servicio?.alertaIds).toEqual([a.id]);
    expect(servicio?.costeCentimos).toBe(32000);
  });

  it('un papel con coste va a gastos con su categoría, no a mantenimientos', async () => {
    const v = await nuevoVehiculo();
    const seguro = await alerta(v.id, {
      nombre: 'Seguro',
      apunte: 'seguro',
      cadaKm: undefined,
      cadaMeses: 12,
    });

    await marcarHecha(seguro, { fecha: '2026-08-20', costeCentimos: 48620 });

    expect(await repo.mantenimientos.listarPorVehiculo(v.id)).toHaveLength(0);
    const [gasto] = await repo.gastos.listarPorVehiculo(v.id);
    expect(gasto?.categoria).toBe('seguro');
    expect(gasto?.importeCentimos).toBe(48620);
    expect((await repo.alertas.obtener(seguro.id))?.ultimaFecha).toBe('2026-08-20');
  });

  it('un papel sin coste no deja un gasto de 0 €', async () => {
    const v = await nuevoVehiculo();
    const itv = await alerta(v.id, { nombre: 'ITV', apunte: 'itv', cadaKm: undefined });
    await marcarHecha(itv, { fecha: '2026-08-20', costeCentimos: 0 });
    expect(await repo.gastos.listarPorVehiculo(v.id)).toHaveLength(0);
  });
});

describe('guardarMantenimiento', () => {
  it('un servicio reinicia todas las alertas que cubre', async () => {
    // «El mantenimiento anual de Audi ya es un cambio de aceite y filtros».
    const v = await nuevoVehiculo();
    const aceite = await alerta(v.id, { nombre: 'Cambio de aceite' });
    const filtros = await alerta(v.id, { nombre: 'Filtros', cadaKm: 30000 });

    await guardarMantenimiento({
      vehiculoId: v.id,
      titulo: 'Servicio anual',
      alertaIds: [aceite.id, filtros.id],
      fecha: '2026-08-20',
      km: 60000,
      costeCentimos: 30000,
      adjuntoIds: [],
    });

    expect((await repo.alertas.obtener(aceite.id))?.ultimaFecha).toBe('2026-08-20');
    expect((await repo.alertas.obtener(filtros.id))?.ultimaFecha).toBe('2026-08-20');
  });

  it('una factura vieja no pisa una última vez más reciente', async () => {
    const v = await nuevoVehiculo();
    const a = await alerta(v.id, { ultimaFecha: '2026-08-01', ultimoKm: 59000 });

    await guardarMantenimiento({
      vehiculoId: v.id,
      titulo: 'Servicio de 2023',
      alertaIds: [a.id],
      fecha: '2023-05-10',
      km: 20000,
      costeCentimos: 25000,
      adjuntoIds: [],
    });

    const intacta = await repo.alertas.obtener(a.id);
    expect(intacta?.ultimaFecha).toBe('2026-08-01');
    expect(intacta?.ultimoKm).toBe(59000);
  });
});

describe('guardarAlerta', () => {
  it('vaciar un campo lo borra, no deja el valor anterior', async () => {
    const v = await nuevoVehiculo();
    const a = await alerta(v.id, { venceEl: '2026-09-01' });
    await guardarAlerta(a.id, { venceEl: undefined, cadaKm: undefined });
    const cambiada = await repo.alertas.obtener(a.id);
    expect(cambiada?.venceEl).toBeUndefined();
    expect(cambiada?.cadaKm).toBeUndefined();
    expect(cambiada?.cadaMeses).toBe(12);
  });
});
