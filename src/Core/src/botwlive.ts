// BG8 (docs/BOTW-GUIDE.md): where Link is right now, while Cemu runs. The reading itself is AangReader --botw-pos
// (src/Reader/BotwPos.cs: ReadProcessMemory, read-only, once a second); this only starts it while Cemu runs and stops
// caring when Cemu closes. Output: %LOCALAPPDATA%\Aang\botw\pos.json, the contract in docs/BOTW-STATE.md.
//
// His rules: nothing at all while Cemu is closed; one small read a second while it runs; never a write into Cemu, never
// an injection or the debugger port, never a key. A wrong address fails safe: the reader removes pos.json, says why
// (logged here) and exits 3, and it is not started again until Cemu restarts.
import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { writeFileAtomic } from './atomic.ts';
import type { BotwPaths } from './botwwatch.ts';

/** How often the brain looks for Cemu (one tasklist call). Reading starts within this long of Cemu opening. */
export const LIVE_EVERY_MS = 20_000;
/** The reader's code for "the address gave nothing believable": not again until Cemu restarts. */
export const GAVE_UP = 3;

export interface BotwPos { v: 1; at: string; x: number; y: number; z: number; facing: number; live: boolean }
export const posFile = (p: BotwPaths): string => path.join(p.dir, 'pos.json');
export function readBotwPos(p: BotwPaths): BotwPos | null {
  try { const j = JSON.parse(readFileSync(posFile(p), 'utf8')) as BotwPos; return j?.v === 1 ? j : null; } catch { return null; }
}

export interface LiveDeps {
  reader: string;
  cemuRunning: () => Promise<boolean>;
  log: (line: string) => void;
  /** Tests pass a fake; the real one is child_process.spawn. */
  spawn?: (exe: string, args: string[]) => ChildProcess;
}

export class BotwLive {
  private p: BotwPaths;
  private d: LiveDeps;
  private child: ChildProcess | null = null;
  /** The reader gave up on this Cemu launch (wrong address): wait for Cemu to close before trying again. */
  private gaveUp = false;
  constructor(p: BotwPaths, d: LiveDeps) { this.p = p; this.d = d; }
  get reading(): boolean { return this.child !== null; }

  async tick(): Promise<void> {
    if (!existsSync(this.d.reader)) return;
    const running = await this.d.cemuRunning();
    if (!running) {
      this.gaveUp = false;
      // A reader killed with the brain can leave pos.json saying live: it is not.
      if (!this.child) { const pos = readBotwPos(this.p); if (pos?.live) writeFileAtomic(posFile(this.p), JSON.stringify({ ...pos, live: false })); }
      return;
    }
    if (this.child || this.gaveUp) return;
    const args = ['--botw-pos', '--out', posFile(this.p), '--parent', String(process.pid)];
    const child = (this.d.spawn ?? ((exe, a) => spawn(exe, a, { windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] })))(this.d.reader, args);
    this.child = child;
    let buf = '';
    child.stdout?.on('data', (b: Buffer) => {
      buf += b.toString('utf8');
      for (let i; (i = buf.indexOf('\n')) >= 0; buf = buf.slice(i + 1)) {
        try { const m = JSON.parse(buf.slice(0, i)) as { botw?: string; detail?: string }; if (m.botw) this.d.log(`botw live ${m.botw}: ${m.detail ?? ''}`); } catch { /* not ours */ }
      }
    });
    const done = (code: number | null) => {
      if (this.child !== child) return;
      this.child = null;
      if (code === GAVE_UP) this.gaveUp = true;
    };
    child.on('exit', done);
    child.on('error', e => { this.d.log(`botw live: could not start the reader (${e.message})`); done(GAVE_UP); });
  }

  stop(): void { try { this.child?.kill(); } catch { /* gone */ } this.child = null; }
}
