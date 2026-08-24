import { describe, expect, it } from 'vitest';
import { ANTELACION_DOCUMENTO_DIAS, ANTELACION_MANTENIMIENTO } from './catalogos.ts';
import type { EstimacionKm } from './odometro.ts';
import type {
  Documento,
  Mantenimiento,
  ReglaMantenimiento,
  TipoMantenimiento,
  Vehiculo,
} from './tipos.ts';
import {
  calcularVencimientos,
  claveTipo,
  describirRestante,
  resumirVencimientos,
  type EntradaVencimientos,
} from './vencimientos.ts';

const HOY = '2026-08-24';

const AJUSTES = {
  antelacionMantenimiento: ANTELACION_MANTENIMIENTO,
  antelacionDocumentoDias: ANTELACION_DOCUMENTO_DIAS,
};

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

function regla(cambios: Partial<ReglaMantenimiento> = {}): ReglaMantenimiento {
  return {
    id: 'r1',
    creadoEn: '',
    actualizadoEn: '',
    vehiculoId: 'v1',
    tipo: 'aceite',
    cadaKm: 15000,
    cadaMeses: 12,
    activa: true,
    ...cambios,
  };
}

function mantenimiento(cambios: Partial<Mantenimiento> = {}): Mantenimiento {
  return {
    id: 'm1',
    creadoEn: '',
    actualizadoEn: '',
    vehiculoId: 'v1',
    tipo: 'aceite',
    fecha: '2025-08-24',
    km: 110000,
    costeCentimos: 9000,
    piezas: [],
    adjuntoIds: [],
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
    reglas: [],
    mantenimientos: [],
    documentos: [],
    estimacion: estimacion(),
    ajustes: AJUSTES,
    hoy: HOY,
    ...cambios,
  };
}

// ---------------------------------------------------------------------------

describe('recurrencia doble: lo que ocurra antes', () => {
  it('vence por kilómetros cuando el coche rueda mucho', () => {
    // Último cambio hace 3 meses a 110.000 km; ahora 120.000 y 40 km/día.
    // Por km: quedan 5.000 → 125 días. Por tiempo: quedan 9 meses.
    const [v] = calcularVencimientos(
      entrada({
        reglas: [regla()],
        mantenimientos: [mantenimiento({ fecha: '2026-05-24', km: 110000 })],
      }),
    );

    expect(v!.motivo).toBe('km');
    expect(v!.kmRestantes).toBe(5000);
    expect(Math.round(v!.urgencia)).toBe(125);
  });

  it('vence por tiempo cuando el coche rueda poco', () => {
    // El mismo intervalo, pero a 5 km/día: 5.000 km son 1.000 días y el plazo
    // de 12 meses llega mucho antes. Es el caso de la autocaravana.
    const [v] = calcularVencimientos(
      entrada({
        reglas: [regla()],
        mantenimientos: [mantenimiento({ fecha: '2026-05-24', km: 110000 })],
        estimacion: estimacion(120000, 5),
      }),
    );

    expect(v!.motivo).toBe('tiempo');
    expect(v!.fechaLimite).toBe('2027-05-24');
  });

  it('marca vencido si CUALQUIERA de las dos dimensiones ha pasado', () => {
    // Por tiempo aún queda (hace 6 meses de un plazo de 12), pero se ha
    // pasado de kilómetros: 110.000 + 15.000 = 125.000 y ya van 130.000.
    const [v] = calcularVencimientos(
      entrada({
        reglas: [regla()],
        mantenimientos: [mantenimiento({ fecha: '2026-02-24', km: 110000 })],
        estimacion: estimacion(130000),
      }),
    );

    expect(v!.semaforo).toBe('vencido');
    expect(v!.kmRestantes).toBe(-5000);
    expect(v!.diasRestantes).toBeGreaterThan(0);
  });

  it('marca vencido por tiempo aunque sobren kilómetros', () => {
    const [v] = calcularVencimientos(
      entrada({
        reglas: [regla()],
        mantenimientos: [mantenimiento({ fecha: '2025-01-01', km: 119000 })],
        estimacion: estimacion(120000, 5),
      }),
    );

    expect(v!.semaforo).toBe('vencido');
    expect(v!.diasRestantes).toBeLessThan(0);
    expect(v!.kmRestantes).toBeGreaterThan(0);
  });
});

