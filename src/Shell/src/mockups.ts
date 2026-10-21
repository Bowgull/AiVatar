// Sheet 47 (his picks, 2026-10-21): the mockups Claude opens, in Samara, in one MOCKUPS trail with a history of every
// version. This file is the part that is not drawing: the small page server that shows a sheet exactly as it was at one
// commit, the history file, and the checks on a .mockup file Claude leaves in open-urls.
//
// WHY A SERVER AT ALL: a sheet is an HTML file in the repo (docs/cockpit/sheet-46-one-cockpit.html) with a helper folder
// beside it and shared art under src/Shell/pages/ and assets/, all linked relatively. An old version only looks the way
// it looked if every one of those files comes from the same commit. So the server answers /v/<commit>/<path> with that
// file as git has it at that commit, and every relative link and iframe inside the page lands on the same commit.
//
// SAFETY: 127.0.0.1 only, a port the system picks, GET and HEAD only, only by its own address (a web page that points its
// own name at this computer is refused, as pageserver.ts does). A commit must look like one (7 to 40 hex) and a path must
// be a plain repo path under docs/, src/Shell/pages/ or assets/: no .., no backslash, no drive or leading slash, no NUL.
// git is run with an argument list, never through a shell, and it only ever reads.
import { createServer, type Server } from 'node:http';
import { execFile } from 'node:child_process';
import { existsSync, readFileSync, statSync, unlinkSync } from 'node:fs';
import path from 'node:path';
import { writeFileAtomic } from './atomic.ts';

/** The only folders a mockup page (or anything it links to) may come from. */
export const MOCK_DIRS = ['docs/', 'src/Shell/pages/', 'assets/'];
export const COMMIT_RE = /^[0-9a-f]{7,40}$/;

/** A repo path the server may hand out, cleaned, or null. Exported for the test. */
export function cleanPath(p: unknown): string | null {
  if (typeof p !== 'string' || !p || p.length > 400) return null;
  // eslint-disable-next-line no-control-regex
  if (/[\x00-\x1f\\]/.test(p) || p.startsWith('/') || /^[a-z]:/i.test(p)) return null;
  const parts = p.split('/');
  if (parts.some((s) => s === '' || s === '.' || s === '..')) return null;
  if (path.posix.normalize(p) !== p) return null;
  return MOCK_DIRS.some((d) => p.startsWith(d)) ? p : null;
}

const TYPES: Record<string, string> = {
  html: 'text/html; charset=utf-8', htm: 'text/html; charset=utf-8', css: 'text/css; charset=utf-8',
  js: 'text/javascript; charset=utf-8', mjs: 'text/javascript; charset=utf-8', json: 'application/json; charset=utf-8',
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', svg: 'image/svg+xml', webp: 'image/webp', ico: 'image/x-icon',
  wav: 'audio/wav', woff: 'font/woff', woff2: 'font/woff2', ttf: 'font/ttf', txt: 'text/plain; charset=utf-8', md: 'text/plain; charset=utf-8',
};
export const typeOf = (p: string): string => TYPES[path.posix.extname(p).slice(1).toLowerCase()] ?? 'application/octet-stream';

/** git, read-only, with an argument list (never a shell). Null when it fails or there is no git. */
export function git(repo: string, args: string[], binary = false): Promise<string | Buffer | null> {
  return new Promise((done) => {
    try {
      execFile('git', ['-C', repo, ...args], { windowsHide: true, timeout: 15_000, maxBuffer: 64 * 1024 * 1024, encoding: binary ? 'buffer' : 'utf8' },
        (err, out) => done(err ? null : (binary ? out as unknown as Buffer : String(out).trim())));
    } catch { done(null); }
  });
}
const gitText = async (repo: string, args: string[]) => { const r = await git(repo, args); return typeof r === 'string' ? r : null; };

/** The AangApp repo, found from the Shell's own folder, or null (the Mac has no .git: then mockups stay off). */
export function findRepo(from: string): string | null {
  const root = path.resolve(from);
  return existsSync(path.join(root, '.git')) ? root : null;
}

