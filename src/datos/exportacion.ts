import { ahoraISO, hoyISO } from '@/dominio/fechas.ts';
import type { Adjunto } from '@/dominio/tipos.ts';
import { TABLAS_DATOS, type NombreTabla } from './db.ts';

/**
 * Exportación e importación de todos los datos en JSON.
 *
 * «Mis datos son míos y no quiero quedarme atrapado». Este archivo es la
 * promesa que cumple esa frase: contiene TODO —vehículos, histórico, ajustes y
 * las fotos— y basta para reconstruir la app desde cero en otro dispositivo.
 *
 * LOS BLOBS VAN EN BASE64. Es la parte fea: JSON no sabe llevar binarios, así
 * que las fotos se codifican y crecen un 33 %. La alternativa sería un ZIP,
 * que obligaría a meter una librería y a que el archivo dejara de ser legible
 * con un editor de texto. Como las imágenes ya se recomprimen al guardarse
 * (ver `imagenes.ts`), el tamaño se mantiene manejable.
 *
 * EL FORMATO LLEVA VERSIÓN desde el primer día. Sin ella, el primer cambio de
 * esquema convierte todas las copias de seguridad anteriores en basura, y una
 * copia que no se puede restaurar no es una copia.
 */

export const VERSION_FORMATO = 1;

export interface CopiaCompleta {
  formato: 'mi-garaje';
  version: number;
  exportadoEn: string;
  /** Recuento por tabla, para poder avisar antes de importar. */
  resumen: Record<string, number>;
  datos: Record<string, unknown[]>;
}

// ---------------------------------------------------------------------------
// Blobs ↔ base64
// ---------------------------------------------------------------------------

/** Marca con la que se reconoce un Blob codificado dentro del JSON. */
const MARCA_BLOB = '__blob__';

interface BlobSerializado {
  [MARCA_BLOB]: true;
  mime: string;
  base64: string;
}

export function esBlobSerializado(valor: unknown): valor is BlobSerializado {
  return (
    typeof valor === 'object' &&
    valor !== null &&
    MARCA_BLOB in valor &&
    typeof (valor as BlobSerializado).base64 === 'string'
  );
}

/**
 * Blob → base64.
 *
 * Se recorre en trozos porque `String.fromCharCode(...bytes)` con una foto de
 * varios megas revienta la pila de llamadas: hay un límite práctico de unos
 * 100.000 argumentos.
 */
async function blobABase64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const TROZO = 0x8000;
  let binario = '';
  for (let i = 0; i < bytes.length; i += TROZO) {
    binario += String.fromCharCode(...bytes.subarray(i, i + TROZO));
  }
  return btoa(binario);
}

