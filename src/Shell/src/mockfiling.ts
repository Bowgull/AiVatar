// Sheet 107 (his interview, 2026-10-30: "I don't need both, I only need the one"): how Mockups files a sheet. Projects
// are real projects only (Samara, Aang, Waymark, Couch Mode, Showcase, and any new one he starts), topics live inside
// them, and one sheet is one sheet: the same number in the same project is the same sheet, however it arrived (a live
// page, ?v=2, a repo file). Plain functions on plain data, so the tidy-once of his mockups.json is tested on its own.
import path from 'node:path';
import { sheetLabel } from './mockuptidy.ts';

/** The projects Mockups knows by name, in the order their tabs stand. Any other project gets its own tab after them. */
export const KNOWN_PROJECTS = ['Samara', 'Aang', 'Waymark', 'Couch Mode', 'Showcase'];
/** Where a sheet's project cannot be told at all (a live page nobody named). */
export const NO_PROJECT = 'Other';
/** The topic a sheet sits in when nobody gave it one. */
export const NO_TOPIC = 'Other';
/** The filing version written into mockups.json once his mockups were tidied for sheet 107. */
export const FILED = 107;

const BRANCH_MAX = 40;
const words = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
/** A slug made readable, first word capitalised only ("address-bar" is "Address bar"); a name already written stays. */
export function plainName(name: string): string {
  const n = String(name ?? '').replace(/\s+/g, ' ').trim();
  if (!/[-_]/.test(n) && n !== n.toLowerCase()) return n.slice(0, BRANCH_MAX);
  const s = n.replace(/[-_.]+/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase().replace(/\b(tv|ui|ai)\b/g, (w) => w.toUpperCase());
  return (s.charAt(0).toUpperCase() + s.slice(1)).slice(0, BRANCH_MAX);
}
/** Names that were used as projects but are not one of their own. */
const PROJECT_WORDS: Record<string, string> = { samara: 'Samara', aang: 'Aang', waymark: 'Waymark', 'couch mode': 'Couch Mode', couch: 'Couch Mode', showcase: 'Showcase',
  'aivatar': 'Samara', 'aivatar fixes': 'Samara', aangapp: 'Samara', 'anti slop': 'Anti-slop' };
/** A project's one name: "couch-mode" is Couch Mode, "AiVatar Fixes" is Samara (Samara's own repo); "Live pages" is no project. */
export function projectName(name: unknown): string | null {
  if (typeof name !== 'string') return null;
  const w = words(name);
  if (!w || w === 'live pages') return null;
  if (isSamaraRepo(name.trim())) return 'Samara';            // AiVatar-update and the other worktrees, the PC's AangApp
  return PROJECT_WORDS[w] ?? plainName(name);
}
/** Is this project name one Mockups knows by name (or Samara's repo by another name)? */
export const isKnownProject = (name: string): boolean => Boolean(PROJECT_WORDS[words(name)]);

/** Samara's own repo: the Mac's AiVatar (and its worktrees, AiVatar-fixes...), the PC's AangApp. */
export const isSamaraRepo = (name: string): boolean => /^(aivatar|aangapp)([-_.].*)?$/i.test(name);
/**
 * Does this sheet live in Samara's repo: its own (no @), @AiVatar..., or a live page serving its docs/cockpit sheets.
 * Those keep their plain numbers (106); every other project's numbers wear its letter (W75, C06).
 */
export function inSamaraRepo(src: string): boolean {
  if (/^https?:/i.test(src)) { try { return /\/docs\/cockpit\/sheet-[0-9]/i.test(new URL(src).pathname); } catch { return false; } }
  if (src.startsWith('@')) return isSamaraRepo(src.slice(1, src.indexOf('/')));
  return true;
}

/**
 * Old branch names that were really a project (or a project and a topic), from before sheet 107. A name not here that
 * starts with a project's name ("samara-notices", "aang-marks") is that project's topic.
 */
const OLD_BRANCHES: Record<string, [string, string | null]> = {
  'campfire scene': ['Couch Mode', 'Campfire'],
  'mac home': ['Aang', 'Mac home'],
  'anti slop': ['Anti-slop', null],
};
/**
 * Where an old branch belongs now: its project (null: not decided by the branch) and its topic (null: none of its own).
 * His topics keep their words, made readable ("address-bar" is "Address bar", "samara-notices" is "Notices").
 */
export function branchHome(name: string, project?: string | null): { project: string | null; topic: string | null } {
  const w = words(name);
  const old = OLD_BRANCHES[w];
  if (old) return { project: old[0], topic: old[1] };
  const asProject = PROJECT_WORDS[w];
  if (asProject) return { project: asProject, topic: null };
  for (const [k, p] of Object.entries(PROJECT_WORDS)) {
    if (w.startsWith(k + ' ') && w.length > k.length + 1) return { project: p, topic: plainName(w.slice(k.length + 1)) };
  }
  return { project: projectName(project ?? null), topic: plainName(name) };
}

/** A title without the "(v2)" Claude once put in it: the versions are the sheet's versions, not its name. */
export const cleanTitle = (title: string): string => String(title ?? '').replace(/\s*\(v\s*[0-9]+\)\s*$/i, '').trim();

/**
 * A sheet's number as Mockups shows it: Samara's and Aang's plain (106, 101: both are numbered in Samara's repo), W75 for
 * Waymark, C06 for Couch Mode; '' when it has none.
 */
export function shownNum(project: string, title: string, src: string): string {
  const n = sheetLabel(cleanTitle(title), src).num;
  if (!n) return '';
  return inSamaraRepo(src) || project === 'Samara' || project === 'Aang' ? n : (project.replace(/[^A-Za-z]/g, '').charAt(0).toUpperCase() || '') + n;
}
/** Two sheets are the same sheet when this is the same and not '': the project and the number it shows. */
export const sheetIdent = (project: string, title: string, src: string): string => {
  const n = shownNum(project, title, src);
  return n ? `${project.toLowerCase()}\n${n.toLowerCase()}` : '';
};

/** A sheet's project from where its file lives, when no topic says otherwise. */
export function projectFromSrc(src: string, repoProjects: Map<string, string> = new Map()): string {
  if (/^https?:/i.test(src)) return inSamaraRepo(src) ? 'Samara' : NO_PROJECT;
  if (!src.startsWith('@')) return repoProjects.get('') ?? 'Samara';
  const repo = src.slice(1, src.indexOf('/'));
  return repoProjects.get(repo) ?? (isSamaraRepo(repo) ? 'Samara' : plainName(path.basename(repo)));
}

// ------------------------------------------------------------------ the tidy-once (sheet 107)
export interface FileVersion { id: number; sheet: string; title: string; commit: string; at: number; key: string; v: number; src?: string }
export interface FileBranch { id: number; name: string; folded: boolean; project?: string; icon?: string }
export interface FilePlace { branch: number | null; parent: string | null }
export interface FileState<V extends FileVersion = FileVersion> {
  versions: V[]; branches: FileBranch[]; places: Record<string, FilePlace>; meta: Record<string, Record<string, unknown>>;
  projects?: Record<string, string>;
}
export interface FileReport { merged: number; moved: number; topics: number }

/**
 * His mockups, filed once for sheet 107. Every sheet gets a real project and a topic inside it; sheets with the same
 * number in the same project become one sheet (the repo's file wins as its name, else the newest), their versions
 * numbered again in the order they came, each keeping the address it opens from (src); titles lose "(v2)". Nothing is
 * deleted: every version is still there.
 */
export function fileOnce<V extends FileVersion>(inp: FileState<V>): { state: FileState<V>; report: FileReport } {
  const report: FileReport = { merged: 0, moved: 0, topics: 0 };
  const versions = inp.versions.map((x) => ({ ...x, title: cleanTitle(x.title) }));
  const places = new Map(Object.entries(inp.places).map(([k, v]) => [k, { ...v }]));
  const meta = new Map(Object.entries(inp.meta).map(([k, v]) => [k, { ...v }]));
  const repoProjects = new Map(Object.entries(inp.projects ?? {}));
  const oldBranch = new Map(inp.branches.map((b) => [b.id, b]));
  const placeOf = (s: string) => { const p = places.get(s); return p?.parent ? places.get(p.parent)?.branch ?? null : p?.branch ?? null; };
  const sheets = [...new Set(versions.map((x) => x.sheet))];
  const newest = (s: string) => versions.filter((x) => x.sheet === s).sort((a, b) => b.at - a.at || b.id - a.id)[0]!;

  // 1. Each sheet's project and topic: its old branch says, else where its file lives.
  const home = new Map<string, { project: string; topic: string }>();
  for (const s of sheets) {
    const b = oldBranch.get(placeOf(s) ?? -1);
    const h = b ? branchHome(b.name, b.project) : { project: null, topic: null };
    const src = newest(s).src ?? s;
    home.set(s, { project: h.project ?? projectFromSrc(src, repoProjects), topic: h.topic ?? NO_TOPIC });
  }

  // 2. One sheet per number per project.
  const groups = new Map<string, string[]>();
  for (const s of sheets) {
    const n = newest(s), id = sheetIdent(home.get(s)!.project, n.title, n.src ?? s);
    if (id) groups.set(id, [...(groups.get(id) ?? []), s]);
  }
  for (const members of groups.values()) {
    if (members.length < 2) continue;
    const live = (s: string) => /^https?:/i.test(s);
    const canon = [...members].sort((a, b) => Number(live(a)) - Number(live(b)) || newest(b).at - newest(a).at)[0]!;
    for (const s of members) {
      if (s === canon) continue;
      for (const x of versions) if (x.sheet === s) { if (!x.src) x.src = s; x.sheet = canon; }
      // The kept sheet's place and notes stay; a note only the other one had joins it.
      const m = meta.get(s);
      if (m) { meta.set(canon, { ...m, ...(meta.get(canon) ?? {}) }); meta.delete(s); }
      for (const [k, p] of places) if (p.parent === s) p.parent = canon;
      places.delete(s);
      home.delete(s);
      report.merged++;
    }
    // Its versions numbered again, in the order they came: the same picture from the same address keeps one number.
    const mine = versions.filter((x) => x.sheet === canon).sort((a, b) => a.at - b.at || a.id - b.id);
    const nums = new Map<string, number>();
    for (const x of mine) { const k = (x.src ?? x.sheet) + '\n' + x.key; if (!nums.has(k)) nums.set(k, nums.size + 1); x.v = nums.get(k)!; }
  }

  // 3. The topics again: one per project and name, keeping the old branch's id and icon where one maps to it.
  const branches: FileBranch[] = [];
  const topicId = new Map<string, number>();
  let seq = inp.branches.reduce((m, b) => Math.max(m, b.id), 0);
  const want = (project: string, topic: string, from: FileBranch | undefined): number => {
    const k = project.toLowerCase() + '\n' + topic.toLowerCase();
    let id = topicId.get(k);
    if (id === undefined) {
      id = from && !branches.some((b) => b.id === from.id) ? from.id : ++seq;
      branches.push({ id, name: topic, folded: false, project, ...(from?.icon ? { icon: from.icon } : {}) });
      topicId.set(k, id);
    }
    // An icon any old branch of that name had, even one whose sheets were all merged away.
    const b = branches.find((x) => x.id === id)!;
    if (!b.icon) {
      const icon = from?.icon ?? inp.branches.find((o) => { const h = branchHome(o.name, o.project); return o.icon && h.topic?.toLowerCase() === topic.toLowerCase() && (h.project ?? project) === project; })?.icon;
      if (icon) b.icon = icon;
    }
    return id;
  };
  for (const [s, h] of home) {
    const old = placeOf(s), from = oldBranch.get(old ?? -1);
    const p = places.get(s) ?? { branch: null, parent: null };
    if (p.parent && places.has(p.parent)) continue;
    const id = want(h.project, h.topic, from && branchHome(from.name, from.project).topic ? from : undefined);
    if (id !== old) report.moved++;
    places.set(s, { branch: id, parent: null });
  }
  report.topics = branches.length;
  return { state: { versions, branches, places: Object.fromEntries(places), meta: Object.fromEntries(meta), ...(inp.projects ? { projects: { ...inp.projects } } : {}) }, report };
}
