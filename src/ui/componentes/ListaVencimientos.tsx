import {
  describirLimite,
  describirRestante,
  type Semaforo,
  type Vencimiento,
} from '@/dominio/vencimientos.ts';
import './ListaVencimientos.css';

/**
 * Lista de alertas con semáforo.
 *
 * El color nunca va solo. Un 8 % de los hombres tiene algún grado de daltonismo
 * y, además, al sol un rojo y un verde saturados se distinguen mal: cada estado
 * lleva también su palabra («Vencido», «Pronto») y su símbolo.
 *
 * Cada fila es un botón: tocarla abre la alerta para marcarla como hecha o
 * cambiarla. Una lista de avisos que solo se puede mirar obliga a ir a buscar
 * a otra pantalla dónde se arreglan.
 */

const ETIQUETA: Record<Semaforo, string> = {
  vencido: 'Vencido',
  proximo: 'Pronto',
  ok: 'Al día',
};

const SIMBOLO: Record<Semaforo, string> = {
  vencido: '!',
  proximo: '•',
  ok: '✓',
};

export function EtiquetaSemaforo({
  semaforo,
  texto,
}: {
  semaforo: Semaforo;
  /** Sustituye a la palabra por defecto («Falta dato», por ejemplo). */
  texto?: string;
}): React.JSX.Element {
  return (
    <span className={`etiqueta-semaforo es-${semaforo}`}>
      <span className="etiqueta-semaforo__simbolo" aria-hidden="true">
        {SIMBOLO[semaforo]}
      </span>
      {texto ?? ETIQUETA[semaforo]}
    </span>
  );
}

export function FilaVencimiento({
  vencimiento: v,
  compacta,
  alElegir,
}: {
  vencimiento: Vencimiento;
  compacta?: boolean;
  alElegir?: (v: Vencimiento) => void;
}): React.JSX.Element {
  const cuerpo = (
    <>
      <span className="vencimiento__icono" aria-hidden="true">
        {v.icono}
      </span>

      <span className="vencimiento__cuerpo">
        <span className="vencimiento__titulo">{v.titulo}</span>
        <span className="vencimiento__resto numero">{describirRestante(v)}</span>
        {!compacta && !v.faltaUltimaVez ? (
          <span className="vencimiento__detalle numero">{describirLimite(v)}</span>
        ) : null}
      </span>

      <EtiquetaSemaforo
        semaforo={v.semaforo}
        {...(v.faltaUltimaVez ? { texto: 'Falta dato' } : {})}
      />
    </>
  );

  return (
    <li className={`vencimiento es-${v.semaforo}${compacta ? ' es-compacta' : ''}`}>
      {alElegir ? (
        <button type="button" className="vencimiento__boton" onClick={() => alElegir(v)}>
          {cuerpo}
        </button>
      ) : (
        <div className="vencimiento__boton">{cuerpo}</div>
      )}
    </li>
  );
}

export function ListaVencimientos({
  vencimientos,
  compacta,
  alElegir,
}: {
  vencimientos: readonly Vencimiento[];
  compacta?: boolean;
  alElegir?: (v: Vencimiento) => void;
}): React.JSX.Element {
  return (
    <ul className="lista-vencimientos">
      {vencimientos.map((v) => (
        <FilaVencimiento
          key={v.id}
          vencimiento={v}
          {...(compacta ? { compacta } : {})}
          {...(alElegir ? { alElegir } : {})}
        />
      ))}
    </ul>
  );
}
