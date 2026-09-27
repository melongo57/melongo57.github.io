import { AVISO_DIAS_POR_DEFECTO, AVISO_KM_POR_DEFECTO } from '@/dominio/catalogos.ts';
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
    avisoDias: AVISO_DIAS_POR_DEFECTO,
    avisoKm: AVISO_KM_POR_DEFECTO,
    notificacionesActivadas: false,
  };
}
