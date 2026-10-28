// The Mac's presence (2026-10-28, the Mac is Aang's home): what the pet tells the brain on the PC, read on the Mac by
// mac/presence.swift. This turns its readings into the brain's own two signals, the same ones the pet sends:
//   presence: which app is in front (so "never while Claude is in front" works) and quiet (his rule for the Mac:
//             full-screen video, a call, Focus mode, or the Shadow window in front -> mark only, the rest held);
//   desk:     at the Mac or away (5 minutes without a key or the mouse, or "brb" until he touches it again).
import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync } from 'node:fs';

export interface MacReading { front: string; bundle: string; idle: number; mic: boolean; cam: boolean; full: boolean; focus: boolean | null }

/** The same five minutes the pet uses (PetWindow.cs AwayAfter). */
export const AWAY_AFTER_S = 5 * 60;
/** The Shadow PC's stream: when it is in front he is on the PC, and the Mac keeps quiet (FINAL-AANG-BUILD M9). */
const SHADOW = /^com\.electron\.shadow$/i;

/** Why the Mac is quiet right now, or '' when it is not. */
export function quietReason(r: MacReading): string {
  if (r.mic || r.cam) return 'call';
  if (SHADOW.test(r.bundle) || /^shadow( pc)?$/i.test(r.front)) return 'shadow';
  if (r.full) return 'full screen';
  if (r.focus === true) return 'focus';
  return '';
}

/**
 * At the Mac? Away after AWAY_AFTER_S without input. After "brb" (awayFrom), away until input comes AFTER that moment:
 * idle time shorter than the time since then, exactly as the pet does it.
 */
export function atDesk(r: MacReading, now: number, awayFrom: number | null): boolean {
  // Inside the grace (the click or Enter that said it) he stays away; after it, only new input brings him back.
  if (awayFrom !== null && (now <= awayFrom || r.idle * 1000 >= now - awayFrom)) return false;
  return r.idle < AWAY_AFTER_S;
}

export function parseReading(line: string): MacReading | null {
  try {
    const j = JSON.parse(line);
    if (typeof j?.front !== 'string' || typeof j.idle !== 'number') return null;
    return { front: j.front.slice(0, 80), bundle: String(j.bundle ?? '').slice(0, 120), idle: j.idle, mic: j.mic === true, cam: j.cam === true, full: j.full === true, focus: typeof j.focus === 'boolean' ? j.focus : null };
  } catch { return null; }
}

export interface PresenceOut { foreground: string; quiet: boolean; /** the Shadow window is in front: he is on the PC */ shadow: boolean }

/** Runs the helper and reports changes. Restarts it if it stops; gives up quietly if it cannot start at all. */
export class MacPresence {
  private child: ChildProcess | null = null;
  private stopped = false;
  private awayFrom: number | null = null;
  private last: { fg: string; quiet: boolean; shadow: boolean; desk: boolean | null } = { fg: '', quiet: false, shadow: false, desk: null };
  private reading: MacReading | null = null;
  private fails = 0;
  private readonly bin: string;
  private readonly o: { presence: (p: PresenceOut) => void; desk: (active: boolean) => void; log?: (s: string) => void; now?: () => number };
  constructor(bin: string, o: MacPresence['o']) { this.bin = bin; this.o = o; }

  start(): boolean {
    if (!existsSync(this.bin)) { this.o.log?.(`mac presence: no helper at ${this.bin}; Aang cannot tell when you are away or busy`); return false; }
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
      for (let i = buf.indexOf('\n'); i >= 0; i = buf.indexOf('\n')) { const line = buf.slice(0, i); buf = buf.slice(i + 1); const r = parseReading(line); if (r) { this.fails = 0; this.take(r); } }
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

  private take(r: MacReading): void {
    this.reading = r;
    const now = (this.o.now ?? Date.now)();
    const fg = r.front, why = quietReason(r), quiet = why !== '', shadow = why === 'shadow';
    if (quiet !== this.last.quiet) this.o.log?.(quiet ? `mac presence: quiet (${quietReason(r)})` : 'mac presence: not quiet');
    if (fg !== this.last.fg || quiet !== this.last.quiet || shadow !== this.last.shadow) { this.last.fg = fg; this.last.quiet = quiet; this.last.shadow = shadow; this.o.presence({ foreground: fg, quiet, shadow }); }
    const desk = atDesk(r, now, this.awayFrom);
    if (desk && this.awayFrom !== null && now > this.awayFrom) this.awayFrom = null;   // he is back: brb is over
    if (desk !== this.last.desk) { this.last.desk = desk; this.o.log?.(desk ? 'mac presence: at the Mac' : 'mac presence: away'); this.o.desk(desk); }
  }

  /** "brb" or the Away key: away now; the first input after a few seconds' grace (the Enter that sent it) brings him back. */
  awaySet(): void {
    this.awayFrom = (this.o.now ?? Date.now)() + 4_000;
    if (this.last.desk !== false) { this.last.desk = false; this.o.log?.('mac presence: away (he said so)'); this.o.desk(false); }
  }

  /** What it last saw, for "why are you quiet?" and the logs. */
  now(): MacReading | null { return this.reading; }

  stop(): void { this.stopped = true; try { this.child?.stdin?.end(); this.child?.kill(); } catch { /* gone */ } this.child = null; }
}
