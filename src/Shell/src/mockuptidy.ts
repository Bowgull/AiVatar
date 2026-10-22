// The MOCKUPS trail's tidy (his ask, 2026-10-22: "organize the mockups in Samara too, it seems to be getting out of
// control ... a cleanup function that's somehow smart and won't eat my quota"). Plain code only, no model at all: every
// rule below is a comparison of names, numbers, times and git ids, so it costs nothing and gives the same answer twice.
//
// What it does, and the one promise under all of it: NOTHING IS EVER DELETED. A folded version is still in the list (one
// click shows it), a merged duplicate keeps its times on the line it joined, an archived sheet keeps every version and
// comes back with one click (Restore).
//   1. MERGE   the same picture of the same sheet twice (same key, or same commit) becomes one line; the newest stays, the
//              older lines' times ride along on it (`seen`).
//   2. FOLD    a sheet shows its newest KEEP (3) versions; older ones go into an "older" fold under it (`old`).
//   3. GONE    a sheet whose file is no longer in its repo at HEAD goes to the Archive (its history line stays, marked).
//   4. STALE   a sheet not opened for 14 days that a newer sheet supersedes (the same file name after the number, or the
//              same title) goes to the Archive. Never one that is open in a tab, picked/decided, or that he restored.
// Exported pieces are pure (no files, no git): the Shell gathers what git says and hands it in. The unit test drives it.
import path from 'node:path';

/** One version line as mockups.json keeps it (the subset the tidy reads and writes). */
export interface TidyVersion { id: number; sheet: string; title: string; commit: string; at: number; key: string; v: number; old?: boolean; seen?: number[] }
/** What the tidy keeps about a whole sheet. */
export interface SheetMeta {
  /** When it went to the Archive (absent: not archived). */
  archived?: number;
  /** Why: 'gone' (not in the repo any more), 'stale' (superseded and untouched), 'hand' (he archived it). */
  why?: 'gone' | 'stale' | 'hand';
  /** The sheet that superseded it (why 'stale'). */
  by?: string;
  /** He restored it: the tidy never archives it again on its own. */
  kept?: boolean;
  /** He marked it picked by hand (or unmarked: false). Absent: whatever the sheet itself says (decided). */
  picked?: boolean;
  /** The sheet itself says it is decided (a "decided" strip or a DECIDED stamp in its newest version), and which version was read. */
  decided?: boolean; dkey?: string;
  /** The last time he opened it (a tab showed it). */
  opened?: number;
}
export interface TidyReport { merged: number; folded: number; archived: number; gone: number; back: number }
export const TIDY_KEEP = 3, TIDY_STALE_DAYS = 14, DAY = 86_400_000;

// ------------------------------------------------------------------ names
/** A sheet's number and letter from its file (sheet-45g-click.html: 45, g), or null. */
export function fileNum(sheet: string): { n: number; letter: string } | null {
  const m = /^sheet-([0-9]+)([a-z]?)(?=[-.])/i.exec(path.posix.basename(sheet));
  return m ? { n: Number(m[1]), letter: m[2]!.toLowerCase() } : null;
}
/** The file's own words after the number: sheet-45c-frames.html is "frames"; a page without a number, its whole name. */
export function slugOf(sheet: string): string {
  const b = path.posix.basename(sheet).replace(/\.html?$/i, '');
  return b.replace(/^sheet-[0-9]+[a-z]?-?/i, '').toLowerCase();
}
/**
 * One consistent name for a sheet (2026-10-22): "59 · Spotify mini player" whatever shape the title came in ("Sheet 59 -
 * Spotify mini player", "59 · ...", "59: ...", or just "Spotify mini player" with the number from the file). Number and
 * letter come from the title when it has one, else from the file; the name is the rest, else the file's words.
 */
