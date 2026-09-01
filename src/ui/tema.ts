import type { Tema } from '@/dominio/tipos.ts';

/**
 * Aplicación del tema claro / oscuro.
 *
 * La preferencia se guarda en `localStorage` además de en la base de datos:
 * el script en línea de `index.html` necesita leerla de forma síncrona antes
 * del primer frame para que no haya un destello blanco al abrir la app
 * instalada en modo oscuro, y no puede esperar a que IndexedDB responda.
 */

export const CLAVE_TEMA = 'mi-garaje:tema';

const COLOR_BARRA: Record<'claro' | 'oscuro', string> = {
  claro: '#f5f7f6',
  oscuro: '#0f1414',
};

function prefiereOscuro(): boolean {
  return globalThis.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false;
}

export function temaEfectivo(tema: Tema): 'claro' | 'oscuro' {
  if (tema === 'sistema') return prefiereOscuro() ? 'oscuro' : 'claro';
  return tema;
}

export function aplicarTema(tema: Tema): void {
  const efectivo = temaEfectivo(tema);
  const raiz = document.documentElement;

  if (efectivo === 'oscuro') raiz.setAttribute('data-tema', 'oscuro');
  else raiz.removeAttribute('data-tema');

  // Las dos etiquetas con `media` de index.html dejan de valer en cuanto el
  // usuario fuerza un tema; se sustituyen por una sola sin `media`.
  document
    .querySelectorAll('meta[name="theme-color"]')
    .forEach((meta) => meta.setAttribute('content', COLOR_BARRA[efectivo]));

  try {
    localStorage.setItem(CLAVE_TEMA, tema);
  } catch {
    // Almacenamiento bloqueado (modo privado). El tema vive solo esta sesión.
  }
}

export function temaGuardado(): Tema {
  try {
    const valor = localStorage.getItem(CLAVE_TEMA);
    if (valor === 'claro' || valor === 'oscuro' || valor === 'sistema') return valor;
  } catch {
    /* ignorado */
  }
  return 'sistema';
}

/** Reacciona a que el usuario cambie el tema del sistema operativo. */
export function escucharTemaDelSistema(alCambiar: () => void): () => void {
  const consulta = globalThis.matchMedia?.('(prefers-color-scheme: dark)');
  if (!consulta) return () => {};
  consulta.addEventListener('change', alCambiar);
  return () => consulta.removeEventListener('change', alCambiar);
}
