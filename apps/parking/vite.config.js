import { defineConfig } from 'vite';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/**
 * Dev-server only: lets design/wheel-lab save its tuned numbers to
 * design/wheel-lab/params.json. One fixed path, JSON only, never in a build.
 */
function wheelLabSave() {
  const target = fileURLToPath(new URL('./design/wheel-lab/params.json', import.meta.url));
  return {
    name: 'wheel-lab-save',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/__wheel-lab/save', (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405;
          res.end();
          return;
        }
        let body = '';
        req.on('data', (chunk) => {
          body += chunk;
          if (body.length > 256_000) req.destroy();
        });
        req.on('end', () => {
          try {
            const json = JSON.parse(body);
            writeFileSync(target, JSON.stringify(json, null, 2) + '\n');
            res.setHeader('content-type', 'application/json');
            res.end('{"saved":true}');
          } catch (err) {
            res.statusCode = 400;
            res.end(String(err.message));
          }
        });
      });
    },
  };
}

export default defineConfig({
  // Relative asset URLs so a production build runs from any path — opening
  // dist/index.html directly, or publishing it as a hosted artifact, both work.
  // With the default '/' base the built script tag points at an absolute path
  // and the page loads blank anywhere but the domain root.
  base: './',
  plugins: [wheelLabSave()],
  build: {
    target: 'es2022',
    outDir: 'dist',
    // three + cannon-es is comfortably over the default warning limit and
    // there is nothing to be done about it in a single-bundle game.
    chunkSizeWarningLimit: 1400,
    // Site layout: homepage at /, the game at /play/, design previews under /design/.
    rollupOptions: {
      input: {
        home: fileURLToPath(new URL('./index.html', import.meta.url)),
        play: fileURLToPath(new URL('./play/index.html', import.meta.url)),
        design: fileURLToPath(new URL('./design/index.html', import.meta.url)),
        wheelLab: fileURLToPath(new URL('./design/wheel-lab/index.html', import.meta.url)),
        level13: fileURLToPath(new URL('./design/level13/sheet.html', import.meta.url)),
      },
    },
  },
});
