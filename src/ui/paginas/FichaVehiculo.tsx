import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { borrarLectura } from '@/datos/acciones.ts';
import { repo } from '@/datos/repositorioDexie.ts';
import { CATEGORIAS_VEHICULO, COMBUSTIBLES } from '@/dominio/catalogos.ts';
import { formatearEuros } from '@/dominio/dinero.ts';
import { formatearDistancia, formatearFecha } from '@/dominio/fechas.ts';
import { formatearConsumo, formatearCostePorKm, formatearKm } from '@/dominio/formato.ts';
import { esEstimacion } from '@/dominio/odometro.ts';
import type { OrigenLectura } from '@/dominio/tipos.ts';
import { Boton, EnlaceBoton } from '../componentes/Boton.tsx';
import { FormularioLectura } from '../componentes/FormularioLectura.tsx';
import { FotoVehiculo } from '../componentes/FotoVehiculo.tsx';
import { HojaModal } from '../componentes/HojaModal.tsx';
import { GestorAlertas } from '../componentes/GestorAlertas.tsx';
import { useAnalisis, useDetalleVehiculo, useLecturas } from '../ganchos/consultas.ts';
import './FichaVehiculo.css';

const ETIQUETA_ORIGEN: Record<OrigenLectura, string> = {
  manual: 'Lectura manual',
  alta_vehiculo: 'Al dar de alta',
  venta: 'Al vender',
  repostaje: 'Repostaje',
  mantenimiento: 'Mantenimiento',
  gasto: 'Gasto',
};

