import { describe, expect, it } from 'vitest';
import type { PuntoOdometro } from './tipos.ts';
import { incidenciasDe, validarLectura, validarVehiculo } from './validacion.ts';

function p(fecha: string, km: number, refId = fecha): PuntoOdometro {
  return { fecha, km, origen: 'manual', refId };
}

const HOY = '2026-08-24';

describe('validarLectura', () => {
  const historico = [p('2026-06-01', 120000), p('2026-08-01', 125000)];

  it('acepta una lectura coherente sin molestar', () => {
    const v = validarLectura(historico, { fecha: HOY, km: 126200 }, { hoy: HOY });
    expect(v.valido).toBe(true);
    expect(v.requiereConfirmacion).toBe(false);
    expect(v.incidencias).toHaveLength(0);
  });

  it('avisa, sin bloquear, cuando el odómetro retrocede', () => {
    const v = validarLectura(historico, { fecha: HOY, km: 124000 }, { hoy: HOY });

    // Se puede guardar (un cuadro sustituido es real), pero hay que confirmar.
    expect(v.valido).toBe(true);
    expect(v.requiereConfirmacion).toBe(true);

    const sobreKm = incidenciasDe(v, 'km');
    expect(sobreKm).toHaveLength(1);
    // El mensaje tiene que dar los datos concretos, no un «revisa el valor».
    // (Sin separador de millares en «1000»: en español no se pone en las
    // cifras de cuatro dígitos, y `Intl` lo respeta.)
    expect(sobreKm[0]!.mensaje).toContain('125.000 km');
    expect(sobreKm[0]!.mensaje).toContain('124.000 km');
    expect(sobreKm[0]!.mensaje).toContain('1000 km menos');
  });

  it('también mira hacia delante al registrar con fecha atrasada', () => {
    const v = validarLectura(historico, { fecha: '2026-07-01', km: 130000 }, { hoy: HOY });
    expect(v.requiereConfirmacion).toBe(true);
    expect(incidenciasDe(v, 'km')[0]!.mensaje).toContain('registro posterior');
  });

  it('detecta el cero de más', () => {
    const v = validarLectura(historico, { fecha: '2026-08-05', km: 1250000 }, { hoy: HOY });
    expect(v.requiereConfirmacion).toBe(true);
    expect(incidenciasDe(v, 'km').some((i) => i.mensaje.includes('cero'))).toBe(true);
  });

  it('no confunde un viaje largo con un error', () => {
    // 1.100 km en un día es una paliza, pero se hace.
    const v = validarLectura(
      [p('2026-08-01', 125000)],
      { fecha: '2026-08-02', km: 126100 },
      { hoy: HOY },
    );
    expect(v.requiereConfirmacion).toBe(false);
  });

  it('avisa de una fecha futura', () => {
    const v = validarLectura(historico, { fecha: '2027-01-01', km: 130000 }, { hoy: HOY });
    expect(incidenciasDe(v, 'fecha')).toHaveLength(1);
  });

  it('rechaza lo que no es un kilometraje', () => {
    for (const km of [-1, 1250.5, Number.NaN]) {
      const v = validarLectura(historico, { fecha: HOY, km }, { hoy: HOY });
      expect(v.valido).toBe(false);
    }
  });

  it('rechaza una fecha imposible', () => {
    const v = validarLectura(historico, { fecha: '2026-02-30', km: 126000 }, { hoy: HOY });
    expect(v.valido).toBe(false);
  });

  it('al editar, no compara el registro consigo mismo', () => {
    const puntos = [p('2026-08-01', 125000, 'lectura-1')];

    // Sin excluir, corregir 125.000 a 124.500 se vería como un retroceso.
    expect(
      validarLectura(puntos, { fecha: '2026-08-01', km: 124500 }, { hoy: HOY })
        .requiereConfirmacion,
    ).toBe(true);

    expect(
      validarLectura(
        puntos,
        { fecha: '2026-08-01', km: 124500 },
        { hoy: HOY, excluirRefId: 'lectura-1' },
      ).requiereConfirmacion,
    ).toBe(false);
  });

  it('acepta la primera lectura de un vehículo sin histórico', () => {
    const v = validarLectura([], { fecha: HOY, km: 0 }, { hoy: HOY });
    expect(v.valido).toBe(true);
    expect(v.requiereConfirmacion).toBe(false);
  });
});

