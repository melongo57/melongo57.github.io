import { plantillaReglas } from '@/dominio/catalogos.ts';
import type {
  Adjunto,
  FechaISO,
  Gasto,
  Id,
  LecturaOdometro,
  Mantenimiento,
  Nuevo,
  ReglaMantenimiento,
  Repostaje,
  TipoMantenimiento,
  Vehiculo,
} from '@/dominio/tipos.ts';
import { prepararAdjunto } from './imagenes.ts';
import { repo } from './repositorioDexie.ts';
import type { Repositorio } from './repositorio.ts';

/**
 * Operaciones de escritura que abarcan más de una tabla.
 *
 * Los componentes llaman aquí y no al repositorio directamente: dar de alta un
 * vehículo no es escribir una fila, es escribir la fila más sus reglas de
 * mantenimiento más su primera lectura de odómetro. Si eso viviera en el
 * formulario, el segundo sitio que cree vehículos (la importación de JSON, en
 * la fase 7) se dejaría la mitad.
 */

/** Crea las reglas de recurrencia que corresponden a la categoría y el combustible. */
export async function crearReglasPorDefecto(
  vehiculo: Vehiculo,
  destino: Repositorio = repo,
): Promise<void> {
  const plantilla = plantillaReglas(vehiculo.categoria, vehiculo.combustible);
  for (const [tipo, regla] of Object.entries(plantilla)) {
    if (!regla) continue;
    await destino.reglas.crear({
      vehiculoId: vehiculo.id,
      tipo: tipo as TipoMantenimiento,
      ...(regla.cadaKm !== undefined ? { cadaKm: regla.cadaKm } : {}),
      ...(regla.cadaMeses !== undefined ? { cadaMeses: regla.cadaMeses } : {}),
      activa: true,
    });
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
}

/**
 * Alta completa de un vehículo: la ficha, sus reglas de mantenimiento y la
 * lectura inicial del odómetro si se han indicado kilómetros de compra.
 */
export async function crearVehiculo({ foto, ...datos }: DatosNuevoVehiculo): Promise<Vehiculo> {
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

  await crearReglasPorDefecto(vehiculo);

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

export async function guardarMantenimiento(datos: DatosMantenimiento): Promise<Mantenimiento> {
  if (datos.id) {
    const { id, ...cambios } = datos;
    return repo.mantenimientos.actualizar(id, cambios);
  }
  return repo.mantenimientos.crear(datos);
}

export function borrarMantenimiento(id: Id): Promise<void> {
  return repo.mantenimientos.borrar(id);
}

// ---------------------------------------------------------------------------
// Reglas de recurrencia
// ---------------------------------------------------------------------------

export function guardarRegla(
  id: Id,
  cambios: Partial<Nuevo<ReglaMantenimiento>>,
): Promise<ReglaMantenimiento> {
  return repo.reglas.actualizar(id, cambios);
}

export function crearRegla(datos: Nuevo<ReglaMantenimiento>): Promise<ReglaMantenimiento> {
  return repo.reglas.crear(datos);
}

export function borrarRegla(id: Id): Promise<void> {
  return repo.reglas.borrar(id);
}

/**
 * Reglas del vehículo, completadas con las que faltan de su plantilla.
 *
 * Un vehículo dado de alta antes de que existiera un tipo de mantenimiento
 * —o al que se le cambia la categoría— se quedaría sin esa regla para
 * siempre. Esto la crea al vuelo la primera vez que se abre el editor.
 */
export async function completarReglas(vehiculo: Vehiculo): Promise<void> {
  const existentes = await repo.reglas.listarPorVehiculo(vehiculo.id);
  const yaTiene = new Set(existentes.filter((r) => r.tipo !== 'otro').map((r) => r.tipo));

  const plantilla = plantillaReglas(vehiculo.categoria, vehiculo.combustible);
  for (const [tipo, regla] of Object.entries(plantilla)) {
    if (!regla || yaTiene.has(tipo as TipoMantenimiento)) continue;
    await repo.reglas.crear({
      vehiculoId: vehiculo.id,
      tipo: tipo as TipoMantenimiento,
      ...(regla.cadaKm !== undefined ? { cadaKm: regla.cadaKm } : {}),
      ...(regla.cadaMeses !== undefined ? { cadaMeses: regla.cadaMeses } : {}),
      activa: true,
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
