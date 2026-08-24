import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { COBERTURAS_SEGURO, TIPOS_DOCUMENTO } from '@/dominio/catalogos.ts';
import { formatearEuros } from '@/dominio/dinero.ts';
import { formatearDistancia, formatearFecha, diasEntre, hoyISO } from '@/dominio/fechas.ts';
import type { Documento } from '@/dominio/tipos.ts';
import { Boton, EnlaceBoton } from '../componentes/Boton.tsx';
import { FormularioDocumento } from '../componentes/FormularioDocumento.tsx';
import { HojaModal } from '../componentes/HojaModal.tsx';
import { useDocumentos, useVehiculo } from '../ganchos/consultas.ts';
import './Documentos.css';

type Edicion = { modo: 'cerrado' } | { modo: 'nuevo' } | { modo: 'editar'; registro: Documento };

/** Resumen de una línea con lo propio de cada tipo. */
function detalleDe(d: Documento): string {
  if (d.tipo === 'seguro') {
    const partes = [d.compania, COBERTURAS_SEGURO[d.cobertura].nombre];
    if (d.poliza) partes.push(`Póliza ${d.poliza}`);
    if (d.primaCentimos !== undefined) partes.push(formatearEuros(d.primaCentimos));
    return partes.join(' · ');
  }
  if (d.tipo === 'itv') {
    const partes: string[] = [];
    if (d.estacion) partes.push(d.estacion);
    if (d.resultado) partes.push(d.resultado === 'favorable' ? 'Favorable' : 'Desfavorable');
    return partes.join(' · ');
  }
  return d.titulo ?? '';
}

export function Documentos(): React.JSX.Element {
  const { id } = useParams<{ id: string }>();
  const vehiculo = useVehiculo(id);
  const documentos = useDocumentos(id);
  const [edicion, setEdicion] = useState<Edicion>({ modo: 'cerrado' });
  const hoy = hoyISO();

  if (vehiculo === null) {
    return (
      <div className="contenedor">
        <div className="vacio">
          <h2>Ese vehículo ya no existe</h2>
          <EnlaceBoton a="/vehiculos" variante="principal">
            Ver mis vehículos
          </EnlaceBoton>
        </div>
      </div>
    );
  }

  return (
    <div className="contenedor documentos">
      <header className="documentos__cabecera">
        <div>
          <h1>Documentos</h1>
          <p className="documentos__sub">{vehiculo?.alias ?? ''}</p>
        </div>
        <Boton variante="principal" icono="＋" alPulsar={() => setEdicion({ modo: 'nuevo' })}>
          Añadir
        </Boton>
      </header>

      {documentos === undefined ? (
        <p className="cargando">Cargando…</p>
      ) : documentos.length === 0 ? (
        <div className="vacio">
          <p className="vacio__icono" aria-hidden="true">
            🗂️
          </p>
          <h2>Todavía no hay ningún documento</h2>
          <p>
            El seguro, la ITV, el permiso de circulación. Con su fecha de vencimiento
            aparecerán en el panel con su semáforo, y podrás llevártelos al calendario.
          </p>
          <Boton variante="principal" icono="＋" alPulsar={() => setEdicion({ modo: 'nuevo' })}>
            Añadir el primero
          </Boton>
        </div>
      ) : (
        <ul className="documentos__lista">
          {documentos.map((d) => {
            const dias = d.fechaVencimiento ? diasEntre(hoy, d.fechaVencimiento) : null;
            const estado = dias === null ? 'sin' : dias < 0 ? 'vencido' : dias <= 30 ? 'proximo' : 'ok';
            const detalle = detalleDe(d);

            return (
              <li key={d.id}>
                <button
                  type="button"
                  className={`doc-fila es-${estado}`}
                  onClick={() => setEdicion({ modo: 'editar', registro: d })}
                >
                  <span className="doc-fila__icono" aria-hidden="true">
                    {TIPOS_DOCUMENTO[d.tipo].icono}
                  </span>

                  <span className="doc-fila__cuerpo">
                    <span className="doc-fila__titulo">{TIPOS_DOCUMENTO[d.tipo].nombre}</span>
                    {detalle ? <span className="doc-fila__detalle">{detalle}</span> : null}
                    {d.adjuntoIds.length > 0 ? (
                      <span className="doc-fila__adjuntos">
                        📎 {d.adjuntoIds.length}{' '}
                        {d.adjuntoIds.length === 1 ? 'adjunto' : 'adjuntos'}
                      </span>
                    ) : null}
                  </span>

                  <span className="doc-fila__derecha">
                    {d.fechaVencimiento ? (
                      <>
                        <span className="doc-fila__fecha numero">
                          {formatearFecha(d.fechaVencimiento)}
                        </span>
                        <span className="doc-fila__plazo">{formatearDistancia(dias!)}</span>
                      </>
                    ) : (
                      <span className="doc-fila__plazo">No caduca</span>
                    )}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <HojaModal
        abierta={edicion.modo !== 'cerrado'}
        titulo={edicion.modo === 'editar' ? 'Editar documento' : 'Nuevo documento'}
        alCerrar={() => setEdicion({ modo: 'cerrado' })}
      >
        {vehiculo && edicion.modo !== 'cerrado' ? (
          <FormularioDocumento
            key={edicion.modo === 'editar' ? edicion.registro.id : 'nuevo'}
            vehiculo={vehiculo}
            {...(edicion.modo === 'editar' ? { documento: edicion.registro } : {})}
            alTerminar={() => setEdicion({ modo: 'cerrado' })}
          />
        ) : null}
      </HojaModal>
    </div>
  );
}
