import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { repo } from '@/datos/repositorioDexie.ts';
import { sembrarSiHaceFalta } from '@/datos/semilla.ts';
import { App } from '@/ui/App.tsx';
import { asegurarPersistencia } from '@/ui/almacenamiento.ts';
import { aplicarTema, temaGuardado } from '@/ui/tema.ts';
import '@/estilos/base.css';

aplicarTema(temaGuardado());

/**
 * La primera vez que se abre la app, la base está vacía y no hay nada que
 * mirar. Se cargan los datos de ejemplo para que el panel principal tenga
 * sentido desde el primer segundo; se borran desde Ajustes.
 */
await sembrarSiHaceFalta(repo);

/*
 * Marca el almacenamiento como persistente para que el navegador no lo desaloje
 * por su cuenta cuando al dispositivo le falte espacio. Chrome lo concede sin
 * preguntar si la app está instalada o se usa a menudo, así que en el caso
 * normal esto no interrumpe a nadie. No espera: si tarda, no debe retrasar el
 * primer pintado.
 */
void asegurarPersistencia();

const contenedor = document.getElementById('raiz');
if (!contenedor) throw new Error('Falta el nodo #raiz en index.html');

createRoot(contenedor).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
