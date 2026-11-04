import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  integrations: [react()],
  vite: {
    plugins: [tailwindcss()],
  },
  output: 'static',
  // Base must be '/' when served from domain root (https://znavvy.web.id)
  base: '/',
  // Build output goes to dist/ inside web/frontend/
  outDir: 'dist',
  build: {
    // Inline small assets to reduce round trips
    inlineStylesheets: 'auto',
  },
});
