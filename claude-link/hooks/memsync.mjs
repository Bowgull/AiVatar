// @ts-nocheck: plain JavaScript on purpose (any Node runs it from Claude Code's hooks, no build); its tests check it
// (src/Shell/test/memsync.test.ts, on the Mac and on Windows).
// What Claude remembers, the same on his Mac and on Shadow (his picks, 2026-10-29). Run by Claude Code's own hooks:
// when a session starts (bring in the other machine's notes), and when Claude finishes a turn (send what changed; it
// does nothing at all when nothing changed). Plain Node, no packages: it runs from Samara's copy of this mod on both
// machines, so Samara's update engine keeps it current.
//
// What travels, through his PRIVATE repo aang-data, on a branch of its own ("memory", so it never meets Aang's backups):
//   memory/<project>/...   Claude's memory for every project, matched by project name (the Mac's and the PC's folders
//                          are named after different paths); MEMORY.md indexes are merged line by line
//   rules/CLAUDE.md        his rules for every Claude session
//   handoff/...            the handoff file, reports and research notes
// A clash (the same note changed on both machines): the newest wins and the other is kept beside it, listed in that
// project's MEMORY.md, so nothing is lost. A note removed on one machine goes to the other machine's Trash.
//
// Run: node memsync.mjs start [cwd] | turn | sync
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, statSync, utimesSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const REMOTE = 'https://github.com/Bowgull/aang-data.git';
export const BRANCH = 'memory';
const MAX_BYTES = 2 * 1024 * 1024;
const TEXT = /\.(md|txt|json|html)$/i;

/** This machine's places. Tests pass their own. */
export function places(home = os.homedir(), platform = process.platform) {
  const mac = platform === 'darwin';
  const base = mac ? path.join(home, 'Library', 'Application Support', 'AangListener', 'memsync') : path.join(process.env.LOCALAPPDATA ?? path.join(home, 'AppData', 'Local'), 'Aang', 'memsync');
  return {
    machine: mac ? 'mac' : platform === 'win32' ? 'pc' : platform,
    projects: path.join(home, '.claude', 'projects'),
    rules: path.join(home, '.claude', 'CLAUDE.md'),
    // On the Mac the handoff lives in ~/Handoff/aang; on the PC in Aang's own data folder.
    handoff: mac ? path.join(home, 'Handoff', 'aang') : path.join(home, 'Documents', 'Aang'),
    repo: path.join(base, 'repo'), state: path.join(base, 'state.json'), lock: path.join(base, 'lock'),
    trash: mac ? path.join(home, '.Trash') : null,
  };
}

/** Claude Code's folder name for a working folder: every character that is not a letter or a digit becomes "-". */
export const folderKey = (cwd) => String(cwd).replace(/[^A-Za-z0-9]/g, '-');
/** One name per project on every machine: the folder after the home folder and the usual parent folders. */
export function projectOf(key) {
  if (/(^|-)(private-tmp|var-folders|AppData-Local-Temp|Library-Application-Support|scratchpad)(-|$)/i.test(key)) return null;
  let s = key.replace(/^-?(Users|home)-[^-]+-/, '').replace(/^[A-Za-z]--Users-[^-]+-/, '');
  s = s.replace(/^(Handoff|projects|Documents|Desktop|code|src)-/i, '');
  const name = s.toLowerCase().replace(/^-+|-+$/g, '');
  if (!name) return null;
  return { aangapp: 'aang', aivatar: 'aang', 'aivatar-fixes': 'aang' }[name] ?? name;
}

const hash = (b) => createHash('sha256').update(b).digest('hex');
function walk(dir, rel = '', out = new Map()) {
  let ents = []; try { ents = readdirSync(path.join(dir, rel), { withFileTypes: true }); } catch { return out; }
  for (const e of ents) {
    if (e.name.startsWith('.')) continue;
    const r = rel ? `${rel}/${e.name}` : e.name;
    if (e.isDirectory()) walk(dir, r, out);
    else if (e.isFile() && TEXT.test(e.name)) { const f = path.join(dir, r); const st = statSync(f); if (st.size <= MAX_BYTES) out.set(r, f); }
  }
  return out;
}

/**
 * Every synced place on this machine, as repo path -> local file (existing or where it would go). `wantCwd`: the
 * session starting now, so its project's memory folder is made and filled even before it has one.
 */
