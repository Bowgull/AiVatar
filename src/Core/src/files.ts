// Writing and changing files, the way Claude Code does it: write a whole file, or replace one exact piece of
// text that must appear exactly once. Asked once, then trusted (Joshua's call, 2026-09-21).
//
// Two things Claude Code does not need and Aang does:
//  - Every change is undoable. The file as it was is copied aside first, so "undo that" always has something
//    to go back to - he acts on Joshua's own machine, often while Joshua is in a game and not watching.
//  - Some files are never his to write, whatever was agreed: his own trust list (writing it would let him
//    grant himself permissions), his memory database and state, and Windows itself.
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, realpathSync, rmSync, statSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { writeFileAtomic } from './atomic.ts';

/** The path's real, on-disk identity - following any symlink or NTFS junction to what it actually points at,
 *  not just what the string says. `refusal()` must check THIS, not the raw path: a shortcut named notmydb.txt
 *  that points at aang.db has to be caught exactly as surely as aang.db itself, and neither path.resolve() nor
 *  a suffix regex on the given name follows a link to find that out. A file that does not exist yet cannot be
 *  resolved directly, so its parent directory is resolved instead (still catching a junction *directory* aimed
 *  at a protected area) and the file's own name is kept as given. */
function realish(file: string): string {
  const abs = path.resolve(file);
  try { return realpathSync.native(abs); } catch { /* does not exist yet - keep trying */ }
  try { return path.join(realpathSync.native(path.dirname(abs)), path.basename(abs)); }
  catch { return abs; }                                  // the parent doesn't exist either; nothing left to resolve
}

/** Where the before-copies go, one per change, newest last. */
export const UNDO_DIR = process.env.AANG_UNDO_DIR
  ?? path.join(process.env.LOCALAPPDATA ?? path.join(os.homedir(), 'AppData', 'Local'), 'Aang', 'undo');
const MAX_BYTES = 2_000_000;

export interface Protected { stateDir: string; dataDir: string }

/**
 * Joshua's Obsidian vault, and the one folder inside it Aang may write to.
 *
 * He reads the whole vault. He writes to `10_Projects/Aang` and nowhere else, and that is enforced here
 * rather than asked for, because the failure mode actually documented for agents editing vaults is not
 * "noise" - it is writing to the WRONG NOTE, the one next to the one it retrieved. A rule in the write gate
 * makes that impossible by construction instead of unlikely by good behaviour.
 *
 * 1,088 of the 1,183 notes are old AI session handoffs. The ~95 Joshua wrote himself are the asset, and
 * they sit outside his folder, so they are covered.
 */
export const VAULT_DIR = process.env.AANG_VAULT_DIR
  ?? path.join(process.env.USERPROFILE ?? 'C:\\Users\\Shadow', 'Documents', 'CereBro-Vault');

/**
 * The folder Obsidian actually opens, which is NOT the repository root.
 *
 * The repository holds 1,188 notes and 566 MB, but 548 MB of that is 1,111 session transcripts averaging
 * nearly 2 MB each. Pointing Obsidian at the whole thing was tried on 2026-10-02 and left it using 2.5 GB
 * of memory and seven minutes of CPU, still indexing. The 73 notes Joshua actually works in come to 11 MB
 * and open instantly. So: Aang READS the whole repository, including every transcript, because that is
 * where search earns its keep; Obsidian opens only the working vault; and Aang WRITES only to his own
 * folder inside it, so he still appears in Joshua's graph.
 */
export const VAULT_WORKING = path.join(VAULT_DIR, '07_Knowledge', 'obsidian-vault');
export const VAULT_WRITABLE = path.join(VAULT_WORKING, '10_Projects', 'Aang');

/**
 * Folder names that are somebody else's, matched by name wherever they appear.
 *
 * Joshua's instruction, given twice and without qualification: "My Drive contains a folder called
 * `Lindsay's Job Hunt`. That is someone else's data. Exclude it explicitly and permanently."
 *
 * Until now that instruction existed only as a sentence in a document. A sentence in a document is
 * advice; this is the rule. Found on 2026-10-01 that there are TWO such folders, which is why this
 * matches by name rather than by path:
 *   - `Lindsay's Job Hunt`, owned by Joshua, sitting in his own My Drive. This is the one that
 *     actually lands on this disk when Drive mirrors.
 *   - `🎯 Lindsay's Job Hunt`, owned by her and shared with him. The emoji is why the comparison
 *     normalises rather than testing equality: a rule written for the plain name would miss it.
 * Matching by name also covers the folder being moved, renamed around, or shared again later, which
 * a fixed path would not.
 */
const SOMEONE_ELSES = ["lindsay's job hunt"];

