// C1 + C4 (sheet 65, his answers 2026-10-22): the Addons slip in the morning brief, read from what is already on disk.
//
// Everything here READS. CurseForge's own status file (AddonGameInstance.json), the addons' .toc and changelog files,
// BugGrabber's saved errors, CurseForge's local picture cache and its downloaded zips. Nothing is written into the game
// folder or CurseForge's folders; the only thing written is Aang's own copy of the last list (addondesk.ts).
//
// No CurseForge API and no curseforge.com (their terms, and the site blocks programs): "what changed" comes from the
// addon's own changelog when the new file is already in CurseForge's download cache, summed up by Qwen. Empty otherwise.
// No Claude, no quota.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { inflateRawSync } from 'node:zlib';

export type AddonTag = 'ERRORS' | 'BIG JUMP' | 'NOT FOR THIS PATCH';
export interface AddonRow {
  /** CurseForge project id and the newest file's id: exactly what curseforge://install needs. */
  id: number; fileId: number;
  name: string; folder: string;
  from: string; to: string;
  /** A very short plain "what changed", or '' when nothing readable says. */
  what: string;
  tags: AddonTag[];
  /** Ticked to begin with: no big jump and made for this patch (ERRORS stays ticked: the update is likely the fix). */
  safe: boolean;
  errors: number;
  icon?: string;
}
export interface AddonsSection {
  /** The game instance's name as CurseForge shows it ("WoW Forever"). */
  game: string;
  /** When CurseForge last saved its list (ISO). */
  at: string;
  rows: AddonRow[];
  /** Addons that threw errors and have no update waiting: one line under the list. */
  errorsOnly: { name: string; icon?: string }[];
}

// ------------------------------------------------------------------ where things are

export interface CfPaths { json: string; cache: string; fileCache: string; exe: string }
export function cfPaths(env: NodeJS.ProcessEnv = process.env): CfPaths {
  const roaming = env.APPDATA ?? path.join(env.USERPROFILE ?? 'C:\\Users\\Default', 'AppData', 'Roaming');
  const local = env.LOCALAPPDATA ?? path.join(env.USERPROFILE ?? 'C:\\Users\\Default', 'AppData', 'Local');
  return {
    json: path.join(roaming, 'CurseForge', 'agent', 'GameInstances', 'AddonGameInstance.json'),
    cache: path.join(roaming, 'CurseForge', 'Cache', 'Cache_Data'),
    fileCache: path.join(roaming, 'CurseForge', 'agent', 'FileCache'),
    exe: path.join(local, 'Programs', 'CurseForge Windows', 'CurseForge.exe'),
  };
}

// ------------------------------------------------------------------ CurseForge's list

export interface CfFile { id: number; fileName: string; fileDate?: string; gameVersion?: string[]; modules?: { foldername: string }[] }
export interface CfAddon {
  addonID: number; name: string; thumbnailUrl?: string; installedFile: CfFile; latestFile?: CfFile | null;
  modFolderPath?: string; preferenceIsIgnored?: boolean; isEnabled?: boolean;
}
export interface CfInstance { name: string; installPath: string; gameVersion: string; gameVersionTypeId?: number; installedAddons: CfAddon[] }

/** CurseForge's game instances, or [] when the file is missing or unreadable. */
export function readInstances(jsonPath: string): CfInstance[] {
  try {
    const j = JSON.parse(readFileSync(jsonPath, 'utf8').replace(/^\uFEFF/, ''));
    return Array.isArray(j) ? j.filter(g => g && Array.isArray(g.installedAddons)) : [];
  } catch { return []; }
}

/** The WoW instance (game id 1 addons live under Interface\AddOns). The first one with addons wins. */
export function wowInstance(list: CfInstance[]): CfInstance | null {
  return list.find(g => /world of warcraft/i.test(g.installPath ?? '') && g.installedAddons.length) ?? list[0] ?? null;
}

/** "Forever Beta" -> "WoW Forever": what he calls it, and what the sheet shows next to the WoW icon. */
export function gameLabel(name: string): string {
  const n = String(name ?? '').trim();
  if (/forever/i.test(n)) return 'WoW Forever';
  return n ? `WoW ${n.replace(/\s*beta\s*$/i, '')}`.trim() : 'WoW';
}

