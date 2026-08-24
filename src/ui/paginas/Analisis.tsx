import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { detectarAnomalias } from '@/dominio/anomalias.ts';
import { formatearEuros } from '@/dominio/dinero.ts';
import { formatearFecha } from '@/dominio/fechas.ts';
import { formatearConsumo, formatearCostePorKm, formatearKm } from '@/dominio/formato.ts';
import { EnlaceBoton } from '../componentes/Boton.tsx';
import {
  GraficaCategorias,
  GraficaConsumo,
  GraficaGastoMensual,
} from '../componentes/Graficas.tsx';
import { useAnalisis, useComparativa, useVehiculo } from '../ganchos/consultas.ts';
import './Analisis.css';

/**
 * Analíticas de un vehículo.
 *
 * Cada bloque solo aparece si tiene datos que enseñar. Una gráfica vacía con
 * los ejes pintados hace pensar que algo se ha roto; decir «faltan repostajes
 * para esto» explica qué falta y cómo arreglarlo.
 */
export function Analisis(): React.JSX.Element {
  const { id } = useParams<{ id: string }>();
  const vehiculo = useVehiculo(id);
  const analisis = useAnalisis(id);
  const comparativa = useComparativa();
  const [unidadActiva, setUnidadActiva] = useState(0);

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

  if (!analisis) {
    return (
      <div className="contenedor">
        <p className="cargando">Cargando…</p>
      </div>
    );
  }

  const consumo = analisis.consumos[unidadActiva] ?? analisis.consumos[0];
  const anomalias = consumo ? detectarAnomalias(consumo.tramos) : [];
  const hayGasto = analisis.porMes.some((m) => m.totalCentimos > 0);

  return (
    <div className="contenedor analisis">
      <header className="analisis__cabecera">
        <div>
          <h1>Análisis</h1>
          <p className="analisis__sub">{vehiculo?.alias ?? ''}</p>
        </div>
      </header>

      {/* ---------------------------------------------------------------- */}
      {anomalias.length > 0 ? (
        <section className="analisis__anomalias">
          {anomalias.map((a) => (
            <div key={a.tipo} className={`anomalia es-${a.gravedad}`}>
              <span className="anomalia__icono" aria-hidden="true">
                {a.gravedad === 'alerta' ? '⚠' : 'ℹ'}
              </span>
              <div>
                <p className="anomalia__titulo">
                  {a.tipo === 'subida_sostenida'
                    ? 'El consumo ha subido'
                    : 'Un tramo se sale de lo normal'}
                </p>
                <p className="anomalia__texto">{a.mensaje}</p>
                <p className="anomalia__desde numero">Desde el {formatearFecha(a.desde)}</p>
              </div>
            </div>
          ))}
        </section>
      ) : null}

      {/* ---------------------------------------------------------------- */}
      <section className="bloque">
        <h2 className="bloque__titulo">Resumen</h2>
        <div className="analisis__cifras">
          <div className="dato">
            <span className="dato__etiqueta">Coste por km</span>
            <span className="dato__valor numero">
              {analisis.costeReciente.centimosPorKm !== null
                ? formatearCostePorKm(analisis.costeReciente.centimosPorKm / 100)
                : '—'}
            </span>
            <span className="dato__apunte">últimos 12 meses</span>
          </div>
          <div className="dato">
            <span className="dato__etiqueta">Gastado</span>
            <span className="dato__valor numero">
              {formatearEuros(analisis.costeHistorico.totalCentimos)}
            </span>
            <span className="dato__apunte">
              {analisis.costeHistorico.registros} registros
            </span>
          </div>
          <div className="dato">
            <span className="dato__etiqueta">Al mes</span>
            <span className="dato__valor numero">
              {analisis.propiedad.centimosPorMes !== null
                ? formatearEuros(Math.round(analisis.propiedad.centimosPorMes))
                : '—'}
            </span>
            <span className="dato__apunte">
              {analisis.propiedad.faltaPrecioCompra ? 'sin la compra' : 'con la compra'}
            </span>
          </div>
          <div className="dato">
            <span className="dato__etiqueta">Recorridos</span>
            <span className="dato__valor numero">
              {formatearKm(analisis.propiedad.kmRecorridos)}
            </span>
            <span className="dato__apunte">desde que es tuyo</span>
          </div>
        </div>
      </section>

      {/* ---------------------------------------------------------------- */}
      <section className="bloque">
        <div className="bloque__cabecera">
          <h2 className="bloque__titulo">Consumo real</h2>
          {analisis.consumos.length > 1 ? (
            <div className="analisis__pestanas">
              {analisis.consumos.map((c, i) => (
                <button
                  key={c.unidad}
                  type="button"
                  className={`analisis__pestana${i === unidadActiva ? ' es-activa' : ''}`}
                  onClick={() => setUnidadActiva(i)}
                >
                  {c.unidad === 'kWh' ? 'Eléctrico' : 'Combustible'}
                </button>
              ))}
            </div>
          ) : null}
        </div>

        {consumo && consumo.tramos.length >= 2 ? (
          <>
            <GraficaConsumo
              tramos={consumo.tramos}
              unidad={consumo.unidad}
              media={consumo.consumoMedio}
            />
            <p className="analisis__pie">
              {consumo.tramos.length} tramos de lleno a lleno · media{' '}
              <strong className="numero">
                {formatearConsumo(consumo.consumoMedio ?? 0, consumo.unidad)}
              </strong>
              {consumo.consumoReciente !== null ? (
                <>
                  {' '}
                  · reciente{' '}
                  <strong className="numero">
                    {formatearConsumo(consumo.consumoReciente, consumo.unidad)}
                  </strong>
                </>
              ) : null}
            </p>
          </>
        ) : (
          <p className="analisis__sin-datos">
            Hacen falta al menos tres repostajes con el depósito lleno para dibujar la curva.
            El consumo se mide de lleno a lleno.
          </p>
        )}
      </section>

      {/* ---------------------------------------------------------------- */}
      <section className="bloque">
        <h2 className="bloque__titulo">Gasto por mes</h2>
        {hayGasto ? (
          <GraficaGastoMensual datos={analisis.porMes} />
        ) : (
          <p className="analisis__sin-datos">Todavía no hay gasto registrado.</p>
        )}
      </section>

      {/* ---------------------------------------------------------------- */}
      <section className="bloque">
        <h2 className="bloque__titulo">En qué se va</h2>
        {analisis.porCategoria.length > 0 ? (
          <GraficaCategorias datos={analisis.porCategoria} />
        ) : (
          <p className="analisis__sin-datos">Todavía no hay gasto registrado.</p>
        )}
      </section>

      {/* ---------------------------------------------------------------- */}
      {comparativa && comparativa.length > 1 ? (
        <section className="bloque">
          <h2 className="bloque__titulo">Comparativa</h2>
          <div className="tabla-envoltorio">
            <table className="comparativa">
              <thead>
                <tr>
                  <th>Vehículo</th>
                  <th>Consumo</th>
                  <th>€/km</th>
                  <th>km/año</th>
                </tr>
              </thead>
              <tbody>
                {comparativa.map((f) => (
                  <tr key={f.vehiculoId} className={f.vehiculoId === id ? 'es-actual' : ''}>
                    <td>
                      <Link to={`/vehiculos/${f.vehiculoId}/analisis`}>{f.alias}</Link>
                    </td>
                    <td className="numero">
                      {f.consumoMedio !== null
                        ? formatearConsumo(f.consumoMedio, f.unidad)
                        : '—'}
                    </td>
                    <td className="numero">
                      {f.centimosPorKm !== null
                        ? formatearCostePorKm(f.centimosPorKm / 100)
                        : '—'}
                    </td>
                    <td className="numero">{f.kmAlAnio > 0 ? formatearKm(f.kmAlAnio) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="analisis__pie">
            Ordenados de más barato a más caro por kilómetro. Los vehículos sin datos van al
            final: de uno del que no sabes nada no se puede decir que sea el más barato.
          </p>
        </section>
      ) : null}
    </div>
  );
}
