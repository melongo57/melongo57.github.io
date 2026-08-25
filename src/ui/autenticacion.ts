import { useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { cliente } from '@/datos/supabaseClient.ts';

/**
 * Sesión de Supabase Auth.
 *
 * Email y contraseña, sin más: es de uso personal, un correo de confirmación
 * de alta o un enlace mágico añadirían un paso sin aportar nada aquí. La
 * sesión la persiste el propio `supabase-js` en `localStorage`.
 */

export interface ResultadoAuth {
  ok: boolean;
  error?: string;
}

const SIN_CONFIGURAR = 'La sincronización no está configurada en este despliegue.';

export async function registrarse(email: string, contrasena: string): Promise<ResultadoAuth> {
  if (!cliente) return { ok: false, error: SIN_CONFIGURAR };
  const { error } = await cliente.auth.signUp({ email, password: contrasena });
  return error ? { ok: false, error: traducirError(error.message) } : { ok: true };
}

export async function iniciarSesion(email: string, contrasena: string): Promise<ResultadoAuth> {
  if (!cliente) return { ok: false, error: SIN_CONFIGURAR };
  const { error } = await cliente.auth.signInWithPassword({ email, password: contrasena });
  return error ? { ok: false, error: traducirError(error.message) } : { ok: true };
}

export async function cerrarSesion(): Promise<void> {
  await cliente?.auth.signOut();
}

function traducirError(mensaje: string): string {
  if (mensaje.includes('Invalid login credentials')) return 'Correo o contraseña incorrectos.';
  if (mensaje.includes('already registered')) return 'Ya hay una cuenta con ese correo.';
  if (mensaje.includes('Password should be at least')) {
    return 'La contraseña necesita al menos 6 caracteres.';
  }
  if (mensaje.includes('Unable to validate email') || mensaje.includes('is invalid')) {
    // Supabase rechaza dominios que no existen (.test, .local...) además de
    // los correos mal formados, así que el mensaje tiene que cubrir los dos.
    return 'Ese correo no parece válido. Comprueba que el dominio existe.';
  }
  if (mensaje.includes('Email not confirmed')) {
    return 'Falta confirmar el correo. Abre el enlace que te ha llegado.';
  }
  if (mensaje.includes('rate limit') || mensaje.includes('Too many')) {
    return 'Demasiados intentos seguidos. Espera un minuto y vuelve a probar.';
  }
  return mensaje;
}

/** Sesión actual, reactiva. `undefined` mientras se comprueba; `null` sin sesión. */
export function useSesion(): Session | null | undefined {
  const [sesion, setSesion] = useState<Session | null | undefined>(undefined);

  useEffect(() => {
    if (!cliente) {
      setSesion(null);
      return undefined;
    }

    void cliente.auth.getSession().then(({ data }) => setSesion(data.session));

    const { data: suscripcion } = cliente.auth.onAuthStateChange((_evento, nuevaSesion) => {
      setSesion(nuevaSesion);
    });

    return () => suscripcion.subscription.unsubscribe();
  }, []);

  return sesion;
}
