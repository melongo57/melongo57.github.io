import { useEffect, useMemo, useState } from 'react';
import { borrarMantenimiento, guardarMantenimiento } from '@/datos/acciones.ts';
import { ORDEN_MANTENIMIENTO, TIPOS_MANTENIMIENTO, opciones } from '@/dominio/catalogos.ts';
import { parsearImporte } from '@/dominio/dinero.ts';
import { hoyISO } from '@/dominio/fechas.ts';
import { parsearKm } from '@/dominio/formato.ts';
import { kmEnFecha } from '@/dominio/odometro.ts';
import type { Id, Mantenimiento, PuntoOdometro, TipoMantenimiento, Vehiculo } from '@/dominio/tipos.ts';
import { incidenciasDe, validarMantenimiento } from '@/dominio/validacion.ts';
import { Adjuntos } from './Adjuntos.tsx';
import { Boton } from './Boton.tsx';
import { CampoArea, CampoFecha, CampoNumero, CampoSelector, CampoTexto } from './Campo.tsx';
import './FormularioMantenimiento.css';

/**
 * Alta y edición de un mantenimiento.
 *
 * Los kilómetros son opcionales —a veces solo tienes la fecha de la factura—
 * pero se prerrellenan con la estimación de esa fecha, porque de ellos depende
 * cuándo vuelve a tocar.
 */
