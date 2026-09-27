import { diasEntre, formatearFecha, hoyISO, sumarMeses } from './fechas.ts';
import type { EstimacionKm } from './odometro.ts';
import type { Ajustes, Alerta, FechaISO, Id, Vehiculo } from './tipos.ts';

/**
 * Motor de vencimientos.
 *
 * Responde a una sola pregunta: qué le toca a este vehículo, cuándo, y cuánta
 * prisa corre. Cada alerta puede vencer por kilómetros, por tiempo o por una
 * fecha fija, y todas acaban en una única lista ordenada por urgencia.
 *
 * LA IDEA CENTRAL: para comparar «faltan 800 km» con «faltan 20 días» hay que
 * traducir los kilómetros a días usando el ritmo de uso del vehículo. A
 * 40 km/día, 800 km son 20 días y los dos avisos empatan; a 5 km/día son 160
 * días y el plazo manda con diferencia. Sin esa conversión, ordenar por
 * urgencia sería comparar peras con manzanas.
 */

export type Semaforo = 'ok' | 'proximo' | 'vencido';

/** Qué dimensión vence antes. */
export type Motivo = 'km' | 'tiempo';

export interface Vencimiento {
  /** Clave estable para React y para no duplicar avisos. */
  id: string;
  alertaId: Id;
  vehiculoId: Id;
  titulo: string;
  icono: string;
  semaforo: Semaforo;

  /** Cuándo vence por tiempo, si la alerta tiene plazo. */
  fechaLimite?: FechaISO;
  /** Días que faltan. Negativo si ya pasó. */
  diasRestantes?: number;

  /** A qué kilómetros vence, si la alerta tiene intervalo de km. */
  kmLimite?: number;
  /** Kilómetros que faltan. Negativo si ya se pasaron. */
  kmRestantes?: number;

  motivo: Motivo;
  /**
   * Días equivalentes que quedan, contando las dos dimensiones. Es la clave de
   * ordenación: cuanto menor, más urge. Negativo si está vencido.
   */
  urgencia: number;

  /**
   * No hay de dónde contar: la alerta no sabe cuándo se hizo por última vez.
   * No es un vencimiento, es un dato que falta, y la interfaz lo pide.
   */
  faltaUltimaVez: boolean;

  /** Última vez que se hizo, copiada de la alerta. */
  ultimaFecha?: FechaISO;
  ultimoKm?: number;
}

/** Días equivalentes a unos kilómetros, según el ritmo de uso. */
function kmADias(km: number, kmPorDia: number): number {
  // Sin ritmo conocido no se puede traducir: un vehículo parado no se acerca
  // al límite por kilómetros por mucho que pase el tiempo.
  if (kmPorDia <= 0) return Number.POSITIVE_INFINITY;
  return km / kmPorDia;
}

export interface EntradaVencimientos {
  vehiculo: Vehiculo;
  alertas: readonly Alerta[];
  estimacion: EstimacionKm;
  ajustes: Pick<Ajustes, 'avisoDias' | 'avisoKm'>;
  hoy?: FechaISO;
}

/**
 * Hasta dónde llega una alerta desde su última vez. Separado del cálculo del
 * semáforo porque la hoja de «Marcar como hecha» lo necesita para enseñar,
 * antes de guardar, cuándo volverá a tocar.
 */
export function limitesDe(
  alerta: Pick<Alerta, 'cadaKm' | 'cadaMeses' | 'venceEl' | 'ultimaFecha' | 'ultimoKm'>,
): { fechaLimite?: FechaISO; kmLimite?: number } {
  const fechaLimite =
    alerta.venceEl ??
    (alerta.cadaMeses !== undefined && alerta.ultimaFecha !== undefined
      ? sumarMeses(alerta.ultimaFecha, alerta.cadaMeses)
      : undefined);
  const kmLimite =
    alerta.cadaKm !== undefined && alerta.ultimoKm !== undefined
      ? alerta.ultimoKm + alerta.cadaKm
      : undefined;
  return {
    ...(fechaLimite !== undefined ? { fechaLimite } : {}),
    ...(kmLimite !== undefined ? { kmLimite } : {}),
  };
}

