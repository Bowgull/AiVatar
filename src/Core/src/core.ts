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
import { READ_ONLY_BUILTINS, TOOL_NAMES, SHELL_TOOLS, WEB_PROMPT, WEB_TOOLS, describeCall, makeToolServer, reachesNetwork } from './tools.ts';
import { HookServer, HookTracker } from './hooks.ts';
import { Reminders } from './reminders.ts';
import { SessionStore } from './sessions.ts';
import { ActivityLog } from './activity.ts';
import { consolidate } from './consolidate.ts';
import { buildSystemPrompt, lint, stripReasoning } from './voice.ts';

export interface CoreConfig {
  port: number;
  dataDir: string;
  stateDir: string;
  claudeExecutable?: string;
  /** Send a silent first message at start so the first real one does not pay for process start-up. */
  warm?: boolean;
  /** Read the last session and write down what mattered. Off in tests that do not want the call. */
  consolidate?: boolean;
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
const MAX_TEXT = 8000;
const PERMISSION_TIMEOUT_MS = 120_000;   // he may be in the game; wait, but never for ever          // a chat message this long is a paste; cap it rather than trust the sender

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
  /** Built fresh per lane: one in-process MCP server cannot serve two live queries. Sharing it made
   *  Aang's own tools fail with "the aang server failed to connect" the moment a second lane started. */
  private tools() { return makeToolServer(this.memory, this.hooks, this.reminders, q => this.lookUpWeb(q), this.activity); }
  readonly hooks = new HookTracker();
  /** Which window Joshua is in. Memory only, never written to disk. */
  readonly activity = new ActivityLog();
  readonly reminders: Reminders;
  /** Which Claude session each lane is in, so six reboots a day do not read as amnesia. */
  readonly sessions: SessionStore;
  private hookServer: HookServer | null = null;
  private checkpointTimer: NodeJS.Timeout | null = null;
  /** Aang is visible but silent: the Body is in quiet mode (the game has focus), or Joshua muted him. */
  private bodyQuiet = false;
  private muted = false;
  /** Unprompted messages that arrived while he was quiet or muted, oldest first. */
  private readonly pending: string[] = [];
  /** The one permission question outstanding, if any. */
  private permission: { id: string; resolve: (ok: boolean) => void; timer: NodeJS.Timeout } | null = null;
  private permissionSeq = 0;
  /** Test hook: the text of the most recent accepted submit. */
  lastSubmitText = '';
  /** Test/observation hook: called with every finished turn. */
  onTurn: (r: TurnRecord) => void = () => {};

  constructor(cfg: CoreConfig) {
    this.cfg = cfg;
    this.memory = new Memory(cfg.dataDir);
    // What he already knows about Joshua goes in the prompt, so he starts the conversation knowing it
    // rather than having to go and look. Only the fresh, often-confirmed ones: a belief nobody has
    // mentioned in months should not quietly colour every answer.
    const standing = this.memory.standing().map(f => '- ' + f.text).join('\n');
    this.systemPrompt = buildSystemPrompt(this.memory.profile(), this.memory.learned())
      + (standing ? `\n\n<known>\nWhat you already know about Joshua. Treat it as true unless he says otherwise, and\nuse remember/forget to keep it current.\n${standing}\n</known>` : '');
    this.reminders = new Reminders(cfg.stateDir);
    this.sessions = new SessionStore(cfg.stateDir);
  }

  // ------------------------------------------------------------------ lifecycle

