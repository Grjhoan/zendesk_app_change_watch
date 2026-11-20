import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig({
  plugins: [react()],
  base: './',
  root: path.resolve(__dirname, 'src'),
  build: {
    outDir: path.resolve(__dirname, 'dist/assets'),
    assetsDir: 'bundle',
    emptyOutDir: true,
    sourcemap: false,
    rollupOptions: {
      input: {
        iframe: path.resolve(__dirname, 'src/iframe.html')
      }
    }
  }
});
