import Dexie, { type EntityTable } from 'dexie';
import type {
  Adjunto,
  Ajustes,
  Documento,
  EntidadBase,
  Gasto,
  LecturaOdometro,
  Mantenimiento,
  Repostaje,
  ReglaMantenimiento,
  Vehiculo,
} from '@/dominio/tipos.ts';

/**
 * Quita los registros con tombstone.
 *
 * El borrado es logico para que se pueda sincronizar (ver `repositorioDexie`),
 * pero para la interfaz un registro borrado no existe. Este filtro es el que
 * sostiene esa ilusion, y tiene que aplicarse en TODA lectura de la base: uno
 * que se olvide hace reaparecer registros borrados, que es de los fallos mas
 * desconcertantes que puede tener una app — el dato vuelve sin que nadie lo
 * haya tocado, y encima solo en las pantallas que leen `db` directamente en
 * vez de pasar por el repositorio.
 *
 * Vive aqui, junto al esquema, y no dentro de `repositorioDexie.ts`, porque
 * `src/ui/ganchos/consultas.ts` lee `db` directamente para las consultas que
 * el repositorio no cubre (ordenar por `orden`, contar, combinar varias
 * tablas en un `Promise.all`) y necesita el mismo filtro sin crear una
 * dependencia de la UI hacia la capa de repositorio.
 */
export function sinBorrados<T extends EntidadBase>(registros: T[]): T[] {
  return registros.filter((r) => !r.borradoEn);
}

/** La misma regla para un registro suelto, del estilo de `Table.get`. */
export function estaVivo<T extends EntidadBase>(registro: T | undefined): T | undefined {
  return registro && !registro.borradoEn ? registro : undefined;
}

/**
 * Esquema IndexedDB (vía Dexie).
 *
 * Solo se declaran los campos que se usan como índice, no el registro entero:
 * en IndexedDB el objeto se guarda completo y el string del esquema únicamente
 * describe por dónde se puede buscar.
 *
 * Los índices compuestos `[vehiculoId+fecha]` son los que sostienen la app:
 * casi todas las consultas son "lo de este vehículo, ordenado por fecha".
 *
 * OJO: IndexedDB no indexa valores `undefined`. Un documento sin
 * `fechaVencimiento` no aparece en el índice `fechaVencimiento`, que es
 * exactamente lo que queremos (un permiso de circulación no caduca), pero hay
 * que recordarlo antes de dar por buena una consulta por ese índice.
 */
export class BaseDatosGaraje extends Dexie {
  vehiculos!: EntityTable<Vehiculo, 'id'>;
  lecturas!: EntityTable<LecturaOdometro, 'id'>;
  mantenimientos!: EntityTable<Mantenimiento, 'id'>;
  reglas!: EntityTable<ReglaMantenimiento, 'id'>;
  repostajes!: EntityTable<Repostaje, 'id'>;
  gastos!: EntityTable<Gasto, 'id'>;
  documentos!: EntityTable<Documento, 'id'>;
  adjuntos!: EntityTable<Adjunto, 'id'>;
  ajustes!: EntityTable<Ajustes, 'id'>;

  constructor(nombre = 'mi-garaje') {
    super(nombre);

    this.version(1).stores({
      vehiculos: 'id, orden, estado, matricula',
      lecturas: 'id, vehiculoId, fecha, [vehiculoId+fecha]',
      mantenimientos: 'id, vehiculoId, fecha, tipo, [vehiculoId+fecha], [vehiculoId+tipo]',
      reglas: 'id, vehiculoId, tipo, [vehiculoId+tipo]',
      repostajes: 'id, vehiculoId, fecha, [vehiculoId+fecha]',
      gastos: 'id, vehiculoId, fecha, categoria, [vehiculoId+fecha], [vehiculoId+categoria]',
      documentos: 'id, vehiculoId, tipo, fechaVencimiento, [vehiculoId+tipo]',
      adjuntos: 'id',
      ajustes: 'id',
    });

    /*
     * v2 — se añadió `categoria` al vehículo (turismo, autocaravana, moto…),
     * que es lo que determina qué plantilla de recurrencias se aplica.
     *
     * Los índices no cambian, así que la versión existe solo para rellenar el
     * campo en las bases ya creadas. Sin esto, un vehículo antiguo se queda con
     * `categoria: undefined` y la interfaz intenta leer una etiqueta que no
     * existe. Turismo es el valor seguro: es la plantilla que tenían todos
     * antes de que hubiera categorías.
     */
    this.version(2).upgrade(async (tx) => {
      await tx
        .table<Vehiculo>('vehiculos')
        .toCollection()
        .modify((vehiculo) => {
          vehiculo.categoria ??= 'turismo';
        });
    });
  }
}

/** Instancia única de la aplicación. Los tests crean la suya. */
export const db = new BaseDatosGaraje();

/** Nombres de las tablas de datos, en orden de dependencia. */
export const TABLAS_DATOS = [
  'vehiculos',
  'lecturas',
  'mantenimientos',
  'reglas',
  'repostajes',
  'gastos',
  'documentos',
  'adjuntos',
  'ajustes',
] as const;

export type NombreTabla = (typeof TABLAS_DATOS)[number];
