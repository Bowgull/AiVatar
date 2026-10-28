// M3 (2026-10-13): Shadow's half of the front desk. Aang's Discord logic (discord.ts) talks to a Gateway; this one
// is the MacBook's front desk over Tailscale instead of Discord directly, so the one connection to Discord lives on
// the Mac and never sleeps. Messages kept while Shadow was off arrive first, each exactly once: Shadow tells the
// Mac it took each one only after handling it, so nothing is lost and nothing is answered twice.
import { WebSocket } from 'ws';
import type { ButtonPress, Gateway, Incoming, OutMsg } from './discord.ts';
import { fromWire, toWire, type ToShadow } from './frontdesk.ts';

export class FrontDeskGateway implements Gateway {
  private ws: WebSocket | null = null;
  private seq = 0;
  private readonly waiting = new Map<number, { ok: (v: any) => void; no: (e: Error) => void; timer: NodeJS.Timeout }>();
  private readonly msgCbs: ((m: Incoming) => void)[] = [];
  private readonly btnCbs: ((b: ButtonPress) => void)[] = [];
  private closed = false;
  private firstOpen: () => void = () => {};
  /** Resolves the first time the Mac answers. */
  readonly ready: Promise<void>;
  private readonly o: { url: string; key: string; log: (s: string) => void; retryMs?: number; onRefused?: () => void };
  private toldRefused = false;

  constructor(o: { url: string; key: string; log?: (s: string) => void; retryMs?: number; onRefused?: () => void }) {
    this.o = { log: console.log, ...o };
    this.ready = new Promise(r => { this.firstOpen = r; });
    this.connect();
  }

  private connect(): void {
    if (this.closed) return;
    const ws = new WebSocket(this.o.url, { headers: { 'x-aang-key': this.o.key }, maxPayload: 32 * 1024 * 1024 });
    this.ws = ws;
    ws.on('open', () => { this.toldRefused = false; this.o.log('discord: connected to the front desk on the MacBook'); });
    // Found 2026-10-13: the Mac refused this PC (its key no longer matched) and Discord just waited, saying nothing.
    // Now it is said once, plainly, so he knows to run the Mac setup again.
    ws.on('unexpected-response', (_req, res) => {
      // 409 (2026-10-28): the brain on the Mac is Aang's home and holds Discord; this PC stays off it, quietly.
      if (res.statusCode === 409 && !this.toldRefused) { this.toldRefused = true; this.o.log('discord: the brain on the MacBook holds Discord now (Aang\'s home); this PC stays off it'); }
      if (res.statusCode === 403 && !this.toldRefused) { this.toldRefused = true; this.o.log('discord: the MacBook front desk refused this PC (its key does not match); run the Mac setup again'); this.o.onRefused?.(); }
      try { ws.terminate(); } catch { /* gone */ }
    });
    ws.on('message', raw => {
      let x: ToShadow;
      try { x = JSON.parse(String(raw)); } catch { return; }
      if ('ev' in x) {
        if (x.ev === 'hello') { if (x.queued) this.o.log(`discord: ${x.queued} message(s) waited on the Mac while Shadow was off`); this.firstOpen(); for (const cb of this.helloCbs) cb(); return; }
        if (x.ev === 'message') {
          const m = x.m;
          for (const cb of this.msgCbs) cb(m);
          // Kept while Shadow was off: it leaves the Mac's queue only now that it has been handed on.
          if (x.queued) this.raw({ op: 'taken', n: 1 });
          return;
        }
        // M4: what the Mac did while this PC was off. Applied, then acknowledged, so it is never applied twice.
        if (x.ev === 'handled') {
          const items = Array.isArray(x.items) ? x.items : [];
          if (!this.handledCb || !items.length) return;
          void Promise.resolve(this.handledCb(items)).then(() => this.raw({ op: 'handled.took', n: items.length }), e => this.o.log('discord: could not take what the Mac did: ' + (e as Error).message));
          return;
        }
        if (x.ev === 'button') {
          const { pressId, ...b } = x.b;
          const press: ButtonPress = { ...(b as any), ack: (note: string) => this.call('press.ack', [pressId, note]), keep: () => this.call('press.keep', [pressId]) };
          for (const cb of this.btnCbs) cb(press);
        }
        return;
      }
      const w = this.waiting.get(x.id);
      if (!w) return;
      this.waiting.delete(x.id); clearTimeout(w.timer);
      if (x.ok) w.ok(x.value); else w.no(new Error(x.error));
    });
    ws.on('close', () => {
      for (const [id, w] of this.waiting) { clearTimeout(w.timer); w.no(new Error('the MacBook front desk went away')); this.waiting.delete(id); }
      if (this.ws === ws) this.ws = null;
      if (!this.closed) setTimeout(() => this.connect(), this.o.retryMs ?? 5000).unref?.();
    });
    ws.on('error', () => { /* close follows */ });
  }

