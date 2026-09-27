import type {
  ApunteAlerta,
  CategoriaGasto,
  CategoriaVehiculo,
  CoberturaSeguro,
  Periodicidad,
  TipoCombustible,
  TipoDocumento,
  UnidadEnergia,
} from './tipos.ts';

/**
 * Etiquetas en español y valores por defecto de cada enumerado.
 *
 * Todo lo que el usuario lee sale de aquí, nunca de la clave interna. Si algún
 * día hay más idiomas, este es el único fichero que hay que duplicar.
 */

export interface Etiqueta {
  readonly clave: string;
  readonly nombre: string;
  readonly icono: string;
}

// ---------------------------------------------------------------------------
// Categoría de vehículo
// ---------------------------------------------------------------------------

export const CATEGORIAS_VEHICULO: Record<CategoriaVehiculo, Etiqueta> = {
  turismo: { clave: 'turismo', nombre: 'Turismo', icono: '🚗' },
  autocaravana: { clave: 'autocaravana', nombre: 'Autocaravana', icono: '🚐' },
  furgoneta: { clave: 'furgoneta', nombre: 'Furgoneta', icono: '🚚' },
  moto: { clave: 'moto', nombre: 'Moto', icono: '🏍️' },
  otro: { clave: 'otro', nombre: 'Otro', icono: '🚙' },
};

export const ORDEN_CATEGORIA_VEHICULO: readonly CategoriaVehiculo[] = [
  'turismo',
  'autocaravana',
  'furgoneta',
  'moto',
  'otro',
];

// ---------------------------------------------------------------------------
// Combustible
// ---------------------------------------------------------------------------

export const COMBUSTIBLES: Record<TipoCombustible, Etiqueta> = {
  gasolina: { clave: 'gasolina', nombre: 'Gasolina', icono: '⛽' },
  diesel: { clave: 'diesel', nombre: 'Diésel', icono: '⛽' },
  hibrido: { clave: 'hibrido', nombre: 'Híbrido', icono: '🔋' },
  hibrido_enchufable: { clave: 'hibrido_enchufable', nombre: 'Híbrido enchufable', icono: '🔌' },
  electrico: { clave: 'electrico', nombre: 'Eléctrico', icono: '⚡' },
  glp: { clave: 'glp', nombre: 'GLP', icono: '⛽' },
};

/**
 * Unidades de energía que admite un vehículo. Un eléctrico solo carga kWh; un
 * híbrido enchufable hace las dos cosas y sus consumos se calculan por
 * separado (no tiene sentido sumar litros y kilovatios).
 */
export function unidadesDe(combustible: TipoCombustible): readonly UnidadEnergia[] {
  switch (combustible) {
    case 'electrico':
      return ['kWh'];
    case 'hibrido_enchufable':
      return ['l', 'kWh'];
    default:
      return ['l'];
  }
}

export function unidadPrincipalDe(combustible: TipoCombustible): UnidadEnergia {
  return combustible === 'electrico' ? 'kWh' : 'l';
}

// ---------------------------------------------------------------------------
// Alertas: sugerencias de partida
// ---------------------------------------------------------------------------

export interface SugerenciaAlerta {
  /** Estable: sirve para saber qué sugerencias ya tiene puestas un vehículo. */
  readonly clave: string;
  readonly nombre: string;
  readonly icono: string;
  readonly apunte: ApunteAlerta;
  readonly cadaKm?: number;
  readonly cadaMeses?: number;
  readonly avisoKm?: number;
  readonly avisoDias?: number;
  /**
   * Lo normal es conocer la fecha exacta (la ITV va en la pegatina, el seguro
   * en la póliza): el formulario la pide en primer plano.
   */
  readonly pideFecha?: boolean;
  /**
   * Marcada de entrada al dar de alta un vehículo. Son pocas a propósito: la
   * versión anterior creaba nueve avisos por coche y el usuario no podía
   * quitar los que le sobraban. Mejor empezar corto y añadir.
   */
  readonly basica?: boolean;
}

/** Papeles con fecha: iguales para cualquier vehículo. */
const PAPELES: readonly SugerenciaAlerta[] = [
  { clave: 'itv', nombre: 'ITV', icono: '🔎', apunte: 'itv', cadaMeses: 12, pideFecha: true, basica: true },
  { clave: 'seguro', nombre: 'Seguro', icono: '🛡️', apunte: 'seguro', cadaMeses: 12, pideFecha: true, basica: true },
  { clave: 'impuesto', nombre: 'Impuesto de circulación', icono: '🏛️', apunte: 'impuesto_circulacion', cadaMeses: 12, pideFecha: true, avisoDias: 21 },
];

type Mecanica = readonly SugerenciaAlerta[];

