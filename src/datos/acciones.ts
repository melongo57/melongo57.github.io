import { sugerenciasAlerta, type SugerenciaAlerta } from '@/dominio/catalogos.ts';
import type {
  Adjunto,
  Alerta,
  Cambios,
  Documento,
  FechaISO,
  Gasto,
  Id,
  LecturaOdometro,
  Mantenimiento,
  Nuevo,
  Repostaje,
  Vehiculo,
} from '@/dominio/tipos.ts';
import { prepararAdjunto } from './imagenes.ts';
import { repo } from './repositorioDexie.ts';
import type { Repositorio } from './repositorio.ts';

/**
 * Operaciones de escritura que abarcan más de una tabla.
 *
 * Los componentes llaman aquí y no al repositorio directamente: dar de alta un
 * vehículo no es escribir una fila, es escribir la fila más sus alertas de
 * mantenimiento más su primera lectura de odómetro. Si eso viviera en el
 * formulario, el segundo sitio que cree vehículos (la importación de JSON, en
 * la fase 7) se dejaría la mitad.
 */

/** Datos de una alerta nueva a partir de una sugerencia del catálogo. */
export function alertaDesdeSugerencia(
  vehiculoId: Id,
  sugerencia: SugerenciaAlerta,
): Nuevo<Alerta> {
  return {
    vehiculoId,
    nombre: sugerencia.nombre,
    icono: sugerencia.icono,
    apunte: sugerencia.apunte,
    ...(sugerencia.cadaKm !== undefined ? { cadaKm: sugerencia.cadaKm } : {}),
    ...(sugerencia.cadaMeses !== undefined ? { cadaMeses: sugerencia.cadaMeses } : {}),
    ...(sugerencia.avisoKm !== undefined ? { avisoKm: sugerencia.avisoKm } : {}),
    ...(sugerencia.avisoDias !== undefined ? { avisoDias: sugerencia.avisoDias } : {}),
  };
}

/**
 * Crea las alertas elegidas de entre las sugerencias del vehículo.
 *
 * Sin `claves`, las básicas. Se crean UNA vez, al dar de alta: a partir de ahí
 * son del usuario. La versión anterior las regeneraba cada vez que se abría
 * el editor, así que borrar una que sobraba no servía de nada.
 */
export async function crearAlertasSugeridas(
  vehiculo: Vehiculo,
  claves?: readonly string[],
  destino: Repositorio = repo,
): Promise<void> {
  const sugerencias = sugerenciasAlerta(vehiculo.categoria, vehiculo.combustible);
  const elegidas = claves
    ? sugerencias.filter((s) => claves.includes(s.clave))
    : sugerencias.filter((s) => s.basica);
  for (const sugerencia of elegidas) {
    await destino.alertas.crear(alertaDesdeSugerencia(vehiculo.id, sugerencia));
  }
}

/** Guarda un archivo como adjunto, recomprimiéndolo si es una imagen. */
export async function guardarAdjunto(archivo: File): Promise<Adjunto> {
  const datos: Nuevo<Adjunto> = await prepararAdjunto(archivo);
  return repo.adjuntos.crear(datos);
}

export interface DatosNuevoVehiculo extends Nuevo<Vehiculo> {
  /** Archivo elegido en el formulario. Se comprime y se guarda aparte. */
  foto?: File | null;
  /** Claves de las sugerencias de alerta elegidas. Sin ellas, las básicas. */
  alertas?: readonly string[];
}

/**
 * Alta completa de un vehículo: la ficha, sus alertas de partida y la lectura
 * inicial del odómetro si se han indicado kilómetros de compra.
 */
export async function crearVehiculo({
  foto,
  alertas,
  ...datos
}: DatosNuevoVehiculo): Promise<Vehiculo> {
  const orden = datos.orden ?? (await repo.vehiculos.contar());

  let fotoAdjuntoId: Id | undefined;
  if (foto) {
    fotoAdjuntoId = (await guardarAdjunto(foto)).id;
  }

  const vehiculo = await repo.vehiculos.crear({
    ...datos,
    orden,
    ...(fotoAdjuntoId ? { fotoAdjuntoId } : {}),
  });

  await crearAlertasSugeridas(vehiculo, alertas);

  // Sin esta lectura el vehículo nace sin histórico y el estimador no tiene de
  // dónde partir. Es el punto cero de todo lo demás.
  if (datos.kmCompra !== undefined && datos.fechaCompra) {
    await repo.lecturas.crear({
      vehiculoId: vehiculo.id,
      fecha: datos.fechaCompra,
      km: datos.kmCompra,
      origen: 'alta_vehiculo',
      notas: 'Kilómetros en el momento de la compra.',
    });
  }

  return vehiculo;
}

