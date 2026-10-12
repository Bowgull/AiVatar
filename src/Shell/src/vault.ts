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
import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';

export const BW = path.join(process.env.LOCALAPPDATA ?? '', 'Programs', 'BitwardenCLI', 'bw.exe');
const LOCK_AFTER_MS = 30 * 60_000;

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

  async state(): Promise<VaultState> {
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
    const r = await bw(['list', 'items', '--url', url], { BW_SESSION: this.session });
    if (!r.ok) return null;
    try {
      const items = JSON.parse(r.out) as { id: string; name: string; type: number; login?: { username?: string } }[];
      return items.filter((i) => i.type === 1 && typeof i.id === 'string').slice(0, 20)
        .map((i) => ({ id: i.id, name: String(i.name ?? '').slice(0, 80), username: String(i.login?.username ?? '').slice(0, 120) }));
    } catch { return null; }
  }

  /** One login's username and password, for one fill. */
  async secret(id: string): Promise<{ username: string; password: string } | null> {
    if (!this.session || !/^[0-9a-f-]{36}$/i.test(id)) return null;
    const r = await bw(['get', 'item', id], { BW_SESSION: this.session });
    if (!r.ok) return null;
    try {
      const i = JSON.parse(r.out);
      this.touch();
      return { username: String(i.login?.username ?? ''), password: String(i.login?.password ?? '') };
    } catch { return null; }
  }

  /** 30 minutes after the last fill, it locks itself. */
  private touch(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => this.lock(), LOCK_AFTER_MS);
  }
  private forget(): void { this.session = null; if (this.timer) { clearTimeout(this.timer); this.timer = null; } }
  lock(): void {
    const had = this.session;
    this.forget();
    if (had) void bw(['lock'], { BW_SESSION: had });
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
