import { useEffect, useState } from 'react';
import { repo } from '@/datos/repositorioDexie.ts';
import { parsearKm } from '@/dominio/formato.ts';
import { useAjustes } from '../ganchos/consultas.ts';
import { CampoNumero } from './Campo.tsx';

/**
 * Con cuánta antelación avisar, para las alertas que no digan otra cosa.
 *
 * Se guarda al salir del campo, no con un botón: son dos números que se
 * tocan una vez en la vida, y un «Guardar» para ellos es un paso que olvidar.
 */
export function AntelacionAvisos(): React.JSX.Element | null {
  const ajustes = useAjustes();
  const [dias, setDias] = useState('');
  const [km, setKm] = useState('');

  useEffect(() => {
    if (!ajustes) return;
    setDias(String(ajustes.avisoDias));
    setKm(String(ajustes.avisoKm));
  }, [ajustes]);

  if (!ajustes) return null;

  function guardar(): void {
    const d = parsearKm(dias);
    const k = parsearKm(km);
    void repo.ajustes.guardar({
      ...(d !== null && d >= 0 ? { avisoDias: d } : {}),
      ...(k !== null && k >= 0 ? { avisoKm: k } : {}),
    });
  }

  return (
    <div className="rejilla-campos" onBlur={guardar}>
      <CampoNumero
        etiqueta="Avisar antes"
        ayuda="Para las alertas que no digan otra cosa."
        valor={dias}
        alCambiar={setDias}
        sufijo="días"
      />
      <CampoNumero etiqueta="O antes" valor={km} alCambiar={setKm} sufijo="km" />
    </div>
  );
}
