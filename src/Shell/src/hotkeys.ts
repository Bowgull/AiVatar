// Sheet 61 v2 (2026-10-22): every key Aang listens for, in one list, in his right-click menu, to see and change.
// His note: "just a click might happen by accident, have it on hold click", so a row is changed by pressing and HOLDING
// it (aangmenu.js), then it listens for the new keys. This file is the part that decides: what a key may be, whether
// it is already ours, and whether Windows will give it to us; and it holds them all, live, with no restart.
//
// Kept apart from Electron (the keyboard is handed in as `Shortcuts`) so the rules are tested without ever taking a
// real key on his machine.
//
// Where they live: hotkeys.json in the Shell's state folder. The pop-out's key keeps its own old file too
// (popout-hotkey.json, hotkey.ts), because the Mac reads it from there. They do not sync to the Mac: Samara's sync
// (bsync.ts) carries the browser's settings, and these are the PC's keyboard (number pad, Ctrl), not Samara's.
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { reportWriteFailure, writeFileAtomic } from './atomic.ts';

// hotkey.ts's own two (it imports Electron, which a plain test cannot load): the pop-out's default and its file.
const POPOUT_DEFAULT = 'Control+Shift+V';
const popoutFile = (stateDir: string) => path.join(stateDir, 'popout-hotkey.json');

/** The keys he can change. */
export type KeyId = 'talk' | 'snip' | 'popout' | 'note' | 'pin';
export const KEY_IDS: KeyId[] = ['talk', 'snip', 'popout', 'note', 'pin'];

/** Each key as the sheet lists it. `aang`: taken only while Aang runs; `when`: only while something is up. */
export const KEYS: Record<KeyId, { label: string; def: string; group: 'any' | 'up'; fresh?: boolean }> = {
  talk: { label: 'Talk to Aang', def: 'Control+=', group: 'any' },
  snip: { label: 'Snip', def: 'Control+Shift+=', group: 'any' },
  popout: { label: 'Show / hide the pop-out', def: POPOUT_DEFAULT, group: 'any' },
  // His interview (2026-10-22): Ctrl + the number pad *, free on Windows and in his WoW bindings.
  note: { label: 'Quick note', def: 'Control+nummult', group: 'any', fresh: true },
  pin: { label: 'Pin what is under the mouse', def: 'Control+Alt+P', group: 'up' },
};
/** Held only while his bubble is up (main.ts watchBusy), so they are shown, greyed, and never changed. */
export const FIXED = [
  { label: 'Copy his line (mouse on the bubble)', acc: 'Control+C' },
  { label: 'Close the bubble', acc: 'Escape' },
];

// ---------------------------------------------------------------- what a key may be

const MODS = ['Control', 'Alt', 'Shift'] as const;
const KEY_TOKENS = new Set([
  ...'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'.split(''),
  ...Array.from({ length: 24 }, (_, i) => 'F' + (i + 1)),
  '=', '-', '[', ']', ';', "'", ',', '.', '/', '\\', '`',
  'Space', 'Insert', 'Delete', 'Home', 'End', 'PageUp', 'PageDown', 'Up', 'Down', 'Left', 'Right',
  ...Array.from({ length: 10 }, (_, i) => 'num' + i), 'numadd', 'numsub', 'nummult', 'numdiv', 'numdec',
]);
/**
 * Never his: what Windows keeps for itself (Alt+F4, Alt+Tab, Alt+Space, Ctrl+Alt+Del, screen rotation), and the keys
 * he uses everywhere (copy, paste, cut, undo, redo, select all, save, find), which a global key would steal from every
 * program. The Win key is refused before this (no Super / Meta at all).
 */
const NEVER = new Set(['Alt+F4', 'Alt+Space', 'Control+Alt+Delete', 'Control+Alt+Up', 'Control+Alt+Down', 'Control+Alt+Left', 'Control+Alt+Right',
  'Control+A', 'Control+C', 'Control+V', 'Control+X', 'Control+Z', 'Control+Y', 'Control+S', 'Control+F', 'Control+Shift+Z',
  'Control+Insert', 'Shift+Insert', 'Shift+Delete']);

