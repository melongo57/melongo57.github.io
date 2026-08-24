import { useEffect, useState } from 'react';
import { repo } from '@/datos/repositorioDexie.ts';
import type { Tema } from '@/dominio/tipos.ts';
import { aplicarTema, escucharTemaDelSistema, temaGuardado } from '../tema.ts';
import './SelectorTema.css';

const OPCIONES: readonly { valor: Tema; icono: string; nombre: string }[] = [
  { valor: 'claro', icono: '☀', nombre: 'Claro' },
  { valor: 'sistema', icono: '◐', nombre: 'Automático' },
  { valor: 'oscuro', icono: '☾', nombre: 'Oscuro' },
];

export function SelectorTema(): React.JSX.Element {
  const [tema, setTema] = useState<Tema>(() => temaGuardado());

  // Con el tema en 'sistema' hay que repintar cuando el móvil pasa al modo
  // oscuro por la noche, sin que el usuario toque nada.
  useEffect(() => {
    if (tema !== 'sistema') return undefined;
    return escucharTemaDelSistema(() => aplicarTema('sistema'));
  }, [tema]);

  function elegir(valor: Tema): void {
    setTema(valor);
    aplicarTema(valor);
    // La preferencia también vive en la base para que viaje en la exportación.
    void repo.ajustes.guardar({ tema: valor });
  }

  return (
    <div className="selector-tema" role="radiogroup" aria-label="Tema de la interfaz">
      {OPCIONES.map((opcion) => (
        <button
          key={opcion.valor}
          type="button"
          role="radio"
          aria-checked={tema === opcion.valor}
          className={`selector-tema__opcion${tema === opcion.valor ? ' es-activa' : ''}`}
          onClick={() => elegir(opcion.valor)}
          title={opcion.nombre}
        >
          <span aria-hidden="true">{opcion.icono}</span>
          <span className="solo-lectores">{opcion.nombre}</span>
        </button>
      ))}
    </div>
  );
}
