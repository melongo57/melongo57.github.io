import type { TramoConsumo } from './consumo.ts';
import type { FechaISO, UnidadEnergia } from './tipos.ts';

/**
 * Detección de anomalías de consumo.
 *
 * Una subida sostenida del consumo suele significar algo: neumáticos
 * desinflados, un filtro sucio, un inyector que gotea, unos frenos que rozan.
 * Detectarla a tiempo es la diferencia entre una reparación de cincuenta euros
 * y una de quinientos.
 *
 * DOS DECISIONES QUE HACEN QUE ESTO NO DÉ FALSOS POSITIVOS:
 *
 * 1. SE USA LA MEDIANA, NO LA MEDIA. Un solo depósito raro —un viaje de
 *    montaña, una semana de atascos, un repostaje mal anotado— desplaza la
 *    media lo suficiente como para inventarse una avería. La mediana ni se
 *    entera.
 *
 * 2. HACEN FALTA VARIOS TRAMOS SEGUIDOS. Un tramo malo es ruido; tres seguidos
 *    por encima son una señal. Avisar del primero convierte la alerta en algo
 *    que se ignora, que es lo mismo que no tenerla.
 */

export type TipoAnomalia = 'subida_sostenida' | 'tramo_atipico';

export interface Anomalia {
  tipo: TipoAnomalia;
  /** `alerta` merece ir al taller; `aviso` merece mirar la presión. */
  gravedad: 'aviso' | 'alerta';
  unidad: UnidadEnergia;
  /** Consumo habitual, en mediana. */
  consumoBase: number;
  /** Consumo del periodo señalado. */
  consumoReciente: number;
  /** Subida relativa: 0,11 son un 11 % más. */
  incremento: number;
  /** Desde cuándo se observa. */
  desde: FechaISO;
  mensaje: string;
}

/** Tramos mínimos de referencia antes de atreverse a decir nada. */
const MINIMO_BASE = 5;

/** Tramos recientes que se comparan contra la referencia. */
const VENTANA_RECIENTE = 3;

/** Subida a partir de la cual se avisa. Por debajo es ruido de conducción. */
const UMBRAL_AVISO = 0.08;

/** Subida que ya no se explica por la carretera ni por el tiempo. */
const UMBRAL_ALERTA = 0.15;

/** Cuánto se tiene que desviar un solo tramo para considerarlo atípico. */
const UMBRAL_ATIPICO = 0.3;

export function mediana(valores: readonly number[]): number | null {
  if (valores.length === 0) return null;
  const ordenados = [...valores].sort((a, b) => a - b);
  const medio = Math.floor(ordenados.length / 2);
  return ordenados.length % 2 === 0
    ? (ordenados[medio - 1]! + ordenados[medio]!) / 2
    : ordenados[medio]!;
}

function porcentaje(fraccion: number): string {
  return `${Math.round(fraccion * 100)} %`;
}

function formatearConsumo(valor: number, unidad: UnidadEnergia): string {
  return `${valor.toFixed(1).replace('.', ',')} ${unidad}/100 km`;
}

/**
 * Busca anomalías en una serie de tramos de consumo.
 *
 * Devuelve como mucho una de cada tipo: la lista existe para poder mostrarlas
 * juntas, no para acumular avisos sobre lo mismo.
 */
export function detectarAnomalias(
  tramos: readonly TramoConsumo[],
  opciones: { ventana?: number; minimoBase?: number } = {},
): Anomalia[] {
  const { ventana = VENTANA_RECIENTE, minimoBase = MINIMO_BASE } = opciones;

  // Sin suficiente histórico no hay nada que comparar, y adivinar es peor que
  // callarse.
  if (tramos.length < minimoBase + ventana) return [];

  const unidad = tramos[tramos.length - 1]!.unidad;
  const recientes = tramos.slice(-ventana);
  const base = tramos.slice(0, -ventana);

  const consumoBase = mediana(base.map((t) => t.consumo));
  const consumoReciente = mediana(recientes.map((t) => t.consumo));
  if (consumoBase === null || consumoReciente === null || consumoBase <= 0) return [];

  const anomalias: Anomalia[] = [];
  const incremento = (consumoReciente - consumoBase) / consumoBase;

  /*
   * Subida sostenida: además de que la mediana reciente suba, se exige que
   * TODOS los tramos de la ventana estén por encima de la referencia. Con dos
   * de tres bastaría para que un viaje largo por montaña disparase el aviso.
   */
  const todosPorEncima = recientes.every((t) => t.consumo > consumoBase);

  if (incremento >= UMBRAL_AVISO && todosPorEncima) {
    const grave = incremento >= UMBRAL_ALERTA;
    anomalias.push({
      tipo: 'subida_sostenida',
      gravedad: grave ? 'alerta' : 'aviso',
      unidad,
      consumoBase,
      consumoReciente,
      incremento,
      desde: recientes[0]!.fecha,
      mensaje: grave
        ? `Los últimos ${ventana} repostajes van un ${porcentaje(incremento)} por encima de ` +
          `lo habitual (${formatearConsumo(consumoReciente, unidad)} frente a ` +
          `${formatearConsumo(consumoBase, unidad)}). Merece una revisión: presión de ` +
          'neumáticos, filtro de aire o frenos que rozan.'
        : `Los últimos ${ventana} repostajes van un ${porcentaje(incremento)} por encima de ` +
          `lo habitual (${formatearConsumo(consumoReciente, unidad)} frente a ` +
          `${formatearConsumo(consumoBase, unidad)}). Puede ser la carretera o el frío; ` +
          'si sigue así, mira la presión de los neumáticos.',
    });
  }

  // Un tramo suelto muy por encima: casi siempre es un dato mal anotado, no
  // una avería, y conviene decirlo así.
  const ultimo = tramos[tramos.length - 1]!;
  const desviacionUltimo = (ultimo.consumo - consumoBase) / consumoBase;

  if (desviacionUltimo >= UMBRAL_ATIPICO && anomalias.length === 0) {
    anomalias.push({
      tipo: 'tramo_atipico',
      gravedad: 'aviso',
      unidad,
      consumoBase,
      consumoReciente: ultimo.consumo,
      incremento: desviacionUltimo,
      desde: ultimo.fecha,
      mensaje:
        `El último tramo marca ${formatearConsumo(ultimo.consumo, unidad)}, un ` +
        `${porcentaje(desviacionUltimo)} por encima de lo normal. Un tramo suelto suele ser ` +
        'un repostaje mal anotado o un depósito que no llegó a llenarse.',
    });
  }

  return anomalias;
}

// ---------------------------------------------------------------------------
// Comparativa entre vehículos
// ---------------------------------------------------------------------------

export interface FilaComparativa {
  vehiculoId: string;
  alias: string;
  unidad: UnidadEnergia;
  /** `null` cuando falta el dato: nunca cero, que significaría otra cosa. */
  consumoMedio: number | null;
  centimosPorKm: number | null;
  kmAlAnio: number;
  gastoAnualCentimos: number | null;
}

/**
 * Ordena la comparativa por coste por kilómetro.
 *
 * Los vehículos sin datos van al final en vez de encabezar la lista con un
 * cero: un coche del que no sabes nada no es el más barato.
 */
export function ordenarComparativa(filas: readonly FilaComparativa[]): FilaComparativa[] {
  return [...filas].sort((a, b) => {
    if (a.centimosPorKm === null && b.centimosPorKm === null) return 0;
    if (a.centimosPorKm === null) return 1;
    if (b.centimosPorKm === null) return -1;
    return a.centimosPorKm - b.centimosPorKm;
  });
}
