import { TIPOS_DOCUMENTO, nombreMantenimiento } from './catalogos.ts';
import { diasEntre, hoyISO, sumarMeses } from './fechas.ts';
import type { EstimacionKm } from './odometro.ts';
import type {
  Ajustes,
  Documento,
  FechaISO,
  Id,
  Mantenimiento,
  ReglaMantenimiento,
  TipoDocumento,
  TipoMantenimiento,
  Vehiculo,
} from './tipos.ts';

/**
 * Motor de vencimientos.
 *
 * Responde a una sola pregunta: qué le toca a este vehículo, cuándo, y cuánta
 * prisa corre. Junta dos cosas que se miden en unidades distintas —los
 * mantenimientos vencen por kilómetros o por tiempo, y los documentos solo por
 * tiempo— y las ordena en una única lista.
 *
 * LA IDEA CENTRAL: para comparar «faltan 800 km» con «faltan 20 días» hay que
 * traducir los kilómetros a días usando el ritmo de uso del vehículo. A
 * 40 km/día, 800 km son 20 días y las dos avisos empatan; a 5 km/día son 160
 * días y el plazo manda con diferencia. Sin esa conversión, ordenar por
 * urgencia sería comparar peras con manzanas.
 */

export type Semaforo = 'ok' | 'proximo' | 'vencido';

/** Qué dimensión vence antes. */
export type Motivo = 'km' | 'tiempo';

export type OrigenVencimiento =
  | {
      clase: 'mantenimiento';
      reglaId: Id;
      tipo: TipoMantenimiento;
      tipoPersonalizado?: string;
      /** Aún no se ha registrado nunca: el cálculo parte de la compra. */
      sinRegistroPrevio: boolean;
    }
  | {
      clase: 'documento';
      documentoId: Id;
      tipo: TipoDocumento;
    };

export interface Vencimiento {
  /** Clave estable para React y para no duplicar avisos. */
  id: string;
  vehiculoId: Id;
  titulo: string;
  origen: OrigenVencimiento;
  semaforo: Semaforo;

  /** Cuándo vence por tiempo, si la regla tiene plazo. */
  fechaLimite?: FechaISO;
  /** Días que faltan. Negativo si ya pasó. */
  diasRestantes?: number;

  /** A qué kilómetros vence, si la regla tiene intervalo de km. */
  kmLimite?: number;
  /** Kilómetros que faltan. Negativo si ya se pasaron. */
  kmRestantes?: number;

  motivo: Motivo;
  /**
   * Días equivalentes que quedan, contando las dos dimensiones. Es la clave de
   * ordenación: cuanto menor, más urge. Negativo si está vencido.
   */
  urgencia: number;

  /** Referencia sobre la que se calculó. */
  desdeFecha?: FechaISO;
  desdeKm?: number;
}

/** Días equivalentes a unos kilómetros, según el ritmo de uso. */
function kmADias(km: number, kmPorDia: number): number {
  // Sin ritmo conocido no se puede traducir: un vehículo parado no se acerca
  // al límite por kilómetros por mucho que pase el tiempo.
  if (kmPorDia <= 0) return Number.POSITIVE_INFINITY;
  return km / kmPorDia;
}

/**
 * Clave con la que se agrupa el histórico por tipo de mantenimiento.
 * Los de tipo «otro» se distinguen por su nombre propio: dos recurrencias
 * personalizadas distintas no deben pisarse.
 */
export function claveTipo(tipo: TipoMantenimiento, personalizado?: string): string {
  return tipo === 'otro' ? `otro:${(personalizado ?? '').trim().toLowerCase()}` : tipo;
}

export interface EntradaVencimientos {
  vehiculo: Vehiculo;
  reglas: readonly ReglaMantenimiento[];
  mantenimientos: readonly Mantenimiento[];
  documentos: readonly Documento[];
  estimacion: EstimacionKm;
  ajustes: Pick<Ajustes, 'antelacionMantenimiento' | 'antelacionDocumentoDias'>;
  hoy?: FechaISO;
}

// ---------------------------------------------------------------------------
// Mantenimientos
// ---------------------------------------------------------------------------

/** El mantenimiento más reciente de un tipo, o `null` si nunca se hizo. */
function ultimoDelTipo(
  mantenimientos: readonly Mantenimiento[],
  regla: ReglaMantenimiento,
): Mantenimiento | null {
  const clave = claveTipo(regla.tipo, regla.tipoPersonalizado);
  const delTipo = mantenimientos
    .filter((m) => claveTipo(m.tipo, m.tipoPersonalizado) === clave)
    .sort((a, b) => (a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : 0));
  return delTipo[delTipo.length - 1] ?? null;
}