export interface CambiosVehiculo extends Partial<Nuevo<Vehiculo>> {
  foto?: File | null;
  /** `true` para borrar la foto actual sin poner otra. */
  quitarFoto?: boolean;
}

export async function actualizarVehiculo(
  id: Id,
  { foto, quitarFoto, ...cambios }: CambiosVehiculo,
): Promise<Vehiculo> {
  const actual = await repo.vehiculos.obtener(id);
  if (!actual) throw new Error(`No existe el vehículo ${id}`);

  const parche: Partial<Nuevo<Vehiculo>> = { ...cambios };

  if (foto) {
    parche.fotoAdjuntoId = (await guardarAdjunto(foto)).id;
  } else if (quitarFoto) {
    parche.fotoAdjuntoId = undefined;
  }

  // La foto anterior se borra solo después de que la nueva esté guardada: si
  // la compresión falla, es preferible quedarse con la vieja que sin ninguna.
  const fotoVieja = actual.fotoAdjuntoId;
  const cambiaFoto = Boolean(foto) || Boolean(quitarFoto);

  const actualizado = await repo.vehiculos.actualizar(id, parche);

  if (cambiaFoto && fotoVieja && fotoVieja !== actualizado.fotoAdjuntoId) {
    await repo.adjuntos.borrar(fotoVieja);
  }

  // Marcar como vendido congela el vehículo: se deja constancia en el
  // odómetro para que el histórico termine donde terminó de verdad.
  if (
    cambios.estado === 'vendido' &&
    actual.estado !== 'vendido' &&
    cambios.fechaVenta &&
    cambios.kmVenta !== undefined
  ) {
    await repo.lecturas.crear({
      vehiculoId: id,
      fecha: cambios.fechaVenta,
      km: cambios.kmVenta,
      origen: 'venta',
      notas: 'Kilómetros en el momento de la venta.',
    });
  }

  return actualizado;
}

export interface NuevaLectura {
  vehiculoId: Id;
  fecha: FechaISO;
  km: number;
  notas?: string;
}

export function registrarLectura(lectura: NuevaLectura): Promise<LecturaOdometro> {
  return repo.lecturas.crear({
    vehiculoId: lectura.vehiculoId,
    fecha: lectura.fecha,
    km: lectura.km,
    origen: 'manual',
    ...(lectura.notas?.trim() ? { notas: lectura.notas.trim() } : {}),
  });
}

export function borrarLectura(id: Id): Promise<void> {
  return repo.lecturas.borrar(id);
}

// ---------------------------------------------------------------------------
// Mantenimientos
// ---------------------------------------------------------------------------

export interface DatosMantenimiento extends Nuevo<Mantenimiento> {
  id?: Id;
}

/**
 * Pone una alerta a cero a partir de un servicio hecho, si ese servicio es
 * más reciente que su última vez.
 *
 * Lo de «más reciente» importa: registrar hoy una factura vieja de 2023 no
 * puede hacer que el aceite cambiado la semana pasada parezca de hace dos
 * años.
 */
async function reiniciarAlerta(alertaId: Id, fecha: FechaISO, km?: number): Promise<void> {
  const alerta = await repo.alertas.obtener(alertaId);
  if (!alerta) return;
  if (alerta.ultimaFecha && alerta.ultimaFecha > fecha) return;
  await repo.alertas.actualizar(alertaId, {
    ultimaFecha: fecha,
    ultimoKm: km,
    // La fecha fija era la del ciclo que se acaba de cerrar.
    venceEl: undefined,
  });
}

/**
 * Guarda un servicio y reinicia las alertas que cubre.
 *
 * Borrarlo o editarlo NO deshace ese reinicio: la «última vez» es un dato de
 * la alerta que el usuario puede corregir a mano, y adivinar a qué valor
 * volver (¿al servicio anterior? ¿a lo que había escrito antes?) daría más
 * sorpresas de las que ahorra.
 */
export async function guardarMantenimiento(datos: DatosMantenimiento): Promise<Mantenimiento> {
  const { id, ...resto } = datos;
  const guardado = id
    ? await repo.mantenimientos.actualizar(id, resto)
    : await repo.mantenimientos.crear(resto);

  for (const alertaId of guardado.alertaIds) {
    await reiniciarAlerta(alertaId, guardado.fecha, guardado.km);
  }
  return guardado;
}

export function borrarMantenimiento(id: Id): Promise<void> {
  return repo.mantenimientos.borrar(id);
}

// ---------------------------------------------------------------------------
// Alertas
// ---------------------------------------------------------------------------

export function crearAlerta(datos: Nuevo<Alerta>): Promise<Alerta> {
  return repo.alertas.crear(datos);
}

