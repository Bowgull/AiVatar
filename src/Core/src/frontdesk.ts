// M3 (his interview, 2026-10-13): Aang's front desk, on the MacBook. The Mac is always on, so it holds the ONE
// connection to Discord, and it never sleeps. Shadow's brain drives it over Tailscale (frontdesk-link.ts):
//
//   Shadow on:  every message and button press goes straight to Shadow; Shadow sends, edits and pins through here.
//   Shadow off: his messages wait here, in order, in a file. A button press is answered at once ("Shadow is
//               asleep") so Discord never shows "this interaction failed". When Shadow connects, it gets the queue
//               once, says how many it took, and only those are removed.
//   M4: a message Shadow has not taken after HOLD_MS goes to the Mac's own brain (macbrain.ts), which answers it
//               or leaves it in the queue for Shadow. It leaves the queue while the Mac works on it, so Shadow can
//               never get it as well. What the Mac did is handed to Shadow when it connects, once.
//
// That replaces the old catch-up (Shadow reading Discord's history back on every start), which is where messages
// got answered twice. Only the Shadow PC's exact Tailscale address, with the front-desk key, may connect.
//
// Run on the Mac: node frontdesk.ts <folder>   (the folder holds discord.token, frontdesk.key and frontdesk.json)
import { timingSafeEqual } from 'node:crypto';
import http from 'node:http';
import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { WebSocketServer, type WebSocket } from 'ws';
import type { ButtonPress, Gateway, Incoming, OutMsg } from './discord.ts';
import type { Handled } from './macbrain.ts';

/** The Mac's brain, as the front desk sees it (macbrain.ts). */
export interface DeskBrain {
  handle(m: Incoming): Promise<'done' | 'keep' | 'skip'>;
  setBrief(x: unknown): boolean;
  /** The PC just went away: get ready to answer (start Claude). */
  prewarm?(): void;
  /** A Claude Code job on this Mac said something while the PC was unreachable. */
  jobEvent?(event: string, body: unknown): Promise<void>;
  /** His pick (2026-10-13): the morning brief, from the Mac, while the PC is off. Checks the time itself. */
  morning?(): Promise<void>;
  pending(): Handled[];
  took(n: number): void;
  shadowBack(): void;
}

/** What crosses the wire. Files and downloads travel as base64. */
export type ToShadow =
  | { ev: 'hello'; queued: number }
  | { ev: 'message'; m: Incoming; queued?: boolean }
  | { ev: 'button'; b: Omit<ButtonPress, 'ack' | 'keep'> & { pressId: string } }
  | { ev: 'handled'; items: Handled[] }
  | { id: number; ok: true; value: unknown }
  | { id: number; ok: false; error: string };
export type FromShadow = { id: number; op: string; args: unknown[] } | { op: 'taken'; n: number } | { op: 'handled.took'; n: number };

const MAX_QUEUE = 500;
/** M4b: where this Mac's Claude Code hooks go when the PC does not answer. Loopback only. */
export const LOCAL_HOOK_PORT = 47842;
/** Sheet 21: the Mac's Aang browser draws cards for the front desk here. Loopback only, with the hook key. */
export const MAC_CARD_PORT = 47843;
const PRESS_WAIT_MS = 2000;      // Discord allows 3 s to answer a press; say "wait" before that if Shadow is slow

export interface FrontDeskOpts {
  gw: Gateway; host: string; port: number; key: string; shadow: string; queueFile: string;
  log?: (s: string) => void;
  /** M4: answers while Shadow is off. Without it, messages only wait. */
  brain?: DeskBrain;
  /** how long a message waits for Shadow before the brain takes it (macbrain.ts HOLD_MS) */
  holdMs?: number;
  /** True when the heartbeat says the PC is off: then there is nothing to wait for (his report, 2026-10-13: slow). */
  shadowOff?: () => boolean;
  /** M4b: the Mac's Claude Code hooks fall back to this Mac (127.0.0.1 only, with the hook key) when the PC is off. */
  hookKey?: string;
  hookPort?: number;
}

/** Same length and same bytes, compared without an early exit. */
function sameKey(a: string, b: string): boolean {
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && x.length > 0 && timingSafeEqual(x, y);
}

const toWire = (msg: OutMsg) => ({ ...msg, ...(msg.files ? { files: msg.files.map(f => ({ name: f.name, data: Buffer.from(f.data).toString('base64') })) } : {}) });
export const fromWire = (msg: any): OutMsg => ({ ...msg, ...(msg?.files ? { files: msg.files.map((f: any) => ({ name: String(f.name), data: Buffer.from(String(f.data), 'base64') })) } : {}) });
export { toWire };

