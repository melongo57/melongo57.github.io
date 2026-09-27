import { describe, expect, it } from 'vitest';
import {
  APUNTES_ALERTA,
  CATEGORIAS_VEHICULO,
  CATEGORIAS_GASTO,
  COMBUSTIBLES,
  ORDEN_APUNTE_ALERTA,
  ORDEN_CATEGORIA_GASTO,
  ORDEN_CATEGORIA_VEHICULO,
  ORDEN_DOCUMENTO,
  TIPOS_DOCUMENTO,
  sugerenciasAlerta,
  unidadPrincipalDe,
  unidadesDe,
} from './catalogos.ts';

const COMBUSTIBLES_PRUEBA = ['gasolina', 'diesel', 'electrico'] as const;

function claves(categoria: Parameters<typeof sugerenciasAlerta>[0], combustible: Parameters<typeof sugerenciasAlerta>[1]) {
  return sugerenciasAlerta(categoria, combustible).map((s) => s.clave);
}

function sugerencia(
  categoria: Parameters<typeof sugerenciasAlerta>[0],
  combustible: Parameters<typeof sugerenciasAlerta>[1],
  clave: string,
) {
  return sugerenciasAlerta(categoria, combustible).find((s) => s.clave === clave);
}

describe('integridad de los catálogos', () => {
  // Si se añade una clave al tipo y se olvida la etiqueta, la interfaz enseña
  // `undefined`. Estas comprobaciones lo cazan antes.
  it('cada orden cubre exactamente su catálogo', () => {
    const pares = [
      [ORDEN_CATEGORIA_VEHICULO, CATEGORIAS_VEHICULO],
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
      CATEGORIAS_GASTO,
      TIPOS_DOCUMENTO,
      APUNTES_ALERTA,
    ];
    for (const catalogo of catalogos) {
      for (const [clave, etiqueta] of Object.entries(catalogo)) {
        expect(etiqueta.nombre.length).toBeGreaterThan(0);
        expect(etiqueta.icono.length).toBeGreaterThan(0);
        expect(etiqueta.clave).toBe(clave);
      }
    }
  });

  it('el orden de apuntes solo usa apuntes que existen', () => {
    for (const apunte of ORDEN_APUNTE_ALERTA) {
      expect(APUNTES_ALERTA[apunte]).toBeDefined();
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

describe('sugerencias de alerta', () => {
  it('toda sugerencia puede vencer por algo', () => {
    for (const categoria of ORDEN_CATEGORIA_VEHICULO) {
      for (const combustible of COMBUSTIBLES_PRUEBA) {
        for (const s of sugerenciasAlerta(categoria, combustible)) {
          // Una alerta sin intervalo ni fecha no vencería jamás y sería peor
          // que no tenerla: daría sensación de estar cubierto.
          expect(s.cadaKm !== undefined || s.cadaMeses !== undefined).toBe(true);
        }
      }
    }
  });

  it('las claves no se repiten dentro de un vehículo', () => {
    for (const categoria of ORDEN_CATEGORIA_VEHICULO) {
      for (const combustible of COMBUSTIBLES_PRUEBA) {
        const lista = claves(categoria, combustible);
        expect(new Set(lista).size).toBe(lista.length);
      }
    }
  });

  it('los papeles salen para cualquier vehículo, con su apunte de gasto', () => {
    for (const categoria of ORDEN_CATEGORIA_VEHICULO) {
      expect(sugerencia(categoria, 'diesel', 'itv')?.apunte).toBe('itv');
      expect(sugerencia(categoria, 'diesel', 'seguro')?.apunte).toBe('seguro');
      expect(sugerencia(categoria, 'diesel', 'impuesto')?.apunte).toBe('impuesto_circulacion');
    }
  });

  it('se marcan pocas de entrada: el usuario se quejaba de las que sobraban', () => {
    for (const categoria of ORDEN_CATEGORIA_VEHICULO) {
      for (const combustible of COMBUSTIBLES_PRUEBA) {
        const basicas = sugerenciasAlerta(categoria, combustible).filter((s) => s.basica);
        expect(basicas.length).toBeGreaterThan(0);
        expect(basicas.length).toBeLessThanOrEqual(5);
      }
    }
  });

  it('un eléctrico no lleva aceite ni distribución, sea cual sea la categoría', () => {
    for (const categoria of ORDEN_CATEGORIA_VEHICULO) {
      const lista = claves(categoria, 'electrico');
      expect(lista).not.toContain('aceite');
      expect(lista).not.toContain('distribucion');
    }
  });

  it('solo la autocaravana trae sellado de techo e instalación de gas, y marcados', () => {
    expect(sugerencia('autocaravana', 'diesel', 'sellado_techo')?.cadaMeses).toBe(12);
    expect(sugerencia('autocaravana', 'diesel', 'sellado_techo')?.basica).toBe(true);
    expect(sugerencia('autocaravana', 'diesel', 'instalacion_gas')?.cadaMeses).toBe(60);

    for (const categoria of ['turismo', 'furgoneta', 'moto', 'otro'] as const) {
      expect(claves(categoria, 'diesel')).not.toContain('sellado_techo');
      expect(claves(categoria, 'diesel')).not.toContain('instalacion_gas');
    }
  });

  it('la autocaravana se apoya en el tiempo, no en los kilómetros', () => {
    const camper = sugerencia('autocaravana', 'diesel', 'aceite')!;
    const turismo = sugerencia('turismo', 'diesel', 'aceite')!;
    // Rueda unos 5.000 km al año: con el intervalo de un turismo, el aceite
    // tardaría tres años en tocar mientras se degrada igual en el garaje.
    expect(camper.cadaMeses).toBeLessThanOrEqual(24);
    expect(camper.cadaKm).toBeGreaterThan(turismo.cadaKm!);

    // Y sus neumáticos mueren de edad, no de desgaste.
    expect(sugerencia('autocaravana', 'diesel', 'neumaticos')!.cadaMeses).toBeGreaterThan(
      sugerencia('turismo', 'diesel', 'neumaticos')!.cadaMeses!,
    );
  });

  it('una moto cambia el aceite mucho más a menudo que un turismo', () => {
    expect(sugerencia('moto', 'gasolina', 'aceite')!.cadaKm!).toBeLessThan(
      sugerencia('turismo', 'gasolina', 'aceite')!.cadaKm!,
    );
  });
});
