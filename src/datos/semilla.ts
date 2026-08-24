import { aCentimos } from '@/dominio/dinero.ts';
import { hoyISO, sumarDias, sumarMeses } from '@/dominio/fechas.ts';
import { kmEnFecha, type HitoOdometro } from '@/dominio/odometro.ts';
import type {
  Centimos,
  FechaISO,
  Id,
  Nuevo,
  Repostaje,
  UnidadEnergia,
} from '@/dominio/tipos.ts';
import { crearReglasPorDefecto } from './acciones.ts';
import type { Repositorio } from './repositorio.ts';

/**
 * Datos de ejemplo.
 *
 * No son de adorno: cada vehículo existe para ejercitar un camino distinto del
 * código, y todo se calcula a partir de HOY para que el panel principal
 * siempre tenga algo en verde, algo en ámbar y algo en rojo.
 *
 *  - El Golf   → diésel con año y pico de historial denso. Incluye un
 *                repostaje parcial, una ruptura de serie y una subida
 *                sostenida de consumo al final (para que el detector de
 *                anomalías de la fase 6 tenga algo real que encontrar).
 *  - La Zoe    → eléctrico: carga en kWh, sin aceite ni distribución.
 *  - La Autocaravana → pocos kilómetros al año, así que sus mantenimientos
 *                vencen por tiempo y no por uso. Tiene el sellado del techo
 *                caducado, que es el aviso que más caro sale ignorar.
 *  - El Ibiza  → vendido: histórico congelado, sin avisos, pero cuenta en las
 *                analíticas de años anteriores.
 *
 * Los kilómetros de mantenimientos y lecturas NO se escriben a mano: se
 * interpolan sobre la serie de repostajes. Escribirlos a mano parece más
 * simple hasta que las fechas se mueven con el calendario y el odómetro
 * empieza a ir hacia atrás.
 */

// ---------------------------------------------------------------------------
// Aleatoriedad reproducible
// ---------------------------------------------------------------------------

/** Congruencial lineal. Misma semilla, mismos datos: los tests dependen de ello. */
function generador(semilla: number): () => number {
  let estado = semilla >>> 0;
  return () => {
    estado = (estado * 1664525 + 1013904223) >>> 0;
    return estado / 0x100000000;
  };
}

function entre(azar: () => number, min: number, max: number): number {
  return min + azar() * (max - min);
}

function redondear(valor: number, decimales: number): number {
  const factor = 10 ** decimales;
  return Math.round(valor * factor) / factor;
}

// ---------------------------------------------------------------------------
// Generación de repostajes
// ---------------------------------------------------------------------------

interface PlanRepostajes {
  vehiculoId: Id;
  unidad: UnidadEnergia;
  cantidad: number;
  /** Fecha del repostaje MÁS RECIENTE. La serie se genera hacia atrás. */
  fechaFin: FechaISO;
  /** Odómetro en el repostaje más reciente. */
  kmFin: number;
  /** Kilómetros entre repostajes. */
  kmPorTramo: number;
  /** Consumo base por 100 km. */
  consumoBase: number;
  /** Incremento de consumo acumulado al final de la serie (fracción). */
  derivaConsumo: number;
  precioMin: number;
  precioMax: number;
  estaciones: readonly string[];
  /**
   * Días entre repostajes. Es lo que separa un coche de diario de una
   * autocaravana: la misma cantidad de repostajes repartida en meses o en
   * años cambia por completo el ritmo de uso que calcula el estimador.
   */
  diasEntreMin: number;
  diasEntreMax: number;
  semilla: number;
}

/**
 * La serie se construye del presente hacia el pasado. Generarla hacia delante
 * obligaría a adivinar la fecha de inicio para que el último repostaje cayera
 * cerca de hoy, y con los saltos aleatorios nunca cuadra.
 */
