import { describe, expect, it } from 'vitest';
import {
  calcularCostePorKm,
  calcularCosteTotalPropiedad,
  gastoPorCategoria,
  gastoPorMes,
  ultimosMeses,
  type EntradaCostes,
} from './costes.ts';
import type { Gasto, Mantenimiento, Repostaje, Vehiculo } from './tipos.ts';

const HOY = '2026-08-24';

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
    fechaCompra: '2024-08-24',
    kmCompra: 100000,
    precioCompraCentimos: 1790000,
    estado: 'activo',
    orden: 0,
    ...cambios,
  };
}

let n = 0;
function repostaje(fecha: string, euros: number, km?: number): Repostaje {
  n += 1;
  return {
    id: `r${n}`,
    creadoEn: '',
    actualizadoEn: '',
    vehiculoId: 'v1',
    fecha,
    cantidad: 40,
    unidad: 'l',
    importeCentimos: Math.round(euros * 100),
    ...(km !== undefined ? { km } : {}),
    depositoLleno: true,
    rupturaSerie: false,
    adjuntoIds: [],
  };
}

function mantenimiento(fecha: string, euros: number): Mantenimiento {
  n += 1;
  return {
    id: `m${n}`,
    creadoEn: '',
    actualizadoEn: '',
    vehiculoId: 'v1',
    titulo: 'Cambio de aceite',
    alertaIds: [],
    fecha,
    costeCentimos: Math.round(euros * 100),
    adjuntoIds: [],
  };
}

function gasto(fecha: string, euros: number, categoria: Gasto['categoria'] = 'seguro'): Gasto {
  n += 1;
  return {
    id: `g${n}`,
    creadoEn: '',
    actualizadoEn: '',
    vehiculoId: 'v1',
    categoria,
    fecha,
    importeCentimos: Math.round(euros * 100),
    recurrente: false,
    adjuntoIds: [],
  };
}

/** Odómetro lineal: 100.000 km el 24/08/2024 y 130.000 dos años después. */
const PUNTOS = [
  { fecha: '2024-08-24', km: 100000 },
  { fecha: '2026-08-24', km: 130000 },
];

function entrada(cambios: Partial<EntradaCostes> = {}): EntradaCostes {
  return {
    vehiculo: vehiculo(),
    repostajes: [],
    mantenimientos: [],
    gastos: [],
    puntos: PUNTOS,
    // Fecha fija: sin ella, estos tests empiezan a fallar solos al pasar la
    // medianoche, porque el odómetro se extrapola un día más.
    hoy: HOY,
    ...cambios,
  };
}

// ---------------------------------------------------------------------------

describe('calcularCostePorKm', () => {
  it('suma las tres clases de gasto por separado', () => {
    const c = calcularCostePorKm(
      entrada({
        repostajes: [repostaje('2025-01-01', 60)],
        mantenimientos: [mantenimiento('2025-06-01', 200)],
        gastos: [gasto('2025-03-01', 480)],
        periodo: { desde: '2024-08-24', hasta: HOY },
      }),
    );

    expect(c.energiaCentimos).toBe(6000);
    expect(c.mantenimientoCentimos).toBe(20000);
    expect(c.otrosCentimos).toBe(48000);
    expect(c.totalCentimos).toBe(74000);
    expect(c.registros).toBe(3);
  });

  it('mide los kilómetros del mismo periodo que los gastos', () => {
    /*
     * Este es el fallo que se cuela solo: si sumas los gastos de un año pero
     * divides entre los kilómetros de dos, el coste por kilómetro sale a la
     * mitad de lo que es.
     */
    const registros = {
      repostajes: [repostaje('2025-09-01', 1500)],
      puntos: PUNTOS,
    };

    const unAnio = calcularCostePorKm(
      entrada({ ...registros, periodo: { desde: '2025-08-24', hasta: HOY } }),
    );
    // La mitad del histórico: 15.000 km.
    expect(unAnio.kmRecorridos).toBe(15000);
    expect(unAnio.centimosPorKm).toBeCloseTo(10, 5);

    const todo = calcularCostePorKm(
      entrada({ ...registros, periodo: { desde: '2024-08-24', hasta: HOY } }),
    );
    expect(todo.kmRecorridos).toBe(30000);
    expect(todo.centimosPorKm).toBeCloseTo(5, 5);
  });

  it('deja fuera lo que cae fuera del periodo', () => {
    const c = calcularCostePorKm(
      entrada({
        gastos: [gasto('2024-01-01', 100), gasto('2025-06-01', 200)],
        periodo: { desde: '2025-01-01', hasta: HOY },
      }),
    );
    expect(c.otrosCentimos).toBe(20000);
    expect(c.registros).toBe(1);
  });

  it('sin periodo abarca desde el primer registro', () => {
    const c = calcularCostePorKm(
      entrada({ gastos: [gasto('2025-03-01', 100), gasto('2026-01-01', 100)] }),
    );
    expect(c.periodo.desde).toBe('2025-03-01');
  });

  it('un vehículo vendido deja de acumular el día que se entrega', () => {
    const c = calcularCostePorKm(
      entrada({
        vehiculo: vehiculo({ estado: 'vendido', fechaVenta: '2025-12-24', kmVenta: 120000 }),
        gastos: [gasto('2025-03-01', 100)],
      }),
    );
    expect(c.periodo.hasta).toBe('2025-12-24');
  });

  it('devuelve null, y no cero, cuando no hay kilómetros medidos', () => {
    // Cero significaría «no cuesta nada»; null significa «no lo sé todavía».
    const c = calcularCostePorKm(entrada({ puntos: [], gastos: [gasto('2025-01-01', 100)] }));
    expect(c.kmRecorridos).toBe(0);
    expect(c.centimosPorKm).toBeNull();
  });

  it('no da un coste negativo si el odómetro retrocede', () => {
    const c = calcularCostePorKm(
      entrada({
        puntos: [
          { fecha: '2024-08-24', km: 130000 },
          { fecha: '2026-08-24', km: 100000 },
        ],
        gastos: [gasto('2025-01-01', 100)],
      }),
    );
    expect(c.kmRecorridos).toBe(0);
  });
});

