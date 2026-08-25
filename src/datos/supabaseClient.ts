import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * Cliente de Supabase, opcional.
 *
 * Sin `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY` en el entorno, `cliente`
 * es `null` y la app funciona exactamente igual que sin este archivo: todo en
 * IndexedDB, sin sincronizar. La sincronización es un añadido, no un
 * requisito — es la diferencia entre «tengo un backend» y «tengo una app que
 * dejaría de arrancar sin uno».
 */

const url = import.meta.env.VITE_SUPABASE_URL;
const clave = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const cliente: SupabaseClient | null =
  url && clave ? createClient(url, clave, { auth: { persistSession: true } }) : null;

export function sincronizacionConfigurada(): boolean {
  return cliente !== null;
}

/**
 * ¿Hay una sesión guardada en este dispositivo? Comprobación SÍNCRONA.
 *
 * `auth.getSession()` es asíncrona, y el arranque de `main.tsx` necesita
 * decidir antes de sembrar si esta base vacía es una instalación nueva o un
 * dispositivo esperando su primera sincronización. `supabase-js` persiste la
 * sesión en `localStorage` bajo una clave derivada de la referencia del
 * proyecto, así que aquí basta con mirar si esa clave existe.
 *
 * Es deliberadamente laxo: no valida el token ni comprueba si ha caducado. Un
 * falso positivo solo retrasa la siembra hasta que el usuario cierre sesión o
 * borre los datos; un falso negativo duplicaría los vehículos, que es mucho
 * peor.
 */
export function haySesionIniciada(): boolean {
  if (!url) return false;
  try {
    const referencia = new URL(url).hostname.split('.')[0];
    return localStorage.getItem(`sb-${referencia}-auth-token`) !== null;
  } catch {
    return false;
  }
}
