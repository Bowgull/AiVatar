// The Shell's line to Aang's brain.
//
// It lives in the main process ON PURPOSE. The password is a header, and only a real program can set
// one; a page cannot, which is the whole point of the lock (step S1). Keeping the socket here also
// means no window ever holds it, so a page can never reach the brain even if something gets past the
// sandbox. Windows ask through a narrow set of messages instead.
//
// It reconnects forever, like the C# window does: the Core restarts several times a day on this
// machine and the windows must simply carry on.
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { WebSocket } from 'ws';

const TOKEN_HEADER = 'x-aang-token';

export interface LinkOptions {
  port: number;
  stateDir: string;
  /** Called with every message from the brain. */
  onMessage: (m: Record<string, unknown>) => void;
  /** Called when the line comes up or goes down, so windows can show it. */
  onConnected?: (up: boolean) => void;
}

export class CoreLink {
  private ws: WebSocket | null = null;
  private stopped = false;
  private pause = 500;
  /** True while the socket is open and the brain has been greeted. */
  connected = false;

  private readonly o: LinkOptions;

  constructor(o: LinkOptions) { this.o = o; }

  /** The password this run's Core wrote. Read fresh every attempt: each Core start writes a new one. */
  private token(): string | null {
    const f = path.join(this.o.stateDir, 'shell.token');
    try { return existsSync(f) ? (readFileSync(f, 'utf8').trim() || null) : null; }
    catch { return null; }
  }

  start(): void { this.stopped = false; this.connect(); }

  private connect(): void {
    if (this.stopped) return;
    const token = this.token();
    // No password yet means the Core has not started. Wait rather than connect without one: an
    // unlocked connection is exactly what the lock exists to prevent.
    if (!token) { this.retry(); return; }

    const ws = new WebSocket(`ws://127.0.0.1:${this.o.port}/body`, { headers: { [TOKEN_HEADER]: token } });
    this.ws = ws;

    ws.on('open', () => {
      this.pause = 500;
      this.connected = true;
      this.o.onConnected?.(true);
      this.send({ t: 'hello', v: 1, client: 'desktop', pid: process.pid });
    });
    ws.on('message', d => {
      // Nothing the brain sends may throw out of here and take the Shell with it.
      try { this.o.onMessage(JSON.parse(String(d))); }
      catch (e) { console.error('shell: bad message from the brain: ' + (e as Error).message); }
    });
    ws.on('close', () => this.down());
    ws.on('error', () => { /* the brain is restarting; the close handler retries */ });
  }

  private down(): void {
    if (!this.connected) { this.retry(); return; }
    this.connected = false;
    this.o.onConnected?.(false);
    this.retry();
  }

  /** Backs off to a few seconds, so a brain that is down does not spin the processor. */
  private retry(): void {
    if (this.stopped) return;
    const wait = this.pause;
    this.pause = Math.min(4000, this.pause * 2);
    setTimeout(() => this.connect(), wait).unref?.();
  }

  send(msg: Record<string, unknown>): boolean {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return false;
    this.ws.send(JSON.stringify(msg));
    return true;
  }

  stop(): void {
    this.stopped = true;
    try { this.ws?.close(); } catch { /* already gone */ }
    this.ws = null;
  }
}
