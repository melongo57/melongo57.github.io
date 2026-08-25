/**
 * Fusión de registros entre el dispositivo local y el servidor.
 *
 * Es lógica pura y sin red a propósito: la parte que decide «quién gana»
 * tiene que poder probarse con datos de mentira, no con un proyecto de
 * Supabase de verdad.
 *
 * LA REGLA ES «GANA EL MÁS RECIENTE POR `actualizadoEn`», por vehículo y por
 * registro, no por dispositivo entero. Es lo que corresponde a un uso
 * personal alternando dispositivos (móvil en la gasolinera, escritorio para
 * mirar gráficas): no hay dos personas editando el mismo repostaje a la vez,
 * así que no hace falta nada más sofisticado que un timestamp por fila. Un
 * CRDT completo resolvería un problema que este uso no tiene.
 *
 * EL BORRADO ES LÓGICO (`borradoEn`), nunca físico, en las dos direcciones.
 * Si un dispositivo borrara la fila de verdad, no quedaría ningún rastro que
 * decir «esto se borró tal día», y el otro dispositivo no tendría forma de
 * saber que tiene que borrarlo también: lo volvería a subir en la siguiente
 * sincronización y el borrado nunca se propagaría.
 */

export interface RegistroSincronizable {
  id: string;
  actualizadoEn: string;
  borradoEn?: string | null;
}

export type OrigenGanador = 'local' | 'remoto' | 'igual';

/**
 * Compara dos marcas de tiempo por el INSTANTE que representan, no como texto.
 *
 * Es imprescindible: Postgres devuelve `2026-08-25T06:49:33.157+00:00` y
 * `Date.toISOString()` produce `2026-08-25T06:49:33.157Z`. Son el mismo
 * instante, pero como cadenas no son iguales — y peor, `Z` (0x5A) ordena por
 * encima de `+` (0x2B), así que una comparación de texto daría SIEMPRE por
 * ganador al registro recién creado en local. Resultado: se re-subiría en cada
 * sincronización, para siempre, sin converger nunca.
 *
 * Devuelve <0, 0 o >0 al estilo de un comparador.
 */
export function compararInstantes(a: string, b: string): number {
  const ta = Date.parse(a);
  const tb = Date.parse(b);
  // Si alguna fecha es basura, se cae a la comparación de texto: es mejor un
  // orden arbitrario pero estable que un NaN que lo declara todo distinto.
  if (Number.isNaN(ta) || Number.isNaN(tb)) return a < b ? -1 : a > b ? 1 : 0;
  return ta - tb;
}

export interface ResultadoFusion<T> {
  origen: OrigenGanador;
  ganador: T;
}

/**
 * Decide qué copia de un mismo registro prevalece.
 *
 * Si solo existe en un sitio, gana ese (es una creación que el otro lado
 * todavía no conoce). Si existe en los dos, gana el `actualizadoEn` más
 * reciente; en empate exacto gana el remoto, para que la sincronización
 * converja en algo determinista y no oscile entre dos formas de escribir lo
 * mismo.
 */
export function fusionarRegistro<T extends RegistroSincronizable>(
  local: T | undefined,
  remoto: T | undefined,
): ResultadoFusion<T> | null {
  if (!local && !remoto) return null;
  if (local && !remoto) return { origen: 'local', ganador: local };
  if (!local && remoto) return { origen: 'remoto', ganador: remoto };

  const diferencia = compararInstantes(local!.actualizadoEn, remoto!.actualizadoEn);
  if (diferencia === 0) return { origen: 'igual', ganador: remoto! };
  return diferencia > 0
    ? { origen: 'local', ganador: local! }
    : { origen: 'remoto', ganador: remoto! };
}

export interface PlanSincronizacion<T> {
  /** Registros que el dispositivo local tiene más nuevos: hay que subirlos. */
  aEmpujar: T[];
  /** Registros que el servidor tiene más nuevos: hay que aplicarlos aquí. */
  aAplicarLocal: T[];
}

/**
 * Compara dos colecciones completas (todo lo local, todo lo remoto de esa
 * tabla) y decide qué hay que mover en cada dirección.
 *
 * Es sincronización de ESTADO COMPLETO, no un diff incremental: a la escala
 * de datos de un uso personal (decenas o cientos de filas, no miles) leer la
 * tabla entera en cada sincronización es barato, y evita tener que llevar la
 * cuenta de qué cambió desde la última vez —con el riesgo de que un fallo a
 * mitad de sincronización deje esa cuenta desincronizada— por una ganancia de
 * rendimiento que aquí no hace falta.
 */
export function planificarSincronizacion<T extends RegistroSincronizable>(
  locales: readonly T[],
  remotos: readonly T[],
): PlanSincronizacion<T> {
  const mapaLocal = new Map(locales.map((r) => [r.id, r]));
  const mapaRemoto = new Map(remotos.map((r) => [r.id, r]));
  const ids = new Set([...mapaLocal.keys(), ...mapaRemoto.keys()]);

  const aEmpujar: T[] = [];
  const aAplicarLocal: T[] = [];

  for (const id of ids) {
    const resultado = fusionarRegistro(mapaLocal.get(id), mapaRemoto.get(id));
    if (!resultado || resultado.origen === 'igual') continue;
    if (resultado.origen === 'local') aEmpujar.push(resultado.ganador);
    else aAplicarLocal.push(resultado.ganador);
  }

  return { aEmpujar, aAplicarLocal };
}