export type Check = { ok: true; acc: string } | { ok: false; why: string };

/**
 * One key combination, as the menu page sends it, made tidy (Control, Alt, Shift, then the key) or refused. At least Ctrl
 * or Alt: a bare key, or Shift with a letter, would take that key from every program he types in.
 */
export function validAccelerator(raw: unknown): Check {
  if (typeof raw !== 'string' || !raw || raw.length > 48) return { ok: false, why: 'That is not a key.' };
  const parts = raw.split('+');
  // '=' is fine, but a '+' key would split into empties: Electron spells it "Plus"; the menu sends '=' or numadd.
  if (parts.some((p) => !p)) return { ok: false, why: 'That is not a key.' };
  const mods = new Set<string>();
  let key = '';
  for (const p0 of parts) {
    const p = p0 === 'Ctrl' || p0 === 'CommandOrControl' || p0 === 'CmdOrCtrl' ? 'Control' : p0 === 'Plus' ? '=' : p0;
    if ((MODS as readonly string[]).includes(p)) { if (mods.has(p) || key) return { ok: false, why: 'That is not a key.' }; mods.add(p); continue; }
    if (/^(Super|Meta|Command|Cmd|Win|AltGr|Option)$/i.test(p)) return { ok: false, why: 'Windows keeps the Win key for itself.' };
    if (key) return { ok: false, why: 'One key with Ctrl, Alt or Shift, not two.' };
    const t = /^[a-z]$/.test(p) ? p.toUpperCase() : /^f\d{1,2}$/.test(p) ? p.toUpperCase() : p;
    if (!KEY_TOKENS.has(t)) return { ok: false, why: p === 'Escape' || p === 'Tab' ? 'Windows and every program need that key.' : 'Aang cannot hold that key.' };
    key = t;
  }
  if (!key) return { ok: false, why: 'Press a key with Ctrl or Alt, not only Ctrl or Alt.' };
  if (!mods.has('Control') && !mods.has('Alt')) return { ok: false, why: 'Hold Ctrl or Alt with it, so the key still types everywhere else.' };
  const acc = [...MODS.filter((m) => mods.has(m)), key].join('+');
  if (NEVER.has(acc)) return { ok: false, why: `${words(acc)} belongs to Windows and every program, so Aang leaves it alone.` };
  return { ok: true, acc };
}

/** The + keys work on the number pad too (the sheet's note): one choice holds both. */
export function twins(acc: string): string[] {
  const i = acc.lastIndexOf('+') + 1, mods = acc.slice(0, i), key = acc.slice(i);
  if (key === '=' || key === 'numadd') return [mods + '=', mods + 'numadd'];
  return [acc];
}

const SHOW: Record<string, string> = { Control: 'CTRL', '=': '+', numadd: '+', numsub: '-', nummult: '*', numdiv: '/', numdec: '.', Escape: 'ESC', Space: 'SPACE', PageUp: 'PG UP', PageDown: 'PG DN', Delete: 'DEL', Insert: 'INS' };
/** The keycaps the menu draws: Control+Shift+= is CTRL, SHIFT, +. */
export function chips(acc: string): string[] {
  const i = acc.lastIndexOf('+') + 1, mods = i ? acc.slice(0, i - 1).split('+') : [], key = acc.slice(i);
  return [...mods, key].map((k) => SHOW[k] ?? (/^num\d$/.test(k) ? k.slice(3) : k.toUpperCase()));
}
/** As he says it: "Ctrl + Shift + V". */
export function words(acc: string): string {
  return chips(acc).map((c) => (c.length > 1 && /^[A-Z ]+$/.test(c) && !/^F\d+$/.test(c) ? c[0] + c.slice(1).toLowerCase() : c)).join(' + ');
}

