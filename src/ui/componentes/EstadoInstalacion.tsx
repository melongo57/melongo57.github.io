import { useEffect, useState } from 'react';
import { Boton } from './Boton.tsx';
import './EstadoInstalacion.css';

/**
 * Instalación de la PWA y estado del funcionamiento sin conexión.
 *
 * Chrome en Android dispara `beforeinstallprompt` y deja provocar el diálogo
 * de instalación desde un botón propio; el resto de navegadores no, y ahí solo
 * queda explicar dónde está la opción en su menú. Fingir un botón que no hace
 * nada sería peor que decirlo.
 */

/** El evento no está en los tipos estándar: es propio de Chromium. */
interface EventoInstalacion extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

function estaInstalada(): boolean {
  return (
    globalThis.matchMedia?.('(display-mode: standalone)').matches ||
    // iOS no implementa display-mode y usa esta propiedad propia.
    (navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

export function EstadoInstalacion(): React.JSX.Element {
  const [evento, setEvento] = useState<EventoInstalacion | null>(null);
  const [instalada, setInstalada] = useState(estaInstalada);
  const [enLinea, setEnLinea] = useState(() => navigator.onLine);

  useEffect(() => {
    function alPoderInstalar(e: Event): void {
      // Sin esto, Chrome enseña su propia barra y pierdes el control del
      // momento en que se pide.
      e.preventDefault();
      setEvento(e as EventoInstalacion);
    }
    function alInstalar(): void {
      setInstalada(true);
      setEvento(null);
    }
    const conectado = () => setEnLinea(true);
    const desconectado = () => setEnLinea(false);

    window.addEventListener('beforeinstallprompt', alPoderInstalar);
    window.addEventListener('appinstalled', alInstalar);
    window.addEventListener('online', conectado);
    window.addEventListener('offline', desconectado);

    return () => {
      window.removeEventListener('beforeinstallprompt', alPoderInstalar);
      window.removeEventListener('appinstalled', alInstalar);
      window.removeEventListener('online', conectado);
      window.removeEventListener('offline', desconectado);
    };
  }, []);

  async function instalar(): Promise<void> {
    if (!evento) return;
    await evento.prompt();
    const { outcome } = await evento.userChoice;
    // El evento solo se puede usar una vez, se acepte o no.
    setEvento(null);
    if (outcome === 'accepted') setInstalada(true);
  }

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
            <Boton variante="principal" icono="⌂" alPulsar={() => void instalar()}>
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
