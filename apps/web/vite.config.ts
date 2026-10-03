import path from 'node:path';
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

const apiTarget = process.env.VITE_API_PROXY_TARGET ?? 'http://localhost:3000';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { '@': path.resolve(import.meta.dirname, 'src') },
  },
  server: {
    port: 5173,
    // Same-origin in dev, like production where Nest serves the SPA.
    proxy: {
      '/api': { target: apiTarget, changeOrigin: false },
      '/mcp': { target: apiTarget, changeOrigin: false },
    },
  },
  test: {
    include: ['src/**/*.spec.{ts,tsx}'],
    passWithNoTests: true,
  },
});
