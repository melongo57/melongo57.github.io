import { useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { calcularTramos, precioUnitario } from '@/dominio/consumo.ts';
import { formatearEuros } from '@/dominio/dinero.ts';
import { formatearFecha } from '@/dominio/fechas.ts';
import {
  formatearCantidad,
  formatearConsumo,
  formatearKm,
  formatearPrecioUnitario,
} from '@/dominio/formato.ts';
import type { Repostaje } from '@/dominio/tipos.ts';
import { Boton, EnlaceBoton } from '../componentes/Boton.tsx';
import { FormularioRepostaje } from '../componentes/FormularioRepostaje.tsx';
import { HojaModal } from '../componentes/HojaModal.tsx';
import {
  useEstacionesFrecuentes,
  usePuntosOdometro,
  useRepostajes,
  useVehiculo,
} from '../ganchos/consultas.ts';
import './Repostajes.css';

type Edicion = { modo: 'cerrado' } | { modo: 'nuevo' } | { modo: 'editar'; registro: Repostaje };

export function Repostajes(): React.JSX.Element {
  const { id } = useParams<{ id: string }>();
  const vehiculo = useVehiculo(id);
  const repostajes = useRepostajes(id);
  const puntos = usePuntosOdometro(id);
  const estaciones = useEstacionesFrecuentes(id);

  const [edicion, setEdicion] = useState<Edicion>({ modo: 'cerrado' });

  /**
   * El consumo se atribuye al repostaje que CIERRA el tramo, que es el que lo
   * hace medible. Así, al mirar la lista, cada fila enseña el consumo del
   * trayecto que acaba de terminar.
   */
  const consumoPorRepostaje = useMemo(() => {
    const mapa = new Map<string, number>();
    if (!repostajes) return mapa;
    for (const unidad of ['l', 'kWh'] as const) {
      const { tramos } = calcularTramos(repostajes.filter((r) => r.unidad === unidad));
      for (const tramo of tramos) mapa.set(tramo.hastaId, tramo.consumo);
    }
    return mapa;
  }, [repostajes]);

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

  const total = (repostajes ?? []).reduce((t, r) => t + r.importeCentimos, 0);

  return (
    <div className="contenedor repostajes">
      <header className="repostajes__cabecera">
        <div>
          <h1>Repostajes</h1>
          <p className="repostajes__sub">{vehiculo?.alias ?? ''}</p>
        </div>
        <Boton variante="principal" icono="＋" alPulsar={() => setEdicion({ modo: 'nuevo' })}>
          Repostar
        </Boton>
      </header>

      {repostajes === undefined ? (
        <p className="cargando">Cargando…</p>
      ) : repostajes.length === 0 ? (
        <div className="vacio">
          <p className="vacio__icono" aria-hidden="true">
            ⛽
          </p>
          <h2>Todavía no hay ningún repostaje</h2>
          <p>
            Con dos repostajes llenos seguidos la app ya puede calcular tu consumo real, el
            que sale de dividir lo que echas entre lo que andas.
          </p>
          <Boton variante="principal" icono="＋" alPulsar={() => setEdicion({ modo: 'nuevo' })}>
            Registrar el primero
          </Boton>
        </div>
      ) : (
        <>
          <p className="repostajes__total">
            {repostajes.length} {repostajes.length === 1 ? 'repostaje' : 'repostajes'} ·{' '}
            <strong className="numero">{formatearEuros(total)}</strong> en total
          </p>

          <ul className="repostajes__lista">
            {repostajes.map((r) => {
              const precio = precioUnitario(r);
              const consumo = consumoPorRepostaje.get(r.id);
              return (
                <li key={r.id}>
                  <button
                    type="button"
                    className={`rep-fila${r.depositoLleno ? '' : ' es-parcial'}`}
                    onClick={() => setEdicion({ modo: 'editar', registro: r })}
                  >
                    <span className="rep-fila__cuerpo">
                      <span className="rep-fila__linea">
                        <span className="rep-fila__cantidad numero">
                          {formatearCantidad(r.cantidad, r.unidad)}
                        </span>
                        {!r.depositoLleno ? (
                          <span className="rep-fila__marca">parcial</span>
                        ) : null}
                        {r.rupturaSerie ? (
                          <span className="rep-fila__marca es-ruptura">serie rota</span>
                        ) : null}
                      </span>

                      <span className="rep-fila__meta numero">
                        {formatearFecha(r.fecha)}
                        {r.km !== undefined ? ` · ${formatearKm(r.km)}` : ''}
                        {precio !== null ? ` · ${formatearPrecioUnitario(precio, r.unidad)}` : ''}
                      </span>

                      {r.estacion ? (
                        <span className="rep-fila__estacion">{r.estacion}</span>
                      ) : null}
                    </span>

                    <span className="rep-fila__derecha">
                      <span className="rep-fila__importe numero">
                        {formatearEuros(r.importeCentimos)}
                      </span>
                      {consumo !== undefined ? (
                        <span className="rep-fila__consumo numero">
                          {formatearConsumo(consumo, r.unidad)}
                        </span>
                      ) : null}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </>
      )}

      <HojaModal
        abierta={edicion.modo !== 'cerrado'}
        titulo={edicion.modo === 'editar' ? 'Editar repostaje' : 'Nuevo repostaje'}
        alCerrar={() => setEdicion({ modo: 'cerrado' })}
      >
        {vehiculo && puntos && edicion.modo !== 'cerrado' ? (
          <FormularioRepostaje
            key={edicion.modo === 'editar' ? edicion.registro.id : 'nuevo'}
            vehiculo={vehiculo}
            puntos={puntos}
            estacionesFrecuentes={estaciones ?? []}
            {...(edicion.modo === 'editar' ? { repostaje: edicion.registro } : {})}
            alTerminar={() => setEdicion({ modo: 'cerrado' })}
          />
        ) : null}
      </HojaModal>
    </div>
  );
}
