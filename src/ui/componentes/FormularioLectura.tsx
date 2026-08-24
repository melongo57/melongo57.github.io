import { useEffect, useMemo, useState } from 'react';
import { registrarLectura } from '@/datos/acciones.ts';
import { hoyISO } from '@/dominio/fechas.ts';
import { formatearKm, parsearKm } from '@/dominio/formato.ts';
import { estimarKm, kmEnFecha } from '@/dominio/odometro.ts';
import type { PuntoOdometro, Vehiculo } from '@/dominio/tipos.ts';
import { incidenciasDe, validarLectura } from '@/dominio/validacion.ts';
import { Boton } from './Boton.tsx';
import { CampoArea, CampoFecha, CampoNumero } from './Campo.tsx';
import './FormularioLectura.css';

/**
 * Registro de una lectura del odómetro.
 *
 * Prerrellena los kilómetros con la estimación para esa fecha: casi siempre la
 * corrección es de unas decenas y se teclea más rápido corrigiendo que
 * escribiendo seis cifras desde cero.
 *
 * Si la lectura no cuadra con el histórico no se bloquea el guardado, se pide
 * confirmación. Un odómetro que retrocede suele ser un dedazo, pero a veces es
 * real —cuadro sustituido, avería del cuentakilómetros— y la app no puede
 * impedirte registrar lo que de verdad marca tu coche.
 */
export function FormularioLectura({
  vehiculo,
  puntos,
  alTerminar,
}: {
  vehiculo: Vehiculo;
  puntos: readonly PuntoOdometro[];
  alTerminar: () => void;
}): React.JSX.Element {
  const [fecha, setFecha] = useState(hoyISO);

  const sugerido = useMemo(() => {
    const enEsaFecha = kmEnFecha(puntos, fecha);
    return enEsaFecha ?? estimarKm(puntos, vehiculo).km;
  }, [puntos, fecha, vehiculo]);

  const [km, setKm] = useState('');
  /**
   * Mientras el usuario no toque el campo, sigue a la sugerencia. Hace falta
   * porque el histórico llega de forma asíncrona: si el valor solo se fijara
   * al montar, el campo se quedaría vacío para siempre. Y porque al cambiar la
   * fecha la sugerencia es otra.
   */
  const [tocado, setTocado] = useState(false);

  useEffect(() => {
    if (!tocado) setKm(sugerido ? String(sugerido) : '');
  }, [sugerido, tocado]);

  const [notas, setNotas] = useState('');
  const [confirmado, setConfirmado] = useState(false);
  /* Un botón deshabilitado no explica qué falta; se deja pulsar y se contesta. */
  const [intentado, setIntentado] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [fallo, setFallo] = useState<string | null>(null);

  const kmNumero = parsearKm(km);

  const validacion = useMemo(
    () => validarLectura(puntos, { fecha, km: kmNumero ?? Number.NaN }),
    [puntos, fecha, kmNumero],
  );

  async function guardar(): Promise<void> {
    if (!validacion.valido || kmNumero === null) {
      setIntentado(true);
      return;
    }
    if (validacion.requiereConfirmacion && !confirmado) {
      setConfirmado(true);
      return;
    }

    setGuardando(true);
    setFallo(null);
    try {
      await registrarLectura({
        vehiculoId: vehiculo.id,
        fecha,
        km: kmNumero,
        ...(notas ? { notas } : {}),
      });
      alTerminar();
    } catch (error) {
      setFallo(error instanceof Error ? error.message : 'No se ha podido guardar.');
      setGuardando(false);
    }
  }

  const ultima = puntos[puntos.length - 1];
  const pidiendoConfirmacion = validacion.requiereConfirmacion && confirmado;

  return (
    <form
      className="form-lectura"
      onSubmit={(e) => {
        e.preventDefault();
        void guardar();
      }}
    >
      {ultima ? (
        <p className="form-lectura__referencia">
          Último registro: <strong className="numero">{formatearKm(ultima.km)}</strong>
        </p>
      ) : null}

      <CampoNumero
        etiqueta="Kilómetros"
        valor={km}
        alCambiar={(v) => {
          setKm(v);
          setTocado(true);
          setConfirmado(false);
        }}
        sufijo="km"
        grande
        obligatorio
        incidencias={tocado || intentado ? incidenciasDe(validacion, 'km') : []}
      />

      <CampoFecha
        etiqueta="Fecha"
        valor={fecha}
        alCambiar={(v) => {
          setFecha(v);
          setConfirmado(false);
        }}
        max={hoyISO()}
        incidencias={incidenciasDe(validacion, 'fecha')}
      />

      <CampoArea
        etiqueta="Notas"
        valor={notas}
        alCambiar={setNotas}
        filas={2}
        marcador="Opcional"
      />

      {pidiendoConfirmacion ? (
        <p className="form-lectura__confirmar">
          Revisa el aviso de arriba. Si aun así es correcto, vuelve a pulsar para guardarlo.
        </p>
      ) : null}

      {intentado && (!validacion.valido || kmNumero === null) ? (
        <p className="form-lectura__fallo">Revisa los kilómetros antes de guardar.</p>
      ) : null}

      {fallo ? <p className="form-lectura__fallo">{fallo}</p> : null}

      <div className="fila-botones">
        <Boton variante="sutil" alPulsar={alTerminar}>
          Cancelar
        </Boton>
        <Boton
          tipo="submit"
          variante={pidiendoConfirmacion ? 'peligro' : 'principal'}
          cargando={guardando}
        >
          {pidiendoConfirmacion ? 'Guardar de todas formas' : 'Guardar lectura'}
        </Boton>
      </div>
    </form>
  );
}
