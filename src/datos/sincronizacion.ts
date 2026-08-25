import { cliente } from './supabaseClient.ts';
import { db } from './db.ts';
import {
  ajustesDesdeFila,
  documentoDesdeFila,
  filaDesdeAjustes,
  filaDesdeDocumento,
  filaDesdeRegistro,
  registroDesdeFila,
} from './mapeoSincronizacion.ts';
import { compararInstantes, planificarSincronizacion } from '@/dominio/sincronizacionMerge.ts';
import { ahoraISO } from '@/dominio/fechas.ts';
import { ID_AJUSTES } from '@/dominio/tipos.ts';
import type {
  Adjunto,
  EntidadBase,
  Gasto,
  LecturaOdometro,
  Mantenimiento,
  Repostaje,
  ReglaMantenimiento,
  Vehiculo,
} from '@/dominio/tipos.ts';

/**
 * Motor de sincronización con Supabase.
 *
 * ES SINCRONIZACIÓN DE ESTADO COMPLETO, no incremental: cada ronda lee la
 * tabla entera a los dos lados y decide qué mover con
 * `planificarSincronizacion` (que compara por `actualizadoEn`, registro a
 * registro). A la escala de un uso personal —decenas o cientos de filas, no
 * miles— es más barato hacer esto que llevar la cuenta de qué cambió desde la
 * última vez, y mucho más simple de que no se desincronice esa cuenta si algo
 * falla a mitad de una sincronización.
 *
 * Si `cliente` es `null` (no hay Supabase configurado) o no hay sesión
 * iniciada, todo esto no hace nada: la sincronización es un añadido opcional,
 * la app entera sigue funcionando solo con IndexedDB.
 */

export interface ResultadoTabla {
  empujados: number;
  aplicados: number;
}

export interface ResultadoSincronizacion {
  ok: boolean;
  error?: string;
  detalle?: Record<string, ResultadoTabla>;
}

const CLAVE_ULTIMA = 'mi-garaje:ultima-sincronizacion';

/**
 * Cuándo sincronizó ESTE dispositivo por última vez. Vive en `localStorage` y
 * no en los ajustes sincronizados: es información de un dispositivo concreto,
 * no un dato del usuario que tenga sentido llevar al servidor.
 */
export function ultimaSincronizacionLocal(): string | null {
  try {
    return localStorage.getItem(CLAVE_ULTIMA);
  } catch {
    return null;
  }
}

function marcarSincronizado(): void {
  try {
    localStorage.setItem(CLAVE_ULTIMA, ahoraISO());
  } catch {
    /* sin almacenamiento no hay nada que anotar */
  }
}

// ---------------------------------------------------------------------------
// Tablas de forma sencilla: mismas columnas a los dos lados
// ---------------------------------------------------------------------------

type TablaGenerica = 'vehiculos' | 'lecturas' | 'mantenimientos' | 'reglas' | 'repostajes' | 'gastos';

async function sincronizarTablaGenerica<T extends EntidadBase>(
  tabla: TablaGenerica,
  propietarioId: string,
): Promise<ResultadoTabla> {
  if (!cliente) return { empujados: 0, aplicados: 0 };

  const locales = (await db.table(tabla).toArray()) as T[];

  const { data, error } = await cliente.from(tabla).select('*');
  if (error) throw new Error(`No se pudo leer «${tabla}»: ${error.message}`);
  const remotos = (data ?? []).map((fila) => registroDesdeFila<T>(fila));

  const plan = planificarSincronizacion(locales, remotos);

  for (const registro of plan.aAplicarLocal) {
    /*
     * Un tombstone recibido se GUARDA, no se borra.
     *
     * Borrar la fila local dejaría a los dos lados en desacuerdo permanente:
     * el servidor tiene el tombstone, el dispositivo no tiene nada, y en cada
     * sincronización volvería a «recibir» el mismo borrado, para siempre.
     * Guardándolo, la siguiente ronda ve las dos copias iguales y converge.
     *
     * Para la interfaz no cambia nada: todas las lecturas filtran los
     * borrados (ver `sinBorrados` en repositorioDexie).
     */
    await db.table(tabla).put(registro);
  }

  if (plan.aEmpujar.length > 0) {
    const filas = plan.aEmpujar.map((r) =>
      filaDesdeRegistro(r as unknown as Record<string, unknown>, propietarioId),
    );
    const { error: errorPush } = await cliente.from(tabla).upsert(filas, { onConflict: 'id' });
    if (errorPush) throw new Error(`No se pudo escribir en «${tabla}»: ${errorPush.message}`);
  }

  return { empujados: plan.aEmpujar.length, aplicados: plan.aAplicarLocal.length };
}

