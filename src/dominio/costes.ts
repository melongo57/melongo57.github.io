import { claveMes, diasEntre, hoyISO, mesesEntre } from './fechas.ts';
import { kmEnFecha, type HitoOdometro } from './odometro.ts';
import type {
  CategoriaGasto,
  Centimos,
  FechaISO,
  Gasto,
  Mantenimiento,
  Repostaje,
  Vehiculo,
} from './tipos.ts';

/**
 * Coste por kilómetro y coste total de propiedad.
 *
 * EL DENOMINADOR ES EL PROBLEMA, no el numerador. Sumar gastos es trivial;
 * decidir entre cuántos kilómetros se reparten no lo es.
 *
 * Dividir todo lo gastado entre los kilómetros de toda la vida del vehículo
 * subestima el coste cuando llevas dos años registrando un coche que compraste
 * hace siete: los gastos son de dos años y los kilómetros de siete. Por eso el
 * kilometraje se mide SOBRE EL MISMO PERIODO que los gastos que se suman,
 * interpolando el odómetro en las dos fechas.
 */

export type ClaseGasto = 'energia' | 'mantenimiento' | 'otros';

export interface Periodo {
  desde: FechaISO;
  hasta: FechaISO;
}

export interface EntradaCostes {
  vehiculo: Vehiculo;
  repostajes: readonly Repostaje[];
  mantenimientos: readonly Mantenimiento[];
  gastos: readonly Gasto[];
  /** Histórico de odómetro, para medir los kilómetros del periodo. */
  puntos: readonly HitoOdometro[];
  /** Si se omite, se toma todo el histórico. */
  periodo?: Periodo;
  /**
   * Fecha de referencia. Inyectable como en el resto del dominio
   * (`vencimientos`, `calendario`, `odometro`): sin esto, cualquier test sobre
   * costes depende del día en que se ejecuta y empieza a fallar solo al pasar
   * la medianoche.
   */
  hoy?: FechaISO;
}

export interface DesgloseCostes {
  energiaCentimos: Centimos;
  mantenimientoCentimos: Centimos;
  otrosCentimos: Centimos;
  totalCentimos: Centimos;
}

export interface CostePorKm extends DesgloseCostes {
  periodo: Periodo;
  kmRecorridos: number;
  /**
   * Céntimos por kilómetro. `null` cuando no hay kilómetros medidos: cero
   * significaría «no cuesta nada», que es una mentira distinta de «no lo sé».
   */
  centimosPorKm: number | null;
  /** Registros que han entrado en la cuenta. Para poder explicar la cifra. */
  registros: number;
}

/** Rango que cubren los registros de un vehículo, o el histórico completo. */
function periodoCompleto(entrada: EntradaCostes): Periodo {
  const fechas: FechaISO[] = [
    ...entrada.repostajes.map((r) => r.fecha),
    ...entrada.mantenimientos.map((m) => m.fecha),
    ...entrada.gastos.map((g) => g.fecha),
  ];

  const hoy = entrada.hoy ?? hoyISO();
  if (fechas.length === 0) {
    return { desde: entrada.vehiculo.fechaCompra ?? hoy, hasta: hoy };
  }

  fechas.sort();
  return {
    desde: fechas[0]!,
    // Un vehículo vendido dejó de gastar el día que se entregó.
    hasta: entrada.vehiculo.estado === 'vendido' ? (entrada.vehiculo.fechaVenta ?? hoy) : hoy,
  };
}

function dentro(fecha: FechaISO, periodo: Periodo): boolean {
  return fecha >= periodo.desde && fecha <= periodo.hasta;
}

export function calcularCostePorKm(entrada: EntradaCostes): CostePorKm {
  const periodo = entrada.periodo ?? periodoCompleto(entrada);

  const repostajes = entrada.repostajes.filter((r) => dentro(r.fecha, periodo));
  const mantenimientos = entrada.mantenimientos.filter((m) => dentro(m.fecha, periodo));
  const gastos = entrada.gastos.filter((g) => dentro(g.fecha, periodo));

  const energiaCentimos = repostajes.reduce((t, r) => t + r.importeCentimos, 0);
  const mantenimientoCentimos = mantenimientos.reduce((t, m) => t + m.costeCentimos, 0);
  const otrosCentimos = gastos.reduce((t, g) => t + g.importeCentimos, 0);
  const totalCentimos = energiaCentimos + mantenimientoCentimos + otrosCentimos;

  // Los kilómetros se miden en el MISMO periodo que los gastos.
  const kmInicio = kmEnFecha(entrada.puntos, periodo.desde);
  const kmFin = kmEnFecha(entrada.puntos, periodo.hasta);
  const kmRecorridos = kmInicio !== null && kmFin !== null ? Math.max(0, kmFin - kmInicio) : 0;

  return {
    periodo,
    energiaCentimos,
    mantenimientoCentimos,
    otrosCentimos,
    totalCentimos,
    kmRecorridos,
    centimosPorKm: kmRecorridos > 0 ? totalCentimos / kmRecorridos : null,
    registros: repostajes.length + mantenimientos.length + gastos.length,
  };
}

