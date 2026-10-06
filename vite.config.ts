import {resolve} from 'node:path';
import react from '@vitejs/plugin-react';
import {defineConfig} from 'vitest/config';

const webRoot = resolve(import.meta.dirname, 'web');

/**
 * The PWA lives in `web/`; the engine stays in `src/` and is imported by the application layer only.
 * The production build outputs to `web/dist` and the dev server keeps the engine sources in place.
 */
export default defineConfig({
  root: webRoot,
  plugins: [react()],
  build: {
    outDir: resolve(webRoot, 'dist'),
    emptyOutDir: true,
    target: 'es2022',
    sourcemap: false,
  },
  server: {host: '127.0.0.1', port: 5173, strictPort: true},
  // Bind IPv4 explicitly: the E2E runner probes 127.0.0.1 while `localhost` may resolve to ::1.
  preview: {host: '127.0.0.1', port: 4173, strictPort: true},
  test: {
    root: webRoot,
    environment: 'jsdom',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    setupFiles: [resolve(webRoot, 'src/test-setup.ts')],
    restoreMocks: true,
  },
});