describe('validarVehiculo', () => {
  const base = {
    alias: 'El Golf',
    categoria: 'turismo',
    marca: 'Volkswagen',
    modelo: 'Golf',
    matricula: '4821 KRT',
    anio: 2018,
    combustible: 'diesel',
    estado: 'activo',
  } as const;

  it('acepta un vehículo bien rellenado', () => {
    const v = validarVehiculo(base, { hoy: HOY });
    expect(v.valido).toBe(true);
    expect(v.requiereConfirmacion).toBe(false);
  });

  it('exige los campos que identifican al vehículo', () => {
    const v = validarVehiculo(
      { ...base, alias: '  ', marca: '', modelo: '', matricula: '' },
      { hoy: HOY },
    );
    expect(v.valido).toBe(false);
    for (const campo of ['alias', 'marca', 'modelo', 'matricula']) {
      expect(incidenciasDe(v, campo)).toHaveLength(1);
    }
  });

  it('acepta matrículas antiguas y avisa de las extranjeras', () => {
    expect(validarVehiculo({ ...base, matricula: 'M-1234-AB' }, { hoy: HOY }).valido).toBe(true);
    expect(
      validarVehiculo({ ...base, matricula: 'M-1234-AB' }, { hoy: HOY }).requiereConfirmacion,
    ).toBe(false);

    // Una placa de importación se puede guardar, pero se avisa.
    const importado = validarVehiculo({ ...base, matricula: 'AB-123-CD-EF' }, { hoy: HOY });
    expect(importado.valido).toBe(true);
    expect(incidenciasDe(importado, 'matricula')).toHaveLength(1);
  });

  it('acota el año a algo posible', () => {
    expect(validarVehiculo({ ...base, anio: 1850 }, { hoy: HOY }).valido).toBe(false);
    expect(validarVehiculo({ ...base, anio: 2030 }, { hoy: HOY }).valido).toBe(false);
    // El año que viene sí: los coches se matriculan por adelantado.
    expect(validarVehiculo({ ...base, anio: 2027 }, { hoy: HOY }).valido).toBe(true);
  });

  it('comprueba el formato del bastidor sin bloquear', () => {
    const corto = validarVehiculo({ ...base, bastidor: 'ABC123' }, { hoy: HOY });
    expect(corto.valido).toBe(true);
    expect(incidenciasDe(corto, 'bastidor')).toHaveLength(1);

    // Las letras I, O y Q no existen en un VIN, para no confundirlas con 1 y 0.
    expect(
      incidenciasDe(
        validarVehiculo({ ...base, bastidor: 'WVWZZZAUZKWI23456' }, { hoy: HOY }),
        'bastidor',
      ),
    ).toHaveLength(1);

    expect(
      incidenciasDe(
        validarVehiculo({ ...base, bastidor: 'WVWZZZAUZKW123456' }, { hoy: HOY }),
        'bastidor',
      ),
    ).toHaveLength(0);
  });

  it('exige la fecha de venta al marcar un vehículo como vendido', () => {
    const v = validarVehiculo({ ...base, estado: 'vendido' }, { hoy: HOY });
    expect(v.valido).toBe(false);
    expect(incidenciasDe(v, 'fechaVenta')).toHaveLength(1);
  });

  it('no deja vender antes de comprar', () => {
    const v = validarVehiculo(
      { ...base, estado: 'vendido', fechaCompra: '2020-01-01', fechaVenta: '2019-01-01' },
      { hoy: HOY },
    );
    expect(v.valido).toBe(false);
  });

  it('avisa si el vehículo se vendió con menos kilómetros de los que tenía', () => {
    const v = validarVehiculo(
      {
        ...base,
        estado: 'vendido',
        fechaCompra: '2013-06-02',
        fechaVenta: '2024-12-24',
        kmCompra: 62000,
        kmVenta: 40000,
      },
      { hoy: HOY },
    );
    expect(v.valido).toBe(true);
    expect(incidenciasDe(v, 'kmVenta')).toHaveLength(1);
  });

  it('avisa si lo compraste antes del año del modelo', () => {
    const v = validarVehiculo({ ...base, anio: 2018, fechaCompra: '2016-01-01' }, { hoy: HOY });
    expect(v.valido).toBe(true);
    expect(incidenciasDe(v, 'fechaCompra')).toHaveLength(1);
  });
});
