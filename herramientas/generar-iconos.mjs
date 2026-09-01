/**
 * Genera los iconos PNG de la PWA a partir del mismo dibujo que favicon.svg.
 *
 * ¿Por qué un rasterizador propio en vez de `sharp` o `resvg`? Porque son
 * binarios nativos de decenas de megas que habría que recompilar en cada
 * plataforma, y aquí solo hacen falta cuatro formas geométricas. Con `zlib`
 * (que viene en Node) se escribe un PNG válido en cien líneas y el proyecto
 * sigue instalándose con un solo `npm install`.
 *
 *   node herramientas/generar-iconos.mjs
 */

import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const DESTINO = join(RAIZ, 'public', 'icons');

const FONDO = [0x0d, 0x61, 0x78]; // --c-acento
const TINTA = [0xff, 0xff, 0xff];

// ---------------------------------------------------------------------------
// Geometría (coordenadas normalizadas 0..1 sobre el lienzo dibujable)
// ---------------------------------------------------------------------------

/** Distancia de un punto a un segmento. */
function distSegmento(px, py, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const largo2 = dx * dx + dy * dy;
  const t = largo2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / largo2));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

/** Distancia con signo a un rectángulo redondeado centrado en (cx, cy). */
function distRectRedondo(px, py, cx, cy, mitadAncho, mitadAlto, radio) {
  const qx = Math.abs(px - cx) - (mitadAncho - radio);
  const qy = Math.abs(py - cy) - (mitadAlto - radio);
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - radio;
}

/**
 * ¿Está el punto dentro del trazo del arco superior del cuentakilómetros?
 * El arco va de 180° a 360°, es decir, la mitad de arriba.
 */
function enArco(px, py, cx, cy, radio, grosor) {
  if (py > cy) return false;
  const d = Math.hypot(px - cx, py - cy);
  return Math.abs(d - radio) <= grosor / 2;
}

/**
 * Color del punto (x, y) del icono, en coordenadas de píxel.
 * `padding` deja aire alrededor para los iconos enmascarables de Android,
 * que recortan hasta un círculo inscrito y se comen las esquinas.
 */
function muestrear(x, y, lado, opciones) {
  const { enmascarable } = opciones;

  // Fondo: cuadrado completo si es enmascarable, redondeado si no.
  let dentroFondo;
  if (enmascarable) {
    dentroFondo = true;
  } else {
    dentroFondo = distRectRedondo(x, y, lado / 2, lado / 2, lado / 2, lado / 2, lado * 0.25) <= 0;
  }
  if (!dentroFondo) return null;

  // El dibujo ocupa el 100 % del lienzo normal y el 62 % del enmascarable
  // (la zona segura que Android garantiza que no recorta).
  const escala = enmascarable ? 0.62 : 0.86;
  const lienzo = lado * escala;
  const origen = (lado - lienzo) / 2;
  const u = (x - origen) / lienzo;
  const v = (y - origen) / lienzo;

  const cx = 0.5;
  const cy = 0.68;
  const radioArco = 0.36;
  const grosor = 0.115;

  if (enArco(u, v, cx, cy, radioArco, grosor)) return TINTA;
  // Extremos redondeados del arco.
  if (Math.hypot(u - (cx - radioArco), v - cy) <= grosor / 2) return TINTA;
  if (Math.hypot(u - (cx + radioArco), v - cy) <= grosor / 2) return TINTA;

  // Aguja apuntando arriba a la derecha.
  if (distSegmento(u, v, cx, cy, cx + 0.25, cy - 0.27) <= grosor / 2) return TINTA;

  // Eje.
  if (Math.hypot(u - cx, v - cy) <= 0.105) return TINTA;

  return FONDO;
}

// ---------------------------------------------------------------------------
// Rasterización con supermuestreo
// ---------------------------------------------------------------------------

const SUBMUESTRAS = 4;

function rasterizar(lado, opciones) {
  const pixeles = Buffer.alloc(lado * lado * 4);

  for (let y = 0; y < lado; y += 1) {
    for (let x = 0; x < lado; x += 1) {
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;

      for (let sy = 0; sy < SUBMUESTRAS; sy += 1) {
        for (let sx = 0; sx < SUBMUESTRAS; sx += 1) {
          const color = muestrear(
            x + (sx + 0.5) / SUBMUESTRAS,
            y + (sy + 0.5) / SUBMUESTRAS,
            lado,
            opciones,
          );
          if (color) {
            r += color[0];
            g += color[1];
            b += color[2];
            a += 255;
          }
        }
      }

      const total = SUBMUESTRAS * SUBMUESTRAS;
      const cobertura = a / total;
      const i = (y * lado + x) * 4;
      // Se premultiplica y se vuelve a dividir para que el borde del icono
      // no salga con un halo oscuro sobre fondos claros.
      pixeles[i] = cobertura > 0 ? Math.round(r / (a / 255)) : 0;
      pixeles[i + 1] = cobertura > 0 ? Math.round(g / (a / 255)) : 0;
      pixeles[i + 2] = cobertura > 0 ? Math.round(b / (a / 255)) : 0;
      pixeles[i + 3] = Math.round(cobertura);
    }
  }

  return pixeles;
}

// ---------------------------------------------------------------------------
// Codificador PNG
// ---------------------------------------------------------------------------

const TABLA_CRC = (() => {
  const tabla = new Int32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    tabla[n] = c;
  }
  return tabla;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (const byte of buf) c = TABLA_CRC[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function trozo(tipo, datos) {
  const largo = Buffer.alloc(4);
  largo.writeUInt32BE(datos.length);
  const cuerpo = Buffer.concat([Buffer.from(tipo, 'ascii'), datos]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(cuerpo));
  return Buffer.concat([largo, cuerpo, crc]);
}

function codificarPng(lado, pixeles) {
  const cabecera = Buffer.alloc(13);
  cabecera.writeUInt32BE(lado, 0);
  cabecera.writeUInt32BE(lado, 4);
  cabecera[8] = 8; // 8 bits por canal
  cabecera[9] = 6; // RGBA
  cabecera[10] = 0; // deflate
  cabecera[11] = 0; // filtro adaptativo
  cabecera[12] = 0; // sin entrelazado

  // Cada scanline lleva delante su byte de filtro. Usamos 0 (sin filtro):
  // el icono es plano y comprime bien igualmente.
  const bruto = Buffer.alloc(lado * (lado * 4 + 1));
  for (let y = 0; y < lado; y += 1) {
    const destino = y * (lado * 4 + 1);
    bruto[destino] = 0;
    pixeles.copy(bruto, destino + 1, y * lado * 4, (y + 1) * lado * 4);
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    trozo('IHDR', cabecera),
    trozo('IDAT', deflateSync(bruto, { level: 9 })),
    trozo('IEND', Buffer.alloc(0)),
  ]);
}

// ---------------------------------------------------------------------------

const ICONOS = [
  { archivo: 'icono-180.png', lado: 180, enmascarable: false },
  { archivo: 'icono-192.png', lado: 192, enmascarable: false },
  { archivo: 'icono-512.png', lado: 512, enmascarable: false },
  { archivo: 'icono-mascara-512.png', lado: 512, enmascarable: true },
];

mkdirSync(DESTINO, { recursive: true });

for (const { archivo, lado, enmascarable } of ICONOS) {
  const png = codificarPng(lado, rasterizar(lado, { enmascarable }));
  writeFileSync(join(DESTINO, archivo), png);
  console.log(`${archivo.padEnd(24)} ${lado}×${lado}  ${(png.length / 1024).toFixed(1)} kB`);
}
