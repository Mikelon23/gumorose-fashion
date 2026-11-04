import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Puerto del simulador móvil (ver apps/api/src/server.ts: `PORT ?? 3001`).
const API_TARGET = process.env.API_TARGET ?? 'http://localhost:3001';

export default defineConfig({
  plugins: [react()],
  // `host: true` expone el dev server en la red Wi-Fi local para que
  // cualquier teléfono físico abra la app con http://<tu-ip>:5174.
  server: {
    host: true,
    port: 5174,
    strictPort: false,
    proxy: {
      '/api': {
        target: API_TARGET,
        changeOrigin: true,
      },
    },
  },
});