describe('reglas con una sola dimensión', () => {
  it('acepta una regla solo por meses', () => {
    const [v] = calcularVencimientos(
      entrada({
        reglas: [regla({ cadaKm: undefined, cadaMeses: 60, tipo: 'bateria' })],
        mantenimientos: [mantenimiento({ tipo: 'bateria', fecha: '2022-08-24' })],
      }),
    );

    expect(v!.motivo).toBe('tiempo');
    expect(v!.kmRestantes).toBeUndefined();
    expect(v!.fechaLimite).toBe('2027-08-24');
  });

  it('acepta una regla solo por kilómetros', () => {
    const [v] = calcularVencimientos(
      entrada({
        reglas: [regla({ cadaMeses: undefined })],
        mantenimientos: [mantenimiento({ km: 110000 })],
      }),
    );

    expect(v!.motivo).toBe('km');
    expect(v!.diasRestantes).toBeUndefined();
  });

  it('descarta una regla que no puede vencer por nada', () => {
    const v = calcularVencimientos(
      entrada({ reglas: [regla({ cadaKm: undefined, cadaMeses: undefined })] }),
    );
    // Una regla así daría sensación de estar cubierto sin avisar jamás.
    expect(v).toHaveLength(0);
  });

  it('ignora las reglas desactivadas', () => {
    expect(calcularVencimientos(entrada({ reglas: [regla({ activa: false })] }))).toHaveLength(0);
  });
});

describe('sin registro previo', () => {
  it('calcula desde la compra y lo señala', () => {
    const [v] = calcularVencimientos(entrada({ reglas: [regla()] }));

    expect(v!.origen).toMatchObject({ sinRegistroPrevio: true });
    expect(v!.desdeFecha).toBe('2019-04-12');
    expect(v!.desdeKm).toBe(18400);
  });

  it('nunca lo marca como vencido, aunque las cuentas digan que hace años que tocaba', () => {
    // Comprado en 2019 con un plazo de 12 meses. Anunciar «cinco años de
    // retraso» no es creíble —lo normal es que sí lo cambiara y no lo anotara—
    // y media docena de avisos así ahogan el que sí es real.
    const [v] = calcularVencimientos(entrada({ reglas: [regla()] }));

    expect(v!.semaforo).toBe('proximo');
    expect(describirRestante(v!)).toBe('Sin registrar');
  });

  it('lo ordena por detrás de lo que tiene fecha, vencido o próximo', () => {
    const resultado = calcularVencimientos(
      entrada({
        reglas: [regla({ id: 'r-sin-registro', tipo: 'filtros', cadaKm: 30000, cadaMeses: 24 })],
        documentos: [
          {
            id: 'd-seguro',
            creadoEn: '',
            actualizadoEn: '',
            vehiculoId: 'v1',
            tipo: 'seguro',
            compania: 'Mutua',
            cobertura: 'todo_riesgo',
            fechaVencimiento: '2026-09-15',
            adjuntoIds: [],
          } as Documento,
        ],
      }),
    );

    // Un seguro que vence en tres semanas es una tarea con fecha; un filtro
    // sin anotar es solo un hueco en el histórico.
    expect(resultado[0]!.titulo).toContain('Seguro');
    expect(resultado[1]!.titulo).toBe('Filtros');
  });

  it('lo ordena por detrás de lo que sí está vencido de verdad', () => {
    const resultado = calcularVencimientos(
      entrada({
        reglas: [
          regla({ id: 'r-sin-registro', tipo: 'filtros', cadaKm: 30000, cadaMeses: 24 }),
          regla({ id: 'r-vencido', tipo: 'aceite' }),
        ],
        // El aceite sí tiene registro, y está pasado de kilómetros.
        mantenimientos: [mantenimiento({ fecha: '2026-07-01', km: 100000 })],
      }),
    );

    expect(resultado[0]!.titulo).toBe('Cambio de aceite');
    expect(resultado[0]!.semaforo).toBe('vencido');
    expect(resultado[1]!.semaforo).toBe('proximo');
  });

  it('deja en verde una regla sin registro que aún no tocaría', () => {
    // Coche comprado hace un mes: su primer cambio de aceite no urge.
    const reciente = vehiculo({ fechaCompra: '2026-07-24', kmCompra: 119000 });
    const [v] = calcularVencimientos(
      entrada({ vehiculo: reciente, reglas: [regla()] }),
    );
    expect(v!.semaforo).toBe('ok');
  });

  it('no inventa un vencimiento si no hay ninguna referencia', () => {
    const sinCompra = vehiculo({ fechaCompra: undefined, kmCompra: undefined });
    expect(
      calcularVencimientos(entrada({ vehiculo: sinCompra, reglas: [regla()] })),
    ).toHaveLength(0);
  });
});

