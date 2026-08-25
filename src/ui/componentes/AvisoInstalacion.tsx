import { useState } from 'react';
import { instalarApp, useEstadoInstalacion } from '../ganchos/instalacion.ts';
import { Boton } from './Boton.tsx';
import './AvisoActualizacion.css';

/**
 * Aviso flotante ofreciendo instalar la app, en cuanto el navegador lo
 * permite (`beforeinstallprompt`, solo Chromium: Safari e iOS no lo disparan
 * nunca y ahí este aviso simplemente no aparece — la vía de instalación en
 * esos casos sigue siendo el bloque de Ajustes, que explica dónde está el
 * botón en cada navegador).
 *
 * Reutiliza el estilo de `AvisoActualizacion` (la píldora flotante sobre la
 * barra inferior) para que los dos avisos del mismo sitio se sientan como el
 * mismo mecanismo, no como dos ideas distintas.
 */
export function AvisoInstalacion(): React.JSX.Element | null {
  const { evento, instalada } = useEstadoInstalacion();
  const [descartado, setDescartado] = useState(false);

  if (!evento || instalada || descartado) return null;

  return (
    <div className="aviso-sw es-version" role="status">
      <span>Puedes instalar Mi Garaje en este dispositivo.</span>
      <Boton variante="principal" alPulsar={() => void instalarApp()}>
        Instalar
      </Boton>
      <button type="button" className="aviso-sw__cerrar" onClick={() => setDescartado(true)}>
        <span aria-hidden="true">✕</span>
        <span className="solo-lectores">Ahora no</span>
      </button>
    </div>
  );
}
