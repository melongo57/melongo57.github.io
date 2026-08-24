import { useEffect, useMemo, useState } from 'react';
import { borrarRepostaje, guardarRepostaje } from '@/datos/acciones.ts';
import { unidadesDe } from '@/dominio/catalogos.ts';
import { recalcularTrio, type CampoTrio } from '@/dominio/consumo.ts';
import { parsearImporte } from '@/dominio/dinero.ts';
import { hoyISO } from '@/dominio/fechas.ts';
import { parsearCantidad, parsearKm, parsearPrecioUnitario } from '@/dominio/formato.ts';
import { kmEnFecha } from '@/dominio/odometro.ts';
import type { Id, PuntoOdometro, Repostaje, UnidadEnergia, Vehiculo } from '@/dominio/tipos.ts';
import { incidenciasDe, validarLectura } from '@/dominio/validacion.ts';
import { Adjuntos } from './Adjuntos.tsx';
import { Boton } from './Boton.tsx';
import { CampoFecha, CampoNumero, CampoTexto, Interruptor } from './Campo.tsx';
import './FormularioRepostaje.css';

/**
 * Registro de un repostaje.
 *
 * Este formulario tiene un requisito explícito: rellenarlo de pie, en la
 * gasolinera, en menos de quince segundos. Todo lo demás se subordina a eso.
 *
 *  - El importe va primero y grande: es lo único que siempre tienes delante,
 *    en el surtidor y en el ticket.
 *  - De los tres campos —cantidad, precio e importe— basta con dos: el
 *    tercero se calcula solo (ver `recalcularTrio`).
 *  - Los kilómetros vienen prerrellenados con la estimación de hoy, así que
 *    normalmente solo hay que corregir las decenas.
 *  - La fecha es hoy y el depósito, lleno. Son los valores de nueve de cada
 *    diez repostajes; el que no encaje, los cambia.
 *  - Las estaciones que ya has usado salen como botones: escribir «Repsol
 *    A-6» con una mano y el surtidor en la otra son cinco segundos perdidos.
 */
