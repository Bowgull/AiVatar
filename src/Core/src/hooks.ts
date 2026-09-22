// Claude Code tells Aang what it is doing, through its own hook system.
//
// Each hook is a one-line curl that POSTs the hook's JSON to http://127.0.0.1:<port+1>/hook. Nothing is
// installed inside Claude Code beyond that line (see tools/install-hooks.mjs), the post is capped at a
// second, and a failure is ignored, so Aang being down can never slow a session down or break it.
import http from 'node:http';
import os from 'node:os';
import { timingSafeEqual } from 'node:crypto';

/** This machine's Tailscale address (100.64.0.0/10), if it is on a tailnet. */
export function tailnetAddress(): string | null {
  for (const list of Object.values(os.networkInterfaces()))
    for (const a of list ?? []) {
      if (a.family !== 'IPv4' || a.internal) continue;
      const [p, q] = a.address.split('.').map(Number);
      if (p === 100 && q! >= 64 && q! <= 127) return a.address;
    }
  return null;
}

export const isLoopback = (addr: string) => addr === '127.0.0.1' || addr === '::1' || addr === '::ffff:127.0.0.1';
const sameKey = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

export type SessionPhase = 'working' | 'waiting' | 'idle';

export interface Session {
  id: string;
  project: string;
  cwd: string;
  phase: SessionPhase;
  startedAt: number;
  changedAt: number;
  /** When the current turn began, for "that took a while" decisions. */
  turnStartedAt: number | null;
  prompt: string;
  /** What Claude Code is waiting for, in its own words. */
  waitingFor: string;
}

export interface Announcement {
  kind: 'waiting' | 'finished';
  session: Session;
  text: string;
}

/** A turn shorter than this is one Joshua watched happen; only longer ones are worth speaking up about. */
export const LONG_TURN_MS = 60_000;
/** Do not repeat the same announcement for the same session within this. */
const REPEAT_MS = 60_000;
const MAX_SESSIONS = 20;

export const projectName = (cwd: string): string => {
  const parts = (cwd ?? '').replace(/[\\/]+$/, '').split(/[\\/]/);
  return parts[parts.length - 1] || 'a project';
};

const ago = (ms: number): string => {
  const s = Math.round(ms / 1000);
  if (s < 90) return `${s} seconds`;
  const m = Math.round(s / 60);
  return m < 90 ? `${m} minutes` : `${Math.round(m / 60)} hours`;
};

/**
 * What Claude Code is doing right now, kept from its hook events. Pure state plus a decision about what is
 * worth saying out loud; the transport is separate so it can be tested without a socket.
 */
export class HookTracker {
  readonly sessions = new Map<string, Session>();
  private lastSaid = new Map<string, number>();

  /** Feed one hook event. Returns something to announce, or null. */
  handle(ev: any, now = Date.now()): Announcement | null {
    const name = String(ev?.hook_event_name ?? ev?.event ?? '');
    const id = String(ev?.session_id ?? '');
    if (!name || !id) return null;
    const cwd = String(ev?.cwd ?? '');

    if (name === 'SessionEnd') { this.sessions.delete(id); this.lastSaid.delete(id); return null; }

    const s = this.sessions.get(id) ?? {
      id, project: projectName(cwd), cwd, phase: 'idle' as SessionPhase,
      startedAt: now, changedAt: now, turnStartedAt: null, prompt: '', waitingFor: '',
    };
    if (cwd) { s.cwd = cwd; s.project = projectName(cwd); }
    s.changedAt = now;
    this.sessions.set(id, s);
    while (this.sessions.size > MAX_SESSIONS) this.sessions.delete(this.sessions.keys().next().value as string);

    switch (name) {
      case 'SessionStart':
        s.phase = 'idle'; s.turnStartedAt = null;
        return null;

      case 'UserPromptSubmit':
        s.phase = 'working'; s.turnStartedAt = now; s.waitingFor = '';
        s.prompt = String(ev?.prompt ?? '').trim().slice(0, 200);
        return null;

      case 'Notification': {
        // Claude Code is blocked: a permission prompt, or it has been idle waiting for an answer.
        s.phase = 'waiting';
        s.waitingFor = String(ev?.message ?? '').trim().slice(0, 200);
        if (!this.canSay(id, 'waiting', now)) return null;
        return { kind: 'waiting', session: s, text: `Claude Code is waiting on you in ${s.project}.` };
      }

      case 'Stop': {
        const ran = s.turnStartedAt ? now - s.turnStartedAt : 0;
        const wasWaiting = s.phase === 'waiting';
        s.phase = 'idle'; s.turnStartedAt = null; s.waitingFor = '';
        if (ran < LONG_TURN_MS && !wasWaiting) return null;      // he was sitting there; he saw it
        if (!this.canSay(id, 'finished', now)) return null;
        return { kind: 'finished', session: s, text: `Claude Code finished in ${s.project}, that one took ${ago(ran)}.` };
      }

      default:
        return null;
    }
  }

