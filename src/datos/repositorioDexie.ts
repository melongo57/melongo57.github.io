import type { Table } from 'dexie';
import { ahoraISO } from '@/dominio/fechas.ts';
import { nuevoId } from '@/dominio/ids.ts';
import { ID_AJUSTES } from '@/dominio/tipos.ts';
import type {
  Adjunto,
  Ajustes,
  Cambios,
  Documento,
  EntidadBase,
  Gasto,
  Id,
  LecturaOdometro,
  Mantenimiento,
  Nuevo,
  OrigenLectura,
  PuntoOdometro,
  Repostaje,
  ReglaMantenimiento,
  Vehiculo,
} from '@/dominio/tipos.ts';
import { ajustesPorDefecto } from './ajustesPorDefecto.ts';
import { BaseDatosGaraje, db as dbGlobal } from './db.ts';
import type {
  Coleccion,
  ColeccionAjustes,
  ColeccionDeVehiculo,
  Repositorio,
} from './repositorio.ts';

/** Registro con `vehiculoId`. */
interface ConVehiculo extends EntidadBase {
  vehiculoId: Id;
}

/** Registro con `vehiculoId` y `fecha`, que se ordena cronológicamente. */
interface ConFecha extends ConVehiculo {
  fecha: string;
}

function sellarNuevo<T extends EntidadBase>(datos: Nuevo<T>): T {
  const ahora = ahoraISO();
  return {
    ...datos,
    id: (datos as { id?: Id }).id ?? nuevoId(),
    creadoEn: ahora,
    actualizadoEn: ahora,
    borradoEn: null,
    propietarioId: null,
  } as unknown as T;
}

function crearColeccion<T extends EntidadBase>(tabla: () => Table<T, Id>): Coleccion<T> {
  return {
    async obtener(id) {
      return tabla().get(id);
    },
    async listar() {
      return tabla().toArray();
    },
    async crear(datos) {
      const registro = sellarNuevo<T>(datos);
      await tabla().add(registro);
      return registro;
    },
    async actualizar(id, cambios) {
      const parche = { ...(cambios as object), actualizadoEn: ahoraISO() };
      const afectados = await tabla().update(id, parche as never);
      if (afectados === 0) {
        throw new Error(`No existe el registro ${id}`);
      }
      const actualizado = await tabla().get(id);
      if (!actualizado) throw new Error(`No existe el registro ${id}`);
      return actualizado;
    },
    async borrar(id) {
      await tabla().delete(id);
    },
    async contar() {
      return tabla().count();
    },
  };
}

function crearColeccionDeVehiculo<T extends ConVehiculo>(
  tabla: () => Table<T, Id>,
  opciones: { ordenarPorFecha: boolean },
): ColeccionDeVehiculo<T> {
  const base = crearColeccion<T>(tabla);
  return {
    ...base,
    async listarPorVehiculo(vehiculoId) {
      if (!opciones.ordenarPorFecha) {
        return tabla().where('vehiculoId').equals(vehiculoId).toArray();
      }
      // El índice compuesto ya devuelve el resultado ordenado por fecha, así
      // que no hace falta ordenar en memoria.
      return tabla()
        .where('[vehiculoId+fecha]')
        .between([vehiculoId, ''], [vehiculoId, '￿'])
        .toArray();
    },
  };
}

function crearColeccionAjustes(tabla: () => Table<Ajustes, Id>): ColeccionAjustes {
  return {
    async obtener() {
      const guardados = await tabla().get(ID_AJUSTES);
      if (guardados) return guardados;
      const iniciales = ajustesPorDefecto();
      await tabla().put(iniciales);
      return iniciales;
    },
    async guardar(cambios: Cambios<Ajustes>) {
      const actuales = await this.obtener();
      const siguiente: Ajustes = {
        ...actuales,
        ...(cambios as Partial<Ajustes>),
        id: ID_AJUSTES,
        actualizadoEn: ahoraISO(),
      };
      await tabla().put(siguiente);
      return siguiente;
    },
  };
}

/** Recoge los ids de adjunto de un conjunto de registros. */
function idsDeAdjuntos(registros: readonly { adjuntoIds?: Id[] }[]): Id[] {
  return registros.flatMap((r) => r.adjuntoIds ?? []);
}

