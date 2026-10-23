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
import { tidyMockups, type SheetMeta, type TidyReport } from './mockuptidy.ts';

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

// ------------------------------------------------------------------ every Claude session's mockups (2026-10-22)
// His ask: "All Claude sessions should be sending mockups to Samara". A sheet is no longer only an AangApp path. Three
// kinds share the trail, each named by one string (the "sheet" everywhere below):
//   - an AangApp sheet: docs/cockpit/sheet-47-x.html (cleanPath, as before);
//   - a page in another git repo (Waymark...): @<name>/<path>, where <name> is that repo's folder name, kept with its
//     full folder in mockups.json (MockStore.repos), and the page served from its commits like an AangApp sheet;
//   - a live page on this computer (a dev server's recording page): its own http://127.0.0.1 address, shown as it is.

/** The name a repo goes by inside a sheet (@Waymark/...): its folder's name, plain. */
export const REPO_NAME_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,39}$/;
/** A path inside another repo: plain, relative, no folder or file starting with a dot (.git, .env stay out). */
export function cleanRel(p: unknown): string | null {
  if (typeof p !== 'string' || !p || p.length > 400) return null;
  // eslint-disable-next-line no-control-regex
  if (/[\x00-\x1f\\:]/.test(p) || p.startsWith('/')) return null;
  const parts = p.split('/');
  if (parts.some((s) => s === '' || s.startsWith('.'))) return null;
  return path.posix.normalize(p) === p ? p : null;
}
/** A live page Claude may show: http(s) on this computer only (127.0.0.1, localhost, ::1), no user name, short. */
export function cleanLive(u: unknown): string | null {
  if (typeof u !== 'string' || !u || u.length > 2000) return null;
  try {
    const x = new URL(u);
    if ((x.protocol !== 'http:' && x.protocol !== 'https:') || x.username || x.password) return null;
    return ['127.0.0.1', 'localhost', '[::1]'].includes(x.hostname) ? x.href : null;
  } catch { return null; }
}
/** Which kind of sheet a string is, or null when it is none of them. */
export function sheetKind(s: unknown): 'home' | 'repo' | 'live' | null {
  if (typeof s !== 'string') return null;
  if (/^https?:/i.test(s)) return cleanLive(s) === s ? 'live' : null;
  if (s.startsWith('@')) return splitRepoSheet(s) ? 'repo' : null;
  return cleanPath(s) ? 'home' : null;
}
/** @<name>/<path> taken apart, or null. */
export function splitRepoSheet(s: string): { name: string; rel: string } | null {
  const m = /^@([^/]+)\/(.+)$/.exec(s);
  return m && REPO_NAME_RE.test(m[1]!) && cleanRel(m[2]) === m[2] ? { name: m[1]!, rel: m[2]! } : null;
}
/** Any of the three kinds, unchanged, or null. */
export const cleanSheet = (s: unknown): string | null => (sheetKind(s) ? s as string : null);
/** A live page's name in the trail when Claude gave none: its address without http://, cut to 80. */
export const liveTitle = (u: string): string => u.replace(/^https?:\/\//i, '').replace(/\/$/, '').slice(0, 80);

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
  /** Another repo's folder by its name (2026-10-22: every session's mockups); null when it is not one we know. */
  private readonly other: (name: string) => string | null;
  constructor(repo: string, other: (name: string) => string | null = () => null) { this.repo = repo; this.other = other; }
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
  url(commit: string, sheet: string): string {
    const enc = (p: string) => p.split('/').map(encodeURIComponent).join('/');
    // 2026-10-22: a live page is its own address; another repo's page is under /r/<name>/.
    if (sheetKind(sheet) === 'live') return sheet;
    const r = sheet.startsWith('@') ? splitRepoSheet(sheet) : null;
    return r ? `${this.origin}/r/${r.name}/${commit}/${enc(r.rel)}` : `${this.origin}/v/${commit}/${enc(sheet)}`;
  }
  /** A mockup address from an earlier run (another port): the same page on this run's port. */
  rebase(u: string): string {
    try { const x = new URL(u); if (x.hostname === '127.0.0.1' && /^\/[vr]\//.test(x.pathname) && this.port) return this.origin + x.pathname + x.search + x.hash; } catch { /* not one */ }
    return u;
  }
  private async answer(req: import('node:http').IncomingMessage, res: import('node:http').ServerResponse): Promise<void> {
    if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405).end(); return; }
    if (String(req.headers.host ?? '') !== `127.0.0.1:${this.port}`) { res.writeHead(403).end(); return; }
    const from = req.headers.origin;
    if (from && from !== this.origin) { res.writeHead(403).end(); return; }
    const want = parseVersioned(String(req.url ?? ''));
    const repo = !want ? null : want.repo === null ? this.repo : this.other(want.repo);
    if (!want || !repo) { res.writeHead(404).end(); return; }
    // A blob only (cat-file blob is git show for a file, without ever listing a folder or converting it).
    const body = await git(repo, ['cat-file', 'blob', `${want.commit}:${want.path}`], true);
    if (!Buffer.isBuffer(body)) { res.writeHead(404).end(); return; }
    res.writeHead(200, { 'Content-Type': typeOf(want.path), 'Content-Length': body.length, 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'private, max-age=86400' });
    res.end(req.method === 'HEAD' ? undefined : body);
  }
}

