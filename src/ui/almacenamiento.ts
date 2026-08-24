/**
 * Persistencia del almacenamiento del navegador.
 *
 * POR QUÉ ESTO IMPORTA: por defecto, IndexedDB es almacenamiento «best-effort».
 * Cuando al dispositivo le falta espacio, el navegador desaloja datos de los
 * sitios que considera poco usados, y lo hace SIN AVISAR. Para una app cuyos
 * datos solo viven aquí, eso es la diferencia entre una molestia y perder tres
 * años de histórico.
 *
 * `navigator.storage.persist()` marca el almacenamiento como persistente y lo
 * saca de esa limpieza automática: a partir de ahí solo se borra si el usuario
 * lo borra a mano. Chrome lo concede sin preguntar cuando el sitio está
 * instalado o tiene uso frecuente; Firefox pregunta; Safari lo ignora y aplica
 * su propia regla de siete días de inactividad.
 *
 * No sustituye a hacer copias. Las reduce a lo que deben ser: un seguro contra
 * el borrado deliberado y contra cambiar de dispositivo.
 */

export interface EstadoAlmacenamiento {
  /** El navegador no expone la API. */
  soportado: boolean;
  /** Ya está a salvo del desalojo automático. */
  persistente: boolean;
  /** Bytes ocupados, si el navegador los da. */
  usado: number | null;
  /** Cuota aproximada. Los navegadores la redondean a propósito. */
  cuota: number | null;
}

export async function estadoAlmacenamiento(): Promise<EstadoAlmacenamiento> {
  const almacen = navigator.storage;
  if (!almacen) {
    return { soportado: false, persistente: false, usado: null, cuota: null };
  }

  const persistente = (await almacen.persisted?.()) ?? false;

  let usado: number | null = null;
  let cuota: number | null = null;
  try {
    const estimacion = await almacen.estimate?.();
    usado = estimacion?.usage ?? null;
    cuota = estimacion?.quota ?? null;
  } catch {
    // `estimate` no está en todas partes. No es motivo para no informar del
    // resto.
  }

  return { soportado: typeof almacen.persist === 'function', persistente, usado, cuota };
}

/**
 * Pide que el almacenamiento sea persistente.
 *
 * Devuelve `false` si el navegador lo deniega, que es información útil y no un
 * error: significa que hay que insistir con las copias de seguridad.
 */
export async function pedirPersistencia(): Promise<boolean> {
  try {
    return (await navigator.storage?.persist?.()) ?? false;
  } catch {
    return false;
  }
}

/**
 * Pide persistencia al arrancar, en silencio.
 *
 * Chrome la concede sin diálogo cuando el sitio está instalado o se usa a
 * menudo, así que en el caso normal esto no molesta a nadie y protege los
 * datos desde el primer día. Firefox sí pregunta; si el usuario dice que no,
 * no se vuelve a insistir por nuestra cuenta: queda el botón de Ajustes.
 */
const CLAVE_INTENTADO = 'mi-garaje:persistencia-pedida';

export async function asegurarPersistencia(): Promise<void> {
  try {
    if (!navigator.storage?.persist) return;
    if (await navigator.storage.persisted()) return;
    if (localStorage.getItem(CLAVE_INTENTADO)) return;

    localStorage.setItem(CLAVE_INTENTADO, '1');
    await navigator.storage.persist();
  } catch {
    /* Sin almacenamiento no hay nada que asegurar. */
  }
}