const TURISMO: Mecanica = [
  { clave: 'revision', nombre: 'Revisión / servicio', icono: '🔧', apunte: 'mantenimiento', cadaKm: 15000, cadaMeses: 12, basica: true },
  { clave: 'aceite', nombre: 'Cambio de aceite', icono: '🛢️', apunte: 'mantenimiento', cadaKm: 15000, cadaMeses: 12 },
  { clave: 'filtros', nombre: 'Filtros', icono: '🌀', apunte: 'mantenimiento', cadaKm: 30000, cadaMeses: 24 },
  { clave: 'neumaticos', nombre: 'Neumáticos', icono: '🛞', apunte: 'mantenimiento', cadaKm: 40000, cadaMeses: 60, avisoKm: 2000, avisoDias: 45 },
  { clave: 'frenos', nombre: 'Frenos', icono: '🛑', apunte: 'mantenimiento', cadaKm: 50000, cadaMeses: 48, avisoKm: 2000 },
  { clave: 'distribucion', nombre: 'Correa de distribución', icono: '⚙️', apunte: 'mantenimiento', cadaKm: 120000, cadaMeses: 120, avisoKm: 5000, avisoDias: 90 },
  { clave: 'bateria', nombre: 'Batería', icono: '🔋', apunte: 'mantenimiento', cadaMeses: 60, avisoDias: 60 },
];

/**
 * Un eléctrico no lleva aceite motor ni correa de distribución, y los frenos
 * duran mucho más por la retención regenerativa. El filtro que queda es el
 * del habitáculo.
 */
const ELECTRICO: Mecanica = [
  { clave: 'revision', nombre: 'Revisión / servicio', icono: '🔧', apunte: 'mantenimiento', cadaKm: 30000, cadaMeses: 24, basica: true },
  { clave: 'filtros', nombre: 'Filtro de habitáculo', icono: '🌀', apunte: 'mantenimiento', cadaMeses: 24 },
  { clave: 'neumaticos', nombre: 'Neumáticos', icono: '🛞', apunte: 'mantenimiento', cadaKm: 35000, cadaMeses: 60, avisoKm: 2000, avisoDias: 45 },
  { clave: 'frenos', nombre: 'Frenos', icono: '🛑', apunte: 'mantenimiento', cadaKm: 90000, cadaMeses: 48, avisoKm: 2000 },
  { clave: 'bateria', nombre: 'Batería de 12 V', icono: '🔋', apunte: 'mantenimiento', cadaMeses: 48, avisoDias: 60 },
];

/**
 * Autocaravana. Aquí manda el TIEMPO, no los kilómetros: rueda unos 5.000 km
 * al año, así que un «cada 15.000 km» tardaría tres años en saltar mientras el
 * aceite se degrada igual en el garaje.
 *
 * Dos avisos que un turismo no tiene, y por eso van marcados de entrada:
 *  - Sellado del techo: revisión anual. Una filtración sin detectar pudre la
 *    célula y la reparación cuesta más que el vehículo.
 *  - Instalación de gas: revisión obligatoria cada cinco años en España.
 *
 * Y los neumáticos mueren de edad, no de desgaste: seis años es el límite
 * habitual aunque tengan dibujo.
 */
const AUTOCARAVANA: Mecanica = [
  { clave: 'revision', nombre: 'Revisión / servicio', icono: '🔧', apunte: 'mantenimiento', cadaKm: 20000, cadaMeses: 12, basica: true },
  { clave: 'sellado_techo', nombre: 'Sellado del techo', icono: '💧', apunte: 'mantenimiento', cadaMeses: 12, avisoDias: 45, basica: true },
  { clave: 'instalacion_gas', nombre: 'Instalación de gas', icono: '🔥', apunte: 'mantenimiento', cadaMeses: 60, avisoDias: 60, basica: true },
  { clave: 'aceite', nombre: 'Cambio de aceite', icono: '🛢️', apunte: 'mantenimiento', cadaKm: 25000, cadaMeses: 24 },
  { clave: 'filtros', nombre: 'Filtros', icono: '🌀', apunte: 'mantenimiento', cadaKm: 40000, cadaMeses: 24 },
  { clave: 'neumaticos', nombre: 'Neumáticos', icono: '🛞', apunte: 'mantenimiento', cadaKm: 60000, cadaMeses: 72, avisoDias: 60 },
  { clave: 'frenos', nombre: 'Frenos', icono: '🛑', apunte: 'mantenimiento', cadaKm: 50000, cadaMeses: 60 },
  { clave: 'distribucion', nombre: 'Correa de distribución', icono: '⚙️', apunte: 'mantenimiento', cadaKm: 150000, cadaMeses: 120, avisoKm: 5000, avisoDias: 90 },
  // La de servicio se cansa antes que la del motor, y es la que te deja sin
  // nevera a mitad de viaje.
  { clave: 'bateria', nombre: 'Batería de servicio', icono: '🔋', apunte: 'mantenimiento', cadaMeses: 48, avisoDias: 60 },
];

