// The Mac's mockup door (2026-10-22, his rule "Mockups always go to Samara", on the MacBook too).
//
// On the PC, a Claude session's show_mockup (the aang-link mod, claude-link/hooks/register.ts) goes to the brain, which
// checks it and leaves a .mockup file for Samara (src/Core/src/mockupdrop.ts). The Mac has no brain beside Samara, so
// Samara on the Mac takes the same request itself, here: one small door on this Mac's loopback only.
//
// THE LOCK (the same shape as the brain's link, claudelink.ts):
//   - Samara writes a fresh random key each run to mockup-door.key in its own folder (~/Library/Application Support/Aang),
//     readable by this user only. The key never leaves this Mac and never travels in an update.
//   - Every request is signed: x-aang-link-ts + x-aang-link-sig = HMAC(key, 'req', ts, method, path, body). Stale (over
//     a minute) or wrong: refused. A web page cannot sign (it cannot read the key), and any request that carries an
//     Origin header, or a Host other than 127.0.0.1:<port>, is refused before anything else (DNS rebinding).
//   - GET /hello?n=<nonce> answers HMAC(key, 'hello', nonce), so the mod tells nothing (folders, file names) to whoever
//     else might be on the port.
// THE CHECKS (the browser checks again when it opens it): a file must be an .html page
// inside a git repo (its own, found from the file; real path, links followed), no dot folder or file on the way, committed;
// a live page must be http(s) on this computer. Nothing is written anywhere: the page goes straight into the trail.
import { execFileSync } from 'node:child_process';
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { chmodSync, existsSync, realpathSync, statSync, writeFileSync } from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { cleanBranch, cleanLive, type MockupDrop, type MockVersion } from './mockups.ts';

export const MOCKUP_DOOR_PORT = 47844;
export const mockupDoorKeyFile = (stateDir: string) => path.join(stateDir, 'mockup-door.key');
export const doorMac = (key: string, ...parts: string[]): string => createHmac('sha256', key).update(parts.join('\n')).digest('hex');
const same = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

export interface DoorAsk { cwd?: unknown; path?: unknown; url?: unknown; title?: unknown; branch?: unknown }
export type DoorAnswer = { ok: boolean; message: string };

/**
 * The file a live page on this Mac is, when the program answering on its port serves a plain folder: the folder it was
 * started in (lsof), the address's path under it, an existing .html file. Null for anything else.
 */
export function servedFile(u: string, lsof = '/usr/sbin/lsof'): string | null {
  try {
    const x = new URL(u);
    const port = Number(x.port || (x.protocol === 'https:' ? 443 : 80));
    if (!Number.isInteger(port) || port < 1 || port > 65535) return null;
    const pids = execFileSync(lsof, ['-nP', `-iTCP:${port}`, '-sTCP:LISTEN', '-t'], { encoding: 'utf8', timeout: 3000 }).split('\n').filter((n) => /^\d+$/.test(n));
    let rel = decodeURIComponent(x.pathname);
    if (rel.endsWith('/')) rel += 'index.html';
    if (!/\.html?$/i.test(rel) || rel.includes('\0') || rel.split('/').includes('..')) return null;
    for (const pid of pids) {
      const out = execFileSync(lsof, ['-a', '-p', pid, '-d', 'cwd', '-Fn'], { encoding: 'utf8', timeout: 3000 });
      const dir = /^n(\/.*)$/m.exec(out)?.[1];
      if (!dir) continue;
      const f = path.join(dir, rel);
      if (inside(f, dir) && existsSync(f) && statSync(f).isFile()) return f;
    }
  } catch { /* not ours to find */ }
  return null;
}

