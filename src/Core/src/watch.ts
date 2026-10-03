// Phase 7: the bit that actually runs. research.ts, mentions.ts and addons.ts are engines; this starts
// them, decides whether there is anything worth saying, and writes the result down.
//
// The hard rule throughout: SAY NOTHING unless there is something. A weekly digest that arrives every
// week saying "nothing much this week" trains him to ignore it, and then the one week it matters he will
// ignore that too. Both jobs here return an empty string when there is no news, and an empty string is
// never announced.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import type { Fetch } from './google.ts';
import { behind, addonDirs, installed, sayBehind } from './addons.ts';
import { Mentions, namesInWith, weekOf } from './mentions.ts';
import { sweep } from './research.ts';
import type { Finding } from './research.ts';
import { VAULT_WRITABLE } from './files.ts';

export interface WatchDeps {
  fetch: Fetch;
  db: DatabaseSync | null;
  stateDir: string;
  /** Where WoW lives. Absent on a machine without it, which is not an error. */
  wowRoot?: string;
  /** The local model, for reading titles. Absent means fall back to the regex. */
  askLocal?: (prompt: string, opts?: { system?: string; maxTokens?: number }) => Promise<{ ok: boolean; text: string }>;
  now?: () => Date;
}

const WOW_DEFAULT = 'C:\\Program Files (x86)\\World of Warcraft';

/** The CurseForge key, or null. Absent is normal and silent: everything else still works without it. */
export function curseforgeKey(stateDir: string): string | null {
  try {
    const p = path.join(stateDir, 'curseforge.json');
    if (!existsSync(p)) return null;
    // utf-8 with a BOM is what PowerShell writes if anyone edits the setup script carelessly, and
    // JSON.parse refuses it outright. Strip it rather than fail over a byte nobody can see.
    const raw = readFileSync(p, 'utf8').replace(/^\uFEFF/, '');
    const key = String(JSON.parse(raw).apiKey ?? '').trim();
    return key || null;
  } catch (e) {
    console.error('addons: curseforge.json could not be read: ' + (e as Error).message);
    return null;
  }
}

/**
 * The addon check, once per day at most.
 *
 * Joshua, asked directly, 2026-10-03: when AANG starts, not when WoW starts. So this runs on startup
 * and the once-a-day guard is what stops a day of restarts turning into a day of nagging.
 *
 * Returns what to say, or '' for nothing. It never writes to his game folder, and there is no code here
 * that could.
 */
export async function checkAddons(deps: WatchDeps): Promise<string> {
  const now = (deps.now ?? (() => new Date()))();
  const today = now.toISOString().slice(0, 10);
  const done = deps.db ? readMeta(deps.db, 'addonsCheckedOn') : null;
  if (done === today) return '';

  const root = deps.wowRoot ?? WOW_DEFAULT;
  const dirs = addonDirs(root);
  if (dirs.length === 0) return '';                 // no WoW: not a fault, just nothing to do

  const key = curseforgeKey(deps.stateDir);
  if (!key) return '';                              // no key: say nothing rather than nag about setup

  let said = '';
  try {
    const all = dirs.flatMap(d => installed(d));
    const old = await behind(deps.fetch, key, all);
    said = sayBehind(old);
    if (said) said += ' Ask me about any of them and I will tell you what it does and what changed.';
  } catch (e) {
    console.error('addons: the check failed: ' + (e as Error).message);
    return '';
  }
  if (deps.db) writeMeta(deps.db, 'addonsCheckedOn', today);
  return said;
}

/**
 * The weekly sweep: look, name, remember, and say only what repeats.
 *
 * Once a week, and guarded by the week key rather than a timer, so restarting Aang six times on a Monday
 * sweeps once. Everything it finds goes into the mention table; only what has come up at least three
 * times gets said out loud, because that is the signal he asked for and the raw list is not.
 */
