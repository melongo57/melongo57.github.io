import Dexie, { type EntityTable } from 'dexie';
import type {
  Adjunto,
  Ajustes,
  Documento,
  Gasto,
  LecturaOdometro,
  Mantenimiento,
  Repostaje,
  ReglaMantenimiento,
  Vehiculo,
} from '@/dominio/tipos.ts';

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
