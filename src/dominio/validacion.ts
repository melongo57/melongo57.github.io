import { diasEntre, esFechaISO, hoyISO } from './fechas.ts';
import type {
  CategoriaVehiculo,
  FechaISO,
  PuntoOdometro,
  TipoCombustible,
  TipoMantenimiento,
} from './tipos.ts';

/**
 * Validación de las entradas del usuario.
 *
 * Se distingue entre `error` (no se puede guardar) y `aviso` (se puede, pero
 * hay que confirmarlo). La diferencia importa: un odómetro que retrocede casi
 * siempre es un dedazo, pero a veces es real —cuadro sustituido, avería del
 * cuentakilómetros— y la app no puede impedirte registrar lo que de verdad
 * marca tu coche. Lo que no puede hacer es tragárselo en silencio.
 */

export type Gravedad = 'error' | 'aviso';

export interface Incidencia {
  /** Campo al que apunta, para poder resaltarlo en el formulario. */
  campo: string;
  gravedad: Gravedad;
  mensaje: string;
}

export interface Validacion {
  incidencias: Incidencia[];
  /** No hay errores: el formulario puede enviarse. */
  valido: boolean;
  /** Hay avisos: antes de guardar, hay que preguntar. */
  requiereConfirmacion: boolean;
}

function resultado(incidencias: Incidencia[]): Validacion {
  return {
    incidencias,
    valido: !incidencias.some((i) => i.gravedad === 'error'),
    requiereConfirmacion: incidencias.some((i) => i.gravedad === 'aviso'),
  };
}

const error = (campo: string, mensaje: string): Incidencia => ({
  campo,
  gravedad: 'error',
  mensaje,
});

const aviso = (campo: string, mensaje: string): Incidencia => ({
  campo,
  gravedad: 'aviso',
  mensaje,
});

const KM = new Intl.NumberFormat('es-ES');

function km(valor: number): string {
  return `${KM.format(Math.round(valor))} km`;
}

function fecha(valor: FechaISO): string {
  const [a, m, d] = valor.split('-');
  return `${d}/${m}/${a}`;
}

// ---------------------------------------------------------------------------
// Lecturas de odómetro
// ---------------------------------------------------------------------------

/** Más de esto en un día es, casi seguro, un cero de más. */
const KM_POR_DIA_IMPROBABLE = 1500;

export interface LecturaAValidar {
  fecha: FechaISO;
  km: number;
}

export interface OpcionesLectura {
  /** Id del registro que se está editando, para no compararlo consigo mismo. */
  excluirRefId?: string;
  hoy?: FechaISO;
}

/**
 * Valida una lectura contra el histórico.
 *
 * Comprueba las dos direcciones, no solo hacia atrás: si registras una lectura
 * con fecha antigua, también tiene que caber por debajo de las posteriores.
 */
export function validarLectura(
  puntos: readonly PuntoOdometro[],
  lectura: LecturaAValidar,
  opciones: OpcionesLectura = {},
): Validacion {
  const { excluirRefId, hoy = hoyISO() } = opciones;
  const incidencias: Incidencia[] = [];

  if (!esFechaISO(lectura.fecha)) {
    incidencias.push(error('fecha', 'La fecha no es válida.'));
    return resultado(incidencias);
  }

  if (!Number.isFinite(lectura.km)) {
    incidencias.push(error('km', 'Escribe los kilómetros que marca el cuentakilómetros.'));
    return resultado(incidencias);
  }
  if (lectura.km < 0) {
    incidencias.push(error('km', 'Los kilómetros no pueden ser negativos.'));
    return resultado(incidencias);
  }
  if (!Number.isInteger(lectura.km)) {
    incidencias.push(error('km', 'Los kilómetros tienen que ser un número entero.'));
    return resultado(incidencias);
  }

  if (lectura.fecha > hoy) {
    incidencias.push(aviso('fecha', 'La fecha es futura. ¿Es correcta?'));
  }

  const relevantes = puntos.filter((p) => p.refId !== excluirRefId);
  const anteriores = relevantes.filter((p) => p.fecha <= lectura.fecha);
  const posteriores = relevantes.filter((p) => p.fecha > lectura.fecha);

  const previa = anteriores[anteriores.length - 1];
  const siguiente = posteriores[0];

  if (previa && lectura.km < previa.km) {
    incidencias.push(
      aviso(
        'km',
        `El registro del ${fecha(previa.fecha)} ya marcaba ${km(previa.km)}. ` +
          `Estás anotando ${km(lectura.km)}, es decir, ${km(previa.km - lectura.km)} menos.`,
      ),
    );
  }

  if (siguiente && lectura.km > siguiente.km) {
    incidencias.push(
      aviso(
        'km',
        `Hay un registro posterior, del ${fecha(siguiente.fecha)}, con ${km(siguiente.km)}. ` +
          'Esta lectura lo dejaría por debajo.',
      ),
    );
  }

  if (previa && lectura.km > previa.km) {
    const dias = Math.max(1, diasEntre(previa.fecha, lectura.fecha));
    const porDia = (lectura.km - previa.km) / dias;
    if (porDia > KM_POR_DIA_IMPROBABLE) {
      incidencias.push(
        aviso(
          'km',
          `Son ${km(lectura.km - previa.km)} en ${dias} ${dias === 1 ? 'día' : 'días'}. ` +
            '¿Te ha sobrado algún cero?',
        ),
      );
    }
  }

  return resultado(incidencias);
}

