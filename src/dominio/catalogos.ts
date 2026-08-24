import type {
  AntelacionAviso,
  CategoriaGasto,
  CoberturaSeguro,
  Periodicidad,
  TipoCombustible,
  TipoDocumento,
  TipoMantenimiento,
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
// Mantenimiento
// ---------------------------------------------------------------------------

export const TIPOS_MANTENIMIENTO: Record<TipoMantenimiento, Etiqueta> = {
  aceite: { clave: 'aceite', nombre: 'Cambio de aceite', icono: '🛢️' },
  filtros: { clave: 'filtros', nombre: 'Filtros', icono: '🌀' },
  neumaticos: { clave: 'neumaticos', nombre: 'Neumáticos', icono: '🛞' },
  frenos: { clave: 'frenos', nombre: 'Frenos', icono: '🛑' },
  distribucion: { clave: 'distribucion', nombre: 'Correa o cadena de distribución', icono: '⚙️' },
  bateria: { clave: 'bateria', nombre: 'Batería', icono: '🔋' },
  revision_general: { clave: 'revision_general', nombre: 'Revisión general', icono: '🔧' },
  otro: { clave: 'otro', nombre: 'Otro', icono: '📋' },
};

export const ORDEN_MANTENIMIENTO: readonly TipoMantenimiento[] = [
  'aceite',
  'filtros',
  'neumaticos',
  'frenos',
  'distribucion',
  'bateria',
  'revision_general',
  'otro',
];

export interface PlantillaRegla {
  readonly cadaKm?: number;
  readonly cadaMeses?: number;
}

/**
 * Recurrencias de partida al dar de alta un vehículo. Son un punto de arranque
 * razonable para un turismo actual, no el libro de mantenimiento del
 * fabricante: se editan por vehículo desde la ficha.
 */
const REGLAS_COMBUSTION: Record<TipoMantenimiento, PlantillaRegla | null> = {
  aceite: { cadaKm: 15000, cadaMeses: 12 },
  filtros: { cadaKm: 30000, cadaMeses: 24 },
  neumaticos: { cadaKm: 40000, cadaMeses: 60 },
  frenos: { cadaKm: 50000, cadaMeses: 48 },
  distribucion: { cadaKm: 120000, cadaMeses: 120 },
  bateria: { cadaMeses: 60 },
  revision_general: { cadaKm: 20000, cadaMeses: 12 },
  otro: null,
};

/**
 * Un eléctrico no lleva aceite motor, ni filtros de combustible, ni correa de
 * distribución. Los frenos duran mucho más por la retención regenerativa.
 */
const REGLAS_ELECTRICO: Record<TipoMantenimiento, PlantillaRegla | null> = {
  aceite: null,
  filtros: { cadaMeses: 24 },
  neumaticos: { cadaKm: 35000, cadaMeses: 60 },
  frenos: { cadaKm: 90000, cadaMeses: 48 },
  distribucion: null,
  bateria: { cadaMeses: 24 },
  revision_general: { cadaKm: 30000, cadaMeses: 24 },
  otro: null,
};

export function plantillaReglas(
  combustible: TipoCombustible,
): Record<TipoMantenimiento, PlantillaRegla | null> {
  return combustible === 'electrico' ? REGLAS_ELECTRICO : REGLAS_COMBUSTION;
}

/** Antelación con la que avisar de cada mantenimiento. */
export const ANTELACION_MANTENIMIENTO: Record<TipoMantenimiento, AntelacionAviso> = {
  aceite: { avisoKm: 1000, avisoDias: 30 },
  filtros: { avisoKm: 1500, avisoDias: 30 },
  neumaticos: { avisoKm: 2000, avisoDias: 45 },
  frenos: { avisoKm: 2000, avisoDias: 45 },
  distribucion: { avisoKm: 5000, avisoDias: 90 },
  bateria: { avisoDias: 60 },
  revision_general: { avisoKm: 1500, avisoDias: 30 },
  otro: { avisoKm: 1000, avisoDias: 30 },
};

// ---------------------------------------------------------------------------
// Gastos
// ---------------------------------------------------------------------------

export const CATEGORIAS_GASTO: Record<CategoriaGasto, Etiqueta> = {
  seguro: { clave: 'seguro', nombre: 'Seguro', icono: '🛡️' },
  impuesto_circulacion: { clave: 'impuesto_circulacion', nombre: 'Impuesto de circulación', icono: '🏛️' },
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
  impuesto_circulacion: { clave: 'impuesto_circulacion', nombre: 'Impuesto de circulación', icono: '🏛️' },
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

/** Días de antelación con los que avisar de cada vencimiento documental. */
export const ANTELACION_DOCUMENTO_DIAS: Record<TipoDocumento, number> = {
  seguro: 30,
  itv: 30,
  impuesto_circulacion: 21,
  permiso_circulacion: 30,
  ficha_tecnica: 30,
  otro: 15,
};

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

/** Nombre legible de un mantenimiento, respetando el tipo personalizado. */
export function nombreMantenimiento(tipo: TipoMantenimiento, personalizado?: string): string {
  if (tipo === 'otro' && personalizado?.trim()) return personalizado.trim();
  return TIPOS_MANTENIMIENTO[tipo].nombre;
}

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
