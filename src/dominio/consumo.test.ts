import { describe, expect, it } from 'vitest';
import {
  calcularTramos,
  completarRepostaje,
  precioUnitario,
  recalcularTrio,
  resumirConsumo,
} from './consumo.ts';
import type { Repostaje, UnidadEnergia } from './tipos.ts';

let contador = 0;

function r(cambios: {
  km?: number;
  cantidad: number;
  lleno?: boolean;
  ruptura?: boolean;
  fecha?: string;
  euros?: number;
  unidad?: UnidadEnergia;
  id?: string;
}): Repostaje {
  contador += 1;
  return {
    id: cambios.id ?? `r${contador}`,
    creadoEn: '',
    actualizadoEn: '',
    vehiculoId: 'v1',
    fecha: cambios.fecha ?? '2026-01-01',
    cantidad: cambios.cantidad,
    unidad: cambios.unidad ?? 'l',
    importeCentimos: Math.round((cambios.euros ?? cambios.cantidad * 1.5) * 100),
    ...(cambios.km !== undefined ? { km: cambios.km } : {}),
    depositoLleno: cambios.lleno ?? true,
    rupturaSerie: cambios.ruptura ?? false,
    adjuntoIds: [],
  };
}

describe('método de lleno a lleno', () => {
  it('mide el consumo entre dos depósitos llenos', () => {
    // 50 l para recorrer 1.000 km = 5 l/100 km.
    const { tramos } = calcularTramos([
      r({ km: 100000, cantidad: 40 }),
      r({ km: 101000, cantidad: 50 }),
    ]);

    expect(tramos).toHaveLength(1);
    expect(tramos[0]!.km).toBe(1000);
    expect(tramos[0]!.cantidad).toBe(50);
    expect(tramos[0]!.consumo).toBe(5);
  });

  it('el primer repostaje no genera tramo: no hay desde dónde medir', () => {
    const { tramos } = calcularTramos([r({ km: 100000, cantidad: 40 })]);
    expect(tramos).toEqual([]);
  });

  it('atribuye el tramo a la fecha del repostaje que lo cierra', () => {
    const { tramos } = calcularTramos([
      r({ km: 100000, cantidad: 40, fecha: '2026-01-01' }),
      r({ km: 101000, cantidad: 50, fecha: '2026-01-20' }),
    ]);
    expect(tramos[0]!.fecha).toBe('2026-01-20');
  });

  it('un lleno cierra un tramo y abre el siguiente', () => {
    const { tramos } = calcularTramos([
      r({ km: 100000, cantidad: 40 }),
      r({ km: 100800, cantidad: 48 }),
      r({ km: 101600, cantidad: 40 }),
    ]);

    expect(tramos).toHaveLength(2);
    expect(tramos[0]!.consumo).toBe(6);
    expect(tramos[1]!.consumo).toBe(5);
  });
});

describe('repostajes parciales', () => {
  it('los suma al tramo en vez de descartarlos', () => {
    /*
     * Este es el caso que rompe el cálculo ingenuo. Entre dos llenos hay un
     * parcial de 20 l; en total se han quemado 20 + 40 = 60 l en 1.000 km.
     * Dividir repostaje a repostaje daría 20/400 y 40/600, dos cifras que no
     * significan nada.
     */
    const { tramos } = calcularTramos([
      r({ km: 100000, cantidad: 45 }),
      r({ km: 100400, cantidad: 20, lleno: false }),
      r({ km: 101000, cantidad: 40 }),
    ]);

    expect(tramos).toHaveLength(1);
    expect(tramos[0]!.km).toBe(1000);
    expect(tramos[0]!.cantidad).toBe(60);
    expect(tramos[0]!.consumo).toBe(6);
    expect(tramos[0]!.parciales).toBe(1);
  });

  it('aguanta varios parciales seguidos', () => {
    const { tramos } = calcularTramos([
      r({ km: 100000, cantidad: 45 }),
      r({ km: 100200, cantidad: 15, lleno: false }),
      r({ km: 100500, cantidad: 15, lleno: false }),
      r({ km: 101000, cantidad: 30 }),
    ]);

    expect(tramos).toHaveLength(1);
    expect(tramos[0]!.cantidad).toBe(60);
    expect(tramos[0]!.parciales).toBe(2);
  });

  it('un parcial antes del primer lleno no cuenta para nada', () => {
    const { tramos, descartados } = calcularTramos([
      r({ id: 'parcial', km: 99000, cantidad: 20, lleno: false }),
      r({ km: 100000, cantidad: 45 }),
      r({ km: 101000, cantidad: 50 }),
    ]);

    expect(tramos).toHaveLength(1);
    expect(tramos[0]!.cantidad).toBe(50);
    expect(descartados).toContainEqual({ id: 'parcial', motivo: 'sin_lleno_previo' });
  });
});

