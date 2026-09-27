import { describe, expect, it } from 'vitest';
import type { EstimacionKm } from './odometro.ts';
import type { Alerta, Vehiculo } from './tipos.ts';
import {
  calcularVencimientos,
  compararUrgencia,
  describirLimite,
  describirMeses,
  describirRepeticion,
  describirRestante,
  limitesDe,
  resumirVencimientos,
  type EntradaVencimientos,
} from './vencimientos.ts';

const HOY = '2026-08-24';

const AJUSTES = { avisoDias: 30, avisoKm: 1000 };

function vehiculo(cambios: Partial<Vehiculo> = {}): Vehiculo {
  return {
    id: 'v1',
    creadoEn: '',
    actualizadoEn: '',
    alias: 'El Golf',
    categoria: 'turismo',
    marca: 'VW',
    modelo: 'Golf',
    matricula: '1234 ABC',
    anio: 2018,
    combustible: 'diesel',
    fechaCompra: '2019-04-12',
    kmCompra: 18400,
    estado: 'activo',
    orden: 0,
    ...cambios,
  };
}

function alerta(cambios: Partial<Alerta> = {}): Alerta {
  return {
    id: 'a1',
    creadoEn: '',
    actualizadoEn: '',
    vehiculoId: 'v1',
    nombre: 'Cambio de aceite',
    icono: '🛢️',
    cadaKm: 15000,
    cadaMeses: 12,
    apunte: 'mantenimiento',
    ...cambios,
  };
}

/** Estimación con 120.000 km y 40 km/día (unos 14.600 km al año). */
function estimacion(km = 120000, kmPorDia = 40): EstimacionKm {
  return {
    km,
    confianza: 'alta',
    ultimaLectura: { fecha: HOY, km, origen: 'manual', refId: 'l1' },
    diasDesdeLectura: 0,
    kmPorDia,
  };
}

function entrada(cambios: Partial<EntradaVencimientos> = {}): EntradaVencimientos {
  return {
    vehiculo: vehiculo(),
    alertas: [],
    estimacion: estimacion(),
    ajustes: AJUSTES,
    hoy: HOY,
    ...cambios,
  };
}

function uno(a: Alerta, cambios: Partial<EntradaVencimientos> = {}) {
  const [v] = calcularVencimientos(entrada({ alertas: [a], ...cambios }));
  return v!;
}

// ---------------------------------------------------------------------------

describe('recurrencia doble: lo que ocurra antes', () => {
  it('vence por kilómetros cuando el coche rueda mucho', () => {
    // Última vez hace 3 meses a 110.000 km; ahora 120.000 y 40 km/día.
    // Por km: quedan 5.000 → 125 días. Por tiempo: quedan 9 meses.
    const v = uno(alerta({ ultimaFecha: '2026-05-24', ultimoKm: 110000 }));
    expect(v.motivo).toBe('km');
    expect(v.kmLimite).toBe(125000);
    expect(v.kmRestantes).toBe(5000);
    expect(v.urgencia).toBe(125);
    expect(v.semaforo).toBe('ok');
  });

  it('vence por tiempo cuando el vehículo apenas se mueve', () => {
    // A 5 km/día, los 12.000 km que quedan son más de seis años: manda el plazo.
    const v = uno(alerta({ ultimaFecha: '2025-09-10', ultimoKm: 117000 }), {
      estimacion: estimacion(120000, 5),
    });
    expect(v.motivo).toBe('tiempo');
    expect(v.fechaLimite).toBe('2026-09-10');
    expect(v.diasRestantes).toBe(17);
    expect(v.semaforo).toBe('proximo');
  });

  it('un vehículo parado no se acerca al límite por kilómetros', () => {
    const v = uno(alerta({ ultimaFecha: '2026-01-10', ultimoKm: 119000 }), {
      estimacion: estimacion(120000, 0),
    });
    expect(v.motivo).toBe('tiempo');
  });
});

describe('fecha fija', () => {
  it('manda sobre el cálculo por meses', () => {
    // La ITV dice en la pegatina que vence en marzo, aunque «cada 24 meses»
    // desde la última daría otra fecha.
    const limites = limitesDe({
      cadaMeses: 24,
      ultimaFecha: '2025-01-10',
      venceEl: '2026-03-15',
    });
    expect(limites.fechaLimite).toBe('2026-03-15');
  });

  it('basta por sí sola, sin repetición ni última vez', () => {
    const v = uno(
      alerta({ cadaKm: undefined, cadaMeses: undefined, venceEl: '2026-08-18' }),
    );
    expect(v.faltaUltimaVez).toBe(false);
    expect(v.diasRestantes).toBe(-6);
    expect(v.semaforo).toBe('vencido');
  });
});

