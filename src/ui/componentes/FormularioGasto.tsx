import { useState } from 'react';
import { borrarGasto, guardarGasto } from '@/datos/acciones.ts';
import {
  CATEGORIAS_GASTO,
  ORDEN_CATEGORIA_GASTO,
  PERIODICIDADES,
  opciones,
} from '@/dominio/catalogos.ts';
import { parsearImporte } from '@/dominio/dinero.ts';
import { esFechaISO, hoyISO } from '@/dominio/fechas.ts';
import { parsearKm } from '@/dominio/formato.ts';
import type { CategoriaGasto, Gasto, Periodicidad, Vehiculo } from '@/dominio/tipos.ts';
import { Boton } from './Boton.tsx';
import { CampoArea, CampoFecha, CampoNumero, CampoSelector, CampoTexto, Interruptor } from './Campo.tsx';
import './FormularioGasto.css';

const ORDEN_PERIODICIDAD: readonly Periodicidad[] = ['mensual', 'trimestral', 'semestral', 'anual'];

export function FormularioGasto({
  vehiculo,
  gasto,
  alTerminar,
}: {
  vehiculo: Vehiculo;
  gasto?: Gasto;
  alTerminar: () => void;
}): React.JSX.Element {
  const editando = Boolean(gasto);

  const [categoria, setCategoria] = useState<CategoriaGasto>(gasto?.categoria ?? 'seguro');
  const [descripcion, setDescripcion] = useState(gasto?.descripcion ?? '');
  const [importe, setImporte] = useState(
    gasto ? (gasto.importeCentimos / 100).toFixed(2).replace('.', ',') : '',
  );
  const [fecha, setFecha] = useState(gasto?.fecha ?? hoyISO());
  const [km, setKm] = useState(gasto?.km === undefined ? '' : String(gasto.km));
  const [recurrente, setRecurrente] = useState(gasto?.recurrente ?? false);
  const [periodicidad, setPeriodicidad] = useState<Periodicidad>(gasto?.periodicidad ?? 'anual');
  const [notas, setNotas] = useState(gasto?.notas ?? '');

  const [intentado, setIntentado] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [borrandoConfirmado, setBorrandoConfirmado] = useState(false);

  const importeCentimos = parsearImporte(importe);
  const faltaImporte = importeCentimos === null || importeCentimos === 0;
  const fechaValida = esFechaISO(fecha);
  const valido = !faltaImporte && fechaValida;

  async function guardar(): Promise<void> {
    if (!valido) {
      setIntentado(true);
      return;
    }
    setGuardando(true);
    const kmNumero = parsearKm(km);
    await guardarGasto({
      ...(gasto ? { id: gasto.id } : {}),
      vehiculoId: vehiculo.id,
      categoria,
      ...(descripcion.trim() ? { descripcion: descripcion.trim() } : {}),
      importeCentimos: importeCentimos!,
      fecha,
      recurrente,
      ...(recurrente ? { periodicidad } : {}),
      ...(kmNumero !== null ? { km: kmNumero } : {}),
      ...(notas.trim() ? { notas: notas.trim() } : {}),
      adjuntoIds: gasto?.adjuntoIds ?? [],
    });
    alTerminar();
  }

  return (
    <form
      className="form-gasto"
      onSubmit={(e) => {
        e.preventDefault();
        void guardar();
      }}
    >
      <CampoNumero
        etiqueta="Importe"
        valor={importe}
        alCambiar={setImporte}
        sufijo="€"
        grande
        obligatorio
        incidencias={
          intentado && faltaImporte
            ? [{ campo: 'importe', gravedad: 'error', mensaje: 'Falta el importe.' }]
            : []
        }
      />

      <CampoSelector
        etiqueta="Categoría"
        valor={categoria}
        alCambiar={setCategoria}
        opciones={opciones(CATEGORIAS_GASTO, ORDEN_CATEGORIA_GASTO)}
        obligatorio
      />

      <CampoTexto
        etiqueta="Descripción"
        valor={descripcion}
        alCambiar={setDescripcion}
        marcador="Opcional"
      />

      <div className="rejilla-campos">
        <CampoFecha
          etiqueta="Fecha"
          valor={fecha}
          alCambiar={setFecha}
          obligatorio
          incidencias={
            intentado && !fechaValida
              ? [{ campo: 'fecha', gravedad: 'error', mensaje: 'La fecha no es válida.' }]
              : []
          }
        />
        <CampoNumero
          etiqueta="Kilómetros"
          ayuda="Opcional."
          valor={km}
          alCambiar={setKm}
          sufijo="km"
        />
      </div>

      <Interruptor
        etiqueta="Se repite"
        ayuda="El seguro, el impuesto o el parking vuelven cada cierto tiempo."
        valor={recurrente}
        alCambiar={setRecurrente}
      />

      {recurrente ? (
        <CampoSelector
          etiqueta="Cada cuánto"
          valor={periodicidad}
          alCambiar={setPeriodicidad}
          opciones={opciones(PERIODICIDADES, ORDEN_PERIODICIDAD)}
        />
      ) : null}

      <CampoArea etiqueta="Notas" valor={notas} alCambiar={setNotas} filas={2} />

      {intentado && !valido ? (
        <p className="form-gasto__fallo">Revisa los campos marcados.</p>
      ) : null}

      <div className="fila-botones">
        <Boton variante="sutil" alPulsar={alTerminar}>
          Cancelar
        </Boton>
        <Boton tipo="submit" variante="principal" cargando={guardando}>
          Guardar
        </Boton>
      </div>

      {editando ? (
        <div className="form-gasto__borrar">
          {borrandoConfirmado ? (
            <div className="fila-botones">
              <Boton variante="sutil" alPulsar={() => setBorrandoConfirmado(false)}>
                Cancelar
              </Boton>
              <Boton
                variante="peligro"
                alPulsar={() => {
                  void borrarGasto(gasto!.id).then(alTerminar);
                }}
              >
                Borrar definitivamente
              </Boton>
            </div>
          ) : (
            <Boton variante="sutil" alPulsar={() => setBorrandoConfirmado(true)}>
              Borrar este gasto
            </Boton>
          )}
        </div>
      ) : null}
    </form>
  );
}