describe('un vehículo parado no se acerca al límite por kilómetros', () => {
  it('no considera urgente el intervalo de km sin ritmo de uso', () => {
    const [v] = calcularVencimientos(
      entrada({
        reglas: [regla({ cadaMeses: undefined })],
        mantenimientos: [mantenimiento({ km: 119000 })],
        estimacion: estimacion(120000, 0),
      }),
    );

    // Faltan 14.000 km, pero a 0 km/día no llegarán nunca solos.
    expect(v!.kmRestantes).toBe(14000);
    expect(v!.urgencia).toBe(Number.POSITIVE_INFINITY);
    expect(v!.semaforo).toBe('ok');
  });
});

describe('antelación del aviso', () => {
  it('pone en ámbar dentro de la ventana por kilómetros', () => {
    // El aceite avisa con 1.000 km. Límite en 125.000, vamos por 124.200.
    const [v] = calcularVencimientos(
      entrada({
        reglas: [regla()],
        mantenimientos: [mantenimiento({ fecha: '2026-06-01', km: 110000 })],
        estimacion: estimacion(124200),
      }),
    );

    expect(v!.semaforo).toBe('proximo');
    expect(v!.kmRestantes).toBe(800);
  });

  it('la antelación propia de la regla manda sobre la de ajustes', () => {
    const comun = {
      reglas: [regla({ avisoKm: 3000 })],
      mantenimientos: [mantenimiento({ fecha: '2026-06-01', km: 110000 })],
      estimacion: estimacion(122500),
    };

    // Con la antelación por defecto (1.000 km) faltan 2.500: aún en verde.
    const [pordefecto] = calcularVencimientos(
      entrada({ ...comun, reglas: [regla()] }),
    );
    expect(pordefecto!.semaforo).toBe('ok');

    // Con la de la regla (3.000 km), ya avisa.
    const [propia] = calcularVencimientos(entrada(comun));
    expect(propia!.semaforo).toBe('proximo');
  });

  it('deja en verde lo que aún queda lejos', () => {
    const [v] = calcularVencimientos(
      entrada({
        reglas: [regla()],
        mantenimientos: [mantenimiento({ fecha: '2026-08-01', km: 119000 })],
      }),
    );
    expect(v!.semaforo).toBe('ok');
  });
});