describe('semáforo', () => {
  it('vencido si se pasa por cualquiera de las dos dimensiones', () => {
    expect(uno(alerta({ ultimaFecha: '2026-06-01', ultimoKm: 100000 })).semaforo).toBe(
      'vencido',
    );
    expect(uno(alerta({ ultimaFecha: '2025-06-01', ultimoKm: 119000 })).semaforo).toBe(
      'vencido',
    );
  });

  it('próximo dentro de la antelación de Ajustes', () => {
    // Quedan 800 km: por debajo de los 1.000 de antelación.
    const v = uno(alerta({ ultimaFecha: '2026-06-01', ultimoKm: 105800 }));
    expect(v.kmRestantes).toBe(800);
    expect(v.semaforo).toBe('proximo');
  });

  it('la antelación propia de la alerta manda sobre la de Ajustes', () => {
    const base = { ultimaFecha: '2026-06-01', ultimoKm: 105800 };
    expect(uno(alerta({ ...base, avisoKm: 500 })).semaforo).toBe('ok');
    expect(uno(alerta({ ...base, avisoKm: 2000 })).semaforo).toBe('proximo');
  });
});

describe('sin última vez', () => {
  it('no se marca como vencida: pide el dato', () => {
    const v = uno(alerta());
    expect(v.faltaUltimaVez).toBe(true);
    expect(v.semaforo).toBe('proximo');
    expect(describirRestante(v)).toBe('Falta la última vez');
  });

  it('va detrás de lo que vence de verdad al ordenar', () => {
    const falta = uno(alerta({ id: 'falta' }));
    const seguro = uno(
      alerta({ id: 'seguro', cadaKm: undefined, cadaMeses: undefined, venceEl: '2026-09-13' }),
    );
    // El seguro tiene urgencia 20 y el dato que falta 0, pero el seguro va antes.
    expect([falta, seguro].sort(compararUrgencia).map((v) => v.alertaId)).toEqual([
      'seguro',
      'falta',
    ]);
  });

  it('con solo kilómetros de intervalo y solo fecha de última vez, sigue faltando', () => {
    // Sin los kilómetros de la última vez no hay de dónde contar los 15.000.
    const v = uno(alerta({ cadaMeses: undefined, ultimaFecha: '2026-01-01' }));
    expect(v.faltaUltimaVez).toBe(true);
  });
});

describe('orden y resumen', () => {
  it('ordena vencidas, próximas, sin dato y al día', () => {
    const lista = calcularVencimientos(
      entrada({
        alertas: [
          alerta({ id: 'ok', ultimaFecha: '2026-08-01', ultimoKm: 119500 }),
          alerta({ id: 'falta' }),
          alerta({ id: 'vencida', ultimaFecha: '2025-01-01', ultimoKm: 90000 }),
          alerta({ id: 'proxima', ultimaFecha: '2026-06-01', ultimoKm: 105800 }),
        ],
      }),
    );
    expect(lista.map((v) => v.alertaId)).toEqual(['vencida', 'proxima', 'falta', 'ok']);
  });

  it('un vehículo vendido no avisa de nada', () => {
    expect(
      calcularVencimientos(
        entrada({
          vehiculo: vehiculo({ estado: 'vendido' }),
          alertas: [alerta({ ultimaFecha: '2020-01-01', ultimoKm: 1 })],
        }),
      ),
    ).toEqual([]);
  });

  it('el resumen destaca solo lo que reclama atención', () => {
    const lista = calcularVencimientos(
      entrada({
        alertas: [
          alerta({ id: 'ok', ultimaFecha: '2026-08-01', ultimoKm: 119500 }),
          alerta({ id: 'vencida', ultimaFecha: '2025-01-01', ultimoKm: 90000 }),
        ],
      }),
    );
    const resumen = resumirVencimientos(lista);
    expect(resumen.peor).toBe('vencido');
    expect(resumen.vencidos).toBe(1);
    expect(resumen.destacados.map((v) => v.alertaId)).toEqual(['vencida']);
    expect(resumen.total).toBe(2);
  });
});

describe('frases', () => {
  it('describe lo que falta empezando por lo que apremia', () => {
    const v = uno(alerta({ ultimaFecha: '2026-05-24', ultimoKm: 110000 }));
    // En español, los números de cuatro cifras van sin punto: 5000, no 5.000.
    expect(describirRestante(v)).toBe('5000 km · 9 meses');
  });

  it('dice cuánto se ha pasado', () => {
    const v = uno(alerta({ ultimaFecha: '2026-06-01', ultimoKm: 104000 }));
    expect(describirRestante(v)).toMatch(/^1000 km de más/);
  });

  it('describe el límite con fecha y kilómetros', () => {
    expect(describirLimite({ fechaLimite: '2027-03-12', kmLimite: 135000 })).toBe(
      'Toca el 12/03/2027 o a los 135.000 km',
    );
    expect(describirLimite({})).toBe('');
  });

  it('describe la repetición como la diría una persona', () => {
    expect(describirRepeticion({ cadaKm: 15000, cadaMeses: 12 })).toBe('Cada 15.000 km o 1 año');
    expect(describirRepeticion({ cadaMeses: 12 })).toBe('Cada año');
    expect(describirRepeticion({ cadaMeses: 60 })).toBe('Cada 5 años');
    expect(describirRepeticion({ cadaKm: 30000 })).toBe('Cada 30.000 km');
    expect(describirRepeticion({ venceEl: '2027-03-12' })).toBe('Vence el 12/03/2027');
  });

  it('pasa los meses a años cuando son exactos', () => {
    expect(describirMeses(1)).toBe('1 mes');
    expect(describirMeses(18)).toBe('18 meses');
    expect(describirMeses(24)).toBe('2 años');
  });
});
