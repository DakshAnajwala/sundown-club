import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

/**
 * Night Drive (street racing) in Sundown Club. The public build is ONE page,
 * the test drive at /racing/ (index.html, which runs the Handling Lab). The
 * story previews (design/models, design/scenes) are dev-server only: they
 * show unfinished story content and are not part of the site.
 *
 * Set DESIGN=1 to also build the design pages (e.g. to publish one).
 */
const page = (p) => fileURLToPath(new URL(p, import.meta.url));
const design = process.env.DESIGN
  ? {
      handling: page('./design/handling/index.html'),
      models: page('./design/models/index.html'),
      scenes: page('./design/scenes/index.html'),
    }
  : {};

export default defineConfig({
  // Relative asset URLs: the site serves this app from /racing/.
  base: './',
  server: { port: 5177, strictPort: true },
  build: {
    target: 'es2022',
    outDir: 'dist',
    chunkSizeWarningLimit: 1400,
    rollupOptions: {
      input: { index: page('./index.html'), ...design },
    },
  },
});