/** Another of ours already holds it (the pad twins and the fixed keys count). Null when it is free. */
export function ourClash(id: KeyId, acc: string, now: Record<KeyId, string>): string | null {
  const mine = new Set(twins(acc));
  for (const k of KEY_IDS) if (k !== id && twins(now[k]).some((a) => mine.has(a))) return KEYS[k].label;
  for (const f of FIXED) if (mine.has(f.acc)) return f.label;
  return null;
}

// ---------------------------------------------------------------- where he keeps them

export const keysFile = (stateDir: string) => path.join(stateDir, 'hotkeys.json');

export function readKeys(stateDir: string): Record<KeyId, string> {
  const out = Object.fromEntries(KEY_IDS.map((k) => [k, KEYS[k].def])) as Record<KeyId, string>;
  try {
    const f = keysFile(stateDir);
    const j = existsSync(f) ? JSON.parse(readFileSync(f, 'utf8').replace(/^﻿/, '')) : {};
    for (const k of KEY_IDS) { const v = validAccelerator(j?.[k]); if (v.ok) out[k] = v.acc; }
  } catch { /* a mangled file means the defaults, never no keys */ }
  // The pop-out's key has lived in its own file since sheet 4; that one wins.
  try {
    const f = popoutFile(stateDir);
    if (existsSync(f)) { const v = validAccelerator(JSON.parse(readFileSync(f, 'utf8')).hotkey); if (v.ok) out.popout = v.acc; }
  } catch { /* the default */ }
  // Two the same (a hand-edited file): the later one goes back to its default.
  for (const k of KEY_IDS) if (ourClash(k, out[k], out) && out[k] !== KEYS[k].def) out[k] = KEYS[k].def;
  return out;
}

export function writeKeys(stateDir: string, keys: Record<KeyId, string>): void {
  for (const [f, data] of [[keysFile(stateDir), keys], [popoutFile(stateDir), { hotkey: keys.popout }]] as const) {
    try { writeFileAtomic(f, JSON.stringify(data, null, 2)); } catch (e) { reportWriteFailure(f, e); }
  }
}

// ---------------------------------------------------------------- holding them

/** The part of Electron's globalShortcut this uses; the tests hand in a pretend one. */
export interface Shortcuts { register(acc: string, fn: () => void): boolean; unregister(acc: string): void }

/** What the menu shows: every row, in the sheet's order. */
export interface KeyRow { id?: KeyId; label: string; acc: string; chips: string[]; words: string; group: 'any' | 'up'; fresh?: boolean; fixed?: boolean }

export type Change = { ok: true } | { ok: false; why: 'bad'; say: string } | { ok: false; why: 'ours'; by: string } | { ok: false; why: 'taken' };

/**
 * Every key, held while it is wanted. Aang's own keys (talk, snip, quick note) only while he runs; the pop-out's always;
 * the pin only while something is up. While the menu listens for a new key, all of ours are let go, so the keys he
 * presses reach the menu instead of firing.
 */
export class HotkeyKeeper {
  private now: Record<KeyId, string>;
  private readonly held = new Map<KeyId, string[]>();
  private readonly wanted = new Set<KeyId>();
  private paused = false;
  private readonly stateDir: string;
  private readonly gs: Shortcuts;
  private readonly act: Record<KeyId, () => void>;
  constructor(stateDir: string, gs: Shortcuts, act: Record<KeyId, () => void>) {
    this.stateDir = stateDir; this.gs = gs; this.act = act;
    this.now = readKeys(stateDir);
  }

  get keys(): Record<KeyId, string> { return { ...this.now }; }

  /** Take (or let go of) one key, as what is up changes. Cheap to call often. */
  want(id: KeyId, on: boolean): void {
    if (on) this.wanted.add(id); else this.wanted.delete(id);
    this.sync(id);
  }

  /** The menu is listening for new keys: let all of ours go until it is done. */
  pause(on: boolean): void {
    if (this.paused === on) return;
    this.paused = on;
    for (const k of KEY_IDS) this.sync(k);
  }

