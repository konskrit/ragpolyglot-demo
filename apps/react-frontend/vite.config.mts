/// <reference types='vitest' />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { nxViteTsPaths } from '@nx/vite/plugins/nx-tsconfig-paths.plugin';
import { nxCopyAssetsPlugin } from '@nx/vite/plugins/nx-copy-assets.plugin';
import { resolve } from 'node:path';

const UPLOAD_TIMEOUT_MS = 30 * 60 * 1000;

export default defineConfig({
  root: import.meta.dirname,
  envDir: resolve(import.meta.dirname, '../..'),
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
  plugins: [react(), nxViteTsPaths(), nxCopyAssetsPlugin(['*.md'])],
  build: {
    outDir: '../../dist/apps/react-frontend',
    emptyOutDir: true,
    reportCompressedSize: false,
    commonjsOptions: {
      transformMixedEsModules: true,
    },
  },
});