// ------------------------------------------------------------------ versions

/** The client's version: the game's own .build.info (one row per product), else what CurseForge saw. */
export function clientVersion(installPath: string, fallback: string): string {
  try {
    const flavour = path.basename(path.resolve(installPath));               // _classic_beta_
    const product = 'wow' + flavour.replace(/^_+|_+$/g, '').replace(/^(?=.)/, '_');   // wow_classic_beta
    const lines = readFileSync(path.join(installPath, '..', '.build.info'), 'utf8').split(/\r?\n/).filter(Boolean);
    const head = (lines[0] ?? '').split('|').map(h => h.split('!')[0]!.trim());
    const vi = head.indexOf('Version'), pi = head.indexOf('Product');
    for (const l of lines.slice(1)) {
      const c = l.split('|');
      if (vi >= 0 && pi >= 0 && c[pi] === product && /^\d+\.\d+\.\d+/.test(c[vi] ?? '')) return c[vi]!;
    }
  } catch { /* not there: CurseForge's own value */ }
  return fallback;
}

/** "1.60.1.70450" -> 16001, the number a .toc's ## Interface lists. */
export function interfaceOf(version: string): number {
  const [a, b, c] = String(version ?? '').split('.').map(Number);
  return Number.isFinite(a) && Number.isFinite(b) && Number.isFinite(c) ? a! * 10000 + b! * 100 + c! : 0;
}
/** "1.60.1.70450" -> "1.60.1", as CurseForge lists game versions on a file. */
export const patchOf = (version: string) => String(version ?? '').split('.').slice(0, 3).join('.');

const tocField = (toc: string, name: string): string => (new RegExp(`^##\\s*${name}\\s*:\\s*(.+)$`, 'im').exec(toc)?.[1] ?? '').replace(/\r/g, '').trim();

/** What the addon's own .toc files say: its version, and every interface number any of its tocs lists. */
export function tocInfo(addonsDir: string, folder: string): { version: string; interfaces: number[] } | null {
  const dir = path.join(addonsDir, folder);
  let names: string[] = [];
  try { names = readdirSync(dir).filter(n => n.toLowerCase().endsWith('.toc') && n.toLowerCase().startsWith(folder.toLowerCase())); } catch { return null; }
  if (!names.length) return null;
  names.sort((a, b) => (a.toLowerCase() === `${folder.toLowerCase()}.toc` ? -1 : b.toLowerCase() === `${folder.toLowerCase()}.toc` ? 1 : a.localeCompare(b)));
  let version = '';
  const ifs = new Set<number>();
  for (const n of names) {
    let t = '';
    try { t = readFileSync(path.join(dir, n), 'utf8'); } catch { continue; }
    version ||= tocField(t, 'Version');
    for (const x of tocField(t, 'Interface').split(/[,\s]+/)) { const v = Number(x); if (Number.isFinite(v) && v > 0) ifs.add(v); }
  }
  return { version, interfaces: [...ifs] };
}

/**
 * The version inside a CurseForge file name: "Auctionator-341.zip" -> "341", "WhatsTraining-11.0.0-beta21.zip" ->
 * "11.0.0-beta21", "Leatrix_Plus-1.60.20-forever.zip" -> "1.60.20". A dotted group wins over a bare number, so a digit
 * in the addon's own name ("Addon2-0.36.1") is not read as its version.
 */
export function versionInName(fileName: string): string {
  const s = String(fileName ?? '').replace(/\.zip$/i, '').replace(/-\d+-g[0-9a-f]{7,}$/i, '');
  const pre = '(?:[-_.]?(?:beta|alpha|rc)[-_.]?\\d*)?';
  const m = new RegExp(`v?(\\d+(?:\\.\\d+)+${pre})`, 'i').exec(s) ?? new RegExp(`(?:^|[-_])v?(\\d+${pre})(?=$|[-_])`, 'i').exec(s);
  return m ? m[1]! : '';
}

/** As he reads it: "v4.11.26" -> "4.11.26", "11.0.0-beta21" -> "11.0.0 beta 21", "0.5.8-beta" -> "0.5.8 beta". */
export function prettyVersion(v: string): string {
  return String(v ?? '').trim().replace(/^v(?=\d)/i, '').replace(/[-_.]?(beta|alpha|rc)[-_.]?(\d*)$/i, (_, w: string, n: string) => ` ${w.toLowerCase()}${n ? ' ' + n : ''}`);
}

