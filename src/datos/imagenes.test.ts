import { describe, expect, it } from 'vitest';
import { MAX_LADO, calcularDimensiones } from './imagenes.ts';

/*
 * Solo se prueba la parte pura. El redimensionado real usa `createImageBitmap`
 * y `canvas.toBlob`, que jsdom no implementa; probarlo aquí exigiría un
 * navegador de verdad y solo comprobaría que el navegador sabe dibujar.
 */

describe('calcularDimensiones', () => {
  it('reduce el lado mayor al máximo conservando la proporción', () => {
    // Foto típica de móvil: 4032×3024 (4:3).
    expect(calcularDimensiones(4032, 3024)).toEqual({ ancho: 1600, alto: 1200 });
  });

  it('funciona igual en vertical', () => {
    expect(calcularDimensiones(3024, 4032)).toEqual({ ancho: 1200, alto: 1600 });
  });

  it('no amplía una imagen que ya es pequeña', () => {
    expect(calcularDimensiones(800, 600)).toEqual({ ancho: 800, alto: 600 });
    expect(calcularDimensiones(MAX_LADO, 900)).toEqual({ ancho: MAX_LADO, alto: 900 });
  });

  it('respeta un máximo distinto', () => {
    expect(calcularDimensiones(4000, 2000, 400)).toEqual({ ancho: 400, alto: 200 });
  });

  it('no deja ningún lado en cero al reducir mucho una imagen muy alargada', () => {
    // Un panorama de 8000×100 reducido a 1600 daría 20 px de alto; con una
    // proporción más extrema, el redondeo podría dar 0 y romper el canvas.
    const d = calcularDimensiones(20000, 30, 1600);
    expect(d.ancho).toBe(1600);
    expect(d.alto).toBeGreaterThanOrEqual(1);
  });

  it('aguanta dimensiones vacías sin dividir por cero', () => {
    expect(calcularDimensiones(0, 0)).toEqual({ ancho: 0, alto: 0 });
  });
});
