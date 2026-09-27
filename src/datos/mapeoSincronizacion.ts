import type { Ajustes, Documento, Id } from '@/dominio/tipos.ts';

/**
 * Traducción entre el registro del dominio (camelCase, el mismo objeto que
 * vive en IndexedDB) y la fila de Supabase (snake_case, según
 * `supabase/schema.sql`).
 *
 * Es lógica pura —ningún import de red— para poder probarla con objetos de
 * mentira. La orquestación que sí habla con Supabase vive en
 * `sincronizacion.ts`.
 */

export type FilaSupabase = Record<string, unknown>;

function aSnake(clave: string): string {
  return clave.replace(/[A-Z]/g, (letra) => `_${letra.toLowerCase()}`);
}

function aCamel(clave: string): string {
  return clave.replace(/_([a-z])/g, (_, letra: string) => letra.toUpperCase());
}

/**
 * Convierte un registro del dominio en una fila de Supabase.
 *
 * Funciona para casi todas las tablas porque la traducción es mecánica: todas
 * las columnas de `schema.sql` son el mismo nombre de campo en snake_case, sin
 * excepción, salvo en `documentos` (ver `filaDesdeDocumento`) y `ajustes` (ver
 * `filaDesdeAjustes`), que tienen una forma distinta a un lado y otro.
 *
 * `excluir` saca campos que no tienen columna propia —el caso es
 * `Adjunto.datos`, cuyo contenido va a Supabase Storage, no a una columna—.
 */
export function filaDesdeRegistro(
  registro: Record<string, unknown>,
  propietarioId: string,
  excluir: readonly string[] = [],
  /**
   * Campos que, si faltan, se mandan como NULL en vez de omitirse: un upsert
   * que no menciona una columna la deja como estaba, así que omitirla no
   * sirve para vaciarla.
   */
  anulables: readonly string[] = [],
): FilaSupabase {
  const fila: FilaSupabase = { propietario_id: propietarioId };
  for (const clave of anulables) fila[aSnake(clave)] = null;
  for (const [clave, valor] of Object.entries(registro)) {
    if (clave === 'propietarioId' || excluir.includes(clave)) continue;
    if (valor === undefined) continue;
    fila[aSnake(clave)] = valor;
  }
  return fila;
}

/**
 * El inverso de `filaDesdeRegistro`. Descarta `propietario_id`: no forma parte
 * del tipo local. Un NULL de la fila se traduce en «campo ausente»
 * (`undefined`), que es como el dominio representa un opcional sin valor —
 * varios formularios comprueban `=== undefined` para decidir si mostrar un
 * campo vacío, y un `null` ahí se acabaría imprimiendo como el texto "null".
 */
export function registroDesdeFila<T>(fila: FilaSupabase): T {
  const registro: Record<string, unknown> = {};
  for (const [clave, valor] of Object.entries(fila)) {
    if (clave === 'propietario_id') continue;
    if (valor === null) continue;
    registro[aCamel(clave)] = valor;
  }

  /*
   * `borradoEn` es la única excepción: en `EntidadBase` es `| null` de
   * verdad, no un opcional que se omite. «Nunca se ha borrado» se representa
   * como `null`, no como ausencia del campo, así que aquí SÍ hay que
   * conservar el NULL en vez de descartarlo.
   */
  if ('borrado_en' in fila) {
    registro.borradoEn = fila.borrado_en ?? null;
  }

  return registro as T;
}

// ---------------------------------------------------------------------------
// Documentos: unión discriminada ↔ columnas comunes + `detalle` jsonb
// ---------------------------------------------------------------------------

/**
 * Campos comunes a las tres variantes de `Documento`. Todo lo que no esté en
 * esta lista es propio de la variante (compañía y cobertura del seguro,
 * estación y resultado de la ITV, título del resto) y va empaquetado en la
 * columna `detalle`, para no tener una tabla con la mitad de las columnas
 * siempre a NULL según el tipo.
 */
const CAMPOS_COMUNES_DOCUMENTO = new Set([
  'id',
  'creadoEn',
  'actualizadoEn',
  'borradoEn',
  'propietarioId',
  'vehiculoId',
  'tipo',
  'fechaEmision',
  'notas',
  'adjuntoIds',
]);

export function filaDesdeDocumento(documento: Documento, propietarioId: string): FilaSupabase {
  const comunes: Record<string, unknown> = {};
  const detalle: Record<string, unknown> = {};

  for (const [clave, valor] of Object.entries(documento)) {
    if (valor === undefined) continue;
    if (CAMPOS_COMUNES_DOCUMENTO.has(clave)) comunes[clave] = valor;
    else detalle[clave] = valor;
  }

  return { ...filaDesdeRegistro(comunes, propietarioId), detalle };
}

export function documentoDesdeFila(fila: FilaSupabase): Documento {
  const { detalle, ...resto } = fila;
  const comunes = registroDesdeFila<Record<string, unknown>>(resto);
  /*
   * El cast pasa por `unknown` a proposito. TypeScript no puede comprobar que
   * la mezcla de columnas comunes y `detalle` reconstruye una variante valida
   * de la union `Documento` —eso depende del valor de `tipo` en tiempo de
   * ejecucion, y del hecho de que la fila la escribio `filaDesdeDocumento`—.
   * La garantia real es el test de ida y vuelta, no el compilador.
   */
  return {
    ...comunes,
    ...(typeof detalle === 'object' && detalle ? detalle : {}),
  } as unknown as Documento;
}

// ---------------------------------------------------------------------------
// Ajustes: fila única por usuario, sin id propio
// ---------------------------------------------------------------------------

/**
 * `Ajustes` es un singleton local con id fijo `'ajustes'`; en Supabase la fila
 * se identifica por `propietario_id` (clave primaria de esa tabla) y no
 * necesita `id`, `creado_en` ni `borrado_en`: no tiene sentido «borrar» los
 * ajustes de un usuario mientras exista su cuenta.
 */
export function filaDesdeAjustes(ajustes: Ajustes, propietarioId: string): FilaSupabase {
  const { id, creadoEn, borradoEn, propietarioId: _p, ...resto } = ajustes;
  void id;
  void creadoEn;
  void borradoEn;
  return filaDesdeRegistro(resto, propietarioId);
}

export function ajustesDesdeFila(fila: FilaSupabase, idLocal: Id, ahora: string): Ajustes {
  const registro = registroDesdeFila<Omit<Ajustes, 'id' | 'creadoEn' | 'borradoEn'>>(fila);
  return {
    ...registro,
    id: idLocal as Ajustes['id'],
    creadoEn: ahora,
    borradoEn: null,
  };
}