/** The versioned page server. */
export class MockServer {
  private server: Server | null = null;
  port = 0;
  private readonly repo: string;
  constructor(repo: string) { this.repo = repo; }
  get origin(): string { return `http://127.0.0.1:${this.port}`; }
  start(): Promise<number> {
    return new Promise((done) => {
      const s = createServer((req, res) => { void this.answer(req, res); });
      s.on('error', (e) => { console.error('shell: mockups: the page server failed: ' + e.message); done(0); });
      s.listen(0, '127.0.0.1', () => { const a = s.address(); this.port = typeof a === 'object' && a ? a.port : 0; this.server = s; done(this.port); });
    });
  }
  close(): void { try { this.server?.close(); } catch { /* gone */ } this.server = null; }
  /** Where one version of one sheet is, while this run lasts. */
  url(commit: string, sheet: string): string { return `${this.origin}/v/${commit}/${sheet.split('/').map(encodeURIComponent).join('/')}`; }
  /** A mockup address from an earlier run (another port): the same page on this run's port. */
  rebase(u: string): string {
    try { const x = new URL(u); if (x.hostname === '127.0.0.1' && x.pathname.startsWith('/v/') && this.port) return this.origin + x.pathname + x.search + x.hash; } catch { /* not one */ }
    return u;
  }
  private async answer(req: import('node:http').IncomingMessage, res: import('node:http').ServerResponse): Promise<void> {
    if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405).end(); return; }
    if (String(req.headers.host ?? '') !== `127.0.0.1:${this.port}`) { res.writeHead(403).end(); return; }
    const from = req.headers.origin;
    if (from && from !== this.origin) { res.writeHead(403).end(); return; }
    const want = parseVersioned(String(req.url ?? ''));
    if (!want) { res.writeHead(404).end(); return; }
    // A blob only (cat-file blob is git show for a file, without ever listing a folder or converting it).
    const body = await git(this.repo, ['cat-file', 'blob', `${want.commit}:${want.path}`], true);
    if (!Buffer.isBuffer(body)) { res.writeHead(404).end(); return; }
    res.writeHead(200, { 'Content-Type': typeOf(want.path), 'Content-Length': body.length, 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'private, max-age=86400' });
    res.end(req.method === 'HEAD' ? undefined : body);
  }
}