// ---------------------------------------------------------------------------
// Vehículos
// ---------------------------------------------------------------------------

/**
 * Matrícula española actual (1234 ABC) o antigua (M-1234-AB).
 * Es un aviso y no un error: puede ser un vehículo importado o histórico.
 */
const MATRICULA_ES = /^(\d{4}\s?[BCDFGHJKLMNPRSTVWXYZ]{3}|[A-Z]{1,2}-?\d{4}-?[A-Z]{0,2})$/i;

export interface VehiculoAValidar {
  alias: string;
  categoria: CategoriaVehiculo;
  marca: string;
  modelo: string;
  matricula: string;
  anio: number;
  combustible: TipoCombustible;
  fechaCompra?: FechaISO;
  kmCompra?: number;
  fechaVenta?: FechaISO;
  kmVenta?: number;
  estado: 'activo' | 'vendido';
  bastidor?: string;
}

export function validarVehiculo(
  datos: VehiculoAValidar,
  opciones: { hoy?: FechaISO } = {},
): Validacion {
  const { hoy = hoyISO() } = opciones;
  const incidencias: Incidencia[] = [];
  const anioActual = Number(hoy.slice(0, 4));

  if (!datos.alias.trim()) {
    incidencias.push(error('alias', 'Ponle un nombre para reconocerlo de un vistazo.'));
  }
  if (!datos.marca.trim()) {
    incidencias.push(error('marca', 'Falta la marca.'));
  }
  if (!datos.modelo.trim()) {
    incidencias.push(error('modelo', 'Falta el modelo.'));
  }

  const matricula = datos.matricula.trim();
  if (!matricula) {
    incidencias.push(error('matricula', 'Falta la matrícula.'));
  } else if (!MATRICULA_ES.test(matricula)) {
    incidencias.push(
      aviso('matricula', 'No parece una matrícula española. Si es de importación, adelante.'),
    );
  }

  if (!Number.isInteger(datos.anio) || datos.anio < 1900 || datos.anio > anioActual + 1) {
    incidencias.push(error('anio', `El año tiene que estar entre 1900 y ${anioActual + 1}.`));
  }

  if (datos.kmCompra !== undefined && datos.kmCompra < 0) {
    incidencias.push(error('kmCompra', 'Los kilómetros no pueden ser negativos.'));
  }

  if (datos.fechaCompra) {
    if (!esFechaISO(datos.fechaCompra)) {
      incidencias.push(error('fechaCompra', 'La fecha de compra no es válida.'));
    } else if (datos.fechaCompra > hoy) {
      incidencias.push(aviso('fechaCompra', 'La fecha de compra es futura.'));
    } else if (Number(datos.fechaCompra.slice(0, 4)) < datos.anio) {
      incidencias.push(
        aviso('fechaCompra', 'Lo compraste antes del año del modelo. ¿Es correcto?'),
      );
    }
  }

  // El bastidor son 17 caracteres desde 1981; sin I, O ni Q para no
  // confundirlas con 1 y 0.
  const bastidor = datos.bastidor?.trim();
  if (bastidor && !/^[A-HJ-NPR-Z0-9]{17}$/i.test(bastidor)) {
    incidencias.push(aviso('bastidor', 'Un bastidor tiene 17 caracteres, sin las letras I, O ni Q.'));
  }

  if (datos.estado === 'vendido') {
    if (!datos.fechaVenta) {
      incidencias.push(error('fechaVenta', 'Indica cuándo lo vendiste para congelar el histórico.'));
    } else if (!esFechaISO(datos.fechaVenta)) {
      incidencias.push(error('fechaVenta', 'La fecha de venta no es válida.'));
    } else {
      if (datos.fechaCompra && datos.fechaVenta < datos.fechaCompra) {
        incidencias.push(error('fechaVenta', 'Lo vendiste antes de comprarlo.'));
      }
      if (datos.fechaVenta > hoy) {
        incidencias.push(aviso('fechaVenta', 'La fecha de venta es futura.'));
      }
    }

    if (datos.kmVenta !== undefined) {
      if (datos.kmVenta < 0) {
        incidencias.push(error('kmVenta', 'Los kilómetros no pueden ser negativos.'));
      } else if (datos.kmCompra !== undefined && datos.kmVenta < datos.kmCompra) {
        incidencias.push(
          aviso('kmVenta', 'Lo vendiste con menos kilómetros de los que tenía al comprarlo.'),
        );
      }
    }
  }

  return resultado(incidencias);
}

