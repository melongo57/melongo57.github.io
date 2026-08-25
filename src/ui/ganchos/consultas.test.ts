import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { db } from '@/datos/db.ts';
import { repo } from '@/datos/repositorioDexie.ts';
import type { Vehiculo } from '@/dominio/tipos.ts';
import { useResumenPanel, useVehiculos } from './consultas.ts';

/*
 * Estos gatos leen `db` directamente en vez de pasar por el repositorio,
 * porque necesitan cosas que la interfaz de `Coleccion` no ofrece: ordenar
 * por `orden`, combinar varias tablas en un único `Promise.all`, etc. Eso es
 * legítimo, pero cada uno de esos accesos directos tiene que aplicar el mismo
 * filtro de borrados que aplica el repositorio — si uno se olvida, un
 * vehículo borrado reaparece en el panel. Es justo el fallo que se vio en
 * producción: el servidor tenía todo marcado como borrado, la sincronización
 * bajó las marcas correctamente, pero el panel las seguía enseñando porque
 * `useResumenPanel` y `useVehiculos` no filtraban.
 *
 * Se usa el `db`/`repo` globales (no una base aislada por test, a diferencia
 * de `repositorio.test.ts`) porque `consultas.ts` los importa como
 * singleton y no acepta uno inyectado. Cada test limpia las tablas para no
 * arrastrar estado de un test a otro.
 */

async function limpiar(): Promise<void> {
  await db.transaction('rw', db.tables, async () => {
    await Promise.all(db.tables.map((t) => t.clear()));
  });
}

beforeEach(limpiar);
afterEach(limpiar);

async function crearVehiculo(alias: string): Promise<Vehiculo> {
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

describe('useVehiculos', () => {
  it('no enseña un vehículo borrado', async () => {
    const vehiculo = await crearVehiculo('Coche');

    const { result } = renderHook(() => useVehiculos());
    await waitFor(() => expect(result.current).toHaveLength(1));

    await repo.eliminarVehiculo(vehiculo.id);

    await waitFor(() => expect(result.current).toHaveLength(0));
  });
});

describe('useResumenPanel', () => {
  it('deja de enseñar un vehículo en cuanto se borra', async () => {
    /*
     * Este es el hueco real: el panel es la primera pantalla que se ve al
     * abrir la app, y era precisamente el que no filtraba.
     */
    const vehiculo = await crearVehiculo('Coche');

    const { result } = renderHook(() => useResumenPanel());
    await waitFor(() => expect(result.current).toHaveLength(1));
    expect(result.current?.[0]?.vehiculo.id).toBe(vehiculo.id);

    await repo.eliminarVehiculo(vehiculo.id);

    await waitFor(() => expect(result.current).toHaveLength(0));
  });

  it('tampoco lo enseña si el borrado llega de una sincronización', async () => {
    // Simula lo que hace `sincronizarTodo`: guarda el registro con la marca ya
    // puesta, sin pasar por `eliminarVehiculo`.
    const vehiculo = await crearVehiculo('Coche');
    const ahora = new Date().toISOString();
    await db.vehiculos.put({ ...vehiculo, borradoEn: ahora, actualizadoEn: ahora });

    const { result } = renderHook(() => useResumenPanel());

    await waitFor(() => expect(result.current).toHaveLength(0));
  });
});
