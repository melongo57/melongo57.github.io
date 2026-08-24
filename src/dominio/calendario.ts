import { CATEGORIAS_GASTO, PERIODICIDADES } from './catalogos.ts';
import { formatearEuros } from './dinero.ts';
import { deFechaISO, diasEntre, hoyISO, sumarMeses } from './fechas.ts';
import type { FechaISO, Gasto, Id, Vehiculo } from './tipos.ts';
import type { Vencimiento } from './vencimientos.ts';

/**
 * Exportación de vencimientos a iCalendar (.ics) y proyección de eventos
 * futuros.
 *
 * POR QUÉ ESTO EXISTE: no hay ninguna API de navegador que sirva para
 * «avísame dentro de 30 días» con la aplicación cerrada. La Notification
 * Triggers API se descartó en Chrome y nunca existió en Safari, y las push de
 * verdad necesitan un servidor que las empuje.
 *
 * Así que el recordatorio fiable no lo da esta app: lo da tu calendario. Aquí
 * se genera el archivo y de ahí en adelante se encarga Google Calendar o
 * Apple Calendario, que sí saben avisar con un mes de antelación aunque no
 * abras nada.
 */

// ---------------------------------------------------------------------------
// Eventos futuros
// ---------------------------------------------------------------------------

export type ClaseEvento = 'mantenimiento' | 'documento' | 'gasto';

export interface EventoCalendario {
  /** Estable entre exportaciones: reimportar actualiza en vez de duplicar. */
  uid: string;
  fecha: FechaISO;
  titulo: string;
  descripcion: string;
  clase: ClaseEvento;
  vehiculoId: Id;
  vehiculoAlias: string;
  /** Días de antelación del recordatorio. */
  avisoDias: number;
  /** Negativo si ya pasó. */
  diasRestantes: number;
}

const AVISO_POR_DEFECTO = 30;

/**
 * Convierte los vencimientos de un vehículo en eventos de calendario.
 *
 * Solo entran los que tienen fecha: un mantenimiento que vence por kilómetros
 * no se puede poner en un calendario, porque nadie sabe qué día llegarás a
 * esos kilómetros. Para esos está el aviso dentro de la app.
 */
export function eventosDeVencimientos(
  vehiculo: Vehiculo,
  vencimientos: readonly Vencimiento[],
  opciones: { hoy?: FechaISO } = {},
): EventoCalendario[] {
  const hoy = opciones.hoy ?? hoyISO();

  return vencimientos
    .filter((v) => v.fechaLimite !== undefined)
    // Lo que no se ha registrado nunca no tiene una fecha creíble que llevar
    // al calendario: llenaría la agenda de citas inventadas.
    .filter((v) => !(v.origen.clase === 'mantenimiento' && v.origen.sinRegistroPrevio))
    .map((v) => ({
      uid: `${v.id}@mi-garaje`,
      fecha: v.fechaLimite!,
      titulo: `${v.titulo} · ${vehiculo.alias}`,
      descripcion: descripcionDe(v, vehiculo),
      clase: v.origen.clase === 'documento' ? ('documento' as const) : ('mantenimiento' as const),
      vehiculoId: vehiculo.id,
      vehiculoAlias: vehiculo.alias,
      avisoDias: AVISO_POR_DEFECTO,
      diasRestantes: diasEntre(hoy, v.fechaLimite!),
    }));
}

function descripcionDe(v: Vencimiento, vehiculo: Vehiculo): string {
  const partes = [`${vehiculo.marca} ${vehiculo.modelo} · ${vehiculo.matricula}`];
  if (v.kmLimite !== undefined) {
    partes.push(`O al llegar a ${new Intl.NumberFormat('es-ES').format(v.kmLimite)} km.`);
  }
  if (v.desdeFecha) {
    const [a, m, d] = v.desdeFecha.split('-');
    partes.push(`Último registro: ${d}/${m}/${a}.`);
  }
  return partes.join('\n');
}

