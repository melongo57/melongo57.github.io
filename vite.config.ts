import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    // El service worker completo llega en la fase 7. De momento se registra en
    // modo `injectManifest`-less (generateSW) para que la app sea instalable.
    VitePWA({
      registerType: 'prompt',
      includeAssets: ['favicon.svg', 'icons/*.png'],
      manifest: false, // usamos public/manifest.webmanifest, escrito a mano
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        navigateFallback: '/index.html',
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
