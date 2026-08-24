import { useEffect, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { guardarAdjunto } from '@/datos/acciones.ts';
import { db } from '@/datos/db.ts';
import { AdjuntoDemasiadoGrande } from '@/datos/imagenes.ts';
import { repo } from '@/datos/repositorioDexie.ts';
import { formatearBytes } from '@/dominio/formato.ts';
import type { Adjunto, Id } from '@/dominio/tipos.ts';
import { Boton } from './Boton.tsx';
import './Adjuntos.css';

/**
 * Adjuntar fotos de facturas y PDF.
 *
 * Las imágenes se recomprimen a 1.600 px antes de guardarse (ver
 * `datos/imagenes.ts`): un ticket de 5 MB queda en unos 200 kB y se sigue
 * leyendo perfectamente. Sin eso, el navegador acaba desalojando la base por
 * superar su cuota y la exportación a JSON se vuelve inmanejable.
 *
 * El botón de cámara usa `capture="environment"` para abrir directamente la
 * trasera del móvil, que es lo que quieres con la factura en la mano.
 */

function Miniatura({
  adjunto,
  alBorrar,
}: {
  adjunto: Adjunto;
  alBorrar: () => void;
}): React.JSX.Element {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    const creada = URL.createObjectURL(adjunto.datos);
    setUrl(creada);
    // Sin revocar, cada Blob se queda retenido en memoria al navegar.
    return () => URL.revokeObjectURL(creada);
  }, [adjunto]);

  const esImagen = adjunto.mime.startsWith('image/');

  return (
    <li className="adjunto">
      <a
        className="adjunto__enlace"
        href={url ?? undefined}
        target="_blank"
        rel="noreferrer"
        title={`Abrir ${adjunto.nombre}`}
      >
        {esImagen && url ? (
          <img src={url} alt={adjunto.nombre} className="adjunto__vista" loading="lazy" />
        ) : (
          <span className="adjunto__icono" aria-hidden="true">
            📄
          </span>
        )}
      </a>

      <div className="adjunto__pie">
        <span className="adjunto__nombre" title={adjunto.nombre}>
          {adjunto.nombre}
        </span>
        <span className="adjunto__peso numero">{formatearBytes(adjunto.bytes)}</span>
      </div>

      <button type="button" className="adjunto__quitar" onClick={alBorrar}>
        <span aria-hidden="true">✕</span>
        <span className="solo-lectores">Quitar {adjunto.nombre}</span>
      </button>
    </li>
  );
}

export function Adjuntos({
  ids,
  alCambiar,
}: {
  ids: readonly Id[];
  /** Recibe la lista nueva. El componente no escribe en el registro padre. */
  alCambiar: (ids: Id[]) => void;
}): React.JSX.Element {
  const adjuntos = useLiveQuery(
    async () => (ids.length === 0 ? [] : (await db.adjuntos.bulkGet([...ids])).filter(Boolean)),
    [ids.join(',')],
    [] as (Adjunto | undefined)[],
  );

  const entradaArchivo = useRef<HTMLInputElement>(null);
  const entradaCamara = useRef<HTMLInputElement>(null);
  const [subiendo, setSubiendo] = useState(false);
  const [fallo, setFallo] = useState<string | null>(null);

  async function anadir(lista: FileList | null): Promise<void> {
    if (!lista || lista.length === 0) return;
    setSubiendo(true);
    setFallo(null);

    const nuevos: Id[] = [];
    for (const archivo of Array.from(lista)) {
      try {
        nuevos.push((await guardarAdjunto(archivo)).id);
      } catch (error) {
        setFallo(
          error instanceof AdjuntoDemasiadoGrande
            ? error.message
            : `No se ha podido guardar «${archivo.name}».`,
        );
      }
    }

    if (nuevos.length > 0) alCambiar([...ids, ...nuevos]);
    setSubiendo(false);
  }

  async function quitar(id: Id): Promise<void> {
    alCambiar(ids.filter((x) => x !== id));
    // Se borra el Blob además de la referencia: si no, quedan megabytes
    // huérfanos ocupando la cuota del navegador.
    await repo.adjuntos.borrar(id);
  }

  return (
    <div className="adjuntos">
      <span className="adjuntos__titulo">Adjuntos</span>

      {adjuntos && adjuntos.length > 0 ? (
        <ul className="adjuntos__lista">
          {adjuntos.filter((a): a is Adjunto => Boolean(a)).map((adjunto) => (
            <Miniatura
              key={adjunto.id}
              adjunto={adjunto}
              alBorrar={() => void quitar(adjunto.id)}
            />
          ))}
        </ul>
      ) : null}

      <div className="adjuntos__acciones">
        <input
          ref={entradaCamara}
          type="file"
          accept="image/*"
          capture="environment"
          className="solo-lectores"
          onChange={(e) => {
            void anadir(e.target.files);
            e.target.value = '';
          }}
        />
        <input
          ref={entradaArchivo}
          type="file"
          accept="image/*,application/pdf"
          multiple
          className="solo-lectores"
          onChange={(e) => {
            void anadir(e.target.files);
            e.target.value = '';
          }}
        />

        <Boton icono="📷" alPulsar={() => entradaCamara.current?.click()} cargando={subiendo}>
          Hacer foto
        </Boton>
        <Boton variante="sutil" alPulsar={() => entradaArchivo.current?.click()}>
          Elegir archivo
        </Boton>
      </div>

      {fallo ? <p className="adjuntos__fallo">{fallo}</p> : null}
    </div>
  );
}