/**
 * Her name on a file, as opposed to a mention of her in Joshua's own work.
 *
 * Sweeping the real mounted Drive on 2026-10-01 found two files of hers sitting at the TOP level of
 * My Drive, outside her folder, which the folder rule above does not reach:
 *     Lindsay Bell - CV.pdf
 *     Lindsay Bell - CV.gdoc
 *
 * The same sweep found why a bare "lindsay" match would be wrong:
 *     CereBro-Vault/.../Sundesk Session Handoff - Lindsay Launch Checklist.md
 * That one is Joshua's own project note about a launch, and blocking it would hide his work from him
 * with no explanation, which is how a rule stops being trusted.
 *
 * So the test is her full name or her address, not her first name. It catches anything she sends or
 * shares later under the same naming ("Lindsay Bell - Resume.docx"), and leaves his notes alone.
 */
const HER_NAME = /(^|[^a-z])lindsay bell([^a-z]|$)|lindsaybelldesign/;

/**
 * Other people whose documents are in Joshua's Drive, by full name.
 *
 * Joshua's own profile.md already said this, as a sentence addressed to Aang: "resumes named
 * Lindsay Bell / Robin Scott are other people's files - ignore." A sentence in a file Aang reads is
 * an instruction he may or may not follow; this is the version that holds whatever he is told by a
 * document he reads later.
 *
 * `Robin_Scott_Resume.pdf` is in My Drive today and was readable until 2026-10-01, found while
 * checking whether profile.md named anyone else. It did, and nobody had acted on it.
 *
 * Add a full name here, never a first name: the first-name version blocked Joshua's own
 * "Lindsay Launch" project notes, which is how a rule stops being trusted. Underscores and hyphens
 * are handled by plainName(), so Robin_Scott_Resume.pdf matches "robin scott".
 */
const OTHER_PEOPLE = [/(^|[^a-z])lindsay bell([^a-z]|$)/, /(^|[^a-z])robin scott([^a-z]|$)/];

/**
 * Fold a path segment down to just its words, so a name still matches after someone has decorated
 * it. Strips emoji and punctuation, turns curly apostrophes into straight ones (Google Docs and
 * Windows both produce them), lowercases, and collapses runs of space.
 */
