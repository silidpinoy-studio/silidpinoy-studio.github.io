import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon'
};

/** `/silidpinoy-studio` and `silidpinoy-studio/` both become `/silidpinoy-studio`. */
function normaliseBase(basePath) {
  if (!basePath) return '';
  let base = '/' + String(basePath).replace(/^\/+|\/+$/g, '');
  return base === '/' ? '' : base;
}

/**
 * Serve `root` over HTTP on an ephemeral port.
 * IndexedDB needs a real origin, so `file://` will not do.
 *
 * `options.basePath` mounts the whole tree under a prefix, which is how a
 * GitHub Pages project site is served (`/<repo>/…`).
 */
export function startServer(root, port = 0, options = {}) {
  const basePath = normaliseBase(options.basePath);

  const server = http.createServer((req, res) => {
    let pathname;
    try {
      pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    } catch {
      res.writeHead(400).end('bad request');
      return;
    }

    if (basePath) {
      if (pathname === basePath) pathname = '/';
      else if (pathname.startsWith(basePath + '/')) pathname = pathname.slice(basePath.length);
      else {
        res.writeHead(404, { 'Content-Type': 'text/plain' }).end('not found');
        return;
      }
    }

    if (pathname === '/') pathname = '/index.html';

    const file = path.join(root, pathname);
    // never escape the served directory
    if (!file.startsWith(root + path.sep)) {
      res.writeHead(403).end('forbidden');
      return;
    }

    fs.readFile(file, (err, data) => {
      if (err) {
        res.writeHead(404, { 'Content-Type': 'text/plain' }).end('not found');
        return;
      }
      res.writeHead(200, {
        'Content-Type': TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream',
        'Cache-Control': 'no-store'
      });
      res.end(data);
    });
  });

  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => {
      const { port: actual } = server.address();
      resolve({
        url: `http://127.0.0.1:${actual}${basePath}/`,
        basePath,
        server,
        close: () => new Promise((done) => server.close(done))
      });
    });
  });
}
