import { useEffect, useRef, useState } from 'react';
import { useTodosLosVencimientos } from '../ganchos/consultas.ts';
import {
  avisarDeVencimientos,
  estadoNotificaciones,
  pedirPermiso,
  type EstadoNotificaciones,
} from '../notificaciones.ts';
import { Boton } from './Boton.tsx';
import './AvisoNotificaciones.css';

/**
 * Panel de notificaciones de los ajustes.
 *
 * Dice con todas las letras lo que las notificaciones del navegador pueden y
 * no pueden hacer. Prometer un aviso a treinta días vista que no va a llegar
 * es peor que no ofrecerlo: el usuario deja de mirar la app porque cree que
 * ya le avisará.
 */
export function AvisoNotificaciones(): React.JSX.Element {
  const [estado, setEstado] = useState<EstadoNotificaciones>(() => estadoNotificaciones());
  const [probado, setProbado] = useState<number | null>(null);
  const vencimientos = useTodosLosVencimientos();

  async function activar(): Promise<void> {
    setEstado(await pedirPermiso());
  }

  async function probar(): Promise<void> {
    const resultado = await avisarDeVencimientos(vencimientos ?? []);
    setProbado(resultado.mostrados);
  }

  return (
    <div className="avisos">
      <p className="avisos__texto">
        La app puede avisarte de lo que vence <strong>cuando la abres</strong>. Eso es todo lo
        que permite un navegador: no existe forma de programar un aviso a treinta días vista
        con la aplicación cerrada.
      </p>
      <p className="avisos__texto avisos__texto--destacado">
        Para el recordatorio de verdad, exporta los vencimientos a tu calendario desde la
        <strong> Agenda</strong>. De eso sí se encarga Google Calendar aunque no abras nada.
      </p>

      {estado === 'no_soportado' ? (
        <p className="avisos__estado es-neutro">
          Este navegador no admite notificaciones.
        </p>
      ) : estado === 'denegado' ? (
        <p className="avisos__estado es-neutro">
          Las has bloqueado para este sitio. Se vuelven a permitir desde el candado de la
          barra de direcciones.
        </p>
      ) : estado === 'concedido' ? (
        <>
          <p className="avisos__estado es-ok">Activadas.</p>
          <div className="fila-botones">
            <Boton variante="sutil" alPulsar={() => void probar()}>
              Probar ahora
            </Boton>
          </div>
          {probado !== null ? (
            <p className="avisos__texto">
              {probado === 0
                ? 'No hay nada pendiente de avisar hoy. Cada aviso se muestra una vez al día.'
                : `${probado} ${probado === 1 ? 'notificación mostrada' : 'notificaciones mostradas'}.`}
            </p>
          ) : null}
        </>
      ) : (
        <div className="fila-botones">
          <Boton variante="principal" alPulsar={() => void activar()}>
            Activar notificaciones
          </Boton>
        </div>
      )}
    </div>
  );
}

/**
 * Lanza los avisos al abrir la app, una sola vez por sesión.
 *
 * No pide permiso: hacerlo sin que el usuario lo haya provocado es la forma
 * más rápida de que bloquee las notificaciones del sitio para siempre. Si no
 * hay permiso, esto no hace nada.
 */
export function useAvisosAlArrancar(): void {
  const vencimientos = useTodosLosVencimientos();
  const yaAvisado = useRef(false);

  useEffect(() => {
    if (yaAvisado.current || !vencimientos || vencimientos.length === 0) return;
    yaAvisado.current = true;
    void avisarDeVencimientos(vencimientos);
  }, [vencimientos]);
}
