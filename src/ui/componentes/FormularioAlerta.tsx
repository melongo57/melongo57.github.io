import { useMemo, useState } from 'react';
import { borrarAlerta, crearAlerta, guardarAlerta } from '@/datos/acciones.ts';
import {
  APUNTES_ALERTA,
  ICONOS_ALERTA,
  ORDEN_APUNTE_ALERTA,
  opciones,
  sugerenciasAlerta,
  type SugerenciaAlerta,
} from '@/dominio/catalogos.ts';
import { esFechaISO, hoyISO } from '@/dominio/fechas.ts';
import { formatearKm, parsearKm } from '@/dominio/formato.ts';
import type { Alerta, ApunteAlerta, Vehiculo } from '@/dominio/tipos.ts';
import { incidenciasDe, validarAlerta } from '@/dominio/validacion.ts';
import { describirLimite, limitesDe } from '@/dominio/vencimientos.ts';
import { Boton } from './Boton.tsx';
import { CampoArea, CampoFecha, CampoNumero, CampoSelector, CampoTexto } from './Campo.tsx';
import './FormularioAlerta.css';

/** Un campo vacío significa «esto no cuenta», no cero. */
function aNumero(texto: string): number | undefined {
  const valor = parsearKm(texto);
  return valor === null ? undefined : valor;
}

function aTexto(valor: number | undefined): string {
  return valor === undefined ? '' : String(valor);
}

function normalizar(nombre: string): string {
  return nombre.trim().toLocaleLowerCase('es');
}

/**
 * Alta y edición de una alerta.
 *
 * Al crear, lo primero son las sugerencias del vehículo: un toque rellena
 * nombre, icono e intervalos, y lo que queda es decir cuándo fue la última
 * vez. Se ocultan las que el vehículo ya tiene, para que la lista sirva de
 * recordatorio de lo que falta y no de lo que ya está.
 *
 * Lo secundario —antelación del aviso, dónde se apunta el coste, icono,
 * notas— va plegado: casi nunca hace falta tocarlo.
 */