const FURGONETA: Mecanica = [
  { clave: 'revision', nombre: 'Revisión / servicio', icono: '🔧', apunte: 'mantenimiento', cadaKm: 25000, cadaMeses: 12, basica: true },
  { clave: 'aceite', nombre: 'Cambio de aceite', icono: '🛢️', apunte: 'mantenimiento', cadaKm: 20000, cadaMeses: 12 },
  { clave: 'filtros', nombre: 'Filtros', icono: '🌀', apunte: 'mantenimiento', cadaKm: 40000, cadaMeses: 24 },
  { clave: 'neumaticos', nombre: 'Neumáticos', icono: '🛞', apunte: 'mantenimiento', cadaKm: 50000, cadaMeses: 60, avisoKm: 2000, avisoDias: 45 },
  { clave: 'frenos', nombre: 'Frenos', icono: '🛑', apunte: 'mantenimiento', cadaKm: 45000, cadaMeses: 48, avisoKm: 2000 },
  { clave: 'distribucion', nombre: 'Correa de distribución', icono: '⚙️', apunte: 'mantenimiento', cadaKm: 150000, cadaMeses: 120, avisoKm: 5000, avisoDias: 90 },
  { clave: 'bateria', nombre: 'Batería', icono: '🔋', apunte: 'mantenimiento', cadaMeses: 60, avisoDias: 60 },
];

/** Una moto gasta aceite cada 5.000-6.000 km y lleva cadena, no correa. */
const MOTO: Mecanica = [
  { clave: 'revision', nombre: 'Revisión / servicio', icono: '🔧', apunte: 'mantenimiento', cadaKm: 10000, cadaMeses: 12, basica: true },
  { clave: 'aceite', nombre: 'Cambio de aceite', icono: '🛢️', apunte: 'mantenimiento', cadaKm: 6000, cadaMeses: 12 },
  { clave: 'filtros', nombre: 'Filtros', icono: '🌀', apunte: 'mantenimiento', cadaKm: 12000, cadaMeses: 24 },
  { clave: 'transmision', nombre: 'Kit de transmisión', icono: '⛓️', apunte: 'mantenimiento', cadaKm: 20000, cadaMeses: 24 },
  { clave: 'neumaticos', nombre: 'Neumáticos', icono: '🛞', apunte: 'mantenimiento', cadaKm: 15000, cadaMeses: 60, avisoKm: 1000 },
  { clave: 'frenos', nombre: 'Frenos', icono: '🛑', apunte: 'mantenimiento', cadaKm: 20000, cadaMeses: 36 },
  { clave: 'bateria', nombre: 'Batería', icono: '🔋', apunte: 'mantenimiento', cadaMeses: 36, avisoDias: 60 },
];

/**
 * Sugerencias para un vehículo: primero los papeles, luego la mecánica.
 *
 * La categoría manda sobre el combustible, salvo en los eléctricos: ahí
 * desaparecen el aceite y la distribución sea cual sea la carrocería.
 */
export function sugerenciasAlerta(
  categoria: CategoriaVehiculo,
  combustible: TipoCombustible,
): readonly SugerenciaAlerta[] {
  const mecanica =
    combustible === 'electrico'
      ? ELECTRICO
      : categoria === 'autocaravana'
        ? AUTOCARAVANA
        : categoria === 'furgoneta'
          ? FURGONETA
          : categoria === 'moto'
            ? MOTO
            : TURISMO;
  return [...PAPELES, ...mecanica];
}

/** Iconos para elegir en una alerta propia. */
export const ICONOS_ALERTA: readonly string[] = [
  '🔧', '🛢️', '🌀', '🛞', '🛑', '⚙️', '🔋', '❄️', '💡', '🧽',
  '🔎', '🛡️', '🏛️', '💧', '🔥', '⛓️', '📋', '⭐',
];

/** Dónde se apunta el coste de una alerta hecha. */
export const APUNTES_ALERTA: Record<ApunteAlerta, Etiqueta> = {
  mantenimiento: { clave: 'mantenimiento', nombre: 'Mantenimiento', icono: '🔧' },
  seguro: { clave: 'seguro', nombre: 'Seguro', icono: '🛡️' },
  impuesto_circulacion: { clave: 'impuesto_circulacion', nombre: 'Impuesto de circulación', icono: '🏛️' },
  itv: { clave: 'itv', nombre: 'ITV', icono: '📋' },
  parking: { clave: 'parking', nombre: 'Parking', icono: '🅿️' },
  peajes: { clave: 'peajes', nombre: 'Peajes', icono: '🛣️' },
  multas: { clave: 'multas', nombre: 'Multas', icono: '🚨' },
  financiacion: { clave: 'financiacion', nombre: 'Financiación', icono: '🏦' },
  accesorios: { clave: 'accesorios', nombre: 'Accesorios', icono: '🧰' },
  otro: { clave: 'otro', nombre: 'Otro gasto', icono: '💶' },
};

