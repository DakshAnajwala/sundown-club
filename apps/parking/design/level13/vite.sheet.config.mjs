// Build config for publishing the sheet as a single-page artifact (not part of the game build).
import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';
export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  base: './',
  logLevel: 'warn',
  build: {
    outDir: process.env.SHEET_OUT ?? 'dist-sheet',
    emptyOutDir: true,
    target: 'es2022',
    chunkSizeWarningLimit: 2000,
    rollupOptions: { input: fileURLToPath(new URL('./sheet.html', import.meta.url)) },
  },
});
