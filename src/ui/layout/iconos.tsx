/**
 * Iconos de la navegación.
 *
 * En SVG y no como emoji o carácter Unicode: símbolos como ⛃ no existen en las
 * fuentes de sistema de Windows y se pintan como una caja vacía, y los emoji
 * salen a todo color, que en una barra de navegación distrae más que ayuda.
 * Estos heredan `currentColor` y siguen el estado activo sin más trabajo.
 */

const COMUN = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.9,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
  focusable: false,
} as const;

export function IconoPanel(): React.JSX.Element {
  return (
    <svg {...COMUN} className="icono">
      <rect x="3" y="3" width="7.5" height="9" rx="1.6" />
      <rect x="13.5" y="3" width="7.5" height="5.5" rx="1.6" />
      <rect x="3" y="15" width="7.5" height="6" rx="1.6" />
      <rect x="13.5" y="11.5" width="7.5" height="9.5" rx="1.6" />
    </svg>
  );
}

export function IconoVehiculos(): React.JSX.Element {
  return (
    <svg {...COMUN} className="icono">
      {/* Perfil de coche visto de frente: capó, techo y ruedas. */}
      <path d="M4 16v2.2a.8.8 0 0 1-.8.8H2.6a.6.6 0 0 1-.6-.6V16" />
      <path d="M22 16v2.4a.6.6 0 0 1-.6.6h-.6a.8.8 0 0 1-.8-.8V16" />
      <path d="M3 16v-3.3a2 2 0 0 1 .12-.68l1.6-4.4A2.6 2.6 0 0 1 7.16 6h9.68a2.6 2.6 0 0 1 2.44 1.62l1.6 4.4a2 2 0 0 1 .12.68V16a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1Z" />
      <path d="M3.4 12.4h17.2" />
      <circle cx="7.2" cy="14.4" r="1.05" />
      <circle cx="16.8" cy="14.4" r="1.05" />
    </svg>
  );
}

export function IconoAjustes(): React.JSX.Element {
  return (
    <svg {...COMUN} className="icono">
      <circle cx="12" cy="12" r="3.2" />
      <path d="M12 2.6v2.2M12 19.2v2.2M21.4 12h-2.2M4.8 12H2.6M18.65 5.35l-1.56 1.56M6.91 17.09l-1.56 1.56M18.65 18.65l-1.56-1.56M6.91 6.91 5.35 5.35" />
    </svg>
  );
}