const nums = (v: string) => (/(\d+(?:\.\d+)*)/.exec(String(v ?? ''))?.[1] ?? '').split('.').filter(Boolean).map(Number);
const pre = (v: string) => /(beta|alpha|rc)/i.test(String(v ?? ''));

/** A new major number, or a beta becoming a release: settings may reset, things may look different. */
export function isBigJump(from: string, to: string): boolean {
  const a = nums(from), b = nums(to);
  if (!a.length || !b.length) return false;
  // Date-stamped builds (Details' 20261015.x) move their "major" every release: never a big jump.
  if (a[0]! > 9999 || b[0]! > 9999) return false;
  // A bare build counter (Auctionator's 341 -> 344) is a small step, not a major number.
  if (a.length === 1 && b.length === 1) return false;
  if (b[0]! > a[0]!) return true;
  return pre(from) && !pre(to) && b[0]! >= a[0]!;
}

// ------------------------------------------------------------------ BugGrabber

/**
 * Errors BugGrabber saved, counted per addon folder, newest `sinceSec` only. The addon is the one the message names
 * ("AddOn 'RXPGuides' tried to call..."), else the first addon path in the message, else in the stack (never
 * BugGrabber itself, which is in every stack).
 */
export function bugErrors(lua: string, sinceSec = 0): Map<string, number> {
  const out = new Map<string, number>();
  const unq = (s: string) => s.replace(/\\"/g, '"').replace(/\\n/g, '\n').replace(/\\\\/g, '\\');
  const str = (chunk: string, k: string) => { const m = new RegExp(`\\["${k}"\\]\\s*=\\s*"((?:[^"\\\\]|\\\\.)*)"`).exec(chunk); return m ? unq(m[1]!) : ''; };
  const num = (chunk: string, k: string) => Number(new RegExp(`\\["${k}"\\]\\s*=\\s*(\\d+)`).exec(chunk)?.[1] ?? NaN);
  const start = lua.indexOf('["errors"]');
  if (start < 0) return out;
  for (const chunk of lua.slice(start).split(/\n\{\s*\n/).slice(1)) {
    const message = str(chunk, 'message');
    if (!message) continue;
    const time = num(chunk, 'time');
    if (sinceSec && Number.isFinite(time) && time < sinceSec) continue;
    const stack = str(chunk, 'stack');
    const named = /AddOn '([^']+)'/.exec(message)?.[1];
    const inPath = (s: string) => [...s.matchAll(/AddOns[\\/]([^\\/\]]+)[\\/]/g)].map(m => m[1]!).find(f => !/^!?BugGrabber$/i.test(f));
    const folder = named ?? inPath(message) ?? inPath(stack);
    if (!folder) continue;
    const n = num(chunk, 'counter');
    out.set(folder, (out.get(folder) ?? 0) + (Number.isFinite(n) && n > 0 ? n : 1));
  }
  return out;
}

/** Every account's !BugGrabber.lua under this game flavour, joined. */
export function readBugGrabber(installPath: string, sinceSec = 0): Map<string, number> {
  const all = new Map<string, number>();
  const acc = path.join(installPath, 'WTF', 'Account');
  let names: string[] = [];
  try { names = readdirSync(acc); } catch { return all; }
  for (const a of names) {
    try {
      const f = path.join(acc, a, 'SavedVariables', '!BugGrabber.lua');
      if (!existsSync(f)) continue;
      for (const [k, v] of bugErrors(readFileSync(f, 'utf8'), sinceSec)) all.set(k, (all.get(k) ?? 0) + v);
    } catch { /* one unreadable account is not all of them */ }
  }
  return all;
}

// ------------------------------------------------------------------ icons: CurseForge's own picture cache

const BLOCK = [0, 36, 256, 1024, 4096, 8, 104, 48];
/**
 * The addon pictures CurseForge already downloaded, read out of its Chromium disk cache (the "blockfile" format:
 * data_0..3 plus f_xxxxxx files). Each cache entry in data_1 holds its URL as the key and where its body is. Nothing
 * is fetched. Returns file name (the thumbnail URL's last part) -> data: URL. Unreadable is simply empty.
 */
