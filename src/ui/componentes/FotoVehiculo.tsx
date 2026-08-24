import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/datos/db.ts';
import type { Vehiculo } from '@/dominio/tipos.ts';
import { IlustracionVehiculo } from './IlustracionVehiculo.tsx';
import './FotoVehiculo.css';

/** Seis tintes de la paleta de series, repartidos de forma estable por id. */
const TINTES = 6;

function tinteDe(id: string): number {
  let suma = 0;
  for (let i = 0; i < id.length; i += 1) suma = (suma * 31 + id.charCodeAt(i)) >>> 0;
  return (suma % TINTES) + 1;
}

/**
 * Miniatura del vehículo.
 *
 * Si hay foto, se muestra. Si no, una silueta sobre un degradado con un tinte
 * estable derivado del id: dos vehículos distintos nunca salen del mismo
 * color, y el mismo vehículo sale siempre igual entre recargas.
 */
export function FotoVehiculo({ vehiculo }: { vehiculo: Vehiculo }): React.JSX.Element {
  const adjunto = useLiveQuery(
    async () => (vehiculo.fotoAdjuntoId ? db.adjuntos.get(vehiculo.fotoAdjuntoId) : undefined),
    [vehiculo.fotoAdjuntoId],
    undefined,
  );

  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!adjunto?.datos) {
      setUrl(null);
      return undefined;
    }
    // Un object URL retiene el Blob en memoria hasta que se revoca. Sin la
    // limpieza, navegar entre vehículos va dejando fotos enteras colgadas.
    const creada = URL.createObjectURL(adjunto.datos);
    setUrl(creada);
    return () => URL.revokeObjectURL(creada);
  }, [adjunto]);

  const vendido = vehiculo.estado === 'vendido';

  return (
    <div
      className={`foto-vehiculo tinte-${tinteDe(vehiculo.id)}${vendido ? ' es-vendido' : ''}`}
      data-categoria={vehiculo.categoria}
    >
      {url ? (
        <img
          src={url}
          alt={`Foto de ${vehiculo.alias}`}
          className="foto-vehiculo__imagen"
          loading="lazy"
          decoding="async"
        />
      ) : (
        <IlustracionVehiculo categoria={vehiculo.categoria} />
      )}
    </div>
  );
}
