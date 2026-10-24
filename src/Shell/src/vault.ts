// 6.23: his logins, from his own Bitwarden vault, filled only when he clicks the key (his picks, 2026-10-12).
//
// SAFETY, the whole design:
//  - Bitwarden's own signed command-line tool does the vault work (bw.exe, installed by hand, official release).
//    He signs in to it once himself ("bw login" in a terminal); Aang never types or sees that sign-in.
//  - Unlocking: he types his master password into the browser FRAME (Aang's own page, never a website). It goes
//    from there to this file and into bw's environment for one call, and is dropped. It never reaches the brain,
//    a log, a file or a web page. The session key bw gives back lives only in this process's memory, is passed to
//    bw by environment (never on a command line, which other programs can read), and is forgotten 30 minutes
//    after the last fill (his pick), when the browser closes, or when he locks it.
//  - Nothing fills by itself. He clicks the key; if the site has several logins, he picks one.
//  - The page only ever receives the two values it asked for, written into the form by a script running in an
//    isolated world the page cannot see into. Nothing is submitted for him.
import { execFile, spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// M6: on the Mac, the same official tool, put by the Mac setup in Aang's own folder.
export const BW = process.env.AANG_TEST_BW ? process.env.AANG_TEST_BW : process.platform === 'darwin'
  ? path.join(os.homedir(), 'Library', 'Application Support', 'AangListener', 'bw', 'bw')
  : path.join(process.env.LOCALAPPDATA ?? '', 'Programs', 'BitwardenCLI', 'bw.exe');
/** How he signs in to it once, himself, on this machine. */
export const BW_LOGIN = process.platform === 'darwin'
  ? 'in Terminal run  "$HOME/Library/Application Support/AangListener/bw/bw" login'
  : 'in PowerShell run  & "$env:LOCALAPPDATA\\Programs\\BitwardenCLI\\bw.exe" login';
// Locks itself after this long with no fills; he picks it in Settings (sheet 83: 5 min, 30 min, 2 hours, until he quits).
export const LOCK_AFTER: Record<string, number | null> = { '5m': 5 * 60_000, '30m': 30 * 60_000, '2h': 2 * 3600_000, quit: null };

export interface Login { id: string; name: string; username: string }
export type VaultState = 'missing' | 'signed-out' | 'locked' | 'unlocked';

/** Run bw with extra environment only. Never with a secret on the command line. */
function bw(args: string[], env: Record<string, string> = {}, timeout = 30_000): Promise<{ ok: boolean; out: string }> {
  return new Promise((resolve) => {
    execFile(BW, args, { env: { ...process.env, ...env, BW_NOINTERACTION: 'true' }, timeout, windowsHide: true, maxBuffer: 32 * 1024 * 1024 },
      (err, stdout) => resolve({ ok: !err, out: String(stdout ?? '') }));
  });
}

export class Vault {
  private session: string | null = null;
  private timer: NodeJS.Timeout | null = null;
  /** Autofill's PIN (sheet 77, 2026-10-23): while one is set, locking only forgets the session here (the PIN opens its
   *  sealed copy again); without one, locking also locks Bitwarden's tool, as before. */
  keepSealed: () => boolean = () => false;
  /** How long with no fills before it locks itself; null: only when the browser closes. */
  lockAfterMs: number | null = LOCK_AFTER['30m'];
  /** The session, for sealing it under his PIN, and nothing else. */
  current(): string | null { return this.session; }
  /** A session opened with his PIN: kept only if Bitwarden's tool still takes it. */
  async useSession(key: string): Promise<boolean> {
    if (!/^[A-Za-z0-9+/=_-]{20,}$/.test(key) || !existsSync(BW)) return false;
    const r = await bw(['status'], { BW_SESSION: key });
    try { if (JSON.parse(r.out).status !== 'unlocked') return false; } catch { return false; }
    this.session = key; this.known = 'unlocked'; this.touch();
    void bw(['sync'], { BW_SESSION: key }, 60_000);
    return true;
  }
  /** A new login, after he looked at it and said Save. The secrets go to the tool on its stdin, never its command line. */
  async create(site: string, username: string, password: string): Promise<boolean> {
    if (!this.session || !site || !password) return false;
    const item = { type: 1, name: site.slice(0, 120), notes: null, favorite: false, fields: [], secureNote: null, card: null, identity: null, reprompt: 0,
      login: { username: username.slice(0, 200), password: password.slice(0, 500), totp: null, uris: [{ match: null, uri: 'https://' + site }] } };
    const encoded = Buffer.from(JSON.stringify(item)).toString('base64');
    const ok = await new Promise<boolean>((resolve) => {
      const c = spawn(BW, ['create', 'item'], { env: { ...process.env, BW_SESSION: this.session!, BW_NOINTERACTION: 'true' }, windowsHide: true });
      const t = setTimeout(() => { try { c.kill(); } catch { /* gone */ } resolve(false); }, 30_000);
      c.on('error', () => { clearTimeout(t); resolve(false); });
      c.on('exit', (code) => { clearTimeout(t); resolve(code === 0); });
      c.stdin.end(encoded);
    });
    if (ok) this.touch();
    return ok;
  }

  /** The last answer state() gave, for drawing a page without waiting on Bitwarden (2 seconds or more). */
  known: VaultState = 'locked';
  async state(): Promise<VaultState> { return (this.known = await this.check()); }
  private async check(): Promise<VaultState> {
    if (!existsSync(BW)) return 'missing';
    const r = await bw(['status'], this.session ? { BW_SESSION: this.session } : {});
    try {
      const s = JSON.parse(r.out).status;
      if (s === 'unauthenticated') { this.forget(); return 'signed-out'; }
      if (s === 'unlocked' && this.session) return 'unlocked';
      return 'locked';
    } catch { return 'locked'; }
  }

  /** His master password, used once and dropped. True when the vault opened. */
  async unlock(password: string): Promise<boolean> {
    if (!password || !existsSync(BW)) return false;
    const r = await bw(['unlock', '--passwordenv', 'AANG_BW_UNLOCK', '--raw'], { AANG_BW_UNLOCK: password });
    const key = r.out.trim();
    if (!r.ok || !/^[A-Za-z0-9+/=_-]{20,}$/.test(key)) return false;
    this.session = key;
    this.touch();
    void bw(['sync'], { BW_SESSION: key }, 60_000);           // the newest copy of his vault, quietly
    return true;
  }

  /** The logins saved for this site: names and usernames only. Passwords stay here until he picks one. */
  async loginsFor(url: string): Promise<Login[] | null> {
    if (!this.session) return null;
    let here = '';
    try { here = new URL(url).hostname.toLowerCase().replace(/^www\./, ''); } catch { return null; }
    const r = await bw(['list', 'items', '--url', url], { BW_SESSION: this.session });
    if (!r.ok) return null;
    try {
      const items = JSON.parse(r.out) as { id: string; name: string; type: number; login?: { username?: string; uris?: { uri?: string }[] } }[];
      // Bitwarden matches a whole domain (a login for example.com also answers forum.example.com); here a login is only
      // for the exact site it was saved for, with or without www (security check 2026-10-24, finding 3).
      const exact = (i: (typeof items)[number]) => (i.login?.uris ?? []).some((u) => {
        try { return new URL(/^[a-z]+:\/\//i.test(u.uri ?? '') ? u.uri! : 'https://' + u.uri).hostname.toLowerCase().replace(/^www\./, '') === here; } catch { return false; }
      });
      return items.filter((i) => i.type === 1 && typeof i.id === 'string' && exact(i)).slice(0, 20)
        .map((i) => ({ id: i.id, name: String(i.name ?? '').slice(0, 80), username: String(i.login?.username ?? '').slice(0, 120) }));
    } catch { return null; }
  }

  /** Every site he has a login for (host names only), so the key can glow without unlocking. */
  async loginHosts(): Promise<string[] | null> {
    if (!this.session) return null;
    const r = await bw(['list', 'items'], { BW_SESSION: this.session }, 60_000);
    if (!r.ok) return null;
    try {
      const out = new Set<string>();
      for (const i of JSON.parse(r.out) as { type: number; login?: { uris?: { uri?: string }[] } }[]) {
        if (i.type !== 1) continue;
        for (const u of i.login?.uris ?? []) {
          try { const h = new URL(/^[a-z]+:\/\//i.test(u.uri ?? '') ? u.uri! : 'https://' + u.uri).hostname.replace(/^www\./, ''); if (h) out.add(h); } catch { /* not an address */ }
        }
      }
      return [...out];
    } catch { return null; }
  }

  /** One login's username and password, for one fill. */
  /** `keepOpen`: a fill he asked for counts as use (the lock timer starts again); Samara's own checks do not (finding 4). */
  async secret(id: string, keepOpen = true): Promise<{ username: string; password: string } | null> {
    if (!this.session || !/^[0-9a-f-]{36}$/i.test(id)) return null;
    const r = await bw(['get', 'item', id], { BW_SESSION: this.session });
    if (!r.ok) return null;
    try {
      const i = JSON.parse(r.out);
      if (keepOpen) this.touch();
      return { username: String(i.login?.username ?? ''), password: String(i.login?.password ?? '') };
    } catch { return null; }
  }

  /** A while after the last fill (his pick), it locks itself (with a PIN set, only here: the PIN opens it again). */
  private touch(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = this.lockAfterMs === null ? null : setTimeout(() => this.lock(), this.lockAfterMs);
  }
  /** His new pick, counted from now while it is open. */
  setLockAfter(ms: number | null): void { this.lockAfterMs = ms; if (this.session) this.touch(); }
  /** Signed out of Bitwarden on this computer (his Sign out): signing in again is his, in Terminal. */
  async signOut(): Promise<void> {
    this.forget();
    this.known = 'signed-out';
    if (existsSync(BW)) await bw(['logout']);
  }
  /** Locked for good: Bitwarden's own tool too, PIN or not (his Lock now, or five wrong PINs). */
  lockHard(): void {
    const had = this.session;
    this.forget();
    this.known = 'locked';
    // Even with no session here (forgotten after 30 minutes): the tool's own unlock must end too.
    if (existsSync(BW)) void bw(['lock'], had ? { BW_SESSION: had } : {});
  }
  private forget(): void { this.session = null; if (this.timer) { clearTimeout(this.timer); this.timer = null; } }
  lock(): void {
    if (this.keepSealed()) { this.forget(); this.known = 'locked'; return; }
    this.lockHard();
  }
}

/**
 * Written into the page's form from an isolated world: the page's own scripts cannot read this code or its values.
 * The visible password box, and the username or email box before it. Never submits.
 */
export function fillScript(username: string, password: string): string {
  return `(() => {
  const vis = (e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(e).visibility !== 'hidden'; };
  const set = (el, v) => {
    const proto = Object.getPrototypeOf(el);
    const d = Object.getOwnPropertyDescriptor(proto, 'value') || Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
    el.focus(); d.set.call(el, v);
    el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true }));
  };
  const all = [...document.querySelectorAll('input')].filter(vis);
  const pw = all.find((e) => e.type === 'password');
  const users = all.filter((e) => ['email', 'text', 'tel'].includes(e.type) && (pw ? (e.compareDocumentPosition(pw) & Node.DOCUMENT_POSITION_FOLLOWING) : true));
  const user = users.find((e) => /user|email|login|account|name/i.test((e.autocomplete || '') + e.name + e.id)) || users[users.length - 1];
  let did = 0;
  if (user && ${JSON.stringify(username)}) { set(user, ${JSON.stringify(username)}); did++; }
  if (pw) { set(pw, ${JSON.stringify(password)}); did++; }
  return did;
})()`;
}
