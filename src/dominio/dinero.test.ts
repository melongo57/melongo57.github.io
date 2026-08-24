import { describe, expect, it } from 'vitest';
import {
  aCentimos,
  aEuros,
  formatearEuros,
  parsearImporte,
  repartirCentimos,
} from './dinero.ts';

describe('aCentimos', () => {
  it('convierte euros a céntimos enteros', () => {
    expect(aCentimos(12.34)).toBe(1234);
    expect(aCentimos(0)).toBe(0);
    expect(aCentimos(1)).toBe(100);
  });

  it('redondea los casos que el punto flotante estropea', () => {
    // 1.005 * 100 = 100.49999999999999 en IEEE-754.
    expect(aCentimos(1.005)).toBe(101);
    expect(aCentimos(8.115)).toBe(812);
    // Un repostaje real: 42,37 l × 1,589 €/l.
    expect(aCentimos(42.37 * 1.589)).toBe(6733);
  });

  it('no acumula error al sumar muchos importes', () => {
    const importes = Array.from({ length: 1000 }, () => aCentimos(0.1));
    expect(importes.reduce((a, b) => a + b, 0)).toBe(10000);
    // Lo mismo en coma flotante se desvía:
    const enFloat = Array.from({ length: 1000 }, () => 0.1).reduce((a, b) => a + b, 0);
    expect(enFloat).not.toBe(100);
  });

  it('trata los valores no finitos como cero', () => {
    expect(aCentimos(Number.NaN)).toBe(0);
    expect(aCentimos(Number.POSITIVE_INFINITY)).toBe(0);
  });

  it('es reversible', () => {
    expect(aEuros(aCentimos(19.99))).toBe(19.99);
  });
});

describe('parsearImporte', () => {
  it('acepta coma decimal, que es lo que teclea un usuario español', () => {
    expect(parsearImporte('12,34')).toBe(1234);
    expect(parsearImporte('0,05')).toBe(5);
  });

  it('acepta también punto decimal', () => {
    expect(parsearImporte('12.34')).toBe(1234);
  });

  it('entiende el separador de millares español', () => {
    expect(parsearImporte('1.234,56')).toBe(123456);
    expect(parsearImporte('17.900')).toBe(1790000);
  });

  it('entiende el formato anglosajón cuando el orden lo delata', () => {
    expect(parsearImporte('1,234.56')).toBe(123456);
  });

  it('ignora el símbolo de euro y los espacios', () => {
    expect(parsearImporte(' 45,90 € ')).toBe(4590);
  });

  it('devuelve null si no hay número', () => {
    expect(parsearImporte('')).toBeNull();
    expect(parsearImporte('   ')).toBeNull();
    expect(parsearImporte('abc')).toBeNull();
  });
});

describe('formatearEuros', () => {
  it('usa el formato español con coma decimal', () => {
    // El separador de millares del ICU es un espacio fino (U+202F) o un punto
    // según la versión; se comprueba lo que de verdad importa.
    const texto = formatearEuros(123456);
    expect(texto).toContain('234,56');
    expect(texto).toContain('€');
  });

  it('siempre muestra dos decimales', () => {
    expect(formatearEuros(500)).toContain('5,00');
  });
});

describe('repartirCentimos', () => {
  it('no pierde ni inventa céntimos', () => {
    const partes = repartirCentimos(10, 3);
    expect(partes).toEqual([4, 3, 3]);
    expect(partes.reduce((a, b) => a + b, 0)).toBe(10);
  });

  it('funciona con importes negativos', () => {
    const partes = repartirCentimos(-10, 3);
    expect(partes.reduce((a, b) => a + b, 0)).toBe(-10);
  });

  it('devuelve lista vacía si no hay partes', () => {
    expect(repartirCentimos(100, 0)).toEqual([]);
  });
});
