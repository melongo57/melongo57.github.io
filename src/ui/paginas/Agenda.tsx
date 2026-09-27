import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { agruparPorMes, generarIcs, nombreArchivoIcs } from '@/dominio/calendario.ts';
import {
  formatearDistancia,
  formatearFecha,
  formatearMes,
  hoyISO,
  sumarMeses,
} from '@/dominio/fechas.ts';
import { Boton } from '../componentes/Boton.tsx';
import { useAgenda } from '../ganchos/consultas.ts';
import './Agenda.css';

/** Hasta dónde llega la agenda antes de pedir «ver todo». */
const MESES_HORIZONTE = 14;

/** Descarga un texto como archivo, sin pasar por ningún servidor. */
function descargar(nombre: string, contenido: string, mime: string): void {
  const blob = new Blob([contenido], { type: mime });
  const url = URL.createObjectURL(blob);
  const enlace = document.createElement('a');
  enlace.href = url;
  enlace.download = nombre;
  enlace.click();
  // Revocar de inmediato cancelaría la descarga en algunos navegadores.
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

/**
 * Agenda de vencimientos futuros.
 *
 * Junta en una sola línea temporal los mantenimientos que vencen por fecha,
 * los documentos que caducan y los gastos recurrentes que van a volver a
 * cargarse. Lo que solo vence por kilómetros no aparece: nadie sabe qué día
 * llegarás a esos kilómetros.
 */
export function Agenda(): React.JSX.Element {
  const eventos = useAgenda();
  const [descargado, setDescargado] = useState(false);
  /*
   * Un mantenimiento de neumáticos a cinco años vista es correcto pero
   * inútil: llena la lista y entierra lo del mes que viene. Se enseña el
   * año largo y el resto queda a un toque.
   */
  const [todo, setTodo] = useState(false);

  const limite = useMemo(() => sumarMeses(hoyISO(), MESES_HORIZONTE), []);
  const visibles = useMemo(
    () => (todo ? (eventos ?? []) : (eventos ?? []).filter((e) => e.fecha <= limite)),
    [eventos, todo, limite],
  );
  const ocultos = (eventos?.length ?? 0) - visibles.length;
  const meses = useMemo(() => agruparPorMes(visibles), [visibles]);

  function exportar(): void {
    if (!eventos) return;
    // Al calendario va TODO, aunque la lista esté recortada: una cita a cinco
    // años estorba en pantalla pero en el calendario no molesta a nadie.
    descargar(nombreArchivoIcs(), generarIcs(eventos), 'text/calendar;charset=utf-8');
    setDescargado(true);
  }

  return (
    <div className="contenedor agenda">
      <header className="agenda__cabecera">
        <div>
          <h1>Agenda</h1>
          <p className="agenda__sub">Lo que viene, por fecha</p>
        </div>
        <Boton icono="🗓️" alPulsar={exportar} deshabilitado={!eventos || eventos.length === 0}>
          Al calendario
        </Boton>
      </header>

      <section className="agenda__explica">
        <p>
          <strong>El recordatorio de verdad lo da tu calendario.</strong> Ningún navegador
          sabe avisarte dentro de treinta días con la app cerrada, así que lo que hace este
          botón es descargarte un archivo <code>.ics</code> que abres con Google Calendar o
          con Calendario, y a partir de ahí te avisan ellos.
        </p>
        <p className="agenda__matiz">
          Puedes reimportarlo cuando quieras: cada cita conserva su identificador, así que se
          actualiza en vez de duplicarse.
        </p>
      </section>

      {descargado ? (
        <p className="agenda__descargado">
          Archivo descargado. Ábrelo con tu calendario para añadir las citas.
        </p>
      ) : null}

      {eventos === undefined ? (
        <p className="cargando">Cargando…</p>
      ) : eventos.length === 0 ? (
        <div className="vacio">
          <p className="vacio__icono" aria-hidden="true">
            🗓️
          </p>
          <h2>No hay nada con fecha todavía</h2>
          <p>
            Aquí aparecerán la ITV, el seguro y los mantenimientos que vencen por tiempo. Lo
            que vence por kilómetros no sale: no hay forma de saber qué día llegarás.
          </p>
        </div>
      ) : (
        <div className="agenda__meses">
          {meses.map((grupo) => (
            <section key={grupo.mes} className="agenda__mes">
              <h2 className="agenda__mes-titulo">{formatearMes(grupo.mes)}</h2>
              <ul className="agenda__eventos">
                {grupo.eventos.map((e) => (
                  <li key={e.uid}>
                    <Link
                      to={`/vehiculos/${e.vehiculoId}`}
                      className={`agenda-evento${e.diasRestantes < 0 ? ' es-vencido' : ''}`}
                    >
                      <span className="agenda-evento__dia numero">
                        {e.fecha.slice(8, 10)}
                      </span>
                      <span className="agenda-evento__cuerpo">
                        <span className="agenda-evento__titulo">
                          <span aria-hidden="true">{e.icono} </span>
                          {e.titulo}
                        </span>
                        <span className="agenda-evento__meta numero">
                          {formatearFecha(e.fecha)} · {formatearDistancia(e.diasRestantes)}
                        </span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ))}

          {ocultos > 0 ? (
            <Boton variante="sutil" alPulsar={() => setTodo(true)}>
              Ver {ocultos} más, hasta {formatearMes(
                (eventos?.at(-1)?.fecha ?? '').slice(0, 7),
              )}
            </Boton>
          ) : null}
          {todo && (eventos?.length ?? 0) > 0 ? (
            <Boton variante="sutil" alPulsar={() => setTodo(false)}>
              Ver solo lo próximo
            </Boton>
          ) : null}
        </div>
      )}
    </div>
  );
}
