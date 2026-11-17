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
    proxy: { '/api': 'http://localhost:3001' },
  },
});