/** Incidencias de un campo concreto, para pintarlas junto al input. */
export function incidenciasDe(validacion: Validacion, campo: string): Incidencia[] {
  return validacion.incidencias.filter((i) => i.campo === campo);
}

// ---------------------------------------------------------------------------
// Mantenimientos
// ---------------------------------------------------------------------------

export interface MantenimientoAValidar {
  fecha: FechaISO;
  km?: number;
  costeCentimos: number;
  tipo: TipoMantenimiento;
  tipoPersonalizado?: string;
}

/**
 * Valida un mantenimiento.
 *
 * Los kilómetros son opcionales —a veces solo recuerdas la fecha de la
 * factura— pero si se indican tienen que encajar en el histórico, porque de
 * ellos depende cuándo vuelve a tocar.
 */
export function validarMantenimiento(
  puntos: readonly PuntoOdometro[],
  datos: MantenimientoAValidar,
  opciones: OpcionesLectura = {},
): Validacion {
  const { hoy = hoyISO() } = opciones;
  const incidencias: Incidencia[] = [];

  if (!esFechaISO(datos.fecha)) {
    incidencias.push(error('fecha', 'La fecha no es válida.'));
  } else if (datos.fecha > hoy) {
    incidencias.push(aviso('fecha', 'La fecha es futura. ¿Es correcta?'));
  }

  if (datos.tipo === 'otro' && !datos.tipoPersonalizado?.trim()) {
    incidencias.push(
      error('tipoPersonalizado', 'Ponle nombre para poder darle su propia recurrencia.'),
    );
  }

  if (!Number.isFinite(datos.costeCentimos) || datos.costeCentimos < 0) {
    incidencias.push(error('coste', 'El coste no puede ser negativo.'));
  }

  if (datos.km !== undefined) {
    // Se reutiliza la validación de lectura: un mantenimiento con kilómetros
    // es, a efectos del odómetro, exactamente eso.
    const deLectura = validarLectura(puntos, { fecha: datos.fecha, km: datos.km }, opciones);
    incidencias.push(...deLectura.incidencias.filter((i) => i.campo === 'km'));
  }

  return resultado(incidencias);
}

// ---------------------------------------------------------------------------
// Reglas de recurrencia
// ---------------------------------------------------------------------------

export interface ReglaAValidar {
  cadaKm?: number;
  cadaMeses?: number;
  avisoKm?: number;
  avisoDias?: number;
}

export function validarRegla(datos: ReglaAValidar): Validacion {
  const incidencias: Incidencia[] = [];

  if (datos.cadaKm === undefined && datos.cadaMeses === undefined) {
    // Una regla que no puede vencer por nada es peor que no tenerla: da
    // sensación de estar cubierto sin avisar jamás.
    incidencias.push(
      error('cadaKm', 'Indica cada cuántos kilómetros, cada cuántos meses, o las dos cosas.'),
    );
  }

  if (datos.cadaKm !== undefined && datos.cadaKm <= 0) {
    incidencias.push(error('cadaKm', 'El intervalo tiene que ser mayor que cero.'));
  }
  if (datos.cadaMeses !== undefined && datos.cadaMeses <= 0) {
    incidencias.push(error('cadaMeses', 'El intervalo tiene que ser mayor que cero.'));
  }

  if (datos.avisoKm !== undefined && datos.cadaKm !== undefined && datos.avisoKm >= datos.cadaKm) {
    incidencias.push(
      aviso('avisoKm', 'Avisarías desde el día siguiente al último cambio. ¿Es lo que quieres?'),
    );
  }

  return resultado(incidencias);
}
