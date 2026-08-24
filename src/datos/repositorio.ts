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
  PuntoOdometro,
  Repostaje,
  ReglaMantenimiento,
  Vehiculo,
} from '@/dominio/tipos.ts';

/**
 * Contrato de acceso a datos.
 *
 * La app entera habla con esta interfaz, nunca con Dexie directamente. Hoy la
 * única implementación es IndexedDB en el navegador; el día que haga falta un
 * backend con usuarios, se escribe otra implementación y la interfaz de
 * usuario no se entera. Por eso `EntidadBase` ya reserva `propietarioId`.
 */

export interface Coleccion<T extends EntidadBase> {
  obtener(id: Id): Promise<T | undefined>;
  listar(): Promise<T[]>;
  crear(datos: Nuevo<T>): Promise<T>;
  /** Devuelve el registro actualizado. Lanza si el id no existe. */
  actualizar(id: Id, cambios: Cambios<T>): Promise<T>;
  borrar(id: Id): Promise<void>;
  contar(): Promise<number>;
}

/** Colección cuyos registros cuelgan de un vehículo. */
export interface ColeccionDeVehiculo<T extends EntidadBase> extends Coleccion<T> {
  /** Ordenados por fecha ascendente cuando la entidad tiene fecha. */
  listarPorVehiculo(vehiculoId: Id): Promise<T[]>;
}

export interface ColeccionAjustes {
  obtener(): Promise<Ajustes>;
  guardar(cambios: Cambios<Ajustes>): Promise<Ajustes>;
}

export interface Repositorio {
  readonly vehiculos: Coleccion<Vehiculo>;
  readonly lecturas: ColeccionDeVehiculo<LecturaOdometro>;
  readonly mantenimientos: ColeccionDeVehiculo<Mantenimiento>;
  readonly reglas: ColeccionDeVehiculo<ReglaMantenimiento>;
  readonly repostajes: ColeccionDeVehiculo<Repostaje>;
  readonly gastos: ColeccionDeVehiculo<Gasto>;
  readonly documentos: ColeccionDeVehiculo<Documento>;
  readonly adjuntos: Coleccion<Adjunto>;
  readonly ajustes: ColeccionAjustes;

  /**
   * Histórico de odómetro unificado: lecturas manuales más los kilómetros
   * anotados en repostajes, mantenimientos y gastos. Ordenado por fecha y,
   * a igualdad de fecha, por kilómetros.
   */
  puntosOdometro(vehiculoId: Id): Promise<PuntoOdometro[]>;

  /** Borra el vehículo y, en cascada, todo lo que cuelga de él. */
  eliminarVehiculo(vehiculoId: Id): Promise<void>;

  /** Vacía todas las tablas. Lo usa la importación de un JSON completo. */
  vaciar(): Promise<void>;
}
