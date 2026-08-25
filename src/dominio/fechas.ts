import { addDays, addMonths, differenceInCalendarDays, differenceInCalendarMonths } from 'date-fns';
import type { FechaISO, InstanteISO } from './tipos.ts';

/**
 * Utilidades de fecha civil ('YYYY-MM-DD').
 *
 * OJO con `new Date('2026-03-14')`: el estándar lo interpreta como medianoche
 * UTC, así que en zonas al oeste de Greenwich devuelve el día anterior. Aquí
 * se construyen y se leen siempre las fechas por componentes locales, para que
 * "14 de marzo" sea el 14 de marzo en cualquier dispositivo.
 */

const PATRON_FECHA = /^\d{4}-\d{2}-\d{2}$/;

export function esFechaISO(valor: unknown): valor is FechaISO {
  if (typeof valor !== 'string' || !PATRON_FECHA.test(valor)) return false;
  const fecha = deFechaISO(valor);
  return !Number.isNaN(fecha.getTime()) && aFechaISO(fecha) === valor;
}

/** Date (interpretado en hora local) → 'YYYY-MM-DD'. */
export function aFechaISO(fecha: Date): FechaISO {
  const anio = String(fecha.getFullYear()).padStart(4, '0');
  const mes = String(fecha.getMonth() + 1).padStart(2, '0');
  const dia = String(fecha.getDate()).padStart(2, '0');
  return `${anio}-${mes}-${dia}`;
}

/** 'YYYY-MM-DD' → Date a medianoche local. */
export function deFechaISO(fecha: FechaISO): Date {
  const [anio, mes, dia] = fecha.split('-').map(Number);
  return new Date(anio ?? 1970, (mes ?? 1) - 1, dia ?? 1);
}

export function hoyISO(): FechaISO {
  return aFechaISO(new Date());
}

export function ahoraISO(): InstanteISO {
  return new Date().toISOString();
}

/**
 * Día civil LOCAL en el que cayó un instante (`actualizadoEn`, `ultimaCopiaEn`...).
 *
 * `ahoraISO()` guarda el instante en UTC (termina en «Z»); cortar los diez
 * primeros caracteres da el día en UTC, no el de aquí. En España eso falla
 * justo de madrugada: a la 1:30 de un día en horario de verano (UTC+2) el
 * instante en UTC todavía marca las 23:30 del día anterior, así que una copia
 * hecha "hoy" se enseñaría fechada "ayer".
 */
export function fechaLocalDeInstante(instante: InstanteISO): FechaISO {
  return aFechaISO(new Date(instante));
}

/** Días naturales de `desde` a `hasta`. Negativo si `hasta` ya pasó. */
export function diasEntre(desde: FechaISO, hasta: FechaISO): number {
  return differenceInCalendarDays(deFechaISO(hasta), deFechaISO(desde));
}

/** Meses naturales de `desde` a `hasta`. */
export function mesesEntre(desde: FechaISO, hasta: FechaISO): number {
  return differenceInCalendarMonths(deFechaISO(hasta), deFechaISO(desde));
}

export function sumarDias(fecha: FechaISO, dias: number): FechaISO {
  return aFechaISO(addDays(deFechaISO(fecha), dias));
}

/** Suma meses recortando al último día válido: 31/01 + 1 mes = 28/02. */
export function sumarMeses(fecha: FechaISO, meses: number): FechaISO {
  return aFechaISO(addMonths(deFechaISO(fecha), meses));
}

/** Clave de agrupación mensual, 'YYYY-MM'. */
export function claveMes(fecha: FechaISO): string {
  return fecha.slice(0, 7);
}

export function primerDiaDelMes(fecha: FechaISO): FechaISO {
  return `${claveMes(fecha)}-01`;
}

export function ultimoDiaDelMes(fecha: FechaISO): FechaISO {
  const d = deFechaISO(fecha);
  return aFechaISO(new Date(d.getFullYear(), d.getMonth() + 1, 0));
}

/** Ordena de más antigua a más reciente. Las cadenas ISO ordenan solas. */
export function compararFechas(a: FechaISO, b: FechaISO): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

// ---------------------------------------------------------------------------
// Presentación
// ---------------------------------------------------------------------------

const FORMATO_CORTO = new Intl.DateTimeFormat('es-ES', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
});

const FORMATO_LARGO = new Intl.DateTimeFormat('es-ES', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});

const FORMATO_MES = new Intl.DateTimeFormat('es-ES', { month: 'long', year: 'numeric' });

const FORMATO_FECHA_HORA = new Intl.DateTimeFormat('es-ES', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

/** '14/03/2026' */
export function formatearFecha(fecha: FechaISO): string {
  return FORMATO_CORTO.format(deFechaISO(fecha));
}

/** '14 de marzo de 2026' */
export function formatearFechaLarga(fecha: FechaISO): string {
  return FORMATO_LARGO.format(deFechaISO(fecha));
}

/**
 * '25/08/2026 · 20:30', en la hora LOCAL del dispositivo, a partir de un
 * instante completo (`InstanteISO`, con hora y zona) — no de una fecha civil.
 *
 * `Intl.DateTimeFormat` ya hace la conversión de UTC a local por su cuenta;
 * el bug de `EstadoDatos`/`Sincronizacion` no era de conversión sino de
 * cortar el texto del ISO a mano (`slice(0, 10)`, `slice(11, 16)`), que
 * coge los componentes en UTC tal cual, sin convertir nada.
 */
export function formatearFechaHora(instante: InstanteISO): string {
  return FORMATO_FECHA_HORA.format(new Date(instante)).replace(', ', ' · ');
}

/** 'marzo de 2026' a partir de una clave 'YYYY-MM'. */
export function formatearMes(clave: string): string {
  return FORMATO_MES.format(deFechaISO(`${clave}-01`));
}

/**
 * Distancia en lenguaje natural: 'hoy', 'mañana', 'en 12 días',
 * 'hace 3 meses'. Se usa en las tarjetas de vencimiento, donde importa más
 * la magnitud que la fecha exacta.
 */
export function formatearDistancia(dias: number): string {
  if (dias === 0) return 'hoy';
  if (dias === 1) return 'mañana';
  if (dias === -1) return 'ayer';

  const futuro = dias > 0;
  const abs = Math.abs(dias);

  let cantidad: string;
  if (abs < 31) {
    cantidad = `${abs} días`;
  } else if (abs < 365) {
    const meses = Math.round(abs / 30.44);
    cantidad = meses === 1 ? '1 mes' : `${meses} meses`;
  } else {
    const anios = Math.floor(abs / 365);
    const restoMeses = Math.round((abs % 365) / 30.44);
    const partes = [anios === 1 ? '1 año' : `${anios} años`];
    if (restoMeses > 0) partes.push(restoMeses === 1 ? '1 mes' : `${restoMeses} meses`);
    cantidad = partes.join(' y ');
  }

  return futuro ? `en ${cantidad}` : `hace ${cantidad}`;
}