describe('mantenimientos de tipo «otro»', () => {
  it('no mezcla dos recurrencias personalizadas distintas', () => {
    const reglas = [
      regla({ id: 'r-amort', tipo: 'otro', tipoPersonalizado: 'Amortiguadores', cadaKm: 80000 }),
      regla({ id: 'r-embrague', tipo: 'otro', tipoPersonalizado: 'Embrague', cadaKm: 150000 }),
    ];
    const mantenimientos = [
      mantenimiento({ id: 'm-a', tipo: 'otro', tipoPersonalizado: 'Amortiguadores', km: 60000 }),
    ];

    const resultado = calcularVencimientos(entrada({ reglas, mantenimientos }));

    const amortiguadores = resultado.find((v) => v.titulo === 'Amortiguadores');
    const embrague = resultado.find((v) => v.titulo === 'Embrague');

    // El de amortiguadores sí tiene registro; el de embrague, no.
    expect(amortiguadores!.origen).toMatchObject({ sinRegistroPrevio: false });
    expect(amortiguadores!.kmLimite).toBe(140000);
    expect(embrague!.origen).toMatchObject({ sinRegistroPrevio: true });
  });

  it('claveTipo distingue por nombre y no por mayúsculas ni espacios', () => {
    expect(claveTipo('otro', 'Embrague')).toBe(claveTipo('otro', '  embrague '));
    expect(claveTipo('otro', 'Embrague')).not.toBe(claveTipo('otro', 'Amortiguadores'));
    expect(claveTipo('aceite')).toBe('aceite');
  });
});

describe('histórico con varios registros del mismo tipo', () => {
  it('se basa en el más reciente, aunque se hayan introducido desordenados', () => {
    const mantenimientos = [
      mantenimiento({ id: 'm2', fecha: '2026-06-01', km: 118000 }),
      mantenimiento({ id: 'm1', fecha: '2024-01-01', km: 90000 }),
    ];
    const [v] = calcularVencimientos(entrada({ reglas: [regla()], mantenimientos }));

    expect(v!.desdeKm).toBe(118000);
    expect(v!.kmLimite).toBe(133000);
  });
});

describe('documentos', () => {
  function documento(cambios: Partial<Documento> = {}): Documento {
    return {
      id: 'd1',
      creadoEn: '',
      actualizadoEn: '',
      vehiculoId: 'v1',
      tipo: 'itv',
      fechaVencimiento: '2026-09-10',
      adjuntoIds: [],
      ...cambios,
    } as Documento;
  }

  it('vence solo por tiempo', () => {
    const [v] = calcularVencimientos(entrada({ documentos: [documento()] }));
    expect(v!.diasRestantes).toBe(17);
    expect(v!.kmRestantes).toBeUndefined();
    expect(v!.semaforo).toBe('proximo'); // la ITV avisa con 30 días
  });

  it('marca vencido lo caducado', () => {
    const [v] = calcularVencimientos(
      entrada({ documentos: [documento({ fechaVencimiento: '2026-08-18' })] }),
    );
    expect(v!.semaforo).toBe('vencido');
    expect(v!.diasRestantes).toBe(-6);
  });

  it('ignora los documentos sin caducidad', () => {
    const permiso = documento({ tipo: 'permiso_circulacion', fechaVencimiento: undefined });
    expect(calcularVencimientos(entrada({ documentos: [permiso] }))).toHaveLength(0);
  });

  it('nombra el seguro con su compañía', () => {
    const seguro = documento({
      tipo: 'seguro',
      compania: 'Mutua Madrileña',
      cobertura: 'todo_riesgo',
    });
    const [v] = calcularVencimientos(entrada({ documentos: [seguro] }));
    expect(v!.titulo).toBe('Seguro · Mutua Madrileña');
  });
});

describe('vehículo vendido', () => {
  it('no genera ningún vencimiento', () => {
    const vendido = vehiculo({ estado: 'vendido', fechaVenta: '2025-01-01', kmVenta: 130000 });
    const resultado = calcularVencimientos(
      entrada({
        vehiculo: vendido,
        reglas: [regla()],
        documentos: [
          {
            id: 'd1',
            creadoEn: '',
            actualizadoEn: '',
            vehiculoId: 'v1',
            tipo: 'itv',
            fechaVencimiento: '2026-01-01',
            adjuntoIds: [],
          } as Documento,
        ],
      }),
    );
    // Está congelado: recordarle su ITV sería recordarle algo que ya no es
    // asunto suyo.
    expect(resultado).toEqual([]);
  });
});

