import { describe, expect, it } from 'vitest';
import {
  agruparPorMes,
  eventosDeGastos,
  eventosDeVencimientos,
  generarIcs,
  plegarLinea,
  proximoCargo,
  type EventoCalendario,
} from './calendario.ts';
import type { Gasto, Vehiculo } from './tipos.ts';
import type { Vencimiento } from './vencimientos.ts';

const HOY = '2026-08-24';
const AHORA = new Date('2026-08-24T10:30:00Z');

function vehiculo(cambios: Partial<Vehiculo> = {}): Vehiculo {
  return {
    id: 'v1',
    creadoEn: '',
    actualizadoEn: '',
    alias: 'El Golf',
    categoria: 'turismo',
    marca: 'Volkswagen',
    modelo: 'Golf',
    matricula: '4821 KRT',
    anio: 2018,
    combustible: 'diesel',
    estado: 'activo',
    orden: 0,
    ...cambios,
  };
}

function vencimiento(cambios: Partial<Vencimiento> = {}): Vencimiento {
  return {
    id: 'doc:d1',
    vehiculoId: 'v1',
    titulo: 'ITV',
    origen: { clase: 'documento', documentoId: 'd1', tipo: 'itv' },
    semaforo: 'proximo',
    fechaLimite: '2026-09-10',
    diasRestantes: 17,
    motivo: 'tiempo',
    urgencia: 17,
    ...cambios,
  };
}

function evento(cambios: Partial<EventoCalendario> = {}): EventoCalendario {
  return {
    uid: 'doc:d1@mi-garaje',
    fecha: '2026-09-10',
    titulo: 'ITV · El Golf',
    descripcion: 'Volkswagen Golf · 4821 KRT',
    clase: 'documento',
    vehiculoId: 'v1',
    vehiculoAlias: 'El Golf',
    avisoDias: 30,
    diasRestantes: 17,
    ...cambios,
  };
}

// ---------------------------------------------------------------------------

describe('eventosDeVencimientos', () => {
  it('convierte un vencimiento con fecha en un evento', () => {
    const [e] = eventosDeVencimientos(vehiculo(), [vencimiento()], { hoy: HOY });

    expect(e!.fecha).toBe('2026-09-10');
    expect(e!.titulo).toBe('ITV · El Golf');
    expect(e!.uid).toBe('doc:d1@mi-garaje');
    expect(e!.diasRestantes).toBe(17);
  });

  it('descarta lo que solo vence por kilómetros', () => {
    /*
     * Nadie sabe qué día llegarás a 140.000 km, así que no hay fecha que
     * llevar al calendario. Para eso está el aviso dentro de la app.
     */
    const soloKm = vencimiento({
      id: 'regla:r1',
      titulo: 'Neumáticos',
      origen: { clase: 'mantenimiento', reglaId: 'r1', tipo: 'neumaticos', sinRegistroPrevio: false },
      fechaLimite: undefined,
      diasRestantes: undefined,
      kmLimite: 140000,
      kmRestantes: 8000,
      motivo: 'km',
    });

    expect(eventosDeVencimientos(vehiculo(), [soloKm], { hoy: HOY })).toEqual([]);
  });

  it('descarta lo que nunca se ha registrado', () => {
    // Su fecha sale de la compra y no es creíble: llenaría la agenda de citas
    // inventadas.
    const sinRegistro = vencimiento({
      id: 'regla:r2',
      origen: { clase: 'mantenimiento', reglaId: 'r2', tipo: 'filtros', sinRegistroPrevio: true },
    });

    expect(eventosDeVencimientos(vehiculo(), [sinRegistro], { hoy: HOY })).toEqual([]);
  });

  it('mete los kilómetros en la descripción cuando también vence por ellos', () => {
    const doble = vencimiento({
      id: 'regla:r3',
      origen: { clase: 'mantenimiento', reglaId: 'r3', tipo: 'aceite', sinRegistroPrevio: false },
      kmLimite: 140000,
      desdeFecha: '2025-09-10',
    });

    const [e] = eventosDeVencimientos(vehiculo(), [doble], { hoy: HOY });
    expect(e!.descripcion).toContain('140.000 km');
    expect(e!.descripcion).toContain('10/09/2025');
  });
});

