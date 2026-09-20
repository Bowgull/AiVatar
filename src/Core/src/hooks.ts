// Claude Code tells Aang what it is doing, through its own hook system.
//
// Each hook is a one-line curl that POSTs the hook's JSON to http://127.0.0.1:<port+1>/hook. Nothing is
// installed inside Claude Code beyond that line (see tools/install-hooks.mjs), the post is capped at a
// second, and a failure is ignored, so Aang being down can never slow a session down or break it.
import http from 'node:http';

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
export class HookServer {
  private server: http.Server | null = null;
  private readonly port: number;
  private readonly onEvent: (ev: any) => void;
  constructor(port: number, onEvent: (ev: any) => void) { this.port = port; this.onEvent = onEvent; }

  async start(): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      this.server = http.createServer((req, res) => {
        if (req.method !== 'POST' || !req.url?.startsWith('/hook')) { res.writeHead(404).end(); return; }
        let body = '';
        req.on('data', d => { body += d; if (body.length > 64_000) req.destroy(); });
        req.on('end', () => {
          // 204 with no body at all: a UserPromptSubmit hook's stdout is fed to Claude Code as context,
          // so the answer has to be empty, and curl then needs no platform-specific redirection.
          res.writeHead(204).end();
          try { this.onEvent(JSON.parse(body)); } catch { /* a malformed hook is not worth a crash */ }
        });
        req.on('error', () => { /* client vanished */ });
      });
      this.server.on('error', reject);
      this.server.listen(this.port, '127.0.0.1', () => resolve());
    });
  }

  async stop(): Promise<void> {
    const s = this.server; this.server = null;
    if (s) await new Promise<void>(r => s.close(() => r()));
  }
}
