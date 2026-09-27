/**
 * Modelo de datos de Mi Garaje.
 *
 * Tres decisiones transversales que explican casi todo lo que hay aquí:
 *
 * 1. EL DINERO SE GUARDA EN CÉNTIMOS ENTEROS. Nunca en euros con decimales.
 *    `0.1 + 0.2 !== 0.3` y esta app suma cientos de importes para calcular el
 *    coste por kilómetro; con float el error se acumula y acaba viéndose.
 *
 * 2. LAS FECHAS SIN HORA SON CADENAS 'YYYY-MM-DD', no objetos Date.
 *    Un repostaje ocurre "el 14 de marzo", no "el 14 de marzo a las 00:00 UTC".
 *    Guardar Date obliga a pelearse con zonas horarias en cada comparación.
 *
 * 3. EL KILOMETRAJE ACTUAL NO ES UN CAMPO. Se deriva del histórico de lecturas
 *    del odómetro (ver `PuntoOdometro`). Un campo `kmActual` mutable se
 *    desincroniza en cuanto registras un repostaje con fecha atrasada.
 */

// ---------------------------------------------------------------------------
// Alias primitivos
// ---------------------------------------------------------------------------

export type Id = string;

/** Fecha civil sin hora ni zona, formato 'YYYY-MM-DD'. */
export type FechaISO = string;

/** Instante completo ISO-8601 con zona, p. ej. '2026-03-14T18:22:05.123Z'. */
export type InstanteISO = string;

/** Importe en céntimos enteros. 1250 = 12,50 €. */
export type Centimos = number;

// ---------------------------------------------------------------------------
// Entidad base
// ---------------------------------------------------------------------------

export interface EntidadBase {
  id: Id;
  creadoEn: InstanteISO;
  actualizadoEn: InstanteISO;
  /**
   * Borrado lógico (tombstone). En v1 se borra de verdad, pero el campo existe
   * desde el principio: si algún día hay sincronización, sin tombstones no hay
   * forma de propagar un borrado y los registros resucitan solos.
   */
  borradoEn?: InstanteISO | null;
  /**
   * Reservado para multiusuario. Siempre `null` en v1. Está aquí para que
   * añadir usuarios sea una migración de índices, no un rediseño del esquema.
   */
  propietarioId?: Id | null;
}

/**
 * Datos para crear un registro: sin metadatos, con id opcional.
 *
 * `T extends unknown` fuerza la distribución sobre uniones. Sin ese truco,
 * `Omit<DocumentoSeguro | DocumentoItv, ...>` colapsaría en los campos comunes
 * y perdería el discriminante, que es justo lo que hace útil a `Documento`.
 */
export type Nuevo<T extends EntidadBase> = T extends unknown
  ? Omit<T, keyof EntidadBase> & Partial<Pick<EntidadBase, 'id'>>
  : never;

/** Datos para modificar un registro: todo opcional menos los metadatos. */
export type Cambios<T extends EntidadBase> = T extends unknown
  ? Partial<Omit<T, keyof EntidadBase>>
  : never;

// ---------------------------------------------------------------------------
// Vehículo
// ---------------------------------------------------------------------------

export type TipoCombustible =
  | 'gasolina'
  | 'diesel'
  | 'hibrido'
  | 'hibrido_enchufable'
  | 'electrico'
  | 'glp';

export type EstadoVehiculo = 'activo' | 'vendido';

/**
 * Categoría del vehículo. No es decorativa: determina qué plantilla de
 * recurrencias de mantenimiento se aplica.
 *
 * Una autocaravana hace 5.000 km al año, así que sus reglas por kilómetros
 * casi nunca disparan y manda el tiempo; además tiene mantenimientos que un
 * turismo no tiene (sellado del techo, instalación de gas). Una moto gasta
 * aceite cada 5.000 km, no cada 15.000.
 */
export type CategoriaVehiculo = 'turismo' | 'autocaravana' | 'furgoneta' | 'moto' | 'otro';

export interface Vehiculo extends EntidadBase {
  alias: string;
  categoria: CategoriaVehiculo;
  marca: string;
  modelo: string;
  version?: string;
  matricula: string;
  anio: number;
  combustible: TipoCombustible;

  fechaCompra?: FechaISO;
  /** Kilómetros en el momento de la compra. Genera la primera lectura. */
  kmCompra?: number;
  /** Necesario para el coste total de propiedad. */
  precioCompraCentimos?: Centimos;

  bastidor?: string;
  fotoAdjuntoId?: Id;
  notas?: string;

  estado: EstadoVehiculo;
  /**
   * Cambio de titularidad: al marcar 'vendido' el vehículo se congela.
   * Deja de generar avisos y de contar en el gasto corriente, pero conserva
   * todo su histórico y sigue apareciendo en las analíticas de años pasados.
   */
  fechaVenta?: FechaISO;
  kmVenta?: number;
  precioVentaCentimos?: Centimos;