/**
 * /v/<commit>/<path> (AangApp, repo null) or /r/<name>/<commit>/<path> (another repo, 2026-10-22) taken apart and
 * checked, or null. Another repo's path may be anywhere in it except a dot folder or file. Exported for the test.
 */
export function parseVersioned(url: string): { repo: string | null; commit: string; path: string } | null {
  const raw = url.split(/[?#]/)[0] ?? '';
  const m = /^\/v\/([^/]+)\/(.+)$/.exec(raw) ?? /^\/r\/([^/]+)\/([^/]+)\/(.+)$/.exec(raw);
  if (!m) return null;
  const other = raw.startsWith('/r/');
  const [name, commit, enc] = other ? [m[1]!, m[2]!, m[3]!] : [null, m[1]!, m[2]!];
  if (name !== null && !REPO_NAME_RE.test(name)) return null;
  let p = '';
  try { p = enc.split('/').map((s) => decodeURIComponent(s)).join('/'); } catch { return null; }
  const clean = other ? cleanRel(p) : cleanPath(p);
  return COMMIT_RE.test(commit) && clean ? { repo: name, commit, path: clean } : null;
}

// ------------------------------------------------------------------ a version, and the history file
/** One version Claude opened: which sheet, its name, the commit it was shown at, when, and what it looked like (key). */
export interface MockVersion {
  id: number; sheet: string; title: string; commit: string; at: number; key: string; v: number;
  /** 2026-10-22, the tidy (mockuptidy.ts): folded into the sheet's "older" fold, and the times of duplicates merged into it. */
  old?: boolean; seen?: number[];
  /** Sheet 79 (2026-10-23): the stage this version is at, one at a time, and who set it when. `said`: his words, when
   *  Claude approved it from the chat. `note`: what to fix. */
  stage?: MockStage; note?: string; said?: string; stageAt?: number; by?: 'you' | 'claude';
}
/** FIX (needs changes), OK (approved by his click), CHAT (approved: he said yes to Claude), BUILT (in Samara), PARK (a no). */
export type MockStage = 'fix' | 'ok' | 'chat' | 'built' | 'park';
export const MOCK_STAGES: MockStage[] = ['fix', 'ok', 'chat', 'built', 'park'];

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
  /** 2026-10-22: the other repos a sheet can come from (@<name>/...), by name: their full folder. */
  repos = new Map<string, string>();
  /** 2026-10-22: what the tidy keeps about each sheet (mockuptidy.ts SheetMeta), and when it last ran. */
  meta = new Map<string, SheetMeta>();
  tidiedAt = 0;
  private seq = 0;
  private branchSeq = 0;
  private readonly file: string;
  constructor(file: string) {
    this.file = file;
    try {
      if (existsSync(file)) {
        const s = JSON.parse(readFileSync(file, 'utf8'));
        const a = Array.isArray(s?.versions) ? s.versions : [];
        const rp = s?.repos && typeof s.repos === 'object' ? s.repos as Record<string, unknown> : {};
        for (const [k, v] of Object.entries(rp)) if (REPO_NAME_RE.test(k) && typeof v === 'string' && path.isAbsolute(v) && !v.startsWith('\\\\') && v.length <= 400) this.repos.set(k, v);
        // A live page has no commit (2026-10-22); every other version has one.
        this.list = a.filter((x: Partial<MockVersion>) => Number.isInteger(x?.id) && typeof x?.sheet === 'string' && cleanSheet(x.sheet) && typeof x?.commit === 'string' && (COMMIT_RE.test(x.commit) || (x.commit === '' && sheetKind(x.sheet) === 'live'))
          && typeof x?.key === 'string' && Number.isFinite(x?.at) && Number.isInteger(x?.v))
          .map((x: MockVersion) => ({ id: x.id, sheet: x.sheet, title: String(x.title ?? '').slice(0, 80), commit: x.commit, at: Number(x.at), key: x.key.slice(0, 100), v: x.v,
            ...(x.old === true ? { old: true } : {}), ...(Array.isArray(x.seen) ? { seen: x.seen.filter((n) => Number.isFinite(n)).slice(0, 50) } : {}),
            ...(MOCK_STAGES.includes(x.stage as MockStage) ? { stage: x.stage, stageAt: Number(x.stageAt) || 0, by: x.by === 'claude' ? 'claude' : 'you',
              ...(typeof x.note === 'string' && x.note ? { note: x.note.slice(0, 300) } : {}), ...(typeof x.said === 'string' && x.said ? { said: x.said.slice(0, 300) } : {}) } : {}) })).slice(-2000);
        // The tidy's notes per sheet (2026-10-22): archived (when, why, by which), picked, decided, last opened.
        const mt = s?.meta && typeof s.meta === 'object' ? s.meta as Record<string, Record<string, unknown>> : {};
        for (const [k, v] of Object.entries(mt)) {
          if (!cleanSheet(k) || !v || typeof v !== 'object') continue;
          const m: SheetMeta = {};
          if (Number.isFinite(v.archived)) m.archived = Number(v.archived);
          if (v.why === 'gone' || v.why === 'stale' || v.why === 'hand') m.why = v.why;
          if (typeof v.by === 'string' && cleanSheet(v.by)) m.by = v.by;
          if (v.kept === true) m.kept = true;
          if (typeof v.picked === 'boolean') m.picked = v.picked;
          if (typeof v.decided === 'boolean') m.decided = v.decided;
          if (typeof v.dkey === 'string') m.dkey = v.dkey.slice(0, 100);
          if (Number.isFinite(v.opened)) m.opened = Number(v.opened);
          if (m.archived && !m.why) m.why = 'hand';
          this.meta.set(k, m);
        }
        if (Number.isFinite(s?.tidiedAt)) this.tidiedAt = Number(s.tidiedAt);
        this.branches = (Array.isArray(s?.branches) ? s.branches : []).filter((b: Partial<MockBranch>) => Number.isInteger(b?.id) && typeof b?.name === 'string')
          .map((b: MockBranch) => ({ id: b.id, name: b.name.slice(0, BRANCH_MAX), folded: b.folded === true })).slice(0, 100);
        const pl = s?.places && typeof s.places === 'object' ? s.places as Record<string, Partial<MockPlace>> : {};
        for (const [k, v] of Object.entries(pl)) {
          if (!cleanSheet(k) || !v || typeof v !== 'object') continue;
          const branch = typeof v.branch === 'number' && this.branches.some((b) => b.id === v.branch) ? v.branch : null;
          const parent = typeof v.parent === 'string' && cleanSheet(v.parent) && v.parent !== k ? v.parent : null;
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
    try { writeFileAtomic(this.file, JSON.stringify({ v: 1, versions: this.list, branches: this.branches, places: Object.fromEntries(this.places), repos: Object.fromEntries(this.repos), meta: Object.fromEntries(this.meta), tidiedAt: this.tidiedAt })); }
    catch (e) { console.error('shell: mockups: the history could not be saved: ' + (e as Error).message); }
  }
  /**
   * A version's stage (sheet 79, his picks 2026-10-23): one at a time; null takes it off. Approving one version takes the
   * approval off the sheet's other versions (only one is THE design); a built one stays built. '' when done, else why not.
   */
  setStage(id: number, stage: MockStage | null, o: { note?: string; said?: string; by?: 'you' | 'claude' } = {}): string {
    const v = this.list.find((x) => x.id === id);
    if (!v) return 'That version is not in the history.';
    if (stage === 'chat' && !o.said?.trim()) return 'An approval from the chat needs his words.';
    if (stage === 'ok' || stage === 'chat') for (const x of this.list) if (x.sheet === v.sheet && x.id !== id && (x.stage === 'ok' || x.stage === 'chat')) { delete x.stage; delete x.said; delete x.stageAt; delete x.by; }
    // Built keeps the words he approved it with: that is where it came from.
    const keepSaid = stage === 'built' ? v.said : undefined;
    delete v.stage; delete v.note; delete v.said; delete v.stageAt; delete v.by;
    if (keepSaid) v.said = keepSaid;
    if (stage) {
      v.stage = stage; v.stageAt = Date.now(); v.by = o.by === 'claude' ? 'claude' : 'you';
      if (stage === 'fix' && o.note?.trim()) v.note = o.note.trim().slice(0, 300);
      if (o.said?.trim()) v.said = o.said.trim().slice(0, 300);
    }
    this.save();
    return '';
  }
  /** Every version with a stage, newest first: what Claude reads before building (and Aang to answer what was decided). */
  stages(): { id: number; sheet: string; title: string; v: number; commit: string; stage: MockStage; note?: string; said?: string; at: number; by: 'you' | 'claude' }[] {
    return this.list.filter((x) => x.stage).sort((a, b) => (b.stageAt ?? 0) - (a.stageAt ?? 0))
      .map((x) => ({ id: x.id, sheet: x.sheet, title: x.title, v: x.v, commit: x.commit, stage: x.stage!, ...(x.note ? { note: x.note } : {}), ...(x.said ? { said: x.said } : {}), at: x.stageAt ?? 0, by: x.by ?? 'you' }));
  }
  /** Another repo's folder by its name, or null. */
  repoPath(name: string): string | null { return this.repos.get(name) ?? null; }
  /**
   * The name a repo's sheets go by (@<name>/...): the one it already has, else its folder's name made plain, with -2, -3
   * after it when another repo has that name. Kept, so an old version still finds its repo after a restart.
   */
  repoName(dir: string): string {
    const same = (a: string, b: string) => (process.platform === 'win32' ? a.toLowerCase() === b.toLowerCase() : a === b);
    for (const [k, v] of this.repos) if (same(v, dir)) return k;
    const base = (path.basename(dir).replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^[^A-Za-z0-9]+/, '').slice(0, 36)) || 'repo';
    let name = base;
    for (let i = 2; this.repos.has(name); i++) name = `${base}-${i}`;
    this.repos.set(name, dir);
    this.save();
    return name;
  }
  /**
   * Where a new sheet files itself (his rule): a lettered sheet (45g) is a child of its parent sheet (45), in whatever
   * branch that is in. No known parent: the top level, no branch. He can always move it.
   */
  private fileNew(sheet: string): MockPlace {
    const me = sheetNum(sheet);
    if (!me?.letter || sheetKind(sheet) === 'live') return { branch: null, parent: null };
    // 2026-10-22: a parent from the same repo only (Waymark's sheet 3b is never under AangApp's sheet 3).
    const space = (s: string) => (s.startsWith('@') ? s.slice(0, s.indexOf('/')) : sheetKind(s) === 'live' ? 'live' : '');
    const known = [...new Set(this.list.map((x) => x.sheet))].filter((s) => { const o = sheetNum(s); return s !== sheet && space(s) === space(sheet) && o && o.n === me.n && !o.letter && !this.places.get(s)?.parent; });
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
    // Claude opened it again: an archived sheet comes back by itself, and it counts as opened.
    const m = this.meta.get(sheet);
    if (m?.archived) { delete m.archived; delete m.why; delete m.by; }
    this.meta.set(sheet, { ...(m ?? {}), opened: at });
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
  // ---------------------------------------------------------------- the tidy (2026-10-22, mockuptidy.ts has the rules)
  /** Run the tidy with what git said (exists) and which sheets are open; the store takes the result. Returns what it did. */
  tidy(open: Set<string>, exists: (sheet: string) => boolean | null, now = Date.now()): TidyReport {
    const r = tidyMockups({ versions: this.list, meta: Object.fromEntries(this.meta), open, exists, now });
    this.list = r.versions as MockVersion[];
    this.meta = new Map(Object.entries(r.meta));
    this.tidiedAt = now;
    this.save();
    return r.report;
  }
  /** Archive one sheet by hand (never deleted; Restore brings it back). */
  archive(sheet: string, now = Date.now()): string {
    if (!this.list.some((x) => x.sheet === sheet)) return 'no such mockup';
    const m = this.meta.get(sheet) ?? {};
    m.archived = now; m.why = 'hand'; delete m.by; delete m.kept;
    this.meta.set(sheet, m); this.save(); return '';
  }
  /** Out of the Archive, and the tidy leaves it alone from now on. */
  restore(sheet: string, now = Date.now()): string {
    const m = this.meta.get(sheet);
    if (!m?.archived) return 'not archived';
    delete m.archived; delete m.why; delete m.by; m.kept = true; m.opened = now;
    this.save(); return '';
  }
  /** His own picked mark: on, off (both win over what the sheet says). */
  setPicked(sheet: string, on: boolean): string {
    if (!this.list.some((x) => x.sheet === sheet)) return 'no such mockup';
    this.meta.set(sheet, { ...(this.meta.get(sheet) ?? {}), picked: on }); this.save(); return '';
  }
  /** What the sheet's newest version says about itself (read by the Shell from git, only when the version changed). */
  setDecided(sheet: string, key: string, decided: boolean): void {
    this.meta.set(sheet, { ...(this.meta.get(sheet) ?? {}), decided, dkey: key });
  }
  /** A tab showed it (no save: the next save carries it; the tidy only needs it roughly). */
  opened(sheet: string, at = Date.now()): void { if (this.list.some((x) => x.sheet === sheet)) this.meta.set(sheet, { ...(this.meta.get(sheet) ?? {}), opened: at }); }
  archived(sheet: string): boolean { return Boolean(this.meta.get(sheet)?.archived); }
  /** Save after setDecided/opened. */
  flush(): void { this.save(); }
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
export interface MockupDrop {
  /** The page's path: in AangApp (repo null), or inside `repo`. Empty for a live page. */
  path: string;
  /** 2026-10-22: another repo's full folder (a session outside AangApp), or null. */
  repo: string | null;
  /** 2026-10-22: a live page on this computer (http://127.0.0.1...), or null. */
  url: string | null;
  title: string; branch: string | null;
}
/**
 * 2026-10-22, every Claude session (the brain writes these for the aang-link mod's show_mockup): also
 * {"repo": "C:\\...\\Waymark", "path": "docs/x.html"} for a page in another repo, or {"url": "http://127.0.0.1:5173/rec"}
 * for a live page on this computer. A repo must be an absolute local folder (no \\server share); its path plain, no dot
 * folders, an .html page.
 */
export function takeMockupFile(file: string): MockupDrop | null {
  let raw = '', old = false, size = 0;
  try { const st = statSync(file); size = st.size; old = Date.now() - st.mtimeMs > 10 * 60_000; if (size <= 4096) raw = readFileSync(file, 'utf8'); } catch { return null; }
  try { unlinkSync(file); } catch { /* taken */ }
  if (old || size > 4096) return null;
  let j: { path?: unknown; title?: unknown; branch?: unknown; repo?: unknown; url?: unknown };
  try { j = JSON.parse(raw.replace(/^﻿/, '')); } catch { return null; }
  if (j.title !== undefined && (typeof j.title !== 'string' || j.title.length > 80)) return null;
  // eslint-disable-next-line no-control-regex
  const title = typeof j.title === 'string' ? j.title.replace(/[\x00-\x1f]/g, ' ').trim() : '', branch = cleanBranch(j.branch);
  if (j.url !== undefined) { const u = cleanLive(j.url); return u ? { path: '', repo: null, url: u, title, branch } : null; }
  if (j.repo !== undefined) {
    const r = j.repo, p = cleanRel(j.path);
    if (typeof r !== 'string' || r.length > 400 || !path.isAbsolute(r) || r.startsWith('\\\\') || r.startsWith('//') || !p || !/\.html?$/i.test(p)) return null;
    return { path: p, repo: path.resolve(r), url: null, title, branch };
  }
  const p = cleanPath(j?.path);
  if (!p || !/\.html?$/i.test(p)) return null;
  return { path: p, repo: null, url: null, title, branch };
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