describe('calcularCosteTotalPropiedad', () => {
  it('incluye el precio de compra entero mientras no lo vendas', () => {
    const c = calcularCosteTotalPropiedad(
      entrada({
        repostajes: [repostaje('2025-01-01', 2000)],
        mantenimientos: [mantenimiento('2025-06-01', 500)],
        gastos: [gasto('2025-03-01', 900)],
      }),
    );

    // 17.900 de compra + 3.400 de gastos, sin recuperar nada todavía.
    expect(c.compraCentimos).toBe(1790000);
    expect(c.recuperadoCentimos).toBe(0);
    expect(c.costeRealCentimos).toBe(1790000 + 340000);
  });

  it('descuenta lo recuperado al venderlo', () => {
    const c = calcularCosteTotalPropiedad(
      entrada({
        vehiculo: vehiculo({
          estado: 'vendido',
          fechaVenta: '2026-08-24',
          kmVenta: 130000,
          precioVentaCentimos: 900000,
        }),
        gastos: [gasto('2025-03-01', 1000)],
      }),
    );

    expect(c.costeRealCentimos).toBe(1790000 + 100000 - 900000);
  });

  it('cuenta los kilómetros desde la compra, no desde el primer registro', () => {
    const c = calcularCosteTotalPropiedad(
      entrada({ gastos: [gasto('2026-01-01', 100)] }),
    );
    expect(c.kmRecorridos).toBe(30000);
  });

  it('avisa de que falta el precio de compra en lugar de contarlo como cero', () => {
    const c = calcularCosteTotalPropiedad(
      entrada({ vehiculo: vehiculo({ precioCompraCentimos: undefined }) }),
    );
    // Sin ese dato la cifra está incompleta, y la interfaz tiene que decirlo:
    // un coste de propiedad sin el precio del coche no significa nada.
    expect(c.faltaPrecioCompra).toBe(true);
    expect(c.compraCentimos).toBe(0);
  });

  it('reparte por meses de posesión', () => {
    const c = calcularCosteTotalPropiedad(entrada({ gastos: [gasto('2025-01-01', 1200)] }));
    expect(c.meses).toBe(24);
    expect(c.centimosPorMes).toBeCloseTo((1790000 + 120000) / 24, 5);
  });

  it('avisa cuando los registros no cubren toda la propiedad', () => {
    /*
     * Comprado en 2024 pero con registros desde 2026: los gastos son de unos
     * meses y los kilómetros, de dos años. El coste por kilómetro sale más
     * bajo de lo real, y hay que decirlo en vez de enseñar un número creíble
     * y falso.
     */
    const c = calcularCosteTotalPropiedad(
      entrada({ gastos: [gasto('2026-06-01', 500)] }),
    );
    expect(c.registrosIncompletos).toBe(true);
    expect(c.cubreDesde).toBe('2026-06-01');
  });

  it('no avisa si empezaste a registrar al comprarlo', () => {
    const c = calcularCosteTotalPropiedad(
      entrada({ gastos: [gasto('2024-09-01', 500)] }),
    );
    expect(c.registrosIncompletos).toBe(false);
  });

  it('no divide por cero recién comprado el mismo día', () => {
    const c = calcularCosteTotalPropiedad(
      entrada({ vehiculo: vehiculo({ fechaCompra: HOY, kmCompra: 100000 }) }),
    );
    expect(c.meses).toBe(1);
    expect(Number.isFinite(c.centimosPorMes!)).toBe(true);
  });
});

