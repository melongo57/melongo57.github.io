import { TIPOS_DOCUMENTO, TIPOS_MANTENIMIENTO } from '@/dominio/catalogos.ts';
import { formatearFecha } from '@/dominio/fechas.ts';
import { formatearKm } from '@/dominio/formato.ts';
import { describirRestante, type Semaforo, type Vencimiento } from '@/dominio/vencimientos.ts';
import './ListaVencimientos.css';

/**
 * Lista de vencimientos con semáforo.
 *
 * El color nunca va solo. Un 8 % de los hombres tiene algún grado de daltonismo
 * y, además, al sol un rojo y un verde saturados se distinguen mal: cada estado
 * lleva también su palabra («Vencido», «Pronto») y su símbolo.
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

function iconoDe(v: Vencimiento): string {
  return v.origen.clase === 'mantenimiento'
    ? TIPOS_MANTENIMIENTO[v.origen.tipo].icono
    : TIPOS_DOCUMENTO[v.origen.tipo].icono;
}

export function FilaVencimiento({
  vencimiento: v,
  compacta,
}: {
  vencimiento: Vencimiento;
  compacta?: boolean;
}): React.JSX.Element {
  const sinRegistro = v.origen.clase === 'mantenimiento' && v.origen.sinRegistroPrevio;

  return (
    <li className={`vencimiento es-${v.semaforo}${compacta ? ' es-compacta' : ''}`}>
      <span className="vencimiento__icono" aria-hidden="true">
        {iconoDe(v)}
      </span>

      <div className="vencimiento__cuerpo">
        <span className="vencimiento__titulo">{v.titulo}</span>
        <span className="vencimiento__resto numero">{describirRestante(v)}</span>

        {!compacta ? (
          <span className="vencimiento__detalle">
            {sinRegistro ? (
              <em>Sin registro previo · calculado desde la compra</em>
            ) : (
              <>
                {v.fechaLimite ? <>Toca el {formatearFecha(v.fechaLimite)}</> : null}
                {v.fechaLimite && v.kmLimite !== undefined ? ' · ' : null}
                {v.kmLimite !== undefined ? <>o a los {formatearKm(v.kmLimite)}</> : null}
              </>
            )}
          </span>
        ) : null}
      </div>

      <span className={`etiqueta-semaforo es-${v.semaforo}`}>
        <span className="etiqueta-semaforo__simbolo" aria-hidden="true">
          {SIMBOLO[v.semaforo]}
        </span>
        {ETIQUETA[v.semaforo]}
      </span>
    </li>
  );
}

export function ListaVencimientos({
  vencimientos,
  compacta,
}: {
  vencimientos: readonly Vencimiento[];
  compacta?: boolean;
}): React.JSX.Element {
  return (
    <ul className="lista-vencimientos">
      {vencimientos.map((v) => (
        <FilaVencimiento key={v.id} vencimiento={v} compacta={compacta} />
      ))}
    </ul>
  );
}