function generarRepostajes(plan: PlanRepostajes): Nuevo<Repostaje>[] {
  const azar = generador(plan.semilla);

  /** Datos crudos de cada repostaje antes de repartir el combustible. */
  interface Borrador {
    fecha: FechaISO;
    km: number;
    /** Combustible que de verdad se ha quemado en su tramo. */
    teorica: number;
    parcial: boolean;
    ruptura: boolean;
    precio: number;
    estacion: string;
  }

  const borradores: Borrador[] = [];
  let fecha = plan.fechaFin;
  let km = plan.kmFin;

  for (let i = 0; i < plan.cantidad; i += 1) {
    // 1 en el repostaje más reciente, 0 en el más antiguo.
    const progreso = 1 - i / Math.max(1, plan.cantidad - 1);
    // La deriva de consumo solo afecta al último tercio de la serie.
    const deriva = progreso > 0.66 ? plan.derivaConsumo * ((progreso - 0.66) / 0.34) : 0;
    const consumo = plan.consumoBase * (1 + deriva) * entre(azar, 0.94, 1.06);

    // Kilómetros recorridos desde el repostaje anterior.
    const avance = Math.round(plan.kmPorTramo * entre(azar, 0.82, 1.18));

    borradores.push({
      fecha,
      km,
      teorica: (avance * consumo) / 100,
      parcial: i > 0 && i % 9 === 4,
      ruptura: i === Math.floor(plan.cantidad * 0.5),
      precio: redondear(entre(azar, plan.precioMin, plan.precioMax), 3),
      estacion: plan.estaciones[Math.floor(azar() * plan.estaciones.length)] ?? '',
    });

    km -= avance;
    fecha = sumarDias(fecha, -Math.round(entre(azar, plan.diasEntreMin, plan.diasEntreMax)));
  }

  borradores.reverse();

  /*
   * Reparto del combustible, ya en orden cronológico.
   *
   * Un repostaje parcial mete menos de lo consumido, así que el depósito
   * queda por debajo del lleno: esa diferencia la tiene que meter el
   * siguiente. Sin arrastrar esa deuda, la serie es físicamente imposible
   * —el coche habría recorrido kilómetros con combustible que nunca entró en
   * el depósito— y el cálculo de consumo, que es correcto, devuelve cifras
   * absurdamente bajas en los tramos que contienen un parcial.
   */
  let deuda = 0;

  return borradores.map((b) => {
    let cantidad: number;
    if (b.parcial) {
      const puesto = b.teorica * entre(azar, 0.45, 0.65);
      deuda += b.teorica - puesto;
      cantidad = puesto;
    } else {
      cantidad = b.teorica + deuda;
      deuda = 0;
    }
    cantidad = redondear(cantidad, 2);

    return {
      vehiculoId: plan.vehiculoId,
      fecha: b.fecha,
      cantidad,
      unidad: plan.unidad,
      importeCentimos: aCentimos(cantidad * b.precio),
      km: b.km,
      depositoLleno: !b.parcial,
      rupturaSerie: b.ruptura,
      estacion: b.estacion,
      adjuntoIds: [],
    };
  });
}

/**
 * Serie para interpolar, anclada en la compra del vehículo.
 *
 * Sin el ancla, cualquier fecha anterior al primer repostaje se extrapolaba
 * hacia atrás con el ritmo reciente y acababa recortada a cero: un
 * mantenimiento de hace cuatro años quedaba registrado con 0 km.
 */
function hitos(
  repostajes: readonly Nuevo<Repostaje>[],
  compra?: HitoOdometro,
): HitoOdometro[] {
  const serie = repostajes.map((r) => ({ fecha: r.fecha, km: r.km ?? 0 }));
  return compra ? [compra, ...serie] : serie;
}

/** El interpolador del dominio devuelve null sin datos; aquí siempre los hay. */
function enFecha(serie: readonly HitoOdometro[], fecha: FechaISO): number {
  return kmEnFecha(serie, fecha) ?? 0;
}

// ---------------------------------------------------------------------------
// Semilla principal
// ---------------------------------------------------------------------------

const euros = (valor: number): Centimos => aCentimos(valor);

