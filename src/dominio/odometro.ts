import { diasEntre, hoyISO, sumarDias } from './fechas.ts';
import type { EstadoVehiculo, FechaISO, PuntoOdometro } from './tipos.ts';

/**
 * Estimación de kilometraje a partir del histórico del odómetro.
 *
 * El kilometraje actual no se guarda en ninguna parte: se calcula. Entre dos
 * lecturas reales se extrapola con el ritmo de uso reciente, y la cifra se
 * acompaña siempre de cuánta confianza merece. Un número inventado sin decir
 * que es inventado es peor que no dar ninguno: el usuario lo copiaría en el
 * formulario del taller.
 */

export type Confianza = 'exacta' | 'alta' | 'media' | 'baja' | 'sin_datos';

export interface EstimacionKm {
  /** Kilómetros estimados hoy. Nunca por debajo de la última lectura real. */
  km: number;
  confianza: Confianza;
  /** Última lectura real conocida, si la hay. */
  ultimaLectura: PuntoOdometro | null;
  /** Días transcurridos desde esa lectura. */
  diasDesdeLectura: number;
  /** Ritmo de uso empleado para extrapolar. */
  kmPorDia: number;
}

/** Ventana por defecto para calcular el ritmo: un año de uso. */
const VENTANA_DIAS = 365;

/**
 * Kilómetros al día según el uso reciente.
 *
 * Se mide sobre el último año en lugar de sobre todo el histórico porque el
 * uso de un vehículo cambia: quien hacía 30.000 km al año yendo a la oficina
 * hace 6.000 desde que teletrabaja, y el histórico completo seguiría
 * prometiendo kilómetros que ya no se recorren.
 *
 * Devuelve 0 si no hay datos suficientes o si el odómetro no avanza. Nunca
 * devuelve un ritmo negativo: un odómetro que retrocede es un error de
 * captura, no una predicción de que el coche vaya a desandar camino.
 */
export function ritmoDiario(
  puntos: readonly PuntoOdometro[],
  opciones: { ventanaDias?: number } = {},
): number {
  const { ventanaDias = VENTANA_DIAS } = opciones;
  if (puntos.length < 2) return 0;

  const ultimo = puntos[puntos.length - 1]!;
  const limite = sumarDias(ultimo.fecha, -ventanaDias);
  const enVentana = puntos.filter((p) => p.fecha >= limite);

  // Si en el último año solo hay una lectura, la ventana no sirve para medir
  // nada y se recurre al histórico completo.
  const base = enVentana.length >= 2 ? enVentana : puntos;
  const primero = base[0]!;

  const dias = diasEntre(primero.fecha, ultimo.fecha);
  if (dias <= 0) return 0;

  const avance = ultimo.km - primero.km;
  return avance > 0 ? avance / dias : 0;
}

/** Kilómetros al año según el ritmo reciente. Para el panel y las analíticas. */
export function kmAnuales(puntos: readonly PuntoOdometro[]): number {
  return Math.round(ritmoDiario(puntos) * 365);
}

/**
 * Odómetro estimado en una fecha cualquiera, interpolando entre las lecturas
 * que la rodean. Fuera del rango conocido extrapola con el ritmo medio de la
 * serie, sin bajar nunca de cero.
 *
 * Lo usan los formularios para prerrellenar los kilómetros cuando el usuario
 * registra algo con fecha atrasada.
 */