export async function startFrontDesk(o: FrontDeskOpts): Promise<{ close: () => Promise<void>; queued: () => number }> {
  const log = o.log ?? ((s: string) => console.log(s));
  let queue: Incoming[] = [];
  try { const q = JSON.parse(readFileSync(o.queueFile, 'utf8')); if (Array.isArray(q)) queue = q; } catch { /* none waiting */ }
  const saveQueue = () => { try { writeFileSync(o.queueFile + '.tmp', JSON.stringify(queue)); renameSync(o.queueFile + '.tmp', o.queueFile); } catch (e) { log('front desk: could not save the queue: ' + (e as Error).message); } };
  const presses = new Map<string, ButtonPress & { done: boolean }>();
  const timers: NodeJS.Timeout[] = [];
  let pressSeq = 0;
  let shadow: WebSocket | null = null;
  const send = (x: ToShadow) => { if (shadow && shadow.readyState === shadow.OPEN) { shadow.send(JSON.stringify(x)); return true; } return false; };

  o.gw.onMessage(m => {
    if (m.isBot) return;
    if (send({ ev: 'message', m })) return;
    // Shadow is asleep: keep it, in order, for when it wakes. Oldest go first if it ever overflows.
    queue.push(m);
    if (queue.length > MAX_QUEUE) queue = queue.slice(-MAX_QUEUE);
    saveQueue();
    log(`front desk: Shadow is off; kept a message (${queue.length} waiting)`);
    if (o.brain) setTimeout(() => void tick(), (pcGone() ? 0 : holdMs) + 200).unref?.();
  });

  // ---- M4: the Mac answers what Shadow has not taken
  const holdMs = o.holdMs ?? 45_000;
  // The PC is gone when the heartbeat says so, or when it has not been connected for longer than the wait itself.
  let goneSince = Date.now();
  const pcGone = () => !shadow && (o.shadowOff?.() === true || Date.now() - goneSince > holdMs);
  const kept = new Set<string>();              // the brain looked and left it for Shadow
  let working = false;
  async function tick(): Promise<void> {
    if (working || shadow || !o.brain) return;
    working = true;
    try {
      for (;;) {
        if (shadow) break;
        const hold = pcGone() ? 0 : holdMs;
        const m = queue.find(x => !kept.has(x.id) && Date.now() - (x.createdAt || 0) >= hold);
        if (!m) break;
        queue = queue.filter(x => x !== m); saveQueue();
        let r: 'done' | 'keep' | 'skip' = 'keep';
        try { r = await o.brain.handle(m); } catch (e) { log('front desk: the Mac could not handle a message: ' + (e as Error).message); }
        if (r === 'keep') { kept.add(m.id); queue = [...queue, m].sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0)); saveQueue(); }
        else log(`front desk: the Mac ${r === 'done' ? 'answered' : 'skipped'} a message while Shadow was off`);
        flushHandled();
      }
    } finally { working = false; }
  }
  if (o.brain) {
    const t = setInterval(() => { if (pcGone()) { o.brain?.prewarm?.(); void o.brain?.morning?.(); } void tick(); }, 2000);
    t.unref?.(); timers.push(t);
  }
  let handingHandled = false;           // sent, waiting for Shadow to say it applied them
  function flushHandled(): void {
    if (!o.brain || handingHandled) return;
    const items = o.brain.pending();
    if (items.length && send({ ev: 'handled', items })) handingHandled = true;
  }

  o.gw.onButton(b => {
    if (!shadow) {
      void b.ack('Shadow is asleep, so nothing happened. Press it again once it is on.').catch(() => {});
      return;
    }
    const pressId = String(++pressSeq);
    const p = { ...b, done: false };
    presses.set(pressId, p);
    // If Shadow has not answered in 2 s, tell Discord to wait, so the press never shows as failed.
    setTimeout(() => { if (!p.done) void b.keep().catch(() => {}); }, PRESS_WAIT_MS).unref?.();
    setTimeout(() => presses.delete(pressId), 15 * 60_000).unref?.();
    const { ack: _a, keep: _k, ...plain } = b;
    send({ ev: 'button', b: { ...plain, pressId } });
  });

  const wss = new WebSocketServer({
    host: o.host, port: o.port, maxPayload: 32 * 1024 * 1024,
    verifyClient: ({ req }, done) => {
      const peer = String(req.socket.remoteAddress ?? '').replace(/^::ffff:/, '');
      const key = String(req.headers['x-aang-key'] ?? '');
      if (peer === o.shadow && sameKey(key, o.key)) return done(true);
      log(`front desk: refused a connection from ${peer}`);
      done(false, 403, 'Forbidden');
    },
  });
  await new Promise<void>((res, rej) => { wss.once('listening', () => res()); wss.once('error', rej); });

  wss.on('connection', ws => {
    // One Shadow at a time: a new connection replaces an old one that never said goodbye.
    if (shadow && shadow !== ws) { try { shadow.close(); } catch { /* gone */ } }
    shadow = ws;
    log(`front desk: Shadow connected (${queue.length} waiting)`);
    const handing = queue.slice();
    send({ ev: 'hello', queued: handing.length });
    for (const m of handing) send({ ev: 'message', m, queued: true });
    kept.clear();
    o.brain?.shadowBack();
    handingHandled = false; flushHandled();
    ws.on('message', async raw => {
      let x: FromShadow;
      try { x = JSON.parse(String(raw)); } catch { return; }
      if (!('id' in x)) {
        if (x.op === 'handled.took') { o.brain?.took(Number(x.n) || 0); handingHandled = false; flushHandled(); return; }
        if (x.op !== 'taken') return;
        // Only what Shadow says it took leaves the queue; anything that arrived meanwhile stays.
        const n = Math.max(0, Math.min(queue.length, Number(x.n) || 0));
        queue = queue.slice(n); saveQueue();
        return;
      }
      const reply = (r: { ok: true; value: unknown } | { ok: false; error: string }) => { if (ws.readyState === ws.OPEN) ws.send(JSON.stringify({ id: x.id, ...r })); };
      try { reply({ ok: true, value: await call(x.op, x.args ?? []) }); }
      catch (e) { reply({ ok: false, error: (e as Error).message || 'failed' }); }
    });
    ws.on('close', () => { if (shadow === ws) { shadow = null; goneSince = Date.now(); log('front desk: Shadow went away'); } });
    ws.on('error', () => { /* close follows */ });
  });

  async function call(op: string, a: unknown[]): Promise<unknown> {
    const s = (i: number) => String(a[i] ?? '');
    switch (op) {
      case 'ensureLayout': return o.gw.ensureLayout();
      case 'send': return o.gw.send(s(0), fromWire(a[1]));
      case 'edit': return o.gw.edit(s(0), s(1), fromWire(a[2]));
      case 'pin': return o.gw.pin(s(0), s(1));
      case 'createPost': return o.gw.createPost(s(0), s(1), s(2), Array.isArray(a[3]) ? (a[3] as unknown[]).map(String).slice(0, 5) : []);
      // 9.D: the plain channel operations; every decision about them is made on Shadow.
      case 'channelList': return o.gw.channelList();
      case 'createChannel': return o.gw.createChannel(a[0] as any);
      case 'editChannel': return o.gw.editChannel(s(0), a[1] as any);
      case 'deleteChannel': return o.gw.deleteChannel(s(0));
      case 'postsOf': return o.gw.postsOf(s(0), Math.max(1, Math.min(200, Number(a[1]) || 50)));
      case 'startThread': if (!o.gw.startThread) throw new Error('no threads here'); return o.gw.startThread(s(0), s(1), s(2));
      case 'setPostTags': return o.gw.setPostTags(s(0), Array.isArray(a[1]) ? (a[1] as unknown[]).map(String).slice(0, 5) : []);
      case 'download': return Buffer.from(await o.gw.download(s(0))).toString('base64');
      case 'typing': return o.gw.typing(s(0));
      case 'fetchSince': return o.gw.fetchSince(s(0), a[1] === null ? null : s(1), Math.max(1, Math.min(100, Number(a[2]) || 1)));
      case 'permissions': return o.gw.permissions();
      // M4: what the Mac needs to answer as Aang while Shadow is off. False when the Mac has no brain.
      case 'brief': return o.brain ? o.brain.setBrief(a[0]) : false;
      case 'press.ack': case 'press.keep': {
        const p = presses.get(s(0));
        if (!p) throw new Error('that button press is too old');
        if (op === 'press.ack') { p.done = true; await p.ack(s(1)); presses.delete(s(0)); } else { p.done = true; await p.keep(); }
        return null;
      }
      default: throw new Error(`no such thing: ${op}`);
    }
  }

  // M4b: this Mac's own Claude Code hooks, when they could not reach the PC. Loopback only, the hook key, small bodies.
  let hookSrv: http.Server | null = null;
  if (o.hookKey && o.hookPort && o.brain?.jobEvent) {
    const hk = o.hookKey;
    hookSrv = http.createServer((req, res) => {
      const u = new URL(req.url ?? '/', 'http://x');
      const peer = String(req.socket.remoteAddress ?? '');
      if (req.method !== 'POST' || u.pathname !== '/hook' || req.headers.origin || !/^(127\.0\.0\.1|::1|::ffff:127\.0\.0\.1)$/.test(peer) || !sameKey(String(req.headers['x-aang-key'] ?? '') || (u.searchParams.get('k') ?? ''), hk)) { res.writeHead(403).end(); return; }
      let body = '';
      req.on('data', d => { body += d; if (body.length > 64_000) req.destroy(); });
      req.on('end', () => {
        res.writeHead(204).end();
        let j: unknown = {}; try { j = JSON.parse(body || '{}'); } catch { /* not JSON */ }
        void o.brain?.jobEvent?.(String(u.searchParams.get('e') ?? ''), j).catch(e => log('front desk: job news failed: ' + (e as Error).message));
      });
    });
    hookSrv.on('error', e => log('front desk: the job door would not open: ' + (e as Error).message));
    hookSrv.listen(o.hookPort, '127.0.0.1');
  }

  return {
    queued: () => queue.length,
    close: () => new Promise<void>(res => { for (const t of timers) clearInterval(t); hookSrv?.close(); for (const c of wss.clients) c.terminate(); wss.close(() => res()); }),
  };
}

