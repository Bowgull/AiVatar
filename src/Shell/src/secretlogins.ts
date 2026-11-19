// The secret window's own logins (his ask, 2026-11-19: "is there a way to get it to save logins thats only stored on mac?
// in this vault?"). They never go to Bitwarden: no save, no lookup, no call to its tool of any kind from the secret window.
//
// Kept in secret-logins.json inside the secret window's sealed folder (sealdir.ts): AES-256-GCM on disk, readable only
// while its PIN has it open. While it is locked there are no logins and nothing can be saved. Passwords are never logged;
// they leave this file only for the secret window's own fill (and its own Save card, which shows what will be kept).
//
// It answers the same questions as the Bitwarden vault (vault.ts), so the browser's key, light and Save card work the same.
import { randomUUID } from 'node:crypto';
import { writeFileAtomic } from './atomic.ts';
import { readJson } from './store.ts';
import type { Login, Vault, VaultState } from './vault.ts';

/** What the browser asks of a login keeper: Bitwarden's (normal Samara) or this one (the secret window). */
export type LoginVault = Pick<Vault, 'keepSealed' | 'known' | 'current' | 'state' | 'unlock' | 'useSession' | 'loginsFor' | 'loginHosts' | 'secret' | 'create' | 'setLockAfter' | 'signOut' | 'lock' | 'lockHard'>;

interface Kept { id: string; site: string; username: string; password: string; at: number }

const hostOf = (url: string): string => {
  try { return new URL(/^[a-z]+:\/\//i.test(url) ? url : 'https://' + url).hostname.toLowerCase().replace(/^www\./, ''); } catch { return ''; }
};

export class SecretLogins implements LoginVault {
  private readonly file: string;
  /** Its sealed folder is open (his PIN was right). Nothing is read or written otherwise. */
  private readonly open: () => boolean;
  constructor(file: string, open: () => boolean) { this.file = file; this.open = open; }
  keepSealed: () => boolean = () => false;
  known: VaultState = 'locked';
  /** A stand-in "session" while open, so the browser treats it as an open vault; never a secret. */
  current(): string | null { return this.open() ? 'secret-window' : null; }
  async state(): Promise<VaultState> { return (this.known = this.open() ? 'unlocked' : 'locked'); }
  /** Its PIN opens it, never a master password or a Bitwarden session. */
  async unlock(): Promise<boolean> { return false; }
  async useSession(): Promise<boolean> { return false; }

  private all(): Kept[] {
    if (!this.open()) return [];
    const a = readJson<unknown>(this.file, null);
    return Array.isArray(a) ? a.filter((k: Partial<Kept>) => typeof k?.id === 'string' && typeof k.site === 'string' && typeof k.password === 'string')
      .map((k: Kept) => ({ id: k.id, site: k.site, username: String(k.username ?? ''), password: k.password, at: Number(k.at) || 0 })) : [];
  }
  private save(list: Kept[]): boolean {
    if (!this.open()) return false;
    try { writeFileAtomic(this.file, JSON.stringify(list)); return true; } catch { return false; }
  }

  async loginsFor(url: string): Promise<Login[] | null> {
    if (!this.open()) return null;
    const here = hostOf(url);
    if (!here) return null;
    return this.all().filter((k) => k.site === here).slice(0, 20).map((k) => ({ id: k.id, name: k.site, username: k.username.slice(0, 120) }));
  }
  async loginHosts(): Promise<string[] | null> { return this.open() ? [...new Set(this.all().map((k) => k.site))] : null; }
  async secret(id: string): Promise<{ username: string; password: string } | null> {
    if (!this.open() || !/^[0-9a-f-]{36}$/i.test(id)) return null;
    const k = this.all().find((x) => x.id === id);
    return k ? { username: k.username, password: k.password } : null;
  }
  /** A new login after he looked at it and said Save; the same site and username again replaces its password. */
  async create(site: string, username: string, password: string): Promise<boolean> {
    const s = hostOf(site);
    if (!this.open() || !s || !password) return false;
    const list = this.all();
    const user = username.slice(0, 200), pass = password.slice(0, 500);
    const same = list.find((k) => k.site === s && k.username === user);
    if (same) { same.password = pass; same.at = Date.now(); } else list.push({ id: randomUUID(), site: s, username: user, password: pass, at: Date.now() });
    return this.save(list.slice(-2000));
  }
  // Locking is the secret window's own (its PIN, its mask); these have nothing to do.
  setLockAfter(): void { /* the window's 15 minutes decide */ }
  async signOut(): Promise<void> { /* nothing to sign out of */ }
  lock(): void { /* the window's lock shuts the folder */ }
  lockHard(): void { /* the same */ }
}
