import { useEffect, useMemo, useState } from 'react';
import { marcarHecha } from '@/datos/acciones.ts';
import { parsearImporte } from '@/dominio/dinero.ts';
import { esFechaISO, hoyISO } from '@/dominio/fechas.ts';
import { parsearKm } from '@/dominio/formato.ts';
import { kmEnFecha } from '@/dominio/odometro.ts';
import type { Alerta, PuntoOdometro } from '@/dominio/tipos.ts';
import { describirLimite, limitesDe } from '@/dominio/vencimientos.ts';
import { Boton } from './Boton.tsx';
import { CampoFecha, CampoNumero, CampoTexto } from './Campo.tsx';
import './FormularioHecha.css';

/**
 * «Marcar como hecha»: el gesto más repetido de la app.
 *
 * Todo viene relleno —hoy, los kilómetros que marca el coche hoy— y el coste
 * es opcional, así que en el caso normal es un solo toque. Antes de guardar
 * se enseña cuándo volverá a tocar, para que el efecto del botón no sea una
 * sorpresa.
 */
export function FormularioHecha({
  alerta,
  puntos,
  alTerminar,
}: {
  alerta: Alerta;
  puntos: readonly PuntoOdometro[];
  alTerminar: () => void;
}): React.JSX.Element {
  const [fecha, setFecha] = useState(hoyISO);
  const [km, setKm] = useState('');
  const [kmTocado, setKmTocado] = useState(false);
  const [coste, setCoste] = useState('');
  const [taller, setTaller] = useState('');
  const [guardando, setGuardando] = useState(false);

  const sugerido = useMemo(() => kmEnFecha(puntos, fecha), [puntos, fecha]);
  useEffect(() => {
    if (!kmTocado && sugerido !== null) setKm(String(sugerido));
  }, [sugerido, kmTocado]);

  const kmNumero = parsearKm(km);
  const costeCentimos = parsearImporte(coste) ?? 0;
  const fechaValida = esFechaISO(fecha);

  const proxima = fechaValida
    ? describirLimite(
        limitesDe({
          ...alerta,
          venceEl: undefined,
          ultimaFecha: fecha,
          ultimoKm: kmNumero ?? undefined,
        }),
      )
    : '';

  async function guardar(): Promise<void> {
    if (!fechaValida) return;
    setGuardando(true);
    await marcarHecha(alerta, {
      fecha,
      ...(kmNumero !== null ? { km: kmNumero } : {}),
      costeCentimos,
      ...(taller.trim() ? { taller: taller.trim() } : {}),
    });
    alTerminar();
  }

  return (
    <form
      className="form-hecha"
      onSubmit={(e) => {
        e.preventDefault();
        void guardar();
      }}
    >
      <div className="rejilla-campos">
        <CampoFecha etiqueta="Cuándo" valor={fecha} alCambiar={setFecha} max={hoyISO()} />
        <CampoNumero
          etiqueta="Kilómetros"
          valor={km}
          alCambiar={(v) => {
            setKm(v);
            setKmTocado(true);
          }}
          sufijo="km"
        />
      </div>

      <div className="rejilla-campos">
        <CampoNumero
          etiqueta="Coste"
          ayuda="Opcional."
          valor={coste}
          alCambiar={setCoste}
          sufijo="€"
        />
        {alerta.apunte === 'mantenimiento' ? (
          <CampoTexto etiqueta="Taller" ayuda="Opcional." valor={taller} alCambiar={setTaller} />
        ) : null}
      </div>

      {proxima ? (
        <p className="form-hecha__proxima">
          <span aria-hidden="true">↻ </span>La próxima: {proxima.replace(/^Toca /, '')}
        </p>
      ) : null}

      <div className="fila-botones">
        <Boton variante="sutil" alPulsar={alTerminar}>
          Cancelar
        </Boton>
        <Boton tipo="submit" variante="principal" icono="✓" cargando={guardando}>
          Marcar como hecha
        </Boton>
      </div>
    </form>
  );
}
