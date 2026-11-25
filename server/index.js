// HTTP-server for statiske filer pluss WebSocket for spillet. Én prosess, ingen byggesteg.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname } from 'node:path';
import { WebSocketServer } from 'ws';
import { handleConnection } from './lobby.js';
import { resolveFile } from './static.js';

const PORT = Number(process.env.PORT) || 3000;

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

const server = createServer(async (req, res) => {
  // En ugyldig URL (for eksempel "/%E0") får decodeURIComponent til å kaste. Det skal gi 404, ikke
  // en ufanget feil som stopper hele serveren.
  let urlPath;
  try {
    urlPath = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  } catch {
    res.writeHead(400, { 'content-type': 'text/plain; charset=utf-8' }).end('Ugyldig adresse');
    return;
  }
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

// Siste skanse: et avvist løfte ingen tok hånd om, skal logges, ikke stoppe alle rom.
process.on('unhandledRejection', (err) => console.error('Ufanget feil i løfte:', err));

server.listen(PORT, () => {
  console.log(`S.S.S.S. kjører på http://localhost:${PORT}`);
});