function vencimientoDeRegla(
  entrada: EntradaVencimientos,
  regla: ReglaMantenimiento,
  hoy: FechaISO,
): Vencimiento | null {
  // Una regla sin ninguno de los dos intervalos no vencería jamás, y sería
  // peor que no tenerla: daría sensación de estar cubierto.
  if (!regla.activa) return null;
  if (regla.cadaKm === undefined && regla.cadaMeses === undefined) return null;

  const { vehiculo, mantenimientos, estimacion, ajustes } = entrada;
  const ultimo = ultimoDelTipo(mantenimientos, regla);

  /*
   * Sin registro previo se parte de la compra. Es lo correcto y además lo
   * útil: un coche recién comprado del que no sabes cuándo le tocó el aceite
   * es exactamente el que más necesita el aviso.
   */
  const desdeFecha = ultimo?.fecha ?? vehiculo.fechaCompra;
  const desdeKm = ultimo?.km ?? vehiculo.kmCompra;

  // Sin ninguna referencia no hay nada que calcular.
  if (desdeFecha === undefined && desdeKm === undefined) return null;

  const porDefecto = ajustes.antelacionMantenimiento[regla.tipo];
  const avisoDias = regla.avisoDias ?? porDefecto?.avisoDias;
  const avisoKm = regla.avisoKm ?? porDefecto?.avisoKm;

  let fechaLimite: FechaISO | undefined;
  let diasRestantes: number | undefined;
  if (regla.cadaMeses !== undefined && desdeFecha !== undefined) {
    fechaLimite = sumarMeses(desdeFecha, regla.cadaMeses);
    diasRestantes = diasEntre(hoy, fechaLimite);
  }

  let kmLimite: number | undefined;
  let kmRestantes: number | undefined;
  if (regla.cadaKm !== undefined && desdeKm !== undefined) {
    kmLimite = desdeKm + regla.cadaKm;
    kmRestantes = kmLimite - estimacion.km;
  }

  if (diasRestantes === undefined && kmRestantes === undefined) return null;

  // Se traduce todo a días para poder compararlo, y gana el más apretado:
  // «lo que ocurra antes» es literalmente el mínimo de los dos.
  const diasPorTiempo = diasRestantes ?? Number.POSITIVE_INFINITY;
  const diasPorKm =
    kmRestantes === undefined ? Number.POSITIVE_INFINITY : kmADias(kmRestantes, estimacion.kmPorDia);

  const motivo: Motivo = diasPorKm < diasPorTiempo ? 'km' : 'tiempo';
  const urgencia = Math.min(diasPorTiempo, diasPorKm);

  const vencido =
    (diasRestantes !== undefined && diasRestantes < 0) ||
    (kmRestantes !== undefined && kmRestantes < 0);

  const proximo =
    (diasRestantes !== undefined && avisoDias !== undefined && diasRestantes <= avisoDias) ||
    (kmRestantes !== undefined && avisoKm !== undefined && kmRestantes <= avisoKm);

  const sinRegistroPrevio = ultimo === null;

  /*
   * Una regla sin registro previo NUNCA se marca como vencida, por mucho que
   * las cuentas desde la compra digan que hace cinco años que tocaba.
   *
   * Y no es un tecnicismo: si compraste el coche en 2019 y nunca anotaste un
   * cambio de aceite, es casi seguro que lo cambiaste y no que lleves 100.000
   * km con el mismo. Lo que la app sabe de verdad es que le falta el dato, y
   * eso es lo que debe decir. Anunciar «cinco años de retraso» en media docena
   * de revisiones a la vez ahoga el aviso que sí es real —la ITV caducada— y
   * enseña al usuario a ignorar el rojo.
   */
  const semaforo: Semaforo = sinRegistroPrevio
    ? vencido || proximo
      ? 'proximo'
      : 'ok'
    : vencido
      ? 'vencido'
      : proximo
        ? 'proximo'
        : 'ok';

  // Sin registro, la urgencia se topa en cero: queda por detrás de todo lo que
  // sí está vencido de verdad, pero por delante de lo que aún no toca.
  const urgenciaFinal = sinRegistroPrevio ? Math.max(0, urgencia) : urgencia;

  return {
    id: `regla:${regla.id}`,
    vehiculoId: vehiculo.id,
    titulo: nombreMantenimiento(regla.tipo, regla.tipoPersonalizado),
    origen: {
      clase: 'mantenimiento',
      reglaId: regla.id,
      tipo: regla.tipo,
      ...(regla.tipoPersonalizado ? { tipoPersonalizado: regla.tipoPersonalizado } : {}),
      sinRegistroPrevio,
    },
    semaforo,
    ...(fechaLimite !== undefined ? { fechaLimite } : {}),
    ...(diasRestantes !== undefined ? { diasRestantes } : {}),
    ...(kmLimite !== undefined ? { kmLimite } : {}),
    ...(kmRestantes !== undefined ? { kmRestantes } : {}),
    motivo,
    urgencia: urgenciaFinal,
    ...(desdeFecha !== undefined ? { desdeFecha } : {}),
    ...(desdeKm !== undefined ? { desdeKm } : {}),
  };
}

