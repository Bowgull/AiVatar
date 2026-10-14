// Claude Code tells Aang what it is doing, through its own hook system.
//
// Each hook is a one-line curl that POSTs the hook's JSON to http://127.0.0.1:<port+1>/hook. Nothing is
// installed inside Claude Code beyond that line (see tools/install-hooks.mjs), the post is capped at a
// second, and a failure is ignored, so Aang being down can never slow a session down or break it.
import http from 'node:http';
import os from 'node:os';
import { timingSafeEqual } from 'node:crypto';
import { brief, lastAssistantText } from './claude.ts';

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
  /**
   * Every hook event carries the path of that session's own transcript. It used to be dropped at the door,
   * which is why "Claude is done" could never be followed by "what did it say?" - nothing Aang held had the
   * answer, and claude_code_status could only ever report idle/working/waiting (2026-09-22, Joshua: "it told
   * me claude was done running but then said it couldnt even tell me what was spat out").
   */
  transcriptPath?: string;
  /** The last thing that session actually said, read from its transcript when it stopped. */
  lastSaid: string;
  /** Set when its hook events come over the tailnet: it is running on the MacBook, not here. */
  host?: 'mac';
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
  /** Injected so this stays testable without a real transcript on disk. */
  private readonly readTranscript: (path: string) => string;
  constructor(readTranscript: (path: string) => string = lastAssistantText) { this.readTranscript = readTranscript; }

  /** Feed one hook event. Returns something to announce, or null. */
  handle(ev: any, now = Date.now()): Announcement | null {
    const name = String(ev?.hook_event_name ?? ev?.event ?? '');
    const id = String(ev?.session_id ?? '');
    if (!name || !id) return null;
    const cwd = String(ev?.cwd ?? '');

    if (name === 'SessionEnd') { this.sessions.delete(id); this.lastSaid.delete(id); return null; }

    const s = this.sessions.get(id) ?? {
      id, project: projectName(cwd), cwd, phase: 'idle' as SessionPhase,
      startedAt: now, changedAt: now, turnStartedAt: null, prompt: '', waitingFor: '', lastSaid: '',
    };
    if (cwd) { s.cwd = cwd; s.project = projectName(cwd); }
    if (typeof ev?.transcript_path === 'string' && ev.transcript_path) s.transcriptPath = ev.transcript_path;
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
        // Read what it actually said BEFORE deciding whether to speak: even a turn too short to announce
        // is one he can ask about afterwards, and status() can only answer from what was kept here.
        if (s.transcriptPath) s.lastSaid = this.readTranscript(s.transcriptPath) || s.lastSaid;
        if (ran < LONG_TURN_MS && !wasWaiting) return null;      // he was sitting there; he saw it
        if (!this.canSay(id, 'finished', now)) return null;
        const said = s.lastSaid ? ' ' + brief(s.lastSaid, 240) : '';
        return { kind: 'finished', session: s, text: `Claude Code finished in ${s.project}, that one took ${ago(ran)}.${said}` };
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

  /**
   * A plain-language answer for "what's Claude Code doing" AND for "what did it say" - the second half was
   * missing entirely, so "it finished" could never be followed up on (2026-09-22). A finished session
   * carries its own last words here, which is the only place they are held once the announcement is gone.
   */
  status(now = Date.now()): string {
    const live = [...this.sessions.values()].sort((a, b) => b.changedAt - a.changedAt);
    if (!live.length) return 'No Claude Code sessions are running right now.';
    return live.map(s => {
      const since = ago(now - s.changedAt);
      if (s.phase === 'waiting') return `${s.project}: waiting for Joshua${s.waitingFor ? ` (${s.waitingFor})` : ''}, for ${since} now.`;
      if (s.phase === 'working') return `${s.project}: working${s.prompt ? ` on "${s.prompt}"` : ''}, started ${since} ago.`;
      const said = s.lastSaid ? ` It finished by saying: ${brief(s.lastSaid, 500)}` : '';
      return `${s.project}: idle, last active ${since} ago.${said}`;
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
  /** M2: GET /alive answers this (is the brain up, is he at this PC). Null: no such door. */
  private readonly alive: (() => Record<string, unknown>) | null;
  constructor(port: number, onEvent: (ev: any, from: string) => void, key: string | null = null, setup: ((code: string) => string | null) | null = null,
    alive: (() => Record<string, unknown>) | null = null) {
    this.port = port; this.onEvent = onEvent; this.key = key; this.setup = setup; this.alive = alive;
  }

  /** M6: GET /mac-look from this PC only: the Mac browser's window and log, saved for Claude. Null: no such door. */
  look: (() => Promise<Record<string, unknown> | null>) | null = null;

  /**
   * DNS rebinding (2026-10-14, code audit M5): a web page can point its own name at 127.0.0.1 and talk to this door
   * as if it were the page's own site. The name it used is still in the Host header, so only this machine's own
   * addresses are let in: 127.0.0.1, localhost, ::1 and its Tailscale address, on this port.
   */
  private hostOk(req: http.IncomingMessage): boolean {
    const h = String(req.headers.host ?? '').toLowerCase();
    return [`127.0.0.1:${this.port}`, `localhost:${this.port}`, `[::1]:${this.port}`, ...(this.tailnet ? [`${this.tailnet}:${this.port}`] : [])].includes(h);
  }
  /** Wrong setup codes: after 10 in 10 minutes the setup door stays shut for the rest of that time. */
  private setupMisses: number[] = [];

  private handle(req: http.IncomingMessage, res: http.ServerResponse): void {
    if (!this.hostOk(req)) { res.writeHead(403).end(); return; }
    if (req.method === 'GET' && req.url === '/mac-look' && this.look && !req.headers.origin && isLoopback(req.socket.remoteAddress ?? '')) {
      void this.look().then(r => res.writeHead(r ? 200 : 503, { 'Content-Type': 'application/json' }).end(JSON.stringify(r ?? { error: 'the Mac browser is not connected' })), () => res.writeHead(500).end());
      return;
    }
    if (req.method === 'GET' && req.url?.startsWith('/mac-setup')) {
      if (req.headers.origin) { res.writeHead(403).end(); return; }   // curl on the Mac sends none; a web page always does
      const now = Date.now();
      this.setupMisses = this.setupMisses.filter(t => now - t < 10 * 60_000);
      if (this.setupMisses.length >= 10) { res.writeHead(429).end(); return; }
      const script = this.setup?.(new URL(req.url, 'http://x').searchParams.get('c') ?? '') ?? null;
      if (!script) { this.setupMisses.push(now); res.writeHead(404).end(); return; }
      res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' }).end(script);
      return;
    }
    const isAlive = req.method === 'GET' && (req.url === '/alive' || req.url?.startsWith('/alive?')) && this.alive !== null;
    if (!isAlive && (req.method !== 'POST' || !req.url?.startsWith('/hook'))) { res.writeHead(404).end(); return; }
    // The same lock as the Core's socket (step S1). A web page can POST across origins to localhost
    // without a preflight when the content type is plain, so loopback alone is not proof this came
    // from Claude Code. curl, which is what the hooks actually use, sends no Origin.
    if (req.headers.origin) { res.writeHead(403).end(); return; }
    if (!isLoopback(req.socket.remoteAddress ?? '')) {
      // The key in a header, never on a command line (code audit L6, 2026-10-14); the old ?k= still works for older Macs.
      const k = String(req.headers['x-aang-key'] ?? '') || (new URL(req.url ?? '/', 'http://x').searchParams.get('k') ?? '');
      if (!this.key || !sameKey(k, this.key)) { res.writeHead(403).end(); return; }
    }
    // M2 (2026-10-13): the MacBook asks every few seconds whether the big brain is up. It learns only that, and
    // whether he is at this PC; nothing else about him or his work is in the answer.
    if (isAlive) {
      res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }).end(JSON.stringify(this.alive!()));
      return;
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

  /** M6: a WebSocket asking to come in (the Mac's browser sync). Unset: every upgrade is refused. */
  upgrade: ((req: http.IncomingMessage, socket: import('node:stream').Duplex, head: Buffer) => void) | null = null;

  private listen(host: string): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const s = http.createServer((req, res) => this.handle(req, res));
      s.on('upgrade', (req, socket, head) => { if (this.upgrade && this.hostOk(req)) this.upgrade(req, socket, head); else socket.destroy(); });
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
