import { useState } from 'react';
import type { Alerta, Vehiculo } from '@/dominio/tipos.ts';
import type { Vencimiento } from '@/dominio/vencimientos.ts';
import { Boton } from './Boton.tsx';
import { FormularioAlerta } from './FormularioAlerta.tsx';
import { HojaAlerta } from './HojaAlerta.tsx';
import { HojaModal } from './HojaModal.tsx';
import { ListaVencimientos } from './ListaVencimientos.tsx';
import './GestorAlertas.css';

/**
 * Las alertas de un vehículo, todas en un sitio: se ven, se tocan para
 * marcarlas como hechas o cambiarlas, y se añaden desde aquí mismo.
 *
 * Sustituye a la pantalla aparte de «Cada cuánto toca», que era donde se
 * configuraban las recurrencias: ver un aviso en la ficha y tener que ir a
 * otra pantalla para arreglarlo era justo lo poco intuitivo.
 */
export function GestorAlertas({
  vehiculo,
  alertas,
  vencimientos,
  kmEstimado,
}: {
  vehiculo: Vehiculo;
  alertas: readonly Alerta[];
  vencimientos: readonly Vencimiento[];
  kmEstimado?: number;
}): React.JSX.Element {
  const [abierta, setAbierta] = useState<Vencimiento | null>(null);
  const [creando, setCreando] = useState(false);

  const pendientes = vencimientos.filter((v) => v.semaforo !== 'ok');
  const alDia = vencimientos.filter((v) => v.semaforo === 'ok');
  const vendido = vehiculo.estado === 'vendido';

  return (
    <section className="gestor-alertas">
      <header className="gestor-alertas__cabecera">
        <h2>Alertas</h2>
        {!vendido ? (
          <Boton variante="principal" icono="＋" alPulsar={() => setCreando(true)}>
            Nueva
          </Boton>
        ) : null}
      </header>

      {vendido ? (
        <p className="gestor-alertas__vacio">Vendido: ya no da avisos.</p>
      ) : alertas.length === 0 ? (
        <div className="gestor-alertas__vacio">
          <p>
            Sin alertas. Añade las que quieras vigilar —ITV, seguro, la revisión— y la app te
            avisará antes de que toquen.
          </p>
          <Boton variante="principal" icono="＋" alPulsar={() => setCreando(true)}>
            Añadir la primera
          </Boton>
        </div>
      ) : (
        <>
          {pendientes.length > 0 ? (
            <ListaVencimientos vencimientos={pendientes} alElegir={setAbierta} />
          ) : (
            <p className="gestor-alertas__aldia">
              <span aria-hidden="true">✓ </span>Todo al día.
            </p>
          )}

          {alDia.length > 0 ? (
            <details className="gestor-alertas__resto" open={pendientes.length === 0}>
              <summary>
                {alDia.length === 1 ? '1 alerta al día' : `${alDia.length} alertas al día`}
              </summary>
              <ListaVencimientos vencimientos={alDia} alElegir={setAbierta} />
            </details>
          ) : null}

          <p className="gestor-alertas__pista">Toca una alerta para marcarla como hecha o cambiarla.</p>
        </>
      )}

      <HojaAlerta
        alertaId={abierta?.alertaId ?? null}
        titulo={abierta?.titulo ?? 'Alerta'}
        alCerrar={() => setAbierta(null)}
      />

      <HojaModal abierta={creando} titulo="Nueva alerta" alCerrar={() => setCreando(false)}>
        {creando ? (
          <FormularioAlerta
            vehiculo={vehiculo}
            existentes={alertas}
            {...(kmEstimado !== undefined ? { kmEstimado } : {})}
            alTerminar={() => setCreando(false)}
          />
        ) : null}
      </HojaModal>
    </section>
  );
}
