import type { Table } from 'dexie';
import { ahoraISO } from '@/dominio/fechas.ts';
import { programarSincronizacion } from './sincronizacion.ts';
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

/**
 * Quita los registros con tombstone.
 *
 * El borrado es logico para que se pueda sincronizar (ver `borrar`), pero para
 * la interfaz un registro borrado no existe. Este filtro es el que sostiene esa
 * ilusion, y tiene que aplicarse en TODA lectura: uno que se olvide hace
 * reaparecer registros borrados, que es de los fallos mas desconcertantes que
 * puede tener una app.
 */
function sinBorrados<T extends EntidadBase>(registros: T[]): T[] {
  return registros.filter((r) => !r.borradoEn);
}

function crearColeccion<T extends EntidadBase>(tabla: () => Table<T, Id>): Coleccion<T> {
  return {
    async obtener(id) {
      const registro = await tabla().get(id);
      return registro && !registro.borradoEn ? registro : undefined;
    },
    async listar() {
      return sinBorrados(await tabla().toArray());
    },
    async crear(datos) {
      const registro = sellarNuevo<T>(datos);
      await tabla().add(registro);
      programarSincronizacion();
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
      programarSincronizacion();
      return actualizado;
    },
    /*
     * BORRADO LOGICO, no fisico.
     *
     * Se marca `borradoEn` y se deja la fila. Es lo que permite que un borrado
     * hecho en el movil llegue al ordenador: si se borrara de verdad, no
     * quedaria ningun rastro que dijera «esto se borro tal dia», el otro
     * dispositivo lo volveria a subir en la siguiente sincronizacion y el
     * borrado nunca se propagaria.
     *
     * Todas las consultas de lectura filtran los borrados (ver
     * `sinBorrados`), asi que para la interfaz el registro desaparece igual.
     * La fila se elimina de verdad al vaciar la base o al importar una copia.
     */
    async borrar(id) {
      const ahora = ahoraISO();
      const afectados = await tabla().update(id, {
        borradoEn: ahora,
        actualizadoEn: ahora,
      } as never);
      // Si no existia, no hay nada que marcar y tampoco es un error: borrar
      // dos veces lo mismo debe ser inofensivo.
      if (afectados === 0) return;
      programarSincronizacion();
    },
    async contar() {
      // `count()` a secas contaria tambien los tombstones.
      return sinBorrados(await tabla().toArray()).length;
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
        return sinBorrados(await tabla().where('vehiculoId').equals(vehiculoId).toArray());
      }
      // El índice compuesto ya devuelve el resultado ordenado por fecha, así
      // que no hace falta ordenar en memoria.
      return sinBorrados(
        await tabla()
          .where('[vehiculoId+fecha]')
          .between([vehiculoId, ''], [vehiculoId, '￿'])
          .toArray(),
      );
    },
  };
}

function crearColeccionAjustes(tabla: () => Table<Ajustes, Id>): ColeccionAjustes {
  return {
    /*
     * LEER NO ESCRIBE. Antes, si no había ajustes guardados, esta función los
     * creaba en la base «de paso». Parecía cómodo y era una bomba de relojería:
     * `useLiveQuery` ejecuta sus consultas dentro de una transacción de SOLO
     * LECTURA, así que en cuanto los ajustes faltaban —justo después de un
     * «borrar todo», o de una importación— la app entera reventaba con
     * `ReadOnlyError`.
     *
     * Los valores por defecto se devuelven sin persistirlos. Se guardan la
     * primera vez que el usuario cambia algo, que es cuando toca escribir.
     */
    async obtener() {
      return (await tabla().get(ID_AJUSTES)) ?? ajustesPorDefecto();
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
      programarSincronizacion();
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
      // Cada uno se filtra por separado: `.map(sinBorrados)` sobre la tupla
      // perderia los tipos, porque son cuatro entidades distintas.
      const [lecturasTodas, repostajesTodos, mantenimientosTodos, gastosTodos] =
        await Promise.all([
          base.lecturas.where('vehiculoId').equals(vehiculoId).toArray(),
          base.repostajes.where('vehiculoId').equals(vehiculoId).toArray(),
          base.mantenimientos.where('vehiculoId').equals(vehiculoId).toArray(),
          base.gastos.where('vehiculoId').equals(vehiculoId).toArray(),
        ]);

      const lecturas = sinBorrados(lecturasTodas);
      const repostajes = sinBorrados(repostajesTodos);
      const mantenimientos = sinBorrados(mantenimientosTodos);
      const gastos = sinBorrados(gastosTodos);

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

    async leerTabla(nombre) {
      return base.table(nombre).toArray();
    },

    async escribirTabla(nombre, filas) {
      // `bulkPut` y no `bulkAdd`: la tabla se acaba de vaciar, pero si una
      // copia trajera ids repetidos es mejor que el último gane a que la
      // importación entera reviente a mitad.
      await base.table(nombre).bulkPut(filas);
    },
  };
}

/** Repositorio que usa la aplicación. */
export const repo: Repositorio = crearRepositorioDexie();
