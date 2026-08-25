import { useSyncExternalStore } from 'react';

/** El evento no está en los tipos estándar: es propio de Chromium. */
export interface EventoInstalacion extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

function estaInstalada(): boolean {
  return (
    globalThis.matchMedia?.('(display-mode: standalone)').matches ||
    // iOS no implementa display-mode y usa esta propiedad propia.
    (navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

interface Estado {
  evento: EventoInstalacion | null;
  instalada: boolean;
}

/*
 * Estado compartido a propósito, en vez de que cada componente escuche
 * `beforeinstallprompt` por su cuenta: el evento solo se puede usar UNA vez.
 * Con dos copias independientes —el aviso flotante y el bloque de Ajustes—
 * instalar desde una dejaría a la otra con una referencia caducada que
 * revienta al pulsarla. Aquí solo hay un sitio que lo usa, y en cuanto se usa
 * (o llega `appinstalled`) desaparece en todas partes a la vez.
 */
let estado: Estado = { evento: null, instalada: estaInstalada() };
const suscriptores = new Set<() => void>();

function actualizar(parcial: Partial<Estado>): void {
  estado = { ...estado, ...parcial };
  suscriptores.forEach((avisar) => avisar());
}

window.addEventListener('beforeinstallprompt', (e) => {
  // Sin esto, Chrome enseña su propia barra y pierdes el control del momento
  // en que se pide.
  e.preventDefault();
  actualizar({ evento: e as EventoInstalacion });
});
window.addEventListener('appinstalled', () => {
  actualizar({ evento: null, instalada: true });
});

function suscribir(avisar: () => void): () => void {
  suscriptores.add(avisar);
  return () => suscriptores.delete(avisar);
}

function leerEstado(): Estado {
  return estado;
}

/** Estado de instalación, reactivo y compartido por toda la app. */
export function useEstadoInstalacion(): Estado {
  return useSyncExternalStore(suscribir, leerEstado);
}

export type ResultadoInstalar = 'aceptada' | 'rechazada' | 'no_disponible';

/**
 * Chrome en Android dispara `beforeinstallprompt` y deja provocar el diálogo
 * de instalación desde un botón propio; el resto de navegadores no, y ahí
 * `evento` nunca llega a existir. Fingir un botón que no hace nada sería peor
 * que no ofrecerlo.
 */
export async function instalarApp(): Promise<ResultadoInstalar> {
  const { evento } = estado;
  if (!evento) return 'no_disponible';
  await evento.prompt();
  const { outcome } = await evento.userChoice;
  // El evento solo se puede usar una vez, se acepte o no.
  actualizar({ evento: null, instalada: outcome === 'accepted' });
  return outcome === 'accepted' ? 'aceptada' : 'rechazada';
}