  async start(): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      this.wss = new WebSocketServer({ host: '127.0.0.1', port: this.cfg.port, path: '/body' });
      this.wss.once('listening', () => resolve());
      this.wss.once('error', reject);
    });
    this.wss!.on('connection', ws => this.onConnection(ws));
    this.hookServer = new HookServer(this.cfg.port + 1, ev => {
      const said = this.hooks.handle(ev);
      if (said) this.announce(said.text);
    });
    try { await this.hookServer.start(); }
    catch (e) { console.error('hook endpoint could not start:', (e as Error).message); this.hookServer = null; }
    // Fold the memory journal back into the database every few minutes; a Shadow session runs four
    // hours and ends with a hard shutdown, so do not leave it all for a clean stop that may never come.
    this.checkpointTimer = setInterval(() => this.memory.checkpoint(), 5 * 60_000);
    this.checkpointTimer.unref?.();
    this.reminders.onDue = r => this.announce(`Reminder: ${r.text}`);
    this.reminders.start();
    const resumable = Object.entries(this.sessions.all()).map(([l, r]) => `${l}=${r.id.slice(0, 8)}`).join(' ');
    console.log(`core listening on ws://127.0.0.1:${this.cfg.port}/body${resumable ? '  resuming ' + resumable : '  (no session to resume)'}`);
    // Give the turns that never had a vector one, in the background. 148 of 466 were embedded by the
    // old Aang; the rest have been invisible to meaning-based recall ever since. Local and free.
    void this.memory.backfill().then(n => {
      if (n) console.log(`memory: embedded ${n} older turns (${JSON.stringify(this.memory.coverage())})`);
    });
    // Catch up on the last session. Deliberately after a pause: Joshua may already be typing, and this
    // must never make his first message wait.
    if (this.cfg.consolidate !== false) setTimeout(() => void this.catchUp(), 20_000).unref?.();
    if (this.cfg.warm !== false) this.warm();
  }

  async stop(): Promise<void> {
    if (this.permission) this.answerPermission(this.permission.id, false);
    if (this.checkpointTimer) clearInterval(this.checkpointTimer);
    this.reminders.stop();
    await this.hookServer?.stop(); this.hookServer = null;
    this.webLane?.close(); this.webLane = null;
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

  /**
   * The only way out to the internet. A separate session with web tools and nothing else: no files, no
   * shell, no permission callback, and its own conversation. Whatever a page says stays in here; the
   * session that holds Joshua's files only ever sees the few sentences that come back.
   */
  private webLane: Lane | null = null;
  private lookUpWeb(question: string): Promise<string> {
    if (!this.webLane) {
      this.webLane = new Lane({
        // No MCP server: it must not be able to call look_up_web (which would recurse into itself), and
        // sharing one in-process server across two live queries broke the connection outright.
        name: 'web', model: MODELS.quick.model, systemPrompt: WEB_PROMPT,
        allowedTools: WEB_TOOLS,
        claudeExecutable: this.cfg.claudeExecutable, thinking: { type: 'disabled' },
      });
      this.webLane.onEvent(() => {});
    }
    return this.webLane.ask(question).then(r => r.text || 'Nothing came back from that lookup.');
  }

  /**
   * Read what happened since the last catch-up and write down what is worth keeping. Runs on the
   * cheapest model, once per session, and not at all once the week is past 40%.
   */
  async catchUp(): Promise<void> {
    try {
      const r = await consolidate(this.memory, async prompt => {
        const lane = new Lane({
          name: 'consolidate', model: MODELS.quick.model, systemPrompt:
            'You summarise a conversation into durable facts. You answer with JSON and nothing else.',
          allowedTools: [], claudeExecutable: this.cfg.claudeExecutable, thinking: { type: 'disabled' },
        });
        lane.onEvent(() => {});
        try { return (await lane.ask(prompt, 120_000)).text; } finally { lane.close(); }
      }, { weekUsed: this.policy.last?.week ?? 0 });
      if (r.skipped) console.log(`memory: catch-up skipped (${r.skipped})`);
      else console.log(`memory: caught up on ${r.considered} turns, kept ${r.kept.length}` +
        (r.replaced.length ? `, replaced ${r.replaced.length}` : '') +
        (r.kept.length ? `: ${r.kept.map(k => JSON.stringify(k)).join(', ')}` : ''));
    } catch (e) { console.error('memory: catch-up failed:', (e as Error).message); }
  }

  private lane(name: LaneName): Lane {
    let l = this.lanes.get(name);
    if (l) return l;
    l = new Lane({
      name, model: MODELS[name].model, systemPrompt: this.systemPrompt, mcpServer: this.tools(),
      // Aang's own tools and the read-only built-ins run freely; anything that changes the machine
      // comes back through askPermission and waits for Joshua.
      // No web tools here at all: the web is reachable only through look_up_web, which runs in a
      // separate session that has no files and no shell.
      // They have to be DISALLOWED, not merely left out of allowedTools. Left out, the model still sees
      // them, reaches for WebFetch first, gets refused and gives up instead of using look_up_web.
      // Measured on 2026-09-20, not guessed.
      allowedTools: [...TOOL_NAMES, ...READ_ONLY_BUILTINS],
      disallowedTools: WEB_TOOLS,
      askPermission: (tool, input) => this.askPermission(tool, input),
      claudeExecutable: this.cfg.claudeExecutable,
      // Measured on the warm Quick lane: first token 1369 ms with thinking, 444 ms without. Chat does not
      // need it; Smart and Deep keep it because they are chosen for work that does.
      thinking: name === 'quick' ? { type: 'disabled' } : undefined,
      resumeId: this.sessions.get(name),
      onSession: id => this.sessions.set(name, id),
      onResumeFailed: id => { console.log(`lane ${name}: could not resume ${id}, starting fresh`); this.sessions.clear(name); },
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
      case 'presence': {
        this.setSilent(m.quiet === true, this.muted);
        const watching = m.watching !== false;
        if (watching !== this.activity.watching) { this.activity.watching = watching; if (!watching) this.activity.clear(); }
        if (watching) this.activity.record(m.foreground ?? '', m.title ?? '');
        break;
      }
      case 'permission.reply': this.answerPermission(m.id, m.allow === true); break;
      case 'mute': this.setSilent(this.bodyQuiet, m.on === true); break;
      case 'saving': this.policy.setSaving(m.on); { const q = this.quotaMessage(); if (q) this.broadcast(q); } break;
      default: break; // poked, moved, pong: nothing to do yet
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

  /**
   * Say something Joshua did not ask for. Only session status and reminders ever come through here, and only
   * when he can actually see it: while he is in the game or has muted Aang they wait, and are delivered in
   * order the moment he is back.
   */
  announce(text: string): void {
    if (this.bodyQuiet || this.muted) {
      this.pending.push(text);
      while (this.pending.length > 5) this.pending.shift();
      return;
    }
    this.broadcast({ t: 'bubble', text, stream: false, proactive: true });
  }

  private setSilent(quiet: boolean, muted: boolean): void {
    const was = this.bodyQuiet || this.muted;
    this.bodyQuiet = quiet; this.muted = muted;
    if (!was || quiet || muted) return;
    const held = this.pending.splice(0);
    // One after another, with a gap, so they do not overwrite each other in the bubble.
    held.forEach((text, i) => setTimeout(() => this.broadcast({ t: 'bubble', text, stream: false, proactive: true }), i * 6000).unref?.());
  }

  /** What is waiting to be said (tests and diagnostics). */
  get pendingCount(): number { return this.pending.length; }

  /**
   * A tool wants to change something. Aang never decides that himself: the question goes to the bubble and
   * this waits for a yes or a no. No Body, no answer, or a second question while one is open all mean no,
   * because the safe default when nobody is there to say yes is not to do it.
   */
  private askPermission(tool: string, input: Record<string, unknown>): Promise<boolean> {
    // Belt and braces: if the main session ever reaches for a web tool directly, refuse it outright
    // rather than asking Joshua. Untrusted page content must not enter the session that holds his files.
    if (WEB_TOOLS.includes(tool)) {
      console.log('refused ' + tool + ' in the main session; look_up_web is the only way out');
      return Promise.resolve(false);
    }
    // ...and the shell is a way out too. Refused before Joshua is ever asked, so a poisoned page cannot
    // turn itself into a yes/no prompt he might wave through.
    if (SHELL_TOOLS.includes(tool) && reachesNetwork(String(input?.command ?? ''))) {
      console.log('refused a shell command that reaches the network; look_up_web is the only way out');
      return Promise.resolve(false);
    }
    if (!this.wss || this.wss.clients.size === 0) return Promise.resolve(false);
    if (this.permission) return Promise.resolve(false);
    const id = `perm${++this.permissionSeq}`;
    const question = describeCall(tool, input);
    return new Promise<boolean>(resolve => {
      const timer = setTimeout(() => this.answerPermission(id, false), PERMISSION_TIMEOUT_MS);
      timer.unref?.();
      this.permission = { id, resolve, timer };
      this.broadcast({ t: 'permission', id, tool, question });
    });
  }

  private answerPermission(id: string, allow: boolean): void {
    const p = this.permission;
    if (!p || p.id !== id) return;
    clearTimeout(p.timer);
    this.permission = null;
    p.resolve(allow);
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

