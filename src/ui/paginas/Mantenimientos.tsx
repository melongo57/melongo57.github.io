import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { nombreMantenimiento, TIPOS_MANTENIMIENTO } from '@/dominio/catalogos.ts';
import { formatearEuros } from '@/dominio/dinero.ts';
import { formatearFecha } from '@/dominio/fechas.ts';
import { formatearKm, unirEnEspanol } from '@/dominio/formato.ts';
import type { Mantenimiento } from '@/dominio/tipos.ts';
import { Boton, EnlaceBoton } from '../componentes/Boton.tsx';
import { FormularioMantenimiento } from '../componentes/FormularioMantenimiento.tsx';
import { HojaModal } from '../componentes/HojaModal.tsx';
import { useMantenimientos, usePuntosOdometro, useVehiculo } from '../ganchos/consultas.ts';
import './Mantenimientos.css';

/** Ni editando ni creando; editando uno concreto; o creando uno nuevo. */
type Edicion = { modo: 'cerrado' } | { modo: 'nuevo' } | { modo: 'editar'; registro: Mantenimiento };

export function Mantenimientos(): React.JSX.Element {
  const { id } = useParams<{ id: string }>();
  const vehiculo = useVehiculo(id);
  const mantenimientos = useMantenimientos(id);
  const puntos = usePuntosOdometro(id);

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
          <h1>Mantenimientos</h1>
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
          <h2>Todavía no hay ningún mantenimiento</h2>
          <p>
            Registra el último de cada tipo y la app empezará a calcular cuándo vuelve a
            tocar. Mientras no lo hagas, esas revisiones aparecen como «sin registrar».
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
                    {TIPOS_MANTENIMIENTO[m.tipo].icono}
                  </span>

                  <span className="mant-fila__cuerpo">
                    <span className="mant-fila__titulo">
                      {nombreMantenimiento(m.tipo, m.tipoPersonalizado)}
                    </span>
                    <span className="mant-fila__meta numero">
                      {formatearFecha(m.fecha)}
                      {m.km !== undefined ? ` · ${formatearKm(m.km)}` : ''}
                    </span>
                    {m.taller ? <span className="mant-fila__taller">{m.taller}</span> : null}
                    {m.piezas.length > 0 ? (
                      <span className="mant-fila__piezas">{unirEnEspanol(m.piezas)}</span>
                    ) : null}
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
        titulo={edicion.modo === 'editar' ? 'Editar mantenimiento' : 'Nuevo mantenimiento'}
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
