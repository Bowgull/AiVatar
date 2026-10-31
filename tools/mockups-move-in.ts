// The move-in (2026-10-31, his pick: every mockup in ONE private repo). Every version in Samara's Mockups trail is put
// into the mockups home (~/projects/mockups) as it was, one commit each in the order they came, dated when he saw it;
// then each project's whole mockups folder as it is now (Samara's docs/cockpit, Couch Mode's mockups/, anti-slop's
// report, Waymark's mockups/). Then mockups.json is rewritten so every version opens from the home, keeping its marks.
//
// Safe to run again: what was moved in is remembered in the home (moved-in.json) and never committed twice.
// Nothing is ever deleted; the projects are only read.
//
//   node tools/mockups-move-in.ts [--commit] [--write <out.json>] [--state <mockups.json>] [--home <dir>] [--samara <AangApp dir>]
//     no flags: a dry run, saying what would happen.
//     --commit: makes the home's commits (Samara can stay open: it does not read the home yet).
//     --write:  writes the rewritten history to <out.json>. Copy it over mockups.json only while Samara is quit.
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { ART_DIRS, HOME_NAME, diskReader, gather, gitReader, keep, mockHomeDir, plainRel, projectFolder, type Reader } from '../src/Shell/src/mockhome.ts';
import { MockStore, resolveVersion, srcOf, type MockVersion } from '../src/Shell/src/mockups.ts';
import { isSamaraRepo } from '../src/Shell/src/mockfiling.ts';

const arg = (k: string) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : undefined; };
const DO = process.argv.includes('--commit');
const STATE = arg('--state') ?? path.join(os.homedir(), 'Library', 'Application Support', 'Aang', 'mockups.json');
const HOME = arg('--home') ?? mockHomeDir();
const OUT = arg('--write');
const H = os.homedir();
/** Where each project's pages are on this machine; the Waymark folder has no git, so its pages are as they are now. */
const WAYMARK = path.join(H, 'Handoff', 'waymark');
const MAP = path.join(HOME, 'moved-in.json');
/** Samara's own repo, for the PC's sheets that have no @ (AangApp's own). */
const SAMARA_NAME = 'AangApp';
const SAMARA = arg('--samara') ?? '';

const raw = JSON.parse(readFileSync(STATE, 'utf8'));
const repos: Record<string, string> = raw.repos ?? {};
// The store reads its own copy: what it says about projects (topics, repos) is all it is asked.
writeFileSync(path.join(os.tmpdir(), `move-in-${process.pid}.json`), JSON.stringify(raw));
const st = new MockStore(path.join(os.tmpdir(), `move-in-${process.pid}.json`));
const git = (repo: string, ...a: string[]) => { try { return execFileSync('git', ['-C', repo, ...a], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); } catch { return ''; } };
const repoDir = (name: string) => repos[name] ?? (isSamaraRepo(name) ? repos.AiVatar : undefined);

