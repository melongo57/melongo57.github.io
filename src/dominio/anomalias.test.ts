import { describe, expect, it } from 'vitest';
import { detectarAnomalias, mediana, ordenarComparativa } from './anomalias.ts';
import type { TramoConsumo } from './consumo.ts';

/** Serie de tramos con los consumos indicados, uno por mes. */
function serie(consumos: readonly number[]): TramoConsumo[] {
  return consumos.map((consumo, i) => ({
    desdeId: `a${i}`,
    hastaId: `b${i}`,
    fecha: `2026-${String((i % 12) + 1).padStart(2, '0')}-15`,
    km: 700,
    cantidad: (consumo * 700) / 100,
    unidad: 'l' as const,
    consumo,
    costeCentimos: 9000,
    parciales: 0,
  }));
}

describe('mediana', () => {
  it('funciona con longitud impar y par', () => {
    expect(mediana([3, 1, 2])).toBe(2);
    expect(mediana([4, 1, 2, 3])).toBe(2.5);
  });

  it('devuelve null sin datos', () => {
    expect(mediana([])).toBeNull();
  });
});

describe('detectarAnomalias', () => {
  it('no dice nada sin histórico suficiente', () => {
    // Adivinar con cuatro tramos es peor que callarse.
    expect(detectarAnomalias(serie([5, 5, 8, 9]))).toEqual([]);
  });

  it('no se inventa nada en una serie estable', () => {
    expect(detectarAnomalias(serie([5.6, 5.5, 5.7, 5.6, 5.5, 5.6, 5.7, 5.6]))).toEqual([]);
  });

  it('detecta una subida sostenida', () => {
    // Ocho tramos a 5,6 y luego tres a 6,4: un 14 % más.
    const [a] = detectarAnomalias(
      serie([5.6, 5.5, 5.7, 5.6, 5.5, 5.6, 5.7, 5.6, 6.4, 6.5, 6.3]),
    );

    expect(a!.tipo).toBe('subida_sostenida');
    expect(a!.consumoBase).toBeCloseTo(5.6, 2);
    expect(a!.incremento).toBeGreaterThan(0.1);
    expect(a!.mensaje).toContain('neumáticos');
  });

  it('gradúa la gravedad según cuánto suba', () => {
    const leve = detectarAnomalias(serie([5.6, 5.6, 5.6, 5.6, 5.6, 5.6, 6.1, 6.2, 6.15]));
    expect(leve[0]!.gravedad).toBe('aviso');

    const fuerte = detectarAnomalias(serie([5.6, 5.6, 5.6, 5.6, 5.6, 5.6, 7.2, 7.4, 7.1]));
    expect(fuerte[0]!.gravedad).toBe('alerta');
  });

  it('un solo depósito raro no dispara la alarma de subida', () => {
    /*
     * Esta es la razón de usar mediana y de exigir varios tramos seguidos. Un
     * viaje de montaña, una semana de atascos o un repostaje mal anotado no
     * son una avería, y avisar de ellos enseña a ignorar la alerta.
     */
    const anomalias = detectarAnomalias(
      serie([5.6, 5.5, 5.7, 5.6, 5.5, 5.6, 5.7, 9.8, 5.6, 5.5]),
    );
    expect(anomalias.some((a) => a.tipo === 'subida_sostenida')).toBe(false);
  });

  it('no avisa si solo dos de los tres tramos suben', () => {
    // Con dos de tres bastaría para que un viaje largo disparase el aviso.
    const anomalias = detectarAnomalias(
      serie([5.6, 5.6, 5.6, 5.6, 5.6, 5.6, 6.5, 6.6, 5.4]),
    );
    expect(anomalias.some((a) => a.tipo === 'subida_sostenida')).toBe(false);
  });

  it('ignora una subida por debajo del ruido de conducción', () => {
    // Un 4 % lo explica el frío, la lluvia o unos kilómetros más de ciudad.
    const anomalias = detectarAnomalias(
      serie([5.6, 5.6, 5.6, 5.6, 5.6, 5.6, 5.82, 5.83, 5.81]),
    );
    expect(anomalias).toEqual([]);
  });

  it('no avisa cuando el consumo BAJA', () => {
    const anomalias = detectarAnomalias(
      serie([6.5, 6.6, 6.4, 6.5, 6.6, 6.5, 5.4, 5.3, 5.5]),
    );
    expect(anomalias).toEqual([]);
  });

  it('señala un tramo suelto muy atípico como dato dudoso, no como avería', () => {
    const [a] = detectarAnomalias(serie([5.6, 5.5, 5.7, 5.6, 5.5, 5.6, 5.7, 5.6, 9.5]));

    expect(a!.tipo).toBe('tramo_atipico');
    expect(a!.mensaje).toContain('mal anotado');
  });

  it('no duplica el aviso: la subida sostenida manda sobre el tramo atípico', () => {
    const anomalias = detectarAnomalias(
      serie([5.6, 5.6, 5.6, 5.6, 5.6, 5.6, 7.0, 7.2, 8.0]),
    );
    expect(anomalias).toHaveLength(1);
    expect(anomalias[0]!.tipo).toBe('subida_sostenida');
  });

  it('conserva la unidad para poder redactar el mensaje', () => {
    const kilovatios = serie([17, 17, 17, 17, 17, 17, 20, 20.5, 20.2]).map((t) => ({
      ...t,
      unidad: 'kWh' as const,
    }));
    const [a] = detectarAnomalias(kilovatios);
    expect(a!.unidad).toBe('kWh');
    expect(a!.mensaje).toContain('kWh/100 km');
  });

  it('no divide por cero con una referencia nula', () => {
    expect(detectarAnomalias(serie([0, 0, 0, 0, 0, 0, 1, 2, 3]))).toEqual([]);
  });
});

describe('ordenarComparativa', () => {
  const fila = (alias: string, centimosPorKm: number | null) => ({
    vehiculoId: alias,
    alias,
    unidad: 'l' as const,
    consumoMedio: null,
    centimosPorKm,
    kmAlAnio: 0,
    gastoAnualCentimos: null,
  });

  it('ordena de más barato a más caro', () => {
    const filas = ordenarComparativa([fila('caro', 30), fila('barato', 12), fila('medio', 20)]);
    expect(filas.map((f) => f.alias)).toEqual(['barato', 'medio', 'caro']);
  });

  it('manda al final los vehículos sin datos', () => {
    // Un coche del que no sabes nada no es el más barato de todos.
    const filas = ordenarComparativa([fila('sin datos', null), fila('conocido', 25)]);
    expect(filas.map((f) => f.alias)).toEqual(['conocido', 'sin datos']);
  });
});
