import { parsearDecimal } from './formato.ts';
import type { Centimos } from './tipos.ts';

const FORMATO_EUROS = new Intl.NumberFormat('es-ES', {
  style: 'currency',
  currency: 'EUR',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const FORMATO_EUROS_COMPACTO = new Intl.NumberFormat('es-ES', {
  style: 'currency',
  currency: 'EUR',
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

/**
 * Euros → céntimos enteros.
 *
 * El `toPrecision(12)` intermedio no es adorno. `1.005 * 100` da
 * 100.49999999999999 en IEEE-754, y `Math.round` de eso son 100 céntimos en
 * lugar de 101. Recortar a 12 cifras significativas borra la basura binaria
 * sin tocar ningún importe real (12 cifras son más de 9.000 millones de euros
 * con dos decimales).
 *
 * El redondeo es simétrico respecto al cero —0,5 se aleja del cero en ambos
 * sentidos— para que `aCentimos(-x) === -aCentimos(x)`. `Math.round` de JS no
 * cumple eso: redondea siempre hacia +∞, y `-100.5` se convertiría en `-100`.
 */
export function aCentimos(euros: number): Centimos {
  if (!Number.isFinite(euros)) return 0;
  const escalado = Number((euros * 100).toPrecision(12));
  return Math.sign(escalado) * Math.round(Math.abs(escalado));
}

export function aEuros(centimos: Centimos): number {
  return centimos / 100;
}

export function formatearEuros(centimos: Centimos): string {
  return FORMATO_EUROS.format(aEuros(centimos));
}

/** Sin decimales. Para cifras grandes de resumen (coste total de propiedad). */
export function formatearEurosCompacto(centimos: Centimos): string {
  return FORMATO_EUROS_COMPACTO.format(aEuros(centimos));
}

/**
 * Interpreta lo que el usuario teclea en un campo de importe.
 * Un importe en euros tiene dos decimales, así que '17.900' son diecisiete
 * mil novecientos euros y no diecisiete con novecientas milésimas.
 */
export function parsearImporte(texto: string): Centimos | null {
  const euros = parsearDecimal(texto, 2);
  return euros === null ? null : aCentimos(euros);
}

/**
 * Reparte `centimos` entre `partes` sin perder ni inventar un céntimo.
 * Los céntimos sobrantes se asignan a las primeras partes.
 */
export function repartirCentimos(centimos: Centimos, partes: number): Centimos[] {
  if (partes <= 0) return [];
  const base = Math.trunc(centimos / partes);
  const resto = centimos - base * partes;
  return Array.from(
    { length: partes },
    (_, i) => base + (i < Math.abs(resto) ? Math.sign(resto) : 0),
  );
}
