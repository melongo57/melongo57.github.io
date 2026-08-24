import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/datos/db.ts';
import { repo } from '@/datos/repositorioDexie.ts';
import { claveMes, hoyISO } from '@/dominio/fechas.ts';
import { estimarKm, kmAnuales, type EstimacionKm } from '@/dominio/odometro.ts';
import {
  calcularVencimientos,
  resumirVencimientos,
  type ResumenVencimientos,
  type Vencimiento,
} from '@/dominio/vencimientos.ts';
import type {
  Centimos,
  Documento,
  Id,
  Mantenimiento,
  PuntoOdometro,
  ReglaMantenimiento,
  Vehiculo,
} from '@/dominio/tipos.ts';

/** Todo lo que el motor de vencimientos necesita leer de un vehículo. */
async function cargarParaVencimientos(vehiculo: Vehiculo) {
  const [puntos, reglas, mantenimientos, documentos, ajustes] = await Promise.all([
    repo.puntosOdometro(vehiculo.id),
    repo.reglas.listarPorVehiculo(vehiculo.id),
    repo.mantenimientos.listarPorVehiculo(vehiculo.id),
    repo.documentos.listarPorVehiculo(vehiculo.id),
    repo.ajustes.obtener(),
  ]);

  const estimacion = estimarKm(puntos, vehiculo);
  return {
    puntos,
    estimacion,
    vencimientos: calcularVencimientos({
      vehiculo,
      reglas,
      mantenimientos,
      documentos,
      estimacion,
      ajustes,
    }),
  };
}

/**
 * Consultas reactivas.
 *
 * `useLiveQuery` vuelve a ejecutar la consulta cuando cambia alguna de las
 * tablas implicadas, así que no hace falta ni estado global ni invalidaciones
 * manuales: se escribe en la base y la interfaz se entera sola. Esa es la
 * razón de que en este proyecto no haya Redux ni nada parecido.
 *
 * Todos devuelven `undefined` mientras cargan, que es distinto de «no hay
 * nada»: la interfaz debe distinguir el esqueleto de carga del estado vacío.
 */

export function useVehiculos(opciones: { incluirVendidos?: boolean } = {}): Vehiculo[] | undefined {
  const { incluirVendidos = true } = opciones;
  return useLiveQuery(async () => {
    const todos = await db.vehiculos.orderBy('orden').toArray();
    return incluirVendidos ? todos : todos.filter((v) => v.estado === 'activo');
  }, [incluirVendidos]);
}

export function useVehiculo(id: Id | undefined): Vehiculo | undefined | null {
  return useLiveQuery(async () => {
    if (!id) return null;
    return (await db.vehiculos.get(id)) ?? null;
  }, [id]);
}

export function usePuntosOdometro(vehiculoId: Id | undefined): PuntoOdometro[] | undefined {
  return useLiveQuery(async () => {
    if (!vehiculoId) return [];
    return repo.puntosOdometro(vehiculoId);
  }, [vehiculoId]);
}

export function useAjustes() {
  return useLiveQuery(() => repo.ajustes.obtener(), []);
}

// ---------------------------------------------------------------------------
// Panel principal
// ---------------------------------------------------------------------------

export interface ResumenPanel {
  vehiculo: Vehiculo;
  estimacion: EstimacionKm;
  kmAlAnio: number;
  /** Repostajes + mantenimientos + gastos del mes en curso. */
  gastoDelMesCentimos: Centimos;
  registrosDelMes: number;
  vencimientos: ResumenVencimientos;
}

async function resumenDe(vehiculo: Vehiculo, mes: string): Promise<ResumenPanel> {
  const [{ puntos, estimacion, vencimientos }, repostajes, mantenimientos, gastos] =
    await Promise.all([
      cargarParaVencimientos(vehiculo),
      db.repostajes.where('vehiculoId').equals(vehiculo.id).toArray(),
      db.mantenimientos.where('vehiculoId').equals(vehiculo.id).toArray(),
      db.gastos.where('vehiculoId').equals(vehiculo.id).toArray(),
    ]);

  const delMes = <T extends { fecha: string }>(lista: T[]): T[] =>
    lista.filter((r) => claveMes(r.fecha) === mes);

  const repostajesMes = delMes(repostajes);
  const mantenimientosMes = delMes(mantenimientos);
  const gastosMes = delMes(gastos);

  return {
    vehiculo,
    estimacion,
    kmAlAnio: kmAnuales(puntos),
    vencimientos: resumirVencimientos(vencimientos),
    gastoDelMesCentimos:
      repostajesMes.reduce((t, r) => t + r.importeCentimos, 0) +
      mantenimientosMes.reduce((t, m) => t + m.costeCentimos, 0) +
      gastosMes.reduce((t, g) => t + g.importeCentimos, 0),
    registrosDelMes: repostajesMes.length + mantenimientosMes.length + gastosMes.length,
  };
}