function vencimientoDe(entrada: EntradaVencimientos, alerta: Alerta, hoy: FechaISO): Vencimiento {
  const { vehiculo, estimacion, ajustes } = entrada;
  const base = {
    id: `alerta:${alerta.id}`,
    alertaId: alerta.id,
    vehiculoId: vehiculo.id,
    titulo: alerta.nombre,
    icono: alerta.icono,
    ...(alerta.ultimaFecha !== undefined ? { ultimaFecha: alerta.ultimaFecha } : {}),
    ...(alerta.ultimoKm !== undefined ? { ultimoKm: alerta.ultimoKm } : {}),
  };

  const { fechaLimite, kmLimite } = limitesDe(alerta);

  if (fechaLimite === undefined && kmLimite === undefined) {
    /*
     * Sin última vez no hay cuenta posible. NO se marca como vencida aunque
     * lo sea casi seguro: si compraste el coche en 2019 y nunca anotaste un
     * cambio de aceite, lo que la app sabe es que le falta el dato, y eso es
     * lo que debe decir. Anunciar cinco años de retraso en media docena de
     * alertas a la vez ahoga el aviso que sí es real —la ITV caducada— y
     * enseña a ignorar el rojo.
     */
    return { ...base, semaforo: 'proximo', motivo: 'tiempo', urgencia: 0, faltaUltimaVez: true };
  }

  const avisoDias = alerta.avisoDias ?? ajustes.avisoDias;
  const avisoKm = alerta.avisoKm ?? ajustes.avisoKm;

  const diasRestantes = fechaLimite !== undefined ? diasEntre(hoy, fechaLimite) : undefined;
  const kmRestantes = kmLimite !== undefined ? kmLimite - estimacion.km : undefined;

  // Se traduce todo a días para poder compararlo, y gana el más apretado:
  // «lo que ocurra antes» es literalmente el mínimo de los dos.
  const diasPorTiempo = diasRestantes ?? Number.POSITIVE_INFINITY;
  const diasPorKm =
    kmRestantes === undefined ? Number.POSITIVE_INFINITY : kmADias(kmRestantes, estimacion.kmPorDia);

  const vencido =
    (diasRestantes !== undefined && diasRestantes < 0) ||
    (kmRestantes !== undefined && kmRestantes < 0);
  const proximo =
    (diasRestantes !== undefined && diasRestantes <= avisoDias) ||
    (kmRestantes !== undefined && kmRestantes <= avisoKm);

  return {
    ...base,
    semaforo: vencido ? 'vencido' : proximo ? 'proximo' : 'ok',
    ...(fechaLimite !== undefined ? { fechaLimite } : {}),
    ...(diasRestantes !== undefined ? { diasRestantes } : {}),
    ...(kmLimite !== undefined ? { kmLimite } : {}),
    ...(kmRestantes !== undefined ? { kmRestantes } : {}),
    motivo: diasPorKm < diasPorTiempo ? 'km' : 'tiempo',
    urgencia: Math.min(diasPorTiempo, diasPorKm),
    faltaUltimaVez: false,
  };
}

/**
 * Todos los vencimientos de un vehículo, del más urgente al menos.
 *
 * Un vehículo vendido no devuelve ninguno: está congelado y avisar de su ITV
 * sería recordarte algo que ya no es asunto tuyo.
 */
export function calcularVencimientos(entrada: EntradaVencimientos): Vencimiento[] {
  if (entrada.vehiculo.estado === 'vendido') return [];
  const hoy = entrada.hoy ?? hoyISO();
  return entrada.alertas.map((a) => vencimientoDe(entrada, a, hoy)).sort(compararUrgencia);
}

/**
 * Rango de atención. Va por delante de la urgencia numérica al ordenar.
 *
 * Sin esto, una alerta sin última vez —cuya urgencia es cero— se colaba por
 * delante de un seguro que vence en veinte días. Lo que falta por anotar es
 * información; lo que vence de verdad es una tarea con fecha.
 */
function rango(v: Vencimiento): number {
  if (v.semaforo === 'vencido') return 0;
  if (v.semaforo === 'proximo') return v.faltaUltimaVez ? 2 : 1;
  return 3;
}

export function compararUrgencia(a: Vencimiento, b: Vencimiento): number {
  const diferencia = rango(a) - rango(b);
  return diferencia !== 0 ? diferencia : a.urgencia - b.urgencia;
}

// ---------------------------------------------------------------------------
// Resumen para el panel
// ---------------------------------------------------------------------------

