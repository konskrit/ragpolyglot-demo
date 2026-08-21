import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { nxViteTsPaths } from '@nx/vite/plugins/nx-tsconfig-paths.plugin';
import { resolve } from 'path';

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
  build: {
    outDir: '../../dist/apps/react-frontend',
    emptyOutDir: true,
    reportCompressedSize: false,
  },
});