/** Where one version's page really is: a folder, its path there, and how to read it as it was. */
interface Source { root: string; rel: string; reader: Reader; commit: string; samara: boolean }
function sourceOf(v: MockVersion): Source | null {
  const tryRepo = (name: string, rel: string, commit: string): Source | null => {
    const dir = repoDir(name);
    if (!dir || !existsSync(dir)) return null;
    let c = commit && git(dir, 'cat-file', '-t', `${commit}:${rel}`) === 'blob' ? commit : '';
    // A live page had no commit: the last one before he saw it, else the first that has it.
    if (!c) c = git(dir, 'log', '-1', '--format=%H', `--before=@${Math.floor(v.at / 1000)}`, '--', rel) || git(dir, 'log', '--reverse', '--format=%H', '--', rel).split('\n')[0] || '';
    return c ? { root: dir, rel, reader: gitReader(dir, c), commit: c, samara: isSamaraRepo(name) } : null;
  };
  for (const s of [srcOf(v), v.sheet]) {
    // The PC's own sheets have no @: they are AangApp's (--samara, else the AiVatar repo it knows).
    if (/^(docs|src|assets)\//.test(s)) { if (SAMARA) repos[SAMARA_NAME] ??= SAMARA; const r = tryRepo(SAMARA_NAME, s, v.commit); if (r) return r; continue; }
    const at = /^@([^/]+)\/(.+)$/.exec(s);
    if (at) { const r = tryRepo(at[1]!, at[2]!, v.commit); if (r) return r; continue; }
    const live = /^http:\/\/127\.0\.0\.1:(\d+)\/([^?#]*)/.exec(s);
    if (!live) continue;
    const [port, p] = [live[1]!, decodeURIComponent(live[2]!)];
    if (/^docs\/cockpit\//.test(p)) { const r = tryRepo('AiVatar', p, ''); if (r) return r; }
    if (/^(sheet-)/.test(p) && port === '47901') { const r = tryRepo('AiVatar', 'docs/cockpit/' + p, ''); if (r) return r; }
    if (/^mockups\//.test(p) && (port === '8766' || port === '47830')) { const r = tryRepo('couch-mode', p, ''); if (r) return r; }
    if (p === 'report.html') { const r = tryRepo('anti-slop', p, ''); if (r) return r; }
    // Waymark's dev server served its mockups folder: the page as it is now.
    if (port === '8765' && plainRel(p) && existsSync(path.join(WAYMARK, 'mockups', p))) return { root: WAYMARK, rel: 'mockups/' + p, reader: diskReader(WAYMARK), commit: '', samara: false };
  }
  return null;
}

const moved: Record<string, { commit: string; sheet: string }> = existsSync(MAP) ? JSON.parse(readFileSync(MAP, 'utf8')) : {};
const done: { v: MockVersion; to: { commit: string; sheet: string } }[] = [];
const left: string[] = [];
const versions = (raw.versions as MockVersion[]).slice().sort((a, b) => a.at - b.at || a.id - b.id);
for (const v of versions) {
  if (v.sheet.startsWith(`@${HOME_NAME}/`)) continue;   // already in the home
  const id = `${v.id}|${v.sheet}|${v.commit}|${v.key}`;
  if (moved[id]) { done.push({ v, to: moved[id]! }); continue; }
  const s = sourceOf(v);
  if (!s) { left.push(`${v.id} ${v.title} (${srcOf(v)})`); continue; }
  const project = st.projectOf(v.sheet);
  const folder = projectFolder(project);
  if (!DO) { console.log(`would move  v${v.v} ${v.title}  ->  ${folder}/${s.rel}${s.commit ? ` (from ${s.commit.slice(0, 8)})` : ' (as it is now)'}`); continue; }
  const files = await gather(s.reader, s.rel, s.samara ? (rel) => ART_DIRS.some((d) => rel.startsWith(d)) : undefined);
  if (!files.has(s.rel)) { left.push(`${v.id} ${v.title} (could not read ${s.rel})`); continue; }
  const to = await keep(HOME, folder, files, { page: s.rel, title: v.title, topic: '', project, icon: '', art: s.samara ? s.commit : '' }, { date: v.at, move: true });
  if (!to) { left.push(`${v.id} ${v.title} (could not commit)`); continue; }
  moved[id] = to; done.push({ v, to });
  writeFileSync(MAP, JSON.stringify(moved, null, 1));
  console.log(`moved  v${v.v} ${v.title}  ->  ${to.sheet} @ ${to.commit.slice(0, 8)}`);
}

// Each project's whole mockups folder, as it is now (the ones never shown are kept too).
const FOLDERS: [string, string, string][] = [['samara', repos.AiVatar ?? path.join(H, 'projects', 'AiVatar'), 'docs/cockpit'], ['couch-mode', repos['couch-mode'] ?? path.join(H, 'Handoff', 'couch-mode'), 'mockups'],
  ['anti-slop', repos['anti-slop'] ?? path.join(H, 'Handoff', 'anti-slop'), 'report.html'], ['waymark', WAYMARK, 'mockups']];
for (const [folder, root, sub] of FOLDERS) {
  if (!existsSync(path.join(root, sub))) { console.log(`no ${sub} in ${root}`); continue; }
  const r = diskReader(root);
  const walk = (rel: string): string[] => readdirSync(path.join(root, rel), { withFileTypes: true }).filter((d) => !d.name.startsWith('.'))
    .flatMap((d) => (d.isDirectory() ? walk(`${rel}/${d.name}`) : d.isFile() ? [`${rel}/${d.name}`] : []));
  const list = sub.endsWith('.html') ? [sub] : walk(sub);
  // Samara's committed sheets only (another session's sheet in the making stays out until it is shown).
  const tracked = folder === 'samara' ? new Set(git(root, 'ls-files', '-z', sub).split('\0')) : null;
  const files = new Map<string, Buffer>();
  for (const f of list) { if (tracked && !tracked.has(f)) continue; const b = plainRel(f) ? await r.file(f) : null; if (b) files.set(f, b); }
  if (!DO) { console.log(`would copy ${files.size} files of ${sub} -> ${folder}/`); continue; }
  const k = await keep(HOME, folder, files, { page: list[0]!, title: `all of ${sub}`, topic: '', project: folder, icon: '', art: '' }, { move: true });
  console.log(`copied ${files.size} files of ${sub} -> ${folder}/ ${k ? '@ ' + k.commit.slice(0, 8) : '(nothing new)'}`);
}

console.log(`\n${done.length} versions in the home, ${left.length} left where they were${left.length ? ':\n  ' + left.join('\n  ') : ''}`);

// ---- the history, rewritten: every moved version opens from the home, its marks kept.
if (OUT && DO) {
  const out = JSON.parse(JSON.stringify(raw));
  const bySheet = new Map<string, string>();               // old sheet -> new sheet
  const keyMap = new Map<string, string>();                // old key -> new key (for the marks)
  for (const { v, to } of done) {
    const sheet = `@${HOME_NAME}/${to.sheet}`;
    const r = await resolveVersion(HOME, to.sheet, to.commit);
    const x = out.versions.find((y: MockVersion) => y.id === v.id);
    if (!x || !r) continue;
    bySheet.set(v.sheet, bySheet.get(v.sheet) ?? sheet);
    keyMap.set(v.key, r.key);
    x.sheet = sheet; x.commit = to.commit; x.key = r.key; delete x.src;
  }
  // Two old sheets that are one page now are one sheet: versions numbered again in the order they came.
  const seq = new Map<string, Map<string, number>>();
  for (const x of [...out.versions].sort((a: MockVersion, b: MockVersion) => a.at - b.at || a.id - b.id)) {
    if (!x.sheet.startsWith(`@${HOME_NAME}/`)) continue;
    const m = seq.get(x.sheet) ?? new Map<string, number>(); seq.set(x.sheet, m);
    if (!m.has(x.key)) m.set(x.key, m.size + 1);
    x.v = m.get(x.key);
  }
  const rename = (s: string) => bySheet.get(s) ?? s;
  const places: Record<string, { branch: number | null; parent: string | null }> = {};
  for (const [k, p] of Object.entries(out.places ?? {}) as [string, { branch: number | null; parent: string | null }][]) {
    const n = rename(k); if (places[n]) continue;
    places[n] = { branch: p.branch, parent: p.parent ? rename(p.parent) : null };
    if (places[n]!.parent === n) places[n]!.parent = null;
  }
  out.places = places;
  const meta: Record<string, unknown> = {};
  for (const [k, m] of Object.entries(out.meta ?? {})) { const n = rename(k); meta[n] = { ...(m as object), ...((meta[n] as object) ?? {}) }; }
  out.meta = meta;
  const bare = (s: string) => s.replace(/^@[^/]+\//, '');
  const bareMap = new Map([...bySheet].map(([a, b]) => [bare(a), bare(b)]));
  for (const e of out.stageLog ?? []) { if (keyMap.has(e.key)) e.key = keyMap.get(e.key); if (bareMap.has(e.sheet)) e.sheet = bareMap.get(e.sheet); }
  out.repos = { ...(out.repos ?? {}), [HOME_NAME]: HOME };
  writeFileSync(OUT, JSON.stringify(out));
  // Every version opens? (its page is in the home at its commit)
  const bad = out.versions.filter((x: MockVersion) => x.sheet.startsWith(`@${HOME_NAME}/`) && git(HOME, 'cat-file', '-t', `${x.commit}:${x.sheet.slice(HOME_NAME.length + 2)}`) !== 'blob');
  const marks = out.versions.filter((x: MockVersion) => x.stage).length;
  console.log(`written ${OUT}: ${out.versions.length} versions, ${out.versions.filter((x: MockVersion) => x.sheet.startsWith('@' + HOME_NAME + '/')).length} from the home, ${bad.length} that would not open, ${marks} marks (were ${raw.versions.filter((x: MockVersion) => x.stage).length})`);
}
