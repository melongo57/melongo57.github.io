import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, estaVivo } from '@/datos/db.ts';
import { repo } from '@/datos/repositorioDexie.ts';
import { formatearFecha } from '@/dominio/fechas.ts';
import { formatearKm } from '@/dominio/formato.ts';
import { estimarKm } from '@/dominio/odometro.ts';
import type { Id } from '@/dominio/tipos.ts';
import {
  calcularVencimientos,
  describirRepeticion,
  describirRestante,
} from '@/dominio/vencimientos.ts';
import { Boton } from './Boton.tsx';
import { FormularioAlerta } from './FormularioAlerta.tsx';
import { FormularioHecha } from './FormularioHecha.tsx';
import { HojaModal } from './HojaModal.tsx';
import { EtiquetaSemaforo } from './ListaVencimientos.tsx';
import './HojaAlerta.css';

type Modo = 'ver' | 'hecha' | 'editar';

/**
 * Todo lo que se puede hacer con una alerta, en una sola hoja: ver cuándo
 * toca, marcarla como hecha, cambiarla o borrarla.
 *
 * Carga sus propios datos a partir del id, para que el panel y la ficha solo
 * tengan que decir qué alerta se ha tocado.
 */
function Contenido({ alertaId, alCerrar }: { alertaId: Id; alCerrar: () => void }): React.JSX.Element {
  const [modo, setModo] = useState<Modo>('ver');

  const datos = useLiveQuery(async () => {
    const alerta = estaVivo(await db.alertas.get(alertaId));
    if (!alerta) return null;
    const vehiculo = estaVivo(await db.vehiculos.get(alerta.vehiculoId));
    if (!vehiculo) return null;
    const [puntos, ajustes] = await Promise.all([
      repo.puntosOdometro(vehiculo.id),
      repo.ajustes.obtener(),
    ]);
    const estimacion = estimarKm(puntos, vehiculo);
    const [vencimiento] = calcularVencimientos({
      vehiculo,
      alertas: [alerta],
      estimacion,
      ajustes,
    });
    return { alerta, vehiculo, puntos, estimacion, vencimiento };
  }, [alertaId]);

  if (datos === undefined) return <p className="cargando">Cargando…</p>;
  // Borrada mientras la hoja estaba abierta.
  if (datos === null) return <p className="hoja-alerta__texto">Esta alerta ya no existe.</p>;

  const { alerta, vehiculo, puntos, estimacion, vencimiento: v } = datos;
  const kmEstimado = estimacion.confianza === 'sin_datos' ? undefined : estimacion.km;

  if (modo === 'hecha') {
    return <FormularioHecha alerta={alerta} puntos={puntos} alTerminar={alCerrar} />;
  }

  if (modo === 'editar') {
    return (
      <FormularioAlerta
        vehiculo={vehiculo}
        alerta={alerta}
        {...(kmEstimado !== undefined ? { kmEstimado } : {})}
        alTerminar={alCerrar}
      />
    );
  }

  return (
    <div className="hoja-alerta">
      <div className={`hoja-alerta__estado es-${v?.semaforo ?? 'ok'}`}>
        <span className="hoja-alerta__icono" aria-hidden="true">
          {alerta.icono}
        </span>
        <div className="hoja-alerta__resumen">
          <span className="hoja-alerta__restante numero">{v ? describirRestante(v) : ''}</span>
          <span className="hoja-alerta__vehiculo">{vehiculo.alias}</span>
        </div>
        {v ? <EtiquetaSemaforo semaforo={v.semaforo} /> : null}
      </div>

      <dl className="hoja-alerta__datos">
        {v && !v.faltaUltimaVez ? (
          <div>
            <dt>{v.semaforo === 'vencido' ? 'Tocaba' : 'Toca'}</dt>
            <dd className="numero">
              {[
                v.fechaLimite ? formatearFecha(v.fechaLimite) : null,
                v.kmLimite !== undefined ? formatearKm(v.kmLimite) : null,
              ]
                .filter(Boolean)
                .join(' o ')}
            </dd>
          </div>
        ) : null}
        <div>
          <dt>Repetición</dt>
          <dd>{describirRepeticion(alerta)}</dd>
        </div>
        <div>
          <dt>Última vez</dt>
          <dd className="numero">
            {alerta.ultimaFecha || alerta.ultimoKm !== undefined
              ? [
                  alerta.ultimaFecha ? formatearFecha(alerta.ultimaFecha) : null,
                  alerta.ultimoKm !== undefined ? formatearKm(alerta.ultimoKm) : null,
                ]
                  .filter(Boolean)
                  .join(' · ')
              : 'Sin anotar'}
          </dd>
        </div>
        {alerta.notas ? (
          <div>
            <dt>Notas</dt>
            <dd>{alerta.notas}</dd>
          </div>
        ) : null}
      </dl>

      {v?.faltaUltimaVez ? (
        <p className="hoja-alerta__falta">
          Para saber cuándo vuelve a tocar hace falta la última vez. Si la acabas de hacer,
          márcala como hecha; si no, indica cuándo fue.
        </p>
      ) : null}

      <div className="hoja-alerta__acciones">
        <Boton variante="principal" icono="✓" ancho alPulsar={() => setModo('hecha')}>
          Marcar como hecha
        </Boton>
        <Boton icono="✎" ancho alPulsar={() => setModo('editar')}>
          {v?.faltaUltimaVez ? 'Indicar la última vez' : 'Editar o borrar'}
        </Boton>
      </div>
    </div>
  );
}

/** Hoja de una alerta. Abierta mientras `alertaId` no sea `null`. */
export function HojaAlerta({
  alertaId,
  titulo,
  alCerrar,
}: {
  alertaId: Id | null;
  titulo: string;
  alCerrar: () => void;
}): React.JSX.Element {
  return (
    <HojaModal abierta={alertaId !== null} titulo={titulo} alCerrar={alCerrar}>
      {alertaId ? <Contenido key={alertaId} alertaId={alertaId} alCerrar={alCerrar} /> : null}
    </HojaModal>
  );
}
