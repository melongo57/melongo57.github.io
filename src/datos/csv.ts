import { CATEGORIAS_GASTO } from '@/dominio/catalogos.ts';
import { aEuros } from '@/dominio/dinero.ts';
import { hoyISO } from '@/dominio/fechas.ts';
import type { Gasto, Mantenimiento, Repostaje, Vehiculo } from '@/dominio/tipos.ts';

/**
 * Exportación de gastos a CSV.
 *
 * DOS DECISIONES QUE PARECEN MENORES Y NO LO SON, porque este archivo se va a
 * abrir con Excel en español:
 *
 * 1. EL SEPARADOR ES PUNTO Y COMA, no coma. Excel en configuración española
 *    espera `;`, porque la coma es el separador decimal. Con comas, todo el
 *    archivo aterriza en una sola columna.
 *
 * 2. LOS DECIMALES VAN CON COMA. Un «12.50» lo interpreta Excel-ES como texto
 *    o como doce mil quinientos, según le apetezca.
 *
 * Y se antepone un BOM UTF-8: sin él, Excel abre el archivo en la codificación
 * del sistema y las tildes salen como «MunÌƒoz».
 */

const SEPARADOR = ';';
const BOM = '﻿';

/**
 * Escapa un campo según RFC 4180.
 * Se entrecomilla siempre que contenga el separador, comillas o saltos de
 * línea, y las comillas internas se duplican.
 */
export function escaparCampo(valor: string | number | undefined | null): string {
  if (valor === undefined || valor === null) return '';
  const texto = String(valor);
  if (texto.includes(SEPARADOR) || texto.includes('"') || /[\r\n]/.test(texto)) {
    return `"${texto.replace(/"/g, '""')}"`;
  }
  return texto;
}

/** Número con coma decimal, como espera Excel en español. */
export function numeroEspanol(valor: number, decimales = 2): string {
  return valor.toFixed(decimales).replace('.', ',');
}

export function filasACsv(filas: readonly (readonly (string | number | null | undefined)[])[]): string {
  // CRLF: es lo que dice el RFC y lo que Excel espera.
  return BOM + filas.map((fila) => fila.map(escaparCampo).join(SEPARADOR)).join('\r\n') + '\r\n';
}

// ---------------------------------------------------------------------------

export interface DatosCsv {
  vehiculos: readonly Vehiculo[];
  repostajes: readonly Repostaje[];
  mantenimientos: readonly Mantenimiento[];
  gastos: readonly Gasto[];
}

const CABECERA = [
  'Fecha',
  'Vehículo',
  'Matrícula',
  'Tipo',
  'Categoría',
  'Descripción',
  'Importe (€)',
  'Kilómetros',
  'Cantidad',
  'Unidad',
  'Precio unitario (€)',
  'Depósito lleno',
  'Notas',
] as const;

/**
 * Todos los gastos —combustible, taller y el resto— en una sola tabla
 * ordenada por fecha. Una hoja por concepto obligaría a cruzarlas a mano para
 * responder a «cuánto me costó este coche en marzo».
 */
export function generarCsvGastos(datos: DatosCsv): string {
  const alias = new Map(datos.vehiculos.map((v) => [v.id, v]));
  const nombre = (id: string): [string, string] => {
    const v = alias.get(id);
    return [v?.alias ?? '(borrado)', v?.matricula ?? ''];
  };

  type Fila = readonly (string | number | null | undefined)[];
  const filas: { fecha: string; fila: Fila }[] = [];

  for (const r of datos.repostajes) {
    const [nombreVehiculo, matricula] = nombre(r.vehiculoId);
    const precio = r.cantidad > 0 ? aEuros(r.importeCentimos) / r.cantidad : null;
    filas.push({
      fecha: r.fecha,
      fila: [
        r.fecha,
        nombreVehiculo,
        matricula,
        'Repostaje',
        r.unidad === 'kWh' ? 'Carga eléctrica' : 'Combustible',
        r.estacion ?? '',
        numeroEspanol(aEuros(r.importeCentimos)),
        r.km ?? '',
        numeroEspanol(r.cantidad, 2),
        r.unidad,
        precio !== null ? numeroEspanol(precio, 3) : '',
        r.depositoLleno ? 'Sí' : 'No',
        r.notas ?? '',
      ],
    });
  }

  for (const m of datos.mantenimientos) {
    const [nombreVehiculo, matricula] = nombre(m.vehiculoId);
    filas.push({
      fecha: m.fecha,
      fila: [
        m.fecha,
        nombreVehiculo,
        matricula,
        'Mantenimiento',
        m.titulo,
        m.taller ?? '',
        numeroEspanol(aEuros(m.costeCentimos)),
        m.km ?? '',
        '',
        '',
        '',
        '',
        m.notas ?? '',
      ],
    });
  }

  for (const g of datos.gastos) {
    const [nombreVehiculo, matricula] = nombre(g.vehiculoId);
    filas.push({
      fecha: g.fecha,
      fila: [
        g.fecha,
        nombreVehiculo,
        matricula,
        'Gasto',
        CATEGORIAS_GASTO[g.categoria].nombre,
        g.descripcion ?? '',
        numeroEspanol(aEuros(g.importeCentimos)),
        g.km ?? '',
        '',
        '',
        '',
        '',
        g.notas ?? '',
      ],
    });
  }

  filas.sort((a, b) => (a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : 0));

  return filasACsv([CABECERA, ...filas.map((f) => f.fila)]);
}

export function nombreArchivoCsv(hoy = hoyISO()): string {
  return `mi-garaje-gastos-${hoy}.csv`;
}
