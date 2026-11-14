// HTTP-server for statiske filer pluss WebSocket for spillet. Én prosess, ingen byggesteg.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { dirname, extname, join, normalize, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import { handleConnection } from './lobby.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.PORT) || 3000;

// URL-prefiks -> mappe på disk. Første treff vinner, så de mest spesifikke står først.
const MOUNTS = [
  ['/vendor/three/', join(ROOT, 'node_modules', 'three', 'build')],
  ['/vendor/fonts/vt323/', join(ROOT, 'node_modules', '@fontsource', 'vt323')],
  ['/vendor/fonts/pixelify-sans/', join(ROOT, 'node_modules', '@fontsource', 'pixelify-sans')],
  ['/shared/', join(ROOT, 'shared')],
  ['/', join(ROOT, 'public')],
];

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.mp3': 'audio/mpeg',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
};

function resolveFile(urlPath) {
  const path = urlPath === '/' ? '/index.html' : urlPath;
  for (const [prefix, dir] of MOUNTS) {
    if (!path.startsWith(prefix)) continue;
    const file = normalize(join(dir, path.slice(prefix.length)));
    // Hindrer at "../" i URL-en når filer utenfor den monterte mappen.
    return file.startsWith(dir + sep) ? file : null;
  }
  return null;
}

const server = createServer(async (req, res) => {
  const urlPath = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  if (urlPath === '/healthz') {
    res.writeHead(200, { 'content-type': 'text/plain' }).end('ok');
    return;
  }
  const file = resolveFile(urlPath);
  try {
    if (!file) throw new Error('utenfor rot');
    const body = await readFile(file);
    res.writeHead(200, {
      'content-type': MIME[extname(file)] || 'application/octet-stream',
      // Lyd, bilder og biblioteker endres sjelden. Kode og sider hentes alltid på nytt.
      'cache-control': /^\/(assets|vendor)\//.test(urlPath) ? 'public, max-age=86400' : 'no-cache',
      'x-content-type-options': 'nosniff',
    }).end(body);
  } catch {
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' }).end('Fant ikke filen');
  }
});

const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 4096 });
wss.on('connection', handleConnection);

server.listen(PORT, () => {
  console.log(`S.S.S.S. kjører på http://localhost:${PORT}`);
});