// ---------------------------------------------------------------------------
// Documentos
// ---------------------------------------------------------------------------

function vencimientoDeDocumento(
  entrada: EntradaVencimientos,
  documento: Documento,
  hoy: FechaISO,
): Vencimiento | null {
  // Un permiso de circulación no caduca: sin fecha, no hay vencimiento.
  if (!documento.fechaVencimiento) return null;

  const avisoDias =
    documento.avisoDias ?? entrada.ajustes.antelacionDocumentoDias[documento.tipo] ?? 30;
  const diasRestantes = diasEntre(hoy, documento.fechaVencimiento);

  const titulo =
    documento.tipo === 'seguro'
      ? `Seguro · ${documento.compania}`
      : TIPOS_DOCUMENTO[documento.tipo].nombre;

  return {
    id: `doc:${documento.id}`,
    vehiculoId: entrada.vehiculo.id,
    titulo,
    origen: { clase: 'documento', documentoId: documento.id, tipo: documento.tipo },
    semaforo: diasRestantes < 0 ? 'vencido' : diasRestantes <= avisoDias ? 'proximo' : 'ok',
    fechaLimite: documento.fechaVencimiento,
    diasRestantes,
    motivo: 'tiempo',
    urgencia: diasRestantes,
    ...(documento.fechaEmision ? { desdeFecha: documento.fechaEmision } : {}),
  };
}

// ---------------------------------------------------------------------------
// Cálculo completo
// ---------------------------------------------------------------------------

/**
 * Todos los vencimientos de un vehículo, del más urgente al menos.
 *
 * Un vehículo vendido no devuelve ninguno: está congelado y avisar de su ITV
 * sería recordarte algo que ya no es asunto tuyo.
 */
export function calcularVencimientos(entrada: EntradaVencimientos): Vencimiento[] {
  if (entrada.vehiculo.estado === 'vendido') return [];

  const hoy = entrada.hoy ?? hoyISO();

  const deReglas = entrada.reglas
    .map((regla) => vencimientoDeRegla(entrada, regla, hoy))
    .filter((v): v is Vencimiento => v !== null);

  const deDocumentos = entrada.documentos
    .map((documento) => vencimientoDeDocumento(entrada, documento, hoy))
    .filter((v): v is Vencimiento => v !== null);

  return [...deReglas, ...deDocumentos].sort(compararUrgencia);
}

/**
 * Rango de atención. Va por delante de la urgencia numérica al ordenar.
 *
 * Sin esto, un «sin registrar» —cuya urgencia se topa en cero— se colaba por
 * delante de un seguro que vence en veinte días. Lo que falta por anotar es
 * información; lo que vence de verdad es una tarea con fecha.
 */
function rango(v: Vencimiento): number {
  if (v.semaforo === 'vencido') return 0;
  const sinRegistro = v.origen.clase === 'mantenimiento' && v.origen.sinRegistroPrevio;
  if (v.semaforo === 'proximo') return sinRegistro ? 2 : 1;
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

/**
 * Frase corta que explica qué falta para que venza.
 * Devuelve las dos dimensiones cuando las hay, empezando por la que apremia.
 */
export function describirRestante(v: Vencimiento): string {
  // Sin registro previo, las cuentas desde la compra no son creíbles: lo
  // honesto es decir que falta el dato.
  if (v.origen.clase === 'mantenimiento' && v.origen.sinRegistroPrevio) {
    return 'Sin registrar';
  }

  const porKm =
    v.kmRestantes === undefined
      ? null
      : v.kmRestantes < 0
        ? `${formatearEnteroKm(-v.kmRestantes)} km de más`
        : `${formatearEnteroKm(v.kmRestantes)} km`;

  const porTiempo =
    v.diasRestantes === undefined
      ? null
      : v.diasRestantes < 0
        ? `${describirDias(-v.diasRestantes)} de retraso`
        : describirDias(v.diasRestantes);

  const partes = v.motivo === 'km' ? [porKm, porTiempo] : [porTiempo, porKm];
  const limpias = partes.filter((p): p is string => p !== null);
  return limpias.join(' · ');
}

const ENTERO = new Intl.NumberFormat('es-ES');

function formatearEnteroKm(km: number): string {
  return ENTERO.format(Math.round(km));
}

function describirDias(dias: number): string {
  if (dias === 0) return 'hoy';
  if (dias === 1) return '1 día';
  if (dias < 45) return `${dias} días`;
  const meses = Math.round(dias / 30.44);
  if (meses < 24) return meses === 1 ? '1 mes' : `${meses} meses`;
  const anios = Math.round(dias / 365);
  return `${anios} años`;
}
