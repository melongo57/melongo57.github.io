import { ANTELACION_DOCUMENTO_DIAS, ANTELACION_MANTENIMIENTO } from '@/dominio/catalogos.ts';
import { ahoraISO } from '@/dominio/fechas.ts';
import { ID_AJUSTES, type Ajustes } from '@/dominio/tipos.ts';

/** Ajustes de partida la primera vez que se abre la app. */
export function ajustesPorDefecto(): Ajustes {
  const ahora = ahoraISO();
  return {
    id: ID_AJUSTES,
    creadoEn: ahora,
    actualizadoEn: ahora,
    borradoEn: null,
    propietarioId: null,
    tema: 'sistema',
    antelacionMantenimiento: structuredClone(ANTELACION_MANTENIMIENTO),
    antelacionDocumentoDias: { ...ANTELACION_DOCUMENTO_DIAS },
    notificacionesActivadas: false,
  };
}
