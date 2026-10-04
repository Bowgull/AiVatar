// A tiny web server on 127.0.0.1 that serves the pop-out's own page.
//
// It exists for one reason, found by testing on 2026-10-04: a YouTube embed loaded from a file:// page
// fails with Error 153, because the embed needs a real http origin as its referrer. Twitch needs the
// same thing by a different route, naming the host in a `parent` parameter.
//
// It serves Aang's own files and nothing else. No directory listing, no path that can climb out of the
// folder, no method but GET, and it binds to 127.0.0.1 so nothing outside this machine can reach it.
// It is not a general web server and must never become one.
import { createServer, type Server } from 'node:http';
import { createReadStream, existsSync, statSync } from 'node:fs';
import path from 'node:path';

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
};

export interface PageServer {
  /** Where the pages are, e.g. http://127.0.0.1:51234 */
  origin: string;
  /** Just the host, which is what Twitch has to be told. */
  host: string;
  close(): void;
}

/** Serve `dir` on a port the operating system picks, on this machine only. */
export function servePages(dir: string): Promise<PageServer> {
  const root = path.resolve(dir);

  const server: Server = createServer((req, res) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405).end(); return; }

    // A page here is Aang's own, so nothing else may ask it for anything.
    if (req.headers.origin) { res.writeHead(403).end(); return; }

    const name = decodeURIComponent((req.url ?? '/').split('?')[0]!);
    const file = path.resolve(root, '.' + (name === '/' ? '/popout.html' : name));
    // The one rule that matters: whatever the address says, the file has to be inside the folder.
    if (file !== root && !file.startsWith(root + path.sep)) { res.writeHead(403).end(); return; }
    if (!existsSync(file) || !statSync(file).isFile()) { res.writeHead(404).end(); return; }

    res.writeHead(200, {
      'Content-Type': TYPES[path.extname(file).toLowerCase()] ?? 'application/octet-stream',
      // Nothing here should ever be cached: he is looking at the live file while it is being built.
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    });
    if (req.method === 'HEAD') { res.end(); return; }
    createReadStream(file).pipe(res);
  });

  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      if (typeof addr === 'string' || !addr) { reject(new Error('the page server did not get a port')); return; }
      resolve({
        origin: `http://127.0.0.1:${addr.port}`,
        host: '127.0.0.1',
        close: () => server.close(),
      });
    });
  });
}
