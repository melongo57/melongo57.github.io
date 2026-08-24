import { describe, expect, it } from 'vitest';
import {
  ANTELACION_DOCUMENTO_DIAS,
  ANTELACION_MANTENIMIENTO,
  CATEGORIAS_VEHICULO,
  CATEGORIAS_GASTO,
  COMBUSTIBLES,
  ORDEN_CATEGORIA_GASTO,
  ORDEN_CATEGORIA_VEHICULO,
  ORDEN_DOCUMENTO,
  ORDEN_MANTENIMIENTO,
  TIPOS_DOCUMENTO,
  TIPOS_MANTENIMIENTO,
  nombreMantenimiento,
  plantillaReglas,
  unidadPrincipalDe,
  unidadesDe,
} from './catalogos.ts';

describe('integridad de los catálogos', () => {
  // Si se añade una clave al tipo y se olvida la etiqueta, la interfaz enseña
  // `undefined`. Estas comprobaciones lo cazan antes.
  it('cada orden cubre exactamente su catálogo', () => {
    const pares = [
      [ORDEN_CATEGORIA_VEHICULO, CATEGORIAS_VEHICULO],
      [ORDEN_MANTENIMIENTO, TIPOS_MANTENIMIENTO],
      [ORDEN_CATEGORIA_GASTO, CATEGORIAS_GASTO],
      [ORDEN_DOCUMENTO, TIPOS_DOCUMENTO],
    ] as const;

    for (const [orden, catalogo] of pares) {
      expect([...orden].sort()).toEqual(Object.keys(catalogo).sort());
    }
  });

  it('todas las etiquetas tienen nombre e icono', () => {
    const catalogos = [
      CATEGORIAS_VEHICULO,
      COMBUSTIBLES,
      TIPOS_MANTENIMIENTO,
      CATEGORIAS_GASTO,
      TIPOS_DOCUMENTO,
    ];
    for (const catalogo of catalogos) {
      for (const [clave, etiqueta] of Object.entries(catalogo)) {
        expect(etiqueta.nombre.length).toBeGreaterThan(0);
        expect(etiqueta.icono.length).toBeGreaterThan(0);
        expect(etiqueta.clave).toBe(clave);
      }
    }
  });

  it('cada mantenimiento y cada documento tiene antelación de aviso', () => {
    for (const tipo of ORDEN_MANTENIMIENTO) {
      const antelacion = ANTELACION_MANTENIMIENTO[tipo];
      expect(antelacion.avisoKm !== undefined || antelacion.avisoDias !== undefined).toBe(true);
    }
    for (const tipo of ORDEN_DOCUMENTO) {
      expect(ANTELACION_DOCUMENTO_DIAS[tipo]).toBeGreaterThan(0);
    }
  });
});

describe('unidades de energía', () => {
  it('un eléctrico solo carga kWh', () => {
    expect(unidadesDe('electrico')).toEqual(['kWh']);
    expect(unidadPrincipalDe('electrico')).toBe('kWh');
  });

  it('un híbrido enchufable admite las dos', () => {
    expect(unidadesDe('hibrido_enchufable')).toEqual(['l', 'kWh']);
  });

  it('el resto reposta litros', () => {
    for (const combustible of ['gasolina', 'diesel', 'hibrido', 'glp'] as const) {
      expect(unidadesDe(combustible)).toEqual(['l']);
      expect(unidadPrincipalDe(combustible)).toBe('l');
    }
  });
});

describe('plantillas de recurrencia', () => {
  it('toda regla puede dispararse por kilómetros o por tiempo', () => {
    const categorias = ORDEN_CATEGORIA_VEHICULO;
    const combustibles = ['gasolina', 'diesel', 'electrico'] as const;

    for (const categoria of categorias) {
      for (const combustible of combustibles) {
        for (const regla of Object.values(plantillaReglas(categoria, combustible))) {
          if (!regla) continue;
          // Una regla sin ninguno de los dos no vencería jamás y sería peor
          // que no tenerla: daría sensación de estar cubierto.
          expect(regla.cadaKm !== undefined || regla.cadaMeses !== undefined).toBe(true);
        }
      }
    }
  });

  it('un eléctrico no lleva aceite ni distribución, sea cual sea la categoría', () => {
    for (const categoria of ORDEN_CATEGORIA_VEHICULO) {
      const plantilla = plantillaReglas(categoria, 'electrico');
      expect(plantilla.aceite).toBeNull();
      expect(plantilla.distribucion).toBeNull();
    }
  });

  it('solo la autocaravana trae sellado de techo e instalación de gas', () => {
    const camper = plantillaReglas('autocaravana', 'diesel');
    expect(camper.sellado_techo?.cadaMeses).toBe(12);
    expect(camper.instalacion_gas?.cadaMeses).toBe(60);

    for (const categoria of ['turismo', 'furgoneta', 'moto', 'otro'] as const) {
      const plantilla = plantillaReglas(categoria, 'diesel');
      expect(plantilla.sellado_techo).toBeNull();
      expect(plantilla.instalacion_gas).toBeNull();
    }
  });

  it('la autocaravana se apoya en el tiempo, no en los kilómetros', () => {
    const camper = plantillaReglas('autocaravana', 'diesel');
    const turismo = plantillaReglas('turismo', 'diesel');

    // Rueda unos 5.000 km al año: con el intervalo de un turismo, el aceite
    // tardaría tres años en tocar mientras se degrada igual en el garaje.
    expect(camper.aceite?.cadaMeses).toBeLessThanOrEqual(24);
    expect(camper.aceite?.cadaKm).toBeGreaterThan(turismo.aceite!.cadaKm!);

    // Y sus neumáticos mueren de edad, no de desgaste.
    expect(camper.neumaticos?.cadaMeses).toBeGreaterThan(turismo.neumaticos!.cadaMeses!);
  });

  it('una moto cambia el aceite mucho más a menudo que un turismo', () => {
    const moto = plantillaReglas('moto', 'gasolina');
    const turismo = plantillaReglas('turismo', 'gasolina');
    expect(moto.aceite!.cadaKm!).toBeLessThan(turismo.aceite!.cadaKm!);
  });
});

describe('nombreMantenimiento', () => {
  it('usa la etiqueta del catálogo', () => {
    expect(nombreMantenimiento('aceite')).toBe('Cambio de aceite');
    expect(nombreMantenimiento('sellado_techo')).toBe('Sellado del techo');
  });

  it('respeta el nombre personalizado solo en el tipo "otro"', () => {
    expect(nombreMantenimiento('otro', 'Cambio de amortiguadores')).toBe(
      'Cambio de amortiguadores',
    );
    expect(nombreMantenimiento('aceite', 'Da igual lo que ponga')).toBe('Cambio de aceite');
    expect(nombreMantenimiento('otro', '   ')).toBe('Otro');
  });
});
