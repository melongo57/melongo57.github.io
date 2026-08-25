import { copyFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath, URL } from 'node:url';
import type { Plugin } from 'vite';
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

/**
 * Copia `index.html` a `404.html` al construir.
 *
 * GitHub Pages sirve ficheros estaticos y no sabe nada de rutas de cliente:
 * al pedir /agenda busca un fichero llamado asi, no lo encuentra y devuelve su
 * pagina de error. Servir el index como 404 hace que la app arranque igual y
 * React Router lea la ruta de `location.pathname`, que es el equivalente al
 * redirect `/* -> /index.html` que ya hay en netlify.toml.
 *
 * No basta con el `navigateFallback` del service worker: ese solo actua cuando
 * el service worker YA esta instalado. La primera visita a un enlace profundo
 * —justo el caso de compartir una URL— llega antes de que exista.
 *
 * Queda excluido del precache con `globIgnores`: seria una segunda copia byte
 * a byte del index, y el service worker nunca llegaria a servirla porque las
 * navegaciones ya caen en `navigateFallback`.
 */
function paginaDeErrorComoIndice(): Plugin {
  return {
    name: 'pagina-404-spa',
    apply: 'build',
    enforce: 'post',
    closeBundle() {
      const salida = resolve(fileURLToPath(new URL('./dist', import.meta.url)));
      const indice = resolve(salida, 'index.html');
      if (!existsSync(indice)) return;
      copyFileSync(indice, resolve(salida, '404.html'));
    },
  };
}

export default defineConfig({
  plugins: [
    react(),
    paginaDeErrorComoIndice(),
    /*
     * `registerType: 'prompt'` a propósito: una versión nueva no se aplica
     * sola. Recargar por sorpresa a alguien que está a medio anotar un
     * repostaje le borraría el formulario; se avisa y decide él.
     */
    VitePWA({
      registerType: 'prompt',
      includeAssets: ['favicon.svg', 'icons/*.png'],
      manifest: false, // usamos public/manifest.webmanifest, escrito a mano
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        // Copia identica del index para el fallback de GitHub Pages: cachearla
        // seria guardar lo mismo dos veces y no la sirve nadie.
        globIgnores: ['404.html'],
        // Las rutas de la app son del lado del cliente: cualquier navegación
        // se sirve con el index y React Router decide qué pintar. Sin esto,
        // abrir /agenda sin conexión daría un 404.
        navigateFallback: '/index.html',
        /*
         * 4 MB de tope por recurso. El valor por defecto (2 MB) deja fuera el
         * bundle con Recharts, y un archivo excluido del precaché es un
         * archivo que no está sin conexión: la app arrancaría en blanco.
         */
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
        cleanupOutdatedCaches: true,
      },
      devOptions: { enabled: false },
    }),
  ],
  server: {
    /*
     * Sin esto, en Windows Vite se ata solo a la loopback IPv6 ([::1]) y el
     * navegador, que resuelve `localhost` como 127.0.0.1, recibe conexión
     * rechazada. `true` lo ata a todas las interfaces, que además es lo que
     * hace falta para abrir la app desde el móvil en la misma WiFi.
     */
    host: true,
    port: 5173,
    // Si el 5173 está ocupado, mejor fallar que arrancar en otro puerto en
    // silencio y dejarte mirando una pestaña que no carga.
    strictPort: true,
  },
  preview: {
    /*
     * `npm run preview` sirve el build de verdad (con service worker), que es
     * lo que hay que probar desde fuera de casa a traves de un tunel.
     */
    host: true,
    port: 4173,
    strictPort: true,
    /*
     * Un tunel llega con una cabecera `Host` que no es `localhost` (por
     * ejemplo `algo.trycloudflare.com`). Vite la rechazaria con «Blocked
     * request» y solo se veria una pagina en blanco. Esto solo afecta al
     * servidor de pruebas local, nunca al build publicado.
     */
    allowedHosts: true,
  },
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.ts'],
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
  },
});