export function guardarAlerta(id: Id, cambios: Cambios<Alerta>): Promise<Alerta> {
  return repo.alertas.actualizar(id, cambios);
}

export function borrarAlerta(id: Id): Promise<void> {
  return repo.alertas.borrar(id);
}

export interface DatosHecha {
  fecha: FechaISO;
  km?: number;
  costeCentimos: number;
  taller?: string;
  notas?: string;
}

/**
 * Marca una alerta como hecha: el gesto más frecuente de la app, así que es
 * una sola llamada.
 *
 * Reinicia la alerta y deja constancia en el histórico. Si es una alerta de
 * mantenimiento, siempre como servicio —aunque no haya coste, la entrada
 * sirve de registro de que se hizo—. Si es un papel (seguro, ITV, impuesto)
 * el coste va a gastos con su categoría, y solo si lo hay: una ITV pasada sin
 * anotar lo que costó no necesita una fila de 0 €.
 */
export async function marcarHecha(alerta: Alerta, datos: DatosHecha): Promise<void> {
  if (alerta.apunte === 'mantenimiento') {
    await guardarMantenimiento({
      vehiculoId: alerta.vehiculoId,
      titulo: alerta.nombre,
      alertaIds: [alerta.id],
      fecha: datos.fecha,
      ...(datos.km !== undefined ? { km: datos.km } : {}),
      ...(datos.taller?.trim() ? { taller: datos.taller.trim() } : {}),
      costeCentimos: datos.costeCentimos,
      ...(datos.notas?.trim() ? { notas: datos.notas.trim() } : {}),
      adjuntoIds: [],
    });
    return;
  }

  await reiniciarAlerta(alerta.id, datos.fecha, datos.km);
  if (datos.costeCentimos > 0) {
    await repo.gastos.crear({
      vehiculoId: alerta.vehiculoId,
      categoria: alerta.apunte,
      descripcion: alerta.nombre,
      importeCentimos: datos.costeCentimos,
      fecha: datos.fecha,
      recurrente: false,
      ...(datos.km !== undefined ? { km: datos.km } : {}),
      ...(datos.notas?.trim() ? { notas: datos.notas.trim() } : {}),
      adjuntoIds: [],
    });
  }
}

// ---------------------------------------------------------------------------
// Repostajes y gastos
// ---------------------------------------------------------------------------

export interface DatosRepostaje extends Nuevo<Repostaje> {
  id?: Id;
}

export async function guardarRepostaje(datos: DatosRepostaje): Promise<Repostaje> {
  if (datos.id) {
    const { id, ...cambios } = datos;
    return repo.repostajes.actualizar(id, cambios);
  }
  return repo.repostajes.crear(datos);
}

export function borrarRepostaje(id: Id): Promise<void> {
  return repo.repostajes.borrar(id);
}

export interface DatosGasto extends Nuevo<Gasto> {
  id?: Id;
}

export async function guardarGasto(datos: DatosGasto): Promise<Gasto> {
  if (datos.id) {
    const { id, ...cambios } = datos;
    return repo.gastos.actualizar(id, cambios);
  }
  return repo.gastos.crear(datos);
}

export function borrarGasto(id: Id): Promise<void> {
  return repo.gastos.borrar(id);
}

/**
 * Estaciones que el usuario ya ha usado, de la más frecuente a la menos.
 * Alimenta los atajos del formulario de repostaje.
 */
export async function estacionesFrecuentes(vehiculoId: Id, cuantas = 4): Promise<string[]> {
  const repostajes = await repo.repostajes.listarPorVehiculo(vehiculoId);
  const cuenta = new Map<string, number>();
  for (const r of repostajes) {
    const nombre = r.estacion?.trim();
    if (nombre) cuenta.set(nombre, (cuenta.get(nombre) ?? 0) + 1);
  }
  return [...cuenta.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, cuantas)
    .map(([nombre]) => nombre);
}

// ---------------------------------------------------------------------------
// Documentos
// ---------------------------------------------------------------------------

export type DatosDocumento = Nuevo<Documento> & { id?: Id };

export async function guardarDocumento(datos: DatosDocumento): Promise<Documento> {
  if (datos.id) {
    const { id, ...cambios } = datos;
    return repo.documentos.actualizar(id, cambios as Cambios<Documento>);
  }
  return repo.documentos.crear(datos);
}

/**
 * Borra un documento y, con él, sus adjuntos.
 * Si no, las fotos del seguro viejo se quedan ocupando cuota para siempre.
 */
export async function borrarDocumento(id: Id): Promise<void> {
  const documento = await repo.documentos.obtener(id);
  await repo.documentos.borrar(id);
  if (documento?.adjuntoIds.length) {
    await Promise.all(documento.adjuntoIds.map((a) => repo.adjuntos.borrar(a)));
  }
}
