import { useEffect, useRef } from 'react';
import type { Session } from '@supabase/supabase-js';
import { sincronizarTodo } from '@/datos/sincronizacion.ts';

/**
 * Sincronización automática, colgada de la aplicación entera.
 *
 * ANTES ESTO VIVÍA DENTRO DEL BLOQUE DE CUENTA DE AJUSTES, y ese es justo el
 * fallo que arregla: un dispositivo que abría la app y se quedaba en el panel
 * no bajaba NADA del servidor. Lo hecho en otro móvil —incluidos los
 * borrados— no llegaba hasta que alguien entraba en Ajustes, que es una
 * pantalla en la que no se entra casi nunca. Desde fuera parecía que la
 * sincronización no funcionaba, cuando en realidad no se estaba llamando.
 *
 * Lo que dispara una sincronización:
 *
 * - Abrir la app con sesión iniciada, e iniciar sesión estando dentro.
 * - Volver a la app tras dejarla en segundo plano. En un móvil esto es lo
 *   normal: la app no se cierra, se aparca. Sin este disparador, un teléfono
 *   que lleva días sin reiniciarse podría no sincronizar nunca.
 * - Recuperar la conexión. Es el momento exacto en que lo apuntado sin
 *   cobertura puede por fin subir.
 *
 * Las escrituras locales tienen su propio camino (`programarSincronizacion`,
 * con su espera de calma), así que aquí no hace falta nada.
 */

/**
 * Margen mínimo entre dos sincronizaciones automáticas seguidas.
 *
 * Sin esto, alternar entre dos apps en el móvil dispararía una sincronización
 * completa por cada vistazo. Media hora es demasiado —perderías los cambios
 * del otro dispositivo justo cuando vas a mirarlos— y un segundo convierte el
 * cambio de app en tráfico constante. Medio minuto deja el caso real (miras
 * el móvil, apuntas algo, sales) con una sola sincronización.
 */
export const MARGEN_ENTRE_SINCRONIZACIONES_MS = 30_000;

/**
 * ¿Toca sincronizar otra vez?
 *
 * Separado del gancho a propósito: es la única parte con una decisión dentro
 * y la única que se puede probar sin montar React ni un servidor.
 */
export function tocaSincronizar(
  ultimaMs: number | null,
  ahoraMs: number,
  margenMs = MARGEN_ENTRE_SINCRONIZACIONES_MS,
): boolean {
  if (ultimaMs === null) return true;
  const transcurrido = ahoraMs - ultimaMs;
  /*
   * Un reloj que retrocede (cambio de hora, ajuste por NTP) da un transcurrido
   * negativo, que es menor que cualquier margen: la comparación a secas
   * concluiría «no toca» y dejaría el dispositivo sin sincronizar hasta el
   * siguiente inicio de sesión. Un salto hacia atrás no es una sincronización
   * reciente, así que se trata como que sí toca.
   */
  if (transcurrido < 0) return true;
  // El `>=` importa: con `>` dos eventos en el mismo milisegundo en que vence
  // el margen dejarían la app esperando a un evento que puede no llegar.
  return transcurrido >= margenMs;
}

export function useSincronizacionAutomatica(sesion: Session | null | undefined): void {
  const ultimaMs = useRef<number | null>(null);

  useEffect(() => {
    if (!sesion) return undefined;

    /*
     * Al iniciar sesión se fuerza aunque acabe de haber una sincronización:
     * es un usuario distinto y el margen no viene al caso.
     */
    function sincronizar(forzar = false): void {
      const ahora = Date.now();
      if (!forzar && !tocaSincronizar(ultimaMs.current, ahora)) return;
      ultimaMs.current = ahora;
      /*
       * Sin `await` y sin enseñar el error: esto corre de fondo, y una app que
       * interrumpe para anunciar que no hay cobertura es peor que una que
       * sigue funcionando en local. El botón «Sincronizar ahora» de Ajustes es
       * el que sí informa.
       */
      void sincronizarTodo();
    }

    sincronizar(true);

    function alVolverAlFrente(): void {
      if (document.visibilityState === 'visible') sincronizar();
    }
    function alRecuperarRed(): void {
      sincronizar(true);
    }

    document.addEventListener('visibilitychange', alVolverAlFrente);
    window.addEventListener('online', alRecuperarRed);

    return () => {
      document.removeEventListener('visibilitychange', alVolverAlFrente);
      window.removeEventListener('online', alRecuperarRed);
    };
  }, [sesion?.user.id]);
}
