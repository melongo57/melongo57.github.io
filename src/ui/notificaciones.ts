import { hoyISO } from '@/dominio/fechas.ts';
import type { Vencimiento } from '@/dominio/vencimientos.ts';

/**
 * Notificaciones locales del navegador.
 *
 * QUÉ PUEDE Y QUÉ NO PUEDE HACER ESTO. No existe hoy una API fiable para
 * «avísame dentro de 30 días» con la aplicación cerrada: la Notification
 * Triggers API se descartó en Chrome y nunca existió en Safari, y las push de
 * verdad requieren un servidor que las empuje.
 *
 * Así que esto avisa cuando abres la app, y nada más. Es útil —te enteras de
 * la ITV caducada nada más entrar, sin buscarla— pero no sustituye a un
 * recordatorio de verdad. Para eso está la exportación a calendario, que sí
 * te avisa con la app cerrada porque el trabajo lo hace Google Calendar.
 *
 * La interfaz tiene que decir esto con todas las letras. Prometer avisos que
 * no van a llegar es peor que no ofrecerlos.
 */

export type EstadoNotificaciones = 'no_soportado' | 'pendiente' | 'concedido' | 'denegado';

const CLAVE_AVISADOS = 'mi-garaje:avisados';

/** Como mucho tres a la vez: más es una avalancha que se descarta entera. */
const MAXIMO_POR_SESION = 3;

export function estadoNotificaciones(): EstadoNotificaciones {
  if (typeof Notification === 'undefined') return 'no_soportado';
  switch (Notification.permission) {
    case 'granted':
      return 'concedido';
    case 'denied':
      return 'denegado';
    default:
      return 'pendiente';
  }
}

export async function pedirPermiso(): Promise<EstadoNotificaciones> {
  if (typeof Notification === 'undefined') return 'no_soportado';
  try {
    await Notification.requestPermission();
  } catch {
    // Safari antiguo devuelve el permiso por callback en vez de por promesa.
  }
  return estadoNotificaciones();
}

/** Qué vencimientos se han avisado ya, y qué día. */
function leerAvisados(): Record<string, string> {
  try {
    const crudo = localStorage.getItem(CLAVE_AVISADOS);
    return crudo ? (JSON.parse(crudo) as Record<string, string>) : {};
  } catch {
    return {};
  }
}

function guardarAvisados(avisados: Record<string, string>): void {
  try {
    localStorage.setItem(CLAVE_AVISADOS, JSON.stringify(avisados));
  } catch {
    // Almacenamiento bloqueado: se avisará otra vez, que es el fallo benigno.
  }
}

/**
 * Decide de qué hay que avisar.
 *
 * Función pura y exportada para poder probarla: el resto de este módulo toca
 * APIs del navegador y no se puede comprobar sin uno.
 */
export function seleccionarAvisos(
  vencimientos: readonly Vencimiento[],
  avisados: Record<string, string>,
  hoy: string,
  maximo = MAXIMO_POR_SESION,
): Vencimiento[] {
  return vencimientos
    .filter((v) => v.semaforo === 'vencido' || v.semaforo === 'proximo')
    // Lo que no se ha registrado nunca no merece una notificación: es un hueco
    // en el histórico, no una tarea con fecha.
    .filter((v) => !(v.origen.clase === 'mantenimiento' && v.origen.sinRegistroPrevio))
    // Una vez al día como mucho. Repetir el mismo aviso cada vez que abres la
    // app es la forma más rápida de que se desactiven las notificaciones.
    .filter((v) => avisados[v.id] !== hoy)
    .sort((a, b) => a.urgencia - b.urgencia)
    .slice(0, maximo);
}

export interface ResultadoAvisos {
  mostrados: number;
  estado: EstadoNotificaciones;
}

/**
 * Muestra las notificaciones pendientes. Silenciosa si no hay permiso: pedirlo
 * sin que el usuario lo haya provocado es lo que hace que la gente bloquee las
 * notificaciones de un sitio para siempre.
 */
export async function avisarDeVencimientos(
  vencimientos: readonly Vencimiento[],
): Promise<ResultadoAvisos> {
  const estado = estadoNotificaciones();
  if (estado !== 'concedido') return { mostrados: 0, estado };

  const hoy = hoyISO();
  const avisados = leerAvisados();
  const seleccion = seleccionarAvisos(vencimientos, avisados, hoy);
  if (seleccion.length === 0) return { mostrados: 0, estado };

  for (const v of seleccion) {
    const cuerpo =
      v.semaforo === 'vencido'
        ? 'Está vencido.'
        : v.diasRestantes !== undefined
          ? `Quedan ${v.diasRestantes} días.`
          : 'Toca pronto.';

    try {
      new Notification(v.titulo, {
        body: cuerpo,
        icon: '/icons/icono-192.png',
        badge: '/icons/icono-192.png',
        // Con la misma etiqueta, un aviso repetido sustituye al anterior en
        // vez de apilarse en la bandeja.
        tag: v.id,
      });
      avisados[v.id] = hoy;
    } catch {
      // Algunos navegadores solo permiten crear notificaciones desde el
      // service worker. No es motivo para romper el arranque de la app.
    }
  }

  guardarAvisados(avisados);
  return { mostrados: seleccion.length, estado };
}

/** Olvida lo ya avisado, para poder volver a probarlo. */
export function reiniciarAvisos(): void {
  try {
    localStorage.removeItem(CLAVE_AVISADOS);
  } catch {
    /* ignorado */
  }
}
