import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { repo } from '@/datos/repositorioDexie.ts';
import { sembrarSiHaceFalta } from '@/datos/semilla.ts';
import { App } from '@/ui/App.tsx';
import { aplicarTema, temaGuardado } from '@/ui/tema.ts';
import '@/estilos/base.css';

aplicarTema(temaGuardado());

/**
 * La primera vez que se abre la app, la base está vacía y no hay nada que
 * mirar. Se cargan los datos de ejemplo para que el panel principal tenga
 * sentido desde el primer segundo; se borran desde Ajustes.
 */
await sembrarSiHaceFalta(repo);

const contenedor = document.getElementById('raiz');
if (!contenedor) throw new Error('Falta el nodo #raiz en index.html');

createRoot(contenedor).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
