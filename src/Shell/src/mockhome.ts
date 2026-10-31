// One private home for every mockup (his pick, 2026-10-31): "some code public to show off, every mockup private and in
// one place". The home is one private git repo (github.com/Bowgull/mockups, cloned at ~/projects/mockups on the Mac and
// the PC). When Claude shows a page from any project, Samara copies it here, with its helper folder and the files it
// links, under <project>/<the same path>, and commits it: the trail serves every version from this repo's commits, and
// the project Claude worked in is never touched (a public code repo never carries a mockup).
//
// SAMARA'S OWN ART: a Samara sheet (docs/cockpit/sheet-NN.html) links Samara's pages and pictures relatively
// (../../src/Shell/pages/...). That art is not copied: the commit says which Samara commit it was shown at
// (Samara-Art:), and the page server hands it out from Samara's own repo at that commit (mockups.ts MockServer).
//
// WHEN SAMARA IS NOT RUNNING (his fallback rule): Claude copies the page here itself and commits it with Mockup:,
// Title:, Topic: and Project: lines at the end of the message. Samara reads those lines from new commits when it starts
// (newShown), and files each page as if it had been shown. Samara's own commits carry the same lines, so the PC's Samara
// files the Mac's mockups too once it pulls them.
//
// SAFETY: only files inside the page's own project folder are copied (no .., no dot folder or file, no link out of it),
// at most 400 files and 60 MB a page. git runs with an argument list, the repo's hooks and fsmonitor off; only the
// fetch and push here talk to the network, over https or ssh only (or a local folder).
import { execFile } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, realpathSync, statSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ART_DIRS, GIT_SAFE, gitEnv, helperOf } from './mockups.ts';
import { HOME_NAME } from './mockfiling.ts';

/** The name the home's sheets go by in the trail: @mockups/<project>/<path>. */
export { HOME_NAME, ART_DIRS };
/** Where the home is cloned on this machine: ~/projects/mockups (AANG_MOCKUPS_HOME for a test). */
export const mockHomeDir = (): string => process.env.AANG_MOCKUPS_HOME || path.join(os.homedir(), 'projects', 'mockups');
/** The home is here: a git clone in its place. */
export const homeReady = (dir: string): boolean => existsSync(path.join(dir, '.git'));
/** A project's folder in the home: Couch Mode is couch-mode, Samara is samara. */
export const projectFolder = (project: string): string => project.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'other';

const MAX_FILES = 400, MAX_BYTES = 60 * 1024 * 1024, MAX_FILE = 20 * 1024 * 1024;
const TEXT = /\.(html?|css|m?js|svg)$/i;
/** Folders and files never copied, whatever a page links: his secrets stay where they are. */
const PRIVATE = /^(secrets?|credentials?|private|keys?|\.env.*|.*\.(pem|key|p12|keychain))$/i;
/** A path that may be copied into the home. */
export const copyable = (rel: string): boolean => Boolean(plainRel(rel)) && !rel.split('/').some((s) => PRIVATE.test(s));

/** A path inside a project, plain: relative, forward slashes, no .., no dot folder or file. */
export function plainRel(p: string): string | null {
  if (!p || p.length > 400 || p.includes('\\') || p.includes(':') || p.startsWith('/')) return null;
  // eslint-disable-next-line no-control-regex
  if (/[\x00-\x1f]/.test(p)) return null;
  const parts = p.split('/');
  if (parts.some((s) => !s || s === '.' || s === '..' || s.startsWith('.'))) return null;
  return path.posix.normalize(p) === p ? p : null;
}

