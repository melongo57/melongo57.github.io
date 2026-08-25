import { Navigate, Route, BrowserRouter, Routes } from 'react-router-dom';
import { useSesion } from './autenticacion.ts';
import { useSincronizacionAutomatica } from './ganchos/sincronizacionAutomatica.ts';
import { Disposicion } from './layout/Disposicion.tsx';
import { Agenda } from './paginas/Agenda.tsx';
import { Analisis } from './paginas/Analisis.tsx';
import { Ajustes } from './paginas/Ajustes.tsx';
import { Documentos } from './paginas/Documentos.tsx';
import { FichaVehiculo } from './paginas/FichaVehiculo.tsx';
import { FormularioVehiculo } from './paginas/FormularioVehiculo.tsx';
import { ListaVehiculos } from './paginas/ListaVehiculos.tsx';
import { Gastos } from './paginas/Gastos.tsx';
import { Mantenimientos } from './paginas/Mantenimientos.tsx';
import { Repostajes } from './paginas/Repostajes.tsx';
import { Reglas } from './paginas/Reglas.tsx';
import { Panel } from './paginas/Panel.tsx';

/**
 * Rutas de la aplicación.
 *
 * `/vehiculos/nuevo` va antes que `/vehiculos/:id` porque, si no, «nuevo» se
 * interpretaría como un identificador y acabaríamos en una ficha inexistente.
 */
export function App(): React.JSX.Element {
  /*
   * La sincronización se engancha aquí y no en una pantalla concreta: colgada
   * del bloque de cuenta de Ajustes, un dispositivo que abría la app y se
   * quedaba en el panel no bajaba nada del servidor nunca.
   */
  useSincronizacionAutomatica(useSesion());

  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Disposicion />}>
          <Route path="/" element={<Panel />} />
          <Route path="/vehiculos" element={<ListaVehiculos />} />
          <Route path="/vehiculos/nuevo" element={<FormularioVehiculo />} />
          <Route path="/vehiculos/:id" element={<FichaVehiculo />} />
          <Route path="/vehiculos/:id/editar" element={<FormularioVehiculo />} />
          <Route path="/vehiculos/:id/mantenimientos" element={<Mantenimientos />} />
          <Route path="/vehiculos/:id/reglas" element={<Reglas />} />
          <Route path="/vehiculos/:id/repostajes" element={<Repostajes />} />
          <Route path="/vehiculos/:id/gastos" element={<Gastos />} />
          <Route path="/vehiculos/:id/documentos" element={<Documentos />} />
          <Route path="/vehiculos/:id/analisis" element={<Analisis />} />
          <Route path="/agenda" element={<Agenda />} />
          <Route path="/ajustes" element={<Ajustes />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