export function localMap(p, wantCwd) {
  const map = new Map();
  const add = (repoRel, file) => { if (!map.has(repoRel)) map.set(repoRel, []); map.get(repoRel).push(file); };
  const folders = [];
  try { for (const k of readdirSync(p.projects)) { const proj = projectOf(k); if (proj) folders.push({ dir: path.join(p.projects, k, 'memory'), proj }); } } catch { /* none */ }
  if (wantCwd) { const k = folderKey(wantCwd), proj = projectOf(k); if (proj && !folders.some((f) => f.dir === path.join(p.projects, k, 'memory'))) folders.push({ dir: path.join(p.projects, k, 'memory'), proj }); }
  for (const f of folders) for (const [r, file] of walk(f.dir)) add(`memory/${f.proj}/${r}`, file);
  if (existsSync(p.rules)) add('rules/CLAUDE.md', p.rules);
  for (const part of ['HANDOFF-MAC.md', 'reports', 'research_notes']) {
    const f = path.join(p.handoff, part);
    if (!existsSync(f)) continue;
    if (statSync(f).isFile()) add(`handoff/${part}`, f); else for (const [r, file] of walk(f)) add(`handoff/${part}/${r}`, file);
  }
  // A project with more than one folder here: every note of it in every one of them, so each index's links all work.
  for (const [rel, fs] of map) {
    const m = /^memory\/([^/]+)\/(.+)$/.exec(rel);
    if (!m) continue;
    for (const f of folders.filter((x) => x.proj === m[1])) {
      const want = path.join(f.dir, ...m[2].split('/'));
      if (fs.includes(want)) continue;
      if (!existsSync(want)) { mkdirSync(path.dirname(want), { recursive: true }); cpSync(fs[0], want, { preserveTimestamps: true }); }
      fs.push(want);
    }
  }
  unify(map);
  return { map, folders };
}
/**
 * One project can have more than one memory folder on a machine (the Mac's Waymark: its handoff folder and its code
 * folder). The same note in both, different: an index becomes one merged list in both; any other note, the newest in
 * both and the older kept beside it, so nothing on this machine is ever silently overwritten.
 */
function unify(map) {
  for (const [rel, fs] of map) {
    if (fs.length < 2) continue;
    const bufs = fs.map((f) => readFileSync(f));
    if (bufs.every((b) => b.equals(bufs[0]))) continue;
    const order = fs.map((f, i) => ({ f, b: bufs[i], at: statSync(f).mtimeMs })).sort((a, b) => b.at - a.at);
    if (/(^|\/)MEMORY\.md$/.test(rel)) {
      const merged = Buffer.from(order.slice(1).reduce((t, x) => mergeIndex(t, x.b.toString()), order[0].b.toString()));
      for (const x of order) writeFileSync(x.f, merged);
      continue;
    }
    for (const x of order.slice(1)) if (!x.b.equals(order[0].b)) writeFileSync(x.f.replace(/(\.[^./\\]+)$/, `.clash-here-${stamp()}$1`), x.b);
    for (const x of order.slice(1)) writeFileSync(x.f, order[0].b);
  }
}
/** Where a repo path goes on this machine when it is new here (every memory folder of that project, or none). */
function targetsFor(repoRel, p, folders) {
  if (repoRel === 'rules/CLAUDE.md') return [p.rules];
  if (repoRel.startsWith('handoff/')) return existsSync(p.handoff) ? [path.join(p.handoff, ...repoRel.slice(8).split('/'))] : [];
  const m = /^memory\/([^/]+)\/(.+)$/.exec(repoRel);
  return m ? folders.filter((f) => f.proj === m[1]).map((f) => path.join(f.dir, ...m[2].split('/'))) : [];
}

/** Two MEMORY.md indexes as one: the first one's lines in order, then the other's lines it does not already link. */
export function mergeIndex(a, b) {
  const link = (l) => (/\]\(([^)]+)\)/.exec(l) ?? [])[1] ?? l.trim();
  const al = a.replace(/\s+$/, '').split('\n'), seen = new Set(al.map(link));
  const extra = b.split('\n').filter((l) => l.trim() && !seen.has(link(l)));
  return [...al, ...extra].join('\n') + '\n';
}