  private raw(o: object): void { if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(o)); }

  private call<T = any>(op: string, args: unknown[], ms = 30_000): Promise<T> {
    if (this.ws?.readyState !== WebSocket.OPEN) return Promise.reject(new Error('the MacBook front desk is not reachable'));
    const id = ++this.seq;
    return new Promise<T>((ok, no) => {
      const timer = setTimeout(() => { this.waiting.delete(id); no(new Error(`the front desk did not answer (${op})`)); }, ms);
      this.waiting.set(id, { ok, no, timer });
      this.raw({ id, op, args });
    });
  }

  onMessage(cb: (m: Incoming) => void): void { this.msgCbs.push(cb); }
  onButton(cb: (b: ButtonPress) => void): void { this.btnCbs.push(cb); }
  private readonly helloCbs: (() => void)[] = [];
  /** Every time the Mac's front desk (re)connects, e.g. after it was updated. */
  onHello(cb: () => void): void { this.helloCbs.push(cb); }
  private handledCb: ((items: import('./macbrain.ts').Handled[]) => Promise<void> | void) | null = null;
  /** M4: what the Mac answered or saved while this PC was off. */
  onHandled(cb: (items: import('./macbrain.ts').Handled[]) => Promise<void> | void): void { this.handledCb = cb; }
  /** M4: what the Mac needs to answer as Aang while this PC is off. True if the Mac took it. */
  macBrief(b: import('./macbrain.ts').MacBrief) { return this.call<boolean>('brief', [b]); }
  ensureLayout() { return this.call<Record<string, string>>('ensureLayout', [], 60_000); }
  send(channelId: string, msg: OutMsg) { return this.call<string>('send', [channelId, toWire(msg)], 60_000); }
  edit(channelId: string, messageId: string, msg: OutMsg) { return this.call<void>('edit', [channelId, messageId, toWire(msg)]); }
  pin(channelId: string, messageId: string) { return this.call<void>('pin', [channelId, messageId]); }
  createPost(forumId: string, title: string, content: string, tags: string[] = []) { return this.call<string>('createPost', [forumId, title, content, tags]); }
  channelList() { return this.call<import('./discord-logic.ts').ChannelInfo[]>('channelList', []); }
  createChannel(spec: { name: string; kind: 'category' | 'text' | 'forum'; parentId?: string | null; topic?: string; tags?: string[] }) { return this.call<string>('createChannel', [spec]); }
  editChannel(id: string, spec: { name?: string; parentId?: string | null; topic?: string; addTags?: string[] }) { return this.call<void>('editChannel', [id, spec]); }
  deleteChannel(id: string) { return this.call<void>('deleteChannel', [id]); }
  postsOf(forumId: string, limit: number) { return this.call<import('./discord.ts').PostInfo[]>('postsOf', [forumId, limit], 90_000); }
  startThread(channelId: string, messageId: string, name: string) { return this.call<string>('startThread', [channelId, messageId, name]); }
  setPostTags(postId: string, tags: string[]) { return this.call<void>('setPostTags', [postId, tags]); }
  async download(url: string) { return Buffer.from(await this.call<string>('download', [url], 90_000), 'base64'); }
  typing(channelId: string) { return this.call<void>('typing', [channelId]); }
  fetchSince(channelId: string, afterId: string | null, limit: number) { return this.call<Incoming[]>('fetchSince', [channelId, afterId, limit]); }
  permissions() { return this.call<string[]>('permissions', []); }
  close(): void { this.closed = true; try { this.ws?.close(); } catch { /* gone */ } }
}

export { fromWire };