function plainName(segment: string): string {
  return segment
    .normalize('NFKD')
    .replace(/[‘’ʼ]/g, "'")      // curly and modifier apostrophes
    .toLowerCase()
    .replace(/[^a-z0-9']+/g, ' ')               // emoji, punctuation, separators
    .trim()
    .replace(/\s+/g, ' ');
}

/**
 * Why Aang may not touch this path at all, read or write, or null if he may.
 *
 * Separate from refusal() below, which is about writing. These are places whose CONTENTS are not his
 * to see: other people's data, and the credential stores that would let one bad read become a much
 * worse day. Nothing here was covered before 2026-10-01: refusal() protected his own state, his
 * database and Windows, and reads were not path-checked at all.
 */
export function offLimits(file: string): string | null {
  const full = realish(file);                   // follow shortcuts first, or a link bypasses every rule below
  const lower = full.toLowerCase();
  const segments = full.split(/[\\/]+/);

  for (const seg of segments) {
    const name = plainName(seg);
    if (SOMEONE_ELSES.includes(name)) return 'that folder is someone else\'s, and it is not mine to open';
    if (HER_NAME.test(name) || OTHER_PEOPLE.some(re => re.test(name))) return 'that is someone else\'s file, and it is not mine to open';
  }

  const home = os.homedir().toLowerCase();
  const under = (dir: string) => { const d = path.resolve(dir).toLowerCase(); return lower === d || lower.startsWith(d + path.sep); };

  // Keys and tokens. Reading any of these once is enough to matter, so they are refused rather than
  // asked about: a question Joshua might wave through mid-raid is not a control.
  if (under(path.join(home, '.ssh'))) return 'those are your SSH keys';
  if (under(path.join(home, '.aws'))) return 'those are your AWS credentials';
  if (under(path.join(home, '.gnupg'))) return 'those are your GPG keys';
  // ~/.claude holds the credentials Aang himself signs in with, plus every session transcript on this
  // machine - 722 of them when this was written. A document that could get him to read his own
  // transcripts could get him to read anything he has ever been told.
  if (under(path.join(home, '.claude'))) return 'that is my own Claude login and session history';
  if (/[\\/]\.env(\.[^\\/]*)?$/.test(lower)) return 'a .env file holds keys and passwords';

  // Browser profiles: Login Data, Cookies and Local State are where saved passwords and session
  // cookies live. The whole profile folder goes, because the file names move between versions.
  if (/[\\/](user data|profiles)[\\/]/.test(lower) && /(chrome|edge|brave|opera|vivaldi|chromium|firefox|mozilla)/.test(lower))
    return 'that is a browser profile, where saved passwords and cookies are kept';

  return null;
}

/** Why this path may not be written, or null if it may. */
export function refusal(file: string, p: Protected): string | null {
  // Anything nobody may touch certainly may not be written to.
  const never = offLimits(file);
  if (never) return never;
  const full = realish(file).toLowerCase();
  const under = (dir: string) => { const d = path.resolve(dir).toLowerCase(); return full === d || full.startsWith(d + path.sep); };
  if (under(p.stateDir)) return 'that is my own settings and permissions folder, and I never write to it myself';
  if (under(path.join(p.dataDir, 'aang.db')) || /[\\/]aang\.db(-wal|-shm)?$/.test(full)) return 'that is my memory database; memory changes go through remember and forget';
  if (under(UNDO_DIR)) return 'that is where my undo copies are kept';
  // Read the whole vault, write only to my own folder in it. Everything else there is Joshua's.
  if (under(VAULT_DIR) && !under(VAULT_WRITABLE)) {
    return 'that is Joshua\'s vault. I read it, but the only part of it I write to is 10_Projects/Aang';
  }
  const win = process.env.SystemRoot ?? 'C:\\Windows';
  for (const sys of [win, process.env.ProgramFiles ?? 'C:\\Program Files', process.env['ProgramFiles(x86)'] ?? 'C:\\Program Files (x86)', process.env.ProgramData ?? 'C:\\ProgramData']) {
    if (under(sys)) return 'that is part of Windows or an installed program';
  }
  if (!path.isAbsolute(file)) return 'give the full path, starting with the drive, so there is no doubt which file it is';
  return null;
}

let seq = 0;
/** Copy the file as it is now into the undo folder. Returns where it went, or null for a new file. */
function keepCopy(file: string, now = new Date()): string | null {
  if (!existsSync(file)) return null;
  mkdirSync(UNDO_DIR, { recursive: true });
  const stamp = now.toISOString().replace(/[:.]/g, '-');
  const dest = path.join(UNDO_DIR, `${stamp}-${String(++seq).padStart(4, '0')}__${path.basename(file)}`);
  copyFileSync(file, dest);
  writeFileAtomic(dest + '.from', file);                 // where it came back from, for undo
  return dest;
}

export interface FileResult { ok: boolean; detail: string }

export function writeWhole(file: string, content: string, p: Protected): FileResult {
  const no = refusal(file, p);
  if (no) return { ok: false, detail: `I did not write it: ${no}.` };
  if (Buffer.byteLength(content) > MAX_BYTES) return { ok: false, detail: 'That is too large to write in one go.' };
  try {
    mkdirSync(path.dirname(file), { recursive: true });
    const before = keepCopy(file);
    writeFileAtomic(file, content);
    return { ok: true, detail: before ? `Wrote ${file}. The old version is kept, so it can be undone.` : `Created ${file}.` };
  } catch (e) { return { ok: false, detail: `Could not write it: ${(e as Error).message}` }; }
}

/** Replace one exact piece of text. It must appear exactly once, or nothing changes. */
export function editExact(file: string, oldText: string, newText: string, p: Protected): FileResult {
  const no = refusal(file, p);
  if (no) return { ok: false, detail: `I did not change it: ${no}.` };
  if (!existsSync(file)) return { ok: false, detail: `There is no file at ${file}.` };
  if (statSync(file).size > MAX_BYTES) return { ok: false, detail: 'That file is too large to edit this way.' };
  if (!oldText) return { ok: false, detail: 'Say which text to replace.' };
  const text = readFileSync(file, 'utf8');
  // Windows files usually use CRLF, and the model almost always writes LF. Match either.
  const eol = text.includes('\r\n') ? '\r\n' : '\n';
  const find = oldText.replace(/\r?\n/g, eol), put = newText.replace(/\r?\n/g, eol);
  const count = text.split(find).length - 1;
  if (count === 0) return { ok: false, detail: 'That text is not in the file, so nothing was changed. Read the file again and copy the text exactly.' };
  if (count > 1) return { ok: false, detail: `That text is in the file ${count} times, so nothing was changed. Include more of the surrounding text so it is only there once.` };
  try {
    keepCopy(file);
    writeFileAtomic(file, text.replace(find, () => put));
    return { ok: true, detail: `Changed ${file}. The old version is kept, so it can be undone.` };
  } catch (e) { return { ok: false, detail: `Could not change it: ${(e as Error).message}` }; }
}

/** Put back the most recent change: to this file if one is named, otherwise whatever was changed last. */
export function undoLast(file?: string): FileResult {
  let entries: string[] = [];
  try { entries = readdirSync(UNDO_DIR).filter(f => f.endsWith('.from')).sort(); } catch { /* none yet */ }
  for (let i = entries.length - 1; i >= 0; i--) {
    const meta = path.join(UNDO_DIR, entries[i]!);
    const original = readFileSync(meta, 'utf8');
    if (file && path.resolve(original).toLowerCase() !== path.resolve(file).toLowerCase()) continue;
    const copy = meta.slice(0, -'.from'.length);
    if (!existsSync(copy)) continue;
    try {
      writeFileAtomic(original, readFileSync(copy));
      // Used up: it is renamed so the next undo goes one further back rather than repeating this one.
      writeFileAtomic(meta + '.used', original);
      rmSync(meta, { force: true });
      return { ok: true, detail: `Put ${original} back to how it was before the last change.` };
    } catch (e) { return { ok: false, detail: `Could not undo it: ${(e as Error).message}` }; }
  }
  return { ok: false, detail: file ? `I have no earlier version of ${file}.` : 'I have not changed any files, so there is nothing to undo.' };
}