export function FichaVehiculo(): React.JSX.Element {
  const { id } = useParams<{ id: string }>();
  const navegar = useNavigate();
  const detalle = useDetalleVehiculo(id);
  const lecturas = useLecturas(id);
  const analisis = useAnalisis(id);

  const [registrando, setRegistrando] = useState(false);
  const [confirmandoBorrado, setConfirmandoBorrado] = useState(false);
  const [borrando, setBorrando] = useState(false);

  if (detalle === undefined) {
    return (
      <div className="contenedor">
        <p className="cargando">Cargando…</p>
      </div>
    );
  }

  if (detalle === null) {
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

  const { vehiculo: v, estimacion, kmAlAnio, totales, puntos, alertas, vencimientos } = detalle;
  const vendido = v.estado === 'vendido';
  const estimado = esEstimacion(estimacion);

  async function eliminar(): Promise<void> {
    if (!id) return;
    setBorrando(true);
    await repo.eliminarVehiculo(id);
    navegar('/vehiculos', { replace: true });
  }

  return (
    <div className="contenedor ficha">
      <header className="ficha__cabecera">
        <FotoVehiculo vehiculo={v} />
        <div className="ficha__identidad">
          <div className="ficha__nombre">
            <h1>{v.alias}</h1>
            {vendido ? <span className="chip chip--tenue">Vendido</span> : null}
          </div>
          <p className="ficha__modelo">
            {v.marca} {v.modelo}
            {v.version ? ` · ${v.version}` : ''}
          </p>
          <p className="ficha__matricula numero">{v.matricula}</p>
        </div>
      </header>

      {vendido ? (
        <p className="ficha__congelado">
          Vendido el {v.fechaVenta ? formatearFecha(v.fechaVenta) : '—'}. Su histórico se
          conserva, pero no genera avisos ni cuenta en el gasto corriente.
        </p>
      ) : null}

      <section className="ficha__destacado">
        <span className="ficha__km numero">
          {estimacion.confianza === 'sin_datos' ? '—' : formatearKm(estimacion.km)}
        </span>
        <span className={`ficha__matiz${estimado ? ' es-estimado' : ''}`}>
          {estimacion.confianza === 'sin_datos'
            ? 'Sin lecturas registradas'
            : vendido
              ? 'Kilómetros a la entrega'
              : estimacion.diasDesdeLectura === 0
                ? 'Lectura de hoy'
                : estimado
                  ? `Estimado · última lectura ${formatearDistancia(-estimacion.diasDesdeLectura)}`
                  : `Última lectura ${formatearDistancia(-estimacion.diasDesdeLectura)}`}
        </span>

        {!vendido ? (
          <Boton variante="principal" icono="＋" alPulsar={() => setRegistrando(true)}>
            Anotar kilómetros
          </Boton>
        ) : null}
      </section>

      <GestorAlertas
        vehiculo={v}
        alertas={alertas}
        vencimientos={vencimientos}
        {...(estimacion.confianza !== 'sin_datos' ? { kmEstimado: estimacion.km } : {})}
      />

      <section className="ficha__resumen">
        <div className="dato">
          <span className="dato__etiqueta">Categoría</span>
          <span className="dato__valor">
            <span aria-hidden="true">{CATEGORIAS_VEHICULO[v.categoria].icono} </span>
            {CATEGORIAS_VEHICULO[v.categoria].nombre}
          </span>
        </div>
        <div className="dato">
          <span className="dato__etiqueta">Combustible</span>
          <span className="dato__valor">
            <span aria-hidden="true">{COMBUSTIBLES[v.combustible].icono} </span>
            {COMBUSTIBLES[v.combustible].nombre}
          </span>
        </div>
        <div className="dato">
          <span className="dato__etiqueta">Año</span>
          <span className="dato__valor numero">{v.anio}</span>
        </div>
        <div className="dato">
          <span className="dato__etiqueta">Ritmo</span>
          <span className="dato__valor numero">
            {kmAlAnio > 0 ? `${formatearKm(kmAlAnio)}/año` : '—'}
          </span>
        </div>
        {v.fechaCompra ? (
          <div className="dato">
            <span className="dato__etiqueta">Comprado</span>
            <span className="dato__valor numero">{formatearFecha(v.fechaCompra)}</span>
          </div>
        ) : null}
        {v.precioCompraCentimos !== undefined ? (
          <div className="dato">
            <span className="dato__etiqueta">Precio de compra</span>
            <span className="dato__valor numero">
              {formatearEuros(v.precioCompraCentimos)}
            </span>
          </div>
        ) : null}
        {v.bastidor ? (
          <div className="dato dato--ancho">
            <span className="dato__etiqueta">Bastidor</span>
            <span className="dato__valor numero">{v.bastidor}</span>
          </div>
        ) : null}
      </section>

      {v.notas ? (
        <section className="ficha__notas">
          <h2>Notas</h2>
          <p>{v.notas}</p>
        </section>
      ) : null}

      <section className="ficha__totales">
        <h2>Registrado hasta ahora</h2>
        <div className="ficha__totales-rejilla">
          <Link to={`/vehiculos/${v.id}/repostajes`} className="total total--enlace">
            <span className="total__valor numero">{totales.repostajes}</span>
            <span className="total__etiqueta">repostajes</span>
          </Link>
          <Link to={`/vehiculos/${v.id}/mantenimientos`} className="total total--enlace">
            <span className="total__valor numero">{totales.mantenimientos}</span>
            <span className="total__etiqueta">mantenimientos</span>
          </Link>
          <Link to={`/vehiculos/${v.id}/gastos`} className="total total--enlace">
            <span className="total__valor numero">{totales.gastos}</span>
            <span className="total__etiqueta">gastos</span>
          </Link>
          <Link to={`/vehiculos/${v.id}/documentos`} className="total total--enlace">
            <span className="total__valor numero">{totales.documentos}</span>
            <span className="total__etiqueta">documentos</span>
          </Link>
        </div>
        <p className="ficha__gastado">
          Gasto acumulado{' '}
          <strong className="numero">{formatearEuros(totales.gastadoCentimos)}</strong>
        </p>
      </section>

      {analisis &&
      (analisis.costeReciente.centimosPorKm !== null ||
        analisis.consumos.some((c) => c.consumoMedio !== null)) ? (
        <section className="ficha__analisis">
          <div className="ficha__vencimientos-cabecera">
            <h2>Lo que cuesta</h2>
            <EnlaceBoton a={`/vehiculos/${v.id}/analisis`} variante="sutil">
              Ver análisis
            </EnlaceBoton>
          </div>

          <div className="ficha__analisis-rejilla">
            {analisis.consumos
              .filter((c) => c.consumoMedio !== null)
              .map((c) => (
                <div className="dato" key={c.unidad}>
                  <span className="dato__etiqueta">
                    Consumo {c.unidad === 'kWh' ? 'eléctrico' : 'medio'}
                  </span>
                  <span className="dato__valor numero">
                    {formatearConsumo(c.consumoMedio!, c.unidad)}
                  </span>
                  <span className="dato__apunte">
                    {c.tramos.length} {c.tramos.length === 1 ? 'tramo' : 'tramos'} de lleno a
                    lleno
                  </span>
                </div>
              ))}

            {analisis.costeReciente.centimosPorKm !== null ? (
              <div className="dato">
                <span className="dato__etiqueta">Coste por km</span>
                <span className="dato__valor numero">
                  {formatearCostePorKm(analisis.costeReciente.centimosPorKm / 100)}
                </span>
                <span className="dato__apunte">últimos 12 meses</span>
              </div>
            ) : null}

            {analisis.propiedad.centimosPorKm !== null &&
            !analisis.propiedad.faltaPrecioCompra ? (
              <div className="dato">
                <span className="dato__etiqueta">Con la compra incluida</span>
                <span className="dato__valor numero">
                  {formatearCostePorKm(analisis.propiedad.centimosPorKm / 100)}
                </span>
                <span className="dato__apunte">coste total de propiedad</span>
              </div>
            ) : null}

            <div className="dato">
              <span className="dato__etiqueta">Al mes</span>
              <span className="dato__valor numero">
                {analisis.propiedad.centimosPorMes !== null
                  ? formatearEuros(Math.round(analisis.propiedad.centimosPorMes))
                  : '—'}
              </span>
              <span className="dato__apunte">
                {analisis.propiedad.faltaPrecioCompra ? 'sin el precio de compra' : 'de media'}
              </span>
            </div>
          </div>

          {analisis.propiedad.faltaPrecioCompra ? (
            <p className="ficha__aviso-datos">
              Falta el precio de compra, así que el coste total de propiedad está incompleto.
              Puedes añadirlo desde «Editar ficha».
            </p>
          ) : null}

          {analisis.propiedad.registrosIncompletos ? (
            <p className="ficha__aviso-datos">
              Los registros empiezan el {formatearFecha(analisis.propiedad.cubreDesde)}, pero
              el vehículo es tuyo desde antes. El coste con la compra incluida se reparte
              entre todos esos kilómetros, así que sale <strong>más bajo de lo real</strong>:
              tómalo como un mínimo.
            </p>
          ) : null}
        </section>
      ) : null}

      {/* ------------------------------------------------------------------ */}
      <section className="ficha__historico">
        <h2>Histórico de kilómetros</h2>
        {puntos.length === 0 ? (
          <p className="ficha__sin-datos">
            Todavía no hay lecturas. Anota los kilómetros actuales para empezar.
          </p>
        ) : (
          <ol className="linea-km">
            {[...puntos].reverse().map((punto) => {
              const esManual = punto.origen === 'manual';
              const lectura = lecturas?.find((l) => l.id === punto.refId);
              return (
                <li key={`${punto.refId}-${punto.fecha}`} className="linea-km__punto">
                  <div className="linea-km__marca" aria-hidden="true" />
                  <div className="linea-km__cuerpo">
                    <span className="linea-km__km numero">{formatearKm(punto.km)}</span>
                    <span className="linea-km__meta">
                      <span className="numero">{formatearFecha(punto.fecha)}</span>
                      {' · '}
                      {ETIQUETA_ORIGEN[punto.origen]}
                    </span>
                    {lectura?.notas ? (
                      <span className="linea-km__notas">{lectura.notas}</span>
                    ) : null}
                  </div>
                  {esManual ? (
                    <button
                      type="button"
                      className="linea-km__borrar"
                      onClick={() => void borrarLectura(punto.refId)}
                    >
                      <span aria-hidden="true">✕</span>
                      <span className="solo-lectores">
                        Borrar la lectura de {formatearFecha(punto.fecha)}
                      </span>
                    </button>
                  ) : null}
                </li>
              );
            })}
          </ol>
        )}
      </section>

      {/* ------------------------------------------------------------------ */}
      <section className="ficha__acciones">
        <EnlaceBoton a={`/vehiculos/${v.id}/repostajes`} icono="⛽">
          Repostajes
        </EnlaceBoton>
        <EnlaceBoton a={`/vehiculos/${v.id}/mantenimientos`} icono="🔧">
          Mantenimientos
        </EnlaceBoton>
        <EnlaceBoton a={`/vehiculos/${v.id}/gastos`} icono="💶">
          Gastos
        </EnlaceBoton>
        <EnlaceBoton a={`/vehiculos/${v.id}/documentos`} icono="🗂️">
          Documentos
        </EnlaceBoton>
        <EnlaceBoton a={`/vehiculos/${v.id}/editar`} icono="✎">
          Editar ficha
        </EnlaceBoton>
        <Boton variante="peligro" alPulsar={() => setConfirmandoBorrado(true)}>
          Eliminar vehículo
        </Boton>
      </section>

      <HojaModal
        abierta={registrando}
        titulo={`Kilómetros de ${v.alias}`}
        alCerrar={() => setRegistrando(false)}
      >
        <FormularioLectura
          vehiculo={v}
          puntos={puntos}
          alTerminar={() => setRegistrando(false)}
        />
      </HojaModal>

      <HojaModal
        abierta={confirmandoBorrado}
        titulo={`¿Eliminar ${v.alias}?`}
        alCerrar={() => setConfirmandoBorrado(false)}
      >
        <div className="borrado">
          <p>
            Se borrarán también sus {totales.repostajes} repostajes,{' '}
            {totales.mantenimientos} mantenimientos, {totales.gastos} gastos,{' '}
            {totales.documentos} documentos y todas las lecturas. No se puede deshacer.
          </p>
          <p className="borrado__alternativa">
            Si lo que ha pasado es que lo has vendido, es mejor marcarlo como vendido desde la
            ficha: conservas el histórico y deja de darte avisos igualmente.
          </p>
          <div className="fila-botones">
            <Boton variante="sutil" alPulsar={() => setConfirmandoBorrado(false)}>
              Cancelar
            </Boton>
            <Boton variante="peligro" cargando={borrando} alPulsar={() => void eliminar()}>
              Eliminar definitivamente
            </Boton>
          </div>
        </div>
      </HojaModal>
    </div>
  );
}
