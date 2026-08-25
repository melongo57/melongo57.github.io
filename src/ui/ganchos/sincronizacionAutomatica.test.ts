import { describe, expect, it } from 'vitest';
import {
  MARGEN_ENTRE_SINCRONIZACIONES_MS,
  tocaSincronizar,
} from './sincronizacionAutomatica.ts';

describe('tocaSincronizar', () => {
  it('la primera vez siempre toca', () => {
    // Abrir la app con sesión iniciada tiene que bajar lo que haya en el
    // servidor sin esperar a nada.
    expect(tocaSincronizar(null, 0)).toBe(true);
  });

  it('no repite mientras no haya pasado el margen', () => {
    // Alternar entre dos apps en el móvil no puede disparar una sincronización
    // completa por cada vistazo.
    expect(tocaSincronizar(1_000, 1_000 + MARGEN_ENTRE_SINCRONIZACIONES_MS - 1)).toBe(false);
  });

  it('vuelve a tocar en cuanto se cumple el margen', () => {
    expect(tocaSincronizar(1_000, 1_000 + MARGEN_ENTRE_SINCRONIZACIONES_MS)).toBe(true);
  });

  it('con el margen justo cumplido sincroniza, no se queda esperando', () => {
    /*
     * El límite se comprueba con `>=` y no con `>` a propósito: si dos eventos
     * cayeran en el mismo milisegundo que el vencimiento del margen, un `>`
     * dejaría el dispositivo sin sincronizar hasta el siguiente evento, que
     * puede no llegar nunca.
     */
    expect(tocaSincronizar(0, MARGEN_ENTRE_SINCRONIZACIONES_MS, MARGEN_ENTRE_SINCRONIZACIONES_MS))
      .toBe(true);
  });

  it('un reloj que retrocede no bloquea la sincronización', () => {
    /*
     * El reloj del sistema puede saltar hacia atrás (cambio de hora, ajuste
     * por NTP). Con la resta a secas eso da un número negativo, que es menor
     * que cualquier margen, así que la comparación concluiría «no toca» y el
     * dispositivo se quedaría sin sincronizar hasta el siguiente inicio de
     * sesión. Un salto hacia atrás no es una sincronización reciente.
     */
    expect(tocaSincronizar(10_000, 0)).toBe(true);
  });
});
