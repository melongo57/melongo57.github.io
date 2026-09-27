import { useState } from 'react';
import { borrarDocumento, guardarDocumento } from '@/datos/acciones.ts';
import {
  COBERTURAS_SEGURO,
  ORDEN_DOCUMENTO,
  TIPOS_DOCUMENTO,
  opciones,
} from '@/dominio/catalogos.ts';
import { parsearImporte } from '@/dominio/dinero.ts';
import type {
  CoberturaSeguro,
  Documento,
  Id,
  TipoDocumento,
  Vehiculo,
} from '@/dominio/tipos.ts';
import { Adjuntos } from './Adjuntos.tsx';
import { Boton } from './Boton.tsx';
import { CampoArea, CampoFecha, CampoNumero, CampoSelector, CampoTexto } from './Campo.tsx';
import './FormularioDocumento.css';

const COBERTURAS: readonly CoberturaSeguro[] = [
  'terceros',
  'terceros_ampliado',
  'todo_riesgo_franquicia',
  'todo_riesgo',
];

const RESULTADOS_ITV = [
  { valor: 'favorable' as const, nombre: 'Favorable' },
  { valor: 'desfavorable' as const, nombre: 'Desfavorable' },
  { valor: 'negativo' as const, nombre: 'Negativo' },
];

/**
 * Alta y edición de un documento.
 *
 * Cada tipo tiene sus campos propios —el seguro lleva compañía y cobertura, la
 * ITV lleva estación y resultado— porque el modelo es una unión discriminada y
 * no un saco de campos opcionales.
 *
 * En la ITV, «fecha de emisión» es la de la última inspección y «vencimiento»
 * la de la próxima, así que el formulario las llama por su nombre en vez de
 * usar las etiquetas genéricas.
 */
