// The Mac's presence (2026-10-28, the Mac is Aang's home): what the pet tells the brain on the PC, read on the Mac by
// mac/presence.swift. This turns its readings into the brain's own two signals, the same ones the pet sends:
//   presence: which app is in front (so "never while Claude is in front" works) and quiet (his rule for the Mac:
//             full-screen video, a call, Focus mode, or the Shadow window in front -> mark only, the rest held);
//   desk:     at the Mac or away (5 minutes without a key or the mouse, or "brb" until he touches it again).
import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync } from 'node:fs';

import { AWAY_AFTER_S, Presence, atDesk as deskRule, busyWhy, readingOf, type PresenceOut, type Reading } from './attention.ts';

// 2026-10-30 (the attention engine): the rule itself lives in attention.ts, one rule for the Mac and the PC. This file
// only runs the helper and hands its readings on.
export interface MacReading { front: string; bundle: string; idle: number; mic: boolean; cam: boolean; full: boolean; focus: boolean | null }
export { AWAY_AFTER_S, type PresenceOut };

/** Why the Mac is quiet right now, or '' when it is not (attention.ts busyWhy). */
export function quietReason(r: MacReading): string { return busyWhy(r); }

/** At the Mac? (attention.ts atDesk.) */
export function atDesk(r: MacReading, now: number, awayFrom: number | null): boolean { return deskRule(r.idle, now, awayFrom); }

export function parseReading(line: string): MacReading | null {
  try {
    const j = JSON.parse(line);
    if (typeof j?.idle !== 'number') return null;
    const r = readingOf(j);
    return r ? { front: r.front, bundle: r.bundle ?? '', idle: r.idle ?? j.idle, mic: !!r.mic, cam: !!r.cam, full: !!r.full, focus: r.focus ?? null } : null;
  } catch { return null; }
}

/** Runs the helper and reports changes. Restarts it if it stops; gives up quietly if it cannot start at all. */
export class MacPresence {
  private child: ChildProcess | null = null;
  private stopped = false;
  private fails = 0;
  private readonly bin: string;
  private readonly rule: Presence;
  private readonly o: { presence: (p: PresenceOut) => void; desk: (active: boolean) => void; log?: (s: string) => void; now?: () => number; first?: () => void; missing?: (why: string) => void };
  constructor(bin: string, o: MacPresence['o']) {
    this.bin = bin; this.o = o;
    this.rule = new Presence({ presence: o.presence, desk: o.desk, ...(o.log ? { log: (s: string) => o.log!('mac ' + s) } : {}), ...(o.now ? { now: o.now } : {}), ...(o.first ? { first: o.first } : {}) });
  }

  start(): boolean {
    if (!existsSync(this.bin)) { const why = `no helper at ${this.bin}`; this.o.log?.(`mac presence: ${why}; Aang cannot tell when you are away or busy`); this.o.missing?.(why); return false; }
    this.spawn();
    return true;
  }

  private spawn(): void {
    if (this.stopped) return;
    const child = spawn(this.bin, [], { stdio: ['pipe', 'pipe', 'ignore'] });
    this.child = child;
    let buf = '';
    child.stdout!.on('data', d => {
      buf += String(d);
      for (let i = buf.indexOf('\n'); i >= 0; i = buf.indexOf('\n')) { const line = buf.slice(0, i); buf = buf.slice(i + 1); const r = parseReading(line); if (r) { this.fails = 0; this.rule.take(r as Reading); } }
    });
    child.on('error', e => this.o.log?.('mac presence: ' + e.message));
    child.on('exit', () => {
      this.child = null;
      if (this.stopped) return;
      // Back in 5 s, slower if it keeps dying, never a tight loop.
      const wait = Math.min(5 * 60_000, 5_000 * 2 ** Math.min(6, this.fails++));
      setTimeout(() => this.spawn(), wait).unref?.();
    });
  }

  /** "brb" or the Away key: away now; the first input after a few seconds' grace (the Enter that sent it) brings him back. */
  awaySet(): void { this.rule.awaySet(); }

  /** What it last saw, for "why are you quiet?" and the logs. */
  now(): MacReading | null { return this.rule.now() as MacReading | null; }

  stop(): void { this.stopped = true; try { this.child?.stdin?.end(); this.child?.kill(); } catch { /* gone */ } this.child = null; }
}
