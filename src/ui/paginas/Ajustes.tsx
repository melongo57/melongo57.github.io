import { useState } from 'react';
import { repo } from '@/datos/repositorioDexie.ts';
import { cargarDatosEjemplo } from '@/datos/semilla.ts';
import type { Tema } from '@/dominio/tipos.ts';
import { AntelacionAvisos } from '../componentes/AntelacionAvisos.tsx';
import { AvisoNotificaciones } from '../componentes/AvisoNotificaciones.tsx';
import { Boton } from '../componentes/Boton.tsx';
import { CopiaSeguridad } from '../componentes/CopiaSeguridad.tsx';
import { EstadoDatos } from '../componentes/EstadoDatos.tsx';
import { Sincronizacion } from '../componentes/Sincronizacion.tsx';
import { EstadoInstalacion } from '../componentes/EstadoInstalacion.tsx';
import { CampoSelector } from '../componentes/Campo.tsx';
import { HojaModal } from '../componentes/HojaModal.tsx';
import { useVehiculos } from '../ganchos/consultas.ts';
import { aplicarTema, temaGuardado } from '../tema.ts';
import './Ajustes.css';

const TEMAS: readonly { valor: Tema; nombre: string; icono: string }[] = [
  { valor: 'sistema', nombre: 'Como el sistema', icono: '◐' },
  { valor: 'claro', nombre: 'Claro', icono: '☀' },
  { valor: 'oscuro', nombre: 'Oscuro', icono: '☾' },
];

export function Ajustes(): React.JSX.Element {
  const [tema, setTema] = useState<Tema>(() => temaGuardado());
  const vehiculos = useVehiculos();
  const [confirmando, setConfirmando] = useState<'borrar' | 'ejemplo' | null>(null);
  const [trabajando, setTrabajando] = useState(false);

  function elegirTema(valor: Tema): void {
    setTema(valor);
    aplicarTema(valor);
    void repo.ajustes.guardar({ tema: valor });
  }

  async function vaciar(): Promise<void> {
    setTrabajando(true);
    await repo.vaciar();
    setConfirmando(null);
    setTrabajando(false);
  }

  async function recargarEjemplo(): Promise<void> {
    setTrabajando(true);
    await repo.vaciar();
    await cargarDatosEjemplo(repo);
    setConfirmando(null);
    setTrabajando(false);
  }

  return (
    <div className="contenedor ajustes">
      <h1>Ajustes</h1>

      <section className="bloque">
        <h2 className="bloque__titulo">Aspecto</h2>
        <CampoSelector
          etiqueta="Tema"
          valor={tema}
          alCambiar={elegirTema}
          opciones={TEMAS}
          ayuda="«Como el sistema» sigue el modo oscuro del móvil, que se activa solo por la noche."
        />
      </section>

      <section className="bloque">
        <h2 className="bloque__titulo">Avisos</h2>
        <AntelacionAvisos />
        <AvisoNotificaciones />
      </section>

      <section className="bloque">
        <h2 className="bloque__titulo">Cuenta y sincronización</h2>
        <Sincronizacion />
      </section>

      <section className="bloque">
        <h2 className="bloque__titulo">Tus datos</h2>
        <p className="ajustes__texto">
          Ahora mismo hay <strong className="numero">{vehiculos?.length ?? 0}</strong>{' '}
          {vehiculos?.length === 1 ? 'vehículo' : 'vehículos'}.
        </p>
        <EstadoDatos />

        <details className="ajustes__detalle">
          <summary>¿Qué borra mis datos?</summary>
          <ul className="ajustes__lista">
            <li>
              <strong>Borrar la caché</strong> del navegador: <em>no</em> los toca. Solo
              vuelve a descargar los archivos de la app.
            </li>
            <li>
              <strong>Borrar «cookies y datos de sitios»</strong>: sí, se van todos.
            </li>
            <li>
              <strong>«Eliminar datos»</strong> desde el candado de la barra de direcciones:
              sí.
            </li>
            <li>
              <strong>Desinstalar la app</strong> de la pantalla de inicio: según el
              navegador, puede llevárselos.
            </li>
            <li>
              <strong>Modo incógnito</strong>: se borran al cerrar la ventana.
            </li>
          </ul>
        </details>

        <CopiaSeguridad />

        <div className="ajustes__acciones ajustes__acciones--peligro">
          <Boton alPulsar={() => setConfirmando('ejemplo')}>Recargar datos de ejemplo</Boton>
          <Boton variante="peligro" alPulsar={() => setConfirmando('borrar')}>
            Borrar todo
          </Boton>
        </div>
      </section>

      <section className="bloque">
        <h2 className="bloque__titulo">Instalación</h2>
        <EstadoInstalacion />
      </section>

      <section className="bloque">
        <h2 className="bloque__titulo">Sobre esta versión</h2>
        <p className="ajustes__texto">
          Versión completa. Vehículos, kilómetros, mantenimientos con recurrencias,
          repostajes, gastos, documentos, adjuntos, agenda, análisis y copia de seguridad.
        </p>
      </section>

      <footer className="ajustes__pie">
        © {new Date().getFullYear()} DeWaLt
      </footer>

      <HojaModal
        abierta={confirmando !== null}
        titulo={confirmando === 'borrar' ? '¿Borrar todos los datos?' : '¿Recargar el ejemplo?'}
        alCerrar={() => setConfirmando(null)}
      >
        <div className="borrado">
          <p>
            {confirmando === 'borrar'
              ? 'Se borrarán todos los vehículos y su histórico completo. No se puede deshacer.'
              : 'Se borrará lo que haya ahora y se cargarán de nuevo los cuatro vehículos de ejemplo. No se puede deshacer.'}
          </p>
          <div className="fila-botones">
            <Boton variante="sutil" alPulsar={() => setConfirmando(null)}>
              Cancelar
            </Boton>
            <Boton
              variante="peligro"
              cargando={trabajando}
              alPulsar={() =>
                void (confirmando === 'borrar' ? vaciar() : recargarEjemplo())
              }
            >
              {confirmando === 'borrar' ? 'Borrar todo' : 'Recargar'}
            </Boton>
          </div>
        </div>
      </HojaModal>
    </div>
  );
}
