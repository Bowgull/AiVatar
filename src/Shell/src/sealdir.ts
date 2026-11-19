// The secret window's folder, sealed (his rule, 2026-11-19: "its memory ONLY stored locally on my mac. It CANNOT leak").
//
// Everything the secret window keeps in <stateDir>/secret (its tabs and their kept copies, history, bookmarks, favicons,
// downloads list, stash, its own site rules) is written ENCRYPTED: AES-256-GCM with one random 32-byte key. That key
// lives in secret-key.json, itself sealed with the Mac's Keychain (Electron's safeStorage), and it is opened into memory
// only after his PIN was right (or his Mac password, to set a new PIN). Locked, the key is forgotten: nothing in the
// folder can be read, and a write that comes while locked is dropped rather than written in the clear.
//
// How it is enforced: atomic.ts and store.ts (the one way Samara writes and reads its files) ask the gates here. A file
// under a sealed folder is sealed on its way out and opened on its way in; any other file passes untouched.
//
// What this does NOT cover (said plainly in docs/SECRET-WINDOW.md): Chromium's own profile for the secret window
// (persist:aang-secret: cookies, site storage, cache) is not ours to encrypt file by file; FileVault is what protects it.
import { closeSync, existsSync, fsyncSync, openSync, readFileSync, readSync, readdirSync, renameSync, rmSync, statSync, writeSync } from 'node:fs';
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import path from 'node:path';
import { setWriteGate, writeFileAtomic } from './atomic.ts';
import { setReadGate } from './store.ts';

/** Every sealed file starts with this line, so a plain one (from before) is told apart. */
const MAGIC = Buffer.from('SAMARA-SEALED-1\n');
/** Top-level files that stay plain: the PIN's and the key's own seals (Keychain-sealed already) and the window's place. */
export const PLAIN = ['secret-pin.json', 'secret-made.json', 'secret-key.json', 'browser-window.json', 'browser-local.json'];

/** The Keychain, as far as this needs it. Tests give a stand-in. */
export interface Keychain { lock(s: string): string | null; open(b64: string): string | null }

export const isSealed = (b: Uint8Array): boolean => b.length >= MAGIC.length && Buffer.from(b.subarray(0, MAGIC.length)).equals(MAGIC);

export function sealBytes(key: Buffer, data: string | Uint8Array): Buffer {
  const iv = randomBytes(12), c = createCipheriv('aes-256-gcm', key, iv);
  const ct = Buffer.concat([c.update(typeof data === 'string' ? Buffer.from(data, 'utf8') : data), c.final()]);
  return Buffer.concat([MAGIC, iv, c.getAuthTag(), ct]);
}
export function openBytes(key: Buffer, b: Uint8Array): Buffer | null {
  if (!isSealed(b)) return null;
  try {
    const buf = Buffer.from(b), at = MAGIC.length;
    const d = createDecipheriv('aes-256-gcm', key, buf.subarray(at, at + 12));
    d.setAuthTag(buf.subarray(at + 12, at + 28));
    return Buffer.concat([d.update(buf.subarray(at + 28)), d.final()]);
  } catch { return null; }
}

/** Overwrite a file where it lies with random bytes, to the disk, before it goes (best effort: see the doc on SSDs). */
export function scrub(file: string): void {
  try {
    const n = statSync(file).size, fd = openSync(file, 'r+');
    try { for (let at = 0; at < n; at += 65536) writeSync(fd, randomBytes(Math.min(65536, n - at)), 0, Math.min(65536, n - at), at); fsyncSync(fd); } finally { closeSync(fd); }
  } catch { /* gone already */ }
}