export function FormularioAlerta({
  vehiculo,
  alerta,
  existentes = [],
  kmEstimado,
  alTerminar,
}: {
  vehiculo: Vehiculo;
  /** Si viene, se edita; si no, se crea. */
  alerta?: Alerta;
  /** Alertas que ya tiene el vehículo, para no volver a sugerirlas. */
  existentes?: readonly Alerta[];
  /** Kilómetros estimados de hoy, para el atajo «Fue hoy». */
  kmEstimado?: number;
  alTerminar: () => void;
}): React.JSX.Element {
  const editando = Boolean(alerta);

  const [nombre, setNombre] = useState(alerta?.nombre ?? '');
  const [icono, setIcono] = useState(alerta?.icono ?? '🔧');
  const [cadaKm, setCadaKm] = useState(aTexto(alerta?.cadaKm));
  const [cadaMeses, setCadaMeses] = useState(aTexto(alerta?.cadaMeses));
  const [venceEl, setVenceEl] = useState(alerta?.venceEl ?? '');
  const [ultimaFecha, setUltimaFecha] = useState(alerta?.ultimaFecha ?? '');
  const [ultimoKm, setUltimoKm] = useState(aTexto(alerta?.ultimoKm));
  const [avisoDias, setAvisoDias] = useState(aTexto(alerta?.avisoDias));
  const [avisoKm, setAvisoKm] = useState(aTexto(alerta?.avisoKm));
  const [apunte, setApunte] = useState<ApunteAlerta>(alerta?.apunte ?? 'mantenimiento');
  const [notas, setNotas] = useState(alerta?.notas ?? '');
  const [pideFecha, setPideFecha] = useState(Boolean(alerta?.venceEl));
  const [elegida, setElegida] = useState<string | null>(null);

  const [intentado, setIntentado] = useState(false);
  const [confirmado, setConfirmado] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [borrando, setBorrando] = useState(false);

  const sugerencias = useMemo(() => {
    const yaTiene = new Set(existentes.map((a) => normalizar(a.nombre)));
    return sugerenciasAlerta(vehiculo.categoria, vehiculo.combustible).filter(
      (s) => !yaTiene.has(normalizar(s.nombre)),
    );
  }, [vehiculo.categoria, vehiculo.combustible, existentes]);

  function elegir(s: SugerenciaAlerta): void {
    setElegida(s.clave);
    setNombre(s.nombre);
    setIcono(s.icono);
    setApunte(s.apunte);
    setCadaKm(aTexto(s.cadaKm));
    setCadaMeses(aTexto(s.cadaMeses));
    setAvisoDias(aTexto(s.avisoDias));
    setAvisoKm(aTexto(s.avisoKm));
    setPideFecha(Boolean(s.pideFecha));
    setConfirmado(false);
  }

  const datos = {
    nombre: nombre.trim(),
    icono,
    apunte,
    cadaKm: aNumero(cadaKm),
    cadaMeses: aNumero(cadaMeses),
    venceEl: venceEl || undefined,
    ultimaFecha: ultimaFecha || undefined,
    ultimoKm: aNumero(ultimoKm),
    avisoDias: aNumero(avisoDias),
    avisoKm: aNumero(avisoKm),
    notas: notas.trim() || undefined,
  };

  const validacion = validarAlerta(datos);
  const avisos = (campo: string) => (intentado ? incidenciasDe(validacion, campo) : []);
  const pidiendoConfirmacion = validacion.requiereConfirmacion && confirmado;

  const prevision =
    esFechaISO(datos.ultimaFecha ?? '') || datos.ultimoKm !== undefined || datos.venceEl
      ? describirLimite(limitesDe(datos))
      : '';

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
    if (alerta) {
      // `undefined` explícito: vaciar un campo tiene que borrarlo, no dejar
      // el valor anterior.
      await guardarAlerta(alerta.id, datos);
    } else {
      await crearAlerta({
        vehiculoId: vehiculo.id,
        ...Object.fromEntries(Object.entries(datos).filter(([, v]) => v !== undefined)),
      } as Parameters<typeof crearAlerta>[0]);
    }
    alTerminar();
  }

  return (
    <form
      className="form-alerta"
      onSubmit={(e) => {
        e.preventDefault();
        void guardar();
      }}
    >
      {!editando && sugerencias.length > 0 ? (
        <section className="form-alerta__sugerencias">
          <p className="form-alerta__pregunta">Elige una o escribe la tuya</p>
          <div className="opciones">
            {sugerencias.map((s) => (
              <button
                key={s.clave}
                type="button"
                className="opcion"
                aria-pressed={elegida === s.clave}
                onClick={() => elegir(s)}
              >
                <span aria-hidden="true">{s.icono}</span>
                {s.nombre}
              </button>
            ))}
          </div>
        </section>
      ) : null}

      <CampoTexto
        etiqueta="Nombre"
        valor={nombre}
        alCambiar={(v) => {
          setNombre(v);
          setElegida(null);
        }}
        marcador="Servicio anual, cambio de aceite…"
        obligatorio
        incidencias={avisos('nombre')}
      />

      <fieldset className="form-alerta__grupo">
        <legend>Cada cuánto</legend>
        <p className="form-alerta__ayuda">
          Lo que ocurra antes. Deja vacío lo que no cuente.
        </p>
        <div className="rejilla-campos">
          <CampoNumero
            etiqueta="Cada"
            valor={cadaKm}
            alCambiar={(v) => {
              setCadaKm(v);
              setConfirmado(false);
            }}
            sufijo="km"
            incidencias={avisos('cadaKm')}
          />
          <CampoNumero
            etiqueta="O cada"
            valor={cadaMeses}
            alCambiar={(v) => {
              setCadaMeses(v);
              setConfirmado(false);
            }}
            sufijo="meses"
            incidencias={avisos('cadaMeses')}
          />
        </div>

        {pideFecha || venceEl ? (
          <CampoFecha
            etiqueta="Próxima fecha"
            ayuda="Si sabes el día exacto (pegatina de la ITV, fecha de la póliza). Manda sobre lo de arriba."
            valor={venceEl}
            alCambiar={setVenceEl}
            incidencias={avisos('venceEl')}
          />
        ) : (
          <button type="button" className="form-alerta__enlace" onClick={() => setPideFecha(true)}>
            ＋ Sé la fecha exacta del próximo
          </button>
        )}
      </fieldset>

      <fieldset className="form-alerta__grupo">
        <legend>Última vez que se hizo</legend>
        <div className="rejilla-campos">
          <CampoFecha
            etiqueta="Fecha"
            valor={ultimaFecha}
            alCambiar={(v) => {
              setUltimaFecha(v);
              setConfirmado(false);
            }}
            max={hoyISO()}
            incidencias={avisos('ultimaFecha')}
          />
          <CampoNumero
            etiqueta="Kilómetros"
            valor={ultimoKm}
            alCambiar={setUltimoKm}
            sufijo="km"
            incidencias={avisos('ultimoKm')}
          />
        </div>
        <div className="fila-botones form-alerta__atajos">
          <Boton
            variante="sutil"
            icono="✓"
            alPulsar={() => {
              setUltimaFecha(hoyISO());
              if (kmEstimado !== undefined) setUltimoKm(String(kmEstimado));
            }}
          >
            Fue hoy
          </Boton>
          {kmEstimado !== undefined ? (
            <span className="form-alerta__km">Ahora: {formatearKm(kmEstimado)}</span>
          ) : null}
        </div>
        {prevision ? <p className="form-alerta__prevision">{prevision}</p> : null}
      </fieldset>

      <details className="mas-opciones">
        <summary>Más opciones</summary>
        <div className="mas-opciones__cuerpo">
          <div className="rejilla-campos">
            <CampoNumero
              etiqueta="Avisar antes"
              ayuda="Vacío: lo de Ajustes."
              valor={avisoDias}
              alCambiar={(v) => {
                setAvisoDias(v);
                setConfirmado(false);
              }}
              sufijo="días"
            />
            <CampoNumero
              etiqueta="O antes"
              ayuda="Vacío: lo de Ajustes."
              valor={avisoKm}
              alCambiar={(v) => {
                setAvisoKm(v);
                setConfirmado(false);
              }}
              sufijo="km"
              incidencias={avisos('avisoKm')}
            />
          </div>

          <CampoSelector
            etiqueta="Al hacerla, el coste se apunta en"
            valor={apunte}
            alCambiar={setApunte}
            opciones={opciones(APUNTES_ALERTA, ORDEN_APUNTE_ALERTA)}
          />

          <div className="form-alerta__iconos">
            <span className="form-alerta__subtitulo">Icono</span>
            <div className="opciones">
              {ICONOS_ALERTA.map((i) => (
                <button
                  key={i}
                  type="button"
                  className="opcion opcion--icono"
                  aria-pressed={icono === i}
                  aria-label={`Icono ${i}`}
                  onClick={() => setIcono(i)}
                >
                  {i}
                </button>
              ))}
            </div>
          </div>

          <CampoArea etiqueta="Notas" valor={notas} alCambiar={setNotas} filas={2} />
        </div>
      </details>

      {intentado && !validacion.valido ? (
        <p className="form-alerta__fallo">Revisa los campos marcados.</p>
      ) : null}
      {pidiendoConfirmacion ? (
        <p className="form-alerta__confirmar">
          Hay un aviso sin resolver. Si es correcto, vuelve a pulsar para guardar.
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
          {pidiendoConfirmacion ? 'Guardar de todas formas' : editando ? 'Guardar' : 'Añadir alerta'}
        </Boton>
      </div>

      {alerta ? (
        <div className="form-alerta__borrar">
          {borrando ? (
            <>
              <p>
                Se borra la alerta. El histórico de servicios hechos se queda como está.
              </p>
              <div className="fila-botones">
                <Boton variante="sutil" alPulsar={() => setBorrando(false)}>
                  Cancelar
                </Boton>
                <Boton
                  variante="peligro"
                  alPulsar={() => {
                    void borrarAlerta(alerta.id).then(alTerminar);
                  }}
                >
                  Borrar alerta
                </Boton>
              </div>
            </>
          ) : (
            <Boton variante="sutil" icono="🗑" alPulsar={() => setBorrando(true)}>
              Borrar esta alerta
            </Boton>
          )}
        </div>
      ) : null}
    </form>
  );
}
