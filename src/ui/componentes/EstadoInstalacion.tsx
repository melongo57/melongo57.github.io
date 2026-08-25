import { useEffect, useState } from 'react';
import { instalarApp, useEstadoInstalacion } from '../ganchos/instalacion.ts';
import { Boton } from './Boton.tsx';
import './EstadoInstalacion.css';

/**
 * Instalación de la PWA y estado del funcionamiento sin conexión.
 *
 * El estado del `beforeinstallprompt` vive en `ganchos/instalacion.ts`,
 * compartido con `AvisoInstalacion` (el aviso flotante): el evento solo se
 * puede usar una vez, así que no puede haber dos copias sueltas del mismo.
 */
export function EstadoInstalacion(): React.JSX.Element {
  const { evento, instalada } = useEstadoInstalacion();
  const [enLinea, setEnLinea] = useState(() => navigator.onLine);

  useEffect(() => {
    const conectado = () => setEnLinea(true);
    const desconectado = () => setEnLinea(false);
    window.addEventListener('online', conectado);
    window.addEventListener('offline', desconectado);
    return () => {
      window.removeEventListener('online', conectado);
      window.removeEventListener('offline', desconectado);
    };
  }, []);

  return (
    <div className="instalacion">
      <p className={`instalacion__estado ${enLinea ? 'es-linea' : 'es-sin-linea'}`}>
        <span className="instalacion__punto" aria-hidden="true" />
        {enLinea ? 'Con conexión' : 'Sin conexión'} · la app funciona igual
      </p>

      <p className="instalacion__texto">
        Todo se guarda en tu dispositivo, así que puedes anotar un repostaje en un
        aparcamiento subterráneo sin cobertura y ahí seguirá.
      </p>

      {instalada ? (
        <p className="instalacion__ok">Instalada en la pantalla de inicio.</p>
      ) : evento ? (
        <>
          <p className="instalacion__texto">
            Instalarla la saca del navegador: se abre a pantalla completa, con su icono, y
            arranca más rápido.
          </p>
          <div className="fila-botones">
            <Boton variante="principal" icono="⌂" alPulsar={() => void instalarApp()}>
              Instalar en el móvil
            </Boton>
          </div>
        </>
      ) : (
        <p className="instalacion__texto instalacion__texto--tenue">
          Para instalarla, abre el menú del navegador y busca «Añadir a pantalla de inicio»
          o «Instalar aplicación». En iPhone está en el botón de compartir, y hace falta
          hacerlo para que las notificaciones funcionen.
        </p>
      )}
    </div>
  );
}
