import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { nxViteTsPaths } from '@nx/vite/plugins/nx-tsconfig-paths.plugin';
import { resolve } from 'path';

// Large uploads need a longer proxy timeout than the default 15s API calls.
const UPLOAD_TIMEOUT_MS = 30 * 60 * 1000;

const engineIoEsm = resolve(
  __dirname,
  '../../node_modules/engine.io-client/build/esm',
);

export default defineConfig({
  root: __dirname,
  envDir: resolve(__dirname, '../..'),
  cacheDir: '../../node_modules/.vite/apps/react-frontend',
  server: {
    port: Number(process.env.FRONTEND_PORT) || 4200,
    host: 'localhost',
    proxy: {
      '/api': {
        target: process.env.VITE_DEV_PROXY_TARGET || 'http://localhost:3000',
        changeOrigin: true,
        timeout: UPLOAD_TIMEOUT_MS,
      },
      '/socket.io': {
        target: process.env.VITE_DEV_PROXY_TARGET || 'http://localhost:3000',
        ws: true,
        changeOrigin: true,
      },
    },
  },
  preview: {
    port: 4300,
    host: 'localhost',
  },
  plugins: [react(), nxViteTsPaths()],
  resolve: {
    conditions: ['browser', 'import', 'module', 'default'],
    alias: {
      'socket.io-client': resolve(
        __dirname,
        '../../node_modules/socket.io-client/build/esm/index.js',
      ),
      'engine.io-client': resolve(engineIoEsm, 'index.js'),
      [resolve(engineIoEsm, 'globals.node.js')]: resolve(
        engineIoEsm,
        'globals.js',
      ),
      [resolve(engineIoEsm, 'transports/websocket.node.js')]: resolve(
        engineIoEsm,
        'transports/websocket.js',
      ),
      [resolve(engineIoEsm, 'transports/polling-xhr.node.js')]: resolve(
        engineIoEsm,
        'transports/polling-xhr.js',
      ),
    },
  },
  optimizeDeps: {
    include: ['socket.io-client', 'engine.io-client'],
  },
  build: {
    outDir: '../../dist/apps/react-frontend',
    emptyOutDir: true,
    reportCompressedSize: false,
  },
});
