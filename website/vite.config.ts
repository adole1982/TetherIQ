import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  root: path.resolve(__dirname, '.'),
  publicDir: path.resolve(__dirname, '../public'),
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@brand': path.resolve(__dirname, '../public/brand/generated'),
    },
  },
  server: {
    port: 5174,
    host: true,
  },
  build: {
    outDir: path.resolve(__dirname, '../dist-website'),
    emptyOutDir: true,
  },
});
