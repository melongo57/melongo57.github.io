import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { actualizarVehiculo, crearVehiculo } from '@/datos/acciones.ts';
import { db } from '@/datos/db.ts';
import { AdjuntoDemasiadoGrande } from '@/datos/imagenes.ts';
import {
  CATEGORIAS_VEHICULO,
  COMBUSTIBLES,
  ORDEN_CATEGORIA_VEHICULO,
  opciones,
  sugerenciasAlerta,
} from '@/dominio/catalogos.ts';
import { parsearImporte } from '@/dominio/dinero.ts';
import { hoyISO } from '@/dominio/fechas.ts';
import { parsearKm } from '@/dominio/formato.ts';
import type {
  CategoriaVehiculo,
  EstadoVehiculo,
  TipoCombustible,
  Vehiculo,
} from '@/dominio/tipos.ts';
import { incidenciasDe, validarVehiculo } from '@/dominio/validacion.ts';
import { Boton } from '../componentes/Boton.tsx';
import {
  CampoArea,
  CampoFecha,
  CampoNumero,
  CampoSelector,
  CampoTexto,
  Interruptor,
} from '../componentes/Campo.tsx';
import { useVehiculo } from '../ganchos/consultas.ts';
import './FormularioVehiculo.css';

const COMBUSTIBLES_ORDEN: readonly TipoCombustible[] = [
  'gasolina',
  'diesel',
  'hibrido',
  'hibrido_enchufable',
  'electrico',
  'glp',
];

/** El formulario trabaja con texto; la conversión a número ocurre al guardar. */
interface Formulario {
  alias: string;
  categoria: CategoriaVehiculo;
  marca: string;
  modelo: string;
  version: string;
  matricula: string;
  anio: string;
  combustible: TipoCombustible;
  fechaCompra: string;
  kmCompra: string;
  precioCompra: string;
  bastidor: string;
  notas: string;
  estado: EstadoVehiculo;
  fechaVenta: string;
  kmVenta: string;
  precioVenta: string;
}

const VACIO: Formulario = {
  alias: '',
  categoria: 'turismo',
  marca: '',
  modelo: '',
  version: '',
  matricula: '',
  anio: String(new Date().getFullYear()),
  combustible: 'gasolina',
  fechaCompra: '',
  kmCompra: '',
  precioCompra: '',
  bastidor: '',
  notas: '',
  estado: 'activo',
  fechaVenta: '',
  kmVenta: '',
  precioVenta: '',
};

function desdeVehiculo(v: Vehiculo): Formulario {
  // Se vuelca con dos decimales y coma: el campo es editable y tiene que
  // mostrar lo mismo que el usuario escribiría.
  const euros = (c?: number): string => (c === undefined ? '' : (c / 100).toFixed(2).replace('.', ','));
  return {
    alias: v.alias,
    categoria: v.categoria,
    marca: v.marca,
    modelo: v.modelo,
    version: v.version ?? '',
    matricula: v.matricula,
    anio: String(v.anio),
    combustible: v.combustible,
    fechaCompra: v.fechaCompra ?? '',
    kmCompra: v.kmCompra === undefined ? '' : String(v.kmCompra),
    precioCompra: euros(v.precioCompraCentimos),
    bastidor: v.bastidor ?? '',
    notas: v.notas ?? '',
    estado: v.estado,
    fechaVenta: v.fechaVenta ?? '',
    kmVenta: v.kmVenta === undefined ? '' : String(v.kmVenta),
    precioVenta: euros(v.precioVentaCentimos),
  };
}

