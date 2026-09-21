// A lane is one persistent Claude session (one process, one model) that stays warm between messages.
// Messages queue in order; text streams out as it is generated. If the process dies the next message
// restarts it and resumes the same conversation.
import { query } from '@anthropic-ai/claude-agent-sdk';
import type { Query, SDKUserMessage } from '@anthropic-ai/claude-agent-sdk';
import { parseRateLimit } from './quota.ts';
import type { Quota } from './quota.ts';
import { toolLabel } from './tools.ts';

export type LaneEvent =
  | { t: 'delta'; text: string; reset: boolean }
  | { t: 'tool'; name: string; phase: 'start' | 'done'; label: string }
  | { t: 'result'; ok: boolean; text: string; ms: number; ttftMs: number | null; ctxTokens: number; tools: string[]; subtype: string }
  | { t: 'quota'; quota: Quota }
  | { t: 'error'; message: string };

export interface LaneOptions {
  name: string;
  model: string;
  systemPrompt: string;
  /** Aang's own in-process tools. The web lane gets none: it must not be able to call look_up_web,
   *  which would recurse, and sharing one server across two live queries breaks it. */
  mcpServer?: unknown;
  /** Tools that run without asking: Aang's own, plus the read-only built-ins. */
  allowedTools: string[];
  /** Tools taken out of the model's context entirely. Not the same as leaving them out of allowedTools,
   *  which only makes them ask: the model still sees those and will reach for them first. */
  disallowedTools?: string[];
  /** The ONLY built-in tools this lane can see. Anything not listed does not exist for it: stronger than
   *  disallowing, and used for lanes that read untrusted content or should have no tools at all. */
  onlyTools?: string[];
  /**
   * Asked before a tool that changes something runs. Resolve true to let it, false to refuse.
   * Passing nothing at all means no tool ever needs permission, which is not how this is used.
   */
  askPermission?: (tool: string, input: Record<string, unknown>) => Promise<boolean>;
  claudeExecutable?: string;
  /** Extended thinking: `{ type: 'disabled' }` trades depth for first-token speed on the chat lane. */
  thinking?: { type: 'disabled' } | { type: 'adaptive' };
  /** A session id from a previous run of the Core, so a restart continues the same conversation. */
  resumeId?: string;
  /** Called whenever the lane learns its session id, so it can be written to disk. */
  onSession?: (id: string) => void;
  /** Called when a resume was refused, so the stored id can be dropped before it wedges anything. */
  onResumeFailed?: (id: string) => void;
}

export class Lane {
  readonly name: string;
  private readonly opts: LaneOptions;
  private q: Query | null = null;
  private inbox: SDKUserMessage[] = [];
  private wake: (() => void) | null = null;
  private closed = false;
  private sessionId: string | undefined;
  private listener: (e: LaneEvent) => void = () => {};
  private sentAt = 0;
  private firstTokenAt: number | null = null;
  private toolsUsed: string[] = [];
  private resetNextText = false;
  private text = '';
  private starting = false;
  /** The id this process was started with, if it was a resume. Kept for the life of the process. */
  private startedWithResume: string | undefined;
  /** True once this process has produced a good result, so we know the resume was actually accepted. */
  private resumeProved = false;
  /** One replay per message, so a bad resume cannot loop. */
  private replayed = false;
  /** The message we were carrying when a resume failed, so it is re-sent rather than swallowed. */
  private pendingText: string | null = null;

  constructor(opts: LaneOptions) { this.opts = opts; this.name = opts.name; this.sessionId = opts.resumeId; }

  onEvent(cb: (e: LaneEvent) => void): void { this.listener = cb; }
  get running(): boolean { return this.q !== null; }