describe('gastoPorMes', () => {
  it('agrupa por mes y separa las clases', () => {
    const filas = gastoPorMes(
      entrada({
        repostajes: [repostaje('2026-01-10', 60), repostaje('2026-01-25', 55)],
        mantenimientos: [mantenimiento('2026-01-15', 200)],
      }),
    );

    expect(filas).toHaveLength(1);
    expect(filas[0]!.mes).toBe('2026-01');
    expect(filas[0]!.energiaCentimos).toBe(11500);
    expect(filas[0]!.mantenimientoCentimos).toBe(20000);
    expect(filas[0]!.totalCentimos).toBe(31500);
  });

  it('rellena los meses sin ningún registro', () => {
    // Una gráfica que salta de enero a abril miente sobre la forma de la
    // serie: parecería que marzo fue un mes normal.
    const filas = gastoPorMes(
      entrada({ gastos: [gasto('2026-01-10', 100), gasto('2026-04-10', 100)] }),
    );

    expect(filas.map((f) => f.mes)).toEqual(['2026-01', '2026-02', '2026-03', '2026-04']);
    expect(filas[1]!.totalCentimos).toBe(0);
  });

  it('cruza el cambio de año', () => {
    const filas = gastoPorMes(
      entrada({ gastos: [gasto('2025-11-10', 100), gasto('2026-02-10', 100)] }),
    );
    expect(filas.map((f) => f.mes)).toEqual(['2025-11', '2025-12', '2026-01', '2026-02']);
  });

  it('devuelve lista vacía sin registros', () => {
    expect(gastoPorMes(entrada())).toEqual([]);
  });
});

describe('gastoPorCategoria', () => {
  it('cuenta combustible y mantenimiento como categorías propias', () => {
    // Sin ellos, el reparto dejaría fuera la mayor parte de lo que cuesta.
    const filas = gastoPorCategoria(
      entrada({
        repostajes: [repostaje('2026-01-01', 600)],
        mantenimientos: [mantenimiento('2026-02-01', 300)],
        gastos: [gasto('2026-03-01', 100, 'seguro')],
      }),
    );

    expect(filas.map((f) => f.categoria)).toEqual(['combustible', 'mantenimiento', 'seguro']);
    expect(filas[0]!.proporcion).toBeCloseTo(0.6, 5);
  });

  it('ordena de mayor a menor', () => {
    const filas = gastoPorCategoria(
      entrada({
        gastos: [
          gasto('2026-01-01', 50, 'parking'),
          gasto('2026-01-01', 500, 'seguro'),
          gasto('2026-01-01', 120, 'impuesto_circulacion'),
        ],
      }),
    );
    expect(filas.map((f) => f.categoria)).toEqual([
      'seguro',
      'impuesto_circulacion',
      'parking',
    ]);
  });

  it('agrupa varias entradas de la misma categoría', () => {
    const filas = gastoPorCategoria(
      entrada({
        gastos: [gasto('2026-01-01', 30, 'peajes'), gasto('2026-02-01', 20, 'peajes')],
      }),
    );
    expect(filas).toHaveLength(1);
    expect(filas[0]!.centimos).toBe(5000);
    expect(filas[0]!.proporcion).toBe(1);
  });

  it('devuelve lista vacía sin gasto', () => {
    expect(gastoPorCategoria(entrada())).toEqual([]);
  });
});

describe('ultimosMeses', () => {
  it('retrocede el número de meses indicado', () => {
    expect(ultimosMeses(12, '2026-08-24')).toEqual({ desde: '2025-08-24', hasta: '2026-08-24' });
    expect(ultimosMeses(3, '2026-01-15')).toEqual({ desde: '2025-10-15', hasta: '2026-01-15' });
  });
});
