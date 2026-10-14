// 6.25a, the door for Claude sessions (his go, 2026-10-14: "build the claude door"). Claude Code on this machine drives
// Aang's browser through the same engine and rules Aang uses (driver.ts, decision 42), in its own hidden tabs marked
// as Claude's, signed in where he is. His reason: job scans in the browser that keeps his logins and history, and
// lighter than screenshots (pages come back as text with numbered controls).
//
// The door, least privilege:
//   - this machine only: 127.0.0.1, a fixed port, and the Host header must say so (a web page cannot reach it by
//     pointing a name at 127.0.0.1); no Origin header (no web page ever); a 32-byte key from a file only he can read;
//   - only the driving steps, always as a Claude job; small bodies;
//   - never a bank or money site (his rule: no banking), on top of the fake-site lists the engine already refuses;
//   - "never" steps (passwords, card details, buying) are refused by the engine; "lever" steps (send, post, apply,
//     submit, sign in) are asked in the browser's band first, every time, and refused if he says no or is not there.
// The connector Claude Code starts is claude-door-mcp.mjs; it reads the port and key from claude-door.json.
import http from 'node:http';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { chmodSync } from 'node:fs';
import path from 'node:path';
import { writeFileAtomic } from './atomic.ts';
import { neverKeep } from './visits.ts';
import type { AangBrowser } from './browser.ts';

export const CLAUDE_DOOR_PORT = 47851;
const OPS = new Set(['start', 'finish', 'open', 'read', 'find', 'jobs', 'collect', 'click', 'type', 'key', 'select', 'back', 'forward', 'scroll', 'picture', 'close', 'history']);

/** Is this request allowed through the door at all? Pure, so it can be tested without a server. */
export function doorAllows(req: { method?: string; url?: string; headers: Record<string, string | string[] | undefined>; peer: string }, key: string, port: number): boolean {
  if (req.method !== 'POST' || req.url !== '/drive') return false;
  if (!/^(127\.0\.0\.1|::1|::ffff:127\.0\.0\.1)$/.test(req.peer)) return false;
  if (req.headers.origin !== undefined) return false;
  const host = String(req.headers.host ?? '');
  if (host !== `127.0.0.1:${port}` && host !== `localhost:${port}`) return false;
  const k = String(req.headers['x-aang-key'] ?? '');
  return key.length >= 40 && k.length === key.length && timingSafeEqual(Buffer.from(k), Buffer.from(key));
}

export function startClaudeDoor(getBrowser: () => AangBrowser | null, stateDir: string, port = CLAUDE_DOOR_PORT): http.Server {
  const key = randomBytes(32).toString('base64url');
  const file = path.join(stateDir, 'claude-door.json');
  try { writeFileAtomic(file, JSON.stringify({ port, key })); try { chmodSync(file, 0o600); } catch { /* Windows: his profile folder is his */ } }
  catch (e) { console.error('shell: claude door: could not write its key: ' + (e as Error).message); }
  // Only the jobs this door started, and only their pages: a Claude session never touches Aang's own tabs.
  const mine = new Set<number>();
  const srv = http.createServer((req, res) => {
    const peer = String(req.socket.remoteAddress ?? '');
    if (!doorAllows({ method: req.method, url: req.url, headers: req.headers, peer }, key, port)) { res.writeHead(403).end(); return; }
    let body = '';
    req.on('data', (d) => { body += d; if (body.length > 64_000) req.destroy(); });
    req.on('end', () => {
      void (async () => {
        let out: Record<string, unknown>;
        try {
          const m = JSON.parse(body) as { op?: unknown; a?: unknown };
          const op = String(m.op ?? '');
          const a = (m.a && typeof m.a === 'object' ? m.a : {}) as Record<string, unknown>;
          const b = getBrowser();
          if (!b) out = { ok: false, error: "Aang's browser is not running." };
          else if (!OPS.has(op)) out = { ok: false, error: 'not a step this door allows' };
          else if (op === 'open' && neverKeep(String(a.url ?? ''))) out = { ok: false, error: 'bank and money sites are never opened for a Claude session (his rule). He has to do that himself.' };
          else if (op !== 'start' && op !== 'history' && !(
            (op === 'open' || op === 'finish') ? mine.has(Number(a.job)) : mine.has(b.pageJob(Number(a.page)) ?? -1))) out = { ok: false, error: 'that is not a page this Claude session opened' };
          else {
            const step = op === 'start' ? { kind: 'claude', name: String(a.name ?? 'Claude').slice(0, 40) } : { ...a, allowed: false };
            out = await b.drive(op, step);
            // The held lever: asked in the browser's band, every time; never assumed.
            if (out.needs === 'lever') {
              const yes = await b.askForClaude(String(out.what ?? 'do that'));
              out = yes === true ? await b.drive(op, { ...a, allowed: true })
                : { ok: false, error: yes === null ? "That needs his OK in Aang's browser, and the browser is not open. Ask him to open it, or to do it himself." : 'He said no.' };
            }
          }
          if (op === 'start' && out.ok === true && Number.isInteger(out.job)) mine.add(out.job as number);
        } catch (e) { out = { ok: false, error: (e as Error).message }; }
        const json = JSON.stringify(out);
        res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' }).end(json);
      })();
    });
  });
  srv.on('error', (e) => console.error('shell: claude door: ' + (e as Error).message));
  srv.listen(port, '127.0.0.1', () => console.log(`shell: the Claude door is open on 127.0.0.1:${port}`));
  return srv;
}
