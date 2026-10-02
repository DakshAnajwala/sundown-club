/**
 * dev-api.mjs — serves dist/ plus the club API functions (api/club/*) with an
 * in-memory store, for checking telemetry locally. Not used in production.
 *   node tools/dev-api.mjs [port]      (METRICS_PASSWORD defaults to "dev")
 */
import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import event from '../api/club/event.js';
import metricsHandler from '../api/club/metrics.js';

process.env.METRICS_PASSWORD ||= 'dev';
const port = Number(process.argv[2]) || 5181;
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.jpg': 'image/jpeg', '.png': 'image/png', '.woff2': 'font/woff2', '.xml': 'application/xml', '.txt': 'text/plain' };
const bodies = []; // raw event bodies, for tools/telemetry-probe.mjs (GET /dev/bodies)
const routes = { '/api/club/event': event, '/api/club/metrics': metricsHandler };

function shim(res) {
  res.status = (c) => { res.statusCode = c; return res; };
  res.json = (o) => { res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(o)); };
  return res;
}

http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  if (url.pathname === '/dev/bodies') { res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(bodies)); return; }
  const fn = routes[url.pathname];
  if (fn && url.pathname === '/api/club/event' && req.method === 'POST') {
    const chunks = [];
    for await (const c of req) chunks.push(c);
    const raw = Buffer.concat(chunks).toString('utf8');
    bodies.push(raw);
    try { req.body = JSON.parse(raw); } catch { req.body = raw; }
  }
  if (fn) { try { await fn(req, shim(res)); } catch (e) { res.statusCode = 500; res.end(String(e)); } return; }
  let path = normalize(join('dist', decodeURIComponent(url.pathname)));
  if (!path.startsWith('dist')) { res.statusCode = 403; res.end(); return; }
  try {
    if ((await stat(path)).isDirectory()) path = join(path, 'index.html');
    res.setHeader('content-type', TYPES[extname(path)] || 'application/octet-stream');
    res.end(await readFile(path));
  } catch { res.statusCode = 404; res.end('not found'); }
}).listen(port, () => console.log(`dev-api on http://localhost:${port}`));