  /** Start the process now so the first real message does not pay for it. */
  start(): void {
    if (this.q || this.starting || this.closed) return;
    this.starting = true;
    this.startedWithResume = this.sessionId;
    this.resumeProved = false;
    const self = this;
    async function* prompts(): AsyncGenerator<SDKUserMessage> {
      while (!self.closed) {
        if (!self.inbox.length) await new Promise<void>(r => (self.wake = r));
        while (self.inbox.length) yield self.inbox.shift()!;
      }
    }
    this.q = query({
      prompt: prompts(),
      options: {
        model: this.opts.model,
        systemPrompt: this.opts.systemPrompt,
        // Note: never pass `tools: []`. An empty array switches every built-in off, which is how Aang
        // ended up telling Joshua he had no internet and could not touch the machine.
        settingSources: [],
        includePartialMessages: true,
        maxTurns: 8, // a chat turn never needs more than a few tool round trips; bound any runaway loop
        ...(this.opts.mcpServer ? { mcpServers: { aang: this.opts.mcpServer as never } } : {}),
        allowedTools: this.opts.allowedTools,
        ...(this.opts.disallowedTools?.length ? { disallowedTools: this.opts.disallowedTools } : {}),
        ...(this.opts.onlyTools ? { tools: this.opts.onlyTools } : {}),
        // Anything not in allowedTools (Bash, Write, Edit, ...) comes through canUseTool, which asks Joshua
        // in the bubble and waits for his answer.
        permissionMode: 'default',
        ...(this.opts.askPermission ? {
          canUseTool: async (tool: string, input: Record<string, unknown>) =>
            (await this.opts.askPermission!(tool, input))
              ? { behavior: 'allow' as const, updatedInput: input }
              : { behavior: 'deny' as const, message: 'Not allowed: either a safety rule stopped it or Joshua said no. Do not tell him he declined unless he did.' },
        } : {}),
        resume: this.sessionId,
        // Account-level claude.ai connectors (Drive, Gmail, ...) otherwise load into every session:
        // measured 16k tokens per turn with them, 2.7k without.
        // ENABLE_TOOL_SEARCH=false: load his ~20 small tools up front. By default the engine hides them behind a
        // ToolSearch step, so every turn began with a lookup round trip, and on 2026-09-21 one session looked five
        // times and never reached a tool: it could not remember, search or forget anything.
        env: { ...process.env, ENABLE_CLAUDEAI_MCP_SERVERS: 'false', ENABLE_TOOL_SEARCH: 'false' },
        ...(this.opts.thinking ? { thinking: this.opts.thinking as never } : {}),
        ...(this.opts.claudeExecutable ? { pathToClaudeCodeExecutable: this.opts.claudeExecutable } : {}),
      },
    });
    void this.pump(this.q);
  }

  send(text: string): void {
    if (!this.q) this.start();
    this.pendingText = text;
    this.replayed = false;
    this.sentAt = Date.now(); this.firstTokenAt = null; this.toolsUsed = []; this.text = ''; this.resetNextText = false;
    this.inbox.push({ type: 'user', message: { role: 'user', content: text }, parent_tool_use_id: null } as SDKUserMessage);
    this.wake?.();
  }

  /**
   * Send one message and wait for the whole answer. Used by the web lane, which is asked a question by a
   * tool call and has to hand back a string rather than stream to the bubble.
   */
  ask(text: string, timeoutMs = 90_000): Promise<{ ok: boolean; text: string }> {
    return new Promise(resolve => {
      const previous = this.listener;
      let done = false;
      const finish = (r: { ok: boolean; text: string }) => {
        if (done) return;
        done = true; clearTimeout(timer); this.listener = previous; resolve(r);
      };
      const timer = setTimeout(() => finish({ ok: false, text: 'That lookup took too long.' }), timeoutMs);
      timer.unref?.();
      this.listener = e => {
        if (e.t === 'result') finish({ ok: e.ok, text: e.text });
        else if (e.t === 'error') finish({ ok: false, text: e.message });
      };
      this.send(text);
    });
  }

  async interrupt(): Promise<void> {
    try { await this.q?.interrupt(); } catch { /* nothing running */ }
  }