export function FormularioVehiculo(): React.JSX.Element {
  const { id } = useParams<{ id: string }>();
  const navegar = useNavigate();
  const editando = Boolean(id);

  const vehiculo = useVehiculo(id);
  const [datos, setDatos] = useState<Formulario>(VACIO);
  const [cargado, setCargado] = useState(!editando);

  // Se vuelca el vehículo en el formulario una sola vez: `useLiveQuery` vuelve
  // a emitir con cada cambio de la tabla y machacaría lo que se esté
  // escribiendo.
  useEffect(() => {
    if (editando && vehiculo && !cargado) {
      setDatos(desdeVehiculo(vehiculo));
      setCargado(true);
    }
  }, [editando, vehiculo, cargado]);

  const [foto, setFoto] = useState<File | null>(null);
  const [quitarFoto, setQuitarFoto] = useState(false);
  const [previsualizacion, setPrevisualizacion] = useState<string | null>(null);
  const entradaFoto = useRef<HTMLInputElement>(null);

  const [confirmado, setConfirmado] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [fallo, setFallo] = useState<string | null>(null);

  /*
   * Un formulario recién abierto no debe estar lleno de errores en rojo: el
   * usuario no ha hecho nada mal todavía. Cada campo enseña sus incidencias
   * cuando se toca, y todos las enseñan al primer intento de guardar.
   *
   * Y el botón nunca se deshabilita. Un botón apagado no explica qué falta;
   * es mejor dejar pulsar y contestar señalando los campos.
   */
  const [tocados, setTocados] = useState<ReadonlySet<string>>(new Set());
  const [intentado, setIntentado] = useState(false);

  /*
   * Alertas de partida, solo al dar de alta. Mientras el usuario no toque la
   * lista (`null`), se marcan las básicas de la categoría elegida y siguen a
   * la categoría si cambia; en cuanto marca o desmarca una, manda su lista.
   */
  const sugerencias = useMemo(
    () => sugerenciasAlerta(datos.categoria, datos.combustible),
    [datos.categoria, datos.combustible],
  );
  const [alertasElegidas, setAlertasElegidas] = useState<ReadonlySet<string> | null>(null);
  const elegidas =
    alertasElegidas ?? new Set(sugerencias.filter((s) => s.basica).map((s) => s.clave));

  function alternarAlerta(clave: string): void {
    const siguiente = new Set(elegidas);
    if (siguiente.has(clave)) siguiente.delete(clave);
    else siguiente.add(clave);
    setAlertasElegidas(siguiente);
  }

  useEffect(() => {
    if (!foto) {
      setPrevisualizacion(null);
      return undefined;
    }
    const url = URL.createObjectURL(foto);
    setPrevisualizacion(url);
    return () => URL.revokeObjectURL(url);
  }, [foto]);

  // Foto ya guardada, para poder enseñarla mientras se edita.
  const [fotoGuardada, setFotoGuardada] = useState<string | null>(null);
  useEffect(() => {
    let url: string | null = null;
    let cancelado = false;

    void (async () => {
      if (!vehiculo?.fotoAdjuntoId) return;
      const adjunto = await db.adjuntos.get(vehiculo.fotoAdjuntoId);
      if (!adjunto || cancelado) return;
      url = URL.createObjectURL(adjunto.datos);
      setFotoGuardada(url);
    })();

    return () => {
      cancelado = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [vehiculo?.fotoAdjuntoId]);

  function cambiar<K extends keyof Formulario>(campo: K, valor: Formulario[K]): void {
    setDatos((previo) => ({ ...previo, [campo]: valor }));
    setTocados((previo) => new Set(previo).add(campo));
    setConfirmado(false);
  }

  /** Incidencias visibles de un campo, según si ya toca enseñarlas. */
  function avisos(campo: string) {
    if (!intentado && !tocados.has(campo)) return [];
    return incidenciasDe(validacion, campo);
  }

  const validacion = useMemo(
    () =>
      validarVehiculo({
        alias: datos.alias,
        categoria: datos.categoria,
        marca: datos.marca,
        modelo: datos.modelo,
        matricula: datos.matricula,
        anio: Number(datos.anio),
        combustible: datos.combustible,
        estado: datos.estado,
        ...(datos.fechaCompra ? { fechaCompra: datos.fechaCompra } : {}),
        ...(parsearKm(datos.kmCompra) !== null
          ? { kmCompra: parsearKm(datos.kmCompra) ?? undefined }
          : {}),
        ...(datos.fechaVenta ? { fechaVenta: datos.fechaVenta } : {}),
        ...(parsearKm(datos.kmVenta) !== null
          ? { kmVenta: parsearKm(datos.kmVenta) ?? undefined }
          : {}),
        ...(datos.bastidor ? { bastidor: datos.bastidor } : {}),
      }),
    [datos],
  );

  async function guardar(): Promise<void> {
    if (!validacion.valido) {
      setIntentado(true);
      return;
    }
    if (validacion.requiereConfirmacion && !confirmado) {
      setConfirmado(true);
      return;
    }

    setGuardando(true);
    setFallo(null);

    const opcional = <T,>(valor: T | null | undefined | ''): T | undefined =>
      valor === '' || valor === null || valor === undefined ? undefined : valor;

    const comun = {
      alias: datos.alias.trim(),
      categoria: datos.categoria,
      marca: datos.marca.trim(),
      modelo: datos.modelo.trim(),
      version: opcional(datos.version.trim()),
      matricula: datos.matricula.trim().toUpperCase(),
      anio: Number(datos.anio),
      combustible: datos.combustible,
      fechaCompra: opcional(datos.fechaCompra),
      kmCompra: opcional(parsearKm(datos.kmCompra)),
      precioCompraCentimos: opcional(parsearImporte(datos.precioCompra)),
      bastidor: opcional(datos.bastidor.trim().toUpperCase()),
      notas: opcional(datos.notas.trim()),
      estado: datos.estado,
      fechaVenta: datos.estado === 'vendido' ? opcional(datos.fechaVenta) : undefined,
      kmVenta: datos.estado === 'vendido' ? opcional(parsearKm(datos.kmVenta)) : undefined,
      precioVentaCentimos:
        datos.estado === 'vendido' ? opcional(parsearImporte(datos.precioVenta)) : undefined,
    };

    try {
      if (editando && id) {
        await actualizarVehiculo(id, { ...comun, foto, quitarFoto });
        navegar(`/vehiculos/${id}`, { replace: true });
      } else {
        const creado = await crearVehiculo({
          ...comun,
          orden: 0,
          foto,
          alertas: sugerencias.filter((s) => elegidas.has(s.clave)).map((s) => s.clave),
        });
        navegar(`/vehiculos/${creado.id}`, { replace: true });
      }
    } catch (error) {
      setFallo(
        error instanceof AdjuntoDemasiadoGrande
          ? error.message
          : error instanceof Error
            ? error.message
            : 'No se ha podido guardar.',
      );
      setGuardando(false);
    }
  }

  if (editando && vehiculo === null) {
    return (
      <div className="contenedor">
        <p className="vacio">Ese vehículo ya no existe.</p>
      </div>
    );
  }

  const vistaFoto = previsualizacion ?? (quitarFoto ? null : fotoGuardada);
  const pidiendoConfirmacion = validacion.requiereConfirmacion && confirmado;
  const vendido = datos.estado === 'vendido';

  return (
    <div className="contenedor form-vehiculo">
      <h1>{editando ? `Editar ${vehiculo?.alias ?? ''}` : 'Nuevo vehículo'}</h1>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void guardar();
        }}
      >
        {/* ---------------------------------------------------------------- */}
        <section className="bloque">
          <h2 className="bloque__titulo">Identificación</h2>

          <div className="foto-selector">
            {vistaFoto ? (
              <img src={vistaFoto} alt="" className="foto-selector__vista" />
            ) : (
              <div className="foto-selector__hueco" aria-hidden="true">
                {CATEGORIAS_VEHICULO[datos.categoria].icono}
              </div>
            )}
            <div className="foto-selector__acciones">
              <input
                ref={entradaFoto}
                type="file"
                accept="image/*"
                className="solo-lectores"
                onChange={(e) => {
                  const archivo = e.target.files?.[0] ?? null;
                  setFoto(archivo);
                  if (archivo) setQuitarFoto(false);
                }}
              />
              <Boton alPulsar={() => entradaFoto.current?.click()} icono="📷">
                {vistaFoto ? 'Cambiar foto' : 'Añadir foto'}
              </Boton>
              {vistaFoto ? (
                <Boton
                  variante="sutil"
                  alPulsar={() => {
                    setFoto(null);
                    setQuitarFoto(true);
                    if (entradaFoto.current) entradaFoto.current.value = '';
                  }}
                >
                  Quitar
                </Boton>
              ) : null}
              <p className="foto-selector__nota">
                Se reduce a 1.600 px antes de guardarla. Una foto de 5 MB queda en unos 200 kB.
              </p>
            </div>
          </div>

          <div className="rejilla-campos">
            <CampoTexto
              etiqueta="Nombre"
              ayuda="Como lo llamas tú."
              valor={datos.alias}
              alCambiar={(v) => cambiar('alias', v)}
              marcador="El Golf"
              obligatorio
              incidencias={avisos('alias')}
            />
            <CampoSelector
              etiqueta="Categoría"
              ayuda="Decide las revisiones por defecto."
              valor={datos.categoria}
              alCambiar={(v) => cambiar('categoria', v)}
              opciones={opciones(CATEGORIAS_VEHICULO, ORDEN_CATEGORIA_VEHICULO)}
            />
            <CampoTexto
              etiqueta="Marca"
              valor={datos.marca}
              alCambiar={(v) => cambiar('marca', v)}
              obligatorio
              incidencias={avisos('marca')}
            />
            <CampoTexto
              etiqueta="Modelo"
              valor={datos.modelo}
              alCambiar={(v) => cambiar('modelo', v)}
              obligatorio
              incidencias={avisos('modelo')}
            />
            <CampoTexto
              etiqueta="Versión"
              valor={datos.version}
              alCambiar={(v) => cambiar('version', v)}
              marcador="2.0 TDI 150 CV"
            />
            <CampoTexto
              etiqueta="Matrícula"
              valor={datos.matricula}
              alCambiar={(v) => cambiar('matricula', v)}
              marcador="1234 ABC"
              autoCapitalizar="characters"
              obligatorio
              incidencias={avisos('matricula')}
            />
            <CampoNumero
              etiqueta="Año"
              valor={datos.anio}
              alCambiar={(v) => cambiar('anio', v)}
              incidencias={avisos('anio')}
            />
            <CampoSelector
              etiqueta="Combustible"
              valor={datos.combustible}
              alCambiar={(v) => cambiar('combustible', v)}
              opciones={opciones(COMBUSTIBLES, COMBUSTIBLES_ORDEN)}
            />
          </div>
        </section>

        {/* ---------------------------------------------------------------- */}
        <section className="bloque">
          <h2 className="bloque__titulo">Compra</h2>
          <div className="rejilla-campos">
            <CampoFecha
              etiqueta="Fecha de compra"
              valor={datos.fechaCompra}
              alCambiar={(v) => cambiar('fechaCompra', v)}
              max={hoyISO()}
              incidencias={avisos('fechaCompra')}
            />
            <CampoNumero
              etiqueta="Kilómetros"
              ayuda="Crea la primera lectura del odómetro."
              valor={datos.kmCompra}
              alCambiar={(v) => cambiar('kmCompra', v)}
              sufijo="km"
              incidencias={avisos('kmCompra')}
            />
            <CampoNumero
              etiqueta="Precio"
              ayuda="Para el coste total de propiedad."
              valor={datos.precioCompra}
              alCambiar={(v) => cambiar('precioCompra', v)}
              sufijo="€"
            />
          </div>
        </section>

        {/* ---------------------------------------------------------------- */}
        {!editando ? (
          <section className="bloque">
            <h2 className="bloque__titulo">Alertas</h2>
            <p className="form-vehiculo__ayuda">
              Marca lo que quieres que te avise. Luego podrás añadir, cambiar o quitar
              cualquiera desde la ficha, y decir cuándo fue la última vez.
            </p>
            <div className="opciones">
              {sugerencias.map((s) => {
                const marcada = elegidas.has(s.clave);
                return (
                  <button
                    key={s.clave}
                    type="button"
                    className="opcion"
                    aria-pressed={marcada}
                    onClick={() => alternarAlerta(s.clave)}
                  >
                    <span aria-hidden="true">{marcada ? '✓' : s.icono}</span>
                    {s.nombre}
                  </button>
                );
              })}
            </div>
          </section>
        ) : null}

        {/* ---------------------------------------------------------------- */}
        <section className="bloque">
          <h2 className="bloque__titulo">Otros datos</h2>
          <div className="rejilla-campos">
            <CampoTexto
              etiqueta="Número de bastidor"
              valor={datos.bastidor}
              alCambiar={(v) => cambiar('bastidor', v)}
              marcador="17 caracteres"
              autoCapitalizar="characters"
              maxLargo={17}
              incidencias={avisos('bastidor')}
            />
          </div>
          <CampoArea
            etiqueta="Notas"
            valor={datos.notas}
            alCambiar={(v) => cambiar('notas', v)}
            marcador="Lo que quieras recordar de este vehículo."
          />
        </section>

        {/* ---------------------------------------------------------------- */}
        <section className="bloque">
          <h2 className="bloque__titulo">Estado</h2>
          <Interruptor
            etiqueta="Lo he vendido"
            ayuda="Congela su histórico: deja de dar avisos y de contar en el gasto corriente, pero no se borra nada."
            valor={vendido}
            alCambiar={(v) => cambiar('estado', v ? 'vendido' : 'activo')}
          />

          {vendido ? (
            <div className="rejilla-campos">
              <CampoFecha
                etiqueta="Fecha de venta"
                valor={datos.fechaVenta}
                alCambiar={(v) => cambiar('fechaVenta', v)}
                obligatorio
                incidencias={avisos('fechaVenta')}
              />
              <CampoNumero
                etiqueta="Kilómetros al vender"
                valor={datos.kmVenta}
                alCambiar={(v) => cambiar('kmVenta', v)}
                sufijo="km"
                incidencias={avisos('kmVenta')}
              />
              <CampoNumero
                etiqueta="Precio de venta"
                valor={datos.precioVenta}
                alCambiar={(v) => cambiar('precioVenta', v)}
                sufijo="€"
              />
            </div>
          ) : null}
        </section>

        {intentado && !validacion.valido ? (
          <p className="form-vehiculo__fallo">
            Faltan datos o hay algo que revisar. Los campos marcados en rojo lo indican.
          </p>
        ) : null}

        {pidiendoConfirmacion ? (
          <p className="form-vehiculo__confirmar">
            Hay avisos sin resolver. Si son correctos, vuelve a pulsar para guardar.
          </p>
        ) : null}

        {fallo ? <p className="form-vehiculo__fallo">{fallo}</p> : null}

        <div className="fila-botones form-vehiculo__pie">
          <Boton variante="sutil" alPulsar={() => navegar(-1)}>
            Cancelar
          </Boton>
          <Boton
            tipo="submit"
            variante={pidiendoConfirmacion ? 'peligro' : 'principal'}
            cargando={guardando}
          >
            {pidiendoConfirmacion
              ? 'Guardar de todas formas'
              : editando
                ? 'Guardar cambios'
                : 'Añadir vehículo'}
          </Boton>
        </div>
      </form>
    </div>
  );
}
