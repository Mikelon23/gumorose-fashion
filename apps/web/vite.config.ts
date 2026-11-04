import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Puerto real del backend (ver apps/api/src/server.ts: `PORT ?? 3001`).
// Se puede sobreescribir con la variable de entorno API_TARGET.
const API_TARGET = process.env.API_TARGET ?? 'http://localhost:3001';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: API_TARGET,
        changeOrigin: true,
      },
    },
  },
});
