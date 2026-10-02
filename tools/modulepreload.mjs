/**
 * modulepreload.mjs — adds <link rel="modulepreload"> tags to the built static pages (hub and the three card
 * games) for every module their first screen imports, found by reading the import statements. Without them the
 * browser learns about each file only after the one that imports it has arrived (four or five round trips deep);
 * with them everything downloads at once. Dynamic import() is left alone: those files are not on the way in.
 * Called by tools/build-site.mjs after dist/ is assembled.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { posix } from 'node:path';

const MAP = { '@sundown/shared/': '/shared/' };           // the pages' import maps
const BARE = { three: '/vendor/three/three.module.js' };

function resolve(spec, from) {
  if (BARE[spec]) return BARE[spec];
  for (const [k, v] of Object.entries(MAP)) if (spec.startsWith(k)) { const f = v + spec.slice(k.length); return f.endsWith('.js') ? f : f + '.js'; }
  if (spec.startsWith('/')) return spec;
  if (spec.startsWith('.')) return posix.normalize(posix.join(posix.dirname(from), spec));
  return null;
}
const STATIC_IMPORT = /(?:^|[\n;])\s*(?:import|export)\s+(?:[^'"()]*?\s+from\s+)?['"]([^'"]+)['"]/g;

/** All modules reachable by static imports from `source` (a page's inline module script), as site paths. */
export function crawl(source, pageDir, dist = 'dist') {
  const seen = new Set();
  const visit = (spec, from) => {
    const url = resolve(spec, from);
    if (!url || seen.has(url)) return;
    const file = `${dist}${url}`;
    if (!existsSync(file)) return;
    seen.add(url);
    const text = readFileSync(file, 'utf8');
    for (const m of text.matchAll(STATIC_IMPORT)) visit(m[1], url);
  };
  for (const m of source.matchAll(STATIC_IMPORT)) visit(m[1], pageDir + '/index.html');
  return [...seen];
}

export function injectPreloads(page, dist = 'dist') {
  const file = `${dist}${page === '/' ? '' : page}/index.html`;
  const html = readFileSync(file, 'utf8');
  const modules = [...html.matchAll(/<script type="module">([\s\S]*?)<\/script>/g)].map((m) => m[1]).join('\n');
  const urls = crawl(modules, page === '/' ? '' : page.replace(/\/$/, ''), dist);
  if (!urls.length) return 0;
  // three.js is the bulk and the game cannot start without it, so it goes first at high priority; the small shared modules come after.
  const tags = urls.map((u) => `<link rel="modulepreload" href="${u}"${u.startsWith('/vendor/three/') ? ' fetchpriority="high"' : ''}>`).join('\n');
  // after the import map when there is one (it must come first), else before the first stylesheet
  const at = html.includes('</script>', html.indexOf('type="importmap"')) && html.includes('type="importmap"') ? html.indexOf('</script>', html.indexOf('type="importmap"')) + '</script>'.length : html.indexOf('</title>') + '</title>'.length;
  writeFileSync(file, html.slice(0, at) + '\n' + tags + html.slice(at));
  return urls.length;
}