export const ORDEN_APUNTE_ALERTA: readonly ApunteAlerta[] = [
  'mantenimiento',
  'itv',
  'seguro',
  'impuesto_circulacion',
  'financiacion',
  'parking',
  'accesorios',
  'otro',
];

/** Antelación de los avisos cuando ni la alerta ni Ajustes dicen otra cosa. */
export const AVISO_DIAS_POR_DEFECTO = 30;
export const AVISO_KM_POR_DEFECTO = 1000;

// ---------------------------------------------------------------------------
// Gastos
// ---------------------------------------------------------------------------

export const CATEGORIAS_GASTO: Record<CategoriaGasto, Etiqueta> = {
  seguro: { clave: 'seguro', nombre: 'Seguro', icono: '🛡️' },
  impuesto_circulacion: {
    clave: 'impuesto_circulacion',
    nombre: 'Impuesto de circulación',
    icono: '🏛️',
  },
  itv: { clave: 'itv', nombre: 'ITV', icono: '📋' },
  parking: { clave: 'parking', nombre: 'Parking', icono: '🅿️' },
  peajes: { clave: 'peajes', nombre: 'Peajes', icono: '🛣️' },
  multas: { clave: 'multas', nombre: 'Multas', icono: '🚨' },
  financiacion: { clave: 'financiacion', nombre: 'Financiación', icono: '🏦' },
  accesorios: { clave: 'accesorios', nombre: 'Accesorios', icono: '🧰' },
  otro: { clave: 'otro', nombre: 'Otro', icono: '💶' },
};

export const ORDEN_CATEGORIA_GASTO: readonly CategoriaGasto[] = [
  'seguro',
  'impuesto_circulacion',
  'itv',
  'financiacion',
  'parking',
  'peajes',
  'multas',
  'accesorios',
  'otro',
];

export const PERIODICIDADES: Record<Periodicidad, Etiqueta & { meses: number }> = {
  mensual: { clave: 'mensual', nombre: 'Mensual', icono: '🗓️', meses: 1 },
  trimestral: { clave: 'trimestral', nombre: 'Trimestral', icono: '🗓️', meses: 3 },
  semestral: { clave: 'semestral', nombre: 'Semestral', icono: '🗓️', meses: 6 },
  anual: { clave: 'anual', nombre: 'Anual', icono: '🗓️', meses: 12 },
};

// ---------------------------------------------------------------------------
// Documentos
// ---------------------------------------------------------------------------

export const TIPOS_DOCUMENTO: Record<TipoDocumento, Etiqueta> = {
  seguro: { clave: 'seguro', nombre: 'Seguro', icono: '🛡️' },
  itv: { clave: 'itv', nombre: 'ITV', icono: '🔎' },
  impuesto_circulacion: {
    clave: 'impuesto_circulacion',
    nombre: 'Impuesto de circulación',
    icono: '🏛️',
  },
  permiso_circulacion: { clave: 'permiso_circulacion', nombre: 'Permiso de circulación', icono: '📄' },
  ficha_tecnica: { clave: 'ficha_tecnica', nombre: 'Ficha técnica', icono: '📑' },
  otro: { clave: 'otro', nombre: 'Otro documento', icono: '🗂️' },
};

export const ORDEN_DOCUMENTO: readonly TipoDocumento[] = [
  'seguro',
  'itv',
  'impuesto_circulacion',
  'permiso_circulacion',
  'ficha_tecnica',
  'otro',
];

export const COBERTURAS_SEGURO: Record<CoberturaSeguro, Etiqueta> = {
  terceros: { clave: 'terceros', nombre: 'Terceros', icono: '🛡️' },
  terceros_ampliado: { clave: 'terceros_ampliado', nombre: 'Terceros ampliado', icono: '🛡️' },
  todo_riesgo_franquicia: {
    clave: 'todo_riesgo_franquicia',
    nombre: 'Todo riesgo con franquicia',
    icono: '🛡️',
  },
  todo_riesgo: { clave: 'todo_riesgo', nombre: 'Todo riesgo', icono: '🛡️' },
};

// ---------------------------------------------------------------------------
// Ayudas de presentación
// ---------------------------------------------------------------------------

/** Convierte un `Record<clave, Etiqueta>` en lista ordenada para un `<select>`. */
export function opciones<K extends string>(
  catalogo: Record<K, Etiqueta>,
  orden: readonly K[],
): readonly { valor: K; nombre: string; icono: string }[] {
  return orden.map((clave) => ({
    valor: clave,
    nombre: catalogo[clave].nombre,
    icono: catalogo[clave].icono,
  }));
}