export function useResumenPanel(): ResumenPanel[] | undefined {
  return useLiveQuery(async () => {
    const mes = claveMes(hoyISO());
    const vehiculos = await db.vehiculos.orderBy('orden').toArray();
    // Los vendidos no salen en el panel: no tienen nada pendiente y solo
    // restarían sitio a los que sí.
    const activos = vehiculos.filter((v) => v.estado === 'activo');
    return Promise.all(activos.map((v) => resumenDe(v, mes)));
  }, []);
}

// ---------------------------------------------------------------------------
// Ficha de vehículo
// ---------------------------------------------------------------------------

export interface DetalleVehiculo {
  vehiculo: Vehiculo;
  puntos: PuntoOdometro[];
  estimacion: EstimacionKm;
  kmAlAnio: number;
  vencimientos: Vencimiento[];
  totales: {
    repostajes: number;
    mantenimientos: number;
    gastos: number;
    documentos: number;
    gastadoCentimos: Centimos;
  };
}

export function useDetalleVehiculo(id: Id | undefined): DetalleVehiculo | undefined | null {
  return useLiveQuery(async () => {
    if (!id) return null;
    const vehiculo = await db.vehiculos.get(id);
    if (!vehiculo) return null;

    const [{ puntos, estimacion, vencimientos }, repostajes, mantenimientos, gastos, documentos] =
      await Promise.all([
        cargarParaVencimientos(vehiculo),
        db.repostajes.where('vehiculoId').equals(id).toArray(),
        db.mantenimientos.where('vehiculoId').equals(id).toArray(),
        db.gastos.where('vehiculoId').equals(id).toArray(),
        db.documentos.where('vehiculoId').equals(id).count(),
      ]);

    return {
      vehiculo,
      puntos,
      estimacion,
      kmAlAnio: kmAnuales(puntos),
      vencimientos,
      totales: {
        repostajes: repostajes.length,
        mantenimientos: mantenimientos.length,
        gastos: gastos.length,
        documentos,
        gastadoCentimos:
          repostajes.reduce((t, r) => t + r.importeCentimos, 0) +
          mantenimientos.reduce((t, m) => t + m.costeCentimos, 0) +
          gastos.reduce((t, g) => t + g.importeCentimos, 0),
      },
    };
  }, [id]);
}

/** Lecturas manuales del vehículo, de la más reciente a la más antigua. */
export function useLecturas(vehiculoId: Id | undefined) {
  return useLiveQuery(async () => {
    if (!vehiculoId) return [];
    const lecturas = await repo.lecturas.listarPorVehiculo(vehiculoId);
    return lecturas.reverse();
  }, [vehiculoId]);
}

// ---------------------------------------------------------------------------
// Mantenimientos y reglas
// ---------------------------------------------------------------------------

/** Mantenimientos del vehículo, del más reciente al más antiguo. */
export function useMantenimientos(vehiculoId: Id | undefined): Mantenimiento[] | undefined {
  return useLiveQuery(async () => {
    if (!vehiculoId) return [];
    const lista = await repo.mantenimientos.listarPorVehiculo(vehiculoId);
    return lista.reverse();
  }, [vehiculoId]);
}

export function useReglas(vehiculoId: Id | undefined): ReglaMantenimiento[] | undefined {
  return useLiveQuery(async () => {
    if (!vehiculoId) return [];
    return repo.reglas.listarPorVehiculo(vehiculoId);
  }, [vehiculoId]);
}

export function useDocumentos(vehiculoId: Id | undefined): Documento[] | undefined {
  return useLiveQuery(async () => {
    if (!vehiculoId) return [];
    return repo.documentos.listarPorVehiculo(vehiculoId);
  }, [vehiculoId]);
}