export function kmEnFecha(
  puntos: readonly HitoOdometro[],
  fecha: FechaISO,
): number | null {
  const primero = puntos[0];
  const ultimo = puntos[puntos.length - 1];
  if (!primero || !ultimo) return null;

  const dias = diasEntre(primero.fecha, ultimo.fecha);
  const ritmo = dias > 0 ? (ultimo.km - primero.km) / dias : 0;

  if (fecha <= primero.fecha) {
    return Math.max(0, Math.round(primero.km - ritmo * diasEntre(fecha, primero.fecha)));
  }
  if (fecha >= ultimo.fecha) {
    return Math.round(ultimo.km + ritmo * diasEntre(ultimo.fecha, fecha));
  }

  for (let i = 1; i < puntos.length; i += 1) {
    const anterior = puntos[i - 1]!;
    const siguiente = puntos[i]!;
    if (fecha > siguiente.fecha) continue;

    const tramo = diasEntre(anterior.fecha, siguiente.fecha);
    if (tramo === 0) return siguiente.km;
    const t = diasEntre(anterior.fecha, fecha) / tramo;
    return Math.round(anterior.km + (siguiente.km - anterior.km) * t);
  }

  return ultimo.km;
}

/** Lo mínimo que necesita el interpolador: una fecha y unos kilómetros. */
export interface HitoOdometro {
  fecha: FechaISO;
  km: number;
}

/** Lo que el estimador necesita saber del vehículo. */
export interface VehiculoEstimable {
  estado: EstadoVehiculo;
  fechaVenta?: FechaISO;
  kmVenta?: number;
}

function confianzaPor(dias: number): Confianza {
  if (dias === 0) return 'exacta';
  if (dias <= 30) return 'alta';
  if (dias <= 120) return 'media';
  return 'baja';
}

/**
 * Kilometraje estimado a día de hoy.
 *
 * Un vehículo vendido está congelado: se queda con los kilómetros de la
 * entrega y no sigue sumando. Sería absurdo estimar cuánto ha rodado desde que
 * dejó de ser tuyo.
 */
export function estimarKm(
  puntos: readonly PuntoOdometro[],
  vehiculo: VehiculoEstimable,
  hoy: FechaISO = hoyISO(),
): EstimacionKm {
  const ultimaLectura = puntos[puntos.length - 1] ?? null;

  if (vehiculo.estado === 'vendido') {
    return {
      km: vehiculo.kmVenta ?? ultimaLectura?.km ?? 0,
      confianza: ultimaLectura || vehiculo.kmVenta !== undefined ? 'exacta' : 'sin_datos',
      ultimaLectura,
      diasDesdeLectura: 0,
      kmPorDia: 0,
    };
  }

  if (!ultimaLectura) {
    return {
      km: 0,
      confianza: 'sin_datos',
      ultimaLectura: null,
      diasDesdeLectura: 0,
      kmPorDia: 0,
    };
  }

  // Una lectura con fecha futura (dedazo al teclear) no debe hacer que el
  // estimador reste kilómetros.
  const dias = Math.max(0, diasEntre(ultimaLectura.fecha, hoy));
  const kmPorDia = ritmoDiario(puntos);

  return {
    km: Math.max(ultimaLectura.km, Math.round(ultimaLectura.km + kmPorDia * dias)),
    confianza: confianzaPor(dias),
    ultimaLectura,
    diasDesdeLectura: dias,
    kmPorDia,
  };
}

/**
 * ¿La cifra es realmente una estimación, o coincide con la última lectura?
 *
 * Con una sola lectura no hay ritmo que aplicar y el resultado es la lectura
 * tal cual. Marcarlo entonces como «estimado» sería mentir en la dirección
 * incómoda: haría dudar de un dato que es exacto.
 */
export function esEstimacion(estimacion: EstimacionKm): boolean {
  if (estimacion.confianza === 'sin_datos' || estimacion.confianza === 'exacta') return false;
  return estimacion.ultimaLectura !== null && estimacion.km > estimacion.ultimaLectura.km;
}

/** Texto corto que explica de dónde sale la cifra. Para la interfaz. */
export function explicarConfianza(estimacion: EstimacionKm): string {
  switch (estimacion.confianza) {
    case 'sin_datos':
      return 'Sin lecturas registradas';
    case 'exacta':
      return 'Lectura registrada';
    case 'alta':
    case 'media':
    case 'baja':
      return `Estimado desde hace ${estimacion.diasDesdeLectura} días`;
  }
}