describe('ruptura de serie', () => {
  it('invalida el tramo que termina en ella', () => {
    const { tramos, descartados } = calcularTramos([
      r({ km: 100000, cantidad: 45 }),
      r({ id: 'roto', km: 102000, cantidad: 50, ruptura: true }),
    ]);

    // Hubo repostajes sin anotar por medio: 50 l no explican 2.000 km.
    expect(tramos).toEqual([]);
    expect(descartados).toContainEqual({ id: 'roto', motivo: 'ruptura_serie' });
  });

  it('pero sí puede abrir el siguiente tramo', () => {
    const { tramos } = calcularTramos([
      r({ km: 100000, cantidad: 45 }),
      r({ km: 102000, cantidad: 50, ruptura: true }),
      r({ km: 103000, cantidad: 55 }),
    ]);

    expect(tramos).toHaveLength(1);
    expect(tramos[0]!.km).toBe(1000);
    expect(tramos[0]!.consumo).toBe(5.5);
  });

  it('una ruptura en un parcial también invalida el tramo entero', () => {
    const { tramos } = calcularTramos([
      r({ km: 100000, cantidad: 45 }),
      r({ km: 100500, cantidad: 20, lleno: false, ruptura: true }),
      r({ km: 101000, cantidad: 30 }),
    ]);
    expect(tramos).toEqual([]);
  });
});

describe('datos incompletos', () => {
  it('un repostaje sin kilómetros suma su combustible al tramo', () => {
    // Te olvidaste de mirar el cuadro, pero el combustible se ha quemado.
    const { tramos, descartados } = calcularTramos([
      r({ km: 100000, cantidad: 45 }),
      r({ id: 'sin-km', cantidad: 20, lleno: false }),
      r({ km: 101000, cantidad: 40 }),
    ]);

    expect(tramos).toHaveLength(1);
    expect(tramos[0]!.cantidad).toBe(60);
    expect(descartados).toContainEqual({ id: 'sin-km', motivo: 'sin_km' });
  });

  it('descarta un tramo sin avance de odómetro', () => {
    const { tramos, descartados } = calcularTramos([
      r({ km: 100000, cantidad: 45 }),
      r({ id: 'mismo-km', km: 100000, cantidad: 10 }),
    ]);

    expect(tramos).toEqual([]);
    expect(descartados).toContainEqual({ id: 'mismo-km', motivo: 'sin_avance' });
  });

  it('no se rompe con una lista vacía', () => {
    expect(calcularTramos([])).toEqual({ tramos: [], descartados: [] });
  });
});

describe('orden de entrada', () => {
  it('no depende de cómo se hayan introducido los repostajes', () => {
    const desordenados = [
      r({ km: 101000, cantidad: 50, fecha: '2026-02-01' }),
      r({ km: 100000, cantidad: 40, fecha: '2026-01-01' }),
      r({ km: 100400, cantidad: 20, lleno: false, fecha: '2026-01-15' }),
    ];

    const { tramos } = calcularTramos(desordenados);
    expect(tramos).toHaveLength(1);
    expect(tramos[0]!.cantidad).toBe(70);
  });
});