describe('proximoCargo', () => {
  it('avanza un periodo desde el último pago', () => {
    const seguro = {
      recurrente: true,
      periodicidad: 'anual',
      fecha: '2026-01-15',
    } as Gasto;
    expect(proximoCargo(seguro, HOY)).toBe('2027-01-15');
  });

  it('salta hasta pasar de hoy si dejaste de registrarlo', () => {
    // Dos años sin anotar el seguro: el próximo cargo es el que viene, no uno
    // de hace veintitrés meses.
    const viejo = { recurrente: true, periodicidad: 'anual', fecha: '2023-03-01' } as Gasto;
    expect(proximoCargo(viejo, HOY)).toBe('2027-03-01');
  });

  it('funciona con periodicidad mensual', () => {
    const parking = { recurrente: true, periodicidad: 'mensual', fecha: '2026-08-12' } as Gasto;
    expect(proximoCargo(parking, HOY)).toBe('2026-09-12');
  });

  it('devuelve null si el gasto no se repite', () => {
    expect(proximoCargo({ recurrente: false, fecha: '2026-01-01' } as Gasto, HOY)).toBeNull();
    expect(
      proximoCargo({ recurrente: true, fecha: '2026-01-01' } as Gasto, HOY),
    ).toBeNull();
  });
});

describe('eventosDeGastos', () => {
  function gasto(cambios: Partial<Gasto> = {}): Gasto {
    return {
      id: 'g1',
      creadoEn: '',
      actualizadoEn: '',
      vehiculoId: 'v1',
      categoria: 'seguro',
      fecha: '2026-01-15',
      importeCentimos: 48620,
      recurrente: true,
      periodicidad: 'anual',
      adjuntoIds: [],
      ...cambios,
    };
  }

  it('proyecta el siguiente cargo', () => {
    const [e] = eventosDeGastos(vehiculo(), [gasto({ descripcion: 'Prima anual' })], {
      hoy: HOY,
    });
    expect(e!.fecha).toBe('2027-01-15');
    expect(e!.titulo).toBe('Prima anual · El Golf');
    expect(e!.descripcion).toContain('486,20');
  });

  it('no duplica cinco años del mismo seguro en una sola cita', () => {
    // Los cinco registros predicen el mismo próximo cargo; solo cuenta el
    // último.
    const historial = [
      gasto({ id: 'g1', fecha: '2022-01-15' }),
      gasto({ id: 'g2', fecha: '2023-01-15' }),
      gasto({ id: 'g3', fecha: '2024-01-15' }),
      gasto({ id: 'g4', fecha: '2025-01-15' }),
      gasto({ id: 'g5', fecha: '2026-01-15' }),
    ];

    const eventos = eventosDeGastos(vehiculo(), historial, { hoy: HOY });
    expect(eventos).toHaveLength(1);
    expect(eventos[0]!.fecha).toBe('2027-01-15');
  });

  it('separa categorías distintas', () => {
    const eventos = eventosDeGastos(
      vehiculo(),
      [gasto(), gasto({ id: 'g2', categoria: 'impuesto_circulacion', fecha: '2026-03-01' })],
      { hoy: HOY },
    );
    expect(eventos).toHaveLength(2);
  });

  it('ignora los gastos que no se repiten', () => {
    expect(
      eventosDeGastos(vehiculo(), [gasto({ recurrente: false })], { hoy: HOY }),
    ).toEqual([]);
  });
});

describe('agruparPorMes', () => {
  it('ordena por fecha y agrupa', () => {
    const grupos = agruparPorMes([
      evento({ uid: 'c', fecha: '2026-10-05' }),
      evento({ uid: 'a', fecha: '2026-09-01' }),
      evento({ uid: 'b', fecha: '2026-09-20' }),
    ]);

    expect(grupos.map((g) => g.mes)).toEqual(['2026-09', '2026-10']);
    expect(grupos[0]!.eventos.map((e) => e.uid)).toEqual(['a', 'b']);
  });
});

// ---------------------------------------------------------------------------

describe('plegarLinea', () => {
  it('deja en paz las líneas cortas', () => {
    expect(plegarLinea('SUMMARY:ITV')).toBe('SUMMARY:ITV');
  });

  it('pliega a 75 octetos con un espacio de continuación', () => {
    const larga = `SUMMARY:${'a'.repeat(100)}`;
    const plegada = plegarLinea(larga);
    const trozos = plegada.split('\r\n');

    expect(trozos.length).toBeGreaterThan(1);
    expect(trozos[0]!.length).toBe(75);
    for (const trozo of trozos.slice(1)) expect(trozo.startsWith(' ')).toBe(true);
  });

  it('cuenta octetos y no caracteres', () => {
    /*
     * Cada vocal acentuada ocupa dos bytes en UTF-8. Contando caracteres, esta
     * línea parecería de 80 y cabría en dos trozos holgados; contando octetos
     * son 160 y hay que partirla más veces. Algunos clientes rechazan las
     * líneas que pasan de 75 octetos.
     */
    const acentos = `DESCRIPTION:${'á'.repeat(80)}`;
    const trozos = plegarLinea(acentos).split('\r\n');

    for (const trozo of trozos) {
      expect(new TextEncoder().encode(trozo).length).toBeLessThanOrEqual(75);
    }
  });

  it('no parte un carácter multibyte por la mitad', () => {
    const acentos = `DESCRIPTION:${'ñ'.repeat(60)}`;
    const plegada = plegarLinea(acentos);
    // Si el corte cayera dentro de un carácter, aparecería el reemplazo U+FFFD.
    expect(plegada).not.toContain('\ufffd');
    expect(plegada.replace(/\r\n /g, '')).toBe(acentos);
  });
});

