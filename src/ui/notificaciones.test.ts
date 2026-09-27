import { describe, expect, it } from 'vitest';
import type { Vencimiento } from '@/dominio/vencimientos.ts';
import { seleccionarAvisos } from './notificaciones.ts';

const HOY = '2026-08-24';

function v(cambios: Partial<Vencimiento> = {}): Vencimiento {
  return {
    id: 'doc:d1',
    alertaId: 'd1',
    vehiculoId: 'v1',
    titulo: 'ITV',
    icono: '🔎',
    semaforo: 'vencido',
    diasRestantes: -6,
    motivo: 'tiempo',
    urgencia: -6,
    faltaUltimaVez: false,
    ...cambios,
  };
}

describe('seleccionarAvisos', () => {
  it('avisa de lo vencido y de lo próximo', () => {
    const avisos = seleccionarAvisos(
      [v(), v({ id: 'b', semaforo: 'proximo', urgencia: 10 })],
      {},
      HOY,
    );
    expect(avisos).toHaveLength(2);
  });

  it('no avisa de lo que está al día', () => {
    expect(seleccionarAvisos([v({ semaforo: 'ok', urgencia: 200 })], {}, HOY)).toEqual([]);
  });

  it('no avisa de las alertas a las que les falta la última vez', () => {
    // Es un hueco en el histórico, no una tarea con fecha. Notificarlo sería
    // sacar el móvil del bolsillo para nada.
    const sinRegistro = v({
      id: 'alerta:r1',
      semaforo: 'proximo',
      faltaUltimaVez: true,
    });
    expect(seleccionarAvisos([sinRegistro], {}, HOY)).toEqual([]);
  });

  it('no repite el mismo aviso el mismo día', () => {
    // Repetirlo cada vez que abres la app es la forma más rápida de que las
    // notificaciones acaben bloqueadas.
    expect(seleccionarAvisos([v()], { 'doc:d1': HOY }, HOY)).toEqual([]);
  });

  it('vuelve a avisar al día siguiente', () => {
    expect(seleccionarAvisos([v()], { 'doc:d1': '2026-08-23' }, HOY)).toHaveLength(1);
  });

  it('ordena por urgencia y limita la avalancha', () => {
    const muchos = [
      v({ id: 'a', urgencia: 20, semaforo: 'proximo' }),
      v({ id: 'b', urgencia: -30 }),
      v({ id: 'c', urgencia: 5, semaforo: 'proximo' }),
      v({ id: 'd', urgencia: -1 }),
      v({ id: 'e', urgencia: 15, semaforo: 'proximo' }),
    ];

    const avisos = seleccionarAvisos(muchos, {}, HOY, 3);
    // Cinco notificaciones de golpe se descartan enteras sin leerlas.
    expect(avisos).toHaveLength(3);
    expect(avisos.map((x) => x.id)).toEqual(['b', 'd', 'c']);
  });

  it('no se rompe sin vencimientos', () => {
    expect(seleccionarAvisos([], {}, HOY)).toEqual([]);
  });
});