describe('resumirConsumo', () => {
  it('pondera por kilómetros y no hace media de medias', () => {
    /*
     * Dos tramos: 900 km a 5 l/100 y 100 km a 15 l/100.
     * Media de medias: (5 + 15) / 2 = 10, que no es lo que has gastado.
     * Ponderada: (45 + 15) l / 1.000 km = 6 l/100 km. Esta es la buena.
     */
    const resumen = resumirConsumo(
      [
        r({ km: 100000, cantidad: 40 }),
        r({ km: 100900, cantidad: 45 }),
        r({ km: 101000, cantidad: 15 }),
      ],
      'l',
    );

    expect(resumen.tramos).toHaveLength(2);
    expect(resumen.consumoMedio).toBeCloseTo(6, 5);
  });

  it('la media reciente solo mira los últimos tramos', () => {
    // Cinco tramos a 5 l/100 y luego tres a 8 l/100.
    const repostajes = [r({ km: 100000, cantidad: 40 })];
    for (let i = 1; i <= 5; i += 1) {
      repostajes.push(r({ km: 100000 + i * 1000, cantidad: 50 }));
    }
    for (let i = 6; i <= 8; i += 1) {
      repostajes.push(r({ km: 100000 + i * 1000, cantidad: 80 }));
    }

    const resumen = resumirConsumo(repostajes, 'l', { tramosRecientes: 3 });
    expect(resumen.consumoMedio).toBeCloseTo(6.125, 3);
    expect(resumen.consumoReciente).toBeCloseTo(8, 5);
  });

  it('separa las unidades de un híbrido enchufable', () => {
    const repostajes = [
      r({ km: 50000, cantidad: 30, unidad: 'l' }),
      r({ km: 50600, cantidad: 30, unidad: 'l' }),
      r({ km: 50000, cantidad: 10, unidad: 'kWh' }),
      r({ km: 50300, cantidad: 12, unidad: 'kWh' }),
    ];

    const litros = resumirConsumo(repostajes, 'l');
    const kilovatios = resumirConsumo(repostajes, 'kWh');

    expect(litros.tramos).toHaveLength(1);
    expect(litros.consumoMedio).toBeCloseTo(5, 5);
    expect(kilovatios.tramos).toHaveLength(1);
    expect(kilovatios.consumoMedio).toBeCloseTo(4, 5);
  });

  it('un eléctrico calcula igual, en kWh', () => {
    const resumen = resumirConsumo(
      [
        r({ km: 30000, cantidad: 40, unidad: 'kWh' }),
        r({ km: 30250, cantidad: 43.5, unidad: 'kWh' }),
      ],
      'kWh',
    );

    expect(resumen.unidad).toBe('kWh');
    expect(resumen.consumoMedio).toBeCloseTo(17.4, 5);
  });

  it('devuelve null en vez de cero cuando no hay tramos', () => {
    // Cero significaría «no gasta nada», que es una mentira distinta de
    // «todavía no lo sé».
    const resumen = resumirConsumo([r({ km: 100000, cantidad: 40 })], 'l');
    expect(resumen.consumoMedio).toBeNull();
    expect(resumen.consumoReciente).toBeNull();
  });

  it('pondera el precio medio por cantidad, no por repostaje', () => {
    // 60 l a 1,50 y 5 l a 1,90. La media aritmética diría 1,70; la real
    // es 1,53, porque casi todo lo repostaste barato.
    const resumen = resumirConsumo(
      [
        r({ km: 100000, cantidad: 60, euros: 90 }),
        r({ km: 100500, cantidad: 5, euros: 9.5 }),
      ],
      'l',
    );

    expect(resumen.precioMedio).toBeCloseTo(1.531, 3);
  });
});

describe('precioUnitario', () => {
  it('deriva el precio del importe y la cantidad', () => {
    expect(precioUnitario(r({ cantidad: 42.37, euros: 67.33 }))).toBeCloseTo(1.589, 3);
  });

  it('no divide por cero', () => {
    expect(precioUnitario(r({ cantidad: 0, euros: 10 }))).toBeNull();
  });
});

