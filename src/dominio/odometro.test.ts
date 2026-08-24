import { describe, expect, it } from 'vitest';
import { esEstimacion, estimarKm, kmAnuales, kmEnFecha, ritmoDiario } from './odometro.ts';
import type { PuntoOdometro } from './tipos.ts';

/** Constructor breve de puntos, para que los tests se lean de un vistazo. */
function p(fecha: string, km: number, refId = fecha): PuntoOdometro {
  return { fecha, km, origen: 'manual', refId };
}

describe('ritmoDiario', () => {
  it('mide el avance por día entre la primera y la última lectura', () => {
    const puntos = [p('2026-01-01', 10000), p('2026-01-11', 10500)];
    expect(ritmoDiario(puntos)).toBe(50);
  });

  it('devuelve 0 cuando no hay con qué medir', () => {
    expect(ritmoDiario([])).toBe(0);
    expect(ritmoDiario([p('2026-01-01', 10000)])).toBe(0);
    // Dos lecturas el mismo día: no hay intervalo de tiempo.
    expect(ritmoDiario([p('2026-01-01', 10000), p('2026-01-01', 10100)])).toBe(0);
  });

  it('nunca devuelve un ritmo negativo', () => {
    // Un odómetro que retrocede es un error de captura, no una predicción de
    // que el coche vaya a desandar camino.
    const puntos = [p('2026-01-01', 20000), p('2026-06-01', 19000)];
    expect(ritmoDiario(puntos)).toBe(0);
  });

  it('se fija solo en el último año, porque el uso cambia', () => {
    const puntos = [
      // Época de 30.000 km al año.
      p('2023-01-01', 0),
      p('2024-01-01', 30000),
      // Desde entonces, 6.000 al año.
      p('2025-01-01', 36000),
      p('2026-01-01', 42000),
    ];
    // Con todo el histórico saldrían ~14.000 km/año; con la ventana, 6.000.
    expect(Math.round(ritmoDiario(puntos) * 365)).toBe(6000);
  });

  it('recurre al histórico completo si en el último año solo hay una lectura', () => {
    const puntos = [p('2023-01-01', 0), p('2026-01-01', 30000)];
    expect(ritmoDiario(puntos, { ventanaDias: 365 })).toBeGreaterThan(0);
  });
});

describe('kmAnuales', () => {
  it('proyecta el ritmo reciente a un año', () => {
    const puntos = [p('2025-08-24', 100000), p('2026-08-24', 115000)];
    expect(kmAnuales(puntos)).toBe(15000);
  });
});

describe('kmEnFecha', () => {
  const puntos = [p('2026-01-01', 10000), p('2026-01-11', 11000), p('2026-01-21', 12000)];

  it('devuelve el valor exacto en las fechas conocidas', () => {
    expect(kmEnFecha(puntos, '2026-01-11')).toBe(11000);
  });

  it('interpola entre dos lecturas', () => {
    expect(kmEnFecha(puntos, '2026-01-06')).toBe(10500);
  });

  it('extrapola hacia delante y hacia atrás con el ritmo medio', () => {
    expect(kmEnFecha(puntos, '2026-01-31')).toBe(13000);
    expect(kmEnFecha(puntos, '2025-12-22')).toBe(9000);
  });

  it('no baja de cero al extrapolar hacia atrás', () => {
    expect(kmEnFecha(puntos, '2000-01-01')).toBe(0);
  });

  it('devuelve null sin datos', () => {
    expect(kmEnFecha([], '2026-01-01')).toBeNull();
  });
});

