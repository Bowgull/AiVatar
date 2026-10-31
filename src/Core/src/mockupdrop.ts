// show_mockup, the brain's half (2026-10-22). His ask: "All Claude sessions should be sending mockups to Samara".
//
// Any Claude session on this PC calls the aang-link mod's show_mockup tool (claude-link/hooks/register.ts) with a page
// to show him: an .html file in its own repo, or a page it serves on this computer (http://127.0.0.1:5173/...). The mod
// cannot leave the file for Samara itself: a session started by the Claude desktop app runs sandboxed, and its writes to
// %APPDATA% land in a private copy the Shell never sees. So it asks the brain over the signed link (/link/mockup), and
// the brain, which sees his real folders, checks the request and leaves the same small .mockup file that
// tools/open-mockup.mjs leaves, in %APPDATA%\Aang\open-urls. The Shell takes it from there (src/Shell/src/mockups.ts
// takeMockupFile: it checks everything again) into Samara's MOCKUPS trail, with its versions.
//
// THE CHECKS (the Shell repeats them; nothing else is ever written):
//   - a file must be an .html page inside its project's folder (its git repo, else the session's folder, else its own
//     folder; its real path, links followed, so a link out is refused), no folder or file starting with a dot on the way.
//     2026-10-31 (his pick): it need not be committed there: Samara copies every version into his private mockups repo
//     (src/Shell/src/mockhome.ts), so a public project never carries a mockup;
//   - in AangApp itself, only under the mockup folders (docs/, src/Shell/pages/, assets/), as before;
//   - a live page must be http(s) on this computer (127.0.0.1, localhost, ::1), with no user name in it;
//   - the title is cut to 80 characters, the branch name is 1 to 40 or dropped.
import { existsSync, mkdirSync, realpathSync, statSync } from 'node:fs';
import { readJson, saveText } from './store.ts';
import { randomBytes } from 'node:crypto';
import os from 'node:os';
import path from 'node:path';

export interface MockupAsk { cwd?: unknown; path?: unknown; url?: unknown; title?: unknown; branch?: unknown; project?: unknown; icon?: unknown }
export interface MockupResult { ok: boolean; message: string; file?: string }

/** AangApp's own repo (this brain's), whose mockups may only come from the mockup folders. */
export const HOME_REPO = path.resolve(import.meta.dirname, '..', '..', '..');
const MOCK_DIRS = ['docs/', 'src/Shell/pages/', 'assets/'];

