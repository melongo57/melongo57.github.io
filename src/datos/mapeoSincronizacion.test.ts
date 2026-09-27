import { describe, expect, it } from 'vitest';
import type { Documento } from '@/dominio/tipos.ts';
import {
  ajustesDesdeFila,
  documentoDesdeFila,
  filaDesdeAjustes,
  filaDesdeDocumento,
  filaDesdeRegistro,
  registroDesdeFila,
} from './mapeoSincronizacion.ts';
import { ajustesPorDefecto } from './ajustesPorDefecto.ts';

describe('filaDesdeRegistro / registroDesdeFila', () => {
  it('convierte camelCase a snake_case y vuelve, sin perder nada', () => {
    const original = {
      id: 'v1',
      creadoEn: '2026-01-01T00:00:00Z',
      vehiculoId: 'veh1',
      costeCentimos: 9640,
      depositoLleno: true,
    };

    const fila = filaDesdeRegistro(original, 'uid-1');
    expect(fila).toMatchObject({
      id: 'v1',
      creado_en: '2026-01-01T00:00:00Z',
      vehiculo_id: 'veh1',
      coste_centimos: 9640,
      deposito_lleno: true,
      propietario_id: 'uid-1',
    });

    const vuelta = registroDesdeFila<typeof original>(fila);
    expect(vuelta).toEqual(original);
  });

  it('nunca escribe el propietarioId local en la fila remota', () => {
    // El dueño lo decide siempre el parámetro `propietarioId` (el usuario
    // autenticado), no un campo que el registro local pueda traer.
    const fila = filaDesdeRegistro({ id: 'a', propietarioId: 'otro-usuario' }, 'uid-real');
    expect(fila.propietario_id).toBe('uid-real');
  });

  it('omite los campos undefined en vez de mandarlos como null', () => {
    const fila = filaDesdeRegistro({ id: 'a', notas: undefined }, 'uid-1');
    expect('notas' in fila).toBe(false);
  });

  it('descarta propietario_id al volver, porque no es parte del tipo local', () => {
    const registro = registroDesdeFila<{ id: string }>({ id: 'a', propietario_id: 'uid-1' });
    expect('propietarioId' in registro).toBe(false);
  });

  it('excluye los campos indicados, para lo que no tiene columna propia', () => {
    // Es el caso de Adjunto.datos: el contenido va a Storage, no a una fila.
    const fila = filaDesdeRegistro({ id: 'a', datos: 'blob-de-mentira' }, 'uid-1', ['datos']);
    expect('datos' in fila).toBe(false);
  });

  it('manda NULL en los campos anulables que faltan, para poder vaciarlos', () => {
    // Un upsert que no menciona una columna la deja como estaba: sin el NULL,
    // marcar una alerta como hecha no borraría su fecha fija en el servidor.
    const fila = filaDesdeRegistro({ id: 'a', cadaMeses: 12 }, 'uid-1', [], [
      'venceEl',
      'cadaMeses',
    ]);
    expect(fila.vence_el).toBeNull();
    expect(fila.cada_meses).toBe(12);
  });
});

describe('documentos: columnas comunes + detalle', () => {
  const seguro: Documento = {
    id: 'd1',
    creadoEn: '2026-01-01T00:00:00Z',
    actualizadoEn: '2026-01-01T00:00:00Z',
    borradoEn: null,
    vehiculoId: 'v1',
    tipo: 'seguro',
    compania: 'Mutua Madrileña',
    cobertura: 'todo_riesgo',
    primaCentimos: 48620,
    adjuntoIds: [],
  };

  it('separa los campos propios de la variante en `detalle`', () => {
    const fila = filaDesdeDocumento(seguro, 'uid-1');
    expect(fila.compania).toBeUndefined();
    expect(fila.detalle).toEqual({
      compania: 'Mutua Madrileña',
      cobertura: 'todo_riesgo',
      primaCentimos: 48620,
    });
    expect(fila.vehiculo_id).toBe('v1');
  });

  it('reconstruye el documento original a partir de la fila', () => {
    const fila = filaDesdeDocumento(seguro, 'uid-1');
    expect(documentoDesdeFila(fila)).toEqual(seguro);
  });

  it('funciona igual para una ITV y para un documento genérico', () => {
    const itv: Documento = {
      id: 'd2',
      creadoEn: '',
      actualizadoEn: '',
      vehiculoId: 'v1',
      tipo: 'itv',
      estacion: 'ITV Collado Villalba',
      resultado: 'favorable',
      adjuntoIds: [],
    };
    expect(documentoDesdeFila(filaDesdeDocumento(itv, 'uid-1'))).toEqual(itv);

    const generico: Documento = {
      id: 'd3',
      creadoEn: '',
      actualizadoEn: '',
      vehiculoId: 'v1',
      tipo: 'ficha_tecnica',
      titulo: 'Ficha técnica original',
      adjuntoIds: [],
    };
    expect(documentoDesdeFila(filaDesdeDocumento(generico, 'uid-1'))).toEqual(generico);
  });
});

describe('ajustes: fila única por usuario', () => {
  it('no manda id, creadoEn ni borradoEn: no existen en la tabla remota', () => {
    const ajustes = ajustesPorDefecto();
    const fila = filaDesdeAjustes(ajustes, 'uid-1');

    expect('id' in fila).toBe(false);
    expect('creado_en' in fila).toBe(false);
    expect('borrado_en' in fila).toBe(false);
    expect(fila.propietario_id).toBe('uid-1');
    expect(fila.tema).toBe('sistema');
  });

  it('reconstruye unos ajustes locales completos a partir de la fila', () => {
    const original = ajustesPorDefecto();
    const fila = filaDesdeAjustes(original, 'uid-1');

    const reconstruido = ajustesDesdeFila(fila, 'ajustes', '2026-08-24T00:00:00Z');
    expect(reconstruido.id).toBe('ajustes');
    expect(reconstruido.tema).toBe(original.tema);
    expect(reconstruido.avisoDias).toBe(original.avisoDias);
    expect(reconstruido.avisoKm).toBe(original.avisoKm);
  });
});