  private sync(id: KeyId): void {
    const should = this.wanted.has(id) && !this.paused;
    if (should && !this.held.has(id)) { const got = this.take(id, this.now[id]); if (!got) console.error(`shell: could not take ${words(this.now[id])} for ${KEYS[id].label}; another program has it`); }
    else if (!should && this.held.has(id)) this.drop(id);
  }

  /** Both pad twins or neither. */
  private take(id: KeyId, acc: string): boolean {
    const got: string[] = [];
    for (const a of twins(acc)) {
      let ok = false;
      try { ok = this.gs.register(a, () => this.act[id]()); } catch { ok = false; }
      // Ctrl + the number pad + is "best effort", as the pet always had it: the main key is what counts.
      if (ok) got.push(a); else if (a === twins(acc)[0]) { for (const g of got) this.gs.unregister(g); return false; }
    }
    this.held.set(id, got);
    return true;
  }
  private drop(id: KeyId): void {
    for (const a of this.held.get(id) ?? []) { try { this.gs.unregister(a); } catch { /* gone */ } }
    this.held.delete(id);
  }

  /**
   * He pressed new keys for a row. Refused when the keys are not allowed, are another of ours, or Windows will not give
   * them (another program holds them): then the old key stays, held as before. Otherwise kept and held at once.
   */
  change(id: unknown, raw: unknown): Change {
    if (typeof id !== 'string' || !KEY_IDS.includes(id as KeyId)) return { ok: false, why: 'bad', say: 'That is not one of Aang’s keys.' };
    const k = id as KeyId;
    const v = validAccelerator(raw);
    if (!v.ok) return { ok: false, why: 'bad', say: v.why };
    if (v.acc === this.now[k] || twins(this.now[k]).includes(v.acc)) return { ok: true };
    const by = ourClash(k, v.acc, this.now);
    if (by) return { ok: false, why: 'ours', by };
    const was = this.now[k], had = this.held.has(k);
    if (had) this.drop(k);
    // The only honest test of "does another program have it" is asking Windows for it.
    if (!this.take(k, v.acc)) { if (had) this.take(k, was); return { ok: false, why: 'taken' }; }
    if (!this.wanted.has(k) || this.paused) this.drop(k);
    this.now[k] = v.acc;
    writeKeys(this.stateDir, this.now);
    return { ok: true };
  }

  /** "Put them all back to the defaults": each one that Windows gives back; any it will not keeps his. */
  reset(): string[] {
    // Two passes: two that swapped (Snip on Talk's old key, say) clash until the first has let go.
    for (let pass = 0; pass < 2; pass++) for (const k of KEY_IDS) if (this.now[k] !== KEYS[k].def) this.change(k, KEYS[k].def);
    return KEY_IDS.filter((k) => this.now[k] !== KEYS[k].def).map((k) => KEYS[k].label);
  }

  /** Every row the menu shows, his choices filled in. */
  list(): KeyRow[] {
    // The Mac (his call, 2026-10-28): no Snip, the pop-out key is Samara's own, and the bubble's Ctrl+C is not wired.
    const mac = process.platform === 'darwin';
    const rows: KeyRow[] = KEY_IDS.filter((k) => !(mac && (k === 'snip' || k === 'popout'))).map((k) => ({ id: k, label: KEYS[k].label, acc: this.now[k], chips: chips(this.now[k]), words: words(this.now[k]), group: KEYS[k].group, ...(KEYS[k].fresh ? { fresh: true } : {}) }));
    return [...rows, ...FIXED.filter((f) => !(mac && f.acc === 'Control+C')).map((f) => ({ label: f.label, acc: f.acc, chips: chips(f.acc), words: words(f.acc), group: 'up' as const, fixed: true }))];
  }

  /** Quitting: let everything go. */
  releaseAll(): void { for (const k of [...this.held.keys()]) this.drop(k); }
}
