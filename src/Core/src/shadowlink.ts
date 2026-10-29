// The handshake (2026-10-29, his "once Shadow is up there's some sort of handshake and they start working together").
//
// The Mac's brain writes Aang's notices with Claude's quick model, which costs a little quota. Shadow has Qwen, which is
// free. So while Shadow is on, the Mac asks Shadow's brain to write them (its POST /write door, hooks.ts), and the
// moment Shadow goes quiet the Mac writes them itself again. Nothing else crosses: the facts and the voice go over,
// one line comes back.
//
// What it needs was put on the Mac when it was first set up (macsetup.ts): Shadow's Tailscale address and the hook key,
// in files only he can read. The heartbeat (GET /alive, every minute) says whether Shadow is up.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import type { Writer } from './messages.ts';

export interface ShadowAt { url: string; key: string }

/** Shadow's door and key from the Mac's setup files, or null when this machine was never set up for it. */
export function readShadowAt(dir = path.join(os.homedir(), 'Library', 'Application Support', 'AangListener')): ShadowAt | null {
  try {
    const curl = readFileSync(path.join(dir, 'alive.curl'), 'utf8');
    const url = /url\s*=\s*"(http:\/\/[^"]+)\/alive"/.exec(curl)?.[1];
    const key = readFileSync(path.join(dir, 'hook.key'), 'utf8').trim();
    return url && key ? { url, key } : null;
  } catch { return null; }
}

export class ShadowLink {
  private readonly at: ShadowAt;
  private readonly fetchImpl: typeof fetch;
  private ok = false;
  private timer: NodeJS.Timeout | null = null;
  /** Said once each way, so the log shows when they started and stopped working together. */
  private readonly log: (s: string) => void;
  constructor(at: ShadowAt, o: { fetch?: typeof fetch; log?: (s: string) => void } = {}) {
    this.at = at; this.fetchImpl = o.fetch ?? fetch; this.log = o.log ?? (() => {});
  }

  /** Shadow answered the last heartbeat. */
  up(): boolean { return this.ok; }

  /** Every minute, and once now. */
  start(everyMs = 60_000): void {
    void this.beat();
    this.timer = setInterval(() => void this.beat(), everyMs);
    this.timer.unref?.();
  }
  stop(): void { if (this.timer) clearInterval(this.timer); this.timer = null; }

  async beat(): Promise<boolean> {
    let now = false;
    try {
      const r = await this.fetchImpl(this.at.url + '/alive', { headers: { 'x-aang-key': this.at.key }, signal: AbortSignal.timeout(4000) });
      now = r.ok && (await r.json() as { up?: unknown })?.up === true;
    } catch { now = false; }
    if (now !== this.ok) this.log(now ? 'shadow: up, it writes the notices now' : 'shadow: gone, the Mac writes the notices');
    this.ok = now;
    return now;
  }

  /** The writer the message engine uses while Shadow is up. A failed write marks Shadow down until the next beat. */
  readonly write: Writer = async (prompt, o) => {
    try {
      const r = await this.fetchImpl(this.at.url + '/write', {
        method: 'POST', headers: { 'x-aang-key': this.at.key, 'content-type': 'application/json' },
        body: JSON.stringify({ prompt, system: o.system, maxTokens: o.maxTokens }), signal: AbortSignal.timeout(o.timeoutMs),
      });
      if (!r.ok) { this.ok = false; return { ok: false, text: '' }; }
      const j = await r.json() as { ok?: unknown; text?: unknown };
      return { ok: j.ok === true, text: typeof j.text === 'string' ? j.text : '' };
    } catch { this.ok = false; return { ok: false, text: '' }; }
  };
}
