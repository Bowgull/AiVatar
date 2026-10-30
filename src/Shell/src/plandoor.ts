// The plan door (boot engine, 2026-10-30): on the Mac, Samara and Aang are two apps, so a Claude session's plan card
// (sheet 37) never reached Aang's bubble there. The brain only whispered "Samara is asking you to allow my plan", a line
// with no keys, and the card waited in Samara's band. On the PC both live in one process (main.ts). This is the Mac's
// line between them: Aang (macaang.ts) opens it, Samara (macmain.ts) knocks.
//   POST /ask   {card}           held until he answers in the bubble (or five minutes): {answer} or {answer: null}
//   POST /step  {card, at}       the live checklist moved on (at null: done)
//   POST /row   {plan started}   sheet 41: a row in his scroll-back
//   POST /done  {job}            that plan's job finished
// Locked like Aang's other doors: loopback only, no browser page (an Origin header is refused), and a key made fresh each
// run in his own folder, readable by his account only. Nobody there (Aang not running): Samara's band shows the card.
import http from 'node:http';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { chmodSync, readFileSync, writeFileSync } from 'node:fs';
import type { PlanAnswer, PlanCard } from './browser.ts';
import type { PlanStarted } from './claudedoor.ts';

export const PLAN_DOOR_PORT = 47857;
/** Five minutes unanswered means no answer (the PC's rule, main.ts onPlanAsk). */
export const PLAN_WAIT_MS = 5 * 60_000;

export interface PlanDoorHooks {
  /** Show the card in the bubble; null at once when there is no bubble to show it in. */
  ask(card: PlanCard, gone: Promise<void>): Promise<PlanAnswer | null>;
  step(card: string, at: number | null): void;
  started(p: PlanStarted): void;
  done(job: number): void;
}

const str = (x: unknown, n: number) => String(x ?? '').slice(0, n);
const strs = (x: unknown, n: number, each: number) => (Array.isArray(x) ? x : []).slice(0, n).map((v) => str(v, each));

/** A card as it came over the door, cleaned: only Samara's own ids, plain words, a dozen steps and sites. */
export function cleanCard(c: unknown): PlanCard | null {
  const o = (c && typeof c === 'object' ? c : {}) as Record<string, unknown>;
  const id = str(o.id, 40);
  if (!/^samara:\d{1,9}$/.test(id)) return null;
  const sites = (Array.isArray(o.sites) ? o.sites : []).slice(0, 12).map((s) => {
    const x = (s && typeof s === 'object' ? s : {}) as Record<string, unknown>;
    return { site: str(x.site, 200), login: x.login === true, favicon: str(x.favicon, 20_000), ...(x.local === true ? { local: true } : {}) };
  }).filter((s) => s.site);
  return { id, task: str(o.task, 200), steps: strs(o.steps, 12, 300), wont: str(o.wont, 600), sites, from: str(o.from, 80) };
}

