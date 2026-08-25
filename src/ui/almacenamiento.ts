/**
 * Estimación de espacio ocupado en el navegador.
 *
 * Esto pedía además «protección» frente al desalojo automático
 * (`navigator.storage.persist()`), pero ya no hace falta: los datos también
 * viven en Supabase, así que un desalojo del navegador ya no es la pérdida
 * total que era antes de que existiera la sincronización.
 */

export interface EstadoAlmacenamiento {
  /** Bytes ocupados, si el navegador los da. */
  usado: number | null;
  /** Cuota aproximada. Los navegadores la redondean a propósito. */
  cuota: number | null;
}

export async function estadoAlmacenamiento(): Promise<EstadoAlmacenamiento> {
  const almacen = navigator.storage;
  if (!almacen?.estimate) return { usado: null, cuota: null };
  try {
    const estimacion = await almacen.estimate();
    return { usado: estimacion.usage ?? null, cuota: estimacion.quota ?? null };
  } catch {
    // `estimate` no está en todas partes. No es motivo para no informar del resto.
    return { usado: null, cuota: null };
  }
}