  private canSay(id: string, kind: string, now: number): boolean {
    const key = id + ':' + kind;
    const last = this.lastSaid.get(key) ?? 0;
    if (now - last < REPEAT_MS) return false;
    this.lastSaid.set(key, now);
    return true;
  }

  /** A plain-language answer for "what's Claude Code doing", straight from the events. */
  status(now = Date.now()): string {
    const live = [...this.sessions.values()].sort((a, b) => b.changedAt - a.changedAt);
    if (!live.length) return 'No Claude Code sessions are running right now.';
    return live.map(s => {
      const since = ago(now - s.changedAt);
      if (s.phase === 'waiting') return `${s.project}: waiting for Joshua${s.waitingFor ? ` (${s.waitingFor})` : ''}, for ${since} now.`;
      if (s.phase === 'working') return `${s.project}: working${s.prompt ? ` on "${s.prompt}"` : ''}, started ${since} ago.`;
      return `${s.project}: idle, last active ${since} ago.`;
    }).join('\n');
  }
}

/**
 * The little HTTP endpoint the hooks post to. Loopback only, and it answers instantly: Claude Code waits for
 * its hooks, so this must never be slow.
 */
/**
 * Always on 127.0.0.1. With a key, also on this machine's Tailscale address, so Claude Code on his MacBook can
 * reach it (2026-09-22). Anything that is not local must carry the key (?k=), and the tailnet address itself is
 * only reachable from his own devices.
 */
export class HookServer {
  private servers: http.Server[] = [];
  private readonly port: number;
  /** `from` is the sender's address: 127.0.0.1 for this PC, a 100.x address for the MacBook. */
  private readonly onEvent: (ev: any, from: string) => void;
  private readonly key: string | null;
  /** The Tailscale address it is also listening on, once started; null if none. */
  tailnet: string | null = null;
  /** GET /mac-setup?c=<one-time code>: the MacBook's setup script, or null when the code is wrong or used. */
  private readonly setup: ((code: string) => string | null) | null;
  constructor(port: number, onEvent: (ev: any, from: string) => void, key: string | null = null, setup: ((code: string) => string | null) | null = null) {
    this.port = port; this.onEvent = onEvent; this.key = key; this.setup = setup;
  }

  private handle(req: http.IncomingMessage, res: http.ServerResponse): void {
    if (req.method === 'GET' && req.url?.startsWith('/mac-setup')) {
      const script = this.setup?.(new URL(req.url, 'http://x').searchParams.get('c') ?? '') ?? null;
      if (!script) { res.writeHead(404).end(); return; }
      res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' }).end(script);
      return;
    }
    if (req.method !== 'POST' || !req.url?.startsWith('/hook')) { res.writeHead(404).end(); return; }
    if (!isLoopback(req.socket.remoteAddress ?? '')) {
      const k = new URL(req.url, 'http://x').searchParams.get('k') ?? '';
      if (!this.key || !sameKey(k, this.key)) { res.writeHead(403).end(); return; }
    }
    let body = '';
    req.on('data', d => { body += d; if (body.length > 64_000) req.destroy(); });
    req.on('end', () => {
      // 204 with no body at all: a UserPromptSubmit hook's stdout is fed to Claude Code as context,
      // so the answer has to be empty, and curl then needs no platform-specific redirection.
      res.writeHead(204).end();
      try { this.onEvent(JSON.parse(body), (req.socket.remoteAddress ?? '').replace(/^::ffff:/, '')); } catch { /* a malformed hook is not worth a crash */ }
    });
    req.on('error', () => { /* client vanished */ });
  }

  private listen(host: string): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const s = http.createServer((req, res) => this.handle(req, res));
      s.once('error', reject);
      s.listen(this.port, host, () => { this.servers.push(s); resolve(); });
    });
  }

  async start(): Promise<void> {
    await this.listen('127.0.0.1');
    const ts = this.key ? tailnetAddress() : null;
    if (!ts) return;
    // The Mac is a bonus: if the tailnet address will not take it, the local hooks still work.
    try { await this.listen(ts); this.tailnet = ts; }
    catch (e) { console.error(`hooks: could not listen on the Tailscale address ${ts}: ${(e as Error).message}`); }
  }

  async stop(): Promise<void> {
    const list = this.servers; this.servers = [];
    await Promise.all(list.map(s => new Promise<void>(r => s.close(() => r()))));
  }
}
