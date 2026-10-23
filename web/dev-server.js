// Dev only: Vite runs inside the Node server (middleware mode), so `npm run dev` is one process on one port
// with hot reload, the real API and the real security headers. Production serves the built dist/ instead.
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import config from './vite.config.js';

export function createDevServer(httpServer) {
  return createServer({
    ...config,
    configFile: false, // config imported above; no temp files for `node --watch` to trip over
    root: fileURLToPath(new URL('.', import.meta.url)),
    appType: 'mpa', // index.html at `/`, 404 elsewhere: same as production
    server: { middlewareMode: true, hmr: { server: httpServer } },
  });
}
