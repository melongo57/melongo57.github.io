import { useState } from 'react';
import { Link } from 'react-router-dom';
import { formatearEuros } from '@/dominio/dinero.ts';
import { formatearDistancia, formatearMes, hoyISO, claveMes } from '@/dominio/fechas.ts';
import { formatearKm } from '@/dominio/formato.ts';
import { esEstimacion } from '@/dominio/odometro.ts';
import type { Vehiculo } from '@/dominio/tipos.ts';
import { Boton, EnlaceBoton } from '../componentes/Boton.tsx';
import { FormularioLectura } from '../componentes/FormularioLectura.tsx';
import { FotoVehiculo } from '../componentes/FotoVehiculo.tsx';
import { HojaModal } from '../componentes/HojaModal.tsx';
import { useResumenPanel, usePuntosOdometro } from '../ganchos/consultas.ts';
import type { ResumenPanel } from '../ganchos/consultas.ts';
import './Panel.css';

/**
 * Panel principal.
 *
 * En esta fase muestra el kilometraje estimado, el ritmo de uso y el gasto del
 * mes. Los vencimientos con semáforo llegan en la fase 3 y el consumo real en
 * la cuarta; hasta entonces esos huecos se anuncian en vez de dejarse en
 * blanco, para que se vea qué falta y no parezca que algo se ha roto.
 */

function HojaLectura({
  vehiculo,
  alCerrar,
}: {
  vehiculo: Vehiculo | null;
  alCerrar: () => void;
}): React.JSX.Element {
  const puntos = usePuntosOdometro(vehiculo?.id);

  return (
    <HojaModal
      abierta={vehiculo !== null}
      titulo={vehiculo ? `Kilómetros de ${vehiculo.alias}` : 'Kilómetros'}
      alCerrar={alCerrar}
    >
      {vehiculo && puntos ? (
        <FormularioLectura
          // Reinicia el formulario al pasar de un vehículo a otro.
          key={vehiculo.id}
          vehiculo={vehiculo}
          puntos={puntos}
          alTerminar={alCerrar}
        />
      ) : null}
    </HojaModal>
  );
}

function TarjetaPanel({
  resumen,
  alRegistrarKm,
}: {
  resumen: ResumenPanel;
  alRegistrarKm: () => void;
}): React.JSX.Element {
  const { vehiculo, estimacion, kmAlAnio, gastoDelMesCentimos, registrosDelMes } = resumen;
  const estimado = esEstimacion(estimacion);

  return (
    <article className="panel-tarjeta">
      <Link to={`/vehiculos/${vehiculo.id}`} className="panel-tarjeta__enlace">
        <FotoVehiculo vehiculo={vehiculo} />
        <div className="panel-tarjeta__titulo">
          <h2>{vehiculo.alias}</h2>
          <p>
            {vehiculo.marca} {vehiculo.modelo}
          </p>
        </div>
      </Link>

      <div className="panel-tarjeta__cifra">
        <span className="panel-tarjeta__km numero">
          {estimacion.confianza === 'sin_datos' ? '—' : formatearKm(estimacion.km)}
        </span>
        <span className={`panel-tarjeta__matiz${estimado ? ' es-estimado' : ''}`}>
          {estimacion.confianza === 'sin_datos'
            ? 'Sin lecturas todavía'
            : estimacion.diasDesdeLectura === 0
              ? 'Lectura de hoy'
              : estimado
                ? `Estimado · última lectura ${formatearDistancia(-estimacion.diasDesdeLectura)}`
                : `Última lectura ${formatearDistancia(-estimacion.diasDesdeLectura)}`}
        </span>
      </div>

      <dl className="panel-tarjeta__datos">
        <div>
          <dt>Este mes</dt>
          <dd className="numero">{formatearEuros(gastoDelMesCentimos)}</dd>
          <span className="panel-tarjeta__apunte">
            {registrosDelMes === 0
              ? 'sin registros'
              : `${registrosDelMes} ${registrosDelMes === 1 ? 'registro' : 'registros'}`}
          </span>
        </div>
        <div>
          <dt>Ritmo</dt>
          <dd className="numero">{kmAlAnio > 0 ? formatearKm(kmAlAnio) : '—'}</dd>
          <span className="panel-tarjeta__apunte">al año</span>
        </div>
      </dl>

      <div className="panel-tarjeta__pendiente">
        <span aria-hidden="true">🔜</span>
        <p>Vencimientos y consumo real en las próximas fases.</p>
      </div>

      <div className="panel-tarjeta__acciones">
        <Boton variante="principal" icono="＋" ancho alPulsar={alRegistrarKm}>
          Anotar kilómetros
        </Boton>
      </div>
    </article>
  );
}

export function Panel(): React.JSX.Element {
  const resumenes = useResumenPanel();
  const [registrando, setRegistrando] = useState<Vehiculo | null>(null);

  return (
    <div className="contenedor panel">
      <header className="panel__cabecera">
        <div>
          <h1>Tu garaje</h1>
          <p className="panel__mes">{formatearMes(claveMes(hoyISO()))}</p>
        </div>
        <EnlaceBoton a="/vehiculos/nuevo" variante="secundario" icono="＋">
          Vehículo
        </EnlaceBoton>
      </header>

      {resumenes === undefined ? (
        <div className="panel__rejilla" aria-busy="true">
          {[0, 1].map((i) => (
            <div key={i} className="panel-tarjeta es-esqueleto" />
          ))}
        </div>
      ) : resumenes.length === 0 ? (
        <div className="vacio">
          <p className="vacio__icono" aria-hidden="true">
            🚗
          </p>
          <h2>Aún no hay ningún vehículo activo</h2>
          <p>
            Da de alta el primero y empieza a anotar kilómetros, repostajes y gastos. Si
            tienes alguno vendido, sigue guardado en la lista de vehículos.
          </p>
          <EnlaceBoton a="/vehiculos/nuevo" variante="principal" icono="＋">
            Añadir vehículo
          </EnlaceBoton>
        </div>
      ) : (
        <div className="panel__rejilla">
          {resumenes.map((resumen) => (
            <TarjetaPanel
              key={resumen.vehiculo.id}
              resumen={resumen}
              alRegistrarKm={() => setRegistrando(resumen.vehiculo)}
            />
          ))}
        </div>
      )}

      <HojaLectura vehiculo={registrando} alCerrar={() => setRegistrando(null)} />
    </div>
  );
}
