import { useEffect, useRef } from 'react';
import './HojaModal.css';

/**
 * Hoja modal: panel inferior en móvil, diálogo centrado en escritorio.
 *
 * Se apoya en el `<dialog>` nativo en lugar de recrearlo con divs, porque el
 * navegador ya resuelve gratis lo difícil: atrapar el foco dentro, devolverlo
 * al cerrar, cerrar con Escape y dejar inerte el resto de la página para los
 * lectores de pantalla.
 */
export function HojaModal({
  abierta,
  titulo,
  alCerrar,
  children,
}: {
  abierta: boolean;
  titulo: string;
  alCerrar: () => void;
  children: React.ReactNode;
}): React.JSX.Element {
  const dialogo = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const nodo = dialogo.current;
    if (!nodo) return;
    if (abierta && !nodo.open) nodo.showModal();
    if (!abierta && nodo.open) nodo.close();
  }, [abierta]);

  return (
    <dialog
      ref={dialogo}
      className="hoja"
      aria-label={titulo}
      // `cancel` cubre la tecla Escape, que cierra el diálogo sin pasar por
      // nuestro botón y dejaría el estado de React desincronizado.
      onCancel={(e) => {
        e.preventDefault();
        alCerrar();
      }}
      onClick={(e) => {
        // Clic en el fondo: el propio <dialog> ocupa toda la pantalla, así que
        // solo cuenta si el destino es el elemento y no su contenido.
        if (e.target === dialogo.current) alCerrar();
      }}
    >
      <div className="hoja__panel">
        <header className="hoja__cabecera">
          <span className="hoja__tirador" aria-hidden="true" />
          <h2 className="hoja__titulo">{titulo}</h2>
          <button type="button" className="hoja__cerrar" onClick={alCerrar}>
            <span aria-hidden="true">✕</span>
            <span className="solo-lectores">Cerrar</span>
          </button>
        </header>
        <div className="hoja__cuerpo">{children}</div>
      </div>
    </dialog>
  );
}
