/* Minimal local preview server: no dependencies, read-only, localhost only. */
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { join, extname, normalize } from 'node:path';
import { ROOT } from './content.mjs';

const DIST = join(ROOT, 'dist');
const PORT = Number(process.env.PORT || 4321);

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.xml': 'application/xml; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
};

const resolve = async (urlPath) => {
  // normalize() plus the prefix check keeps requests inside dist/.
  const clean = normalize(decodeURIComponent(urlPath.split('?')[0])).replace(/^(\.\.(\/|$))+/, '');
  let target = join(DIST, clean);
  if (!target.startsWith(DIST)) return null;
  try {
    if ((await stat(target)).isDirectory()) target = join(target, 'index.html');
  } catch {
    return null;
  }
  return target;
};

createServer(async (req, res) => {
  const target = await resolve(req.url || '/');
  try {
    if (!target) throw new Error('outside root');
    const body = await readFile(target);
    res.writeHead(200, { 'content-type': TYPES[extname(target)] || 'application/octet-stream' });
    res.end(body);
  } catch {
    try {
      const body = await readFile(join(DIST, '404.html'));
      res.writeHead(404, { 'content-type': TYPES['.html'] });
      res.end(body);
    } catch {
      res.writeHead(404).end('not found');
    }
  }
}).listen(PORT, '127.0.0.1', () => {
  console.log(`✿ http://127.0.0.1:${PORT}/  (ctrl-c to stop)`);
});
