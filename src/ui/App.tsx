import { Navigate, Route, BrowserRouter, Routes } from 'react-router-dom';
import { Disposicion } from './layout/Disposicion.tsx';
import { Ajustes } from './paginas/Ajustes.tsx';
import { FichaVehiculo } from './paginas/FichaVehiculo.tsx';
import { FormularioVehiculo } from './paginas/FormularioVehiculo.tsx';
import { ListaVehiculos } from './paginas/ListaVehiculos.tsx';
import { Mantenimientos } from './paginas/Mantenimientos.tsx';
import { Reglas } from './paginas/Reglas.tsx';
import { Panel } from './paginas/Panel.tsx';

/**
 * Rutas de la aplicación.
 *
 * `/vehiculos/nuevo` va antes que `/vehiculos/:id` porque, si no, «nuevo» se
 * interpretaría como un identificador y acabaríamos en una ficha inexistente.
 */
export function App(): React.JSX.Element {
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
          <Route path="/ajustes" element={<Ajustes />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
