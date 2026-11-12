// The Downloads engine's rules (Phase 2, 2026-11-12), out of browser.ts so they are tested on their own, the way
// Chromium keeps DownloadPathReservationTracker and its danger checks apart from the window code. browser.ts still does
// the Electron side (the item, its progress, the notices); what a file is called, where it goes, which name is taken
// and whether it needs his yes are decided here.
import { existsSync } from 'node:fs';
import path from 'node:path';

/** A file name that is safe on Windows and the Mac: the characters either refuses become "_"; never empty. */
export const safeName = (name: string): string => String(name ?? '').replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_').replace(/^[. ]+$/, '_') || 'download';

/**
 * Names taken by downloads still running (Phase 1: two downloads with the same name both saw no file yet and the second
 * wrote over the first). A name is held from the moment it is picked until its download ends.
 */
export class SavePaths {
  private readonly held = new Set<string>();
  private readonly exists: (p: string) => boolean;
  constructor(exists: (p: string) => boolean = existsSync) { this.exists = exists; }
  /** The first free "name.ext", "name (1).ext", "name (2).ext"... in dir; held until release() is called with it. */
  pick(dir: string, filename: string): string {
    const base = safeName(filename);
    const p = path.parse(base);
    let to = path.join(dir, base), n = 1;
    while (this.exists(to) || this.held.has(to.toLowerCase())) to = path.join(dir, `${p.name} (${n++})${p.ext}`);
    this.held.add(to.toLowerCase());
    return to;
  }
  release(file: string): void { this.held.delete(file.toLowerCase()); }
  /** How many names are held now (for tests and the log). */
  get size(): number { return this.held.size; }
}

/** A site's host as the trust list keeps it: no "www.". Empty when it cannot be read. */
export const siteOfUrl = (u: string): string => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return ''; } };
/** The same site, or one inside the other (cdn.example.com and example.com). */
export const sameSite = (a: string, b: string): boolean => a === b || a.endsWith('.' + b) || b.endsWith('.' + a);

/**
 * Does a program download need his yes (decision 18; security check 2026-10-24 finding 8)? The page's site must be one he
 * trusts, and the file itself must come from that site or one he trusts (an ad on a trusted site could hand him a
 * program from anywhere). Returns null when no ask is needed, else what to tell him.
 */
export function programAsk(o: { page: string; file: string; trusted: ReadonlySet<string>; otherTrusts: ReadonlySet<string> }): { site: string; fileSite: string; text: string } | null {
  const site = o.page, fileSite = o.file;
  const fileOk = !fileSite || sameSite(fileSite, site) || o.trusted.has(fileSite);
  if (site && o.trusted.has(site) && fileOk) return null;
  const text = o.trusted.has(site) && !fileOk ? `It is a program, and it comes from ${fileSite}, not ${site}. Only say yes if you meant to get it.`
    : o.otherTrusts.has(site) ? `It is a program. Your other computer trusts ${site}, but this one hasn't yet. Only say yes if you meant to get it.`
    : `It is a program, and ${site || 'this site'} has not given you one before. Only say yes if you meant to get it.`;
  return { site, fileSite, text };
}

/** Windows' "from the internet" mark for a finished download, so Defender and SmartScreen check it before it runs. */
export const zoneMark = (from: string): string => `[ZoneTransfer]\r\nZoneId=3\r\nHostUrl=${/^https?:\/\//i.test(from) ? from : 'about:internet'}\r\n`;
/** The Mac's quarantine flag value, the way Safari marks downloads (Gatekeeper asks before opening it). */
export const quarantineMark = (now: number = Date.now()): string => `0081;${Math.floor(now / 1000).toString(16)};Samara;`;
