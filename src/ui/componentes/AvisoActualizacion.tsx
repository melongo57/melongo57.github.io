import { useEffect, useState } from 'react';
import { registerSW } from 'virtual:pwa-register';
import { Boton } from './Boton.tsx';
import './AvisoActualizacion.css';

/**
 * Aviso de versión nueva.
 *
 * El service worker se registra con `registerType: 'prompt'`: una versión nueva
 * NO se aplica sola. Recargar por sorpresa a alguien que está a medio escribir
 * un repostaje le borraría el formulario, así que se avisa y decide él.
 */
export function AvisoActualizacion(): React.JSX.Element | null {
  const [hayVersion, setHayVersion] = useState(false);
  const [listaSinConexion, setListaSinConexion] = useState(false);
  const [actualizar, setActualizar] = useState<(() => Promise<void>) | null>(null);

  useEffect(() => {
    const aplicar = registerSW({
      onNeedRefresh() {
        setHayVersion(true);
      },
      onOfflineReady() {
        setListaSinConexion(true);
        // El cartel de «lista sin conexión» se retira solo: es una buena
        // noticia, no una tarea.
        setTimeout(() => setListaSinConexion(false), 6000);
      },
    });
    setActualizar(() => async () => {
      await aplicar(true);
    });
  }, []);

  if (!hayVersion && !listaSinConexion) return null;

  return (
    <div className={`aviso-sw${hayVersion ? ' es-version' : ''}`} role="status">
      {hayVersion ? (
        <>
          <span>Hay una versión nueva de la app.</span>
          <Boton variante="principal" alPulsar={() => void actualizar?.()}>
            Actualizar
          </Boton>
          <button type="button" className="aviso-sw__cerrar" onClick={() => setHayVersion(false)}>
            <span aria-hidden="true">✕</span>
            <span className="solo-lectores">Ahora no</span>
          </button>
        </>
      ) : (
        <span>Lista para funcionar sin conexión.</span>
      )}
    </div>
  );
}
