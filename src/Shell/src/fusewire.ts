// Samara's engine switches ("fuses", security plan 2026-10-14). Electron keeps a few on/off switches inside its own
// program file, read once at start: they cannot be changed by anything running later. Samara turns on the login lock
// (cookies encrypted with the computer's own lock: Keychain on the Mac, Windows' on the PC) and turns off the ways
// another program could use Samara's engine to run hidden code (as plain Node, or through NODE_OPTIONS or a debugger).
//
// The same small, dependency-free code runs on both machines: the PC while it prepares an engine, the Mac's update
// script with Aang's own Node (`node fusewire.ts <file> <wire>`). It does exactly what Electron's @electron/fuses
// does (the layout is Electron's, version 1): find the sentinel, check the wire version, set bytes '1' or '0'.
import { readFileSync, writeFileSync } from 'node:fs';

export const SENTINEL = 'dL7pKGdnNz796PbbjQWNKmHXBZaB9tsX';
/** Electron's fuse order (FuseV1Options). */
export const FUSE = { RunAsNode: 0, EnableCookieEncryption: 1, EnableNodeOptionsEnvironmentVariable: 2, EnableNodeCliInspectArguments: 3 } as const;
const ON = 0x31, OFF = 0x30, REMOVED = 0x72;

/** What Samara sets. `lock`: the login lock; `closeBackdoors`: no running as Node, no NODE_OPTIONS, no inspector. */
export function samaraFuses(o: { lock: boolean; closeBackdoors: boolean }): Record<number, boolean> {
  const f: Record<number, boolean> = { [FUSE.EnableCookieEncryption]: o.lock };
  if (o.closeBackdoors) Object.assign(f, { [FUSE.RunAsNode]: false, [FUSE.EnableNodeOptionsEnvironmentVariable]: false, [FUSE.EnableNodeCliInspectArguments]: false });
  return f;
}

/** Set fuses in an engine's program file (electron.exe, or the Mac's "Electron Framework"). Every copy of the wire
 *  is set (a universal Mac binary has two). Returns the wire as it is now. */
export function setFuses(file: string, want: Record<number, boolean>): string {
  const bin = readFileSync(file);
  const marks: number[] = [];
  for (let at = bin.indexOf(SENTINEL); at !== -1; at = bin.indexOf(SENTINEL, at + 1)) marks.push(at);
  if (!marks.length) throw new Error('no fuse wire in ' + file);
  for (const m of marks) {
    const pos = m + SENTINEL.length;
    if (bin[pos] !== 1) throw new Error(`fuse wire version ${bin[pos]}, expected 1`);
    const len = bin[pos + 1]!;
    for (const [k, v] of Object.entries(want)) {
      const i = Number(k);
      if (i >= len) throw new Error(`this engine has no fuse ${i}`);
      if (bin[pos + 2 + i] === REMOVED) continue;
      bin[pos + 2 + i] = v ? ON : OFF;
    }
  }
  writeFileSync(file, bin);
  return readFuses(file);
}
/** The wire as text, "0101..." ('r' for a removed fuse). */
export function readFuses(file: string): string {
  const bin = readFileSync(file), at = bin.indexOf(SENTINEL);
  if (at === -1) throw new Error('no fuse wire in ' + file);
  const pos = at + SENTINEL.length, len = bin[pos + 1]!;
  return [...bin.subarray(pos + 2, pos + 2 + len)].map((b) => (b === ON ? '1' : b === OFF ? '0' : b === REMOVED ? 'r' : '?')).join('');
}

// From the Mac's update script: node fusewire.ts <file> '{"lock":true,"closeBackdoors":true}'
if (process.argv[1] && /fusewire\.ts$/.test(process.argv[1]) && process.argv[2]) {
  const o = JSON.parse(process.argv[3] ?? '{}');
  console.log(setFuses(process.argv[2], samaraFuses({ lock: o.lock !== false, closeBackdoors: o.closeBackdoors !== false })));
}
