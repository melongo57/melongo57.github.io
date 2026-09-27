import { useEffect, useMemo, useState } from 'react';
import { borrarMantenimiento, guardarMantenimiento } from '@/datos/acciones.ts';
import { parsearImporte } from '@/dominio/dinero.ts';
import { hoyISO } from '@/dominio/fechas.ts';
import { parsearKm, tituloDeServicio } from '@/dominio/formato.ts';
import { kmEnFecha } from '@/dominio/odometro.ts';
import type { Id, Mantenimiento, PuntoOdometro, Vehiculo } from '@/dominio/tipos.ts';
import { incidenciasDe, validarMantenimiento } from '@/dominio/validacion.ts';
import { useAlertas } from '../ganchos/consultas.ts';
import { Adjuntos } from './Adjuntos.tsx';
import { Boton } from './Boton.tsx';
import { CampoArea, CampoFecha, CampoNumero, CampoTexto } from './Campo.tsx';
import './FormularioMantenimiento.css';

/**
 * Alta y edición de un servicio hecho.
 *
 * Lo primero es marcar qué alertas cubre: un servicio oficial deja a cero la
 * revisión, el aceite y los filtros de un golpe, y marcarlas aquí es lo que
 * hace que dejen de avisar. El título se escribe solo a partir de lo marcado,
 * así que en el caso normal no hay nada que teclear. Para una reparación
 * suelta que no se repite, se deja todo sin marcar y se escribe el título.
 */
export function FormularioMantenimiento({
  vehiculo,
  puntos,
  mantenimiento,
  alertasIniciales = [],
  alTerminar,
}: {
  vehiculo: Vehiculo;
  puntos: readonly PuntoOdometro[];
  /** Si viene, se edita; si no, se crea. */
  mantenimiento?: Mantenimiento;
  /** Alertas marcadas de entrada al crear. */
  alertasIniciales?: readonly Id[];
  alTerminar: () => void;
}): React.JSX.Element {
  const editando = Boolean(mantenimiento);
  const alertas = useAlertas(vehiculo.id);

  const [alertaIds, setAlertaIds] = useState<Id[]>(
    mantenimiento?.alertaIds ?? [...alertasIniciales],
  );
  const [titulo, setTitulo] = useState(mantenimiento?.titulo ?? '');
  const [tituloTocado, setTituloTocado] = useState(editando);
  const [fecha, setFecha] = useState(mantenimiento?.fecha ?? hoyISO());
  const [km, setKm] = useState(mantenimiento?.km === undefined ? '' : String(mantenimiento.km));
  const [kmTocado, setKmTocado] = useState(editando);
  const [taller, setTaller] = useState(mantenimiento?.taller ?? '');
  const [coste, setCoste] = useState(
    mantenimiento ? (mantenimiento.costeCentimos / 100).toFixed(2).replace('.', ',') : '',
  );
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

  // El título sigue a lo marcado mientras el usuario no lo escriba él.
  useEffect(() => {
    if (tituloTocado || !alertas) return;
    const nombres = alertas.filter((a) => alertaIds.includes(a.id)).map((a) => a.nombre);
    setTitulo(nombres.length > 0 ? tituloDeServicio(nombres) : '');
  }, [alertaIds, alertas, tituloTocado]);

  function alternar(id: Id): void {
    setAlertaIds((actuales) =>
      actuales.includes(id) ? actuales.filter((x) => x !== id) : [...actuales, id],
    );
    setConfirmado(false);
  }

  const kmNumero = parsearKm(km);
  const costeCentimos = parsearImporte(coste) ?? 0;

  const validacion = useMemo(
    () =>
      validarMantenimiento(
        puntos,
        {
          fecha,
          costeCentimos,
          titulo,
          ...(kmNumero !== null ? { km: kmNumero } : {}),
        },
        // Al editar, el propio registro no debe compararse consigo mismo.
        mantenimiento ? { excluirRefId: mantenimiento.id } : {},
      ),
    [puntos, fecha, costeCentimos, titulo, kmNumero, mantenimiento],
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
      titulo: titulo.trim(),
      alertaIds,
      fecha,
      ...(kmNumero !== null ? { km: kmNumero } : {}),
      ...(taller.trim() ? { taller: taller.trim() } : {}),
      costeCentimos,
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
      {alertas && alertas.length > 0 ? (
        <section className="form-mant__alertas">
          <p className="form-mant__pregunta">¿Qué se ha hecho?</p>
          <div className="opciones">
            {alertas.map((a) => {
              const marcada = alertaIds.includes(a.id);
              return (
                <button
                  key={a.id}
                  type="button"
                  className="opcion"
                  aria-pressed={marcada}
                  onClick={() => alternar(a.id)}
                >
                  <span aria-hidden="true">{marcada ? '✓' : a.icono}</span>
                  {a.nombre}
                </button>
              );
            })}
          </div>
          <p className="form-mant__ayuda">
            Las alertas marcadas vuelven a contar desde este servicio.
          </p>
        </section>
      ) : null}

      <CampoTexto
        etiqueta="Título"
        valor={titulo}
        alCambiar={(v) => {
          setTitulo(v);
          setTituloTocado(true);
          setConfirmado(false);
        }}
        marcador="Servicio anual, cambio de embrague…"
        obligatorio
        incidencias={avisos('titulo')}
      />

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

      <details className="mas-opciones" open={Boolean(taller || notas || adjuntoIds.length)}>
        <summary>Taller, notas y facturas</summary>
        <div className="mas-opciones__cuerpo">
          <CampoTexto
            etiqueta="Taller"
            valor={taller}
            alCambiar={setTaller}
            marcador="Dónde se ha hecho"
          />
          <CampoArea
            etiqueta="Notas"
            valor={notas}
            alCambiar={setNotas}
            filas={2}
            marcador="Aceite 5W30, filtro de aire…"
          />
          <Adjuntos ids={adjuntoIds} alCambiar={setAdjuntoIds} />
        </div>
      </details>

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
              <p>
                Se borra este registro del histórico. Las alertas que cubría conservan su
                última vez: si hace falta, cámbiala desde la alerta.
              </p>
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
              Borrar este servicio
            </Boton>
          )}
        </div>
      ) : null}
    </form>
  );
}