/**
 * Próximo cargo de un gasto recurrente.
 *
 * Avanza desde la última vez que se pagó hasta pasar de hoy: si dejaste de
 * registrar el seguro durante dos años, el siguiente cargo es el que viene, no
 * el de hace veintitrés meses.
 */
export function proximoCargo(gasto: Gasto, hoy: FechaISO = hoyISO()): FechaISO | null {
  if (!gasto.recurrente || !gasto.periodicidad) return null;
  const meses = PERIODICIDADES[gasto.periodicidad].meses;

  let fecha = sumarMeses(gasto.fecha, meses);
  // Tope de seguridad: 200 vueltas cubren 16 años de periodicidad mensual.
  for (let i = 0; fecha <= hoy && i < 200; i += 1) {
    fecha = sumarMeses(fecha, meses);
  }
  return fecha;
}

/** Eventos de los gastos recurrentes de un vehículo. */
export function eventosDeGastos(
  vehiculo: Vehiculo,
  gastos: readonly Gasto[],
  opciones: { hoy?: FechaISO } = {},
): EventoCalendario[] {
  const hoy = opciones.hoy ?? hoyISO();

  /*
   * Solo el más reciente de cada categoría. Si has registrado cinco años de
   * seguro, los cinco predicen el mismo próximo cargo y el calendario acabaría
   * con cinco citas idénticas el mismo día.
   */
  const ultimoPorCategoria = new Map<string, Gasto>();
  for (const g of gastos) {
    if (!g.recurrente || !g.periodicidad) continue;
    const previo = ultimoPorCategoria.get(g.categoria);
    if (!previo || g.fecha > previo.fecha) ultimoPorCategoria.set(g.categoria, g);
  }

  const eventos: EventoCalendario[] = [];
  for (const gasto of ultimoPorCategoria.values()) {
    const fecha = proximoCargo(gasto, hoy);
    if (!fecha) continue;

    eventos.push({
      uid: `gasto-${gasto.categoria}-${vehiculo.id}@mi-garaje`,
      fecha,
      // Sin descripción, el nombre de la categoría. «Pago» no dice nada.
      titulo: `${gasto.descripcion?.trim() || CATEGORIAS_GASTO[gasto.categoria].nombre} · ${vehiculo.alias}`,
      descripcion:
        `Cargo previsto de ${formatearEuros(gasto.importeCentimos)}.\n` +
        `Periodicidad: ${PERIODICIDADES[gasto.periodicidad!].nombre.toLowerCase()}.`,
      clase: 'gasto',
      vehiculoId: vehiculo.id,
      vehiculoAlias: vehiculo.alias,
      avisoDias: 7,
      diasRestantes: diasEntre(hoy, fecha),
    });
  }

  return eventos;
}

/** Ordena por fecha y agrupa por mes, para la línea temporal. */
export interface MesDeEventos {
  /** Clave 'YYYY-MM'. */
  mes: string;
  eventos: EventoCalendario[];
}

export function agruparPorMes(eventos: readonly EventoCalendario[]): MesDeEventos[] {
  const meses = new Map<string, EventoCalendario[]>();
  for (const e of [...eventos].sort((a, b) => (a.fecha < b.fecha ? -1 : 1))) {
    const clave = e.fecha.slice(0, 7);
    const lista = meses.get(clave);
    if (lista) lista.push(e);
    else meses.set(clave, [e]);
  }
  return [...meses.entries()].map(([mes, lista]) => ({ mes, eventos: lista }));
}

// ---------------------------------------------------------------------------
// Generación de iCalendar
// ---------------------------------------------------------------------------

/**
 * Escapa un texto según RFC 5545.
 * La barra invertida va primero: si no, escaparíamos las barras que acabamos
 * de introducir al escapar las comas.
 */
function escapar(texto: string): string {
  return texto
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');
}

/**
 * Pliega una línea a 75 octetos, con un espacio al principio de cada
 * continuación.
 *
 * El límite es en OCTETOS, no en caracteres, y esto importa en español: cada
 * vocal acentuada ocupa dos bytes en UTF-8. Contar caracteres dejaría pasar
 * líneas de hasta 150 bytes, que algunos clientes de calendario rechazan.
 * Además, el corte nunca puede caer dentro de un carácter multibyte.
 */