export function cachedThumbs(cacheDir: string, wanted: Set<string>): Map<string, string> {
  const out = new Map<string, string>();
  if (!wanted.size) return out;
  const files = new Map<string, Buffer>();
  const file = (n: string) => { if (!files.has(n)) files.set(n, readFileSync(path.join(cacheDir, n))); return files.get(n)!; };
  const read = (addr: number, size: number): Buffer | null => {
    if (!(addr & 0x80000000) || size <= 0 || size > 512 * 1024) return null;
    const type = (addr >>> 28) & 7;
    if (type === 0) return file('f_' + (addr & 0x0fffffff).toString(16).padStart(6, '0')).subarray(0, size);
    const bs = BLOCK[type]; if (!bs) return null;
    const buf = file('data_' + ((addr >>> 16) & 0xff)), off = 8192 + (addr & 0xffff) * bs;
    return off + size <= buf.length ? buf.subarray(off, off + size) : null;
  };
  let d1: Buffer;
  try { d1 = file('data_1'); } catch { return out; }
  for (let off = 8192; off + 256 <= d1.length; off += 256) {
    try {
      const keyLen = d1.readInt32LE(off + 32);
      if (keyLen <= 0 || keyLen > 160 || d1.readUInt32LE(off + 36)) continue;          // long keys live elsewhere: not ours
      const key = d1.toString('latin1', off + 96, off + 96 + keyLen);
      const m = /forgecdn\.net\/avatars\/thumbnails\/.+\/([^/?#]+\.(png|jpe?g|webp|gif))$/i.exec(key);
      if (!m || !wanted.has(m[1]!) || out.has(m[1]!)) continue;
      const body = read(d1.readUInt32LE(off + 60), d1.readInt32LE(off + 44));
      if (!body) continue;
      const mime = body[0] === 0x89 && body[1] === 0x50 ? 'image/png' : body[0] === 0xff && body[1] === 0xd8 ? 'image/jpeg'
        : body.toString('latin1', 8, 12) === 'WEBP' ? 'image/webp' : body.toString('latin1', 0, 3) === 'GIF' ? 'image/gif' : '';
      if (mime) out.set(m[1]!, `data:${mime};base64,${body.toString('base64')}`);
    } catch { /* a torn entry: skip it */ }
  }
  return out;
}
export const thumbName = (url?: string) => (url ? decodeURIComponent(url.split(/[?#]/)[0]!.split('/').pop() ?? '') : '');

// ------------------------------------------------------------------ "what changed": the addon's own changelog

const CHANGELOG = /^(change[-_ ]?log|changes|release[-_ ]?notes)[^/\\]*\.(md|txt|log)$/i;

/** The files in a zip, by name (central directory), with a way to read one. Small and strict; null when not a zip. */
export function zipEntries(buf: Buffer): Map<string, () => Buffer> | null {
  const out = new Map<string, () => Buffer>();
  let e = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65_557); i--) if (buf.readUInt32LE(i) === 0x06054b50) { e = i; break; }
  if (e < 0) return null;
  let p = buf.readUInt32LE(e + 16);
  const n = buf.readUInt16LE(e + 10);
  for (let k = 0; k < n && p + 46 <= buf.length && buf.readUInt32LE(p) === 0x02014b50; k++) {
    const method = buf.readUInt16LE(p + 10), csize = buf.readUInt32LE(p + 20);
    const nl = buf.readUInt16LE(p + 28), xl = buf.readUInt16LE(p + 30), cl = buf.readUInt16LE(p + 32), lh = buf.readUInt32LE(p + 42);
    const name = buf.toString('utf8', p + 46, p + 46 + nl);
    out.set(name.replace(/\\/g, '/'), () => {
      const d = lh + 30 + buf.readUInt16LE(lh + 26) + buf.readUInt16LE(lh + 28);
      const raw = buf.subarray(d, d + csize);
      return method === 8 ? inflateRawSync(raw) : raw;
    });
    p += 46 + nl + xl + cl;
  }
  return out;
}

/** Lines in the new changelog that the installed one does not have: what is new, top first. */
export function changelogDiff(oldText: string, newText: string, max = 30): string[] {
  const norm = (l: string) => l.replace(/\s+/g, ' ').trim();
  const had = new Set(oldText.split(/\r?\n/).map(norm).filter(Boolean));
  return newText.split(/\r?\n/).map(norm).filter(l => l && !had.has(l) && !/^[-=#*_\s]+$/.test(l)).slice(0, max);
}

/** The new changelog lines for an addon, when CurseForge already has its newest zip in its download cache. */
export function newChangelogLines(a: CfAddon, addonsDir: string, fileCache: string): string[] {
  const latest = a.latestFile;
  if (!latest) return [];
  const zip = path.join(fileCache, String(a.addonID), `${latest.id}.zip`);
  let entries: Map<string, () => Buffer> | null = null;
  try { if (!existsSync(zip) || statSync(zip).size > 40 * 1024 * 1024) return []; entries = zipEntries(readFileSync(zip)); } catch { return []; }
  if (!entries) return [];
  for (const [name, get] of entries) {
    const parts = name.split('/');
    if (parts.length !== 2 || !CHANGELOG.test(parts[1]!)) continue;
    let oldText = '';
    try { oldText = readFileSync(path.join(addonsDir, parts[0]!, parts[1]!), 'utf8'); } catch { /* new file: every line is new */ }
    try { return changelogDiff(oldText, get().toString('utf8')); } catch { return []; }
  }
  return [];
}

export const WHAT_SYSTEM = 'You sum up a World of Warcraft addon changelog for a player. Reply with at most 8 plain words, '
  + 'like "Faster search. Fixes a login error." No version numbers, no addon name, no quotes, no lists.';
export type AskLocal = (prompt: string, o?: { system?: string; maxTokens?: number; timeoutMs?: number }) => Promise<{ ok: boolean; text: string }>;

/** Qwen's few words for the new changelog lines; '' when there are none or Qwen cannot answer. */
export async function whatChanged(lines: string[], ask?: AskLocal): Promise<string> {
  if (!lines.length || !ask) return '';
  try {
    const r = await ask(`Changelog lines that are new:\n${lines.join('\n').slice(0, 2500)}`, { system: WHAT_SYSTEM, maxTokens: 40, timeoutMs: 60_000 });
    if (!r.ok) return '';
    const t = r.text.replace(/<think>[\s\S]*?<\/think>/g, '').split(/\r?\n/).map(s => s.trim()).find(Boolean) ?? '';
    return t.replace(/^["'“”-]+|["'“”]+$/g, '').replace(/\s+/g, ' ').trim().slice(0, 70);
  } catch { return ''; }
}

// ------------------------------------------------------------------ the section

export interface BuildIn {
  instance: CfInstance;
  /** The client's version, "1.60.1.70450". */
  client: string;
  errors: Map<string, number>;
  /** thumbnail file name -> data: URL */
  thumbs?: Map<string, string>;
  /** addon id -> what changed */
  whats?: Map<number, string>;
}

/** Details! Damage Meter -> Details. The short name he knows. */
export const shortName = (n: string) => String(n ?? '').split('!')[0]!.trim() || String(n ?? '').trim();

/** The Addons slip, from CurseForge's list: what has an update, with its warnings, safe ones first. */
export function buildSection(x: BuildIn): AddonsSection {
  const g = x.instance;
  const addonsDir = path.join(g.installPath, 'Interface', 'AddOns');
  const patch = patchOf(x.client), iface = interfaceOf(x.client);
  const rows: AddonRow[] = [];
  const errorsOnly: AddonsSection['errorsOnly'] = [];
  const folderOwner = new Map<string, CfAddon>();
  for (const a of g.installedAddons) for (const m of a.installedFile?.modules ?? []) folderOwner.set(m.foldername.toLowerCase(), a);
  const errorsOf = (a: CfAddon) => (a.installedFile?.modules ?? []).reduce((n, m) => n + (x.errors.get(m.foldername) ?? 0), 0);
  const icon = (a: CfAddon) => x.thumbs?.get(thumbName(a.thumbnailUrl));

  for (const a of g.installedAddons) {
    if (!a?.installedFile || a.preferenceIsIgnored) continue;
    const folder = a.installedFile.modules?.[0]?.foldername ?? '';
    const errors = errorsOf(a);
    const latest = a.latestFile;
    if (!latest || !latest.id || latest.id === a.installedFile.id) {
      if (errors) errorsOnly.push({ name: shortName(a.name), ...(icon(a) ? { icon: icon(a)! } : {}) });
      continue;
    }
    const toc = folder ? tocInfo(addonsDir, folder) : null;
    // The toc's own version is the cleaner one; read its number the same way ("#Details.20261015.1" -> "20261015.1").
    const from = prettyVersion((toc?.version ? versionInName(toc.version) || toc.version : '') || versionInName(a.installedFile.fileName));
    const to = prettyVersion(versionInName(latest.fileName)) || latest.fileName.replace(/\.zip$/i, '');
    const tags: AddonTag[] = [];
    if (errors) tags.push('ERRORS');
    if (isBigJump(from, to)) tags.push('BIG JUMP');
    // CurseForge's own list of game versions for the new file; without one, the installed tocs say.
    const made = latest.gameVersion?.length ? latest.gameVersion.includes(patch) : !toc || !iface || toc.interfaces.includes(iface);
    if (patch && !made) tags.push('NOT FOR THIS PATCH');
    rows.push({
      id: a.addonID, fileId: latest.id, name: shortName(a.name), folder, from, to, what: x.whats?.get(a.addonID) ?? '',
      tags, safe: !tags.includes('BIG JUMP') && !tags.includes('NOT FOR THIS PATCH'), errors, ...(icon(a) ? { icon: icon(a)! } : {}),
    });
  }
  // Errors in folders CurseForge does not manage still count, by folder name.
  for (const [folder] of x.errors) {
    if (folderOwner.has(folder.toLowerCase())) continue;
    if (!errorsOnly.some(e => e.name.toLowerCase() === folder.toLowerCase())) errorsOnly.push({ name: folder });
  }
  rows.sort((p, q) => Number(q.safe) - Number(p.safe) || Number(q.errors > 0) - Number(p.errors > 0) || p.name.localeCompare(q.name));
  return { game: gameLabel(g.name), at: '', rows, errorsOnly };
}

/** "BlizzMove and Details also threw errors. No fix out yet." */
export function errorsLine(names: string[]): string {
  if (!names.length) return '';
  const list = names.length === 1 ? names[0] : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`;
  return `${list} also threw errors. No fix out yet.`;
}

/** Everything from disk, read only: the section for the brief. Null when CurseForge or WoW is not on this PC. */
export async function readSection(paths: CfPaths, o: { now?: Date; ask?: AskLocal; errorDays?: number } = {}): Promise<AddonsSection | null> {
  const g = wowInstance(readInstances(paths.json));
  if (!g) return null;
  const now = o.now ?? new Date();
  const client = clientVersion(g.installPath, g.gameVersion);
  const errors = readBugGrabber(g.installPath, Math.floor(now.getTime() / 1000) - (o.errorDays ?? 14) * 86_400);
  let thumbs = new Map<string, string>();
  try { thumbs = cachedThumbs(paths.cache, new Set(g.installedAddons.map(a => thumbName(a.thumbnailUrl)).filter(Boolean))); } catch { /* no pictures */ }
  const addonsDir = path.join(g.installPath, 'Interface', 'AddOns');
  const whats = new Map<number, string>();
  for (const a of g.installedAddons) {
    if (!a.latestFile || a.latestFile.id === a.installedFile?.id) continue;
    const w = await whatChanged(newChangelogLines(a, addonsDir, paths.fileCache), o.ask);
    if (w) whats.set(a.addonID, w);
  }
  const s = buildSection({ instance: g, client, errors, thumbs, whats });
  try { s.at = statSync(paths.json).mtime.toISOString(); } catch { s.at = now.toISOString(); }
  return s;
}

/** The installed file id CurseForge now records for an addon, or 0. How an update is confirmed (with the toc). */
export function installedFileId(jsonPath: string, addonId: number): number {
  const g = wowInstance(readInstances(jsonPath));
  return g?.installedAddons.find(a => a.addonID === addonId)?.installedFile?.id ?? 0;
}