export function sheetLabel(title: string, sheet: string): { num: string; name: string; label: string } {
  let t = String(title ?? '').replace(/\s+/g, ' ').trim();
  let num = '';
  // "Sheet 59 - x", "Sheet 59 x", "59 · x", "59: x", "59" alone; never "3D views" (a number glued to a word is a name).
  const m = /^sheet\s+([0-9]+[a-z]?)(?:\s*[·\-–—:|.]\s*|\s+|$)/i.exec(t) ?? /^([0-9]+[a-z]?)(?:\s*[·\-–—:|]\s*|\.\s+|$)/i.exec(t);
  if (m) { num = m[1]!.toLowerCase(); t = t.slice(m[0].length).trim(); }
  const f = fileNum(sheet);
  if (!num && f) num = f.n + f.letter;
  let name = t;
  if (!name) {
    const s = slugOf(sheet).replace(/[-_]+/g, ' ').trim();
    name = s ? s[0]!.toUpperCase() + s.slice(1) : path.posix.basename(sheet);
  }
  name = name.slice(0, 80);
  return { num, name, label: num ? `${num} · ${name}` : name };
}
/** The words that make two titles "the same" (any case, any punctuation). */
const nameKey = (title: string, sheet: string) => sheetLabel(title, sheet).name.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
/** Which repo a sheet comes from: '' (AangApp), the name after @, or 'live'. */
export const spaceOf = (sheet: string): string => (sheet.startsWith('@') ? sheet.slice(1, sheet.indexOf('/')) : /^https?:/i.test(sheet) ? 'live' : '');
/** Does the sheet say it is decided? Its "decided" strip (class="decided") or a DECIDED stamp. */
export function saysDecided(html: string): boolean {
  return /class\s*=\s*["'][^"']*\bdecided\b/i.test(html) || />\s*DECIDED\s*</.test(html);
}
/** Is it picked: his own mark wins; else what the sheet says. */
export const isPicked = (m: SheetMeta | undefined): boolean => (m?.picked !== undefined ? m.picked : m?.decided === true);

// ------------------------------------------------------------------ the tidy
export interface TidyIn {
  versions: TidyVersion[];
  meta: Record<string, SheetMeta>;
  /** The sheets open in a tab now (never archived by the tidy). */
  open: Set<string>;
  /** Is the sheet's file in its repo at HEAD: true, false, or null (not known: a live page, a repo that is not there). */
  exists: (sheet: string) => boolean | null;
  now: number;
  keep?: number;
  staleDays?: number;
}
/** The tidy itself: new lists (the inputs are not changed) and what it did. */
export function tidyMockups(inp: TidyIn): { versions: TidyVersion[]; meta: Record<string, SheetMeta>; report: TidyReport } {
  const keep = Math.max(1, inp.keep ?? TIDY_KEEP), stale = (inp.staleDays ?? TIDY_STALE_DAYS) * DAY, now = inp.now;
  const report: TidyReport = { merged: 0, folded: 0, archived: 0, gone: 0, back: 0 };
  const meta: Record<string, SheetMeta> = {};
  for (const [k, v] of Object.entries(inp.meta)) meta[k] = { ...v };
  const newestFirst = (a: TidyVersion, b: TidyVersion) => b.at - a.at || b.id - a.id;

  // 1. MERGE: one line per picture per sheet. Same key = same picture; a live page has no commit to compare.
  const kept = new Map<string, TidyVersion>(), byCommit = new Map<string, TidyVersion>();
  const out: TidyVersion[] = [];
  for (const x of [...inp.versions].sort(newestFirst)) {
    const k = x.sheet + '\n' + x.key, c = x.commit ? x.sheet + '\n' + x.commit : '';
    const into = kept.get(k) ?? (c ? byCommit.get(c) : undefined);
    if (into) {
      into.seen = [...new Set([...(into.seen ?? []), x.at, ...(x.seen ?? [])])].sort((a, b) => b - a).slice(0, 50);
      report.merged++;
      continue;
    }
    const y: TidyVersion = { ...x, ...(x.seen ? { seen: [...x.seen] } : {}) };
    kept.set(k, y); if (c) byCommit.set(c, y);
    out.push(y);
  }

  // 2. FOLD: the newest `keep` of each sheet stay out; older ones fold. A line that comes back into the newest unfolds.
  const bySheet = new Map<string, TidyVersion[]>();
  for (const x of out) bySheet.set(x.sheet, [...(bySheet.get(x.sheet) ?? []), x]);
  for (const list of bySheet.values()) {
    list.forEach((x, i) => {
      if (i >= keep) { if (!x.old) { x.old = true; report.folded++; } }
      else if (x.old) delete x.old;
    });
  }

  // 3. GONE: the file is not in its repo any more. Back again: it leaves the Archive by itself.
  const newestAt = (s: string) => (bySheet.get(s)?.[0]?.at ?? 0);
  for (const s of bySheet.keys()) {
    const m = meta[s] ?? (meta[s] = {});
    const e = inp.exists(s);
    if (m.archived && m.why === 'gone' && e === true) { delete m.archived; delete m.why; report.back++; continue; }
    if (m.archived || m.kept || inp.open.has(s) || e !== false) continue;
    m.archived = now; m.why = 'gone'; report.gone++;
  }

  // 4. STALE: untouched for two weeks and superseded by a newer sheet of the same repo (same words after the number, or
  //    the same title). The newer one must itself still be in the trail, and later (by number, else by time).
  const live = [...bySheet.keys()].filter((s) => !meta[s]?.archived);
  const order = (s: string) => { const f = fileNum(s); return f ? f.n * 100 + (f.letter ? f.letter.charCodeAt(0) - 96 : 0) : -1; };
  const later = (t: string, s: string) => { const a = order(t), b = order(s); return a >= 0 && b >= 0 ? a > b : newestAt(t) > newestAt(s); };
  for (const s of live) {
    const m = meta[s]!;
    if (m.kept || isPicked(m) || inp.open.has(s)) continue;
    const touched = Math.max(newestAt(s), m.opened ?? 0);
    if (now - touched < stale) continue;
    const slug = slugOf(s), nk = nameKey(bySheet.get(s)![0]!.title, s);
    const by = live.find((t) => t !== s && !meta[t]?.archived && spaceOf(t) === spaceOf(s) && later(t, s) && newestAt(t) > newestAt(s)
      && ((slug.length >= 3 && slugOf(t) === slug) || (nk.length >= 3 && nameKey(bySheet.get(t)![0]!.title, t) === nk)));
    if (!by) continue;
    m.archived = now; m.why = 'stale'; m.by = by; report.archived++;
  }
  // Empty meta records are not kept.
  for (const [k, v] of Object.entries(meta)) if (!Object.keys(v).length) delete meta[k];
  return { versions: out.sort((a, b) => a.id - b.id), meta, report };
}

/** The one line he reads after a tidy: "Folded 12 old versions, merged 3 duplicates, archived 2." Empty when it did nothing. */
export function tidyLine(r: TidyReport): string {
  const n = (k: number, one: string, many = one + 's') => `${k} ${k === 1 ? one : many}`;
  const parts: string[] = [];
  if (r.folded) parts.push(`folded ${n(r.folded, 'old version')}`);
  if (r.merged) parts.push(`merged ${n(r.merged, 'duplicate')}`);
  if (r.archived + r.gone) parts.push(`archived ${r.archived + r.gone}` + (r.gone ? ` (${r.gone} gone from the repo)` : ''));
  if (r.back) parts.push(`brought back ${n(r.back, 'sheet')}`);
  if (!parts.length) return '';
  const s = parts.join(', ');
  return s[0]!.toUpperCase() + s.slice(1) + '.';
}
/** Due: never tidied, or the last one was a day or more ago. */
export const tidyDue = (last: number, now: number): boolean => !(last > 0) || now - last >= DAY || now < last;
