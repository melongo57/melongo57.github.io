import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { CATEGORIAS_GASTO, PERIODICIDADES } from '@/dominio/catalogos.ts';
import { formatearEuros } from '@/dominio/dinero.ts';
import { formatearFecha } from '@/dominio/fechas.ts';
import { formatearKm } from '@/dominio/formato.ts';
import type { Gasto } from '@/dominio/tipos.ts';
import { Boton, EnlaceBoton } from '../componentes/Boton.tsx';
import { FormularioGasto } from '../componentes/FormularioGasto.tsx';
import { HojaModal } from '../componentes/HojaModal.tsx';
import { useGastos, useVehiculo } from '../ganchos/consultas.ts';
import './Repostajes.css';

type Edicion = { modo: 'cerrado' } | { modo: 'nuevo' } | { modo: 'editar'; registro: Gasto };

export function Gastos(): React.JSX.Element {
  const { id } = useParams<{ id: string }>();
  const vehiculo = useVehiculo(id);
  const gastos = useGastos(id);
  const [edicion, setEdicion] = useState<Edicion>({ modo: 'cerrado' });

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

  const total = (gastos ?? []).reduce((t, g) => t + g.importeCentimos, 0);

  return (
    <div className="contenedor gastos">
      <header className="gastos__cabecera">
        <div>
          <h1>Gastos</h1>
          <p className="gastos__sub">{vehiculo?.alias ?? ''}</p>
        </div>
        <Boton variante="principal" icono="＋" alPulsar={() => setEdicion({ modo: 'nuevo' })}>
          Añadir
        </Boton>
      </header>

      {gastos === undefined ? (
        <p className="cargando">Cargando…</p>
      ) : gastos.length === 0 ? (
        <div className="vacio">
          <p className="vacio__icono" aria-hidden="true">
            💶
          </p>
          <h2>Todavía no hay ningún gasto</h2>
          <p>
            El seguro, el impuesto de circulación, el parking, los peajes. Todo lo que cuesta
            tener el coche y no es ni combustible ni taller.
          </p>
          <Boton variante="principal" icono="＋" alPulsar={() => setEdicion({ modo: 'nuevo' })}>
            Añadir el primero
          </Boton>
        </div>
      ) : (
        <>
          <p className="gastos__total">
            {gastos.length} {gastos.length === 1 ? 'gasto' : 'gastos'} ·{' '}
            <strong className="numero">{formatearEuros(total)}</strong> en total
          </p>

          <ul className="gastos__lista">
            {gastos.map((g) => (
              <li key={g.id}>
                <button
                  type="button"
                  className="rep-fila"
                  onClick={() => setEdicion({ modo: 'editar', registro: g })}
                >
                  <span className="rep-fila__cuerpo">
                    <span className="rep-fila__linea">
                      <span aria-hidden="true">{CATEGORIAS_GASTO[g.categoria].icono}</span>
                      <span className="rep-fila__cantidad">
                        {g.descripcion?.trim() || CATEGORIAS_GASTO[g.categoria].nombre}
                      </span>
                      {g.recurrente ? (
                        <span className="rep-fila__marca">
                          {g.periodicidad ? PERIODICIDADES[g.periodicidad].nombre : 'recurrente'}
                        </span>
                      ) : null}
                    </span>

                    <span className="rep-fila__meta numero">
                      {formatearFecha(g.fecha)}
                      {g.descripcion?.trim()
                        ? ` · ${CATEGORIAS_GASTO[g.categoria].nombre}`
                        : ''}
                      {g.km !== undefined ? ` · ${formatearKm(g.km)}` : ''}
                    </span>

                    {g.notas ? <span className="rep-fila__estacion">{g.notas}</span> : null}
                  </span>

                  <span className="rep-fila__derecha">
                    <span className="rep-fila__importe numero">
                      {formatearEuros(g.importeCentimos)}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </>
      )}

      <HojaModal
        abierta={edicion.modo !== 'cerrado'}
        titulo={edicion.modo === 'editar' ? 'Editar gasto' : 'Nuevo gasto'}
        alCerrar={() => setEdicion({ modo: 'cerrado' })}
      >
        {vehiculo && edicion.modo !== 'cerrado' ? (
          <FormularioGasto
            key={edicion.modo === 'editar' ? edicion.registro.id : 'nuevo'}
            vehiculo={vehiculo}
            {...(edicion.modo === 'editar' ? { gasto: edicion.registro } : {})}
            alTerminar={() => setEdicion({ modo: 'cerrado' })}
          />
        ) : null}
      </HojaModal>
    </div>
  );
}