export function crearRepositorioDexie(base: BaseDatosGaraje = dbGlobal): Repositorio {
  const conFecha = <T extends ConFecha>(tabla: () => Table<T, Id>): ColeccionDeVehiculo<T> =>
    crearColeccionDeVehiculo(tabla, { ordenarPorFecha: true });

  return {
    vehiculos: crearColeccion<Vehiculo>(() => base.vehiculos as unknown as Table<Vehiculo, Id>),
    lecturas: conFecha<LecturaOdometro>(
      () => base.lecturas as unknown as Table<LecturaOdometro, Id>,
    ),
    mantenimientos: conFecha<Mantenimiento>(
      () => base.mantenimientos as unknown as Table<Mantenimiento, Id>,
    ),
    reglas: crearColeccionDeVehiculo<ReglaMantenimiento>(
      () => base.reglas as unknown as Table<ReglaMantenimiento, Id>,
      { ordenarPorFecha: false },
    ),
    repostajes: conFecha<Repostaje>(() => base.repostajes as unknown as Table<Repostaje, Id>),
    gastos: conFecha<Gasto>(() => base.gastos as unknown as Table<Gasto, Id>),
    documentos: crearColeccionDeVehiculo<Documento>(
      () => base.documentos as unknown as Table<Documento, Id>,
      { ordenarPorFecha: false },
    ),
    adjuntos: crearColeccion<Adjunto>(() => base.adjuntos as unknown as Table<Adjunto, Id>),
    ajustes: crearColeccionAjustes(() => base.ajustes as unknown as Table<Ajustes, Id>),

    async puntosOdometro(vehiculoId) {
      const [lecturas, repostajes, mantenimientos, gastos] = await Promise.all([
        base.lecturas.where('vehiculoId').equals(vehiculoId).toArray(),
        base.repostajes.where('vehiculoId').equals(vehiculoId).toArray(),
        base.mantenimientos.where('vehiculoId').equals(vehiculoId).toArray(),
        base.gastos.where('vehiculoId').equals(vehiculoId).toArray(),
      ]);

      const puntos: PuntoOdometro[] = [];

      for (const l of lecturas) {
        puntos.push({ fecha: l.fecha, km: l.km, origen: l.origen, refId: l.id });
      }

      const anotados: readonly [readonly { id: Id; fecha: string; km?: number }[], OrigenLectura][] =
        [
          [repostajes, 'repostaje'],
          [mantenimientos, 'mantenimiento'],
          [gastos, 'gasto'],
        ];

      for (const [registros, origen] of anotados) {
        for (const r of registros) {
          if (typeof r.km === 'number') {
            puntos.push({ fecha: r.fecha, km: r.km, origen, refId: r.id });
          }
        }
      }

      puntos.sort((a, b) => (a.fecha === b.fecha ? a.km - b.km : a.fecha < b.fecha ? -1 : 1));
      return puntos;
    },

    async eliminarVehiculo(vehiculoId) {
      await base.transaction(
        'rw',
        [
          base.vehiculos,
          base.lecturas,
          base.mantenimientos,
          base.reglas,
          base.repostajes,
          base.gastos,
          base.documentos,
          base.adjuntos,
        ],
        async () => {
          const vehiculo = await base.vehiculos.get(vehiculoId);

          const [mantenimientos, repostajes, gastos, documentos] = await Promise.all([
            base.mantenimientos.where('vehiculoId').equals(vehiculoId).toArray(),
            base.repostajes.where('vehiculoId').equals(vehiculoId).toArray(),
            base.gastos.where('vehiculoId').equals(vehiculoId).toArray(),
            base.documentos.where('vehiculoId').equals(vehiculoId).toArray(),
          ]);

          // Los adjuntos viven en su propia tabla: si no se limpian aquí,
          // quedan megabytes huérfanos ocupando la cuota del navegador.
          const adjuntos = new Set<Id>([
            ...idsDeAdjuntos(mantenimientos),
            ...idsDeAdjuntos(repostajes),
            ...idsDeAdjuntos(gastos),
            ...idsDeAdjuntos(documentos),
          ]);
          if (vehiculo?.fotoAdjuntoId) adjuntos.add(vehiculo.fotoAdjuntoId);

          await Promise.all([
            base.lecturas.where('vehiculoId').equals(vehiculoId).delete(),
            base.mantenimientos.where('vehiculoId').equals(vehiculoId).delete(),
            base.reglas.where('vehiculoId').equals(vehiculoId).delete(),
            base.repostajes.where('vehiculoId').equals(vehiculoId).delete(),
            base.gastos.where('vehiculoId').equals(vehiculoId).delete(),
            base.documentos.where('vehiculoId').equals(vehiculoId).delete(),
            base.adjuntos.bulkDelete([...adjuntos]),
            base.vehiculos.delete(vehiculoId),
          ]);
        },
      );
    },

    async vaciar() {
      await base.transaction('rw', base.tables, async () => {
        await Promise.all(base.tables.map((t) => t.clear()));
      });
    },
  };
}

/** Repositorio que usa la aplicación. */
export const repo: Repositorio = crearRepositorioDexie();
