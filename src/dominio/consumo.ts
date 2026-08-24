import type { Centimos, FechaISO, Repostaje, UnidadEnergia } from './tipos.ts';

/**
 * Cálculo de consumo real.
 *
 * EL MÉTODO ES «DE LLENO A LLENO», y no hay otro que funcione.
 *
 * Un repostaje no dice cuánto has gastado: dice cuánto has metido. Solo cuando
 * el depósito vuelve a estar lleno se sabe que lo repostado equivale
 * exactamente a lo consumido desde el lleno anterior. Por eso un tramo va de un
 * depósito lleno al siguiente, y los repostajes parciales de en medio no se
 * descartan: se suman al tramo, porque ese combustible también se ha quemado.
 *
 * Dividir litros entre kilómetros repostaje a repostaje —que es lo que hace
 * media internet— da cifras que bailan un 30 % según lo lleno que estuviera el
 * depósito cada vez.
 *
 * La media es PONDERADA POR KILÓMETROS, no una media de medias: un tramo de
 * 900 km dice más sobre el consumo real que uno de 200, y promediar los dos
 * porcentajes por igual le daría el mismo peso a los dos.
 */

export interface TramoConsumo {
  /** Repostaje lleno con el que abre el tramo. */
  desdeId: string;
  /** Repostaje lleno con el que cierra. Es la fecha que se le atribuye. */
  hastaId: string;
  fecha: FechaISO;
  km: number;
  cantidad: number;
  unidad: UnidadEnergia;
  /** Litros o kWh por cada 100 km. */
  consumo: number;
  costeCentimos: Centimos;
  /** Repostajes parciales incluidos. Útil para explicar de dónde sale el dato. */
  parciales: number;
}

export type MotivoDescarte =
  | 'sin_km'
  | 'ruptura_serie'
  | 'sin_avance'
  | 'primer_lleno'
  | 'sin_lleno_previo';

export interface ResumenConsumo {
  unidad: UnidadEnergia;
  tramos: TramoConsumo[];
  /** Media ponderada por kilómetros de todos los tramos. */
  consumoMedio: number | null;
  /** Lo mismo, pero solo con los tramos recientes. */
  consumoReciente: number | null;
  kmTotales: number;
  cantidadTotal: number;
  costeCentimos: Centimos;
  /** Precio medio por unidad, ponderado por cantidad. */
  precioMedio: number | null;
  /** Repostajes que no han podido entrar en ningún tramo, con su motivo. */
  descartados: { id: string; motivo: MotivoDescarte }[];
}

/** Cuántos tramos se consideran «recientes» para la media corta. */
const TRAMOS_RECIENTES = 5;

/** Ordena por kilómetros y, sin ellos, por fecha. */
function ordenar(repostajes: readonly Repostaje[]): Repostaje[] {
  return [...repostajes].sort((a, b) => {
    if (a.km !== undefined && b.km !== undefined && a.km !== b.km) return a.km - b.km;
    return a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : 0;
  });
}

/**
 * Tramos de consumo de una serie de repostajes de una misma unidad.
 *
 * Cada tramo va de un depósito lleno al siguiente. Un repostaje marcado como
 * ruptura de serie invalida el tramo que termina en él —hubo repostajes sin
 * registrar por medio, así que los kilómetros no cuadran con el combustible—
 * pero sí puede abrir el siguiente.
 */