export interface ResumenVencimientos {
  /** El peor semáforo de la lista. Es lo que colorea la tarjeta. */
  peor: Semaforo;
  vencidos: number;
  proximos: number;
  /** Los más urgentes, ya recortados para caber en una tarjeta. */
  destacados: Vencimiento[];
  total: number;
}

export function resumirVencimientos(
  vencimientos: readonly Vencimiento[],
  cuantosDestacar = 3,
): ResumenVencimientos {
  const vencidos = vencimientos.filter((v) => v.semaforo === 'vencido').length;
  const proximos = vencimientos.filter((v) => v.semaforo === 'proximo').length;

  return {
    peor: vencidos > 0 ? 'vencido' : proximos > 0 ? 'proximo' : 'ok',
    vencidos,
    proximos,
    // Solo se destaca lo que reclama atención. Si no hay nada, la tarjeta lo
    // dice con una frase, en vez de listar revisiones a 20.000 km vista.
    destacados: vencimientos.filter((v) => v.semaforo !== 'ok').slice(0, cuantosDestacar),
    total: vencimientos.length,
  };
}

// ---------------------------------------------------------------------------
// Frases
// ---------------------------------------------------------------------------

const ENTERO = new Intl.NumberFormat('es-ES');

function km(valor: number): string {
  return `${ENTERO.format(Math.round(valor))} km`;
}

function describirDias(dias: number): string {
  if (dias === 0) return 'hoy';
  if (dias === 1) return '1 día';
  if (dias < 45) return `${dias} días`;
  const meses = Math.round(dias / 30.44);
  if (meses < 24) return meses === 1 ? '1 mes' : `${meses} meses`;
  return `${Math.round(dias / 365)} años`;
}

/**
 * Frase corta que explica qué falta para que venza, empezando por la
 * dimensión que apremia.
 */
export function describirRestante(v: Vencimiento): string {
  if (v.faltaUltimaVez) return 'Falta la última vez';

  const porKm =
    v.kmRestantes === undefined
      ? null
      : v.kmRestantes < 0
        ? `${km(-v.kmRestantes)} de más`
        : km(v.kmRestantes);
  const porTiempo =
    v.diasRestantes === undefined
      ? null
      : v.diasRestantes < 0
        ? `${describirDias(-v.diasRestantes)} de retraso`
        : describirDias(v.diasRestantes);

  const partes = v.motivo === 'km' ? [porKm, porTiempo] : [porTiempo, porKm];
  return partes.filter((p): p is string => p !== null).join(' · ');
}

/** «Toca el 12/03/2027 o a los 135.000 km». */
export function describirLimite(limites: { fechaLimite?: FechaISO; kmLimite?: number }): string {
  const partes: string[] = [];
  if (limites.fechaLimite) partes.push(`el ${formatearFecha(limites.fechaLimite)}`);
  if (limites.kmLimite !== undefined) partes.push(`a los ${km(limites.kmLimite)}`);
  return partes.length === 0 ? '' : `Toca ${partes.join(' o ')}`;
}

/** «Cada 15.000 km o 12 meses», «Cada año», «Vence el 12/03/2027». */
export function describirRepeticion(
  alerta: Pick<Alerta, 'cadaKm' | 'cadaMeses' | 'venceEl'>,
): string {
  // «Cada año» suena natural; «cada 15.000 km o 1 año» también. Lo que no
  // suena es «cada 1 año» a secas.
  if (alerta.cadaKm === undefined && alerta.cadaMeses === 12) return 'Cada año';
  if (alerta.cadaKm === undefined && alerta.cadaMeses === 1) return 'Cada mes';

  const partes: string[] = [];
  if (alerta.cadaKm !== undefined) partes.push(km(alerta.cadaKm));
  if (alerta.cadaMeses !== undefined) partes.push(describirMeses(alerta.cadaMeses));
  if (partes.length > 0) return `Cada ${partes.join(' o ')}`;
  if (alerta.venceEl) return `Vence el ${formatearFecha(alerta.venceEl)}`;
  return 'Sin repetición';
}

/** «1 mes», «6 meses», «1 año», «2 años». */
export function describirMeses(meses: number): string {
  if (meses % 12 === 0) {
    const anios = meses / 12;
    return anios === 1 ? '1 año' : `${anios} años`;
  }
  return meses === 1 ? '1 mes' : `${meses} meses`;
}
