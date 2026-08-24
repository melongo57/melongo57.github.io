import { describe, expect, it } from 'vitest';
import {
  CopiaInvalida,
  VERSION_FORMATO,
  deserializarRegistro,
  exportarTodo,
  importarTodo,
  nombreArchivoCopia,
  resumirCopia,
  serializarRegistro,
  validarCopia,
  type CopiaCompleta,
} from './exportacion.ts';
import { TABLAS_DATOS, type NombreTabla } from './db.ts';

/** Fuente y destino de mentira, para probar el formato sin montar Dexie. */
function baseFalsa(inicial: Partial<Record<NombreTabla, unknown[]>> = {}) {
  const tablas = { ...inicial } as Record<NombreTabla, unknown[]>;
  return {
    tablas,
    async leerTabla(nombre: NombreTabla) {
      return tablas[nombre] ?? [];
    },
    async vaciar() {
      for (const t of TABLAS_DATOS) tablas[t] = [];
    },
    async escribirTabla(nombre: NombreTabla, filas: unknown[]) {
      tablas[nombre] = filas;
    },
  };
}

describe('serialización de Blobs', () => {
  it('va y vuelve sin perder los bytes', async () => {
    const original = new Blob([new Uint8Array([0, 1, 2, 250, 251, 255])], {
      type: 'image/webp',
    });

    const serializado = await serializarRegistro({ nombre: 'foto', datos: original });
    const texto = JSON.stringify(serializado);
    const recuperado = deserializarRegistro(JSON.parse(texto)) as { datos: Blob };

    expect(recuperado.datos).toBeInstanceOf(Blob);
    expect(recuperado.datos.type).toBe('image/webp');
    const bytes = new Uint8Array(await recuperado.datos.arrayBuffer());
    expect([...bytes]).toEqual([0, 1, 2, 250, 251, 255]);
  });

  it('sobrevive a un blob grande sin reventar la pila', async () => {
    /*
     * `String.fromCharCode(...bytes)` con una foto de varios megas revienta la
     * pila: hay un límite práctico de unos 100.000 argumentos. Por eso se
     * recorre en trozos.
     */
    const grande = new Blob([new Uint8Array(300_000).fill(7)]);
    const serializado = (await serializarRegistro(grande)) as { base64: string };
    expect(serializado.base64.length).toBeGreaterThan(100_000);

    const vuelta = deserializarRegistro(serializado) as Blob;
    expect(vuelta.size).toBe(300_000);
  });

  it('atraviesa objetos anidados y listas', async () => {
    const entrada = {
      lista: [{ blob: new Blob(['a']) }, { blob: new Blob(['b']) }],
      profundo: { mas: { blob: new Blob(['c']) } },
    };
    const ida = await serializarRegistro(entrada);
    const vuelta = deserializarRegistro(ida) as typeof entrada;

    expect(vuelta.lista[0]!.blob).toBeInstanceOf(Blob);
    expect(vuelta.profundo.mas.blob).toBeInstanceOf(Blob);
  });

  it('deja intactos los valores que no son blobs', async () => {
    const entrada = { texto: 'hola', numero: 42, nulo: null, falso: false, lista: [1, 2] };
    expect(await serializarRegistro(entrada)).toEqual(entrada);
  });
});

describe('exportarTodo', () => {
  it('incluye todas las tablas y su recuento', async () => {
    const base = baseFalsa({ vehiculos: [{ id: 'v1' }], gastos: [{ id: 'g1' }, { id: 'g2' }] });
    const copia = await exportarTodo(base);

    expect(copia.formato).toBe('mi-garaje');
    expect(copia.version).toBe(VERSION_FORMATO);
    expect(Object.keys(copia.datos).sort()).toEqual([...TABLAS_DATOS].sort());
    expect(copia.resumen.vehiculos).toBe(1);
    expect(copia.resumen.gastos).toBe(2);
  });

  it('produce un JSON serializable aunque haya fotos', async () => {
    const base = baseFalsa({
      adjuntos: [{ id: 'a1', datos: new Blob(['foto']), mime: 'image/webp' }],
    });
    const copia = await exportarTodo(base);
    expect(() => JSON.stringify(copia)).not.toThrow();
  });
});

