// The Core: talks to the Body over a localhost WebSocket, keeps one warm Claude session per model lane,
// streams replies, enforces the voice linter and grounding rule, and applies Joshua's quota rule.
import { WebSocketServer } from 'ws';
import type { WebSocket } from 'ws';
import { appendFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { parseFromBody } from './protocol.ts';
import type { FromBody, Mode, ToBody } from './protocol.ts';
import { Lane } from './lane.ts';
import type { LaneEvent } from './lane.ts';
import { Memory } from './memory.ts';
import { QuotaPolicy } from './quota.ts';
import { MODELS, pickLane } from './route.ts';
import type { Lane as LaneName } from './route.ts';
import { TOOL_NAMES, makeToolServer } from './tools.ts';
import { buildSystemPrompt, lint, stripReasoning } from './voice.ts';

export interface CoreConfig {
  port: number;
  dataDir: string;
  stateDir: string;
  claudeExecutable?: string;
  /** Send a silent first message at start so the first real one does not pay for process start-up. */
  warm?: boolean;
}

interface Submission { id: string; text: string; mode: Mode; once: boolean; socket: WebSocket }
interface Turn {
  sub: Submission | null;      // null for the silent warm-up turn
  lane: LaneName;
  buf: string;
  flush: NodeJS.Timeout | null;
  stopped: boolean;
  startedAt: number;
  ackMs: number;
  watchdog: NodeJS.Timeout | null;
}

export interface TurnRecord {
  ts: string; id: string; lane: LaneName; user: string; reply: string;
  ms: number; ttftMs: number | null; ackMs: number; ctxTokens: number; tools: string[]; fixed: string[]; flags: string[];
}

const FLUSH_MS = 40;            // batch streamed text into ~40 ms paints
const TURN_TIMEOUT_MS = 120_000;
const MAX_TEXT = 8000;          // a chat message this long is a paste; cap it rather than trust the sender

export class Core {
  readonly cfg: CoreConfig;
  readonly memory: Memory;
  readonly policy = new QuotaPolicy();
  private wss: WebSocketServer | null = null;
  private readonly lanes = new Map<LaneName, Lane>();
  private readonly queue: Submission[] = [];
  private readonly recent = new Map<string, { lane: LaneName; user: string; reply: string }>();
  private active: Turn | null = null;
  private readonly systemPrompt: string;
  private readonly toolServer;
  /** Test hook: the text of the most recent accepted submit. */
  lastSubmitText = '';
  /** Test/observation hook: called with every finished turn. */
  onTurn: (r: TurnRecord) => void = () => {};

  constructor(cfg: CoreConfig) {
    this.cfg = cfg;
    this.memory = new Memory(cfg.dataDir);
    this.systemPrompt = buildSystemPrompt(this.memory.profile(), this.memory.learned());
    this.toolServer = makeToolServer(this.memory);
  }

  // ------------------------------------------------------------------ lifecycle

  async start(): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      this.wss = new WebSocketServer({ host: '127.0.0.1', port: this.cfg.port, path: '/body' });
      this.wss.once('listening', () => resolve());
      this.wss.once('error', reject);
    });
    this.wss!.on('connection', ws => this.onConnection(ws));
    console.log(`core listening on ws://127.0.0.1:${this.cfg.port}/body`);
    if (this.cfg.warm !== false) this.warm();
  }

  async stop(): Promise<void> {
    for (const l of this.lanes.values()) l.close();
    this.memory.close();
    if (!this.wss) return;
    // ws only fires the close callback once every client has disconnected, so a connected Body (or a
    // test client that never hung up) would keep the Core from ever stopping. Drop them explicitly.
    for (const c of this.wss.clients) c.terminate();
    await new Promise<void>(r => this.wss!.close(() => r()));
    this.wss = null;
  }

  /** Number of connected windows (the Body, plus any test client). */
  get clientCount(): number { return this.wss ? this.wss.clients.size : 0; }

  private lane(name: LaneName): Lane {
    let l = this.lanes.get(name);
    if (l) return l;
    l = new Lane({
      name, model: MODELS[name].model, systemPrompt: this.systemPrompt, mcpServer: this.toolServer,
      allowedTools: TOOL_NAMES, builtinTools: [], claudeExecutable: this.cfg.claudeExecutable,
      // Measured on the warm Quick lane: first token 1369 ms with thinking, 444 ms without. Chat does not
      // need it; Smart and Deep keep it because they are chosen for work that does.
      thinking: name === 'quick' ? { type: 'disabled' } : undefined,
    });
    l.onEvent(e => this.onLaneEvent(name, e));
    this.lanes.set(name, l);
    return l;
  }

  private warm(): void {
    const l = this.lane('quick');
    this.active = { sub: null, lane: 'quick', buf: '', flush: null, stopped: false, startedAt: Date.now(), ackMs: 0, watchdog: null };
    l.send('Reply with a single period and nothing else.');
  }

  // ------------------------------------------------------------------ Body side

  private onConnection(ws: WebSocket): void {
    ws.on('message', data => {
      // Nothing a client sends may throw out of this handler and take the Core with it.
      try {
        const m = parseFromBody(String(data));
        if (m) this.onBody(ws, m);
      } catch (e) {
        console.error('message handler failed:', (e as Error).message);
      }
    });
    ws.on('error', () => { /* a dropped client must never take the Core down */ });
  }

  private send(ws: WebSocket, msg: ToBody): void {
    if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(msg));
  }
  private broadcast(msg: ToBody): void {
    if (!this.wss) return;
    for (const c of this.wss.clients) this.send(c, msg);
  }

  private quotaMessage(): ToBody | null {
    const q = this.policy.last;
    if (!q) return null;
    return { t: 'quota', five: q.five, week: q.week, fiveResetsAt: q.fiveResetsAt, weekResetsAt: q.weekResetsAt, level: this.policy.level };
  }

  private onBody(ws: WebSocket, m: FromBody): void {
    switch (m.t) {
      case 'hello': { const q = this.quotaMessage(); if (q) this.send(ws, q); break; }
      case 'submit': {
        const id = typeof m.id === 'string' && m.id ? m.id : undefined;
        const text = typeof m.text === 'string' ? m.text.trim() : '';
        if (!id || !text) {
          this.send(ws, { t: 'error', id, message: 'That message was empty or malformed.', next: 'Type something and send it again.' });
          break;
        }
        const mode: Mode = m.mode === 'quick' || m.mode === 'smart' || m.mode === 'deep' ? m.mode : 'auto';
        this.lastSubmitText = text.slice(0, MAX_TEXT);
        this.submit({ id, text: text.slice(0, MAX_TEXT), mode, once: m.once === true, socket: ws });
        break;
      }
      case 'stop': void this.stopActive(m.id); break;
      case 'rate': this.rate(m.id, m.value); break;
      case 'saving': this.policy.setSaving(m.on); { const q = this.quotaMessage(); if (q) this.broadcast(q); } break;
      default: break; // presence, poked, moved, pong: nothing to do yet
    }
  }

  // ------------------------------------------------------------------ turns

  private submit(sub: Submission): void {
    const t0 = Date.now();
    // Acknowledge first, before any decision or model work: this is the "it heard me" moment.
    this.send(sub.socket, { t: 'ack', id: sub.id });

    const choice = pickLane(sub.text, sub.mode, this.policy.saving, sub.once);
    if (choice.needsConsent) {
      this.send(sub.socket, { t: 'consent', id: sub.id, wanted: sub.mode });
      return;
    }
    if (this.active) {
      this.queue.push(sub);
      this.send(sub.socket, { t: 'queued', id: sub.id, position: this.queue.length });
      return;
    }
    this.begin(sub, choice.lane, Date.now() - t0);
  }

  private begin(sub: Submission, lane: LaneName, ackMs: number): void {
    this.broadcast({ t: 'bubble.dots' });
    this.broadcast({ t: 'state', state: 'think' });
    const turn: Turn = { sub, lane, buf: '', flush: null, stopped: false, startedAt: Date.now(), ackMs, watchdog: null };
    turn.watchdog = setTimeout(() => this.fail(turn, 'That took too long and I gave up waiting.', 'Try again, or ask something shorter.'), TURN_TIMEOUT_MS);
    this.active = turn;
    this.lane(lane).send(sub.text);
  }

  private next(): void {
    this.active = null;
    const sub = this.queue.shift();
    if (!sub) return;
    const choice = pickLane(sub.text, sub.mode, this.policy.saving, sub.once);
    this.begin(sub, choice.lane, 0);
  }

  private finishTurn(turn: Turn): void {
    if (turn.flush) clearTimeout(turn.flush);
    if (turn.watchdog) clearTimeout(turn.watchdog);
    if (this.active === turn) this.next();
  }

  private fail(turn: Turn, message: string, next: string): void {
    if (this.active !== turn) return;
    if (turn.sub) this.broadcast({ t: 'error', id: turn.sub.id, message, next });
    void this.lanes.get(turn.lane)?.interrupt();
    this.finishTurn(turn);
  }

  private async stopActive(id?: string): Promise<void> {
    const t = this.active;
    if (!t || !t.sub || (id && t.sub.id !== id)) return;
    t.stopped = true;
    if (t.flush) { clearTimeout(t.flush); t.flush = null; }
    // Clear the bubble immediately; the model may take a moment to acknowledge the interrupt.
    this.broadcast({ t: 'bubble.clear' });
    this.broadcast({ t: 'state', state: 'idle' });
    await this.lanes.get(t.lane)?.interrupt();
    setTimeout(() => { if (this.active === t) this.finishTurn(t); }, 1500);
  }

  private onLaneEvent(name: LaneName, e: LaneEvent): void {
    if (e.t === 'quota') {
      const notice = this.policy.update(e.quota);
      const q = this.quotaMessage(); if (q) this.broadcast(q);
      if (notice === 'warn') this.broadcast({ t: 'bubble', text: `You've used ${Math.round(e.quota.week * 100)}% of your week.`, stream: false, proactive: true });
      if (notice === 'offer') this.broadcast({ t: 'bubble', text: `You're at ${Math.round(e.quota.week * 100)}% of your week. Want me to save quota? I'd stay on Quick and skip background work.`, stream: false, proactive: true });
      return;
    }
    const turn = this.active;
    if (!turn || turn.lane !== name) return;
    const sub = turn.sub;

    if (e.t === 'tool') {
      if (sub && e.phase === 'start') this.broadcast({ t: 'tool', id: sub.id, name: e.name, phase: 'start', label: e.label });
      turn.buf = '';
      return;
    }
    if (e.t === 'delta') {
      if (!sub || turn.stopped) return;
      turn.buf = e.reset ? e.text : turn.buf + e.text;
      if (!turn.flush) turn.flush = setTimeout(() => {
        turn.flush = null;
        // Hide reasoning even mid-stream; while the model is still "thinking aloud" the bubble keeps its dots.
        const visible = stripReasoning(turn.buf);
        if (!turn.stopped && visible) this.broadcast({ t: 'bubble', text: visible, stream: true, id: sub.id, who: MODELS[turn.lane].label });
      }, FLUSH_MS);
      return;
    }
    if (e.t === 'error') { this.fail(turn, 'I lost my connection to Claude.', 'I will reconnect on your next message.'); return; }

    // result
    if (!sub) { this.finishTurn(turn); return; }                       // silent warm-up turn
    if (turn.stopped) { this.finishTurn(turn); return; }
    if (!e.ok) { this.fail(turn, 'Claude stopped before finishing that.', 'Ask again, or try Smart for something harder.'); return; }

    const linted = lint(e.text, e.tools, sub.text);
    if (!linted.cleaned) { this.fail(turn, 'I got nothing back for that.', 'Ask again in a different way.'); return; }
    if (turn.flush) { clearTimeout(turn.flush); turn.flush = null; }
    this.broadcast({ t: 'bubble', text: linted.cleaned, stream: false, id: sub.id, who: MODELS[turn.lane].label });
    this.memory.saveTurn(sub.text, linted.cleaned, 'claude-' + turn.lane);
    this.record({
      ts: new Date().toISOString(), id: sub.id, lane: turn.lane, user: sub.text, reply: linted.cleaned,
      ms: e.ms, ttftMs: e.ttftMs, ackMs: turn.ackMs, ctxTokens: e.ctxTokens, tools: e.tools, fixed: linted.fixed, flags: linted.flags,
    });
    this.finishTurn(turn);
  }

  /** Joshua's rating of a reply, kept next to the turn it is about so voice changes can be judged on his taste. */
  private rate(id: unknown, value: unknown): void {
    if (typeof id !== 'string' || !id || (value !== 'up' && value !== 'down' && value !== 'none')) return;
    const turn = this.recent.get(id);
    try {
      mkdirSync(this.cfg.stateDir, { recursive: true });
      appendFileSync(path.join(this.cfg.stateDir, 'ratings.jsonl'), JSON.stringify({ ts: new Date().toISOString(), id, value, lane: turn?.lane, user: turn?.user, reply: turn?.reply }) + '\n');
    } catch { /* ratings are best effort */ }
  }

  private record(r: TurnRecord): void {
    this.recent.set(r.id, { lane: r.lane, user: r.user, reply: r.reply });
    if (this.recent.size > 60) this.recent.delete(this.recent.keys().next().value as string);
    try {
      mkdirSync(this.cfg.stateDir, { recursive: true });
      appendFileSync(path.join(this.cfg.stateDir, 'turns.jsonl'), JSON.stringify(r) + '\n');
    } catch { /* metrics are best effort */ }
    this.onTurn(r);
  }
}

