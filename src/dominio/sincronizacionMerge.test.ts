import { describe, expect, it } from 'vitest';
import {
  compararInstantes,
  fusionarRegistro,
  planificarSincronizacion,
} from './sincronizacionMerge.ts';

interface Cosa {
  id: string;
  actualizadoEn: string;
  borradoEn?: string | null;
  valor: string;
}

function cosa(id: string, actualizadoEn: string, valor = 'x', borradoEn: string | null = null): Cosa {
  return { id, actualizadoEn, valor, ...(borradoEn ? { borradoEn } : {}) };
}

describe('fusionarRegistro', () => {
  it('gana el único lado que existe', () => {
    const soloLocal = cosa('a', '2026-01-01T00:00:00Z');
    expect(fusionarRegistro(soloLocal, undefined)).toEqual({ origen: 'local', ganador: soloLocal });

    const soloRemoto = cosa('a', '2026-01-01T00:00:00Z');
    expect(fusionarRegistro(undefined, soloRemoto)).toEqual({
      origen: 'remoto',
      ganador: soloRemoto,
    });
  });

  it('devuelve null si no existe en ningún sitio', () => {
    expect(fusionarRegistro(undefined, undefined)).toBeNull();
  });

  it('gana el actualizadoEn más reciente', () => {
    const local = cosa('a', '2026-01-02T00:00:00Z', 'nuevo-local');
    const remoto = cosa('a', '2026-01-01T00:00:00Z', 'viejo-remoto');
    expect(fusionarRegistro(local, remoto)).toEqual({ origen: 'local', ganador: local });

    const localViejo = cosa('a', '2026-01-01T00:00:00Z');
    const remotoNuevo = cosa('a', '2026-01-03T00:00:00Z');
    expect(fusionarRegistro(localViejo, remotoNuevo)).toEqual({
      origen: 'remoto',
      ganador: remotoNuevo,
    });
  });

  it('en empate exacto no hace nada: es el caso normal de dos copias ya sincronizadas', () => {
    /*
     * El caso de verdad frecuente NO es un conflicto: es que las dos copias
     * ya están sincronizadas y comparten el mismo `actualizadoEn` porque
     * vienen de la última sincronización que convergió. Tratarlo como
     * "gana remoto" forzaría reescribir localmente la tabla entera en cada
     * ronda, incluso sin ningún cambio real. Un empate con contenido distinto
     * en el mismo milisegundo exacto no ocurre en la práctica: cada escritura
     * local estampa `actualizadoEn` de nuevo, así que dos ediciones
     * independientes no pueden coincidir al milisegundo.
     */
    const local = cosa('a', '2026-01-01T00:00:00.000Z');
    const remoto = cosa('a', '2026-01-01T00:00:00.000Z');
    expect(fusionarRegistro(local, remoto)).toEqual({ origen: 'igual', ganador: remoto });
  });

  it('un borrado más reciente gana igual que cualquier otro cambio', () => {
    // El borrado es solo un `borradoEn` puesto: no necesita trato especial en
    // la comparación, gana por fecha como cualquier otra edición.
    const local = cosa('a', '2026-01-01T00:00:00Z');
    const remotoBorrado = cosa('a', '2026-01-05T00:00:00Z', 'x', '2026-01-05T00:00:00Z');
    const resultado = fusionarRegistro(local, remotoBorrado);
    expect(resultado?.origen).toBe('remoto');
    expect(resultado?.ganador.borradoEn).toBe('2026-01-05T00:00:00Z');
  });
});