function base64ABlob(base64: string, mime: string): Blob {
  const binario = atob(base64);
  const bytes = new Uint8Array(binario.length);
  for (let i = 0; i < binario.length; i += 1) bytes[i] = binario.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

/** Sustituye los Blobs de un registro por su forma serializable. */
export async function serializarRegistro(registro: unknown): Promise<unknown> {
  if (registro instanceof Blob) {
    return {
      [MARCA_BLOB]: true,
      mime: registro.type,
      base64: await blobABase64(registro),
    } satisfies BlobSerializado;
  }

  if (Array.isArray(registro)) {
    return Promise.all(registro.map(serializarRegistro));
  }

  if (registro && typeof registro === 'object') {
    const salida: Record<string, unknown> = {};
    for (const [clave, valor] of Object.entries(registro)) {
      salida[clave] = await serializarRegistro(valor);
    }
    return salida;
  }

  return registro;
}

/** Devuelve los Blobs a su sitio al importar. */
export function deserializarRegistro(registro: unknown): unknown {
  if (esBlobSerializado(registro)) {
    return base64ABlob(registro.base64, registro.mime);
  }

  if (Array.isArray(registro)) {
    return registro.map(deserializarRegistro);
  }

  if (registro && typeof registro === 'object') {
    const salida: Record<string, unknown> = {};
    for (const [clave, valor] of Object.entries(registro)) {
      salida[clave] = deserializarRegistro(valor);
    }
    return salida;
  }

  return registro;
}

// ---------------------------------------------------------------------------
// Exportación
// ---------------------------------------------------------------------------

/** Lo que la exportación necesita de la base: leer cada tabla entera. */
export interface FuenteTablas {
  leerTabla(nombre: NombreTabla): Promise<unknown[]>;
}

export async function exportarTodo(fuente: FuenteTablas): Promise<CopiaCompleta> {
  const datos: Record<string, unknown[]> = {};
  const resumen: Record<string, number> = {};

  for (const tabla of TABLAS_DATOS) {
    const filas = await fuente.leerTabla(tabla);
    datos[tabla] = (await serializarRegistro(filas)) as unknown[];
    resumen[tabla] = filas.length;
  }

  return {
    formato: 'mi-garaje',
    version: VERSION_FORMATO,
    exportadoEn: ahoraISO(),
    resumen,
    datos,
  };
}

export function nombreArchivoCopia(hoy = hoyISO()): string {
  return `mi-garaje-copia-${hoy}.json`;
}

// ---------------------------------------------------------------------------
// Importación
// ---------------------------------------------------------------------------

export class CopiaInvalida extends Error {
  constructor(mensaje: string) {
    super(mensaje);
    this.name = 'CopiaInvalida';
  }
}

/**
 * Comprueba que un JSON es una copia de esta app antes de tocar nada.
 *
 * Se valida ANTES de vaciar la base, no después: importar un archivo
 * equivocado no puede dejarte sin datos y sin copia.
 */
export function validarCopia(crudo: unknown): CopiaCompleta {
  if (!crudo || typeof crudo !== 'object') {
    throw new CopiaInvalida('El archivo no contiene un objeto JSON.');
  }

  const copia = crudo as Partial<CopiaCompleta>;

  if (copia.formato !== 'mi-garaje') {
    throw new CopiaInvalida('Este archivo no es una copia de Mi Garaje.');
  }

  if (typeof copia.version !== 'number') {
    throw new CopiaInvalida('La copia no indica su versión de formato.');
  }

  if (copia.version > VERSION_FORMATO) {
    throw new CopiaInvalida(
      `La copia es de una versión más nueva de la app (formato ${copia.version}, esta ` +
        `entiende hasta el ${VERSION_FORMATO}). Actualiza antes de importarla.`,
    );
  }

  if (!copia.datos || typeof copia.datos !== 'object') {
    throw new CopiaInvalida('La copia no contiene datos.');
  }

  for (const tabla of TABLAS_DATOS) {
    const filas = copia.datos[tabla];
    if (filas !== undefined && !Array.isArray(filas)) {
      throw new CopiaInvalida(`La tabla «${tabla}» de la copia está corrupta.`);
    }
  }

  return copia as CopiaCompleta;
}

/** Cuenta lo que hay dentro de una copia, para poder avisar antes de importar. */
export function resumirCopia(copia: CopiaCompleta): Record<NombreTabla, number> {
  const resumen = {} as Record<NombreTabla, number>;
  for (const tabla of TABLAS_DATOS) {
    resumen[tabla] = copia.datos[tabla]?.length ?? 0;
  }
  return resumen;
}

/** Destino de una importación: vacía la base y escribe las tablas. */
export interface DestinoTablas {
  vaciar(): Promise<void>;
  escribirTabla(nombre: NombreTabla, filas: unknown[]): Promise<void>;
}

export async function importarTodo(
  destino: DestinoTablas,
  copia: CopiaCompleta,
): Promise<Record<NombreTabla, number>> {
  await destino.vaciar();

  const escritos = {} as Record<NombreTabla, number>;
  for (const tabla of TABLAS_DATOS) {
    const filas = copia.datos[tabla] ?? [];
    const restauradas = filas.map(deserializarRegistro);
    await destino.escribirTabla(tabla, restauradas);
    escritos[tabla] = restauradas.length;
  }
  return escritos;
}

/** Tamaño aproximado de la copia, para avisar antes de descargarla. */
export function pesoAproximado(copia: CopiaCompleta): number {
  return new Blob([JSON.stringify(copia)]).size;
}

/** Cuenta los adjuntos y lo que ocupan, que es de donde sale el peso. */
export function pesoDeAdjuntos(adjuntos: readonly Adjunto[]): {
  cuantos: number;
  bytes: number;
} {
  return {
    cuantos: adjuntos.length,
    bytes: adjuntos.reduce((t, a) => t + a.bytes, 0),
  };
}