export function calcularTramos(repostajes: readonly Repostaje[]): {
  tramos: TramoConsumo[];
  descartados: { id: string; motivo: MotivoDescarte }[];
} {
  const ordenados = ordenar(repostajes);
  const tramos: TramoConsumo[] = [];
  const descartados: { id: string; motivo: MotivoDescarte }[] = [];

  /*
   * Último repostaje lleno CON KILÓMETROS, que abre el tramo en curso.
   * El tipo lleva `km: number` a propósito: un tramo no se puede abrir sin
   * kilómetros, y así la invariante está en el tipo y no solo en el flujo.
   */
  let apertura: { id: string; km: number } | null = null;
  /** Combustible acumulado desde la apertura, incluidos los parciales. */
  let acumulado = 0;
  let acumuladoCentimos = 0;
  let parciales = 0;
  /** Hubo una ruptura dentro del tramo en curso: no se puede cerrar. */
  let tramoRoto = false;

  for (const r of ordenados) {
    if (r.km === undefined) {
      // Sin kilómetros no aporta distancia, pero su combustible sí se ha
      // quemado: se suma al tramo en curso y se avisa de que falta el dato.
      descartados.push({ id: r.id, motivo: 'sin_km' });
      if (apertura) {
        acumulado += r.cantidad;
        acumuladoCentimos += r.importeCentimos;
        if (!r.depositoLleno) parciales += 1;
      }
      continue;
    }

    if (apertura === null) {
      // Todavía no hay desde dónde medir. Solo un lleno puede abrir tramo.
      if (r.depositoLleno) {
        apertura = { id: r.id, km: r.km };
        acumulado = 0;
        acumuladoCentimos = 0;
        parciales = 0;
        tramoRoto = false;
      } else {
        descartados.push({ id: r.id, motivo: 'sin_lleno_previo' });
      }
      continue;
    }

    // A partir de aquí, el combustible de este repostaje pertenece al tramo
    // que se abrió antes: es lo que se ha quemado desde entonces.
    acumulado += r.cantidad;
    acumuladoCentimos += r.importeCentimos;
    if (r.rupturaSerie) tramoRoto = true;

    if (!r.depositoLleno) {
      parciales += 1;
      continue;
    }

    // Repostaje lleno: cierra el tramo.
    const km = r.km - apertura.km;

    if (tramoRoto) {
      descartados.push({ id: r.id, motivo: 'ruptura_serie' });
    } else if (km <= 0) {
      descartados.push({ id: r.id, motivo: 'sin_avance' });
    } else {
      tramos.push({
        desdeId: apertura.id,
        hastaId: r.id,
        fecha: r.fecha,
        km,
        cantidad: acumulado,
        unidad: r.unidad,
        consumo: (acumulado / km) * 100,
        costeCentimos: acumuladoCentimos,
        parciales,
      });
    }

    // El lleno que cierra un tramo abre el siguiente.
    apertura = { id: r.id, km: r.km };
    acumulado = 0;
    acumuladoCentimos = 0;
    parciales = 0;
    tramoRoto = false;
  }

  return { tramos, descartados };
}

/** Media ponderada por kilómetros: los tramos largos pesan más. */
function mediaPonderada(tramos: readonly TramoConsumo[]): number | null {
  if (tramos.length === 0) return null;
  const km = tramos.reduce((t, x) => t + x.km, 0);
  if (km <= 0) return null;
  const cantidad = tramos.reduce((t, x) => t + x.cantidad, 0);
  return (cantidad / km) * 100;
}

/**
 * Resumen de consumo de un vehículo para una unidad concreta.
 *
 * Un híbrido enchufable tiene dos series independientes, litros y kWh, y se
 * calculan por separado. Ojo al interpretar la de litros en ese caso: mide el
 * combustible gastado en una distancia que también se ha recorrido en parte
 * con electricidad, igual que hace el ordenador de a bordo del propio coche.
 */
export function resumirConsumo(
  repostajes: readonly Repostaje[],
  unidad: UnidadEnergia,
  opciones: { tramosRecientes?: number } = {},
): ResumenConsumo {
  const { tramosRecientes = TRAMOS_RECIENTES } = opciones;
  const deLaUnidad = repostajes.filter((r) => r.unidad === unidad);
  const { tramos, descartados } = calcularTramos(deLaUnidad);

  const cantidadTotal = deLaUnidad.reduce((t, r) => t + r.cantidad, 0);
  const costeCentimos = deLaUnidad.reduce((t, r) => t + r.importeCentimos, 0);

  return {
    unidad,
    tramos,
    consumoMedio: mediaPonderada(tramos),
    consumoReciente: mediaPonderada(tramos.slice(-tramosRecientes)),
    kmTotales: tramos.reduce((t, x) => t + x.km, 0),
    cantidadTotal,
    costeCentimos,
    // Ponderado por cantidad: repostar 60 l a 1,50 y 5 l a 1,90 no da 1,70.
    precioMedio: cantidadTotal > 0 ? costeCentimos / 100 / cantidadTotal : null,
    descartados,
  };
}