  /** Orden de presentación en el panel principal. */
  orden: number;
}

// ---------------------------------------------------------------------------
// Odómetro
// ---------------------------------------------------------------------------

export type OrigenLectura =
  | 'manual'
  | 'alta_vehiculo'
  | 'venta'
  | 'repostaje'
  | 'mantenimiento'
  | 'gasto';

/**
 * Lectura introducida a mano (o al dar de alta / vender el vehículo).
 * Los kilómetros anotados en un repostaje o un mantenimiento NO se copian
 * aquí: se unen en tiempo de lectura (ver `PuntoOdometro`). Duplicarlos
 * obligaría a mantener dos copias sincronizadas y siempre acaban divergiendo.
 */
export interface LecturaOdometro extends EntidadBase {
  vehiculoId: Id;
  fecha: FechaISO;
  km: number;
  origen: Extract<OrigenLectura, 'manual' | 'alta_vehiculo' | 'venta'>;
  notas?: string;
}

/**
 * Vista unificada del histórico de odómetro: lecturas manuales + los
 * kilómetros anotados en repostajes, mantenimientos y gastos. Es la entrada
 * del estimador de kilometraje. No se persiste, se calcula.
 */
export interface PuntoOdometro {
  fecha: FechaISO;
  km: number;
  origen: OrigenLectura;
  /** Id del registro que aportó el dato. */
  refId: Id;
}

// ---------------------------------------------------------------------------
// Alertas
// ---------------------------------------------------------------------------

/**
 * Dónde se apunta el coste cuando una alerta se marca como hecha.
 *
 * Una revisión es un mantenimiento; renovar el seguro o pasar la ITV es un
 * gasto de su categoría. Sin esto, el coste por categoría mezclaría la prima
 * del seguro con los cambios de aceite.
 */
export type ApunteAlerta = 'mantenimiento' | CategoriaGasto;

/**
 * Algo que hay que hacer cada cierto tiempo o cada ciertos kilómetros.
 *
 * Es la pieza central de la app: la ITV, el seguro, el cambio de aceite o el
 * «servicio anual Audi» son todos alertas, con el nombre que el usuario
 * quiera. No hay tipos fijos a propósito: un servicio oficial ya incluye
 * aceite y filtros, y obligar a separarlos en dos avisos (como hacía la
 * versión anterior, con un catálogo cerrado que además se regeneraba solo)
 * duplicaba avisos que el usuario no podía quitar.
 *
 * LA ALERTA GUARDA SU PROPIA «ÚLTIMA VEZ». No se deduce buscando en el
 * histórico de mantenimientos por tipo: al marcarla como hecha se actualiza
 * aquí, y el usuario la puede corregir a mano. Así una alerta recién creada
 * pregunta «¿cuándo fue la última vez?» en lugar de anunciar «sin registrar».
 */
export interface Alerta extends EntidadBase {
  vehiculoId: Id;
  nombre: string;
  /** Emoji que la identifica en las listas. */
  icono: string;

  /** Se repite cada tantos kilómetros. */
  cadaKm?: number;
  /** Se repite cada tantos meses. */
  cadaMeses?: number;
  /**
   * Fecha exacta del próximo vencimiento. Manda sobre el cálculo por meses:
   * sirve para la ITV (la fecha va en la pegatina) o un seguro que vence un
   * día concreto. Se borra al marcar la alerta como hecha.
   */
  venceEl?: FechaISO;

  /** Cuándo se hizo por última vez. Punto de partida del cálculo. */
  ultimaFecha?: FechaISO;
  /** Con cuántos kilómetros se hizo por última vez. */
  ultimoKm?: number;

  /** Antelación del aviso. Si falta, la de Ajustes. */
  avisoDias?: number;
  avisoKm?: number;

  apunte: ApunteAlerta;
  notas?: string;
}

// ---------------------------------------------------------------------------
// Mantenimientos (servicios hechos)
// ---------------------------------------------------------------------------

/**
 * Un servicio que se hizo: la entrada del histórico con su fecha y su coste.
 *
 * Puede cubrir varias alertas a la vez —un servicio oficial reinicia la
 * revisión, el aceite y los filtros de un golpe— o ninguna, si es una
 * reparación suelta que no se repite.
 */
export interface Mantenimiento extends EntidadBase {
  vehiculoId: Id;
  titulo: string;
  /** Alertas que este servicio deja a cero. */
  alertaIds: Id[];
  fecha: FechaISO;
  km?: number;
  taller?: string;
  costeCentimos: Centimos;
  notas?: string;
  adjuntoIds: Id[];
}

// ---------------------------------------------------------------------------
// Repostajes
// ---------------------------------------------------------------------------

/** Litros para combustión, kWh para eléctricos. Un PHEV usa las dos. */
export type UnidadEnergia = 'l' | 'kWh';