/** The nearest folder up from `dir` with a .git, or null. */
export function repoOf(dir: string): string | null {
  let d = path.resolve(dir);
  for (let i = 0; i < 60; i++) {
    if (existsSync(path.join(d, '.git'))) return d;
    const up = path.dirname(d);
    if (up === d) return null;
    d = up;
  }
  return null;
}
const inside = (p: string, dir: string) => { const r = path.relative(dir, p); return r === '' || (!!r && !r.startsWith('..') && !path.isAbsolute(r)); };
// eslint-disable-next-line no-control-regex
const cleanTitle = (t: unknown) => (typeof t === 'string' ? t.slice(0, 1000).replace(/[\x00-\x1f\x7f-\x9f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80).trim() : '');

/** One request checked and turned into a drop, or why not. Never touches the disk beyond reading paths. */
export function checkAsk(ask: DoorAsk): { ok: true; drop: MockupDrop; name: string } | { ok: false; message: string } {
  const title = cleanTitle(ask.title);
  const branch = typeof ask.branch === 'string' && ask.branch ? cleanBranch(ask.branch) : null;
  const hasPath = typeof ask.path === 'string' && ask.path.trim() !== '', hasUrl = typeof ask.url === 'string' && ask.url.trim() !== '';
  if (hasPath === hasUrl) return { ok: false, message: 'Pass either path (an .html file in your repo) or url (a page on http://127.0.0.1 or localhost), not both.' };
  if (hasUrl) {
    const u = cleanLive(String(ask.url).trim());
    if (!u) return { ok: false, message: 'url must be a page on this computer: http://127.0.0.1, http://localhost or http://[::1] (any port), with no user name.' };
    // A page served straight from a folder (python -m http.server and the like) is a file in disguise: filed as that
    // file when it sits in a git repo, so it keeps working after the server stops. A real dev server stays live.
    const f = servedFile(u);
    if (f) { const c = checkAsk({ path: f, title: ask.title, branch: ask.branch }); if (c.ok) return c; }
    return { ok: true, drop: { path: '', repo: null, url: u, title, branch }, name: u };
  }
  const cwd = typeof ask.cwd === 'string' ? ask.cwd : '';
  const raw = String(ask.path).trim();
  if (raw.length > 1000 || raw.startsWith('//') || raw.startsWith('\\\\')) return { ok: false, message: 'path must be a file in a git repo.' };
  // 2026-10-28 (his "mockups aren't being sent organized correctly"): the repo is the FILE's, not the session's. A session
  // in a folder outside any repo (~/Handoff/aang) used to be told to serve the page on 127.0.0.1, and every such page
  // became a live row that died with its server. An absolute path needs no session folder at all.
  if (!path.isAbsolute(raw) && (!cwd || !path.isAbsolute(cwd) || !existsSync(cwd))) return { ok: false, message: "Your session's folder is not known here. Pass the page's full path." };
  let file = '';
  try {
    file = realpathSync.native(path.resolve(cwd || '/', raw));
    if (!statSync(file).isFile()) throw new Error('not a file');
  } catch { return { ok: false, message: `No such file: ${raw.slice(0, 200)}` }; }
  const root0 = repoOf(path.dirname(file));
  if (!root0) return { ok: false, message: `${path.basename(file)} is not in a git repo. The Mockups trail keeps every version from git: put it in one and commit it, then call show_mockup again.` };
  let root = '';
  try { root = realpathSync.native(root0); } catch { return { ok: false, message: `No such file: ${raw.slice(0, 200)}` }; }
  if (!inside(file, root)) return { ok: false, message: 'path must be inside your own repo.' };
  const rel = path.relative(root, file).split(path.sep).join('/');
  if (!/\.html?$/i.test(rel)) return { ok: false, message: 'path must be an .html page.' };
  if (rel.length > 400 || root.length > 400 || rel.split('/').some((s) => !s || s.startsWith('.'))) return { ok: false, message: 'That file is in a hidden folder (or its path is too long), so it is not shown.' };
  return { ok: true, drop: { path: rel, repo: root, url: null, title, branch }, name: rel };
}

/**
 * Opens the door. `open` puts a checked drop in the trail (AangBrowser.openMockupDrop; null = not opened, e.g. not
 * committed). `why` says why mockups are off on this Mac, or null when they are on. Returns a close function.
 */
/** Sheet 79: the marks in the trail, for Claude: every marked version, and one mark set on a sheet in his repo. */
export interface DoorMarks { list(): unknown[]; set(a: { repo: string; sheet: string; v: number | null; stage: string; said: string; note: string }): string }
export function startMockupDoor(stateDir: string, open: (d: MockupDrop) => Promise<MockVersion | null>, why: () => string | null, port = MOCKUP_DOOR_PORT, marks?: DoorMarks): () => void {
  const key = randomBytes(32).toString('hex');
  const keyFile = mockupDoorKeyFile(stateDir);
  try { writeFileSync(keyFile, key, { mode: 0o600 }); chmodSync(keyFile, 0o600); } catch (e) { console.error('aang: the mockup door has no key: ' + (e as Error).message); return () => {}; }
  let busy: Promise<unknown> = Promise.resolve();
  const srv = http.createServer((req, res) => {
    const peer = String(req.socket.remoteAddress ?? '');
    const json = (code: number, j: unknown) => { res.writeHead(code, { 'content-type': 'application/json' }).end(JSON.stringify(j)); };
    if (req.headers.origin || String(req.headers.host ?? '') !== `127.0.0.1:${port}` || !/^(127\.0\.0\.1|::1|::ffff:127\.0\.0\.1)$/.test(peer)) { res.writeHead(403).end(); return; }
    const url = String(req.url ?? '');
    let body = '';
    req.on('data', (d) => { body += d; if (body.length > 8192) req.destroy(); });
    req.on('end', () => {
      const ts = String(req.headers['x-aang-link-ts'] ?? ''), sig = String(req.headers['x-aang-link-sig'] ?? '');
      const fresh = /^\d{10,16}$/.test(ts) && Math.abs(Date.now() - Number(ts)) < 60_000;
      if (!fresh || !/^[0-9a-f]{64}$/.test(sig) || !same(sig, doorMac(key, 'req', ts, String(req.method), url, body))) { res.writeHead(403).end(); return; }
      const q = new URL(url, 'http://127.0.0.1');
      if (req.method === 'GET' && q.pathname === '/hello') {
        const n = q.searchParams.get('n') ?? '';
        if (!/^[0-9a-f]{16,64}$/.test(n)) { res.writeHead(400).end(); return; }
        json(200, { proof: doorMac(key, 'hello', n) });
        return;
      }
      // Sheet 79 (2026-10-23): what is approved, built, to fix or parked; and Claude's own mark on one version (an approval
      // only with his words, said in the chat).
      if (req.method === 'GET' && q.pathname === '/stages') {
        if (!marks) { json(200, { ok: false, message: 'Marks are not on in this Samara.' }); return; }
        json(200, { ok: true, stages: marks.list() });
        return;
      }
      if (req.method === 'POST' && q.pathname === '/stage') {
        let ask: DoorAsk & { v?: unknown; stage?: unknown; said?: unknown; note?: unknown } = {};
        try { ask = JSON.parse(body); } catch { json(400, { ok: false, message: 'Not a request.' }); return; }
        if (!marks) { json(200, { ok: false, message: 'Marks are not on in this Samara.' }); return; }
        const c = checkAsk({ cwd: ask.cwd, path: ask.path });
        if (!c.ok || !c.drop.repo || !c.drop.path) { json(200, c.ok ? { ok: false, message: 'Pass path: the sheet in your repo.' } : c); return; }
        const why2 = marks.set({ repo: c.drop.repo, sheet: c.drop.path, v: Number.isInteger(ask.v) ? Number(ask.v) : null, stage: String(ask.stage ?? ''),
          said: typeof ask.said === 'string' ? ask.said.slice(0, 300) : '', note: typeof ask.note === 'string' ? ask.note.slice(0, 300) : '' });
        json(200, why2 ? { ok: false, message: why2 } : { ok: true, message: `Marked ${c.name} in Samara's Mockups trail.` });
        return;
      }
      if (req.method === 'POST' && q.pathname === '/mockup') {
        let ask: DoorAsk = {};
        try { ask = JSON.parse(body); } catch { json(400, { ok: false, message: 'Not a request.' }); return; }
        const off = why();
        if (off) { json(200, { ok: false, message: off }); return; }
        const c = checkAsk(ask);
        if (!c.ok) { json(200, c); return; }
        busy = busy.then(() => open(c.drop).then((v) => json(200, v
          ? { ok: true, message: `Showing ${c.name} in Samara's Mockups trail on this Mac${c.drop.branch ? ` (branch ${c.drop.branch})` : ''}.` }
          : { ok: false, message: c.drop.url ? 'Samara could not open that page.' : `${c.name} is not committed yet (or git could not read it). The Mockups trail shows each version as committed: commit it, then call show_mockup again.` }),
        () => json(500, { ok: false, message: 'Samara could not open it.' })));
        return;
      }
      res.writeHead(404).end();
    });
  });
  srv.on('error', (e) => console.error('aang: the mockup door would not open: ' + (e as Error).message));
  srv.listen(port, '127.0.0.1');
  return () => { try { srv.close(); } catch { /* gone */ } };
}