export function plegarLinea(linea: string): string {
  const bytes = new TextEncoder().encode(linea);
  if (bytes.length <= 75) return linea;

  const trozos: string[] = [];
  const decodificador = new TextDecoder();
  let inicio = 0;
  // La primera línea admite 75 octetos; las continuaciones, 74 más el espacio.
  let limite = 75;

  while (inicio < bytes.length) {
    let fin = Math.min(inicio + limite, bytes.length);
    // Retrocede hasta el principio de un carácter: los bytes de continuación
    // en UTF-8 son 10xxxxxx.
    while (fin > inicio && fin < bytes.length && (bytes[fin]! & 0xc0) === 0x80) fin -= 1;

    trozos.push(decodificador.decode(bytes.slice(inicio, fin)));
    inicio = fin;
    limite = 74;
  }

  return trozos.join('\r\n ');
}

function fechaIcs(fecha: FechaISO): string {
  return fecha.replace(/-/g, '');
}

/** Día siguiente, para el DTEND exclusivo de un evento de día completo. */
function diaSiguiente(fecha: FechaISO): string {
  const d = deFechaISO(fecha);
  d.setDate(d.getDate() + 1);
  const anio = String(d.getFullYear()).padStart(4, '0');
  const mes = String(d.getMonth() + 1).padStart(2, '0');
  const dia = String(d.getDate()).padStart(2, '0');
  return `${anio}${mes}${dia}`;
}

function sello(ahora: Date): string {
  return `${ahora.toISOString().replace(/[-:]/g, '').split('.')[0]}Z`;
}

export interface OpcionesIcs {
  /** Para poder fijar el DTSTAMP en los tests. */
  ahora?: Date;
  nombreCalendario?: string;
}

/**
 * Genera un archivo .ics con un evento de día completo por vencimiento.
 *
 * Cada evento lleva su propio VALARM con la antelación configurada, que es lo
 * que hace que el calendario avise solo. El UID es estable, así que volver a
 * importar el archivo actualiza los eventos en lugar de duplicarlos.
 */
export function generarIcs(
  eventos: readonly EventoCalendario[],
  opciones: OpcionesIcs = {},
): string {
  const { ahora = new Date(), nombreCalendario = 'Mi Garaje' } = opciones;
  const dtstamp = sello(ahora);

  const lineas: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Mi Garaje//Gestión de vehículos//ES',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${escapar(nombreCalendario)}`,
  ];

  for (const evento of eventos) {
    lineas.push(
      'BEGIN:VEVENT',
      `UID:${evento.uid}`,
      `DTSTAMP:${dtstamp}`,
      // Evento de día completo: DTEND es exclusivo, así que va el día
      // siguiente. Sin eso, algunos clientes lo pintan de dos días.
      `DTSTART;VALUE=DATE:${fechaIcs(evento.fecha)}`,
      `DTEND;VALUE=DATE:${diaSiguiente(evento.fecha)}`,
      `SUMMARY:${escapar(evento.titulo)}`,
      `DESCRIPTION:${escapar(evento.descripcion)}`,
      'TRANSP:TRANSPARENT',
      'BEGIN:VALARM',
      `TRIGGER:-P${evento.avisoDias}D`,
      'ACTION:DISPLAY',
      `DESCRIPTION:${escapar(evento.titulo)}`,
      'END:VALARM',
      'END:VEVENT',
    );
  }

  lineas.push('END:VCALENDAR');

  // RFC 5545 exige CRLF. Con LF a secas, Outlook no abre el archivo.
  return `${lineas.map(plegarLinea).join('\r\n')}\r\n`;
}

/** Nombre de archivo sugerido al descargar. */
export function nombreArchivoIcs(hoy: FechaISO = hoyISO()): string {
  return `mi-garaje-vencimientos-${hoy}.ics`;
}
