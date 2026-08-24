import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { AvisoActualizacion } from '../componentes/AvisoActualizacion.tsx';
import { useAvisosAlArrancar } from '../componentes/AvisoNotificaciones.tsx';
import { IconoAgenda, IconoAjustes, IconoPanel, IconoVehiculos } from './iconos.tsx';
import './Disposicion.css';

interface Destino {
  a: string;
  nombre: string;
  Icono: () => React.JSX.Element;
}

const DESTINOS: readonly Destino[] = [
  { a: '/', nombre: 'Panel', Icono: IconoPanel },
  { a: '/vehiculos', nombre: 'Vehículos', Icono: IconoVehiculos },
  { a: '/agenda', nombre: 'Agenda', Icono: IconoAgenda },
  { a: '/ajustes', nombre: 'Ajustes', Icono: IconoAjustes },
];

function Navegacion({ lugar }: { lugar: 'cabecera' | 'inferior' }): React.JSX.Element {
  return (
    // Se pintan las dos, pero el CSS solo muestra una según el ancho, y lo
    // que está en `display: none` tampoco existe para un lector de pantalla.
    <nav className={`navegacion navegacion--${lugar}`} aria-label="Secciones">
      {DESTINOS.map((destino) => (
        <NavLink
          key={destino.a}
          to={destino.a}
          end={destino.a === '/'}
          className={({ isActive }) => `navegacion__enlace${isActive ? ' es-activo' : ''}`}
        >
          <destino.Icono />
          <span className="navegacion__texto">{destino.nombre}</span>
        </NavLink>
      ))}
    </nav>
  );
}

/**
 * Armazón de la aplicación.
 *
 * La navegación va abajo en el móvil, no arriba: el pulgar llega al tercio
 * inferior de la pantalla sin recolocar la mano, y esta app se usa de pie y a
 * menudo con una sola mano. En escritorio sube a la cabecera, donde el ratón
 * no tiene esa limitación y la franja inferior es desperdicio.
 */
export function Disposicion(): React.JSX.Element {
  const { pathname } = useLocation();
  const navegar = useNavigate();

  // Avisa de lo que vence nada más abrir la app, si hay permiso concedido.
  useAvisosAlArrancar();

  // En detalle y formularios, la cabecera cambia el logotipo por «atrás».
  const esRaiz = DESTINOS.some((d) => d.a === pathname);

  return (
    <div className="disposicion">
      <header className="cabecera">
        <div className="contenedor cabecera__interior">
          {esRaiz ? (
            <div className="marca">
              <img src="/favicon.svg" alt="" width={30} height={30} className="marca__icono" />
              <span className="marca__nombre">Mi Garaje</span>
            </div>
          ) : (
            <button type="button" className="cabecera__atras" onClick={() => navegar(-1)}>
              <span aria-hidden="true">←</span>
              <span>Atrás</span>
            </button>
          )}

          <Navegacion lugar="cabecera" />
        </div>
      </header>

      <main className="contenido">
        <Outlet />
      </main>

      <Navegacion lugar="inferior" />
      <AvisoActualizacion />
    </div>
  );
}
