import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const KANBAN_DIR  = path.dirname(fileURLToPath(import.meta.url));
const STATIC_ROOT = path.resolve(KANBAN_DIR, '..', '..');
const DATA_FILE   = path.join(KANBAN_DIR, 'kanban-data.json');
const PORT = process.env.PORT ?? 3000;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js':   'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.svg':  'image/svg+xml',
  '.ico':  'image/x-icon',
};

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);

  // ── API ──────────────────────────────────────────────────
  if (url.pathname === '/api/kanban') {
    if (req.method === 'GET') {
      fs.readFile(DATA_FILE, 'utf8', (err, data) => {
        if (err) { res.writeHead(500); res.end('Read error'); return; }
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(data);
      });
      return;
    }

    if (req.method === 'POST') {
      let body = '';
      req.on('data', chunk => { body += chunk; });
      req.on('end', () => {
        try {
          const parsed = JSON.parse(body);
          const safe = JSON.stringify(parsed, null, 2);
          fs.writeFile(DATA_FILE, safe, 'utf8', err => {
            if (err) { res.writeHead(500); res.end('Write error'); return; }
            res.writeHead(204);
            res.end();
          });
        } catch {
          res.writeHead(400);
          res.end('Invalid JSON');
        }
      });
      return;
    }

    res.writeHead(405);
    res.end('Method not allowed');
    return;
  }

  // ── Static files ─────────────────────────────────────────
  // Redirect bare / to the kanban app so relative module paths resolve correctly
  // if (url.pathname === '/') {
  //   res.writeHead(302, { Location: '/apps/kanban/' });
  //   res.end();
  //   return;
  // }

  // Default index for the kanban directory
  const pathname = url.pathname.endsWith('/')
    ? url.pathname + 'index.html'
    : url.pathname;

  // Prevent path traversal
  const filePath = path.normalize(path.join(STATIC_ROOT, pathname));
  if (!filePath.startsWith(STATIC_ROOT + path.sep) && filePath !== STATIC_ROOT) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  fs.readFile(filePath, (err, data) => {
    if (err) { res.writeHead(404); res.end('Not found'); return; }
    const ext = path.extname(filePath);
    res.writeHead(200, { 'Content-Type': MIME[ext] ?? 'application/octet-stream' });
    res.end(data);
  });
});

server.listen(PORT, () => {
  console.log(`Kanban → http://localhost:${PORT}/apps/kanban/`);
});
