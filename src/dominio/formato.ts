import type { UnidadEnergia } from './tipos.ts';

/**
 * Formato numérico español: coma decimal, punto de millares.
 * Todo lo que se enseña al usuario pasa por aquí.
 */

function formateador(min: number, max: number): Intl.NumberFormat {
  return new Intl.NumberFormat('es-ES', {
    minimumFractionDigits: min,
    maximumFractionDigits: max,
  });
}

const ENTERO = formateador(0, 0);
const UN_DECIMAL = formateador(1, 1);
const DOS_DECIMALES = formateador(2, 2);
const TRES_DECIMALES = formateador(0, 3);

export function formatearNumero(valor: number, decimales = 0): string {
  return formateador(decimales, decimales).format(valor);
}

/** '124.500 km' */
export function formatearKm(km: number): string {
  return `${ENTERO.format(Math.round(km))} km`;
}

/** '124.500' sin unidad, para tablas donde la cabecera ya la indica. */
export function formatearKmSinUnidad(km: number): string {
  return ENTERO.format(Math.round(km));
}

/** '42,35 l' o '38,2 kWh' */
export function formatearCantidad(cantidad: number, unidad: UnidadEnergia): string {
  return `${TRES_DECIMALES.format(cantidad)} ${unidad}`;
}

/** '6,4 l/100 km' o '17,8 kWh/100 km' */
export function formatearConsumo(consumo: number, unidad: UnidadEnergia): string {
  return `${UN_DECIMAL.format(consumo)} ${unidad}/100 km`;
}

/**
 * '1,589 €/l'. El precio del carburante lleva tres decimales en España
 * y redondearlo a dos falsea el importe del repostaje.
 */
export function formatearPrecioUnitario(euros: number, unidad: UnidadEnergia): string {
  return `${TRES_DECIMALES.format(euros)} €/${unidad}`;
}

/** '0,18 €/km' */
export function formatearCostePorKm(euros: number): string {
  return `${DOS_DECIMALES.format(euros)} €/km`;
}

/**
 * '340 kB' / '1,2 MB' / '2,8 GB'.
 *
 * Llega hasta gigas porque la cuota de almacenamiento del navegador se mide
 * en ellos, y «2861,9 MB» se lee bastante peor que «2,8 GB».
 */
export function formatearBytes(bytes: number): string {
  const kilo = 1024;
  if (bytes < kilo) return `${bytes} B`;
  if (bytes < kilo ** 2) return `${UN_DECIMAL.format(bytes / kilo)} kB`;
  if (bytes < kilo ** 3) return `${UN_DECIMAL.format(bytes / kilo ** 2)} MB`;
  return `${UN_DECIMAL.format(bytes / kilo ** 3)} GB`;
}

/** Une con comas y una 'y' final: 'aceite, filtro y bujías'. */
export function unirEnEspanol(partes: readonly string[]): string {
  if (partes.length === 0) return '';
  if (partes.length === 1) return partes[0] ?? '';
  return `${partes.slice(0, -1).join(', ')} y ${partes[partes.length - 1]}`;
}

/**
 * Título de un servicio a partir de los nombres de sus alertas: «Cambio de
 * aceite y filtros», no «… y Filtros». Las siglas («ITV») se quedan como están.
 */
export function tituloDeServicio(nombres: readonly string[]): string {
  return unirEnEspanol(
    nombres.map((n, i) => {
      if (i === 0 || n.length < 2 || n[1] !== n[1]!.toLowerCase()) return n;
      return n[0]!.toLowerCase() + n.slice(1);
    }),
  );
}

// ---------------------------------------------------------------------------
// Lectura de lo que teclea el usuario
// ---------------------------------------------------------------------------

/** Espacios que mete Intl al formatear: duro (U+00A0) y fino (U+202F). */
const BASURA = /[€\s  ]/g;

/**
 * Interpreta un número tecleado por el usuario, admitiendo coma o punto
 * decimal y separador de millares español.
 *
 * La ambigüedad de verdad es '17.900': ¿diecisiete mil novecientos, o 17 con
 * 900 milésimas? Mirando solo el texto no hay forma de saberlo, así que lo
 * decide el campo. `decimalesMaximos` es cuántos decimales tienen sentido en
 * ese dato; si detrás del separador hay más dígitos de los que caben, es que
 * el separador era de millares.
 *
 *   parsearDecimal('17.900')       → 17900    (importe, 2 decimales)
 *   parsearDecimal('1,589', 3)     → 1,589    (precio por litro)
 *   parsearDecimal('125.380', 0)   → 125380   (kilómetros)
 *
 * Sin ese parámetro, un precio de 1,589 €/l se leería como 1,589 mil euros,
 * que es justo el tipo de error silencioso que arruina el coste por kilómetro.
 *
 * Devuelve `null` si no hay ningún número reconocible.
 */
export function parsearDecimal(texto: string, decimalesMaximos = 2): number | null {
  const limpio = texto.trim().replace(BASURA, '');
  if (limpio === '' || !/\d/.test(limpio)) return null;

  const tieneComa = limpio.includes(',');
  const tienePunto = limpio.includes('.');

  let normalizado: string;

  if (tieneComa && tienePunto) {
    // Con los dos presentes, el último que aparece es el decimal:
    // '1.234,56' → coma decimal;  '1,234.56' → punto decimal.
    normalizado =
      limpio.lastIndexOf(',') > limpio.lastIndexOf('.')
        ? limpio.replace(/\./g, '').replace(',', '.')
        : limpio.replace(/,/g, '');
  } else if (tieneComa || tienePunto) {
    const partes = limpio.split(tieneComa ? ',' : '.');
    const ultima = partes.at(-1) ?? '';
    // Varios separadores ('1.234.567') o un grupo más largo de lo que admite
    // el campo: separador de millares.
    const esMillares = partes.length > 2 || ultima.length > decimalesMaximos;
    normalizado = esMillares ? partes.join('') : `${partes.slice(0, -1).join('')}.${ultima}`;
  } else {
    normalizado = limpio;
  }

  const valor = Number(normalizado);
  return Number.isFinite(valor) ? valor : null;
}

/** Kilómetros: enteros, así que cualquier separador es de millares. */
export function parsearKm(texto: string): number | null {
  const valor = parsearDecimal(texto, 0);
  return valor === null ? null : Math.round(valor);
}

/** Litros o kWh: hasta tres decimales (los surtidores dan dos o tres). */
export function parsearCantidad(texto: string): number | null {
  return parsearDecimal(texto, 3);
}

/** Precio por litro o por kWh: tres decimales. */
export function parsearPrecioUnitario(texto: string): number | null {
  return parsearDecimal(texto, 3);
}
