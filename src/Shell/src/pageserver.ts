// A tiny web server on 127.0.0.1 that serves the pop-out's own page.
//
// It exists for one reason, found by testing on 2026-10-04: a YouTube embed loaded from a file:// page
// fails with Error 153, because the embed needs a real http origin as its referrer. Twitch needs the
// same thing by a different route, naming the host in a `parent` parameter.
//
// It serves Aang's own files and nothing else. No directory listing, no path that can climb out of the
// folder, no method but GET, and it binds to 127.0.0.1 so nothing outside this machine can reach it.
// It is not a general web server and must never become one.
//
// BG10 (2026-11-04): one push channel, GET /live/events (Server-Sent Events). The Hyrule pages read his game through
// the live/ junction; instead of polling it once a minute they open this stream once, and when one of the live files is
// rewritten they hear its name (`event: change`, `data: {"file":"state"}`) and fetch that one file. One fs.watch on the
// folder, only while a page is listening; nothing runs with no page open.
import { createServer, type Server, type ServerResponse } from 'node:http';
import { createReadStream, existsSync, rmSync, statSync, watch, writeFileSync, type FSWatcher } from 'node:fs';
import path from 'node:path';

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  // the Hyrule map (2026-11-03): its pictures, tiles and data, from its own private folder
  '.webp': 'image/webp',
  '.jpg': 'image/jpeg',
  '.json': 'application/json; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
};

export interface PageServerOpts {
  /** BG10: the folder whose files' changes are pushed on GET /live/events (the live/ junction = %LOCALAPPDATA%\Aang\botw). */
  live?: string;
}
/** The live files pages may be told about, by base name (state.json -> "state"). A temp file beside them never matches. */
export const LIVE_FILES = new Set(['state', 'cook', 'pos', 'sessions', 'notes', 'live']);
/** A few writes land together (state.json then cook.json): one short wait, then every name at once. */
export const LIVE_DEBOUNCE_MS = 150;
/** A comment line this often keeps the socket alive through anything between (nothing, here: it is all one machine). */
export const KEEP_ALIVE_MS = 25_000;
/** A handful of pages at most: the map, the Journal, the character window and a spare or two. */
export const MAX_LIVE_CLIENTS = 6;
/** How often the lease (want.json) is refreshed while a page listens; the reader calls it stale after 25 s. */
export const LEASE_EVERY_MS = 10_000;

export interface PageServer {
  /** Where the pages are, e.g. http://127.0.0.1:51234 */
  origin: string;
  /** Just the host, which is what Twitch has to be told. */
  host: string;
  close(): void;
}

/** Serve `dir` on a port the operating system picks, on this machine only. `home` is the page for '/'. */
export function servePages(dir: string, home = '/popout.html', o: PageServerOpts = {}): Promise<PageServer> {
  const root = path.resolve(dir);

  let origin = '';

  // ---- BG10: the live event stream. The watcher and the keep-alive live only while someone listens.
  const clients = new Set<ServerResponse>();
  let watcher: FSWatcher | null = null;
  let keepAlive: ReturnType<typeof setInterval> | null = null;
  let flush: ReturnType<typeof setTimeout> | null = null;
  const pending = new Set<string>();
  const send = (text: string) => { for (const c of clients) { try { c.write(text); } catch { /* gone: its close handler drops it */ } } };
  const changed = (name: string) => {
    const base = name.replace(/\.json$/i, '');
    if (base === name || !LIVE_FILES.has(base)) return;
    pending.add(base);
    flush ??= setTimeout(() => {
      flush = null;
      const names = [...pending]; pending.clear();
      for (const n of names) send(`event: change\ndata: ${JSON.stringify({ file: n })}\n\n`);
    }, LIVE_DEBOUNCE_MS);
  };
  const startLive = () => {
    if (!watcher && o.live && existsSync(o.live)) {
      try {
        const w = watch(o.live, { persistent: false }, (_ev, name) => { if (name) changed(String(name)); });
        w.on('error', () => { w.close(); if (watcher === w) watcher = null; });
        watcher = w;
      } catch { watcher = null; }
    }
    keepAlive ??= setInterval(() => send(': keep-alive\n\n'), KEEP_ALIVE_MS);
    keepAlive.unref?.();
  };
  const stopLive = () => {
    watcher?.close(); watcher = null;
    if (keepAlive) { clearInterval(keepAlive); keepAlive = null; }
    if (flush) { clearTimeout(flush); flush = null; }
    pending.clear();
  };
  // BG10 (his interview, 2026-11-04): the live reader works only while a guide page is open. A page that listens here
  // IS an open page (pages close the stream while hidden), so while anyone listens a small lease, want.json, is kept
  // fresh in the live folder; AangReader --botw-live reads hearts, gear and the pouch only while it is under 25 s old.
  let lease: ReturnType<typeof setInterval> | null = null;
  const want = () => { if (!o.live) return; try { writeFileSync(path.join(o.live, 'want.json'), JSON.stringify({ v: 1, at: new Date().toISOString(), pages: clients.size })); } catch { /* the next beat writes again */ } };
  const startLease = () => { if (!o.live || !existsSync(o.live)) return; want(); lease ??= setInterval(want, LEASE_EVERY_MS); lease.unref?.(); };
  const stopLease = () => {
    if (lease) { clearInterval(lease); lease = null; }
    if (o.live) { try { rmSync(path.join(o.live, 'want.json'), { force: true }); } catch { /* it goes stale by itself */ } }
  };
  const liveEvents = (res: ServerResponse) => {
    if (clients.size >= MAX_LIVE_CLIENTS) { res.writeHead(503, { 'Retry-After': '30' }).end(); return; }
    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-store',
      'Connection': 'keep-alive',
      'X-Content-Type-Options': 'nosniff',
    });
    res.write('retry: 3000\n\n');
    clients.add(res);
    startLive(); startLease();
    res.on('close', () => { clients.delete(res); if (!clients.size) { stopLive(); stopLease(); } });
  };
  const server: Server = createServer((req, res) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405).end(); return; }

    // A page here is Aang's own, so nothing else may ask it for anything. But "anything else" means
    // another origin: a module script is always fetched in CORS mode, so the browser sends an Origin
    // header even for Aang's own files. Refusing those refused player.js and left every control dead,
    // found 2026-10-04. So: no Origin at all is fine, our own Origin is fine, anyone else is not.
    // Only by its own address (code audit L4, 2026-10-14): a web page that points its own name at this computer is refused.
    if (origin && String(req.headers.host ?? '') !== origin.replace(/^http:\/\//, '')) { res.writeHead(403).end(); return; }
    const from = req.headers.origin;
    if (from && from !== origin) {
      console.error(`pages: refused a request from ${String(from).slice(0, 80)}`);
      res.writeHead(403).end();
      return;
    }

    const name = decodeURIComponent((req.url ?? '/').split('?')[0]!);
    if (name === '/live/events') { if (req.method === 'HEAD') { res.writeHead(200, { 'Content-Type': 'text/event-stream' }).end(); return; } liveEvents(res); return; }
    const file = path.resolve(root, '.' + (name === '/' ? home : name));
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
      origin = `http://127.0.0.1:${addr.port}`;
      resolve({
        origin,
        host: '127.0.0.1',
        close: () => { for (const c of clients) c.end(); clients.clear(); stopLive(); stopLease(); server.close(); server.closeAllConnections?.(); },
      });
    });
  });
}