export async function weeklySweep(deps: WatchDeps): Promise<{ said: string; note: string; found: number }> {
  const now = (deps.now ?? (() => new Date()))();
  const week = weekOf(now);
  if (!deps.db) return { said: '', note: '', found: 0 };
  if (readMeta(deps.db, 'sweptWeek') === week) return { said: '', note: '', found: 0 };

  let found: Finding[] = [];
  try { found = await sweep(deps.fetch, 7); }
  catch (e) { console.error('research: the sweep failed: ' + (e as Error).message); return { said: '', note: '', found: 0 }; }
  if (found.length === 0) return { said: '', note: '', found: 0 };

  const m = new Mentions(deps.db);
  // The local model reads the titles, on his own card, for nothing. It refuses while a game is running,
  // and namesInWith falls back to the regex rather than failing - a worse name list beats no sweep.
  let names: Map<string, string[]> | undefined;
  if (deps.askLocal) {
    try { names = await namesInWith(deps.askLocal, found.slice(0, 40)); }
    catch (e) { console.error('research: naming failed, using the plain reader: ' + (e as Error).message); }
  }
  m.note(found, now, names);
  m.prune(16, now);
  writeMeta(deps.db, 'sweptWeek', week);

  const repeats = m.repeated(3, 4, now);
  const note = digestNote(found, repeats, now);
  if (repeats.length === 0) return { said: '', note, found: found.length };

  // Said out loud: only the few that are genuinely repeating, newest interest first.
  const top = repeats.slice(0, 3).map(r => `${r.name} (${r.times}x${r.weeks > 1 ? ` over ${r.weeks} weeks` : ''})`);
  const said = `Something keeps coming up: ${top.join(', ')}. I wrote up this week's sweep in your vault.`;
  return { said, note, found: found.length };
}

/** The write-up. Markdown, in his vault, because that is where he already looks things up. */
function digestNote(found: Finding[], repeats: { name: string; times: number; weeks: number; sources: string }[], now: Date): string {
  const when = now.toISOString().slice(0, 10);
  const bySource = (s: Finding['source']) => found.filter(f => f.source === s);
  const line = (f: Finding) => `- [${f.title}](${f.url})${f.score ? ` — ${f.score}` : ''}${f.licence ? ` · ${f.licence}` : ''}${f.blurb ? `\n  ${f.blurb}` : ''}`;

  const parts = [
    '---', 'tags: [aang, research]', `date: ${when}`, '---', '',
    `# What came up, week of ${weekOf(now)}`, '',
    `Swept ${found.length} things from GitHub, Hacker News and arXiv. Aang wrote this; nothing here is checked.`, '',
  ];
  if (repeats.length) {
    parts.push('## Keeps coming up', '',
      'Mentioned at least three times. This is the part worth reading - a single popular repository is noise, the same name in three places is not.', '');
    for (const r of repeats.slice(0, 10)) parts.push(`- **${r.name}** — ${r.times} times over ${r.weeks} week${r.weeks === 1 ? '' : 's'} (${r.sources})`);
    parts.push('');
  }
  for (const [label, src] of [['New on GitHub', 'github'], ['Hacker News', 'hn'], ['Papers', 'arxiv'], ['Reddit', 'reddit']] as const) {
    const list = bySource(src);
    if (!list.length) continue;
    parts.push(`## ${label}`, '');
    for (const f of list.slice(0, 12)) parts.push(line(f));
    parts.push('');
  }
  return parts.join('\n');
}

/** Put the digest in his vault. Failing to write a note must never lose the sweep that produced it. */
export function saveDigest(note: string, now = new Date()): string {
  if (!note.trim()) return '';
  try {
    const dir = path.join(VAULT_WRITABLE, 'Research');
    mkdirSync(dir, { recursive: true });
    const file = path.join(dir, `Week of ${weekOf(now)}.md`);
    writeFileSync(file, note, 'utf8');
    return file;
  } catch (e) {
    console.error('research: could not write the digest to the vault: ' + (e as Error).message);
    return '';
  }
}

function readMeta(db: DatabaseSync, k: string): string | null {
  try { return (db.prepare('SELECT v FROM meta WHERE k = ?').get(k) as { v: string } | undefined)?.v ?? null; }
  catch { return null; }
}
function writeMeta(db: DatabaseSync, k: string, v: string): void {
  try { db.prepare('INSERT INTO meta (k, v) VALUES (?,?) ON CONFLICT(k) DO UPDATE SET v = excluded.v').run(k, v); }
  catch (e) { console.error('watch: could not remember that it ran: ' + (e as Error).message); }
}