/** /v/<commit>/<path> taken apart and checked, or null. Exported for the test. */
export function parseVersioned(url: string): { commit: string; path: string } | null {
  const raw = url.split(/[?#]/)[0] ?? '';
  const m = /^\/v\/([^/]+)\/(.+)$/.exec(raw);
  if (!m) return null;
  let p = '';
  try { p = m[2]!.split('/').map((s) => decodeURIComponent(s)).join('/'); } catch { return null; }
  const commit = m[1]!;
  const clean = cleanPath(p);
  return COMMIT_RE.test(commit) && clean ? { commit, path: clean } : null;
}

// ------------------------------------------------------------------ a version, and the history file
/** One version Claude opened: which sheet, its name, the commit it was shown at, when, and what it looked like (key). */
export interface MockVersion { id: number; sheet: string; title: string; commit: string; at: number; key: string; v: number }

/** A sheet's title from its own <title>: "Sheet 47 - The Mockups trail" reads as "47 · The Mockups trail". */
export function titleFrom(html: string, sheet: string): string {
  const m = /<title[^>]*>([^<]{1,300})<\/title>/i.exec(html);
  const ent: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'", middot: '·', nbsp: ' ' };
  let t = (m?.[1] ?? '').replace(/&(amp|lt|gt|quot|#39|middot|nbsp);/g, (_x, k: string) => ent[k] ?? '').replace(/\s+/g, ' ').trim();
  t = t.replace(/^sheet\s+([0-9]+[a-z]?)\s*[-:·–—]\s*/i, '$1 · ');
  return (t || path.posix.basename(sheet)).slice(0, 80);
}

/** A sheet's helper folder (docs/cockpit/sheet-46 for docs/cockpit/sheet-46-one-cockpit.html), or null. */
export function helperOf(sheet: string): string | null {
  const m = /^(sheet-[0-9]+[a-z]?)(?=[-.])/i.exec(path.posix.basename(sheet));
  return m ? `${path.posix.dirname(sheet)}/${m[1]}` : null;
}

/**
 * The version of a sheet as it is at HEAD now: the commit, and its key (the sheet file's blob id, plus its helper folder's
 * tree id when it has one). The same key is the same picture. Null when the sheet is not in that commit.
 */
export async function resolveVersion(repo: string, sheet: string): Promise<{ commit: string; key: string; title: string } | null> {
  const commit = await gitText(repo, ['rev-parse', '--verify', 'HEAD']);
  if (!commit || !/^[0-9a-f]{40}$/.test(commit)) return null;
  if ((await gitText(repo, ['cat-file', '-t', `${commit}:${sheet}`])) !== 'blob') return null;
  const blob = await gitText(repo, ['rev-parse', '--verify', `${commit}:${sheet}`]);
  if (!blob) return null;
  const dir = helperOf(sheet);
  const tree = dir && (await gitText(repo, ['cat-file', '-t', `${commit}:${dir}`])) === 'tree' ? await gitText(repo, ['rev-parse', '--verify', `${commit}:${dir}`]) : null;
  // Not committed yet: still HEAD's version (an old version must open the same way later), and the log says so.
  const dirty = await gitText(repo, ['status', '--porcelain', '--', sheet, ...(dir ? [dir] : [])]);
  if (dirty) console.log(`shell: mockups: ${sheet} has changes that are not committed; showing it as it is at ${commit.slice(0, 12)}`);
  const html = await git(repo, ['cat-file', 'blob', `${commit}:${sheet}`]);
  return { commit, key: blob + (tree ? ':' + tree : ''), title: titleFrom(typeof html === 'string' ? html : '', sheet) };
}

/**
 * The family tree inside the trail (his ask, 2026-10-21): a named BRANCH > a MOCKUP (a sheet) > its CHILD mockups (the
 * follow-ups, 45b, 45d...). Three levels only: a child never has children, and a child is always in its parent's branch.
 */
export interface MockBranch { id: number; name: string; folded: boolean }
export interface MockPlace { branch: number | null; parent: string | null }
/** The longest a branch name may be. */
export const BRANCH_MAX = 40;
/**
 * A branch name Claude gave in a .mockup file (or open-mockup --branch): control characters removed, whitespace collapsed
 * and trimmed, 1 to 40 characters. Null for anything else (the field is then ignored; the mockup still opens).
 */
export function cleanBranch(x: unknown): string | null {
  if (typeof x !== 'string' || x.length > 1000) return null;
  // eslint-disable-next-line no-control-regex
  const n = x.replace(/[\x00-\x1f\x7f-\x9f]/g, '').replace(/\s+/g, ' ').trim();
  return n.length >= 1 && n.length <= BRANCH_MAX ? n : null;
}
/** A sheet's number and letter: docs/cockpit/sheet-45g-click.html is 45 and g. */
export function sheetNum(sheet: string): { n: string; letter: string } | null {
  const m = /^sheet-([0-9]+)([a-z]?)(?=[-.])/i.exec(path.posix.basename(sheet));
  return m ? { n: m[1]!, letter: m[2]!.toLowerCase() } : null;
}

/** The history (mockups.json): every version of every mockup, and the tree, kept apart from the tabs, so closing never loses it. */
export class MockStore {
  list: MockVersion[] = [];
  branches: MockBranch[] = [];
  /** Where each sheet sits: its branch (top-level mockups only) and its parent (children only). */
  places = new Map<string, MockPlace>();
  private seq = 0;
  private branchSeq = 0;
  private readonly file: string;
  constructor(file: string) {
    this.file = file;
    try {
      if (existsSync(file)) {
        const s = JSON.parse(readFileSync(file, 'utf8'));
        const a = Array.isArray(s?.versions) ? s.versions : [];
        this.list = a.filter((x: Partial<MockVersion>) => Number.isInteger(x?.id) && typeof x?.sheet === 'string' && cleanPath(x.sheet) && typeof x?.commit === 'string' && COMMIT_RE.test(x.commit)
          && typeof x?.key === 'string' && Number.isFinite(x?.at) && Number.isInteger(x?.v))
          .map((x: MockVersion) => ({ id: x.id, sheet: x.sheet, title: String(x.title ?? '').slice(0, 80), commit: x.commit, at: Number(x.at), key: x.key.slice(0, 100), v: x.v })).slice(-2000);
        this.branches = (Array.isArray(s?.branches) ? s.branches : []).filter((b: Partial<MockBranch>) => Number.isInteger(b?.id) && typeof b?.name === 'string')
          .map((b: MockBranch) => ({ id: b.id, name: b.name.slice(0, BRANCH_MAX), folded: b.folded === true })).slice(0, 100);
        const pl = s?.places && typeof s.places === 'object' ? s.places as Record<string, Partial<MockPlace>> : {};
        for (const [k, v] of Object.entries(pl)) {
          if (!cleanPath(k) || !v || typeof v !== 'object') continue;
          const branch = typeof v.branch === 'number' && this.branches.some((b) => b.id === v.branch) ? v.branch : null;
          const parent = typeof v.parent === 'string' && cleanPath(v.parent) && v.parent !== k ? v.parent : null;
          this.places.set(k, { branch, parent });
        }
        // Three levels only, whatever the file says: a parent that is itself a child is cut loose.
        for (const [, v] of this.places) if (v.parent && this.places.get(v.parent)?.parent) v.parent = null;
      }
    } catch (e) { console.error('shell: mockups: the history could not be read: ' + (e as Error).message); }
    this.seq = this.list.reduce((m, x) => Math.max(m, x.id), 0);
    this.branchSeq = this.branches.reduce((m, x) => Math.max(m, x.id), 0);
  }
  private save(): void {
    try { writeFileAtomic(this.file, JSON.stringify({ v: 1, versions: this.list, branches: this.branches, places: Object.fromEntries(this.places) })); }
    catch (e) { console.error('shell: mockups: the history could not be saved: ' + (e as Error).message); }
  }
  /**
   * Where a new sheet files itself (his rule): a lettered sheet (45g) is a child of its parent sheet (45), in whatever
   * branch that is in. No known parent: the top level, no branch. He can always move it.
   */
  private fileNew(sheet: string): MockPlace {
    const me = sheetNum(sheet);
    if (!me?.letter) return { branch: null, parent: null };
    const known = [...new Set(this.list.map((x) => x.sheet))].filter((s) => { const o = sheetNum(s); return s !== sheet && o && o.n === me.n && !o.letter && !this.places.get(s)?.parent; });
    const parent = known.sort((a, b) => this.newestAt(b) - this.newestAt(a))[0];
    return { branch: null, parent: parent ?? null };
  }
  private newestAt(sheet: string): number { return this.list.reduce((m, x) => (x.sheet === sheet ? Math.max(m, x.at) : m), 0); }
  /** Where a sheet sits, its branch worked out (a child is in its parent's). */
  placeOf(sheet: string): MockPlace {
    const p = this.places.get(sheet) ?? { branch: null, parent: null };
    return p.parent ? { branch: this.places.get(p.parent)?.branch ?? null, parent: p.parent } : { branch: p.branch, parent: null };
  }
  childrenOf(sheet: string): string[] { return [...this.places].filter(([, v]) => v.parent === sheet).map(([k]) => k); }
  // His moves, all by hand. Each returns '' when done, or why not.
  newBranch(name = 'NEW BRANCH'): number {
    const id = ++this.branchSeq;
    this.branches.push({ id, name: String(name).replace(/\s+/g, ' ').trim().slice(0, BRANCH_MAX) || 'NEW BRANCH', folded: false });
    this.save();
    return id;
  }
  renameBranch(id: number, name: string): string {
    const b = this.branches.find((x) => x.id === id), n = String(name ?? '').replace(/\s+/g, ' ').trim().slice(0, BRANCH_MAX);
    if (!b || !n) return 'no such branch';
    b.name = n; this.save(); return '';
  }
  /** Folding hides its tabs in the trail; they stay open. */
  foldBranch(id: number): string { const b = this.branches.find((x) => x.id === id); if (!b) return 'no such branch'; b.folded = !b.folded; this.save(); return ''; }
  /** A branch goes; its mockups move to the top level, never deleted. */
  deleteBranch(id: number): string {
    if (!this.branches.some((x) => x.id === id)) return 'no such branch';
    this.branches = this.branches.filter((x) => x.id !== id);
    for (const [, v] of this.places) if (v.branch === id) v.branch = null;
    this.save(); return '';
  }
  /** File a mockup in a branch (or none: the top level). It becomes a top-level mockup there; its children come with it. */
  toBranch(sheet: string, branch: number | null): string {
    if (branch !== null && !this.branches.some((x) => x.id === branch)) return 'no such branch';
    this.places.set(sheet, { branch, parent: null }); this.save(); return '';
  }
  /**
   * Claude named a branch for a sheet (a .mockup file's "branch"). A top-level mockup moves into it, even out of a branch
   * he chose (Claude was told where to put it). A child stays with its parent: the parent moves instead, but only while
   * it has no branch. The branch is matched by name, any case, or made (as New branch does) only when something moves.
   * The move is toBranch, so children follow exactly as with Move to branch. Returns the sheet that moved, or null.
   */
  fileInto(sheet: string, name: unknown): string | null {
    const n = cleanBranch(name);
    if (!n || !this.places.has(sheet)) return null;
    const parent = this.places.get(sheet)!.parent;
    const target = parent ? (this.placeOf(parent).branch === null ? parent : null) : sheet;
    if (!target) return null;
    const id = this.branches.find((b) => b.name.toLowerCase() === n.toLowerCase())?.id ?? this.newBranch(n);
    return this.toBranch(target, id) ? null : target;
  }
  /** Make a mockup the child of another. Three levels only: dropped on a child, it joins that child's parent instead. */
  toParent(sheet: string, parent: string): string {
    const top = this.places.get(parent)?.parent ?? parent;
    if (top === sheet) return 'a mockup cannot be its own child';
    if (this.childrenOf(sheet).length) return 'it has children of its own';
    this.places.set(sheet, { branch: null, parent: top }); this.save(); return '';
  }
  /** A version opened. Its V number counts the sheet's different pictures: the same picture again keeps its number. */
  add(sheet: string, title: string, commit: string, key: string, at = Date.now()): MockVersion {
    const mine = this.list.filter((x) => x.sheet === sheet);
    const v = mine.find((x) => x.key === key)?.v ?? mine.reduce((m, x) => Math.max(m, x.v), 0) + 1;
    const r: MockVersion = { id: ++this.seq, sheet, title: title.slice(0, 80), commit, at, key, v };
    if (!this.places.has(sheet)) this.places.set(sheet, this.fileNew(sheet));
    this.list.push(r);
    if (this.list.length > 2000) this.list.splice(0, this.list.length - 2000);
    this.save();
    return r;
  }
  get(id: number): MockVersion | undefined { return this.list.find((x) => x.id === id); }
  /**
   * Duplicates (his rule): exactly the same picture of the same sheet as a newer line. The newest of each picture stays;
   * different versions are always kept. Returns each duplicate's id and the V it is the same as.
   */
  dups(): Map<number, number> {
    const out = new Map<number, number>();
    const keep = new Set<string>();
    for (const x of [...this.list].sort((a, b) => b.at - a.at || b.id - a.id)) {
      const k = x.sheet + '\n' + x.key;
      if (keep.has(k)) out.set(x.id, x.v); else keep.add(k);
    }
    return out;
  }
  /** The broom, only when he presses it: the duplicates go, nothing else. */
  sweep(): number {
    const d = this.dups();
    if (!d.size) return 0;
    this.list = this.list.filter((x) => !d.has(x.id));
    this.save();
    return d.size;
  }
}

/**
 * A .mockup file Claude left in open-urls: JSON {"path": "docs/cockpit/...html", "title": "46 · One cockpit", "branch":
 * "Claude link"} (branch optional; a bad one is ignored, the mockup still opens). At most
 * 4 KB, at most ten minutes old (like a .url), a path the server may show, a title of at most 80 characters. The file
 * is taken (deleted) whatever it says. Null when it is not one to open.
 */
export function takeMockupFile(file: string): { path: string; title: string; branch: string | null } | null {
  let raw = '', old = false, size = 0;
  try { const st = statSync(file); size = st.size; old = Date.now() - st.mtimeMs > 10 * 60_000; if (size <= 4096) raw = readFileSync(file, 'utf8'); } catch { return null; }
  try { unlinkSync(file); } catch { /* taken */ }
  if (old || size > 4096) return null;
  let j: { path?: unknown; title?: unknown; branch?: unknown };
  try { j = JSON.parse(raw.replace(/^﻿/, '')); } catch { return null; }
  const p = cleanPath(j?.path);
  if (!p || !/\.html?$/i.test(p)) return null;
  if (j.title !== undefined && (typeof j.title !== 'string' || j.title.length > 80)) return null;
  return { path: p, title: typeof j.title === 'string' ? j.title.replace(/[\x00-\x1f]/g, ' ').trim() : '', branch: cleanBranch(j.branch) };
}

// ------------------------------------------------------------------ Send to Aang (his pick, 2026-10-21)
/** One mockup version as it travels to Aang's typing box. Built by the Shell from mockups.json, never from the page. */
export interface MockSendItem {
  kind: 'mockup'; title: string; version: string; branch: string | null; sheet: string; commit: string; url: string; notes: string;
  /** A PNG of the page as a data URL, at most 1200 px wide; null when there was none or it was too big. */
  picture: string | null;
}
export type MockSend = MockSendItem | { kind: 'mockups'; branch: string; items: MockSendItem[] };
/** The most a sent picture may be (as a data URL), and the widest. Bigger is dropped, never sent. */
export const SHOT_MAX_BYTES = 1_500_000, SHOT_MAX_W = 1200;

/** A sheet's own words for Aang: its leading HTML comment and its first paragraph, as plain text, at most 1500 characters. */
export function notesFrom(html: string): string {
  const plain = (s: string) => s.replace(/<[^>]*>/g, ' ').replace(/&(amp|lt|gt|quot|#39|middot|nbsp);/g, (_x, k: string) => (({ amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'", middot: '·', nbsp: ' ' }) as Record<string, string>)[k] ?? '')
    .replace(/\s+/g, ' ').trim();
  const comment = /<!--([\s\S]*?)-->/.exec(html)?.[1] ?? '';
  const para = /<p[\s>][\s\S]*?<\/p>/i.exec(html)?.[0] ?? '';
  return [plain(comment), plain(para)].filter(Boolean).join('\n\n').slice(0, 1500);
}
