import { useState } from 'react';
import { useLocation } from 'react-router-dom';
import type { Id, Vehiculo } from '@/dominio/tipos.ts';
import { describirRestante } from '@/dominio/vencimientos.ts';
import {
  useAjustes,
  useDetalleVehiculo,
  useEstacionesFrecuentes,
  useVehiculos,
} from '../ganchos/consultas.ts';
import { FormularioGasto } from './FormularioGasto.tsx';
import { FormularioHecha } from './FormularioHecha.tsx';
import { FormularioLectura } from './FormularioLectura.tsx';
import { FormularioMantenimiento } from './FormularioMantenimiento.tsx';
import { FormularioRepostaje } from './FormularioRepostaje.tsx';
import { HojaModal } from './HojaModal.tsx';
import './AccionRapida.css';

type Que = 'repostaje' | 'hecha' | 'servicio' | 'gasto' | 'km';

const ACCIONES: readonly { que: Que; icono: string; nombre: string; detalle: string }[] = [
  { que: 'repostaje', icono: '⛽', nombre: 'Repostaje', detalle: 'Litros, precio y total' },
  { que: 'hecha', icono: '✓', nombre: 'Alerta hecha', detalle: 'ITV, revisión, seguro…' },
  { que: 'servicio', icono: '🔧', nombre: 'Servicio', detalle: 'Taller, reparación' },
  { que: 'gasto', icono: '💶', nombre: 'Gasto', detalle: 'Parking, peajes, multas…' },
  { que: 'km', icono: '📍', nombre: 'Kilómetros', detalle: 'Lo que marca el cuadro' },
];

const TITULO: Record<Que, string> = {
  repostaje: 'Repostaje',
  hecha: '¿Qué alerta has hecho?',
  servicio: 'Nuevo servicio',
  gasto: 'Nuevo gasto',
  km: 'Kilómetros',
};

/** El formulario elegido, con los datos del vehículo que necesita. */
function Formulario({
  que,
  vehiculo,
  alTerminar,
}: {
  que: Que;
  vehiculo: Vehiculo;
  alTerminar: () => void;
}): React.JSX.Element {
  const detalle = useDetalleVehiculo(vehiculo.id);
  const estaciones = useEstacionesFrecuentes(vehiculo.id);
  const [alertaId, setAlertaId] = useState<Id | null>(null);

  if (!detalle || estaciones === undefined) return <p className="cargando">Cargando…</p>;
  const { puntos, alertas, vencimientos } = detalle;

  switch (que) {
    case 'repostaje':
      return (
        <FormularioRepostaje
          vehiculo={vehiculo}
          puntos={puntos}
          estacionesFrecuentes={estaciones}
          alTerminar={alTerminar}
        />
      );
    case 'servicio':
      return <FormularioMantenimiento vehiculo={vehiculo} puntos={puntos} alTerminar={alTerminar} />;
    case 'gasto':
      return <FormularioGasto vehiculo={vehiculo} alTerminar={alTerminar} />;
    case 'km':
      return <FormularioLectura vehiculo={vehiculo} puntos={puntos} alTerminar={alTerminar} />;
    case 'hecha': {
      const alerta = alertas.find((a) => a.id === alertaId);
      if (alerta) return <FormularioHecha alerta={alerta} puntos={puntos} alTerminar={alTerminar} />;
      if (vencimientos.length === 0) {
        return (
          <p className="accion-rapida__vacio">
            {vehiculo.alias} no tiene alertas. Añádelas desde su ficha.
          </p>
        );
      }
      // Lo más urgente primero: es lo más probable que se acabe de hacer.
      return (
        <ul className="accion-rapida__alertas">
          {vencimientos.map((v) => (
            <li key={v.id}>
              <button
                type="button"
                className={`accion-rapida__alerta es-${v.semaforo}`}
                onClick={() => setAlertaId(v.alertaId)}
              >
                <span aria-hidden="true">{v.icono}</span>
                <span className="accion-rapida__alerta-nombre">{v.titulo}</span>
                <span className="accion-rapida__alerta-resto numero">{describirRestante(v)}</span>
              </button>
            </li>
          ))}
        </ul>
      );
    }
  }
}

/**
 * Botón «＋» que está en todas las pantallas.
 *
 * Anotar algo no debería depender de saber en qué pantalla vive: repostar se
 * hacía desde el panel, un gasto desde la lista de gastos del vehículo, un
 * servicio desde la de mantenimientos. Aquí todo sale del mismo sitio, con el
 * vehículo ya elegido si solo hay uno o el de siempre si hay varios.
 */
export function AccionRapida(): React.JSX.Element | null {
  const { pathname } = useLocation();
  const vehiculos = useVehiculos({ incluirVendidos: false });
  const ajustes = useAjustes();

  const [abierta, setAbierta] = useState(false);
  const [vehiculoId, setVehiculoId] = useState<Id | null>(null);
  const [que, setQue] = useState<Que | null>(null);

  // En los formularios de alta y edición de vehículo estorba más que ayuda.
  if (/\/(nuevo|editar)$/.test(pathname)) return null;
  if (!vehiculos || vehiculos.length === 0) return null;

  const porDefecto =
    vehiculos.find((v) => v.id === ajustes?.vehiculoPorDefectoId) ?? vehiculos[0]!;
  // Si la ficha de un vehículo está abierta, ese es el que se quiere anotar.
  const deLaRuta = vehiculos.find((v) => pathname.startsWith(`/vehiculos/${v.id}`));
  const vehiculo =
    vehiculos.find((v) => v.id === vehiculoId) ?? deLaRuta ?? porDefecto;

  function cerrar(): void {
    setAbierta(false);
    setQue(null);
    setVehiculoId(null);
  }

  return (
    <>
      <button
        type="button"
        className="accion-rapida__boton"
        aria-label="Anotar algo"
        onClick={() => setAbierta(true)}
      >
        <span aria-hidden="true">＋</span>
      </button>

      <HojaModal
        abierta={abierta}
        titulo={que ? `${TITULO[que]} · ${vehiculo.alias}` : '¿Qué quieres anotar?'}
        alCerrar={cerrar}
      >
        {!abierta ? null : que ? (
          <div className="accion-rapida__paso">
            <button type="button" className="accion-rapida__atras" onClick={() => setQue(null)}>
              ‹ Otra cosa
            </button>
            <Formulario key={`${que}-${vehiculo.id}`} que={que} vehiculo={vehiculo} alTerminar={cerrar} />
          </div>
        ) : (
          <div className="accion-rapida">
            {vehiculos.length > 1 ? (
              <div className="opciones" role="group" aria-label="Vehículo">
                {vehiculos.map((v) => (
                  <button
                    key={v.id}
                    type="button"
                    className="opcion"
                    aria-pressed={v.id === vehiculo.id}
                    onClick={() => setVehiculoId(v.id)}
                  >
                    {v.alias}
                  </button>
                ))}
              </div>
            ) : null}

            <ul className="accion-rapida__lista">
              {ACCIONES.map((a) => (
                <li key={a.que}>
                  <button type="button" className="accion-rapida__accion" onClick={() => setQue(a.que)}>
                    <span className="accion-rapida__icono" aria-hidden="true">
                      {a.icono}
                    </span>
                    <span className="accion-rapida__texto">
                      <span className="accion-rapida__nombre">{a.nombre}</span>
                      <span className="accion-rapida__detalle">{a.detalle}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </HojaModal>
    </>
  );
}