describe('estimarKm', () => {
  const activo = { estado: 'activo' } as const;

  it('extrapola desde la última lectura con el ritmo reciente', () => {
    const puntos = [p('2026-01-01', 10000), p('2026-07-01', 17000)];
    const estimacion = estimarKm(puntos, activo, '2026-07-31');

    // 7.000 km en 181 días ≈ 38,67 km/día; 30 días más ≈ 1.160 km.
    expect(estimacion.km).toBeGreaterThan(18000);
    expect(estimacion.km).toBeLessThan(18300);
    expect(estimacion.diasDesdeLectura).toBe(30);
  });

  it('devuelve la lectura tal cual el mismo día', () => {
    const puntos = [p('2026-01-01', 10000), p('2026-08-24', 20000)];
    const estimacion = estimarKm(puntos, activo, '2026-08-24');

    expect(estimacion.km).toBe(20000);
    expect(estimacion.confianza).toBe('exacta');
  });

  it('nunca estima por debajo de la última lectura real', () => {
    // Serie con el odómetro retrocediendo: el ritmo sale 0 y la estimación
    // se queda clavada en la última lectura en vez de restar kilómetros.
    const puntos = [p('2026-01-01', 20000), p('2026-06-01', 19000)];
    const estimacion = estimarKm(puntos, activo, '2026-12-01');
    expect(estimacion.km).toBe(19000);
  });

  it('gradúa la confianza según lo vieja que sea la lectura', () => {
    const puntos = [p('2025-08-24', 10000), p('2026-01-01', 15000)];

    expect(estimarKm(puntos, activo, '2026-01-01').confianza).toBe('exacta');
    expect(estimarKm(puntos, activo, '2026-01-20').confianza).toBe('alta');
    expect(estimarKm(puntos, activo, '2026-03-15').confianza).toBe('media');
    expect(estimarKm(puntos, activo, '2026-08-24').confianza).toBe('baja');
  });

  it('no resta kilómetros si la última lectura tiene fecha futura', () => {
    const puntos = [p('2026-01-01', 10000), p('2026-12-31', 20000)];
    const estimacion = estimarKm(puntos, activo, '2026-08-24');

    expect(estimacion.km).toBe(20000);
    expect(estimacion.diasDesdeLectura).toBe(0);
  });

  it('sin lecturas lo dice, en lugar de inventarse un cero creíble', () => {
    const estimacion = estimarKm([], activo, '2026-08-24');
    expect(estimacion.confianza).toBe('sin_datos');
    expect(estimacion.km).toBe(0);
    expect(estimacion.ultimaLectura).toBeNull();
  });

  it('congela un vehículo vendido en los kilómetros de la entrega', () => {
    const puntos = [p('2024-01-01', 190000), p('2024-12-24', 198400)];
    const estimacion = estimarKm(
      puntos,
      { estado: 'vendido', fechaVenta: '2024-12-24', kmVenta: 198400 },
      '2026-08-24',
    );

    // Han pasado casi dos años, pero ya no es tuyo: no suma un kilómetro.
    expect(estimacion.km).toBe(198400);
    expect(estimacion.confianza).toBe('exacta');
    expect(estimacion.kmPorDia).toBe(0);
  });

  it('un vendido sin kmVenta cae en su última lectura', () => {
    const puntos = [p('2024-01-01', 190000), p('2024-12-24', 198000)];
    const estimacion = estimarKm(puntos, { estado: 'vendido' }, '2026-08-24');
    expect(estimacion.km).toBe(198000);
  });
});

describe('esEstimacion', () => {
  const activo = { estado: 'activo' } as const;

  it('es falso cuando la cifra coincide con la última lectura', () => {
    // Un vehículo recién dado de alta: una sola lectura, ritmo cero. La cifra
    // es exacta, y marcarla como estimada haría dudar de un dato correcto.
    const puntos = [p('2021-06-15', 12000)];
    expect(esEstimacion(estimarKm(puntos, activo, '2026-08-24'))).toBe(false);
  });

  it('es verdadero cuando se han extrapolado kilómetros', () => {
    const puntos = [p('2026-01-01', 10000), p('2026-07-01', 17000)];
    expect(esEstimacion(estimarKm(puntos, activo, '2026-07-31'))).toBe(true);
  });

  it('es falso el mismo día de la lectura', () => {
    const puntos = [p('2026-01-01', 10000), p('2026-08-24', 20000)];
    expect(esEstimacion(estimarKm(puntos, activo, '2026-08-24'))).toBe(false);
  });

  it('es falso sin datos y en un vehículo vendido', () => {
    expect(esEstimacion(estimarKm([], activo, '2026-08-24'))).toBe(false);
    const vendido = estimarKm(
      [p('2024-01-01', 190000)],
      { estado: 'vendido', kmVenta: 198400 },
      '2026-08-24',
    );
    expect(esEstimacion(vendido)).toBe(false);
  });
});
