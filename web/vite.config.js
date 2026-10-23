import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Dev server: see dev-server.js (Vite runs inside the Node server, `npm run dev`).
export default defineConfig({
  plugins: [react()],
  build: { outDir: '../dist', emptyOutDir: true },
});