describe('planificarSincronizacion', () => {
  it('sube lo local que no existe en remoto', () => {
    const plan = planificarSincronizacion([cosa('a', '2026-01-01T00:00:00Z')], []);
    expect(plan.aEmpujar).toHaveLength(1);
    expect(plan.aAplicarLocal).toHaveLength(0);
  });

  it('aplica lo remoto que no existe en local', () => {
    const plan = planificarSincronizacion([], [cosa('a', '2026-01-01T00:00:00Z')]);
    expect(plan.aAplicarLocal).toHaveLength(1);
    expect(plan.aEmpujar).toHaveLength(0);
  });

  it('no hace nada si las dos copias son idénticas en fecha', () => {
    const plan = planificarSincronizacion(
      [cosa('a', '2026-01-01T00:00:00Z')],
      [cosa('a', '2026-01-01T00:00:00Z')],
    );
    expect(plan.aEmpujar).toEqual([]);
    expect(plan.aAplicarLocal).toEqual([]);
  });

  it('reparte varios registros según quién los tenga más nuevos', () => {
    const plan = planificarSincronizacion(
      [
        cosa('nuevo-en-local', '2026-03-01T00:00:00Z'),
        cosa('sin-cambios', '2026-01-01T00:00:00Z'),
        cosa('nuevo-en-remoto', '2026-01-01T00:00:00Z'),
      ],
      [
        cosa('sin-cambios', '2026-01-01T00:00:00Z'),
        cosa('nuevo-en-remoto', '2026-02-01T00:00:00Z'),
      ],
    );

    expect(plan.aEmpujar.map((r) => r.id)).toEqual(['nuevo-en-local']);
    expect(plan.aAplicarLocal.map((r) => r.id)).toEqual(['nuevo-en-remoto']);
  });

  it('propaga un borrado hecho en otro dispositivo', () => {
    // Se sembró en un dispositivo, se borró en otro: el que todavía lo tiene
    // debe recibir el aviso de borrado, no conservarlo para siempre.
    const plan = planificarSincronizacion(
      [cosa('a', '2026-01-01T00:00:00Z')],
      [cosa('a', '2026-02-01T00:00:00Z', 'x', '2026-02-01T00:00:00Z')],
    );
    expect(plan.aAplicarLocal).toHaveLength(1);
    expect(plan.aAplicarLocal[0]!.borradoEn).toBe('2026-02-01T00:00:00Z');
  });

  it('no se rompe con las dos colecciones vacías', () => {
    expect(planificarSincronizacion([], [])).toEqual({ aEmpujar: [], aAplicarLocal: [] });
  });
});

describe('comparación de marcas de tiempo entre Postgres y JavaScript', () => {
  it('trata «Z» y «+00:00» como el mismo instante', () => {
    /*
     * Postgres devuelve `+00:00`; `Date.toISOString()` produce `Z`. Comparados
     * como texto no solo son distintos: `Z` (0x5A) ordena por encima de `+`
     * (0x2B), así que un registro recién creado en local ganaría SIEMPRE y se
     * re-subiría en cada sincronización sin converger jamás.
     */
    const local = cosa('a', '2026-08-25T06:49:33.157Z');
    const remoto = cosa('a', '2026-08-25T06:49:33.157+00:00');

    expect(compararInstantes(local.actualizadoEn, remoto.actualizadoEn)).toBe(0);
    expect(fusionarRegistro(local, remoto)?.origen).toBe('igual');
    expect(planificarSincronizacion([local], [remoto])).toEqual({
      aEmpujar: [],
      aAplicarLocal: [],
    });
  });

  it('sigue distinguiendo instantes de verdad distintos entre formatos', () => {
    const local = cosa('a', '2026-08-25T06:49:34.000Z');
    const remoto = cosa('a', '2026-08-25T06:49:33.157+00:00');
    expect(fusionarRegistro(local, remoto)?.origen).toBe('local');
  });

  it('respeta las zonas horarias que no son UTC', () => {
    // Las 08:49 en Madrid (+02:00) son las 06:49 UTC: el mismo instante.
    const local = cosa('a', '2026-08-25T06:49:33.157Z');
    const remoto = cosa('a', '2026-08-25T08:49:33.157+02:00');
    expect(compararInstantes(local.actualizadoEn, remoto.actualizadoEn)).toBe(0);
  });

  it('no declara todo distinto si una fecha viene corrupta', () => {
    // Con NaN, cualquier comparación numérica sería falsa y el registro
    // quedaría en un ping-pong permanente.
    expect(compararInstantes('no-es-fecha', 'no-es-fecha')).toBe(0);
  });
});