// ---------------------------------------------------------------------------
// Documentos: columnas comunes + `detalle` según la variante
// ---------------------------------------------------------------------------

async function sincronizarDocumentos(propietarioId: string): Promise<ResultadoTabla> {
  if (!cliente) return { empujados: 0, aplicados: 0 };

  const locales = await db.documentos.toArray();

  const { data, error } = await cliente.from('documentos').select('*');
  if (error) throw new Error(`No se pudieron leer los documentos: ${error.message}`);
  const remotos = (data ?? []).map((fila) => documentoDesdeFila(fila));

  const plan = planificarSincronizacion(locales, remotos);

  // El tombstone se guarda, no se borra: ver la nota en
  // `sincronizarTablaGenerica`.
  for (const registro of plan.aAplicarLocal) {
    await db.documentos.put(registro);
  }

  if (plan.aEmpujar.length > 0) {
    const filas = plan.aEmpujar.map((r) => filaDesdeDocumento(r, propietarioId));
    const { error: errorPush } = await cliente.from('documentos').upsert(filas, { onConflict: 'id' });
    if (errorPush) throw new Error(`No se pudieron escribir los documentos: ${errorPush.message}`);
  }

  return { empujados: plan.aEmpujar.length, aplicados: plan.aAplicarLocal.length };
}

// ---------------------------------------------------------------------------
// Ajustes: una sola fila por usuario, sin tombstones
// ---------------------------------------------------------------------------

async function sincronizarAjustes(propietarioId: string): Promise<ResultadoTabla> {
  if (!cliente) return { empujados: 0, aplicados: 0 };

  const local = await db.ajustes.get(ID_AJUSTES);
  const { data, error } = await cliente.from('ajustes').select('*').maybeSingle();
  if (error) throw new Error(`No se pudieron leer los ajustes: ${error.message}`);

  if (!local && !data) return { empujados: 0, aplicados: 0 };

  if (local && !data) {
    const { error: errorPush } = await cliente.from('ajustes').upsert(filaDesdeAjustes(local, propietarioId));
    if (errorPush) throw new Error(`No se pudieron escribir los ajustes: ${errorPush.message}`);
    return { empujados: 1, aplicados: 0 };
  }

  if (!local && data) {
    await db.ajustes.put(ajustesDesdeFila(data, ID_AJUSTES, ahoraISO()));
    return { empujados: 0, aplicados: 1 };
  }

  /*
   * Los dos existen: gana el más reciente por INSTANTE, no por texto (ver
   * `compararInstantes`). En empate no se hace nada; con `>=` los ajustes se
   * re-subían en cada sincronización y el contador nunca llegaba a cero.
   */
  const actualizadoRemoto = data!.actualizado_en as string;
  const diferencia = compararInstantes(local!.actualizadoEn, actualizadoRemoto);
  if (diferencia === 0) return { empujados: 0, aplicados: 0 };
  if (diferencia > 0) {
    const { error: errorPush } = await cliente
      .from('ajustes')
      .upsert(filaDesdeAjustes(local!, propietarioId));
    if (errorPush) throw new Error(`No se pudieron escribir los ajustes: ${errorPush.message}`);
    return { empujados: 1, aplicados: 0 };
  }
  await db.ajustes.put(ajustesDesdeFila(data!, ID_AJUSTES, local!.creadoEn));
  return { empujados: 0, aplicados: 1 };
}

// ---------------------------------------------------------------------------
// Adjuntos: metadatos por fila + contenido en Storage
// ---------------------------------------------------------------------------

type MetaAdjunto = Omit<Adjunto, 'datos'>;

function despojarDatos(adjunto: Adjunto): MetaAdjunto {
  const { datos: _datos, ...meta } = adjunto;
  return meta;
}

