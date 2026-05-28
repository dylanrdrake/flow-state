import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const SERVER_DIR = path.dirname(new URL(import.meta.url).pathname);

function getArgValue(args, ...flags) {
  const idx = args.findIndex((arg) => flags.includes(arg));
  return idx >= 0 ? args[idx + 1] : null;
}

function resolvePort() {
  const args = process.argv.slice(2);
  const rawCliPort = getArgValue(args, '--port', '-p') || (args[0] && /^\d+$/.test(args[0]) ? args[0] : null);
  const cliPort = rawCliPort ? Number(rawCliPort) : null;

  const envPort = process.env.PORT ? Number(process.env.PORT) : null;
  const selected = Number.isInteger(cliPort) && cliPort > 0
    ? cliPort
    : (Number.isInteger(envPort) && envPort > 0 ? envPort : 3300);

  return selected;
}

function resolveStaticRoot() {
  const args = process.argv.slice(2);
  const cliRoot = getArgValue(args, '--root', '-r');
  const envRoot = process.env.STATIC_ROOT;
  const selected = cliRoot || envRoot || process.cwd();
  return path.resolve(selected);
}

const PORT = resolvePort();
const STATIC_ROOT = resolveStaticRoot();
const DEVTOOLS_BASE = '/devtools';
const ASSETS_BASE = '/assets';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

function resolvePath(urlPathname, rootDir) {
  const pathname = urlPathname.endsWith('/') ? `${urlPathname}index.html` : urlPathname;
  return path.normalize(path.join(rootDir, pathname));
}

function resolveTargetPath(urlPathname) {
  const pathname = urlPathname.endsWith('/') ? `${urlPathname}index.html` : urlPathname;
  return path.normalize(path.join(STATIC_ROOT, pathname));
}

function resolveDevtoolsPath(urlPathname) {
  const subPath = urlPathname.replace(/^\/devtools/, '') || '/';
  const pathname = subPath.endsWith('/') ? `${subPath}index.html` : subPath;
  return path.normalize(path.join(SERVER_DIR, pathname));
}

function isWithinRoot(filePath, rootPath) {
  return filePath === rootPath || filePath.startsWith(rootPath + path.sep);
}

function sendFile(filePath, res) {
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Not found');
      return;
    }

    const ext = path.extname(filePath);
    res.writeHead(200, { 'Content-Type': MIME[ext] ?? 'application/octet-stream' });
    res.end(data);
  });
}

function resolveFlowStateModulePath() {
  const candidates = [
    path.resolve(SERVER_DIR, '..', 'FlowState.js'),
    path.resolve(SERVER_DIR, '..', 'flow-state.js'),
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}

function resolveAssetsRoot() {
  const candidates = [
    path.resolve(SERVER_DIR, '..', 'assets'),
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);

  if (url.pathname === DEVTOOLS_BASE) {
    res.writeHead(302, { Location: `${DEVTOOLS_BASE}/` });
    res.end();
    return;
  }

  if (url.pathname.startsWith(`${DEVTOOLS_BASE}/`)) {
    const filePath = resolveDevtoolsPath(url.pathname);
    if (!isWithinRoot(filePath, SERVER_DIR)) {
      res.writeHead(403);
      res.end('Forbidden');
      return;
    }
    sendFile(filePath, res);
    return;
  }

  if (url.pathname === '/FlowState.js') {
    const modulePath = resolveFlowStateModulePath();
    if (!modulePath) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('FlowState module not found');
      return;
    }
    sendFile(modulePath, res);
    return;
  }

  if (url.pathname.startsWith(`${ASSETS_BASE}/`)) {
    const assetsRoot = resolveAssetsRoot();
    if (!assetsRoot) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Assets root not found');
      return;
    }

    const subPath = url.pathname.replace(/^\/assets/, '') || '/';
    const filePath = resolvePath(subPath, assetsRoot);
    if (!isWithinRoot(filePath, assetsRoot)) {
      res.writeHead(403);
      res.end('Forbidden');
      return;
    }
    sendFile(filePath, res);
    return;
  }

  const filePath = resolveTargetPath(url.pathname);
  if (!isWithinRoot(filePath, STATIC_ROOT)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }
  sendFile(filePath, res);
});

server.listen(PORT, () => {
  console.log(`Target root (${STATIC_ROOT}) -> http://localhost:${PORT}/`);
  console.log(`DevTools -> http://localhost:${PORT}${DEVTOOLS_BASE}/`);
});
