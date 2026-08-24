import type { Id } from './tipos.ts';

/**
 * Identificadores de registro.
 *
 * UUID v4 en lugar de un autoincremento porque, cuando algún día haya
 * sincronización o se importe un JSON de otro dispositivo, dos registros
 * creados sin conexión no pueden colisionar.
 */
export function nuevoId(): Id {
  // `crypto.randomUUID` no existe en contextos no seguros (http:// que no sea
  // localhost), y la app se prueba a veces desde la IP local del móvil.
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }

  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x40; // versión 4
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80; // variante RFC 4122

  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