describe('generarIcs', () => {
  it('produce un calendario válido con un evento de día completo', () => {
    const ics = generarIcs([evento()], { ahora: AHORA });

    expect(ics.startsWith('BEGIN:VCALENDAR\r\n')).toBe(true);
    expect(ics.endsWith('END:VCALENDAR\r\n')).toBe(true);
    expect(ics).toContain('VERSION:2.0');
    expect(ics).toContain('DTSTART;VALUE=DATE:20260910');
    // DTEND es exclusivo: el día siguiente. Sin eso, algunos clientes lo
    // pintan de dos días.
    expect(ics).toContain('DTEND;VALUE=DATE:20260911');
  });

  it('usa CRLF, que es lo que exige la norma', () => {
    // Con LF a secas, Outlook no abre el archivo.
    const ics = generarIcs([evento()], { ahora: AHORA });
    expect(ics.includes('\r\n')).toBe(true);
    expect(/[^\r]\n/.test(ics)).toBe(false);
  });

  it('cruza bien el fin de mes al calcular DTEND', () => {
    const ics = generarIcs([evento({ fecha: '2026-09-30' })], { ahora: AHORA });
    expect(ics).toContain('DTEND;VALUE=DATE:20261001');
  });

  it('cruza bien el fin de año', () => {
    const ics = generarIcs([evento({ fecha: '2026-12-31' })], { ahora: AHORA });
    expect(ics).toContain('DTEND;VALUE=DATE:20270101');
  });

  it('escapa comas, puntos y comas, barras y saltos de línea', () => {
    const ics = generarIcs(
      [
        evento({
          titulo: 'Aceite, filtros; y más',
          descripcion: 'Primera línea\nSegunda C:\\ruta',
        }),
      ],
      { ahora: AHORA },
    );

    expect(ics).toContain('SUMMARY:Aceite\\, filtros\\; y más');
    expect(ics).toContain('Primera línea\\nSegunda C:\\\\ruta');
  });

  it('incluye un recordatorio con la antelación de cada evento', () => {
    const ics = generarIcs([evento({ avisoDias: 30 }), evento({ uid: 'x', avisoDias: 7 })], {
      ahora: AHORA,
    });

    expect(ics).toContain('TRIGGER:-P30D');
    expect(ics).toContain('TRIGGER:-P7D');
    expect(ics).toContain('ACTION:DISPLAY');
  });

  it('da un UID estable, para que reimportar no duplique', () => {
    const primera = generarIcs([evento()], { ahora: AHORA });
    const segunda = generarIcs([evento()], { ahora: new Date('2027-01-01T00:00:00Z') });

    expect(primera).toContain('UID:doc:d1@mi-garaje');
    expect(segunda).toContain('UID:doc:d1@mi-garaje');
  });

  it('formatea el DTSTAMP en UTC sin milisegundos', () => {
    const ics = generarIcs([evento()], { ahora: AHORA });
    expect(ics).toContain('DTSTAMP:20260824T103000Z');
  });

  it('genera un calendario vacío pero válido sin eventos', () => {
    const ics = generarIcs([], { ahora: AHORA });
    expect(ics).toContain('BEGIN:VCALENDAR');
    expect(ics).toContain('END:VCALENDAR');
    expect(ics).not.toContain('BEGIN:VEVENT');
  });

  it('mantiene todas las líneas dentro del límite de octetos', () => {
    const ics = generarIcs(
      [
        evento({
          titulo: 'Revisión general con cambio de líquido de frenos y filtro de habitáculo · La Autocaravana',
          descripcion: 'Benimar Tessoro 481 · 9134 JVT\nO al llegar a 68.352 km.',
        }),
      ],
      { ahora: AHORA },
    );

    for (const linea of ics.split('\r\n')) {
      expect(new TextEncoder().encode(linea).length).toBeLessThanOrEqual(75);
    }
  });
});
