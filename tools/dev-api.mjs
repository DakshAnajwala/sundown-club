/**
 * dev-api.mjs — serves dist/ plus the club API functions (api/club/*) with an
 * in-memory store, for checking telemetry locally. Not used in production.
 *   node tools/dev-api.mjs [port]      (METRICS_PASSWORD defaults to "dev")
 */
import http from 'node:http';
import http2 from 'node:http2';
import { readFileSync, existsSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { brotliCompressSync, gzipSync } from 'node:zlib';
import event from '../api/club/event.js';
import metricsHandler from '../api/club/metrics.js';
import playHandler from '../api/club/play.js';
import boardHandler from '../api/club/board.js';
import pushRun from '../api/club/push-run.js';

process.env.METRICS_PASSWORD ||= 'dev';
process.env.CLUB_DEV = '1';   // lets probes send x-dev-now to move the clock
const port = Number(process.argv[2]) || 5181;
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.jpg': 'image/jpeg', '.png': 'image/png', '.woff2': 'font/woff2', '.xml': 'application/xml', '.txt': 'text/plain' };
const bodies = []; // raw event bodies, for tools/telemetry-probe.mjs (GET /dev/bodies)
const routes = { '/api/club/event': event, '/api/club/metrics': metricsHandler, '/api/club/play': playHandler, '/api/club/board': boardHandler, '/api/club/push-run': pushRun };

function shim(res) {
  res.status = (c) => { res.statusCode = c; return res; };
  res.json = (o) => { res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(o)); };
  return res;
}

const handler = async (req, res) => {
  const url = new URL(req.url, 'http://x');
  if (url.pathname === '/dev/bodies') { res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(bodies)); return; }
  const fn = routes[url.pathname];
  if (fn && ['/api/club/event', '/api/club/play'].includes(url.pathname) && req.method === 'POST') {
    const isEvent = url.pathname === '/api/club/event';
    const chunks = [];
    for await (const c of req) chunks.push(c);
    const raw = Buffer.concat(chunks).toString('utf8');
    if (isEvent) bodies.push(raw);
    try { req.body = JSON.parse(raw); } catch { req.body = raw; }
  }
  if (fn) { try { await fn(req, shim(res)); } catch (e) { res.statusCode = 500; res.end(String(e)); } return; }
  const pathname = /^\/c\/[^/]+$/.test(url.pathname) ? '/c/index.html' : url.pathname;   // same rewrite as vercel.json
  let path = normalize(join('dist', decodeURIComponent(pathname)));
  if (!path.startsWith('dist')) { res.statusCode = 403; res.end(); return; }
  try {
    if ((await stat(path)).isDirectory()) path = join(path, 'index.html');
    const type = TYPES[extname(path)] || 'application/octet-stream';
    res.setHeader('content-type', type);
    let body = await readFile(path);
    // Vercel compresses text; so does this, so size and timing checks (tools/perf-probe.mjs) look like production.
    if (/text|javascript|json|svg|xml/.test(type)) {
      const ae = String(req.headers['accept-encoding'] || '');
      if (/\bbr\b/.test(ae)) { body = brotliCompressSync(body); res.setHeader('content-encoding', 'br'); }
      else if (/gzip/.test(ae)) { body = gzipSync(body); res.setHeader('content-encoding', 'gzip'); }
      res.setHeader('vary', 'accept-encoding');
    }
    res.end(body);
  } catch { res.statusCode = 404; res.end('not found'); }
};
// H2=1 (or H2_CERT_DIR=<dir with key.pem and cert.pem>) serves HTTP/2 over TLS like Vercel does, so timing checks do not queue behind
// HTTP/1.1's six connections (tools/perf-probe.mjs uses it). Without it: plain HTTP/1.1.
let certDir = process.env.H2_CERT_DIR;
if (!certDir && process.env.H2 === '1') {   // H2=1: make (once) a throwaway certificate in .dev-cert/ with openssl
  certDir = '.dev-cert';
  if (!existsSync(`${certDir}/cert.pem`)) { mkdirSync(certDir, { recursive: true }); execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', `${certDir}/key.pem`, '-out', `${certDir}/cert.pem`, '-days', '30', '-subj', '/CN=localhost'], { stdio: 'ignore' }); }
}
if (certDir) {
  http2.createSecureServer({ key: readFileSync(`${certDir}/key.pem`), cert: readFileSync(`${certDir}/cert.pem`), allowHTTP1: true }, handler).listen(port, () => console.log(`dev-api (h2) on https://localhost:${port}`));
} else {
  http.createServer(handler).listen(port, () => console.log(`dev-api on http://localhost:${port}`));
}