export interface Repostaje extends EntidadBase {
  vehiculoId: Id;
  fecha: FechaISO;
  /** Litros o kWh repostados. */
  cantidad: number;
  unidad: UnidadEnergia;
  /**
   * Canónico junto a `cantidad`. El precio por unidad se deriva
   * (importe / cantidad) para que los tres campos no puedan contradecirse.
   */
  importeCentimos: Centimos;
  km?: number;
  /** Sin depósito lleno no se puede cerrar un tramo de consumo. */
  depositoLleno: boolean;
  /**
   * Marca que hubo repostajes sin registrar antes de este. El cálculo de
   * consumo descarta el tramo en lugar de dar una cifra absurdamente alta.
   */
  rupturaSerie: boolean;
  estacion?: string;
  notas?: string;
  adjuntoIds: Id[];
}

// ---------------------------------------------------------------------------
// Gastos
// ---------------------------------------------------------------------------

export type CategoriaGasto =
  | 'seguro'
  | 'impuesto_circulacion'
  | 'itv'
  | 'parking'
  | 'peajes'
  | 'multas'
  | 'financiacion'
  | 'accesorios'
  | 'otro';

export type Periodicidad = 'mensual' | 'trimestral' | 'semestral' | 'anual';

export interface Gasto extends EntidadBase {
  vehiculoId: Id;
  categoria: CategoriaGasto;
  descripcion?: string;
  importeCentimos: Centimos;
  fecha: FechaISO;
  recurrente: boolean;
  /** Solo si `recurrente`. Genera la previsión del próximo cargo. */
  periodicidad?: Periodicidad;
  km?: number;
  notas?: string;
  adjuntoIds: Id[];
}

// ---------------------------------------------------------------------------
// Documentos y vencimientos
// ---------------------------------------------------------------------------

export type TipoDocumento =
  | 'seguro'
  | 'itv'
  | 'impuesto_circulacion'
  | 'permiso_circulacion'
  | 'ficha_tecnica'
  | 'otro';

/**
 * Un papel del vehículo: la póliza, el informe de la ITV, la ficha técnica.
 *
 * Solo guarda los datos y los archivos. Cuándo caduca y cuándo avisar es cosa
 * de las alertas: tener la caducidad en dos sitios obligaba a mantenerlos
 * sincronizados, y el aviso de la ITV salía de un formulario de documentos
 * que nadie abre para eso.
 */
interface DocumentoBase extends EntidadBase {
  vehiculoId: Id;
  /** Fecha del papel: la de la inspección, la de emisión de la póliza. */
  fechaEmision?: FechaISO;
  adjuntoIds: Id[];
  notas?: string;
}

export type CoberturaSeguro =
  | 'terceros'
  | 'terceros_ampliado'
  | 'todo_riesgo_franquicia'
  | 'todo_riesgo';

export interface DocumentoSeguro extends DocumentoBase {
  tipo: 'seguro';
  compania: string;
  poliza?: string;
  cobertura: CoberturaSeguro;
  franquiciaCentimos?: Centimos;
  primaCentimos?: Centimos;
}

export interface DocumentoItv extends DocumentoBase {
  tipo: 'itv';
  estacion?: string;
  resultado?: 'favorable' | 'desfavorable' | 'negativo';
}

export interface DocumentoGenerico extends DocumentoBase {
  tipo: Exclude<TipoDocumento, 'seguro' | 'itv'>;
  titulo?: string;
}

export type Documento = DocumentoSeguro | DocumentoItv | DocumentoGenerico;

// ---------------------------------------------------------------------------
// Adjuntos
// ---------------------------------------------------------------------------

/**
 * Fotos de facturas y PDF. Se guardan como Blob dentro de IndexedDB, en su
 * propia tabla: así una consulta de gastos no arrastra megabytes de imagen.
 * Las imágenes se recomprimen antes de guardarse (fase 5).
 */
export interface Adjunto extends EntidadBase {
  nombre: string;
  mime: string;
  bytes: number;
  ancho?: number;
  alto?: number;
  datos: Blob;
}

// ---------------------------------------------------------------------------
// Ajustes (registro único)
// ---------------------------------------------------------------------------

export type Tema = 'claro' | 'oscuro' | 'sistema';

export const ID_AJUSTES = 'ajustes';

export interface Ajustes extends EntidadBase {
  id: typeof ID_AJUSTES;
  tema: Tema;
  vehiculoPorDefectoId?: Id;
  /** Con cuántos días de antelación avisar, si la alerta no dice otra cosa. */
  avisoDias: number;
  /** Con cuántos kilómetros de antelación avisar, ídem. */
  avisoKm: number;
  notificacionesActivadas: boolean;
  ultimaRevisionAvisos?: InstanteISO;
  /**
   * Cuándo se descargó la última copia de seguridad.
   *
   * En una app cuyos datos solo viven en el navegador, saber que hace ocho
   * meses que no haces copia es información de primer orden, no un detalle.
   */
  ultimaCopiaEn?: InstanteISO;
}