export class SealedDir {
  readonly dir: string;
  private key: Buffer | null = null;
  private readonly keyFile: string;
  private readonly kc: Keychain;
  constructor(dir: string, kc: Keychain) {
    this.dir = path.resolve(dir); this.kc = kc; this.keyFile = path.join(this.dir, 'secret-key.json');
    for (const r of rooms) if (r.dir === this.dir) { r.close(); rooms.delete(r); }   // one keeper per folder
    rooms.add(this);
    setWriteGate(writeGate); setReadGate(readGate);
  }
  get isOpen(): boolean { return this.key !== null; }
  /** Is this file one of the sealed ones (inside the folder, and not one of the plain top-level few)? */
  holds(file: string): boolean {
    const rel = path.relative(this.dir, path.resolve(file));
    if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) return false;
    return !PLAIN.includes(rel);
  }
  /**
   * Open the folder (call only after his PIN, or his Mac password, said yes). The first time ever, a key is made and
   * sealed with the Keychain. 'keychain': the Keychain would not keep or open it; the folder stays shut.
   */
  open(): 'open' | 'keychain' {
    if (this.key) return 'open';
    let b64: string | null = null;
    if (existsSync(this.keyFile)) {
      try { const j = JSON.parse(readFileSync(this.keyFile, 'utf8')); b64 = typeof j?.sealed === 'string' ? this.kc.open(j.sealed) : null; } catch { b64 = null; }
      if (!b64) return 'keychain';
    } else {
      if (this.anySealed()) console.error('shell: secret: its key is missing; what was sealed before cannot be read');
      b64 = randomBytes(32).toString('base64');
      const sealed = this.kc.lock(b64);
      if (!sealed) return 'keychain';
      try { writeFileAtomic(this.keyFile, JSON.stringify({ v: 1, sealed }), { mode: 0o600 }); } catch { return 'keychain'; }
    }
    const k = Buffer.from(b64, 'base64');
    if (k.length !== 32) return 'keychain';
    this.key = k;
    this.moveIn();
    return 'open';
  }
  /** Locked: the key is forgotten. */
  close(): void { if (this.key) this.key.fill(0); this.key = null; }
  seal(data: string | Uint8Array): Buffer | null { return this.key ? sealBytes(this.key, data) : null; }
  unseal(b: Uint8Array): Buffer | null { return this.key ? openBytes(this.key, b) : null; }

  private files(dir = this.dir): string[] {
    const out: string[] = [];
    let names: string[] = [];
    try { names = readdirSync(dir); } catch { return out; }
    for (const n of names) {
      const f = path.join(dir, n);
      try { if (statSync(f).isDirectory()) out.push(...this.files(f)); else out.push(f); } catch { /* gone */ }
    }
    return out;
  }
  private anySealed(): boolean {
    return this.files().some((f) => {
      try { const fd = openSync(f, 'r'); try { const b = Buffer.alloc(MAGIC.length); return readSync(fd, b, 0, b.length, 0) === b.length && isSealed(b); } finally { closeSync(fd); } } catch { return false; }
    });
  }
  /**
   * Plain files from before (and torn ones) are sealed in place, and their plain copy is scrubbed and removed. Crash-safe:
   * the sealed copy is complete on disk (<file>.sealing) before the plain one is touched; a start after a crash finishes it.
   */
  moveIn(): number {
    if (!this.key) return 0;
    let n = 0;
    const all = this.files();
    // A move a crash cut short: its sealed copy is whole; finish it.
    for (const f of all.filter((x) => x.endsWith('.sealing'))) {
      const target = f.slice(0, -'.sealing'.length);
      try { if (existsSync(target) && !isSealed(readFileSync(target))) scrub(target); renameSync(f, target); n++; } catch { /* next time */ }
    }
    for (const f of this.files()) {
      if (!this.holds(f)) continue;
      // Half-written saves and half-made seals: whatever they hold goes.
      if (/\.tmp$|\.sealing\.part$/.test(f)) { scrub(f); try { rmSync(f, { force: true }); } catch { /* next time */ } continue; }
      let b: Buffer;
      try { b = readFileSync(f); } catch { continue; }
      if (isSealed(b)) continue;
      const part = f + '.sealing.part', done = f + '.sealing';
      try {
        const fd = openSync(part, 'w');
        try { const s = sealBytes(this.key, b); writeSync(fd, s, 0, s.length, 0); fsyncSync(fd); } finally { closeSync(fd); }
        renameSync(part, done);
        scrub(f);
        renameSync(done, f);
        n++;
      } catch (e) { console.error('shell: secret: a file was not sealed yet: ' + (e as Error).message); }
    }
    if (n) console.log(`shell: secret: ${n} plain file${n === 1 ? '' : 's'} sealed`);
    return n;
  }
}

const rooms = new Set<SealedDir>();
const roomOf = (file: string): SealedDir | null => { for (const r of rooms) if (r.holds(file)) return r; return null; };

/** atomic.ts asks this before every write: sealed for a sealed folder, nothing at all while it is locked. */
export function writeGate(file: string, data: string | Uint8Array): string | Uint8Array | null {
  const r = roomOf(file);
  return r ? r.seal(data) : data;
}
/** store.ts asks this on every read: opened for a sealed folder; while it is locked, nothing (as if it were missing). */
export function readGate(file: string, raw: Buffer): string | null {
  const r = roomOf(file);
  if (!r) return raw.toString('utf8');
  if (!r.isOpen) return null;
  if (isSealed(raw)) return r.unseal(raw)?.toString('utf8') ?? null;
  return raw.toString('utf8');                 // plain from before, read once while it is being moved in
}

/** The Mac's Keychain through Electron (safeStorage). */
export function electronKeychain(ss: Electron.SafeStorage): Keychain {
  return {
    lock: (s) => { try { return ss.isEncryptionAvailable() ? ss.encryptString(s).toString('base64') : null; } catch { return null; } },
    open: (b) => { try { return ss.decryptString(Buffer.from(b, 'base64')); } catch { return null; } },
  };
}