// ---------------------------------------------------------------------------
// Coste total de propiedad
// ---------------------------------------------------------------------------

export interface CosteTotalPropiedad extends DesgloseCostes {
  /** Precio de compra. Cero si no se conoce. */
  compraCentimos: Centimos;
  /** Precio de venta, ya recuperado. Cero si sigue siendo tuyo. */
  recuperadoCentimos: Centimos;
  /**
   * Lo que llevas puesto: compra + todo lo gastado − lo recuperado al vender.
   * Mientras no lo vendas incluye el precio de compra entero, porque todavía
   * no has recuperado nada; lo que valga hoy es una estimación que esta app no
   * puede hacer.
   */
  costeRealCentimos: Centimos;
  kmRecorridos: number;
  centimosPorKm: number | null;
  meses: number;
  centimosPorMes: number | null;
  /** El precio de compra no se conoce: la cifra está incompleta. */
  faltaPrecioCompra: boolean;
  /**
   * Los registros no cubren toda la propiedad del vehículo.
   *
   * Pasa siempre que empiezas a registrar un coche que ya tenías: los gastos
   * son de los últimos meses y los kilómetros, de todos los años. El resultado
   * es un coste por kilómetro más bajo de lo real, y hay que decirlo. Un
   * número creíble y falso es peor que ninguno.
   */
  registrosIncompletos: boolean;
  /** Desde cuándo hay registros. */
  cubreDesde: FechaISO;
}

/** Margen antes de dar por incompleta la serie: tres meses. */
const DIAS_TOLERANCIA_REGISTROS = 90;

export function calcularCosteTotalPropiedad(entrada: EntradaCostes): CosteTotalPropiedad {
  const { vehiculo } = entrada;
  const desglose = calcularCostePorKm({ ...entrada, periodo: undefined });

  const compraCentimos = vehiculo.precioCompraCentimos ?? 0;
  const recuperadoCentimos = vehiculo.precioVentaCentimos ?? 0;
  const costeRealCentimos = compraCentimos + desglose.totalCentimos - recuperadoCentimos;

  const desde = vehiculo.fechaCompra ?? desglose.periodo.desde;
  const hoy = entrada.hoy ?? hoyISO();
  const hasta = vehiculo.estado === 'vendido' ? (vehiculo.fechaVenta ?? hoy) : hoy;
  const meses = Math.max(1, mesesEntre(desde, hasta));

  // Los kilómetros de propiedad van de la compra a hoy, no del primer registro.
  const kmCompra = vehiculo.kmCompra ?? kmEnFecha(entrada.puntos, desde) ?? 0;
  const kmFinal = vehiculo.kmVenta ?? kmEnFecha(entrada.puntos, hasta) ?? kmCompra;
  const kmRecorridos = Math.max(0, kmFinal - kmCompra);

  const cubreDesde = desglose.periodo.desde;
  const registrosIncompletos =
    vehiculo.fechaCompra !== undefined &&
    diasEntre(vehiculo.fechaCompra, cubreDesde) > DIAS_TOLERANCIA_REGISTROS;

  return {
    ...desglose,
    compraCentimos,
    recuperadoCentimos,
    costeRealCentimos,
    kmRecorridos,
    centimosPorKm: kmRecorridos > 0 ? costeRealCentimos / kmRecorridos : null,
    meses,
    centimosPorMes: costeRealCentimos / meses,
    faltaPrecioCompra: vehiculo.precioCompraCentimos === undefined,
    registrosIncompletos,
    cubreDesde,
  };
}

// ---------------------------------------------------------------------------
// Desgloses para las gráficas
// ---------------------------------------------------------------------------

