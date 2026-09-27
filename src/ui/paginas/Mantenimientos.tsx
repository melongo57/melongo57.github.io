import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { formatearEuros } from '@/dominio/dinero.ts';
import { formatearFecha } from '@/dominio/fechas.ts';
import { formatearKm } from '@/dominio/formato.ts';
import type { Mantenimiento } from '@/dominio/tipos.ts';
import { Boton, EnlaceBoton } from '../componentes/Boton.tsx';
import { FormularioMantenimiento } from '../componentes/FormularioMantenimiento.tsx';
import { HojaModal } from '../componentes/HojaModal.tsx';
import { useAlertas, useMantenimientos, usePuntosOdometro, useVehiculo } from '../ganchos/consultas.ts';
import './Mantenimientos.css';

/** Ni editando ni creando; editando uno concreto; o creando uno nuevo. */
type Edicion = { modo: 'cerrado' } | { modo: 'nuevo' } | { modo: 'editar'; registro: Mantenimiento };

export function Mantenimientos(): React.JSX.Element {
  const { id } = useParams<{ id: string }>();
  const vehiculo = useVehiculo(id);
  const mantenimientos = useMantenimientos(id);
  const puntos = usePuntosOdometro(id);
  const alertas = useAlertas(id);
  const nombreAlerta = new Map((alertas ?? []).map((a) => [a.id, a]));

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

  const totalGastado = (mantenimientos ?? []).reduce((t, m) => t + m.costeCentimos, 0);

  return (
    <div className="contenedor mantenimientos">
      <header className="mantenimientos__cabecera">
        <div>
          <h1>Servicios</h1>
          <p className="mantenimientos__sub">{vehiculo?.alias ?? ''}</p>
        </div>
        <Boton variante="principal" icono="＋" alPulsar={() => setEdicion({ modo: 'nuevo' })}>
          Registrar
        </Boton>
      </header>

      {mantenimientos === undefined ? (
        <p className="cargando">Cargando…</p>
      ) : mantenimientos.length === 0 ? (
        <div className="vacio">
          <p className="vacio__icono" aria-hidden="true">
            🔧
          </p>
          <h2>Todavía no hay ningún servicio</h2>
          <p>
            Aquí queda el histórico de lo que se le ha hecho al vehículo. Lo más rápido es
            marcar una alerta como hecha desde la ficha: se apunta aquí sola.
          </p>
          <Boton variante="principal" icono="＋" alPulsar={() => setEdicion({ modo: 'nuevo' })}>
            Registrar el primero
          </Boton>
        </div>
      ) : (
        <>
          <p className="mantenimientos__total">
            {mantenimientos.length}{' '}
            {mantenimientos.length === 1 ? 'registro' : 'registros'} ·{' '}
            <strong className="numero">{formatearEuros(totalGastado)}</strong> en total
          </p>

          <ul className="mantenimientos__lista">
            {mantenimientos.map((m) => (
              <li key={m.id}>
                <button
                  type="button"
                  className="mant-fila"
                  onClick={() => setEdicion({ modo: 'editar', registro: m })}
                >
                  <span className="mant-fila__icono" aria-hidden="true">
                    {nombreAlerta.get(m.alertaIds[0] ?? '')?.icono ?? '🔧'}
                  </span>

                  <span className="mant-fila__cuerpo">
                    <span className="mant-fila__titulo">{m.titulo || 'Servicio'}</span>
                    <span className="mant-fila__meta numero">
                      {formatearFecha(m.fecha)}
                      {m.km !== undefined ? ` · ${formatearKm(m.km)}` : ''}
                    </span>
                    {m.taller ? <span className="mant-fila__taller">{m.taller}</span> : null}
                    {m.notas ? <span className="mant-fila__notas">{m.notas}</span> : null}
                  </span>

                  <span className="mant-fila__coste numero">
                    {formatearEuros(m.costeCentimos)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </>
      )}

      <HojaModal
        abierta={edicion.modo !== 'cerrado'}
        titulo={edicion.modo === 'editar' ? 'Editar servicio' : 'Nuevo servicio'}
        alCerrar={() => setEdicion({ modo: 'cerrado' })}
      >
        {vehiculo && puntos && edicion.modo !== 'cerrado' ? (
          <FormularioMantenimiento
            key={edicion.modo === 'editar' ? edicion.registro.id : 'nuevo'}
            vehiculo={vehiculo}
            puntos={puntos}
            {...(edicion.modo === 'editar' ? { mantenimiento: edicion.registro } : {})}
            alTerminar={() => setEdicion({ modo: 'cerrado' })}
          />
        ) : null}
      </HojaModal>
    </div>
  );
}