/**
 * Precio por unidad de un repostaje concreto.
 * Se deriva y no se guarda, para que cantidad, importe y precio no puedan
 * contradecirse entre sí.
 */
export function precioUnitario(repostaje: Repostaje): number | null {
  if (repostaje.cantidad <= 0) return null;
  return repostaje.importeCentimos / 100 / repostaje.cantidad;
}

/**
 * Completa el tercer campo del formulario de repostaje a partir de los otros
 * dos. Devuelve `null` si no hay suficientes datos o si el resultado no tiene
 * sentido.
 *
 * Es el corazón del «menos de quince segundos»: en el surtidor tienes delante
 * los litros y el importe, y el precio por litro te lo calcula la app; o
 * anotas el precio del cartel y el importe, y salen los litros.
 */
export function completarRepostaje(entrada: {
  cantidad: number | null;
  precioUnitario: number | null;
  importeEuros: number | null;
}): { cantidad: number | null; precioUnitario: number | null; importeEuros: number | null } {
  const { cantidad, precioUnitario: precio, importeEuros: importe } = entrada;
  const valido = (n: number | null): n is number => n !== null && Number.isFinite(n) && n > 0;

  if (valido(cantidad) && valido(precio) && !valido(importe)) {
    return { ...entrada, importeEuros: redondear(cantidad * precio, 2) };
  }
  if (valido(cantidad) && valido(importe) && !valido(precio)) {
    return { ...entrada, precioUnitario: redondear(importe / cantidad, 3) };
  }
  if (valido(precio) && valido(importe) && !valido(cantidad)) {
    return { ...entrada, cantidad: redondear(importe / precio, 2) };
  }
  return entrada;
}

function redondear(valor: number, decimales: number): number {
  const factor = 10 ** decimales;
  return Math.round(valor * factor) / factor;
}

/** Los tres campos del surtidor. `null` es «vacío», no cero. */
export interface TrioRepostaje {
  cantidad: number | null;
  precioUnitario: number | null;
  importeEuros: number | null;
}

export type CampoTrio = keyof TrioRepostaje;

/**
 * Recalcula el trío cuando el usuario edita uno de los tres campos.
 *
 * `completarRepostaje` solo rellena huecos; esto además CORRIGE el campo
 * derivado cuando los tres están puestos. La regla es que el campo recién
 * tocado y el otro que el usuario escribió antes mandan, y el tercero se
 * recalcula:
 *
 *   tocas litros  → si hay precio, recalcula importe; si no, el precio.
 *   tocas precio  → si hay litros, recalcula importe; si no, los litros.
 *   tocas importe → si hay litros, recalcula precio;  si no, los litros.
 *
 * Se prefiere recalcular el importe porque es el dato que el surtidor da
 * redondeado y el que menos duele que se ajuste un céntimo.
 */
export function recalcularTrio(campo: CampoTrio, valores: TrioRepostaje): TrioRepostaje {
  const valido = (n: number | null): n is number => n !== null && Number.isFinite(n) && n > 0;
  const { cantidad, precioUnitario: precio, importeEuros: importe } = valores;

  switch (campo) {
    case 'cantidad':
      if (!valido(cantidad)) return valores;
      if (valido(precio)) return { ...valores, importeEuros: redondear(cantidad * precio, 2) };
      if (valido(importe)) return { ...valores, precioUnitario: redondear(importe / cantidad, 3) };
      return valores;

    case 'precioUnitario':
      if (!valido(precio)) return valores;
      if (valido(cantidad)) return { ...valores, importeEuros: redondear(cantidad * precio, 2) };
      if (valido(importe)) return { ...valores, cantidad: redondear(importe / precio, 2) };
      return valores;

    case 'importeEuros':
      if (!valido(importe)) return valores;
      if (valido(cantidad)) return { ...valores, precioUnitario: redondear(importe / cantidad, 3) };
      if (valido(precio)) return { ...valores, cantidad: redondear(importe / precio, 2) };
      return valores;
  }
}