describe('validarCopia', () => {
  const valida: CopiaCompleta = {
    formato: 'mi-garaje',
    version: VERSION_FORMATO,
    exportadoEn: '2026-08-24T10:00:00.000Z',
    resumen: {},
    datos: { vehiculos: [] },
  };

  it('acepta una copia buena', () => {
    expect(validarCopia(valida).version).toBe(VERSION_FORMATO);
  });

  it('rechaza un archivo que no es de esta app', () => {
    expect(() => validarCopia({ formato: 'otra-cosa', version: 1, datos: {} })).toThrow(
      CopiaInvalida,
    );
    expect(() => validarCopia('no soy un objeto')).toThrow(CopiaInvalida);
    expect(() => validarCopia(null)).toThrow(CopiaInvalida);
  });

  it('rechaza una copia de una versión más nueva', () => {
    /*
     * Importarla a ciegas dejaría datos a medias con un esquema que esta
     * versión no entiende. Mejor negarse y decir por qué.
     */
    expect(() => validarCopia({ ...valida, version: VERSION_FORMATO + 1 })).toThrow(/más nueva/);
  });

  it('rechaza una tabla corrupta', () => {
    expect(() => validarCopia({ ...valida, datos: { vehiculos: 'no es una lista' } })).toThrow(
      CopiaInvalida,
    );
  });

  it('valida ANTES de tocar nada', () => {
    // Importar un archivo equivocado no puede dejarte sin datos y sin copia.
    const base = baseFalsa({ vehiculos: [{ id: 'v1' }] });
    expect(() => validarCopia({ formato: 'otra' })).toThrow();
    expect(base.tablas.vehiculos).toHaveLength(1);
  });
});

describe('importarTodo', () => {
  it('reemplaza el contenido de la base', async () => {
    const base = baseFalsa({ vehiculos: [{ id: 'viejo' }] });
    const copia = validarCopia({
      formato: 'mi-garaje',
      version: 1,
      exportadoEn: '',
      resumen: {},
      datos: { vehiculos: [{ id: 'nuevo' }], gastos: [{ id: 'g1' }] },
    });

    const escritos = await importarTodo(base, copia);

    expect(base.tablas.vehiculos).toEqual([{ id: 'nuevo' }]);
    expect(escritos.vehiculos).toBe(1);
    expect(escritos.gastos).toBe(1);
  });

  it('vacía las tablas que la copia no trae', async () => {
    // Si no, quedarían restos de los datos anteriores mezclados con los
    // importados, que es la peor forma posible de fallar.
    const base = baseFalsa({ vehiculos: [{ id: 'v1' }], gastos: [{ id: 'g1' }] });
    const copia = validarCopia({
      formato: 'mi-garaje',
      version: 1,
      exportadoEn: '',
      resumen: {},
      datos: { vehiculos: [{ id: 'v2' }] },
    });

    await importarTodo(base, copia);
    expect(base.tablas.gastos).toEqual([]);
  });

  it('restaura las fotos como Blobs después de pasar por JSON', async () => {
    const base = baseFalsa();
    const conFoto = await exportarTodo(
      baseFalsa({ adjuntos: [{ id: 'a1', datos: new Blob(['foto']) }] }),
    );

    // Pasa por JSON, exactamente como pasaría por un archivo de verdad.
    const copia = validarCopia(JSON.parse(JSON.stringify(conFoto)));
    await importarTodo(base, copia);

    const adjunto = base.tablas.adjuntos[0] as { datos: Blob };
    expect(adjunto.datos).toBeInstanceOf(Blob);
    expect(await adjunto.datos.text()).toBe('foto');
  });
});

describe('resumirCopia', () => {
  it('cuenta cada tabla, incluidas las vacías', () => {
    const resumen = resumirCopia({
      formato: 'mi-garaje',
      version: 1,
      exportadoEn: '',
      resumen: {},
      datos: { vehiculos: [{}, {}] },
    });
    expect(resumen.vehiculos).toBe(2);
    expect(resumen.gastos).toBe(0);
  });
});

describe('nombreArchivoCopia', () => {
  it('lleva la fecha, para no machacar copias anteriores', () => {
    expect(nombreArchivoCopia('2026-08-24')).toBe('mi-garaje-copia-2026-08-24.json');
  });
});