/** Where a page's files come from: its project's folder as it is now, or one of its commits (the move-in). */
export interface Reader {
  file(rel: string): Promise<Buffer | null>;
  /** Every file under a folder (relative to the project), or [] when there is none. */
  dir(rel: string): Promise<string[]>;
}
/** The project's folder as it is on disk now. Links followed only while they stay inside it. */
export function diskReader(root: string): Reader {
  const real = (() => { try { return realpathSync.native(root); } catch { return path.resolve(root); } })();
  const inside = (f: string) => { try { const r = path.relative(real, realpathSync.native(f)); return !!r && !r.startsWith('..') && !path.isAbsolute(r); } catch { return false; } };
  return {
    async file(rel) {
      const f = path.join(real, ...rel.split('/'));
      try { if (!inside(f)) return null; const s = statSync(f); return s.isFile() && s.size <= MAX_FILE ? readFileSync(f) : null; } catch { return null; }
    },
    async dir(rel) {
      const out: string[] = [];
      const walk = (r: string, depth: number) => {
        if (depth > 6 || out.length > MAX_FILES) return;
        let names: string[] = [];
        try { if (!inside(path.join(real, ...r.split('/')))) return; names = readdirSync(path.join(real, ...r.split('/'))); } catch { return; }
        for (const n of names) {
          if (n.startsWith('.')) continue;
          const sub = `${r}/${n}`;
          try { const s = statSync(path.join(real, ...sub.split('/'))); if (s.isDirectory()) walk(sub, depth + 1); else if (s.isFile()) out.push(sub); } catch { /* gone */ }
        }
      };
      walk(rel, 0);
      return out;
    },
  };
}
/** A project's files as one commit has them (git, read only). */
export function gitReader(repo: string, commit: string): Reader {
  return {
    async file(rel) { const b = await run(repo, ['cat-file', 'blob', `${commit}:${rel}`], true); return Buffer.isBuffer(b) && b.length <= MAX_FILE ? b : null; },
    async dir(rel) { const t = await run(repo, ['ls-tree', '-r', '--name-only', '-z', commit, '--', rel + '/']); return typeof t === 'string' ? t.split('\0').filter(Boolean) : []; },
  };
}

