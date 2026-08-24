import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
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