async function sincronizarAdjuntos(propietarioId: string): Promise<ResultadoTabla> {
  if (!cliente) return { empujados: 0, aplicados: 0 };

  const locales = await db.adjuntos.toArray();
  const localesPorId = new Map(locales.map((a) => [a.id, a]));

  const { data, error } = await cliente.from('adjuntos').select('*');
  if (error) throw new Error(`No se pudieron leer los adjuntos: ${error.message}`);
  const remotos = (data ?? []).map((fila) => registroDesdeFila<MetaAdjunto>(fila));

  // La comparación es solo de metadatos: el contenido no hace falta para
  // decidir quién gana, y comparar Blobs sería absurdo. Si el archivo cambia,
  // `actualizadoEn` cambia con él.
  const plan = planificarSincronizacion(locales.map(despojarDatos), remotos);

  let aplicados = 0;
  for (const meta of plan.aAplicarLocal) {
    if (meta.borradoEn) {
      /*
       * Tombstone: se conserva la fila para que la sincronización converja,
       * pero se tira el Blob, que es lo que ocupa. Un adjunto borrado no
       * tiene por qué seguir gastando megabytes en el dispositivo.
       */
      await db.adjuntos.put({ ...meta, datos: new Blob([]) });
      aplicados += 1;
      continue;
    }
    const { data: blob, error: errorDescarga } = await cliente.storage
      .from('adjuntos')
      .download(`${propietarioId}/${meta.id}`);
    // Si la descarga falla (por ejemplo, sin conexión a mitad de sincronizar),
    // se deja para la siguiente ronda en lugar de romper toda la operación.
    if (errorDescarga || !blob) continue;
    await db.adjuntos.put({ ...meta, datos: blob });
    aplicados += 1;
  }

  let empujados = 0;
  for (const meta of plan.aEmpujar) {
    const local = localesPorId.get(meta.id);
    if (!local) continue;

    const fila = filaDesdeRegistro(local as unknown as Record<string, unknown>, propietarioId, [
      'datos',
    ]);
    const { error: errorFila } = await cliente.from('adjuntos').upsert(fila, { onConflict: 'id' });
    if (errorFila) throw new Error(`No se pudo escribir el adjunto: ${errorFila.message}`);

    if (!local.borradoEn) {
      const { error: errorSubida } = await cliente.storage
        .from('adjuntos')
        .upload(`${propietarioId}/${local.id}`, local.datos, {
          upsert: true,
          contentType: local.mime,
        });
      if (errorSubida) throw new Error(`No se pudo subir la foto: ${errorSubida.message}`);
    }
    empujados += 1;
  }

  return { empujados, aplicados };
}

// ---------------------------------------------------------------------------
// Orquestación
// ---------------------------------------------------------------------------

export async function sincronizarTodo(): Promise<ResultadoSincronizacion> {
  if (!cliente) return { ok: false, error: 'La sincronización no está configurada.' };

  const {
    data: { user },
  } = await cliente.auth.getUser();
  if (!user) return { ok: false, error: 'No has iniciado sesión.' };

  try {
    const detalle: Record<string, ResultadoTabla> = {
      vehiculos: await sincronizarTablaGenerica<Vehiculo>('vehiculos', user.id),
      lecturas: await sincronizarTablaGenerica<LecturaOdometro>('lecturas', user.id),
      mantenimientos: await sincronizarTablaGenerica<Mantenimiento>('mantenimientos', user.id),
      reglas: await sincronizarTablaGenerica<ReglaMantenimiento>('reglas', user.id),
      repostajes: await sincronizarTablaGenerica<Repostaje>('repostajes', user.id),
      gastos: await sincronizarTablaGenerica<Gasto>('gastos', user.id),
      documentos: await sincronizarDocumentos(user.id),
      adjuntos: await sincronizarAdjuntos(user.id),
      ajustes: await sincronizarAjustes(user.id),
    };

    marcarSincronizado();
    return { ok: true, detalle };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Fallo desconocido.' };
  }
}

// ---------------------------------------------------------------------------
// Disparo en segundo plano
// ---------------------------------------------------------------------------

let temporizador: ReturnType<typeof setTimeout> | null = null;

/**
 * Sincroniza poco después de una escritura local, sin bloquear la interfaz.
 *
 * Espera un momento de calma —no dispara en cada tecla— y se traga los
 * errores: un fallo de red no puede interrumpir el uso normal de la app, que
 * sigue funcionando en local pase lo que pase. El botón «Sincronizar ahora»
 * de Ajustes es el que sí informa si algo falla.
 */
export function programarSincronizacion(): void {
  if (!cliente) return;
  if (temporizador) clearTimeout(temporizador);
  temporizador = setTimeout(() => {
    temporizador = null;
    void sincronizarTodo();
  }, 1500);
}