/** The relative addresses a page, style sheet or script points at (src, href, srcset, url(), imports, fetch). */
export function linksIn(text: string): string[] {
  const out = new Set<string>();
  const add = (u: string) => {
    const s = u.trim().split(/[?#]/)[0]!;
    if (!s || /^[a-z][a-z0-9+.-]*:/i.test(s) || s.startsWith('/') || s.startsWith('#') || s.includes('${') || s.includes('{{')) return;
    try { out.add(decodeURI(s)); } catch { out.add(s); }
  };
  for (const m of text.matchAll(/\b(?:src|href|poster|data-src|data)\s*=\s*["']([^"'<>]+)["']/gi)) add(m[1]!);
  for (const m of text.matchAll(/\bsrcset\s*=\s*["']([^"']+)["']/gi)) for (const part of m[1]!.split(',')) add(part.trim().split(/\s+/)[0] ?? '');
  for (const m of text.matchAll(/url\(\s*["']?([^"')]+)["']?\s*\)/gi)) add(m[1]!);
  for (const m of text.matchAll(/(?:\bimport\s*(?:[^"';]*?\bfrom\s*)?|\bimport\s*\(\s*|\bfetch\s*\(\s*|new\s+URL\s*\(\s*|\bnew\s+Audio\s*\(\s*)["'`]([^"'`]+)["'`]/g)) add(m[1]!);
  for (const m of text.matchAll(/["'`]((?:\.\.?\/)[^"'`\s]+\.(?:png|jpe?g|gif|webp|svg|css|m?js|json|wav|mp3|ogg|woff2?|ttf|html?))["'`]/gi)) add(m[1]!);
  return [...out];
}

/**
 * Every file a page needs, from its project: the page, its helper folder (sheet-46/ beside sheet-46-x.html), and what it
 * links, followed through pages, style sheets and scripts. `skip`: links not to copy (Samara's own art).
 */
export async function gather(r: Reader, page: string, skip: (rel: string) => boolean = () => false): Promise<Map<string, Buffer>> {
  const got = new Map<string, Buffer>();
  let bytes = 0;
  const take = async (rel: string): Promise<boolean> => {
    if (got.has(rel) || got.size >= MAX_FILES || !copyable(rel)) return false;
    const b = await r.file(rel);
    if (!b || bytes + b.length > MAX_BYTES) return false;
    got.set(rel, b); bytes += b.length;
    return true;
  };
  if (!(await take(page))) return got;
  const queue = [page];
  const help = helperOf(page);
  if (help) for (const f of await r.dir(help)) if (plainRel(f) && (await take(f)) && TEXT.test(f)) queue.push(f);
  while (queue.length) {
    const f = queue.shift()!;
    for (const u of linksIn(got.get(f)!.toString('utf8'))) {
      const rel = plainRel(path.posix.normalize(path.posix.join(path.posix.dirname(f), u)));
      if (!rel || skip(rel)) continue;
      if ((await take(rel)) && TEXT.test(rel)) queue.push(rel);
    }
  }
  return got;
}

/** The lines at the end of a commit that file a page in the trail (and say which Samara art it was shown with). */
export interface Shown { sheet: string; title: string; topic: string; project: string; icon: string; art: string }
export function trailers(s: Partial<Shown>): string {
  const one = (v: unknown) => String(v ?? '').replace(/[\r\n]+/g, ' ').trim();
  return [['Mockup', s.sheet], ['Title', s.title], ['Topic', s.topic], ['Project', s.project], ['Icon', s.icon], ['Samara-Art', s.art]]
    .filter(([, v]) => one(v)).map(([k, v]) => `${k}: ${one(v)}`).join('\n');
}
/** A commit message's filing lines, or null when it files no page. */
export function readTrailers(msg: string): Shown | null {
  const get = (k: string) => new RegExp(`^${k}:[ \\t]*(.+)$`, 'mi').exec(msg)?.[1]?.trim() ?? '';
  const sheet = get('Mockup');
  if (!sheet || !plainRel(sheet) || !/\.html?$/i.test(sheet) || !sheet.includes('/')) return null;
  return { sheet, title: get('Title').slice(0, 80), topic: get('Topic').slice(0, 40), project: get('Project').slice(0, 40), icon: get('Icon').slice(0, 10), art: /^[0-9a-f]{40}$/.test(get('Samara-Art')) ? get('Samara-Art') : '' };
}

/** git with an argument list (never a shell), the repo's own hooks and fsmonitor off. */
function run(repo: string, args: string[], binary = false, o: { net?: boolean; date?: number } = {}): Promise<string | Buffer | null> {
  // Only the fetch and the push go out, over https or ssh, or to a folder on this computer (a test's stand-in GitHub);
  // protocol.allow=never stays for everything else.
  const net = o.net ? ['-c', 'protocol.https.allow=always', '-c', 'protocol.ssh.allow=always', '-c', 'protocol.file.allow=always'] : [];
  const env: NodeJS.ProcessEnv = { ...gitEnv(), ...(o.date ? { GIT_AUTHOR_DATE: `@${Math.floor(o.date / 1000)} +0000`, GIT_COMMITTER_DATE: `@${Math.floor(o.date / 1000)} +0000` } : {}) };
  return new Promise((done) => {
    try {
      execFile('git', ['-C', repo, ...GIT_SAFE, ...net, '-c', 'commit.gpgsign=false', ...args], { windowsHide: true, timeout: o.net ? 60_000 : 20_000, maxBuffer: 64 * 1024 * 1024, encoding: binary ? 'buffer' : 'utf8', env },
        (err, out) => done(err ? null : (binary ? out as unknown as Buffer : String(out).trim())));
    } catch { done(null); }
  });
}

/** One write at a time into the home (Samara's shows, the move-in): git's index is one file. */
let chain: Promise<unknown> = Promise.resolve();
const serial = <T>(fn: () => Promise<T>): Promise<T> => { const p = chain.then(fn, fn); chain = p.catch(() => {}); return p; };

/**
 * Puts a page's files into the home under <folder>/ and commits them with the filing lines. A page shown again
 * unchanged makes no new commit (its version is the commit that already has it), unless it was shown with other Samara
 * art. Returns the commit that holds this version, or null when it could not be kept.
 */
export function keep(home: string, folder: string, files: Map<string, Buffer>, s: Omit<Shown, 'sheet'> & { page: string }, o: { date?: number; move?: boolean } = {}): Promise<{ commit: string; sheet: string } | null> {
  return serial(async () => {
    if (!files.size || !plainRel(folder) || folder.includes('/')) return null;
    const sheet = `${folder}/${s.page}`;
    const names: string[] = [];
    try {
      for (const [rel, b] of files) {
        const to = path.join(home, folder, ...rel.split('/'));
        mkdirSync(path.dirname(to), { recursive: true });
        let same = false;
        try { same = readFileSync(to).equals(b); } catch { /* new */ }
        if (!same) writeFileSync(to, b);
        names.push(`${folder}/${rel}`);
      }
    } catch (e) { console.error('shell: mockups: the page could not be copied home: ' + (e as Error).message); return null; }
    for (let i = 0; i < names.length; i += 100) if ((await run(home, ['add', '--', ...names.slice(i, i + 100)])) === null) return null;
    const changed = (await run(home, ['diff', '--cached', '--quiet'])) === null;
    const head = async () => { const c = await run(home, ['rev-parse', '--verify', 'HEAD']); return typeof c === 'string' && /^[0-9a-f]{40}$/.test(c) ? c : null; };
    if (!changed && !s.art) {
      // Unchanged: the newest commit that touched the page is this version.
      const last = await run(home, ['log', '-1', '--format=%H', '--', sheet]);
      return typeof last === 'string' && /^[0-9a-f]{40}$/.test(last) ? { commit: last, sheet } : null;
    }
    const title = s.title || path.posix.basename(s.page);
    const msg = `${o.move ? 'Moved in' : 'Shown'}: ${folder} · ${title}\n\n${o.move ? trailers({ art: s.art }) : trailers({ ...s, sheet })}`.trim();
    if ((await run(home, ['commit', '-q', ...(changed ? [] : ['--allow-empty']), '-m', msg], false, { date: o.date })) === null) return null;
    const c = await head();
    return c ? { commit: c, sheet } : null;
  });
}

/** Sends the home's new commits to GitHub, so the other machine gets them; a race with it is pulled in and sent again. */
export function pushHome(home: string): Promise<boolean> {
  return serial(async () => {
    if ((await run(home, ['push', '-q', 'origin', 'HEAD'], false, { net: true })) !== null) return true;
    if ((await run(home, ['pull', '-q', '--rebase', 'origin', 'HEAD'], false, { net: true })) === null) { await run(home, ['rebase', '--abort']); return false; }
    return (await run(home, ['push', '-q', 'origin', 'HEAD'], false, { net: true })) !== null;
  });
}
/** Takes the other machine's new mockups (fast-forward only: nothing here is ever thrown away). */
export function pullHome(home: string): Promise<boolean> {
  return serial(async () => (await run(home, ['pull', '-q', '--ff-only', 'origin', 'HEAD'], false, { net: true })) !== null);
}

/** Pages filed by commits since `since` (all of them when ''), oldest first: what Samara files when it starts. */
export async function newShown(home: string, since: string): Promise<(Shown & { commit: string; at: number })[]> {
  const range = since && /^[0-9a-f]{40}$/.test(since) && (await run(home, ['cat-file', '-e', since + '^{commit}'])) !== null ? [`${since}..HEAD`] : ['HEAD'];
  const out = await run(home, ['log', '--reverse', '--format=%H%x00%ct%x00%B%x1e', '-n', '500', ...range]);
  if (typeof out !== 'string') return [];
  const list: (Shown & { commit: string; at: number })[] = [];
  for (const rec of out.split('\x1e')) {
    const [commit, ct, msg] = rec.replace(/^\s+/, '').split('\0');
    if (!commit || !/^[0-9a-f]{40}$/.test(commit)) continue;
    const t = readTrailers(msg ?? '');
    if (t) list.push({ ...t, commit, at: Number(ct) * 1000 || Date.now() });
  }
  return list;
}
export const homeHead = async (home: string): Promise<string> => { const c = await run(home, ['rev-parse', '--verify', 'HEAD']); return typeof c === 'string' ? c : ''; };
/** The Samara commit a home commit was shown with (its Samara-Art line), or ''. */
export async function artOf(home: string, commit: string): Promise<string> {
  const m = await run(home, ['show', '-s', '--format=%B', commit]);
  return typeof m === 'string' ? (/^Samara-Art:[ \t]*([0-9a-f]{40})\s*$/mi.exec(m)?.[1] ?? '') : '';
}

/**
 * The folder a page belongs to: its git repo, else the session's folder when the page is inside it, else the page's own
 * folder. Never his whole home folder or the disk's root: a page there is too loose to copy from.
 */
export function projectRoot(file: string, cwd: string, repoOf: (dir: string) => string | null): string | null {
  const ins = (p: string, d: string) => { const r = path.relative(d, p); return !!r && !r.startsWith('..') && !path.isAbsolute(r); };
  const real = (() => { try { return cwd && path.isAbsolute(cwd) ? realpathSync.native(cwd) : ''; } catch { return ''; } })();
  const root = repoOf(path.dirname(file)) ?? (real && ins(file, real) ? real : path.dirname(file));
  const bad = [os.homedir(), path.parse(root).root].map((d) => path.resolve(d));
  return bad.includes(path.resolve(root)) ? null : root;
}
