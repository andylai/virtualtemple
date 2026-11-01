import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

/** Where `wrangler dev` serves the Worker (see apps/worker/package.json). */
const WORKER_ORIGIN = 'http://localhost:8787';

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/ws': { target: WORKER_ORIGIN, ws: true },
      '/api': { target: WORKER_ORIGIN },
    },
  },
});