describe('completarRepostaje', () => {
  it('calcula el importe con litros y precio', () => {
    const r = completarRepostaje({ cantidad: 42.37, precioUnitario: 1.589, importeEuros: null });
    expect(r.importeEuros).toBe(67.33);
  });

  it('calcula el precio con litros e importe', () => {
    const r = completarRepostaje({ cantidad: 42.37, precioUnitario: null, importeEuros: 67.33 });
    expect(r.precioUnitario).toBe(1.589);
  });

  it('calcula los litros con precio e importe', () => {
    const r = completarRepostaje({ cantidad: null, precioUnitario: 1.589, importeEuros: 67.33 });
    expect(r.cantidad).toBe(42.37);
  });

  it('no toca nada si ya están los tres', () => {
    const entrada = { cantidad: 40, precioUnitario: 1.5, importeEuros: 99 };
    // Si el usuario ha escrito los tres, manda él: quizá el surtidor redondeó.
    expect(completarRepostaje(entrada)).toEqual(entrada);
  });

  it('no inventa nada con un solo dato', () => {
    const entrada = { cantidad: 40, precioUnitario: null, importeEuros: null };
    expect(completarRepostaje(entrada)).toEqual(entrada);
  });

  it('ignora ceros y valores imposibles', () => {
    expect(
      completarRepostaje({ cantidad: 0, precioUnitario: 1.5, importeEuros: null }).importeEuros,
    ).toBeNull();
    expect(
      completarRepostaje({ cantidad: 40, precioUnitario: null, importeEuros: -10 }).precioUnitario,
    ).toBeNull();
  });
});

describe('recalcularTrio', () => {
  it('al escribir los litros con el precio puesto, calcula el importe', () => {
    const r = recalcularTrio('cantidad', {
      cantidad: 42.37,
      precioUnitario: 1.589,
      importeEuros: null,
    });
    expect(r.importeEuros).toBe(67.33);
  });

  it('al escribir los litros sin precio pero con importe, calcula el precio', () => {
    const r = recalcularTrio('cantidad', {
      cantidad: 42.37,
      precioUnitario: null,
      importeEuros: 67.33,
    });
    expect(r.precioUnitario).toBe(1.589);
  });

  it('corrige el campo derivado aunque los tres estén puestos', () => {
    /*
     * El caso real: has metido litros y precio, la app calculó el importe, y
     * ahora corriges los litros porque leíste mal el surtidor. El importe
     * tiene que seguirte, no quedarse con el valor viejo.
     */
    const r = recalcularTrio('cantidad', {
      cantidad: 50,
      precioUnitario: 1.6,
      importeEuros: 67.33,
    });
    expect(r.importeEuros).toBe(80);
  });

  it('al corregir el importe recalcula el precio, no los litros', () => {
    // Los litros los has leído del surtidor; el precio es el derivado.
    const r = recalcularTrio('importeEuros', {
      cantidad: 40,
      precioUnitario: 1.5,
      importeEuros: 68,
    });
    expect(r.cantidad).toBe(40);
    expect(r.precioUnitario).toBe(1.7);
  });

  it('con el precio y el importe deduce los litros', () => {
    const r = recalcularTrio('importeEuros', {
      cantidad: null,
      precioUnitario: 1.589,
      importeEuros: 67.33,
    });
    expect(r.cantidad).toBe(42.37);
  });

  it('no hace nada con un solo campo', () => {
    const entrada = { cantidad: 40, precioUnitario: null, importeEuros: null };
    expect(recalcularTrio('cantidad', entrada)).toEqual(entrada);
  });

  it('no hace nada si el campo tocado se ha vaciado', () => {
    // Borrar los litros para reescribirlos no debe disparar ningún cálculo.
    const entrada = { cantidad: null, precioUnitario: 1.589, importeEuros: 67.33 };
    expect(recalcularTrio('cantidad', entrada)).toEqual(entrada);
  });
});
