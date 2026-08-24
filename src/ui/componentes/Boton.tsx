import { Link } from 'react-router-dom';
import './Boton.css';

export type VarianteBoton = 'principal' | 'secundario' | 'sutil' | 'peligro';

interface Comun {
  variante?: VarianteBoton;
  /** Ocupa todo el ancho disponible. */
  ancho?: boolean;
  /** Emoji o carácter a la izquierda del texto. */
  icono?: string;
  children: React.ReactNode;
}

interface BotonProps extends Comun {
  tipo?: 'button' | 'submit';
  alPulsar?: () => void;
  deshabilitado?: boolean;
  cargando?: boolean;
}

export function Boton({
  variante = 'secundario',
  ancho,
  icono,
  tipo = 'button',
  alPulsar,
  deshabilitado,
  cargando,
  children,
}: BotonProps): React.JSX.Element {
  return (
    <button
      type={tipo}
      className={`boton boton--${variante}${ancho ? ' es-ancho' : ''}`}
      onClick={alPulsar}
      disabled={deshabilitado || cargando}
      aria-busy={cargando || undefined}
    >
      {icono ? (
        <span className="boton__icono" aria-hidden="true">
          {icono}
        </span>
      ) : null}
      <span>{cargando ? 'Guardando…' : children}</span>
    </button>
  );
}

interface EnlaceBotonProps extends Comun {
  a: string;
}

/** Mismo aspecto que `Boton`, pero navega. Un enlace debe seguir siendo un enlace. */
export function EnlaceBoton({
  a,
  variante = 'secundario',
  ancho,
  icono,
  children,
}: EnlaceBotonProps): React.JSX.Element {
  return (
    <Link to={a} className={`boton boton--${variante}${ancho ? ' es-ancho' : ''}`}>
      {icono ? (
        <span className="boton__icono" aria-hidden="true">
          {icono}
        </span>
      ) : null}
      <span>{children}</span>
    </Link>
  );
}
