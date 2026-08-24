import { describe, expect, it } from 'vitest';
import {
  escaparCampo,
  filasACsv,
  generarCsvGastos,
  nombreArchivoCsv,
  numeroEspanol,
} from './csv.ts';
import type { Gasto, Mantenimiento, Repostaje, Vehiculo } from '@/dominio/tipos.ts';

const VEHICULO = {
  id: 'v1',
  creadoEn: '',
  actualizadoEn: '',
  alias: 'El Golf',
  categoria: 'turismo',
  marca: 'VW',
  modelo: 'Golf',
  matricula: '4821 KRT',
  anio: 2018,
  combustible: 'diesel',
  estado: 'activo',
  orden: 0,
} as Vehiculo;

const REPOSTAJE = {
  id: 'r1',
  creadoEn: '',
  actualizadoEn: '',
  vehiculoId: 'v1',
  fecha: '2026-03-14',
  cantidad: 42.37,
  unidad: 'l',
  importeCentimos: 6733,
  km: 125000,
  depositoLleno: true,
  rupturaSerie: false,
  estacion: 'Repsol A-6',
  adjuntoIds: [],
} as Repostaje;

const MANTENIMIENTO = {
  id: 'm1',
  creadoEn: '',
  actualizadoEn: '',
  vehiculoId: 'v1',
  tipo: 'aceite',
  fecha: '2026-01-10',
  km: 120000,
  taller: 'Talleres Muñoz',
  costeCentimos: 9640,
  piezas: ['Aceite 5W30', 'Filtro'],
  adjuntoIds: [],
} as Mantenimiento;

const GASTO = {
  id: 'g1',
  creadoEn: '',
  actualizadoEn: '',
  vehiculoId: 'v1',
  categoria: 'seguro',
  fecha: '2026-02-01',
  importeCentimos: 48620,
  descripcion: 'Prima anual',
  recurrente: true,
  periodicidad: 'anual',
  adjuntoIds: [],
} as Gasto;

describe('escaparCampo', () => {
  it('deja en paz lo que no necesita comillas', () => {
    expect(escaparCampo('Repsol A-6')).toBe('Repsol A-6');
    expect(escaparCampo(42)).toBe('42');
  });

  it('entrecomilla si aparece el separador', () => {
    // Sin esto, «Aceite; filtro» partiría la fila en dos columnas.
    expect(escaparCampo('Aceite; filtro')).toBe('"Aceite; filtro"');
  });

  it('duplica las comillas internas', () => {
    expect(escaparCampo('Taller "El Rápido"')).toBe('"Taller ""El Rápido"""');
  });

  it('entrecomilla los saltos de línea', () => {
    expect(escaparCampo('Primera\nSegunda')).toBe('"Primera\nSegunda"');
  });

  it('convierte los vacíos en celda vacía', () => {
    expect(escaparCampo(undefined)).toBe('');
    expect(escaparCampo(null)).toBe('');
  });
});

describe('numeroEspanol', () => {
  it('usa coma decimal', () => {
    // Excel en español lee «12.50» como texto o como doce mil quinientos.
    expect(numeroEspanol(12.5)).toBe('12,50');
    expect(numeroEspanol(1.589, 3)).toBe('1,589');
  });
});

describe('filasACsv', () => {
  it('empieza con el BOM de UTF-8', () => {
    // Sin él, Excel abre el archivo en la codificación del sistema y las
    // tildes salen destrozadas.
    expect(filasACsv([['a']]).charCodeAt(0)).toBe(0xfeff);
  });

  it('separa con punto y coma', () => {
    // Con comas, Excel-ES mete la fila entera en una sola columna.
    expect(filasACsv([['a', 'b']])).toContain('a;b');
  });

  it('termina las líneas con CRLF', () => {
    const csv = filasACsv([['a'], ['b']]);
    expect(csv).toContain('a\r\nb');
  });
});

describe('generarCsvGastos', () => {
  const datos = {
    vehiculos: [VEHICULO],
    repostajes: [REPOSTAJE],
    mantenimientos: [MANTENIMIENTO],
    gastos: [GASTO],
  };

  it('junta las tres clases de gasto en una sola tabla', () => {
    const csv = generarCsvGastos(datos);
    expect(csv).toContain('Repostaje');
    expect(csv).toContain('Mantenimiento');
    expect(csv).toContain('Gasto');
  });

  it('ordena por fecha', () => {
    const csv = generarCsvGastos(datos);
    const lineas = csv.split('\r\n').slice(1);
    const fechas = lineas.filter(Boolean).map((l) => l.split(';')[0]);
    expect(fechas).toEqual(['2026-01-10', '2026-02-01', '2026-03-14']);
  });

  it('escribe los importes con coma decimal', () => {
    expect(generarCsvGastos(datos)).toContain('67,33');
    expect(generarCsvGastos(datos)).toContain('486,20');
  });

  it('deriva el precio por litro con tres decimales', () => {
    expect(generarCsvGastos(datos)).toContain('1,589');
  });

  it('incluye la cabecera con los nombres en español', () => {
    const primera = generarCsvGastos(datos).split('\r\n')[0]!;
    expect(primera).toContain('Fecha');
    expect(primera).toContain('Importe (€)');
    expect(primera).toContain('Depósito lleno');
  });

  it('no se rompe si el vehículo ya no existe', () => {
    // Un registro huérfano no debe impedir exportar el resto.
    const csv = generarCsvGastos({ ...datos, vehiculos: [] });
    expect(csv).toContain('(borrado)');
  });

  it('marca los repostajes parciales', () => {
    const parcial = { ...REPOSTAJE, depositoLleno: false };
    const csv = generarCsvGastos({ ...datos, repostajes: [parcial] });
    expect(csv).toContain(';No;');
  });

  it('genera solo la cabecera cuando no hay nada', () => {
    const csv = generarCsvGastos({
      vehiculos: [],
      repostajes: [],
      mantenimientos: [],
      gastos: [],
    });
    expect(csv.split('\r\n').filter(Boolean)).toHaveLength(1);
  });
});

describe('nombreArchivoCsv', () => {
  it('lleva la fecha', () => {
    expect(nombreArchivoCsv('2026-08-24')).toBe('mi-garaje-gastos-2026-08-24.csv');
  });
});
