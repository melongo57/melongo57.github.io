import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { borrarRegla, completarReglas, crearRegla, guardarRegla } from '@/datos/acciones.ts';
import {
  ORDEN_MANTENIMIENTO,
  TIPOS_MANTENIMIENTO,
  nombreMantenimiento,
  opciones,
} from '@/dominio/catalogos.ts';
import { parsearKm } from '@/dominio/formato.ts';
import type { ReglaMantenimiento, TipoMantenimiento } from '@/dominio/tipos.ts';
import { incidenciasDe, validarRegla } from '@/dominio/validacion.ts';
import { Boton, EnlaceBoton } from '../componentes/Boton.tsx';
import { CampoNumero, CampoSelector, CampoTexto, Interruptor } from '../componentes/Campo.tsx';
import { HojaModal } from '../componentes/HojaModal.tsx';
import { useReglas, useVehiculo } from '../ganchos/consultas.ts';
import './Reglas.css';

/** Un campo vacío significa «esta dimensión no cuenta», no cero. */
function aNumero(texto: string): number | undefined {
  const valor = parsearKm(texto);
  return valor === null ? undefined : valor;
}

function deNumero(valor: number | undefined): string {
  return valor === undefined ? '' : String(valor);
}

function EditorRegla({
  regla,
  alTerminar,
}: {
  regla: ReglaMantenimiento;
  alTerminar: () => void;
}): React.JSX.Element {
  const [cadaKm, setCadaKm] = useState(deNumero(regla.cadaKm));
  const [cadaMeses, setCadaMeses] = useState(deNumero(regla.cadaMeses));
  const [avisoKm, setAvisoKm] = useState(deNumero(regla.avisoKm));
  const [avisoDias, setAvisoDias] = useState(deNumero(regla.avisoDias));
  const [intentado, setIntentado] = useState(false);
  const [confirmado, setConfirmado] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [borrandoConfirmado, setBorrandoConfirmado] = useState(false);

  const datos = {
    cadaKm: aNumero(cadaKm),
    cadaMeses: aNumero(cadaMeses),
    avisoKm: aNumero(avisoKm),
    avisoDias: aNumero(avisoDias),
  };
  const validacion = validarRegla(datos);
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
    await guardarRegla(regla.id, datos);
    alTerminar();
  }

  return (
    <form
      className="editor-regla"
      onSubmit={(e) => {
        e.preventDefault();
        void guardar();
      }}
    >
      <p className="editor-regla__explica">
        Vence <strong>lo que ocurra antes</strong> de las dos cosas. Deja un campo vacío si esa
        dimensión no cuenta: la batería, por ejemplo, se cambia por años y no por kilómetros.
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

      <p className="editor-regla__seccion">Con cuánta antelación avisar</p>
      <div className="rejilla-campos">
        <CampoNumero
          etiqueta="Antes de"
          ayuda="Vacío: el valor por defecto."
          valor={avisoKm}
          alCambiar={(v) => {
            setAvisoKm(v);
            setConfirmado(false);
          }}
          sufijo="km"
          incidencias={avisos('avisoKm')}
        />
        <CampoNumero
          etiqueta="Antes de"
          ayuda="Vacío: el valor por defecto."
          valor={avisoDias}
          alCambiar={(v) => {
            setAvisoDias(v);
            setConfirmado(false);
          }}
          sufijo="días"
          incidencias={avisos('avisoDias')}
        />
      </div>

      {intentado && !validacion.valido ? (
        <p className="editor-regla__fallo">Revisa los campos marcados.</p>
      ) : null}
      {pidiendoConfirmacion ? (
        <p className="editor-regla__confirmar">
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
          {pidiendoConfirmacion ? 'Guardar de todas formas' : 'Guardar'}
        </Boton>
      </div>

      {regla.tipo === 'otro' ? (
        <div className="editor-regla__borrar">
          {borrandoConfirmado ? (
            <div className="fila-botones">
              <Boton variante="sutil" alPulsar={() => setBorrandoConfirmado(false)}>
                Cancelar
              </Boton>
              <Boton
                variante="peligro"
                alPulsar={() => {
                  void borrarRegla(regla.id).then(alTerminar);
                }}
              >
                Borrar la recurrencia
              </Boton>
            </div>
          ) : (
            <Boton variante="sutil" alPulsar={() => setBorrandoConfirmado(true)}>
              Borrar esta recurrencia
            </Boton>
          )}
        </div>
      ) : null}
    </form>
  );
}

function NuevaRegla({
  vehiculoId,
  alTerminar,
}: {
  vehiculoId: string;
  alTerminar: () => void;
}): React.JSX.Element {
  const [tipo, setTipo] = useState<TipoMantenimiento>('otro');
  const [nombre, setNombre] = useState('');
  const [cadaKm, setCadaKm] = useState('');
  const [cadaMeses, setCadaMeses] = useState('');
  const [intentado, setIntentado] = useState(false);

  const datos = { cadaKm: aNumero(cadaKm), cadaMeses: aNumero(cadaMeses) };
  const validacion = validarRegla(datos);
  const faltaNombre = tipo === 'otro' && !nombre.trim();

  return (
    <form
      className="editor-regla"
      onSubmit={(e) => {
        e.preventDefault();
        if (!validacion.valido || faltaNombre) {
          setIntentado(true);
          return;
        }
        void crearRegla({
          vehiculoId,
          tipo,
          ...(tipo === 'otro' ? { tipoPersonalizado: nombre.trim() } : {}),
          ...datos,
          activa: true,
        }).then(alTerminar);
      }}
    >
      <CampoSelector
        etiqueta="Tipo"
        valor={tipo}
        alCambiar={setTipo}
        opciones={opciones(TIPOS_MANTENIMIENTO, ORDEN_MANTENIMIENTO)}
      />

      {tipo === 'otro' ? (
        <CampoTexto
          etiqueta="Nombre"
          valor={nombre}
          alCambiar={setNombre}
          marcador="Amortiguadores"
          obligatorio
          incidencias={
            intentado && faltaNombre
              ? [{ campo: 'nombre', gravedad: 'error', mensaje: 'Ponle un nombre.' }]
              : []
          }
        />
      ) : null}

      <div className="rejilla-campos">
        <CampoNumero
          etiqueta="Cada"
          valor={cadaKm}
          alCambiar={setCadaKm}
          sufijo="km"
          incidencias={intentado ? incidenciasDe(validacion, 'cadaKm') : []}
        />
        <CampoNumero
          etiqueta="O cada"
          valor={cadaMeses}
          alCambiar={setCadaMeses}
          sufijo="meses"
          incidencias={intentado ? incidenciasDe(validacion, 'cadaMeses') : []}
        />
      </div>

      <div className="fila-botones">
        <Boton variante="sutil" alPulsar={alTerminar}>
          Cancelar
        </Boton>
        <Boton tipo="submit" variante="principal">
          Añadir
        </Boton>
      </div>
    </form>
  );
}

/** Resume una regla en una frase: «Cada 15.000 km o 12 meses». */
function describirRegla(regla: ReglaMantenimiento): string {
  const partes: string[] = [];
  if (regla.cadaKm !== undefined) partes.push(`${new Intl.NumberFormat('es-ES').format(regla.cadaKm)} km`);
  if (regla.cadaMeses !== undefined) {
    partes.push(regla.cadaMeses === 1 ? '1 mes' : `${regla.cadaMeses} meses`);
  }
  if (partes.length === 0) return 'Sin intervalo';
  return `Cada ${partes.join(' o ')}`;
}

export function Reglas(): React.JSX.Element {
  const { id } = useParams<{ id: string }>();
  const vehiculo = useVehiculo(id);
  const reglas = useReglas(id);

  const [editando, setEditando] = useState<ReglaMantenimiento | null>(null);
  const [creando, setCreando] = useState(false);

  /*
   * Un vehículo dado de alta antes de que existiera un tipo de mantenimiento
   * —o al que se le cambia la categoría— se quedaría sin esa regla para
   * siempre. Al abrir el editor se completan las que falten de su plantilla.
   */
  useEffect(() => {
    if (vehiculo) void completarReglas(vehiculo);
  }, [vehiculo]);

  if (vehiculo === null) {
    return (
      <div className="contenedor">
        <div className="vacio">
          <h2>Ese vehículo ya no existe</h2>
          <EnlaceBoton a="/vehiculos" variante="principal">
            Ver mis vehículos
          </EnlaceBoton>
        </div>
      </div>
    );
  }

  const ordenadas = [...(reglas ?? [])].sort(
    (a, b) => ORDEN_MANTENIMIENTO.indexOf(a.tipo) - ORDEN_MANTENIMIENTO.indexOf(b.tipo),
  );

  return (
    <div className="contenedor reglas">
      <header className="reglas__cabecera">
        <div>
          <h1>Cada cuánto toca</h1>
          <p className="reglas__sub">{vehiculo?.alias ?? ''}</p>
        </div>
        <Boton icono="＋" alPulsar={() => setCreando(true)}>
          Añadir
        </Boton>
      </header>

      <p className="reglas__intro">
        Estos intervalos vienen de la categoría del vehículo y son un punto de partida
        razonable, no el libro del fabricante. Ajústalos a lo que diga tu manual.
      </p>

      {reglas === undefined ? (
        <p className="cargando">Cargando…</p>
      ) : (
        <ul className="reglas__lista">
          {ordenadas.map((regla) => (
            <li key={regla.id}>
              <div className={`regla-fila${regla.activa ? '' : ' es-inactiva'}`}>
                <button
                  type="button"
                  className="regla-fila__abrir"
                  onClick={() => setEditando(regla)}
                >
                  <span className="regla-fila__icono" aria-hidden="true">
                    {TIPOS_MANTENIMIENTO[regla.tipo].icono}
                  </span>
                  <span className="regla-fila__cuerpo">
                    <span className="regla-fila__titulo">
                      {nombreMantenimiento(regla.tipo, regla.tipoPersonalizado)}
                    </span>
                    <span className="regla-fila__intervalo numero">{describirRegla(regla)}</span>
                  </span>
                </button>

                <Interruptor
                  etiqueta=""
                  valor={regla.activa}
                  alCambiar={(activa) => {
                    void guardarRegla(regla.id, { activa });
                  }}
                />
              </div>
            </li>
          ))}
        </ul>
      )}

      <HojaModal
        abierta={editando !== null}
        titulo={
          editando ? nombreMantenimiento(editando.tipo, editando.tipoPersonalizado) : 'Regla'
        }
        alCerrar={() => setEditando(null)}
      >
        {editando ? (
          <EditorRegla key={editando.id} regla={editando} alTerminar={() => setEditando(null)} />
        ) : null}
      </HojaModal>

      <HojaModal abierta={creando} titulo="Nueva recurrencia" alCerrar={() => setCreando(false)}>
        {id ? <NuevaRegla vehiculoId={id} alTerminar={() => setCreando(false)} /> : null}
      </HojaModal>
    </div>
  );
}