  close(): void {
    this.closed = true; this.wake?.();
    try { this.q?.close(); } catch { /* already gone */ }
    this.q = null;
  }

  private async pump(q: Query): Promise<void> {
    try {
      for await (const m of q as AsyncIterable<any>) {
        if (m.session_id && m.session_id !== this.sessionId) {
          this.sessionId = m.session_id;
          this.opts.onSession?.(m.session_id);
        }
        if (this.startedWithResume && this.sessionId) this.opts.onSession?.(this.sessionId);
        if (process.env.AANG_TRACE) console.log(`[lane ${this.name}] +${Date.now() - this.sentAt}ms ${m.type}${m.subtype ? '/' + m.subtype : ''}${m.event ? ' ' + m.event.type : ''}`);
        switch (m.type) {
          case 'rate_limit_event': {
            const quota = parseRateLimit(m);
            if (quota) this.listener({ t: 'quota', quota });
            break;
          }
          case 'stream_event': {
            const ev = m.event;
            if (ev.type === 'content_block_start' && ev.content_block?.type === 'tool_use') {
              const name = ev.content_block.name as string;
              this.toolsUsed.push(name);
              this.resetNextText = true;
              this.listener({ t: 'tool', name, phase: 'start', label: toolLabel(name) });
            } else if (ev.type === 'content_block_delta' && ev.delta?.type === 'text_delta') {
              if (this.firstTokenAt === null) this.firstTokenAt = Date.now();
              if (this.resetNextText) { this.text = ''; }
              this.text += ev.delta.text;
              this.listener({ t: 'delta', text: ev.delta.text, reset: this.resetNextText });
              this.resetNextText = false;
            }
            break;
          }
          case 'user': {
            // a tool result came back
            if (this.toolsUsed.length) this.listener({ t: 'tool', name: this.toolsUsed[this.toolsUsed.length - 1]!, phase: 'done', label: '' });
            break;
          }
          case 'result': {
            // A dead session id does not throw: the SDK comes back with an error result before Claude
            // ever speaks. Seen as result/error_during_execution +1.1s after start, with a stale id.
            if (m.subtype !== 'success' && this.startedWithResume && !this.resumeProved && !this.replayed) {
              const dead = this.startedWithResume;
              this.replayed = true;
              this.startedWithResume = undefined;
              this.sessionId = undefined;
              this.opts.onResumeFailed?.(dead);
              try { this.q?.close(); } catch { /* already gone */ }
              this.q = null; this.starting = false;
              const replay = this.pendingText;
              this.pendingText = null;
              if (replay !== null && !this.closed) { this.send(replay); return; }
            }
            this.resumeProved = true;
            this.pendingText = null;              // delivered; nothing left to replay
            const u = m.usage ?? {};
            this.listener({
              t: 'result',
              ok: m.subtype === 'success',
              subtype: m.subtype,
              text: typeof m.result === 'string' && m.result ? m.result : this.text,
              ms: Date.now() - this.sentAt,
              ttftMs: this.firstTokenAt === null ? null : this.firstTokenAt - this.sentAt,
              ctxTokens: (u.input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0),
              tools: [...this.toolsUsed],
            });
            break;
          }
        }
      }
    } catch (e) {
      // A resume that never produced a single message is a dead session id: the transcript was pruned,
      // or written by a different install. Drop it and start the conversation again rather than
      // failing every turn from here on.
      const staleResume = this.resumeProved ? undefined : this.startedWithResume;
      if (this.q === q) this.q = null;
      this.starting = false;
      if (staleResume && !this.replayed) {
        this.replayed = true;
        this.opts.onResumeFailed?.(staleResume);
        this.sessionId = undefined;
        this.startedWithResume = undefined;
        const replay = this.pendingText;
        this.pendingText = null;
        if (replay !== null && !this.closed) { this.send(replay); return; }
      }
      this.listener({ t: 'error', message: (e as Error).message });
      return;
    } finally {
      if (this.q === q) this.q = null;
      this.starting = false;
    }
  }
}