export function FormularioMantenimiento({
  vehiculo,
  puntos,
  mantenimiento,
  alTerminar,
}: {
  vehiculo: Vehiculo;
  puntos: readonly PuntoOdometro[];
  /** Si viene, se edita; si no, se crea. */
  mantenimiento?: Mantenimiento;
  alTerminar: () => void;
}): React.JSX.Element {
  const editando = Boolean(mantenimiento);

  const [tipo, setTipo] = useState<TipoMantenimiento>(mantenimiento?.tipo ?? 'aceite');
  const [tipoPersonalizado, setTipoPersonalizado] = useState(
    mantenimiento?.tipoPersonalizado ?? '',
  );
  const [fecha, setFecha] = useState(mantenimiento?.fecha ?? hoyISO());
  const [km, setKm] = useState(mantenimiento?.km === undefined ? '' : String(mantenimiento.km));
  const [kmTocado, setKmTocado] = useState(editando);
  const [taller, setTaller] = useState(mantenimiento?.taller ?? '');
  const [coste, setCoste] = useState(
    mantenimiento ? (mantenimiento.costeCentimos / 100).toFixed(2).replace('.', ',') : '',
  );
  const [piezas, setPiezas] = useState((mantenimiento?.piezas ?? []).join(', '));
  const [notas, setNotas] = useState(mantenimiento?.notas ?? '');
  const [adjuntoIds, setAdjuntoIds] = useState<Id[]>(mantenimiento?.adjuntoIds ?? []);

  const [intentado, setIntentado] = useState(false);
  const [confirmado, setConfirmado] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [borrandoConfirmado, setBorrandoConfirmado] = useState(false);

  const sugerido = useMemo(() => kmEnFecha(puntos, fecha), [puntos, fecha]);

  useEffect(() => {
    if (!kmTocado && sugerido !== null) setKm(String(sugerido));
  }, [sugerido, kmTocado]);

  const kmNumero = parsearKm(km);
  const costeCentimos = parsearImporte(coste) ?? 0;

  const validacion = useMemo(
    () =>
      validarMantenimiento(
        puntos,
        {
          fecha,
          costeCentimos,
          tipo,
          ...(tipoPersonalizado ? { tipoPersonalizado } : {}),
          ...(kmNumero !== null ? { km: kmNumero } : {}),
        },
        // Al editar, el propio registro no debe compararse consigo mismo.
        mantenimiento ? { excluirRefId: mantenimiento.id } : {},
      ),
    [puntos, fecha, costeCentimos, tipo, tipoPersonalizado, kmNumero, mantenimiento],
  );

  const avisos = (campo: string) => (intentado ? incidenciasDe(validacion, campo) : []);
  const pidiendoConfirmacion = validacion.requiereConfirmacion && confirmado;

  async function guardar(): Promise<void> {
    if (!validacion.valido) {
      setIntentado(true);
      return;
    }
    if (validacion.requiereConfirmacion && !confirmado) {
      setIntentado(true);
      setConfirmado(true);
      return;
    }

    setGuardando(true);
    await guardarMantenimiento({
      ...(mantenimiento ? { id: mantenimiento.id } : {}),
      vehiculoId: vehiculo.id,
      tipo,
      ...(tipo === 'otro' && tipoPersonalizado.trim()
        ? { tipoPersonalizado: tipoPersonalizado.trim() }
        : {}),
      fecha,
      ...(kmNumero !== null ? { km: kmNumero } : {}),
      ...(taller.trim() ? { taller: taller.trim() } : {}),
      costeCentimos,
      piezas: piezas
        .split(',')
        .map((p) => p.trim())
        .filter(Boolean),
      ...(notas.trim() ? { notas: notas.trim() } : {}),
      adjuntoIds,
    });
    alTerminar();
  }

  async function eliminar(): Promise<void> {
    if (!mantenimiento) return;
    setGuardando(true);
    await borrarMantenimiento(mantenimiento.id);
    alTerminar();
  }

  return (
    <form
      className="form-mant"
      onSubmit={(e) => {
        e.preventDefault();
        void guardar();
      }}
    >
      <CampoSelector
        etiqueta="Qué se ha hecho"
        valor={tipo}
        alCambiar={(v) => {
          setTipo(v);
          setConfirmado(false);
        }}
        opciones={opciones(TIPOS_MANTENIMIENTO, ORDEN_MANTENIMIENTO)}
        obligatorio
      />

      {tipo === 'otro' ? (
        <CampoTexto
          etiqueta="Nombre"
          ayuda="Con este nombre podrás darle su propia recurrencia."
          valor={tipoPersonalizado}
          alCambiar={(v) => {
            setTipoPersonalizado(v);
            setConfirmado(false);
          }}
          marcador="Amortiguadores"
          obligatorio
          incidencias={avisos('tipoPersonalizado')}
        />
      ) : null}

      <div className="rejilla-campos">
        <CampoFecha
          etiqueta="Fecha"
          valor={fecha}
          alCambiar={(v) => {
            setFecha(v);
            setConfirmado(false);
          }}
          max={hoyISO()}
          obligatorio
          incidencias={avisos('fecha')}
        />
        <CampoNumero
          etiqueta="Kilómetros"
          valor={km}
          alCambiar={(v) => {
            setKm(v);
            setKmTocado(true);
            setConfirmado(false);
          }}
          sufijo="km"
          incidencias={avisos('km')}
        />
        <CampoNumero
          etiqueta="Coste"
          valor={coste}
          alCambiar={(v) => {
            setCoste(v);
            setConfirmado(false);
          }}
          sufijo="€"
          incidencias={avisos('coste')}
        />
      </div>

      <CampoTexto
        etiqueta="Taller"
        valor={taller}
        alCambiar={setTaller}
        marcador="Dónde se ha hecho"
      />

      <CampoTexto
        etiqueta="Piezas"
        ayuda="Separadas por comas."
        valor={piezas}
        alCambiar={setPiezas}
        marcador="Aceite 5W30 5 l, Filtro de aceite"
      />

      <Adjuntos ids={adjuntoIds} alCambiar={setAdjuntoIds} />

      <CampoArea etiqueta="Notas" valor={notas} alCambiar={setNotas} filas={2} />

      {intentado && !validacion.valido ? (
        <p className="form-mant__fallo">Revisa los campos marcados.</p>
      ) : null}

      {pidiendoConfirmacion ? (
        <p className="form-mant__confirmar">
          Hay avisos sin resolver. Si son correctos, vuelve a pulsar para guardar.
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
        <div className="form-mant__borrar">
          {borrandoConfirmado ? (
            <>
              <p>Se borrará este registro y el próximo vencimiento se recalculará.</p>
              <div className="fila-botones">
                <Boton variante="sutil" alPulsar={() => setBorrandoConfirmado(false)}>
                  Cancelar
                </Boton>
                <Boton variante="peligro" alPulsar={() => void eliminar()} cargando={guardando}>
                  Borrar definitivamente
                </Boton>
              </div>
            </>
          ) : (
            <Boton variante="sutil" alPulsar={() => setBorrandoConfirmado(true)}>
              Borrar este mantenimiento
            </Boton>
          )}
        </div>
      ) : null}
    </form>
  );
}