/** Aang's side (macaang.ts). Returns the closer. */
export function openPlanDoor(o: { keyFile: string; hooks: PlanDoorHooks; log: (s: string) => void; port?: number }): () => void {
  const key = randomBytes(24).toString('base64url');
  try { writeFileSync(o.keyFile, key, { mode: 0o600 }); chmodSync(o.keyFile, 0o600); } catch (e) { o.log('aang: the plan door has no key: ' + (e as Error).message); return () => {}; }
  const same = (a: string) => a.length === key.length && timingSafeEqual(Buffer.from(a), Buffer.from(key));
  const srv = http.createServer((req, res) => {
    const peer = String(req.socket.remoteAddress ?? '');
    if (req.method !== 'POST' || req.headers.origin || !/^(127\.0\.0\.1|::1|::ffff:127\.0\.0\.1)$/.test(peer) || !same(String(req.headers['x-aang-key'] ?? ''))) { res.writeHead(403).end(); return; }
    let s = '';
    req.on('data', (d) => { s += d; if (s.length > 200_000) req.destroy(); });
    req.on('end', () => {
      let b: Record<string, unknown> = {};
      try { const j = JSON.parse(s || '{}'); if (j && typeof j === 'object') b = j; } catch { res.writeHead(400).end(); return; }
      const ok = (body: unknown = { ok: true }) => { if (!res.writableEnded) res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(body)); };
      const url = req.url ?? '';
      if (url === '/ask') {
        const card = cleanCard(b.card);
        if (!card) { res.writeHead(400).end(); return; }
        // Samara gave up (it closed, or its own five minutes ran out): the card goes from the bubble too.
        const gone = new Promise<void>((r) => res.on('close', () => r()));
        void o.hooks.ask(card, gone).then((answer) => ok({ answer }), () => ok({ answer: null }));
        return;
      }
      if (url === '/step') { const at = b.at === null ? null : Number(b.at); o.hooks.step(str(b.card, 40), at === null || Number.isFinite(at) ? at : null); ok(); return; }
      if (url === '/row') {
        const job = Number(b.job);
        if (!Number.isInteger(job) || job < 0) { res.writeHead(400).end(); return; }
        o.hooks.started({ job, task: str(b.task, 200), sites: strs(b.sites, 12, 200), steps: strs(b.steps, 12, 300), remembered: b.remembered === true });
        ok(); return;
      }
      if (url === '/done') { const job = Number(b.job); if (Number.isInteger(job)) o.hooks.done(job); ok(); return; }
      res.writeHead(404).end();
    });
  });
  srv.on('error', (e) => o.log('aang: the plan door would not open: ' + (e as Error).message));
  srv.listen(o.port ?? PLAN_DOOR_PORT, '127.0.0.1');
  return () => srv.close();
}

/** Samara's side (macmain.ts): the boot engine's plan hooks, knocking on Aang's door. */
export function planDoorClient(o: { keyFile: string; log: (s: string) => void; port?: number; waitMs?: number }): {
  ask(card: PlanCard): Promise<PlanAnswer | null>; step(card: string, at: number | null): void; started(p: PlanStarted): void; done(job: number): void;
} {
  const post = (where: string, body: unknown, ms: number): Promise<Record<string, unknown> | null> => new Promise((done) => {
    let key = '';
    try { key = readFileSync(o.keyFile, 'utf8').trim(); } catch { done(null); return; }
    if (!key) { done(null); return; }
    const data = JSON.stringify(body);
    const req = http.request({ host: '127.0.0.1', port: o.port ?? PLAN_DOOR_PORT, path: where, method: 'POST', timeout: ms,
      headers: { 'content-type': 'application/json', 'content-length': Buffer.byteLength(data), 'x-aang-key': key } }, (res) => {
      let s = '';
      res.on('data', (d) => { s += d; if (s.length > 100_000) req.destroy(); });
      res.on('end', () => { if (res.statusCode !== 200) { done(null); return; } try { done(JSON.parse(s)); } catch { done(null); } });
      res.on('error', () => done(null));
    });
    req.on('timeout', () => req.destroy());
    req.on('error', () => done(null));
    req.end(data);
  });
  const quiet = (where: string, body: unknown) => { void post(where, body, 5000).then((r) => { if (!r) o.log(`aang: the plan door did not take ${where}`); }); };
  return {
    ask: async (card) => {
      const r = await post('/ask', { card }, (o.waitMs ?? PLAN_WAIT_MS) + 5000);
      const a = r?.answer as Record<string, unknown> | null | undefined;
      if (!a || typeof a !== 'object') return null;
      return { go: a.go === true, change: a.change === true, keep: strs(a.keep, 20, 200), note: str(a.note, 500) };
    },
    step: (card, at) => quiet('/step', { card, at }),
    started: (p) => quiet('/row', p),
    done: (job) => quiet('/done', { job }),
  };
}