export async function cargarDatosEjemplo(repo: Repositorio): Promise<void> {
  const hoy = hoyISO();

  // =========================================================================
  // 1. El Golf — diésel, uso diario, historial denso
  // =========================================================================
  const golf = await repo.vehiculos.crear({
    alias: 'El Golf',
    categoria: 'turismo',
    marca: 'Volkswagen',
    modelo: 'Golf',
    version: '2.0 TDI 150 CV Advance',
    matricula: '4821 KRT',
    anio: 2018,
    combustible: 'diesel',
    fechaCompra: '2019-04-12',
    kmCompra: 18400,
    precioCompraCentimos: euros(17900),
    bastidor: 'WVWZZZAUZKW123456',
    notas: 'Segunda mano con un año. Distribución por correa, aún sin cambiar.',
    estado: 'activo',
    orden: 0,
  });
  await crearReglasPorDefecto(golf, repo);

  await repo.lecturas.crear({
    vehiculoId: golf.id,
    fecha: '2019-04-12',
    km: 18400,
    origen: 'alta_vehiculo',
    notas: 'Kilómetros de compra.',
  });

  const repostajesGolf = generarRepostajes({
    vehiculoId: golf.id,
    unidad: 'l',
    cantidad: 34,
    fechaFin: sumarDias(hoy, -9),
    kmFin: 125120,
    kmPorTramo: 720,
    consumoBase: 5.6,
    // +11 % al final: un inyector sucio o unas ruedas mal infladas se ven así.
    derivaConsumo: 0.11,
    precioMin: 1.412,
    precioMax: 1.689,
    estaciones: ['Repsol A-6', 'Cepsa Villalba', 'BP Las Rozas', 'Carrefour Majadahonda'],
    // Un depósito cada dos o tres semanas: uso diario de trayecto corto.
    diasEntreMin: 14,
    diasEntreMax: 24,
    semilla: 20260824,
  });
  for (const r of repostajesGolf) await repo.repostajes.crear(r);

  const kmGolf = hitos(repostajesGolf, { fecha: '2019-04-12', km: 18400 });
  const enFechaGolf = (fecha: FechaISO): number => enFecha(kmGolf, fecha);

  // Mantenimientos pasados. El aceite es el que vence pronto: la regla es
  // cada 15.000 km o 12 meses, y de esto hace once.
  const fechaAceite = sumarMeses(hoy, -11);
  await repo.mantenimientos.crear({
    vehiculoId: golf.id,
    tipo: 'aceite',
    fecha: fechaAceite,
    km: enFechaGolf(fechaAceite),
    taller: 'Talleres Muñoz',
    costeCentimos: euros(96.4),
    piezas: ['Aceite 5W30 5 l', 'Filtro de aceite'],
    adjuntoIds: [],
  });

  const fechaNeumaticos = sumarMeses(hoy, -8);
  await repo.mantenimientos.crear({
    vehiculoId: golf.id,
    tipo: 'neumaticos',
    fecha: fechaNeumaticos,
    km: enFechaGolf(fechaNeumaticos),
    taller: 'Norauto Las Rozas',
    costeCentimos: euros(412),
    piezas: ['4× Michelin Primacy 4 205/55 R16'],
    notas: 'Alineación incluida.',
    adjuntoIds: [],
  });

  const fechaRevision = sumarMeses(hoy, -5);
  await repo.mantenimientos.crear({
    vehiculoId: golf.id,
    tipo: 'revision_general',
    fecha: fechaRevision,
    km: enFechaGolf(fechaRevision),
    taller: 'Talleres Muñoz',
    costeCentimos: euros(184.9),
    piezas: ['Filtro de habitáculo', 'Filtro de aire'],
    adjuntoIds: [],
  });

  const fechaFrenos = sumarMeses(hoy, -2);
  await repo.mantenimientos.crear({
    vehiculoId: golf.id,
    tipo: 'frenos',
    fecha: fechaFrenos,
    km: enFechaGolf(fechaFrenos),
    taller: 'Talleres Muñoz',
    costeCentimos: euros(268.5),
    piezas: ['Pastillas delanteras', 'Discos delanteros'],
    adjuntoIds: [],
  });

  const fechaFiltros = sumarMeses(hoy, -5);
  await repo.mantenimientos.crear({
    vehiculoId: golf.id,
    tipo: 'filtros',
    fecha: fechaFiltros,
    km: enFechaGolf(fechaFiltros),
    taller: 'Talleres Muñoz',
    costeCentimos: euros(62.3),
    piezas: ['Filtro de habitáculo', 'Filtro de aire'],
    adjuntoIds: [],
  });

  const fechaBateria = sumarMeses(hoy, -14);
  await repo.mantenimientos.crear({
    vehiculoId: golf.id,
    tipo: 'bateria',
    fecha: fechaBateria,
    km: enFechaGolf(fechaBateria),
    taller: 'Norauto Las Rozas',
    costeCentimos: euros(118.5),
    piezas: ['Batería 70 Ah AGM'],
    adjuntoIds: [],
  });

  // Lectura manual reciente: el usuario miró el cuadro sin repostar.
  const fechaLectura = sumarDias(hoy, -3);
  await repo.lecturas.crear({
    vehiculoId: golf.id,
    fecha: fechaLectura,
    km: enFechaGolf(fechaLectura),
    origen: 'manual',
  });

  // Documentos: uno vencido (rojo), uno próximo (ámbar), uno lejano (verde).
  await repo.documentos.crear({
    vehiculoId: golf.id,
    tipo: 'itv',
    fechaEmision: sumarMeses(hoy, -23),
    // Ya caducada: tiene que ser imposible no verlo en el panel.
    fechaVencimiento: sumarDias(hoy, -6),
    estacion: 'ITV Collado Villalba',
    resultado: 'favorable',
    adjuntoIds: [],
  });
  await repo.documentos.crear({
    vehiculoId: golf.id,
    tipo: 'seguro',
    compania: 'Mutua Madrileña',
    poliza: 'MM-4471902',
    cobertura: 'todo_riesgo_franquicia',
    franquiciaCentimos: euros(300),
    primaCentimos: euros(486.2),
    fechaEmision: sumarMeses(hoy, -11),
    fechaVencimiento: sumarDias(hoy, 24),
    adjuntoIds: [],
  });
  await repo.documentos.crear({
    vehiculoId: golf.id,
    tipo: 'impuesto_circulacion',
    fechaVencimiento: sumarDias(hoy, 168),
    notas: 'Ayuntamiento de Las Rozas. Domiciliado.',
    adjuntoIds: [],
  });
  await repo.documentos.crear({
    vehiculoId: golf.id,
    tipo: 'permiso_circulacion',
    fechaEmision: '2019-04-18',
    adjuntoIds: [],
  });

  // Gastos.
  await repo.gastos.crear({
    vehiculoId: golf.id,
    categoria: 'seguro',
    descripcion: 'Prima anual Mutua Madrileña',
    importeCentimos: euros(486.2),
    fecha: sumarMeses(hoy, -11),
    recurrente: true,
    periodicidad: 'anual',
    adjuntoIds: [],
  });
  await repo.gastos.crear({
    vehiculoId: golf.id,
    categoria: 'impuesto_circulacion',
    importeCentimos: euros(121.68),
    fecha: sumarMeses(hoy, -6),
    recurrente: true,
    periodicidad: 'anual',
    adjuntoIds: [],
  });
  await repo.gastos.crear({
    vehiculoId: golf.id,
    categoria: 'itv',
    importeCentimos: euros(43.7),
    fecha: sumarMeses(hoy, -23),
    recurrente: true,
    periodicidad: 'anual',
    adjuntoIds: [],
  });
  await repo.gastos.crear({
    vehiculoId: golf.id,
    categoria: 'parking',
    descripcion: 'Plaza de garaje',
    importeCentimos: euros(75),
    fecha: sumarDias(hoy, -12),
    recurrente: true,
    periodicidad: 'mensual',
    adjuntoIds: [],
  });
  await repo.gastos.crear({
    vehiculoId: golf.id,
    categoria: 'multas',
    descripcion: 'Exceso de velocidad M-505',
    importeCentimos: euros(100),
    fecha: sumarMeses(hoy, -3),
    recurrente: false,
    adjuntoIds: [],
  });
  await repo.gastos.crear({
    vehiculoId: golf.id,
    categoria: 'peajes',
    descripcion: 'AP-6 fin de semana',
    importeCentimos: euros(18.4),
    fecha: sumarDias(hoy, -19),
    recurrente: false,
    adjuntoIds: [],
  });

  // =========================================================================
  // 2. La Zoe — eléctrico: kWh, sin aceite ni distribución
  // =========================================================================
  const zoe = await repo.vehiculos.crear({
    alias: 'La Zoe',
    categoria: 'turismo',
    marca: 'Renault',
    modelo: 'Zoe',
    version: 'R135 Intens 52 kWh',
    matricula: '7290 LMB',
    anio: 2021,
    combustible: 'electrico',
    fechaCompra: '2022-09-30',
    kmCompra: 12,
    precioCompraCentimos: euros(24500),
    notas: 'Carga en casa con tarifa valle. Puntualmente rápida en ruta.',
    estado: 'activo',
    orden: 1,
  });
  await crearReglasPorDefecto(zoe, repo);

  await repo.lecturas.crear({
    vehiculoId: zoe.id,
    fecha: '2022-09-30',
    km: 12,
    origen: 'alta_vehiculo',
    notas: 'Kilómetros de entrega.',
  });

  const cargasZoe = generarRepostajes({
    vehiculoId: zoe.id,
    unidad: 'kWh',
    cantidad: 26,
    fechaFin: sumarDias(hoy, -5),
    kmFin: 38240,
    kmPorTramo: 280,
    consumoBase: 17.4,
    derivaConsumo: 0,
    // El rango es enorme a propósito: 0,09 €/kWh en casa de madrugada frente
    // a 0,59 €/kWh en un cargador rápido de autovía.
    precioMin: 0.092,
    precioMax: 0.59,
    estaciones: ['Casa (valle)', 'Iberdrola Plaza Norte', 'Zunder A-1', 'Casa (valle)'],
    diasEntreMin: 10,
    diasEntreMax: 20,
    semilla: 77712,
  });
  for (const c of cargasZoe) await repo.repostajes.crear(c);

  const kmZoe = hitos(cargasZoe, { fecha: '2022-09-30', km: 12 });

  const revisionZoe = sumarMeses(hoy, -9);
  await repo.mantenimientos.crear({
    vehiculoId: zoe.id,
    tipo: 'revision_general',
    fecha: revisionZoe,
    km: enFecha(kmZoe, revisionZoe),
    taller: 'Renault Alcobendas',
    costeCentimos: euros(148),
    piezas: ['Filtro de habitáculo', 'Revisión de refrigeración de batería'],
    adjuntoIds: [],
  });

  const neumaticosZoe = sumarMeses(hoy, -4);
  await repo.mantenimientos.crear({
    vehiculoId: zoe.id,
    tipo: 'neumaticos',
    fecha: neumaticosZoe,
    km: enFecha(kmZoe, neumaticosZoe),
    taller: 'Confortauto',
    costeCentimos: euros(386),
    piezas: ['4× Michelin e·Primacy 195/55 R16'],
    adjuntoIds: [],
  });

  const bateriaZoe = sumarMeses(hoy, -13);
  await repo.mantenimientos.crear({
    vehiculoId: zoe.id,
    tipo: 'bateria',
    fecha: bateriaZoe,
    km: enFecha(kmZoe, bateriaZoe),
    taller: 'Renault Alcobendas',
    costeCentimos: euros(96),
    piezas: ['Batería auxiliar de 12 V'],
    adjuntoIds: [],
  });

  const frenosZoe = sumarMeses(hoy, -6);
  await repo.mantenimientos.crear({
    vehiculoId: zoe.id,
    tipo: 'frenos',
    fecha: frenosZoe,
    km: enFecha(kmZoe, frenosZoe),
    taller: 'Confortauto',
    costeCentimos: euros(142),
    piezas: ['Pastillas delanteras'],
    notas: 'Duran mucho por la retención regenerativa.',
    adjuntoIds: [],
  });

  await repo.documentos.crear({
    vehiculoId: zoe.id,
    tipo: 'itv',
    fechaEmision: sumarMeses(hoy, -10),
    // Primera ITV pasada hace poco: aún queda mucho. Verde.
    fechaVencimiento: sumarMeses(hoy, 14),
    estacion: 'ITV San Sebastián de los Reyes',
    resultado: 'favorable',
    adjuntoIds: [],
  });
  await repo.documentos.crear({
    vehiculoId: zoe.id,
    tipo: 'seguro',
    compania: 'Línea Directa',
    poliza: 'LD-88213345',
    cobertura: 'todo_riesgo',
    primaCentimos: euros(392.5),
    fechaEmision: sumarMeses(hoy, -9),
    fechaVencimiento: sumarMeses(hoy, 3),
    adjuntoIds: [],
  });

  await repo.gastos.crear({
    vehiculoId: zoe.id,
    categoria: 'seguro',
    descripcion: 'Prima anual Línea Directa',
    importeCentimos: euros(392.5),
    fecha: sumarMeses(hoy, -9),
    recurrente: true,
    periodicidad: 'anual',
    adjuntoIds: [],
  });
  await repo.gastos.crear({
    vehiculoId: zoe.id,
    categoria: 'impuesto_circulacion',
    importeCentimos: euros(59.4),
    fecha: sumarMeses(hoy, -6),
    recurrente: true,
    periodicidad: 'anual',
    notas: 'Bonificado al 75 % por ser eléctrico.',
    adjuntoIds: [],
  });
  await repo.gastos.crear({
    vehiculoId: zoe.id,
    categoria: 'accesorios',
    descripcion: 'Cable de carga tipo 2, 7 m',
    importeCentimos: euros(129.9),
    fecha: sumarMeses(hoy, -2),
    recurrente: false,
    adjuntoIds: [],
  });

  // =========================================================================
  // 3. La Autocaravana — pocos kilómetros, mantenimientos por tiempo
  // =========================================================================
  const camper = await repo.vehiculos.crear({
    alias: 'La Autocaravana',
    categoria: 'autocaravana',
    marca: 'Benimar',
    modelo: 'Tessoro 481',
    version: 'Fiat Ducato 2.3 MultiJet 140 CV',
    matricula: '9134 JVT',
    anio: 2017,
    combustible: 'diesel',
    fechaCompra: '2018-05-19',
    kmCompra: 8600,
    precioCompraCentimos: euros(52900),
    bastidor: 'ZFA25000002B98765',
    notas: 'Perfilada de 6,99 m. MMA 3.500 kg. Camas gemelas.',
    estado: 'activo',
    orden: 2,
  });
  await crearReglasPorDefecto(camper, repo);

  await repo.lecturas.crear({
    vehiculoId: camper.id,
    fecha: '2018-05-19',
    km: 8600,
    origen: 'alta_vehiculo',
    notas: 'Kilómetros de entrega.',
  });

  /*
   * Solo 9 repostajes en dos años y medio: unos 5.000 km al año, casi todos en
   * verano. Es justo el patrón que hace inútiles las reglas por kilómetros y
   * obliga a que manden las de tiempo.
   */
  const repostajesCamper = generarRepostajes({
    vehiculoId: camper.id,
    unidad: 'l',
    cantidad: 9,
    fechaFin: sumarMeses(hoy, -1),
    kmFin: 47800,
    // Depósito de 90 l y 10,5 l/100 km: se reposta cada 700-800 km.
    kmPorTramo: 760,
    consumoBase: 10.6,
    derivaConsumo: 0,
    precioMin: 1.455,
    precioMax: 1.712,
    estaciones: ['Repsol A-2', 'Cepsa Zaragoza', 'Área de servicio Somport', 'BP Jaca'],
    /*
     * Meses entre repostaje y repostaje, no semanas. Es lo que hace que sus
     * mantenimientos venzan por tiempo: a este ritmo, una regla de «cada
     * 15.000 km» tardaría casi cuatro años en dispararse.
     */
    diasEntreMin: 45,
    diasEntreMax: 95,
    semilla: 51907,
  });
  for (const r of repostajesCamper) await repo.repostajes.crear(r);

  const kmCamper = hitos(repostajesCamper, { fecha: '2018-05-19', km: 8600 });

  // El sellado del techo es anual. Este se hizo hace catorce meses: vencido.
  const selladoCamper = sumarMeses(hoy, -14);
  await repo.mantenimientos.crear({
    vehiculoId: camper.id,
    tipo: 'sellado_techo',
    fecha: selladoCamper,
    km: enFecha(kmCamper, selladoCamper),
    taller: 'Caravanas Pirineo',
    costeCentimos: euros(215),
    piezas: ['Sikaflex 512', 'Revisión de claraboyas y juntas'],
    notas: 'Repasadas las juntas de las dos claraboyas. Sin humedad detectada.',
    adjuntoIds: [],
  });

  const gasCamper = sumarMeses(hoy, -50);
  await repo.mantenimientos.crear({
    vehiculoId: camper.id,
    tipo: 'instalacion_gas',
    fecha: gasCamper,
    km: enFecha(kmCamper, gasCamper),
    taller: 'Caravanas Pirineo',
    costeCentimos: euros(92),
    piezas: ['Certificado de revisión de instalación de gas'],
    adjuntoIds: [],
  });

  const aceiteCamper = sumarMeses(hoy, -16);
  await repo.mantenimientos.crear({
    vehiculoId: camper.id,
    tipo: 'aceite',
    fecha: aceiteCamper,
    km: enFecha(kmCamper, aceiteCamper),
    taller: 'Fiat Professional Huesca',
    costeCentimos: euros(178.4),
    piezas: ['Aceite 5W30 7 l', 'Filtro de aceite', 'Filtro de combustible'],
    adjuntoIds: [],
  });

  const bateriaCamper = sumarMeses(hoy, -20);
  await repo.mantenimientos.crear({
    vehiculoId: camper.id,
    tipo: 'bateria',
    fecha: bateriaCamper,
    km: enFecha(kmCamper, bateriaCamper),
    taller: 'Caravanas Pirineo',
    costeCentimos: euros(214),
    piezas: ['Batería de servicio AGM 100 Ah'],
    notas: 'La de servicio, no la del motor.',
    adjuntoIds: [],
  });

  const filtrosCamper = sumarMeses(hoy, -13);
  await repo.mantenimientos.crear({
    vehiculoId: camper.id,
    tipo: 'filtros',
    fecha: filtrosCamper,
    km: enFecha(kmCamper, filtrosCamper),
    taller: 'Fiat Professional Huesca',
    costeCentimos: euros(84),
    piezas: ['Filtro de habitáculo', 'Filtro de aire'],
    adjuntoIds: [],
  });

  await repo.documentos.crear({
    vehiculoId: camper.id,
    tipo: 'itv',
    fechaEmision: sumarMeses(hoy, -12),
    fechaVencimiento: sumarMeses(hoy, 12),
    estacion: 'ITV Huesca',
    resultado: 'favorable',
    adjuntoIds: [],
  });
  await repo.documentos.crear({
    vehiculoId: camper.id,
    tipo: 'seguro',
    compania: 'Caser',
    poliza: 'CS-2019004',
    cobertura: 'todo_riesgo_franquicia',
    franquiciaCentimos: euros(600),
    primaCentimos: euros(741.9),
    fechaEmision: sumarMeses(hoy, -7),
    fechaVencimiento: sumarMeses(hoy, 5),
    adjuntoIds: [],
  });

  await repo.gastos.crear({
    vehiculoId: camper.id,
    categoria: 'seguro',
    descripcion: 'Prima anual Caser',
    importeCentimos: euros(741.9),
    fecha: sumarMeses(hoy, -7),
    recurrente: true,
    periodicidad: 'anual',
    adjuntoIds: [],
  });
  await repo.gastos.crear({
    vehiculoId: camper.id,
    categoria: 'parking',
    descripcion: 'Plaza de aparcamiento para autocaravana',
    importeCentimos: euros(95),
    fecha: sumarDias(hoy, -8),
    recurrente: true,
    periodicidad: 'mensual',
    adjuntoIds: [],
  });
  await repo.gastos.crear({
    vehiculoId: camper.id,
    categoria: 'impuesto_circulacion',
    importeCentimos: euros(148.2),
    fecha: sumarMeses(hoy, -6),
    recurrente: true,
    periodicidad: 'anual',
    adjuntoIds: [],
  });
  await repo.gastos.crear({
    vehiculoId: camper.id,
    categoria: 'peajes',
    descripcion: 'Viaje a los Pirineos',
    importeCentimos: euros(64.3),
    fecha: sumarMeses(hoy, -1),
    recurrente: false,
    adjuntoIds: [],
  });

  // =========================================================================
  // 4. El Ibiza — vendido: histórico congelado, sin avisos
  // =========================================================================
  const fechaVenta = sumarMeses(hoy, -20);
  const ibiza = await repo.vehiculos.crear({
    alias: 'El Ibiza',
    categoria: 'turismo',
    marca: 'SEAT',
    modelo: 'Ibiza',
    version: '1.4 Reference',
    matricula: '2214 FGH',
    anio: 2009,
    combustible: 'gasolina',
    fechaCompra: '2013-06-02',
    kmCompra: 62000,
    precioCompraCentimos: euros(5800),
    estado: 'vendido',
    fechaVenta,
    kmVenta: 198400,
    precioVentaCentimos: euros(1900),
    notas: 'Vendido a un particular por Wallapop. Aguantó hasta el final.',
    orden: 3,
  });
  await crearReglasPorDefecto(ibiza, repo);

  await repo.lecturas.crear({
    vehiculoId: ibiza.id,
    fecha: '2013-06-02',
    km: 62000,
    origen: 'alta_vehiculo',
  });

  const repostajesIbiza = generarRepostajes({
    vehiculoId: ibiza.id,
    unidad: 'l',
    cantidad: 12,
    // El último repostaje, una semana antes de entregar el coche.
    fechaFin: sumarDias(fechaVenta, -7),
    kmFin: 198050,
    kmPorTramo: 560,
    consumoBase: 7.2,
    derivaConsumo: 0,
    precioMin: 1.519,
    precioMax: 1.812,
    estaciones: ['Shell Getafe', 'Repsol M-45'],
    diasEntreMin: 12,
    diasEntreMax: 22,
    semilla: 4410,
  });
  for (const r of repostajesIbiza) await repo.repostajes.crear(r);

  const kmIbiza = hitos(repostajesIbiza, { fecha: '2013-06-02', km: 62000 });

  const aceiteIbiza = sumarMeses(fechaVenta, -4);
  await repo.mantenimientos.crear({
    vehiculoId: ibiza.id,
    tipo: 'aceite',
    fecha: aceiteIbiza,
    km: enFecha(kmIbiza, aceiteIbiza),
    taller: 'Taller del barrio',
    costeCentimos: euros(72),
    piezas: ['Aceite 10W40 4 l', 'Filtro de aceite'],
    adjuntoIds: [],
  });

  const bateriaIbiza = sumarMeses(fechaVenta, -2);
  await repo.mantenimientos.crear({
    vehiculoId: ibiza.id,
    tipo: 'bateria',
    fecha: bateriaIbiza,
    km: enFecha(kmIbiza, bateriaIbiza),
    taller: 'Norauto Getafe',
    costeCentimos: euros(94.9),
    piezas: ['Batería 60 Ah'],
    adjuntoIds: [],
  });

  // La última lectura es la de la entrega: después de esto no pasa nada más.
  await repo.lecturas.crear({
    vehiculoId: ibiza.id,
    fecha: fechaVenta,
    km: 198400,
    origen: 'venta',
    notas: 'Kilómetros en el momento de la venta.',
  });

  await repo.gastos.crear({
    vehiculoId: ibiza.id,
    categoria: 'seguro',
    descripcion: 'Prima anual (terceros)',
    importeCentimos: euros(214.3),
    fecha: sumarMeses(fechaVenta, -8),
    recurrente: false,
    adjuntoIds: [],
  });

  // Ajustes iniciales: el Golf es el vehículo del día a día.
  await repo.ajustes.guardar({ vehiculoPorDefectoId: golf.id });
}

/** ¿Hay algo guardado ya? Evita duplicar la semilla al recargar la app. */
export async function estaVacia(repo: Repositorio): Promise<boolean> {
  return (await repo.vehiculos.contar()) === 0;
}

/** Carga los datos de ejemplo solo si la base está vacía. */
export async function sembrarSiHaceFalta(repo: Repositorio): Promise<boolean> {
  if (!(await estaVacia(repo))) return false;
  await cargarDatosEjemplo(repo);
  return true;
}
