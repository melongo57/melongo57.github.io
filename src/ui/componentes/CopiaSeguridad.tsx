import { useRef, useState } from 'react';
import { generarCsvGastos, nombreArchivoCsv } from '@/datos/csv.ts';
import { db } from '@/datos/db.ts';
import {
  CopiaInvalida,
  exportarTodo,
  importarTodo,
  nombreArchivoCopia,
  resumirCopia,
  validarCopia,
  type CopiaCompleta,
} from '@/datos/exportacion.ts';
import { repo } from '@/datos/repositorioDexie.ts';
import { ahoraISO } from '@/dominio/fechas.ts';
import { formatearBytes } from '@/dominio/formato.ts';
import { Boton } from './Boton.tsx';
import { HojaModal } from './HojaModal.tsx';
import './CopiaSeguridad.css';

/** Descarga un contenido como archivo, sin pasar por ningún servidor. */
function descargar(nombre: string, contenido: string, mime: string): void {
  const blob = new Blob([contenido], { type: mime });
  const url = URL.createObjectURL(blob);
  const enlace = document.createElement('a');
  enlace.href = url;
  enlace.download = nombre;
  enlace.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

const NOMBRES_TABLA: Record<string, string> = {
  vehiculos: 'vehículos',
  lecturas: 'lecturas',
  mantenimientos: 'mantenimientos',
  reglas: 'reglas',
  repostajes: 'repostajes',
  gastos: 'gastos',
  documentos: 'documentos',
  adjuntos: 'adjuntos',
  ajustes: 'ajustes',
};

/**
 * Copia de seguridad completa.
 *
 * Es la pieza que sostiene «mis datos son míos»: el JSON lleva TODO, fotos
 * incluidas, y basta para reconstruir la app en otro dispositivo.
 *
 * La importación **reemplaza** lo que haya, no lo mezcla. Fusionar dos bases
 * sin sincronización de verdad produce duplicados silenciosos, que es peor que
 * decir claramente qué va a pasar y pedir confirmación.
 */
export function CopiaSeguridad(): React.JSX.Element {
  const entradaArchivo = useRef<HTMLInputElement>(null);
  const [trabajando, setTrabajando] = useState(false);
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [fallo, setFallo] = useState<string | null>(null);
  const [pendiente, setPendiente] = useState<CopiaCompleta | null>(null);

  async function exportarJson(): Promise<void> {
    setTrabajando(true);
    setFallo(null);
    try {
      const copia = await exportarTodo(repo);
      const texto = JSON.stringify(copia, null, 2);
      descargar(nombreArchivoCopia(), texto, 'application/json');
      // Se anota para poder avisar cuando la copia se quede vieja.
      await repo.ajustes.guardar({ ultimaCopiaEn: ahoraISO() });
      setMensaje(
        `Copia descargada: ${copia.resumen.vehiculos ?? 0} vehículos y ` +
          `${copia.resumen.adjuntos ?? 0} adjuntos, ${formatearBytes(
            new Blob([texto]).size,
          )}.`,
      );
    } catch (error) {
      setFallo(error instanceof Error ? error.message : 'No se ha podido exportar.');
    }
    setTrabajando(false);
  }

  async function exportarCsv(): Promise<void> {
    setTrabajando(true);
    setFallo(null);
    try {
      const [vehiculos, repostajes, mantenimientos, gastos] = await Promise.all([
        db.vehiculos.toArray(),
        db.repostajes.toArray(),
        db.mantenimientos.toArray(),
        db.gastos.toArray(),
      ]);
      const csv = generarCsvGastos({ vehiculos, repostajes, mantenimientos, gastos });
      descargar(nombreArchivoCsv(), csv, 'text/csv;charset=utf-8');
      setMensaje(
        `CSV descargado con ${repostajes.length + mantenimientos.length + gastos.length} ` +
          'registros. Se abre directamente con Excel.',
      );
    } catch (error) {
      setFallo(error instanceof Error ? error.message : 'No se ha podido exportar.');
    }
    setTrabajando(false);
  }

  /** Lee y valida el archivo, pero todavía no toca la base. */
  async function elegirArchivo(archivo: File | null): Promise<void> {
    if (!archivo) return;
    setFallo(null);
    setMensaje(null);
    try {
      const copia = validarCopia(JSON.parse(await archivo.text()));
      setPendiente(copia);
    } catch (error) {
      setFallo(
        error instanceof CopiaInvalida
          ? error.message
          : error instanceof SyntaxError
            ? 'El archivo no es un JSON válido.'
            : 'No se ha podido leer el archivo.',
      );
    }
  }

  async function confirmarImportacion(): Promise<void> {
    if (!pendiente) return;
    setTrabajando(true);
    try {
      const escritos = await importarTodo(repo, pendiente);
      setMensaje(
        `Importado: ${escritos.vehiculos} vehículos, ${escritos.repostajes} repostajes, ` +
          `${escritos.mantenimientos} mantenimientos y ${escritos.gastos} gastos.`,
      );
      setPendiente(null);
    } catch (error) {
      setFallo(error instanceof Error ? error.message : 'No se ha podido importar.');
    }
    setTrabajando(false);
  }

  const resumen = pendiente ? resumirCopia(pendiente) : null;

  return (
    <div className="copia">
      <p className="copia__texto">
        La copia en JSON lleva <strong>todo</strong>: vehículos, histórico, documentos y las
        fotos. Con ella se reconstruye la app entera en otro dispositivo, y es también la
        forma de pasar tus datos del móvil al ordenador.
      </p>

      <div className="copia__acciones">
        <Boton variante="principal" icono="⭳" alPulsar={() => void exportarJson()} cargando={trabajando}>
          Descargar copia
        </Boton>
        <Boton icono="⭱" alPulsar={() => entradaArchivo.current?.click()}>
          Importar copia
        </Boton>
        <input
          ref={entradaArchivo}
          type="file"
          accept="application/json,.json"
          className="solo-lectores"
          onChange={(e) => {
            void elegirArchivo(e.target.files?.[0] ?? null);
            e.target.value = '';
          }}
        />
      </div>

      <p className="copia__texto copia__texto--tenue">
        Para abrir los gastos con Excel o una hoja de cálculo, exporta el CSV: separador de
        punto y coma y coma decimal, que es lo que espera Excel en español.
      </p>

      <div className="copia__acciones">
        <Boton variante="sutil" icono="🧾" alPulsar={() => void exportarCsv()}>
          Exportar gastos a CSV
        </Boton>
      </div>

      {mensaje ? <p className="copia__ok">{mensaje}</p> : null}
      {fallo ? <p className="copia__fallo">{fallo}</p> : null}

      <HojaModal
        abierta={pendiente !== null}
        titulo="¿Importar esta copia?"
        alCerrar={() => setPendiente(null)}
      >
        <div className="borrado">
          <p>
            La copia es del{' '}
            <strong className="numero">
              {pendiente ? new Date(pendiente.exportadoEn).toLocaleDateString('es-ES') : ''}
            </strong>{' '}
            y contiene:
          </p>

          <ul className="copia__resumen">
            {resumen
              ? Object.entries(resumen)
                  .filter(([, n]) => n > 0)
                  .map(([tabla, n]) => (
                    <li key={tabla}>
                      <strong className="numero">{n}</strong>{' '}
                      {NOMBRES_TABLA[tabla] ?? tabla}
                    </li>
                  ))
              : null}
          </ul>

          <p className="copia__peligro">
            <strong>Se reemplazará todo lo que tienes ahora.</strong> No se mezcla con los
            datos actuales, porque fusionar dos bases sin sincronización de verdad produce
            duplicados silenciosos. Si quieres conservar lo de ahora, descarga antes una
            copia.
          </p>

          <div className="fila-botones">
            <Boton variante="sutil" alPulsar={() => setPendiente(null)}>
              Cancelar
            </Boton>
            <Boton
              variante="peligro"
              cargando={trabajando}
              alPulsar={() => void confirmarImportacion()}
            >
              Reemplazar mis datos
            </Boton>
          </div>
        </div>
      </HojaModal>
    </div>
  );
}
