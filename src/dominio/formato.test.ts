import { describe, expect, it } from 'vitest';
import {
  formatearBytes,
  formatearConsumo,
  formatearCostePorKm,
  formatearKm,
  formatearPrecioUnitario,
  parsearCantidad,
  parsearDecimal,
  parsearKm,
  parsearPrecioUnitario,
  unirEnEspanol,
} from './formato.ts';

describe('parsearDecimal', () => {
  it('lee coma decimal, que es lo que teclea un usuario español', () => {
    expect(parsearDecimal('42,37')).toBe(42.37);
  });

  it('lee también punto decimal', () => {
    expect(parsearDecimal('42.37')).toBe(42.37);
  });

  it('trata como millares un grupo más largo de lo que admite el campo', () => {
    expect(parsearDecimal('17.900')).toBe(17900);
    expect(parsearDecimal('17.900', 2)).toBe(17900);
  });

  it('respeta los decimales que el campo sí admite', () => {
    // 1,589 €/l es un precio real de surtidor: tres decimales.
    expect(parsearDecimal('1,589', 3)).toBe(1.589);
    // Con solo dos decimales admitidos, ese mismo texto son millares.
    expect(parsearDecimal('1,589', 2)).toBe(1589);
  });

  it('encadena separadores de millares', () => {
    expect(parsearDecimal('1.234.567')).toBe(1234567);
  });

  it('resuelve la mezcla de coma y punto por el orden', () => {
    expect(parsearDecimal('1.234,56')).toBe(1234.56);
    expect(parsearDecimal('1,234.56')).toBe(1234.56);
  });

  it('ignora el euro y los espacios que mete Intl al formatear', () => {
    expect(parsearDecimal('45,90 €')).toBe(45.9);
    expect(parsearDecimal('1 234,50')).toBe(1234.5);
    expect(parsearDecimal('1 234,50')).toBe(1234.5);
  });

  it('devuelve null cuando no hay número', () => {
    expect(parsearDecimal('')).toBeNull();
    expect(parsearDecimal('   ')).toBeNull();
    expect(parsearDecimal('lleno')).toBeNull();
    expect(parsearDecimal(',')).toBeNull();
  });

  it('acepta negativos', () => {
    expect(parsearDecimal('-12,50')).toBe(-12.5);
  });
});

describe('parseadores por campo', () => {
  it('kilómetros: siempre enteros, cualquier separador es de millares', () => {
    expect(parsearKm('125.380')).toBe(125380);
    expect(parsearKm('125380')).toBe(125380);
    // Si aun así alguien escribe decimales, se redondea en vez de fallar.
    expect(parsearKm('125380,6')).toBe(1253806);
  });

  it('cantidad repostada: hasta tres decimales', () => {
    expect(parsearCantidad('42,37')).toBe(42.37);
    expect(parsearCantidad('42,375')).toBe(42.375);
  });

  it('precio unitario: tres decimales', () => {
    expect(parsearPrecioUnitario('1,589')).toBe(1.589);
    expect(parsearPrecioUnitario('0,092')).toBe(0.092);
  });
});

describe('presentación', () => {
  it('formatea kilómetros con separador de millares', () => {
    expect(formatearKm(125380)).toMatch(/^125.380 km$/u);
  });

  it('formatea el consumo con la unidad correcta', () => {
    expect(formatearConsumo(5.63, 'l')).toBe('5,6 l/100 km');
    expect(formatearConsumo(17.42, 'kWh')).toBe('17,4 kWh/100 km');
  });

  it('conserva los tres decimales del precio de surtidor', () => {
    expect(formatearPrecioUnitario(1.589, 'l')).toBe('1,589 €/l');
  });

  it('formatea el coste por kilómetro con dos decimales', () => {
    expect(formatearCostePorKm(0.184)).toBe('0,18 €/km');
  });

  it('formatea tamaños de adjunto', () => {
    expect(formatearBytes(512)).toBe('512 B');
    expect(formatearBytes(2048)).toBe('2,0 kB');
    expect(formatearBytes(3 * 1024 * 1024)).toBe('3,0 MB');
  });
});

describe('unirEnEspanol', () => {
  it('usa la conjunción final', () => {
    expect(unirEnEspanol([])).toBe('');
    expect(unirEnEspanol(['aceite'])).toBe('aceite');
    expect(unirEnEspanol(['aceite', 'filtro'])).toBe('aceite y filtro');
    expect(unirEnEspanol(['aceite', 'filtro', 'bujías'])).toBe('aceite, filtro y bujías');
  });
});
