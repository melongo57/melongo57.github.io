import { useId } from 'react';
import type { Incidencia } from '@/dominio/validacion.ts';
import './Campo.css';

/**
 * Piezas de formulario.
 *
 * Todas comparten el mismo envoltorio para que etiqueta, ayuda e incidencias
 * queden siempre en el mismo sitio y correctamente asociadas por `aria`. Los
 * campos numéricos abren el teclado numérico del móvil: registrar un repostaje
 * tiene que bajar de quince segundos, y cada vez que se abre el teclado
 * completo se pierden tres.
 */

interface EnvoltorioProps {
  etiqueta: string;
  ayuda?: string;
  incidencias?: readonly Incidencia[];
  obligatorio?: boolean;
  ancho?: boolean;
  children: (props: { id: string; describedBy: string | undefined }) => React.ReactNode;
}

export function Campo({
  etiqueta,
  ayuda,
  incidencias = [],
  obligatorio,
  ancho,
  children,
}: EnvoltorioProps): React.JSX.Element {
  const id = useId();
  const idAyuda = `${id}-ayuda`;
  const idIncidencias = `${id}-incidencias`;

  const hayError = incidencias.some((i) => i.gravedad === 'error');
  const describedBy =
    [ayuda ? idAyuda : null, incidencias.length ? idIncidencias : null]
      .filter(Boolean)
      .join(' ') || undefined;

  return (
    <div className={`campo${ancho ? ' campo--ancho' : ''}${hayError ? ' es-error' : ''}`}>
      <label className="campo__etiqueta" htmlFor={id}>
        {etiqueta}
        {obligatorio ? <span aria-hidden="true"> *</span> : null}
      </label>

      {children({ id, describedBy })}

      {ayuda ? (
        <p className="campo__ayuda" id={idAyuda}>
          {ayuda}
        </p>
      ) : null}

      {incidencias.length ? (
        <ul className="campo__incidencias" id={idIncidencias}>
          {incidencias.map((incidencia, i) => (
            <li
              key={`${incidencia.campo}-${i}`}
              className={`campo__incidencia es-${incidencia.gravedad}`}
            >
              {incidencia.mensaje}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------

type ComunProps = Omit<EnvoltorioProps, 'children'>;

interface TextoProps extends ComunProps {
  valor: string;
  alCambiar: (valor: string) => void;
  tipo?: 'text' | 'email' | 'tel';
  marcador?: string;
  autoCapitalizar?: 'none' | 'words' | 'characters';
  maxLargo?: number;
}

export function CampoTexto({
  valor,
  alCambiar,
  tipo = 'text',
  marcador,
  autoCapitalizar,
  maxLargo,
  ...comun
}: TextoProps): React.JSX.Element {
  return (
    <Campo {...comun}>
      {({ id, describedBy }) => (
        <input
          id={id}
          className="control"
          type={tipo}
          value={valor}
          placeholder={marcador}
          autoCapitalize={autoCapitalizar}
          maxLength={maxLargo}
          aria-describedby={describedBy}
          onChange={(e) => alCambiar(e.target.value)}
        />
      )}
    </Campo>
  );
}

interface NumeroProps extends ComunProps {
  valor: string;
  alCambiar: (valor: string) => void;
  /** Texto a la derecha del campo: 'km', 'l', '€'. */
  sufijo?: string;
  marcador?: string;
  /** Tamaño grande para los campos que se rellenan de pie en la gasolinera. */
  grande?: boolean;
}

export function CampoNumero({
  valor,
  alCambiar,
  sufijo,
  marcador,
  grande,
  ...comun
}: NumeroProps): React.JSX.Element {
  return (
    <Campo {...comun}>
      {({ id, describedBy }) => (
        <div className={`control control--compuesto${grande ? ' es-grande' : ''}`}>
          <input
            id={id}
            className="control__entrada numero"
            /*
             * `inputMode="decimal"` en vez de `type="number"`: el campo
             * numérico de HTML rechaza la coma decimal en varios navegadores,
             * cambia de valor si giras la rueda del ratón sin querer y no deja
             * escribir '1.234,5'. Aquí se acepta texto y lo interpreta
             * `parsearDecimal`, que entiende el formato español.
             */
            type="text"
            inputMode="decimal"
            enterKeyHint="next"
            autoComplete="off"
            value={valor}
            placeholder={marcador}
            aria-describedby={describedBy}
            onChange={(e) => alCambiar(e.target.value)}
            onFocus={(e) => e.currentTarget.select()}
          />
          {sufijo ? (
            <span className="control__sufijo" aria-hidden="true">
              {sufijo}
            </span>
          ) : null}
        </div>
      )}
    </Campo>
  );
}

interface FechaProps extends ComunProps {
  valor: string;
  alCambiar: (valor: string) => void;
  min?: string;
  max?: string;
}

export function CampoFecha({
  valor,
  alCambiar,
  min,
  max,
  ...comun
}: FechaProps): React.JSX.Element {
  return (
    <Campo {...comun}>
      {({ id, describedBy }) => (
        <input
          id={id}
          className="control numero"
          type="date"
          value={valor}
          min={min}
          max={max}
          aria-describedby={describedBy}
          onChange={(e) => alCambiar(e.target.value)}
        />
      )}
    </Campo>
  );
}

export interface OpcionSelector<T extends string> {
  valor: T;
  nombre: string;
  icono?: string;
}

interface SelectorProps<T extends string> extends ComunProps {
  valor: T;
  alCambiar: (valor: T) => void;
  opciones: readonly OpcionSelector<T>[];
}

export function CampoSelector<T extends string>({
  valor,
  alCambiar,
  opciones,
  ...comun
}: SelectorProps<T>): React.JSX.Element {
  return (
    <Campo {...comun}>
      {({ id, describedBy }) => (
        <select
          id={id}
          className="control control--selector"
          value={valor}
          aria-describedby={describedBy}
          onChange={(e) => alCambiar(e.target.value as T)}
        >
          {opciones.map((opcion) => (
            <option key={opcion.valor} value={opcion.valor}>
              {opcion.icono ? `${opcion.icono} ` : ''}
              {opcion.nombre}
            </option>
          ))}
        </select>
      )}
    </Campo>
  );
}

interface AreaProps extends ComunProps {
  valor: string;
  alCambiar: (valor: string) => void;
  filas?: number;
  marcador?: string;
}

export function CampoArea({
  valor,
  alCambiar,
  filas = 3,
  marcador,
  ...comun
}: AreaProps): React.JSX.Element {
  return (
    <Campo {...comun} ancho>
      {({ id, describedBy }) => (
        <textarea
          id={id}
          className="control control--area"
          rows={filas}
          value={valor}
          placeholder={marcador}
          aria-describedby={describedBy}
          onChange={(e) => alCambiar(e.target.value)}
        />
      )}
    </Campo>
  );
}

interface InterruptorProps {
  etiqueta: string;
  ayuda?: string;
  valor: boolean;
  alCambiar: (valor: boolean) => void;
}

export function Interruptor({
  etiqueta,
  ayuda,
  valor,
  alCambiar,
}: InterruptorProps): React.JSX.Element {
  const id = useId();
  return (
    <div className="interruptor">
      <input
        id={id}
        type="checkbox"
        className="interruptor__entrada"
        checked={valor}
        onChange={(e) => alCambiar(e.target.checked)}
      />
      <label className="interruptor__etiqueta" htmlFor={id}>
        <span className="interruptor__pista" aria-hidden="true">
          <span className="interruptor__bola" />
        </span>
        <span>
          {etiqueta}
          {ayuda ? <span className="interruptor__ayuda">{ayuda}</span> : null}
        </span>
      </label>
    </div>
  );
}
