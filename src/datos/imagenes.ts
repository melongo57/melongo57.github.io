import type { Adjunto, Nuevo } from '@/dominio/tipos.ts';

/**
 * Preparación de adjuntos antes de guardarlos en IndexedDB.
 *
 * La foto que hace un móvil actual pesa entre 3 y 8 MB. Guardarla tal cual
 * tiene dos consecuencias, y ninguna se ve hasta que es tarde: el navegador
 * acaba desalojando la base por superar su cuota, y la exportación a JSON
 * (donde los Blobs van en base64, un 33 % más grandes) se vuelve inmanejable.
 *
 * Un ticket de gasolina recomprimido a 1.600 px de lado se lee perfectamente
 * y ocupa unos 200 kB.
 */

/** Lado mayor al que se reduce una foto. Suficiente para leer una factura. */
export const MAX_LADO = 1600;

/** Calidad de recompresión. Por debajo de 0,8 se nota en el texto impreso. */
export const CALIDAD = 0.82;

/** Tope duro para lo que no se puede recomprimir (PDF). */
export const MAX_BYTES_SIN_COMPRIMIR = 8 * 1024 * 1024;

export class AdjuntoDemasiadoGrande extends Error {
  constructor(readonly bytes: number) {
    super(
      `El archivo ocupa ${(bytes / 1024 / 1024).toFixed(1)} MB y el máximo son ` +
        `${MAX_BYTES_SIN_COMPRIMIR / 1024 / 1024} MB.`,
    );
    this.name = 'AdjuntoDemasiadoGrande';
  }
}

export interface Dimensiones {
  ancho: number;
  alto: number;
}

/**
 * Encaja unas dimensiones dentro de un lado máximo conservando la proporción.
 * Nunca amplía: una foto pequeña se queda como está.
 */
export function calcularDimensiones(
  ancho: number,
  alto: number,
  maxLado = MAX_LADO,
): Dimensiones {
  const mayor = Math.max(ancho, alto);
  if (mayor <= maxLado || mayor === 0) {
    return { ancho: Math.round(ancho), alto: Math.round(alto) };
  }
  const factor = maxLado / mayor;
  return {
    ancho: Math.max(1, Math.round(ancho * factor)),
    alto: Math.max(1, Math.round(alto * factor)),
  };
}

/** ¿Sabe este navegador escribir WebP? Se comprueba una sola vez. */
let soportaWebp: boolean | null = null;

function detectarWebp(): boolean {
  if (soportaWebp !== null) return soportaWebp;
  try {
    const lienzo = document.createElement('canvas');
    lienzo.width = 1;
    lienzo.height = 1;
    soportaWebp = lienzo.toDataURL('image/webp').startsWith('data:image/webp');
  } catch {
    soportaWebp = false;
  }
  return soportaWebp;
}

function aBlob(lienzo: HTMLCanvasElement, mime: string, calidad: number): Promise<Blob> {
  return new Promise((resolver, rechazar) => {
    lienzo.toBlob(
      (blob) => (blob ? resolver(blob) : rechazar(new Error('No se pudo comprimir la imagen.'))),
      mime,
      calidad,
    );
  });
}

export interface ImagenComprimida {
  blob: Blob;
  mime: string;
  ancho: number;
  alto: number;
}

/**
 * Recomprime una imagen a un tamaño manejable.
 *
 * `createImageBitmap` respeta la orientación EXIF, cosa que un `<img>` no
 * siempre hace: sin `imageOrientation: 'from-image'`, las fotos tomadas en
 * vertical con algunos móviles se guardan tumbadas.
 */
export async function comprimirImagen(
  archivo: Blob,
  opciones: { maxLado?: number; calidad?: number } = {},
): Promise<ImagenComprimida> {
  const { maxLado = MAX_LADO, calidad = CALIDAD } = opciones;

  const original = await createImageBitmap(archivo, { imageOrientation: 'from-image' });
  const { ancho, alto } = calcularDimensiones(original.width, original.height, maxLado);

  const lienzo = document.createElement('canvas');
  lienzo.width = ancho;
  lienzo.height = alto;

  const contexto = lienzo.getContext('2d');
  if (!contexto) {
    original.close();
    throw new Error('El navegador no permite dibujar en un canvas.');
  }

  contexto.imageSmoothingEnabled = true;
  contexto.imageSmoothingQuality = 'high';
  contexto.drawImage(original, 0, 0, ancho, alto);
  original.close();

  const mime = detectarWebp() ? 'image/webp' : 'image/jpeg';
  const blob = await aBlob(lienzo, mime, calidad);

  // Si la recompresión no mejora (imagen ya pequeña y muy optimizada), se
  // conserva el original: no tiene sentido perder calidad para nada.
  if (blob.size >= archivo.size && original.width <= maxLado && original.height <= maxLado) {
    return { blob: archivo, mime: archivo.type || mime, ancho, alto };
  }

  return { blob, mime, ancho, alto };
}

/**
 * Convierte un archivo elegido por el usuario en un registro de adjunto listo
 * para guardar. Las imágenes se recomprimen; el resto (PDF) pasa tal cual con
 * un tope de tamaño.
 */
export async function prepararAdjunto(archivo: File): Promise<Nuevo<Adjunto>> {
  if (archivo.type.startsWith('image/')) {
    const { blob, mime, ancho, alto } = await comprimirImagen(archivo);
    return {
      nombre: archivo.name,
      mime,
      bytes: blob.size,
      ancho,
      alto,
      datos: blob,
    };
  }

  if (archivo.size > MAX_BYTES_SIN_COMPRIMIR) {
    throw new AdjuntoDemasiadoGrande(archivo.size);
  }

  return {
    nombre: archivo.name,
    mime: archivo.type || 'application/octet-stream',
    bytes: archivo.size,
    datos: archivo,
  };
}
