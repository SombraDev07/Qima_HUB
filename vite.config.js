import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      // API pública do núcleo para os módulos: import { ... } from '@hub'
      '@hub': path.resolve(import.meta.dirname, 'core/web/shared/index.js'),
    },
  },
  server: {
    port: Number(process.env.PORT) || 5173,
    // changeOrigin: false mantém o Host do navegador (localhost:5173); a checagem de origem da API compara com ele
    proxy: { '/api': { target: 'http://localhost:3001', changeOrigin: false } },
  },
});
