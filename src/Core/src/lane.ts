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
  mcpServer: unknown;
  /** Tools that run without asking: Aang's own, plus the read-only built-ins. */
  allowedTools: string[];
  /**
   * Asked before a tool that changes something runs. Resolve true to let it, false to refuse.
   * Passing nothing at all means no tool ever needs permission, which is not how this is used.
   */
  askPermission?: (tool: string, input: Record<string, unknown>) => Promise<boolean>;
  claudeExecutable?: string;
  /** Extended thinking: `{ type: 'disabled' }` trades depth for first-token speed on the chat lane. */
  thinking?: { type: 'disabled' } | { type: 'adaptive' };
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

  constructor(opts: LaneOptions) { this.opts = opts; this.name = opts.name; }

  onEvent(cb: (e: LaneEvent) => void): void { this.listener = cb; }
  get running(): boolean { return this.q !== null; }

  /** Start the process now so the first real message does not pay for it. */
  start(): void {
    if (this.q || this.starting || this.closed) return;
    this.starting = true;
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
        mcpServers: { aang: this.opts.mcpServer as never },
        allowedTools: this.opts.allowedTools,
        // Anything not in allowedTools (Bash, Write, Edit, ...) comes through canUseTool, which asks Joshua
        // in the bubble and waits for his answer.
        permissionMode: 'default',
        ...(this.opts.askPermission ? {
          canUseTool: async (tool: string, input: Record<string, unknown>) =>
            (await this.opts.askPermission!(tool, input))
              ? { behavior: 'allow' as const, updatedInput: input }
              : { behavior: 'deny' as const, message: 'Joshua said no to that.' },
        } : {}),
        resume: this.sessionId,
        // Account-level claude.ai connectors (Drive, Gmail, ...) otherwise load into every session:
        // measured 16k tokens per turn with them, 2.7k without.
        env: { ...process.env, ENABLE_CLAUDEAI_MCP_SERVERS: 'false' },
        ...(this.opts.thinking ? { thinking: this.opts.thinking as never } : {}),
        ...(this.opts.claudeExecutable ? { pathToClaudeCodeExecutable: this.opts.claudeExecutable } : {}),
      },
    });
    void this.pump(this.q);
  }

  send(text: string): void {
    if (!this.q) this.start();
    this.sentAt = Date.now(); this.firstTokenAt = null; this.toolsUsed = []; this.text = ''; this.resetNextText = false;
    this.inbox.push({ type: 'user', message: { role: 'user', content: text }, parent_tool_use_id: null } as SDKUserMessage);
    this.wake?.();
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
        if (m.session_id) this.sessionId = m.session_id;
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
      this.listener({ t: 'error', message: (e as Error).message });
    } finally {
      // The process ended. Drop it so the next message starts a fresh one that resumes this conversation.
      if (this.q === q) this.q = null;
      this.starting = false;
    }
  }
}