export interface GastoMensual {
  /** Clave 'YYYY-MM'. */
  mes: string;
  energiaCentimos: Centimos;
  mantenimientoCentimos: Centimos;
  otrosCentimos: Centimos;
  totalCentimos: Centimos;
}

/**
 * Gasto agrupado por mes, del más antiguo al más reciente.
 * Rellena los meses sin ningún registro: una gráfica con huecos miente sobre
 * la forma de la serie.
 */
export function gastoPorMes(entrada: EntradaCostes): GastoMensual[] {
  const meses = new Map<string, GastoMensual>();

  const asegurar = (mes: string): GastoMensual => {
    let fila = meses.get(mes);
    if (!fila) {
      fila = {
        mes,
        energiaCentimos: 0,
        mantenimientoCentimos: 0,
        otrosCentimos: 0,
        totalCentimos: 0,
      };
      meses.set(mes, fila);
    }
    return fila;
  };

  for (const r of entrada.repostajes) {
    const fila = asegurar(claveMes(r.fecha));
    fila.energiaCentimos += r.importeCentimos;
    fila.totalCentimos += r.importeCentimos;
  }
  for (const m of entrada.mantenimientos) {
    const fila = asegurar(claveMes(m.fecha));
    fila.mantenimientoCentimos += m.costeCentimos;
    fila.totalCentimos += m.costeCentimos;
  }
  for (const g of entrada.gastos) {
    const fila = asegurar(claveMes(g.fecha));
    fila.otrosCentimos += g.importeCentimos;
    fila.totalCentimos += g.importeCentimos;
  }

  if (meses.size === 0) return [];

  const claves = [...meses.keys()].sort();
  const primera = claves[0]!;
  const ultima = claves[claves.length - 1]!;

  const resultado: GastoMensual[] = [];
  let actual = primera;
  while (actual <= ultima) {
    resultado.push(asegurar(actual));
    actual = siguienteMes(actual);
  }
  return resultado;
}

function siguienteMes(clave: string): string {
  const [anio, mes] = clave.split('-').map(Number);
  const a = anio ?? 1970;
  const m = mes ?? 1;
  return m === 12 ? `${a + 1}-01` : `${a}-${String(m + 1).padStart(2, '0')}`;
}

export interface GastoPorCategoria {
  categoria: CategoriaGasto | 'combustible' | 'mantenimiento';
  centimos: Centimos;
  /** Proporción sobre el total, entre 0 y 1. */
  proporcion: number;
}

/**
 * Reparto del gasto por categoría, de mayor a menor.
 * Combustible y mantenimiento entran como categorías propias: sin ellos, el
 * reparto dejaría fuera la mayor parte de lo que cuesta un coche.
 */
export function gastoPorCategoria(entrada: EntradaCostes): GastoPorCategoria[] {
  const acumulado = new Map<GastoPorCategoria['categoria'], Centimos>();
  const sumar = (categoria: GastoPorCategoria['categoria'], centimos: Centimos): void => {
    acumulado.set(categoria, (acumulado.get(categoria) ?? 0) + centimos);
  };

  const energia = entrada.repostajes.reduce((t, r) => t + r.importeCentimos, 0);
  if (energia > 0) sumar('combustible', energia);

  const mantenimiento = entrada.mantenimientos.reduce((t, m) => t + m.costeCentimos, 0);
  if (mantenimiento > 0) sumar('mantenimiento', mantenimiento);

  for (const g of entrada.gastos) sumar(g.categoria, g.importeCentimos);

  const total = [...acumulado.values()].reduce((t, c) => t + c, 0);
  if (total === 0) return [];

  return [...acumulado.entries()]
    .map(([categoria, centimos]) => ({ categoria, centimos, proporcion: centimos / total }))
    .sort((a, b) => b.centimos - a.centimos);
}

/** Periodo de los últimos N meses hasta hoy. */
export function ultimosMeses(meses: number, hasta: FechaISO = hoyISO()): Periodo {
  const [anio, mes, dia] = hasta.split('-').map(Number);
  const fecha = new Date(anio ?? 1970, (mes ?? 1) - 1 - meses, dia ?? 1);
  const desde = `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, '0')}-${String(
    fecha.getDate(),
  ).padStart(2, '0')}`;
  return { desde, hasta };
}

/** Días que cubre un periodo. Para prorratear cuando haga falta. */
export function diasDe(periodo: Periodo): number {
  return Math.max(1, diasEntre(periodo.desde, periodo.hasta));
}