describe('orden y resumen', () => {
  it('ordena del más urgente al menos', () => {
    const reglas = [
      regla({ id: 'lejano', tipo: 'distribucion', cadaKm: 120000, cadaMeses: 120 }),
      regla({ id: 'urgente', tipo: 'aceite', cadaKm: 15000, cadaMeses: 12 }),
    ];
    const mantenimientos = [
      mantenimiento({ id: 'm-d', tipo: 'distribucion', fecha: '2026-01-01', km: 119000 }),
      mantenimiento({ id: 'm-a', tipo: 'aceite', fecha: '2026-06-01', km: 112000 }),
    ];

    const resultado = calcularVencimientos(entrada({ reglas, mantenimientos }));
    expect(resultado.map((v) => v.titulo)).toEqual([
      'Cambio de aceite',
      'Correa o cadena de distribución',
    ]);
  });

  it('resume el peor estado y destaca solo lo que reclama atención', () => {
    const reglas = [
      regla({ id: 'r-aceite', tipo: 'aceite' }),
      regla({ id: 'r-frenos', tipo: 'frenos', cadaKm: 50000, cadaMeses: 48 }),
    ];
    const mantenimientos = [
      // El aceite está pasado de kilómetros.
      mantenimiento({ id: 'm-a', tipo: 'aceite', fecha: '2026-06-01', km: 100000 }),
      // Los frenos, recién hechos.
      mantenimiento({ id: 'm-f', tipo: 'frenos', fecha: '2026-08-01', km: 119500 }),
    ];

    const resumen = resumirVencimientos(calcularVencimientos(entrada({ reglas, mantenimientos })));

    expect(resumen.peor).toBe('vencido');
    expect(resumen.vencidos).toBe(1);
    expect(resumen.total).toBe(2);
    // Lo que está en verde no ocupa sitio en la tarjeta.
    expect(resumen.destacados).toHaveLength(1);
  });

  it('resume en verde cuando no hay nada pendiente', () => {
    const resumen = resumirVencimientos([]);
    expect(resumen.peor).toBe('ok');
    expect(resumen.destacados).toEqual([]);
  });
});

describe('describirRestante', () => {
  it('empieza por la dimensión que apremia', () => {
    const [porKm] = calcularVencimientos(
      entrada({
        reglas: [regla()],
        mantenimientos: [mantenimiento({ fecha: '2026-06-01', km: 110000 })],
        estimacion: estimacion(124200),
      }),
    );
    expect(describirRestante(porKm!)).toMatch(/^800 km/);

    const [porTiempo] = calcularVencimientos(
      entrada({
        reglas: [regla()],
        mantenimientos: [mantenimiento({ fecha: '2025-09-01', km: 119000 })],
        estimacion: estimacion(120000, 2),
      }),
    );
    expect(describirRestante(porTiempo!)).toMatch(/^\d+ días/);
  });

  it('dice el retraso cuando ya está vencido', () => {
    const [v] = calcularVencimientos(
      entrada({
        reglas: [regla({ cadaMeses: undefined })],
        mantenimientos: [mantenimiento({ km: 100000 })],
        estimacion: estimacion(120000),
      }),
    );
    expect(describirRestante(v!)).toBe('5000 km de más');
  });
});

describe('tipos de mantenimiento propios de la autocaravana', () => {
  it('el sellado del techo vence al año, solo por tiempo', () => {
    const camper = vehiculo({ categoria: 'autocaravana', fechaCompra: '2018-05-19' });
    const [v] = calcularVencimientos(
      entrada({
        vehiculo: camper,
        reglas: [
          regla({
            id: 'r-sellado',
            tipo: 'sellado_techo' as TipoMantenimiento,
            cadaKm: undefined,
            cadaMeses: 12,
          }),
        ],
        mantenimientos: [
          mantenimiento({ id: 'm-s', tipo: 'sellado_techo' as TipoMantenimiento, fecha: '2025-06-24' }),
        ],
        estimacion: estimacion(48000, 9),
      }),
    );

    expect(v!.titulo).toBe('Sellado del techo');
    expect(v!.motivo).toBe('tiempo');
    expect(v!.fechaLimite).toBe('2026-06-24');
    expect(v!.semaforo).toBe('vencido');
  });
});
