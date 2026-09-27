import type { EntityTable, Table } from 'dexie';
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
  Alerta,
  Vehiculo,
} from '@/dominio/tipos.ts';
import { ajustesPorDefecto } from './ajustesPorDefecto.ts';
import { BaseDatosGaraje, db as dbGlobal, estaVivo, sinBorrados } from './db.ts';
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
 * Marca registros como borrados en vez de eliminarlos de la tabla.
 *
 * Un `delete()` no deja rastro, y sin rastro la sincronizacion no tiene forma
 * de distinguir «esto se borro aqui» de «esto todavia no ha llegado a este
 * dispositivo». Interpreta lo segundo y se lo baja del servidor otra vez: el
 * registro reaparece solo a los pocos segundos. Es el mismo motivo por el que
 * `borrar` es logico, aplicado a los borrados en bloque.
 */
async function marcarBorrados<T extends EntidadBase>(
  tabla: EntityTable<T, 'id'>,
  registros: readonly T[],
  ahora: string,
): Promise<void> {
  const vivos = registros.filter((r) => !r.borradoEn);
  if (vivos.length === 0) return;
  await tabla.bulkPut(vivos.map((r) => ({ ...r, borradoEn: ahora, actualizadoEn: ahora })));
}

/**
 * Lo mismo para los adjuntos, pero tirando el Blob.
 *
 * Conservar la fila es lo que propaga el borrado; conservar ademas la foto
 * serian megabytes ocupando la cuota del navegador para siempre sin que nada
 * los vuelva a mostrar. La sincronizacion ya guarda asi los adjuntos borrados
 * que llegan del servidor, asi que el formato no es nuevo.
 */
async function marcarAdjuntosBorrados(
  tabla: EntityTable<Adjunto, 'id'>,
  adjuntos: readonly Adjunto[],
  ahora: string,
): Promise<void> {
  const vivos = adjuntos.filter((a) => !a.borradoEn);
  if (vivos.length === 0) return;
  await tabla.bulkPut(
    vivos.map((a) => ({ ...a, borradoEn: ahora, actualizadoEn: ahora, datos: new Blob([]) })),
  );
}

function crearColeccion<T extends EntidadBase>(tabla: () => Table<T, Id>): Coleccion<T> {
  return {
    async obtener(id) {
      return estaVivo(await tabla().get(id));
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
      // Mezclados con los de partida: unos ajustes guardados por una versión
      // anterior pueden no traer un campo que se añadió después.
      const guardados = await tabla().get(ID_AJUSTES);
      return guardados ? { ...ajustesPorDefecto(), ...guardados } : ajustesPorDefecto();
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
    alertas: crearColeccionDeVehiculo<Alerta>(
      () => base.alertas as unknown as Table<Alerta, Id>,
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
      const ahora = ahoraISO();
      await base.transaction(
        'rw',
        [
          base.vehiculos,
          base.lecturas,
          base.mantenimientos,
          base.alertas,
          base.repostajes,
          base.gastos,
          base.documentos,
          base.adjuntos,
        ],
        async () => {
          const vehiculo = await base.vehiculos.get(vehiculoId);

          const [lecturas, mantenimientos, alertas, repostajes, gastos, documentos] =
            await Promise.all([
              base.lecturas.where('vehiculoId').equals(vehiculoId).toArray(),
              base.mantenimientos.where('vehiculoId').equals(vehiculoId).toArray(),
              base.alertas.where('vehiculoId').equals(vehiculoId).toArray(),
              base.repostajes.where('vehiculoId').equals(vehiculoId).toArray(),
              base.gastos.where('vehiculoId').equals(vehiculoId).toArray(),
              base.documentos.where('vehiculoId').equals(vehiculoId).toArray(),
            ]);

          // Los adjuntos viven en su propia tabla: si no se limpian aquí,
          // quedan megabytes huérfanos ocupando la cuota del navegador. Se
          // marcan igual que el resto, pero sin el Blob.
          const idsAdjuntos = new Set<Id>([
            ...idsDeAdjuntos(mantenimientos),
            ...idsDeAdjuntos(repostajes),
            ...idsDeAdjuntos(gastos),
            ...idsDeAdjuntos(documentos),
          ]);
          if (vehiculo?.fotoAdjuntoId) idsAdjuntos.add(vehiculo.fotoAdjuntoId);
          const adjuntos = (await base.adjuntos.bulkGet([...idsAdjuntos])).filter(
            (a): a is Adjunto => a !== undefined,
          );

          await Promise.all([
            marcarBorrados(base.lecturas, lecturas, ahora),
            marcarBorrados(base.mantenimientos, mantenimientos, ahora),
            marcarBorrados(base.alertas, alertas, ahora),
            marcarBorrados(base.repostajes, repostajes, ahora),
            marcarBorrados(base.gastos, gastos, ahora),
            marcarBorrados(base.documentos, documentos, ahora),
            marcarAdjuntosBorrados(base.adjuntos, adjuntos, ahora),
            marcarBorrados(base.vehiculos, vehiculo ? [vehiculo] : [], ahora),
          ]);
        },
      );
      programarSincronizacion();
    },

    /*
     * «Borrar todo» tambien deja marcas, por el mismo motivo que el borrado de
     * un registro suelto: vaciar las tablas de verdad hace que la siguiente
     * sincronizacion vea el dispositivo vacio y el servidor lleno, concluya
     * que el servidor va por delante y se lo baje entero. Para quien lo pulsa,
     * el garaje se queda limpio y reaparece a los pocos segundos.
     *
     * `ajustes` es la excepcion y se vacia de verdad: es una fila unica de
     * preferencias que la sincronizacion trata aparte y expresamente sin
     * tombstones (ver `sincronizarAjustes`).
     */
    async vaciar() {
      const ahora = ahoraISO();
      await base.transaction('rw', base.tables, async () => {
        const [
          vehiculos,
          lecturas,
          mantenimientos,
          alertas,
          repostajes,
          gastos,
          documentos,
          adjuntos,
        ] = await Promise.all([
          base.vehiculos.toArray(),
          base.lecturas.toArray(),
          base.mantenimientos.toArray(),
          base.alertas.toArray(),
          base.repostajes.toArray(),
          base.gastos.toArray(),
          base.documentos.toArray(),
          base.adjuntos.toArray(),
        ]);

        await Promise.all([
          marcarBorrados(base.vehiculos, vehiculos, ahora),
          marcarBorrados(base.lecturas, lecturas, ahora),
          marcarBorrados(base.mantenimientos, mantenimientos, ahora),
          marcarBorrados(base.alertas, alertas, ahora),
          marcarBorrados(base.repostajes, repostajes, ahora),
          marcarBorrados(base.gastos, gastos, ahora),
          marcarBorrados(base.documentos, documentos, ahora),
          marcarAdjuntosBorrados(base.adjuntos, adjuntos, ahora),
          base.ajustes.clear(),
        ]);
      });
      programarSincronizacion();
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