/** This Mac's Tailscale address (100.64.0.0/10), or null. */
export function tailnetAddress(): string | null {
  for (const list of Object.values(os.networkInterfaces())) for (const a of list ?? []) {
    if (a.family === 'IPv4' && /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./.test(a.address)) return a.address;
  }
  return null;
}

async function main(dir: string): Promise<void> {
  process.on('unhandledRejection', e => console.error('front desk: unhandled: ' + String((e as Error)?.message ?? e)));
  process.on('uncaughtException', e => console.error('front desk: uncaught: ' + e.message));
  const read = (f: string) => readFileSync(path.join(dir, f), 'utf8').trim();
  const cfg = JSON.parse(read('frontdesk.json')) as { shadow: string; port: number };
  const host = tailnetAddress();
  if (!host) { console.error('front desk: Tailscale is not up yet; trying again shortly'); process.exit(1); }
  const { DiscordGateway } = await import('./discord-client.ts');
  const gw = new DiscordGateway(read('discord.token'));
  await gw.login();
  console.log('front desk: connected to Discord');
  // M4: the Mac's own brain, if its engine is installed. Without it the front desk still holds messages for Shadow.
  let brain: DeskBrain | undefined;
  try {
    const { MacBrain, HOLD_MS } = await import('./macbrain.ts');
    // Cards are drawn by the Mac's Aang browser, through its door on this Mac only (macmain.ts, port 47843).
    const cardKey = (() => { try { return read('hook.key'); } catch { return ''; } })();
    const draw = async (kind: string, data: unknown): Promise<Buffer | null> => {
      if (cardKey.length < 20) return null;
      const r = await fetch(`http://127.0.0.1:${MAC_CARD_PORT}/card`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-aang-key': cardKey }, body: JSON.stringify({ kind, data }), signal: AbortSignal.timeout(20_000) }).catch(() => null);
      if (!r?.ok) return null;
      const j: any = await r.json().catch(() => null);
      return typeof j?.png === 'string' ? Buffer.from(j.png, 'base64') : null;
    };
    brain = new MacBrain({ gw, dir: path.join(dir, 'brain'), draw });
    console.log(`front desk: the Mac answers after ${HOLD_MS / 1000} s when Shadow is off`);
  } catch (e) { console.error('front desk: the Mac cannot answer by itself: ' + (e as Error).message); }
  // The heartbeat's verdict (heartbeat.sh writes "on|off|unknown ..." every 10 s).
  const shadowOff = () => { try { return readFileSync(path.join(dir, 'shadow.state'), 'utf8').trim().split(/\s+/)[0] === 'off'; } catch { return false; } };
  let hookKey = ''; try { hookKey = read('hook.key'); } catch { /* an older setup: no job news while the PC is off */ }
  await startFrontDesk({ gw, host, port: cfg.port, key: read('frontdesk.key'), shadow: cfg.shadow, queueFile: path.join(dir, 'queue.json'), shadowOff, ...(brain ? { brain } : {}), ...(hookKey.length >= 20 ? { hookKey, hookPort: LOCAL_HOOK_PORT } : {}) });
  console.log(`front desk: listening for Shadow on ${host}:${cfg.port}`);
}

if (process.argv[1] && path.basename(process.argv[1]) === 'frontdesk.ts' && process.argv[2] && existsSync(process.argv[2])) {
  main(process.argv[2]).catch(e => { console.error('front desk: could not start: ' + (e as Error).message); process.exit(1); });
}