export function FormularioRepostaje({
  vehiculo,
  puntos,
  estacionesFrecuentes,
  repostaje,
  alTerminar,
}: {
  vehiculo: Vehiculo;
  puntos: readonly PuntoOdometro[];
  estacionesFrecuentes: readonly string[];
  repostaje?: Repostaje;
  alTerminar: () => void;
}): React.JSX.Element {
  const editando = Boolean(repostaje);
  const unidades = unidadesDe(vehiculo.combustible);

  const [unidad, setUnidad] = useState<UnidadEnergia>(repostaje?.unidad ?? unidades[0] ?? 'l');
  const [fecha, setFecha] = useState(repostaje?.fecha ?? hoyISO());
  const [km, setKm] = useState(repostaje?.km === undefined ? '' : String(repostaje.km));
  const [kmTocado, setKmTocado] = useState(editando);

  const [cantidad, setCantidad] = useState(
    repostaje ? String(repostaje.cantidad).replace('.', ',') : '',
  );
  const [precio, setPrecio] = useState(
    repostaje && repostaje.cantidad > 0
      ? (repostaje.importeCentimos / 100 / repostaje.cantidad).toFixed(3).replace('.', ',')
      : '',
  );
  const [importe, setImporte] = useState(
    repostaje ? (repostaje.importeCentimos / 100).toFixed(2).replace('.', ',') : '',
  );

  const [lleno, setLleno] = useState(repostaje?.depositoLleno ?? true);
  const [ruptura, setRuptura] = useState(repostaje?.rupturaSerie ?? false);
  const [estacion, setEstacion] = useState(repostaje?.estacion ?? '');
  const [adjuntoIds, setAdjuntoIds] = useState<Id[]>(repostaje?.adjuntoIds ?? []);
  const [intentado, setIntentado] = useState(false);
  const [confirmado, setConfirmado] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [borrandoConfirmado, setBorrandoConfirmado] = useState(false);

  const sugerido = useMemo(() => kmEnFecha(puntos, fecha), [puntos, fecha]);
  useEffect(() => {
    if (!kmTocado && sugerido !== null) setKm(String(sugerido));
  }, [sugerido, kmTocado]);

  /** Importe en euros a partir del texto, o `null` si está vacío. */
  function euros(texto: string): number | null {
    const centimos = parsearImporte(texto);
    return centimos === null ? null : centimos / 100;
  }

  /** Escribe en los tres campos el resultado de recalcular el trío. */
  function alEditarTrio(campo: CampoTrio, texto: string): void {
    const siguiente = {
      cantidad: campo === 'cantidad' ? parsearCantidad(texto) : parsearCantidad(cantidad),
      precioUnitario:
        campo === 'precioUnitario' ? parsearPrecioUnitario(texto) : parsearPrecioUnitario(precio),
      importeEuros: euros(campo === 'importeEuros' ? texto : importe),
    };

    const calculado = recalcularTrio(campo, siguiente);

    // El campo que se está tecleando se deja tal cual: reformatearlo mientras
    // escribes te mueve el cursor y borra el separador decimal a medio poner.
    if (campo !== 'cantidad') {
      setCantidad(calculado.cantidad === null ? '' : String(calculado.cantidad).replace('.', ','));
    } else {
      setCantidad(texto);
    }

    if (campo !== 'precioUnitario') {
      setPrecio(
        calculado.precioUnitario === null
          ? ''
          : calculado.precioUnitario.toFixed(3).replace('.', ','),
      );
    } else {
      setPrecio(texto);
    }

    if (campo !== 'importeEuros') {
      setImporte(
        calculado.importeEuros === null ? '' : calculado.importeEuros.toFixed(2).replace('.', ','),
      );
    } else {
      setImporte(texto);
    }

    setConfirmado(false);
  }

  const cantidadNumero = parsearCantidad(cantidad);
  const importeCentimos = parsearImporte(importe);
  const kmNumero = parsearKm(km);

  const validacionKm = useMemo(
    () =>
      kmNumero === null
        ? null
        : validarLectura(
            puntos,
            { fecha, km: kmNumero },
            repostaje ? { excluirRefId: repostaje.id } : {},
          ),
    [puntos, fecha, kmNumero, repostaje],
  );

  const faltaCantidad = cantidadNumero === null || cantidadNumero <= 0;
  const faltaImporte = importeCentimos === null || importeCentimos <= 0;
  const valido = !faltaCantidad && !faltaImporte && (validacionKm?.valido ?? true);
  const requiereConfirmacion = validacionKm?.requiereConfirmacion ?? false;
  const pidiendoConfirmacion = requiereConfirmacion && confirmado;

  async function guardar(): Promise<void> {
    if (!valido) {
      setIntentado(true);
      return;
    }
    if (requiereConfirmacion && !confirmado) {
      setIntentado(true);
      setConfirmado(true);
      return;
    }

    setGuardando(true);
    await guardarRepostaje({
      ...(repostaje ? { id: repostaje.id } : {}),
      vehiculoId: vehiculo.id,
      fecha,
      cantidad: cantidadNumero!,
      unidad,
      importeCentimos: importeCentimos!,
      ...(kmNumero !== null ? { km: kmNumero } : {}),
      depositoLleno: lleno,
      rupturaSerie: ruptura,
      ...(estacion.trim() ? { estacion: estacion.trim() } : {}),
      adjuntoIds,
    });
    alTerminar();
  }

  const sufijoCantidad = unidad === 'kWh' ? 'kWh' : 'l';

  return (
    <form
      className="form-repostaje"
      onSubmit={(e) => {
        e.preventDefault();
        void guardar();
      }}
    >
      {unidades.length > 1 ? (
        <div className="selector-unidad" role="radiogroup" aria-label="Tipo de repostaje">
          {unidades.map((u) => (
            <button
              key={u}
              type="button"
              role="radio"
              aria-checked={unidad === u}
              className={`selector-unidad__opcion${unidad === u ? ' es-activa' : ''}`}
              onClick={() => setUnidad(u)}
            >
              {u === 'kWh' ? '⚡ Carga' : '⛽ Combustible'}
            </button>
          ))}
        </div>
      ) : null}

      {/* El importe primero y grande: es lo único que siempre tienes delante. */}
      <CampoNumero
        etiqueta="Importe"
        valor={importe}
        alCambiar={(v) => alEditarTrio('importeEuros', v)}
        sufijo="€"
        grande
        obligatorio
        incidencias={
          intentado && faltaImporte
            ? [{ campo: 'importe', gravedad: 'error', mensaje: 'Falta el importe.' }]
            : []
        }
      />

      <div className="rejilla-campos">
        <CampoNumero
          etiqueta={unidad === 'kWh' ? 'Energía' : 'Litros'}
          valor={cantidad}
          alCambiar={(v) => alEditarTrio('cantidad', v)}
          sufijo={sufijoCantidad}
          obligatorio
          incidencias={
            intentado && faltaCantidad
              ? [
                  {
                    campo: 'cantidad',
                    gravedad: 'error',
                    mensaje: `Faltan los ${unidad === 'kWh' ? 'kWh' : 'litros'}.`,
                  },
                ]
              : []
          }
        />
        <CampoNumero
          etiqueta="Precio"
          valor={precio}
          alCambiar={(v) => alEditarTrio('precioUnitario', v)}
          sufijo={`€/${sufijoCantidad}`}
        />
      </div>

      <p className="form-repostaje__pista">
        Rellena dos de los tres y el otro se calcula solo.
      </p>

      <div className="rejilla-campos">
        <CampoNumero
          etiqueta="Kilómetros"
          valor={km}
          alCambiar={(v) => {
            setKm(v);
            setKmTocado(true);
            setConfirmado(false);
          }}
          sufijo="km"
          incidencias={intentado && validacionKm ? incidenciasDe(validacionKm, 'km') : []}
        />
        <CampoFecha
          etiqueta="Fecha"
          valor={fecha}
          alCambiar={(v) => {
            setFecha(v);
            setConfirmado(false);
          }}
          max={hoyISO()}
          incidencias={intentado && validacionKm ? incidenciasDe(validacionKm, 'fecha') : []}
        />
      </div>

      <Interruptor
        etiqueta="He llenado el depósito"
        ayuda="Sin llenarlo no se puede cerrar un tramo de consumo, pero el registro sigue contando para el gasto."
        valor={lleno}
        alCambiar={setLleno}
      />

      <CampoTexto
        etiqueta="Estación"
        valor={estacion}
        alCambiar={setEstacion}
        marcador="Opcional"
      />

      {estacionesFrecuentes.length > 0 ? (
        <div className="atajos-estacion">
          {estacionesFrecuentes.map((nombre) => (
            <button
              key={nombre}
              type="button"
              className={`atajo${estacion === nombre ? ' es-activo' : ''}`}
              onClick={() => setEstacion(nombre)}
            >
              {nombre}
            </button>
          ))}
        </div>
      ) : null}

      <details className="form-repostaje__avanzado">
        <summary>Ticket y ajustes</summary>
        <Adjuntos ids={adjuntoIds} alCambiar={setAdjuntoIds} />
        <Interruptor
          etiqueta="Me salté algún repostaje sin anotarlo"
          ayuda="Corta la serie de consumo en este punto en vez de dar una cifra imposible."
          valor={ruptura}
          alCambiar={setRuptura}
        />
      </details>

      {intentado && !valido ? (
        <p className="form-repostaje__fallo">Revisa los campos marcados.</p>
      ) : null}
      {pidiendoConfirmacion ? (
        <p className="form-repostaje__confirmar">
          Hay un aviso sobre los kilómetros. Si son correctos, vuelve a pulsar.
        </p>
      ) : null}

      <div className="fila-botones">
        <Boton variante="sutil" alPulsar={alTerminar}>
          Cancelar
        </Boton>
        <Boton
          tipo="submit"
          variante={pidiendoConfirmacion ? 'peligro' : 'principal'}
          cargando={guardando}
        >
          {pidiendoConfirmacion ? 'Guardar de todas formas' : 'Guardar'}
        </Boton>
      </div>

      {editando ? (
        <div className="form-repostaje__borrar">
          {borrandoConfirmado ? (
            <div className="fila-botones">
              <Boton variante="sutil" alPulsar={() => setBorrandoConfirmado(false)}>
                Cancelar
              </Boton>
              <Boton
                variante="peligro"
                alPulsar={() => {
                  void borrarRepostaje(repostaje!.id).then(alTerminar);
                }}
              >
                Borrar definitivamente
              </Boton>
            </div>
          ) : (
            <Boton variante="sutil" alPulsar={() => setBorrandoConfirmado(true)}>
              Borrar este repostaje
            </Boton>
          )}
        </div>
      ) : null}
    </form>
  );
}
