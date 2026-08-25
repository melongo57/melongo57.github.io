import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { repo } from '@/datos/repositorioDexie.ts';
import { sembrarSiHaceFalta } from '@/datos/semilla.ts';
import { haySesionIniciada } from '@/datos/supabaseClient.ts';
import { App } from '@/ui/App.tsx';
import { aplicarTema, temaGuardado } from '@/ui/tema.ts';
import '@/estilos/base.css';

aplicarTema(temaGuardado());

/**
 * Datos de ejemplo la primera vez que se abre la app: sin ellos, el panel
 * principal no tiene nada que enseñar. Se borran desde Ajustes.
 *
 * PERO NO SI HAY UNA CUENTA INICIADA. Una base vacía con sesión no es una
 * instalación nueva: son datos que están a punto de llegar del servidor.
 * Sembrar ahí crea cuatro vehículos de ejemplo con identificadores nuevos que
 * la sincronización sube como si fueran reales, y al bajar los de verdad te
 * quedas con ocho — el duplicado silencioso que la importación de copias
 * evita a propósito, colándose por la puerta de atrás.
 *
 * Con sesión iniciada, la app arranca vacía un instante y se llena en cuanto
 * termina la primera sincronización, que es el comportamiento correcto en un
 * móvil nuevo.
 */
if (!haySesionIniciada()) {
  await sembrarSiHaceFalta(repo);
}

const contenedor = document.getElementById('raiz');
if (!contenedor) throw new Error('Falta el nodo #raiz en index.html');

createRoot(contenedor).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
