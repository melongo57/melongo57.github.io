import { Link } from 'react-router-dom';
import { CATEGORIAS_VEHICULO, COMBUSTIBLES } from '@/dominio/catalogos.ts';
import { formatearFecha } from '@/dominio/fechas.ts';
import type { Vehiculo } from '@/dominio/tipos.ts';
import { EnlaceBoton } from '../componentes/Boton.tsx';
import { FotoVehiculo } from '../componentes/FotoVehiculo.tsx';
import { useVehiculos } from '../ganchos/consultas.ts';
import './ListaVehiculos.css';

function Fila({ vehiculo: v }: { vehiculo: Vehiculo }): React.JSX.Element {
  const vendido = v.estado === 'vendido';
  return (
    <li>
      <Link to={`/vehiculos/${v.id}`} className={`fila-vehiculo${vendido ? ' es-vendido' : ''}`}>
        <div className="fila-vehiculo__foto">
          <FotoVehiculo vehiculo={v} />
        </div>
        <div className="fila-vehiculo__texto">
          <h2>{v.alias}</h2>
          <p>
            {v.marca} {v.modelo}
            {v.version ? ` · ${v.version}` : ''}
          </p>
          <p className="fila-vehiculo__meta">
            <span className="numero">{v.matricula}</span>
            {' · '}
            {CATEGORIAS_VEHICULO[v.categoria].nombre}
            {' · '}
            {COMBUSTIBLES[v.combustible].nombre}
          </p>
        </div>
        {vendido ? (
          <span className="fila-vehiculo__estado">
            Vendido
            {v.fechaVenta ? (
              <span className="numero"> {formatearFecha(v.fechaVenta)}</span>
            ) : null}
          </span>
        ) : null}
      </Link>
    </li>
  );
}

export function ListaVehiculos(): React.JSX.Element {
  const vehiculos = useVehiculos();

  const activos = vehiculos?.filter((v) => v.estado === 'activo') ?? [];
  const vendidos = vehiculos?.filter((v) => v.estado === 'vendido') ?? [];

  return (
    <div className="contenedor lista-vehiculos">
      <header className="lista-vehiculos__cabecera">
        <h1>Vehículos</h1>
        <EnlaceBoton a="/vehiculos/nuevo" variante="principal" icono="＋">
          Añadir
        </EnlaceBoton>
      </header>

      {vehiculos === undefined ? (
        <p className="cargando">Cargando…</p>
      ) : vehiculos.length === 0 ? (
        <div className="vacio">
          <p className="vacio__icono" aria-hidden="true">
            🚗
          </p>
          <h2>Todavía no hay ningún vehículo</h2>
          <p>Empieza dando de alta el primero.</p>
          <EnlaceBoton a="/vehiculos/nuevo" variante="principal" icono="＋">
            Añadir vehículo
          </EnlaceBoton>
        </div>
      ) : (
        <>
          <ul className="lista-vehiculos__lista">
            {activos.map((v) => (
              <Fila key={v.id} vehiculo={v} />
            ))}
          </ul>

          {vendidos.length > 0 ? (
            <section className="lista-vehiculos__vendidos">
              <h2>Vendidos</h2>
              <p className="lista-vehiculos__nota">
                Su histórico se conserva y sigue contando en las analíticas de años anteriores.
              </p>
              <ul className="lista-vehiculos__lista">
                {vendidos.map((v) => (
                  <Fila key={v.id} vehiculo={v} />
                ))}
              </ul>
            </section>
          ) : null}
        </>
      )}
    </div>
  );
}
