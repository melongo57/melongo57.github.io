import { afterEach, describe, expect, it } from 'vitest';
import {
  aFechaISO,
  claveMes,
  compararFechas,
  deFechaISO,
  diasEntre,
  esFechaISO,
  fechaLocalDeInstante,
  formatearDistancia,
  formatearFecha,
  mesesEntre,
  primerDiaDelMes,
  sumarDias,
  sumarMeses,
  ultimoDiaDelMes,
} from './fechas.ts';

describe('conversión ISO ↔ Date', () => {
  it('va y vuelve sin desplazar el día', () => {
    // Esta es la prueba que caza el bug clásico: `new Date('2026-03-14')`
    // es medianoche UTC, y al leerlo en local puede dar el día 13.
    for (const fecha of ['2026-01-01', '2026-03-14', '2026-12-31', '2024-02-29']) {
      expect(aFechaISO(deFechaISO(fecha))).toBe(fecha);
    }
  });

  it('construye la fecha en hora local', () => {
    const d = deFechaISO('2026-03-14');
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(2);
    expect(d.getDate()).toBe(14);
    expect(d.getHours()).toBe(0);
  });
});

describe('fechaLocalDeInstante', () => {
  const zonaOriginal = process.env.TZ;

  afterEach(() => {
    process.env.TZ = zonaOriginal;
  });

  it('usa el día de España, no el de UTC, de madrugada', () => {
    /*
     * `ahoraISO()` guarda el instante en UTC. En verano España va dos horas
     * por delante (UTC+2): a las 00:30 de un 16 de julio en Madrid, el
     * instante en UTC todavía marca las 22:30 del 15. Cortar los diez
     * primeros caracteres del ISO (lo que hacía antes `EstadoDatos`) daba el
     * 15, un día por detrás de lo que de verdad marcaba el reloj de España.
     */
    process.env.TZ = 'Europe/Madrid';
    expect(fechaLocalDeInstante('2026-07-15T22:30:00.000Z')).toBe('2026-07-16');
  });

  it('también corrige el caso contrario, en invierno', () => {
    // En invierno (UTC+1), las 23:30 UTC del día 14 son las 00:30 del 15 en
    // Madrid: el mismo desfase, un día antes en vez de después.
    process.env.TZ = 'Europe/Madrid';
    expect(fechaLocalDeInstante('2026-01-14T23:30:00.000Z')).toBe('2026-01-15');
  });

  it('coincide con UTC cuando no hay desfase de madrugada de por medio', () => {
    process.env.TZ = 'Europe/Madrid';
    expect(fechaLocalDeInstante('2026-07-15T10:00:00.000Z')).toBe('2026-07-15');
  });
});

describe('esFechaISO', () => {
  it('acepta fechas válidas', () => {
    expect(esFechaISO('2026-08-24')).toBe(true);
    expect(esFechaISO('2024-02-29')).toBe(true);
  });

  it('rechaza formatos y fechas imposibles', () => {
    expect(esFechaISO('24/08/2026')).toBe(false);
    expect(esFechaISO('2026-8-24')).toBe(false);
    expect(esFechaISO('2026-13-01')).toBe(false);
    // 29 de febrero de un año no bisiesto: existe como cadena, no como día.
    expect(esFechaISO('2025-02-29')).toBe(false);
    expect(esFechaISO(20260824)).toBe(false);
    expect(esFechaISO(null)).toBe(false);
  });
});

describe('aritmética de fechas', () => {
  it('cuenta días naturales', () => {
    expect(diasEntre('2026-03-14', '2026-03-20')).toBe(6);
    expect(diasEntre('2026-03-20', '2026-03-14')).toBe(-6);
    expect(diasEntre('2026-03-14', '2026-03-14')).toBe(0);
  });

  it('cruza el cambio de hora sin perder un día', () => {
    // En España el horario de verano entra el último domingo de marzo.
    expect(diasEntre('2026-03-28', '2026-03-30')).toBe(2);
    expect(diasEntre('2026-10-24', '2026-10-26')).toBe(2);
  });

  it('cuenta meses naturales', () => {
    expect(mesesEntre('2026-01-31', '2026-03-01')).toBe(2);
    expect(mesesEntre('2025-06-15', '2026-06-15')).toBe(12);
  });

  it('suma días atravesando fin de mes y fin de año', () => {
    expect(sumarDias('2026-01-31', 1)).toBe('2026-02-01');
    expect(sumarDias('2026-12-31', 1)).toBe('2027-01-01');
    expect(sumarDias('2026-03-01', -1)).toBe('2026-02-28');
  });

  it('suma meses recortando al último día válido', () => {
    // 31 de enero + 1 mes no puede ser el 31 de febrero.
    expect(sumarMeses('2026-01-31', 1)).toBe('2026-02-28');
    expect(sumarMeses('2024-01-31', 1)).toBe('2024-02-29');
    expect(sumarMeses('2026-08-24', 12)).toBe('2027-08-24');
    expect(sumarMeses('2026-08-24', -20)).toBe('2024-12-24');
  });
});

describe('agrupación mensual', () => {
  it('extrae la clave de mes', () => {
    expect(claveMes('2026-08-24')).toBe('2026-08');
  });

  it('calcula los extremos del mes', () => {
    expect(primerDiaDelMes('2026-08-24')).toBe('2026-08-01');
    expect(ultimoDiaDelMes('2026-08-24')).toBe('2026-08-31');
    expect(ultimoDiaDelMes('2026-02-10')).toBe('2026-02-28');
    expect(ultimoDiaDelMes('2024-02-10')).toBe('2024-02-29');
  });
});

describe('compararFechas', () => {
  it('ordena cronológicamente', () => {
    const fechas = ['2026-03-14', '2025-12-01', '2026-01-05'];
    expect([...fechas].sort(compararFechas)).toEqual([
      '2025-12-01',
      '2026-01-05',
      '2026-03-14',
    ]);
  });
});

describe('presentación', () => {
  it('formatea en día/mes/año', () => {
    expect(formatearFecha('2026-08-24')).toBe('24/08/2026');
  });

  it('describe distancias en lenguaje natural', () => {
    expect(formatearDistancia(0)).toBe('hoy');
    expect(formatearDistancia(1)).toBe('mañana');
    expect(formatearDistancia(-1)).toBe('ayer');
    expect(formatearDistancia(12)).toBe('en 12 días');
    expect(formatearDistancia(-6)).toBe('hace 6 días');
    expect(formatearDistancia(60)).toBe('en 2 meses');
    expect(formatearDistancia(-90)).toBe('hace 3 meses');
    expect(formatearDistancia(365)).toBe('en 1 año');
    expect(formatearDistancia(400)).toBe('en 1 año y 1 mes');
  });
});