const git = (repo, args, opts = {}) => execFileSync('git', ['-C', repo, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 60_000, ...opts }).trim();
function ensureRepo(p, remote) {
  if (existsSync(path.join(p.repo, '.git'))) return;
  mkdirSync(path.dirname(p.repo), { recursive: true });
  execFileSync('git', ['init', '-q', p.repo], { stdio: 'ignore' });
  git(p.repo, ['remote', 'add', 'origin', remote]);
  git(p.repo, ['checkout', '-q', '-b', BRANCH]);
}
function toTrash(p, file) {
  try { trash(p, file); } catch { /* below */ }
  // The Trash would not take it: kept in a folder of the sync's own instead, never left (it would come back next sync).
  if (existsSync(file)) { try { const d = path.join(path.dirname(p.state), 'removed'); mkdirSync(d, { recursive: true }); renameSync(file, path.join(d, `${Date.now()}-${path.basename(file)}`)); } catch { /* left */ } }
}
function trash(p, file) {
  try {
    if (p.trash) { mkdirSync(p.trash, { recursive: true }); renameSync(file, path.join(p.trash, `${path.basename(file, path.extname(file))} (from ${new Date().toISOString().slice(0, 10)} sync ${Date.now() % 100000})${path.extname(file)}`)); return; }
    // Windows: the Recycle Bin, never a plain delete.
    execFileSync('powershell', ['-NoProfile', '-Command', `Add-Type -AssemblyName Microsoft.VisualBasic; [Microsoft.VisualBasic.FileIO.FileSystem]::DeleteFile('${file.replace(/'/g, "''")}', 'OnlyErrorDialogs', 'SendToRecycleBin')`], { stdio: 'ignore', timeout: 20_000 });
  } catch { /* the fallback above */ }
}
const readState = (p) => { try { return JSON.parse(readFileSync(p.state, 'utf8')); } catch { return { files: {}, fetched: 0 }; } };
const stamp = () => new Date().toISOString().replace(/[-:]/g, '').slice(0, 13);

/**
 * One sync. Local files are the truth for this machine; the repo is the meeting place. For each path: changed only here
 * goes up, changed only there comes down, changed on both is a clash (newest wins, the other kept beside it; a MEMORY.md
 * is merged instead). Returns what it did.
 */