/** A live page on this computer, cleaned, or null. The same rule as the Shell's cleanLive. */
export function cleanLiveUrl(u: unknown): string | null {
  if (typeof u !== 'string' || !u || u.length > 2000) return null;
  try {
    const x = new URL(u);
    if ((x.protocol !== 'http:' && x.protocol !== 'https:') || x.username || x.password) return null;
    return ['127.0.0.1', 'localhost', '[::1]'].includes(x.hostname) ? x.href : null;
  } catch { return null; }
}
/** A title cut short: control characters out, spaces collapsed, at most 80. */
export function cleanTitle(t: unknown): string {
  // eslint-disable-next-line no-control-regex
  return typeof t === 'string' ? t.slice(0, 1000).replace(/[\x00-\x1f\x7f-\x9f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80).trim() : '';
}
/** A branch name as the Shell's cleanBranch takes it (1 to 40), or null. */
export function cleanBranchName(b: unknown): string | null {
  if (typeof b !== 'string' || b.length > 1000) return null;
  // eslint-disable-next-line no-control-regex
  const n = b.replace(/[\x00-\x1f\x7f-\x9f]/g, '').replace(/\s+/g, ' ').trim();
  return n.length >= 1 && n.length <= 40 ? n : null;
}

const same = (a: string, b: string) => (process.platform === 'win32' ? a.toLowerCase() === b.toLowerCase() : a === b);
/** Is `p` the folder `dir` or inside it? */
const inside = (p: string, dir: string) => { const r = path.relative(dir, p); return r === '' || (!!r && !r.startsWith('..') && !path.isAbsolute(r)); };

/** The git repo a folder is in (the nearest folder up with a .git), or null. */
export function repoOf(dir: string): string | null {
  let d = path.resolve(dir);
  for (let i = 0; i < 60; i++) {
    if (existsSync(path.join(d, '.git'))) return d;
    const up = path.dirname(d);
    if (up === d) return null;
    d = up;
  }
  return null;
}

/**
 * Checks one show_mockup request and, when it passes, leaves its .mockup file in `<stateDir>/open-urls`. Never throws.
 * `homeRepo` is AangApp (a test passes its own).
 */
export async function dropMockup(stateDir: string, ask: MockupAsk, homeRepo = HOME_REPO): Promise<MockupResult> {
  const title = cleanTitle(ask.title);
  const branch = ask.branch === undefined || ask.branch === null || ask.branch === '' ? null : cleanBranchName(ask.branch);
  const branchNote = ask.branch !== undefined && ask.branch !== null && ask.branch !== '' && !branch ? ' (the branch name was not 1 to 40 characters, so it was left out)' : '';
  const hasPath = typeof ask.path === 'string' && ask.path.trim() !== '', hasUrl = typeof ask.url === 'string' && ask.url.trim() !== '';
  if (hasPath === hasUrl) return { ok: false, message: 'Pass either path (an .html file in your repo) or url (a page on http://127.0.0.1 or localhost), not both.' };
  // Every mockup names its topic, so none lands under Other (2026-10-30, as Samara's own door on the Mac).
  if (!branch) return { ok: false, message: "Give branch: the topic inside its project (\"Top bar\", \"TV\"), 1 to 40 characters, so it is filed in its place and never under Other. Then call show_mockup again." };
  let body: Record<string, string>;
  if (hasUrl) {
    const u = cleanLiveUrl(String(ask.url).trim());
    if (!u) return { ok: false, message: 'url must be a page on this computer: http://127.0.0.1, http://localhost or http://[::1] (any port), with no user name.' };
    body = { url: u };
    // A live page has no file to say whose it is: the project the session works in (Samara turns the repo's name into it).
    const cwd = typeof ask.cwd === 'string' ? ask.cwd : '';
    const own = cwd && path.isAbsolute(cwd) && existsSync(cwd) ? repoOf(cwd) : null;
    if (own && path.basename(own).length <= 40) body.project = path.basename(own);
  } else {
    const cwd = typeof ask.cwd === 'string' ? ask.cwd : '';
    const raw = String(ask.path).trim();
    if (raw.length > 1000 || raw.startsWith('\\\\') || raw.startsWith('//')) return { ok: false, message: 'path must be a file in a git repo.' };
    // 2026-10-28 (his "mockups aren't being sent organized correctly"): the repo is the FILE's, not the session's, so a
    // session outside any repo still files a sheet properly instead of serving it live (a row that dies with its server).
    if (!path.isAbsolute(raw) && (!cwd || !path.isAbsolute(cwd) || !existsSync(cwd))) return { ok: false, message: "Your session's folder is not known here. Pass the page's full path." };
    let file = '', root = '';
    try {
      file = realpathSync.native(path.resolve(cwd || homeRepo, raw));
      if (!statSync(file).isFile()) throw new Error('not a file');
    } catch { return { ok: false, message: `No such file: ${raw.slice(0, 200)}` }; }
    // Its project's folder: the repo, else the session's folder, else the page's own (never his whole home folder).
    const real = (() => { try { return cwd && path.isAbsolute(cwd) ? realpathSync.native(cwd) : ''; } catch { return ''; } })();
    const root0 = repoOf(path.dirname(file)) ?? (real && inside(file, real) && file !== real ? real : path.dirname(file));
    if ([os.homedir(), path.parse(root0).root].some((d) => same(path.resolve(d), path.resolve(root0)))) return { ok: false, message: "Put the page in its project's folder (not straight in the home folder), then call show_mockup again." };
    try { root = realpathSync.native(root0); } catch { return { ok: false, message: `No such file: ${raw.slice(0, 200)}` }; }
    if (!inside(file, root)) return { ok: false, message: 'path must be inside your own repo.' };
    const rel = path.relative(root, file).split(path.sep).join('/');
    if (!/\.html?$/i.test(rel)) return { ok: false, message: 'path must be an .html page.' };
    if (rel.length > 400 || rel.split('/').some((s) => !s || s.startsWith('.'))) return { ok: false, message: 'That file is in a hidden folder (or its path is too long), so it is not shown.' };
    if (root.length > 400) return { ok: false, message: 'Your repo folder path is too long.' };
    const home = (() => { try { return realpathSync.native(homeRepo); } catch { return path.resolve(homeRepo); } })();
    const isHome = same(root, home);
    if (isHome && !MOCK_DIRS.some((d) => rel.startsWith(d))) return { ok: false, message: 'In AangApp, mockups live under docs/, src/Shell/pages/ or assets/.' };
    body = isHome ? { path: rel } : { repo: root, path: rel };
    const r = write(stateDir, { ...body, ...extra(ask) }, title, branch);
    if (!r) return { ok: false, message: 'The page could not be handed to Samara (his Aang folder could not be written).' };
    return { ok: true, file: r, message: `Showing ${rel} in Samara's Mockups trail${branch ? ` (branch ${branch})` : ''}; Samara keeps this version in his private mockups repo.${branchNote}` };
  }
  const r = write(stateDir, { ...body, ...extra(ask) }, title, branch);
  if (!r) return { ok: false, message: 'The page could not be handed to Samara (his Aang folder could not be written).' };
  return { ok: true, file: r, message: `Showing ${body.url} in Samara's Mockups trail${branch ? ` (branch ${branch})` : ''}.${branchNote}` };
}

/** The .mockup file, written under another name first and then renamed, so the Shell never reads half of one. */
/** Sheet 100 v4: the project Claude named and the icon it picked, passed on as given (Samara checks both again). */
function extra(ask: MockupAsk): Record<string, string> {
  const o: Record<string, string> = {};
  if (typeof ask.project === 'string' && ask.project.trim() && ask.project.length <= 40) o.project = ask.project.trim();
  if (typeof ask.icon === 'string' && /^[a-z]{2,10}$/.test(ask.icon)) o.icon = ask.icon;
  return o;
}
function write(stateDir: string, body: Record<string, string>, title: string, branch: string | null): string | null {
  try {
    const dir = path.join(stateDir, 'open-urls');
    mkdirSync(dir, { recursive: true });
    const name = `${Date.now()}-${process.pid}-${randomBytes(3).toString('hex')}.mockup`;
    const json = JSON.stringify({ ...body, ...(title ? { title } : {}), ...(branch ? { branch } : {}) });
    if (Buffer.byteLength(json) > 4096) return null;
    return saveText(path.join(dir, name), json) ? path.join(dir, name) : null;   // safe save: Samara never sees half a drop
  } catch { return null; }
}

/**
 * mockup_mark on the PC (sheet 79, his interview 2026-10-23): the brain's half. No stage: the marks Samara keeps in
 * mockups.json (read only). With a stage: the sheet is checked as show_mockup checks it (in the session's repo, an .html
 * page, no hidden folder; AangApp's only under its mockup folders), and a small .mockmark file is left for Samara, which
 * checks it again (src/Shell/src/mockups.ts takeMarkFile) and sets the mark. An approval needs his words.
 */
export interface MarkAsk { cwd?: unknown; path?: unknown; v?: unknown; stage?: unknown; said?: unknown; note?: unknown; list?: unknown }
export async function markMockup(stateDir: string, ask: MarkAsk, homeRepo = HOME_REPO): Promise<MockupResult & { stages?: unknown[] }> {
  if (ask.list === true || ask.stage === undefined || ask.stage === null || ask.stage === '') {
    try {
      const j = readJson<any>(path.join(stateDir, 'mockups.json'), {});
      const stages = (Array.isArray(j?.versions) ? j.versions : []).filter((x: Record<string, unknown>) => typeof x?.stage === 'string')
        .sort((a: Record<string, number>, b: Record<string, number>) => (b.stageAt ?? 0) - (a.stageAt ?? 0)).slice(0, 60)
        .map((x: Record<string, unknown>) => ({ sheet: x.sheet, title: x.title, v: x.v, commit: x.commit, stage: x.stage, ...(x.note ? { note: x.note } : {}), ...(x.said ? { said: x.said } : {}), at: x.stageAt, by: x.by }));
      return { ok: true, message: '', stages };
    } catch { return { ok: true, message: '', stages: [] }; }
  }
  const stage = String(ask.stage);
  if (!['approved', 'built', 'fix', 'park', 'clear'].includes(stage)) return { ok: false, message: 'stage is one of: approved, built, fix, park, clear.' };
  // eslint-disable-next-line no-control-regex
  const said = typeof ask.said === 'string' ? ask.said.replace(/[\x00-\x1f\x7f-\x9f]/g, ' ').trim().slice(0, 300) : '';
  // eslint-disable-next-line no-control-regex
  const note = typeof ask.note === 'string' ? ask.note.replace(/[\x00-\x1f\x7f-\x9f]/g, ' ').trim().slice(0, 300) : '';
  if (stage === 'approved' && !said) return { ok: false, message: 'An approval needs his own words from the chat in said.' };
  const cwd = typeof ask.cwd === 'string' ? ask.cwd : '';
  if (!cwd || !path.isAbsolute(cwd) || !existsSync(cwd)) return { ok: false, message: "Your session's folder is not known here, so the sheet cannot be checked." };
  const root0 = repoOf(cwd);
  if (!root0) return { ok: false, message: "Your session's folder is not in a git repo." };
  const raw = typeof ask.path === 'string' ? ask.path.trim() : '';
  if (!raw || raw.length > 1000 || raw.startsWith('\\\\') || raw.startsWith('//')) return { ok: false, message: 'path must be the sheet, a file in your repo.' };
  let file = '', root = '';
  try { file = realpathSync.native(path.resolve(cwd, raw)); root = realpathSync.native(root0); if (!statSync(file).isFile()) throw new Error('not a file'); }
  catch { return { ok: false, message: `No such file: ${raw.slice(0, 200)}` }; }
  if (!inside(file, root)) return { ok: false, message: 'path must be inside your own repo.' };
  const rel = path.relative(root, file).split(path.sep).join('/');
  if (!/\.html?$/i.test(rel) || rel.length > 400 || rel.split('/').some((x) => !x || x.startsWith('.'))) return { ok: false, message: 'path must be an .html page, not in a hidden folder.' };
  const home = (() => { try { return realpathSync.native(homeRepo); } catch { return path.resolve(homeRepo); } })();
  const isHome = same(root, home);
  if (isHome && !MOCK_DIRS.some((d) => rel.startsWith(d))) return { ok: false, message: 'In AangApp, mockups live under docs/, src/Shell/pages/ or assets/.' };
  const v = Number(ask.v);
  const body = { ...(isHome ? {} : { repo: root }), path: rel, stage, ...(Number.isInteger(v) && v > 0 ? { v } : {}), ...(said ? { said } : {}), ...(note ? { note } : {}) };
  try {
    const dir = path.join(stateDir, 'open-urls');
    mkdirSync(dir, { recursive: true });
    const name = `${Date.now()}-${process.pid}-${randomBytes(3).toString('hex')}.mockmark`;
    const json = JSON.stringify(body);
    if (Buffer.byteLength(json) > 4096) return { ok: false, message: 'That mark is too long.' };
    if (!saveText(path.join(dir, name), json)) throw new Error('not saved');
  } catch { return { ok: false, message: 'The mark could not be handed to Samara (his Aang folder could not be written).' }; }
  return { ok: true, message: `Marked ${rel} ${stage} in Samara's Mockups trail${Number.isInteger(v) && v > 0 ? ` (version ${v})` : ' (its newest version)'}.` };
}