export function FormularioDocumento({
  vehiculo,
  documento,
  alTerminar,
}: {
  vehiculo: Vehiculo;
  documento?: Documento;
  alTerminar: () => void;
}): React.JSX.Element {
  const editando = Boolean(documento);

  const [tipo, setTipo] = useState<TipoDocumento>(documento?.tipo ?? 'seguro');
  const [fechaEmision, setFechaEmision] = useState(documento?.fechaEmision ?? '');
  const [notas, setNotas] = useState(documento?.notas ?? '');
  const [adjuntoIds, setAdjuntoIds] = useState<Id[]>(documento?.adjuntoIds ?? []);

  // Campos del seguro.
  const seguro = documento?.tipo === 'seguro' ? documento : undefined;
  const [compania, setCompania] = useState(seguro?.compania ?? '');
  const [poliza, setPoliza] = useState(seguro?.poliza ?? '');
  const [cobertura, setCobertura] = useState<CoberturaSeguro>(seguro?.cobertura ?? 'todo_riesgo');
  const [prima, setPrima] = useState(
    seguro?.primaCentimos === undefined
      ? ''
      : (seguro.primaCentimos / 100).toFixed(2).replace('.', ','),
  );
  const [franquicia, setFranquicia] = useState(
    seguro?.franquiciaCentimos === undefined
      ? ''
      : (seguro.franquiciaCentimos / 100).toFixed(2).replace('.', ','),
  );

  // Campos de la ITV.
  const itv = documento?.tipo === 'itv' ? documento : undefined;
  const [estacion, setEstacion] = useState(itv?.estacion ?? '');
  const [resultado, setResultado] = useState(itv?.resultado ?? 'favorable');

  // Otros tipos.
  const generico = documento && documento.tipo !== 'seguro' && documento.tipo !== 'itv'
    ? documento
    : undefined;
  const [titulo, setTitulo] = useState(generico?.titulo ?? '');

  const [intentado, setIntentado] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [borrandoConfirmado, setBorrandoConfirmado] = useState(false);

  const faltaCompania = tipo === 'seguro' && !compania.trim();
  const valido = !faltaCompania;

  async function guardar(): Promise<void> {
    if (!valido) {
      setIntentado(true);
      return;
    }
    setGuardando(true);

    const comun = {
      vehiculoId: vehiculo.id,
      ...(fechaEmision ? { fechaEmision } : {}),
      ...(notas.trim() ? { notas: notas.trim() } : {}),
      adjuntoIds,
    };

    const especifico =
      tipo === 'seguro'
        ? {
            tipo: 'seguro' as const,
            compania: compania.trim(),
            ...(poliza.trim() ? { poliza: poliza.trim() } : {}),
            cobertura,
            ...(parsearImporte(prima) !== null ? { primaCentimos: parsearImporte(prima)! } : {}),
            ...(parsearImporte(franquicia) !== null
              ? { franquiciaCentimos: parsearImporte(franquicia)! }
              : {}),
          }
        : tipo === 'itv'
          ? {
              tipo: 'itv' as const,
              ...(estacion.trim() ? { estacion: estacion.trim() } : {}),
              resultado,
            }
          : {
              tipo,
              ...(titulo.trim() ? { titulo: titulo.trim() } : {}),
            };

    await guardarDocumento({
      ...(documento ? { id: documento.id } : {}),
      ...comun,
      ...especifico,
    } as Parameters<typeof guardarDocumento>[0]);

    alTerminar();
  }

  return (
    <form
      className="form-doc"
      onSubmit={(e) => {
        e.preventDefault();
        void guardar();
      }}
    >
      <CampoSelector
        etiqueta="Tipo"
        valor={tipo}
        alCambiar={setTipo}
        opciones={opciones(TIPOS_DOCUMENTO, ORDEN_DOCUMENTO)}
        obligatorio
      />

      {tipo === 'seguro' ? (
        <>
          <CampoTexto
            etiqueta="Compañía"
            valor={compania}
            alCambiar={setCompania}
            marcador="Mutua Madrileña"
            obligatorio
            incidencias={
              intentado && faltaCompania
                ? [{ campo: 'compania', gravedad: 'error', mensaje: 'Falta la compañía.' }]
                : []
            }
          />
          <div className="rejilla-campos">
            <CampoTexto etiqueta="Póliza" valor={poliza} alCambiar={setPoliza} />
            <CampoSelector
              etiqueta="Cobertura"
              valor={cobertura}
              alCambiar={setCobertura}
              opciones={opciones(COBERTURAS_SEGURO, COBERTURAS)}
            />
            <CampoNumero etiqueta="Prima" valor={prima} alCambiar={setPrima} sufijo="€" />
            <CampoNumero
              etiqueta="Franquicia"
              valor={franquicia}
              alCambiar={setFranquicia}
              sufijo="€"
            />
          </div>
        </>
      ) : null}

      {tipo === 'itv' ? (
        <div className="rejilla-campos">
          <CampoTexto
            etiqueta="Estación"
            valor={estacion}
            alCambiar={setEstacion}
            marcador="ITV Collado Villalba"
          />
          <CampoSelector
            etiqueta="Resultado"
            valor={resultado}
            alCambiar={setResultado}
            opciones={RESULTADOS_ITV.map((r) => ({ valor: r.valor, nombre: r.nombre }))}
          />
        </div>
      ) : null}

      {tipo !== 'seguro' && tipo !== 'itv' ? (
        <CampoTexto
          etiqueta="Título"
          valor={titulo}
          alCambiar={setTitulo}
          marcador="Opcional"
        />
      ) : null}

      <CampoFecha
        etiqueta={tipo === 'itv' ? 'Fecha de la inspección' : 'Fecha de emisión'}
        ayuda="Para el aviso de cuándo vence, crea una alerta en la ficha del vehículo."
        valor={fechaEmision}
        alCambiar={setFechaEmision}
      />

      <Adjuntos ids={adjuntoIds} alCambiar={setAdjuntoIds} />

      <CampoArea etiqueta="Notas" valor={notas} alCambiar={setNotas} filas={2} />

      {intentado && !valido ? (
        <p className="form-doc__fallo">Revisa los campos marcados.</p>
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
        <div className="form-doc__borrar">
          {borrandoConfirmado ? (
            <div className="fila-botones">
              <Boton variante="sutil" alPulsar={() => setBorrandoConfirmado(false)}>
                Cancelar
              </Boton>
              <Boton
                variante="peligro"
                alPulsar={() => {
                  void borrarDocumento(documento!.id).then(alTerminar);
                }}
              >
                Borrar definitivamente
              </Boton>
            </div>
          ) : (
            <Boton variante="sutil" alPulsar={() => setBorrandoConfirmado(true)}>
              Borrar este documento
            </Boton>
          )}
        </div>
      ) : null}
    </form>
  );
}