export function sync(p, o = {}) {
  const remote = o.remote ?? REMOTE, now = o.now ?? Date.now();
  mkdirSync(path.dirname(p.lock), { recursive: true });
  try { mkdirSync(p.lock); } catch { try { if (now - statSync(p.lock).mtimeMs < 120_000) return { skipped: 'another sync is running' }; rmSync(p.lock, { recursive: true, force: true }); mkdirSync(p.lock); } catch { return { skipped: 'locked' }; } }
  const did = { up: 0, down: 0, clash: 0, removed: 0 };
  try {
    ensureRepo(p, remote);
    for (let attempt = 0; attempt < 3; attempt++) {
      let has = true;
      try { git(p.repo, ['fetch', '-q', 'origin', BRANCH]); git(p.repo, ['reset', '-q', '--hard', 'FETCH_HEAD']); }
      catch { has = false; }                       // no memory branch yet: this machine starts it
      const st = readState(p), was = st.files ?? {};
      const idxFile = path.join(p.repo, 'index.json');
      let idx = {}; try { idx = JSON.parse(readFileSync(idxFile, 'utf8')); } catch { /* first */ }
      const repoFiles = walk(p.repo); repoFiles.delete('index.json');
      const { map, folders } = localMap(p, o.cwd);
      const all = new Set([...repoFiles.keys(), ...map.keys(), ...Object.keys(was)]);
      const files = {};
      let changed = false;
      for (const rel of all) {
        const locals = map.get(rel) ?? [];
        const lf = locals[0], lb = lf ? readFileSync(lf) : null, L = lb ? hash(lb) : null;
        const rf = repoFiles.get(rel), rb = rf ? readFileSync(rf) : null, R = rb ? hash(rb) : null;
        const S = was[rel] ?? null;
        const putRepo = (b, at) => { const f = path.join(p.repo, ...rel.split('/')); mkdirSync(path.dirname(f), { recursive: true }); writeFileSync(f, b); idx[rel] = { at, by: p.machine }; changed = true; };
        const putLocal = (b, at) => {
          const outs = locals.length ? locals : targetsFor(rel, p, folders);
          for (const f of outs) { mkdirSync(path.dirname(f), { recursive: true }); writeFileSync(f, b); try { const t = new Date(at); utimesSync(f, t, t); } catch { /* fine */ } }
          return outs.length > 0;
        };
        if (L === R) { if (L) files[rel] = L; continue; }
        const localAt = lf ? statSync(lf).mtimeMs : 0, repoAt = Date.parse(idx[rel]?.at ?? '') || 0;
        if (L === S) {                                             // only the repo changed
          if (!R) { for (const f of locals) toTrash(p, f); did.removed++; continue; }
          if (putLocal(rb, repoAt || now)) { files[rel] = R; did.down++; }
          continue;
        }
        if (R === S) {                                             // only here changed
          if (!L) { rmSync(path.join(p.repo, ...rel.split('/')), { force: true }); delete idx[rel]; changed = true; did.removed++; continue; }
          putRepo(lb, new Date(localAt).toISOString()); files[rel] = L; did.up++;
          continue;
        }
        // Both changed (or both new and different).
        if (!L || !R) {                                            // removed on one, changed on the other: the change stays
          if (L) { putRepo(lb, new Date(localAt).toISOString()); files[rel] = L; did.up++; }
          else if (putLocal(rb, repoAt || now)) { files[rel] = R; did.down++; }
          continue;
        }
        if (/\/MEMORY\.md$/.test(rel)) {                           // an index: one list with both machines' lines
          const merged = Buffer.from(localAt >= repoAt ? mergeIndex(lb.toString(), rb.toString()) : mergeIndex(rb.toString(), lb.toString()));
          putRepo(merged, new Date(now).toISOString()); putLocal(merged, now); files[rel] = hash(merged); did.clash++;
          continue;
        }
        const mine = localAt >= repoAt, win = mine ? lb : rb, lose = mine ? rb : lb, loser = mine ? (idx[rel]?.by ?? 'other') : p.machine;
        const keep = rel.replace(/(\.[^./]+)$/, `.clash-${loser}-${stamp()}$1`);
        putRepo(win, new Date(now).toISOString()); putLocal(win, now); files[rel] = hash(win);
        const kf = path.join(p.repo, ...keep.split('/')); mkdirSync(path.dirname(kf), { recursive: true }); writeFileSync(kf, lose); idx[keep] = { at: new Date(now).toISOString(), by: loser };
        for (const f of locals.length ? locals : targetsFor(rel, p, folders)) writeFileSync(path.join(path.dirname(f), path.basename(keep)), lose);
        files[keep] = hash(lose);
        // Listed in that project's index, so the next session sees it and merges the two.
        const m = /^memory\/([^/]+)\/(.+)$/.exec(rel);
        if (m) for (const f of folders.filter((x) => x.proj === m[1])) {
          const ix = path.join(f.dir, 'MEMORY.md'); let t = ''; try { t = readFileSync(ix, 'utf8'); } catch { /* none */ }
          const line = `- [Clash: ${path.basename(rel)}](${path.basename(keep)}) — ${loser === p.machine ? "this machine's" : "the other machine's"} older version; merge it into ${path.basename(rel)}, then remove it`;
          if (!t.includes(path.basename(keep))) writeFileSync(ix, mergeIndex(t, line));
        }
        did.clash++; changed = true;
      }
      if (changed || !has) {
        writeFileSync(idxFile, JSON.stringify(idx, null, 1) + '\n');
        git(p.repo, ['add', '-A']);
        try { git(p.repo, ['-c', 'user.name=Aang memory sync', '-c', 'user.email=aang@localhost', 'commit', '-q', '-m', `Memory sync from the ${p.machine}: ${did.up} up, ${did.down} down, ${did.clash} clashes, ${did.removed} removed`]); } catch { /* nothing to commit */ }
        try { git(p.repo, ['push', '-q', 'origin', `HEAD:${BRANCH}`]); }
        catch { if (attempt < 2) continue; return { ...did, error: 'push failed (offline?); it goes next time' }; }
      }
      // What every path that is now the same here and in the repo holds: the next sync tells "changed here" from
      // "changed there" by it. A file made during this sync (a copy kept beside a clash here) is not in it yet, so the
      // next sync sends it up instead of taking it for one removed on the other machine.
      writeFileSync(p.state, JSON.stringify({ files, fetched: now }));
      return did;
    }
    return did;
  } finally { rmSync(p.lock, { recursive: true, force: true }); }
}

/** Anything here changed since the last sync (no network)? */
export function changedHere(p) {
  const was = readState(p).files ?? {};
  const { map } = localMap(p);
  for (const [rel, fs] of map) if (was[rel] !== hash(readFileSync(fs[0]))) return true;
  return Object.keys(was).some((rel) => !map.has(rel));
}

// ---- run by Claude Code's hooks
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const mode = process.argv[2] ?? 'sync';
  let input = {}; try { input = JSON.parse(readFileSync(0, 'utf8') || '{}'); } catch { /* no input */ }
  if (process.env.AANG_TEST || process.env.AANG_LINK_OFF) process.exit(0);
  const p = places();
  try {
    if (mode === 'turn') {
      // After each turn: only when a note changed here, or the other machine has not been asked for 15 minutes.
      if (!changedHere(p) && Date.now() - (readState(p).fetched ?? 0) < 15 * 60_000) process.exit(0);
    }
    const r = sync(p, { cwd: process.argv[3] ?? input.cwd });
    if (mode === 'start' && (r.down || r.clash)) console.log(`Memory synced from the other machine: ${r.down} notes in${r.clash ? `, ${r.clash} clashes kept side by side` : ''}.`);
  } catch (e) { console.error('memory sync: ' + (e && e.message)); }
  process.exit(0);
}
