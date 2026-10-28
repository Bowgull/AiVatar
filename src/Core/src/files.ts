// Writing and changing files, the way Claude Code does it: write a whole file, or replace one exact piece of
// text that must appear exactly once. Asked once, then trusted (Joshua's call, 2026-09-21).
//
// Two things Claude Code does not need and Aang does:
//  - Every change is undoable. The file as it was is copied aside first, so "undo that" always has something
//    to go back to - he acts on Joshua's own machine, often while Joshua is in a game and not watching.
//  - Some files are never his to write, whatever was agreed: his own trust list (writing it would let him
//    grant himself permissions), his memory database and state, and Windows itself.
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, realpathSync, rmSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import { writeFileAtomic } from './atomic.ts';

/** The path's real, on-disk identity - following any symlink or NTFS junction to what it actually points at,
 *  not just what the string says. `refusal()` must check THIS, not the raw path: a shortcut named notmydb.txt
 *  that points at aang.db has to be caught exactly as surely as aang.db itself, and neither path.resolve() nor
 *  a suffix regex on the given name follows a link to find that out. A file that does not exist yet cannot be
 *  resolved directly, so its nearest existing folder is resolved instead (still catching a junction *directory*
 *  aimed at a protected area) and the rest of the path is kept as given. */
function realish(file: string): string {
  const abs = path.resolve(file);
  // Walk up to the nearest folder that exists and resolve that, keeping the rest as given (2026-10-28: stopping at
  // the parent left a new file two folders down unresolved, so on the Mac, where /var is really /private/var, it
  // no longer matched a protected folder that had been resolved).
  const rest: string[] = [];
  for (let at = abs; ; at = path.dirname(at)) {
    try { return path.join(realpathSync.native(at), ...rest); }
    catch { /* does not exist yet - one folder up */ }
    if (path.dirname(at) === at) return abs;             // nothing on the way exists; nothing left to resolve
    rest.unshift(path.basename(at));
  }
}

/**
 * realish() for a protected FOLDER, remembered: the folders are a fixed handful, but a vault walk checks every file
 * against all of them, and resolving each one every time made a check four times slower (0.28 to 1.26 ms, 2026-10-28).
 */
const folderReal = new Map<string, string>();
function realFolder(dir: string): string {
  let r = folderReal.get(dir);
  if (r === undefined) { r = realish(dir).toLowerCase(); folderReal.set(dir, r); }
  return r;
}

/** Where the before-copies go, one per change, newest last. */
export const UNDO_DIR = process.env.AANG_UNDO_DIR
  ?? path.join(process.env.LOCALAPPDATA ?? path.join(os.homedir(), 'AppData', 'Local'), 'Aang', 'undo');
const MAX_BYTES = 2_000_000;

export interface Protected { stateDir: string; dataDir: string }

/** Aang's own settings folder (%APPDATA%\\Aang): his tokens live here. Never read by his tools (S2 2.19). */
const AANG_STATE = process.env.AANG_STATE_DIR ?? path.join(process.env.APPDATA ?? path.join(os.homedir(), 'AppData', 'Roaming'), 'Aang');
/** Aang's own source code, the security code included (S2 2.2). */
export const AANG_APP = process.env.AANG_APP_DIR ?? path.join(os.homedir(), 'Documents', 'AangApp');
const MAC = process.platform === 'darwin';
/** Where his code lives on the MacBook (the PC's is AANG_APP). */
const AANG_APP_MAC = path.join(os.homedir(), 'projects', 'AiVatar');
/**
 * Places a program can hide in so it runs again later (S2 2.3, MITRE T1547.001 and T1546.013): the Startup
 * folder, and the two folders PowerShell reads a profile from every time it starts.
 */
export function persistenceDirs(): string[] {
  const home = os.homedir();
  const roaming = process.env.APPDATA ?? path.join(home, 'AppData', 'Roaming');
  return [
    path.join(roaming, 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'Startup'),
    path.join(home, 'Documents', 'WindowsPowerShell'),
    path.join(home, 'Documents', 'PowerShell'),
    // The Mac's (2026-10-28): launchd's start-up folders, and the files every new shell runs (MITRE T1543.001, T1546.004).
    ...(MAC ? [
      path.join(home, 'Library', 'LaunchAgents'), '/Library/LaunchAgents', '/Library/LaunchDaemons',
      ...['.zshrc', '.zprofile', '.zshenv', '.zlogin', '.bashrc', '.bash_profile', '.profile'].map(f => path.join(home, f)),
    ] : []),
  ];
}

/**
 * The Mac's own places for keys (2026-10-28): before this, the rules only knew Windows paths, so on the MacBook
 * Aang's own settings (his Discord, Google and link keys), the Keychain and Chrome's saved passwords were not
 * guarded at all. Off limits like ~/.ssh: refused, never asked.
 */
export function macKeyDirs(): { dir: string; why: string }[] {
  if (!MAC) return [];
  const lib = path.join(os.homedir(), 'Library');
  const support = path.join(lib, 'Application Support');
  const mine = 'that is my own settings folder, where the keys to your accounts are kept';
  const browser = 'that is a browser profile, where saved passwords and cookies are kept';
  return [
    { dir: path.join(support, 'Aang'), why: mine },
    { dir: path.join(support, 'AangListener'), why: mine },
    { dir: path.join(lib, 'Keychains'), why: 'that is the Mac Keychain, where your passwords are kept' },
    { dir: path.join(lib, 'Cookies'), why: browser },
    ...['Google', 'BraveSoftware', 'Microsoft Edge', 'Vivaldi', 'Chromium', 'Firefox'].map(b => ({ dir: path.join(support, b), why: browser })),
  ];
}

/** Places on a Mac that belong to macOS or to installed programs. */
// Not all of /private: the Mac's temp folders live under /private/var/folders, and Aang writes scratch files there.
const MAC_SYSTEM = ['/System', '/Library', '/usr', '/bin', '/sbin', '/Applications', '/private/etc'];

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
 * Other people's data in Joshua's Drive, refused by name wherever it appears.
 *
 * Joshua's instruction, given twice and without qualification: a named person's job-hunt folder in
 * My Drive "is someone else's data. Exclude it explicitly and permanently." A sentence in a document
 * is advice; this is the rule. Sweeping the real Drive on 2026-10-01 found:
 *   - TWO copies of that folder (one his, one shared with him with an emoji in front of the name),
 *     which is why the match normalises names rather than testing paths;
 *   - two of her files at the top level of My Drive, outside the folder, so her full name on a file
 *     is refused too, and a handle she uses in file names;
 *   - a second person's resume, named in his profile as "other people's files - ignore".
 *
 * Only FINGERPRINTS of the names live here (sha256 of 'aang-offlimits:' + the normalised name). The
 * repo is public and the people this protects should not be named in it. The real names and paths
 * are checked by test/offlimits-real.test.ts against a local, untracked list.
 *
 * Full names only, never a first name: a first-name rule blocked Joshua's own project notes that
 * merely mention her, which is how a rule stops being trusted.
 */
const fingerprint = (plain: string) => createHash('sha256').update('aang-offlimits:' + plain).digest('hex').slice(0, 32);
/** Whole folder names (after plainName), e.g. "<first name>'s job hunt". */
const SOMEONE_ELSES = new Set(['fa7a0c3d810a61ead8bf7d373abc768b']);
/** Full names, two words, e.g. "first last". Underscores and hyphens fold to spaces. */
const OTHER_PEOPLE = new Set(['8e6b383830a40ea724146a8607ada6e1', '28fef172af47bc153673781069f637f7']);
/** Single-word handles that appear inside file names. */
const THEIR_HANDLES = new Set(['dad97b15db2c80c66397e3947ecb36f1']);

/** Add more off-limits names at run time (tests use made-up ones). Names are stored as fingerprints. */
export function alsoOffLimits(names: { folders?: string[]; people?: string[]; handles?: string[] }): void {
  for (const f of names.folders ?? []) SOMEONE_ELSES.add(fingerprint(plainName(f)));
  for (const n of names.people ?? []) OTHER_PEOPLE.add(fingerprint(plainName(n).split(/[^a-z]+/).filter(Boolean).join(' ')));
  for (const h of names.handles ?? []) THEIR_HANDLES.add(fingerprint(plainName(h)));
}

/** True when a normalised segment carries someone else's full name or handle as whole words. */
function namesSomeoneElse(name: string): boolean {
  const words = name.split(/[^a-z]+/).filter(Boolean);
  for (let i = 0; i < words.length; i++) {
    if (THEIR_HANDLES.has(fingerprint(words[i]))) return true;
    if (i + 1 < words.length && OTHER_PEOPLE.has(fingerprint(words[i] + ' ' + words[i + 1]))) return true;
  }
  return false;
}

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
    if (SOMEONE_ELSES.has(fingerprint(name))) return 'that folder is someone else\'s, and it is not mine to open';
    if (namesSomeoneElse(name)) return 'that is someone else\'s file, and it is not mine to open';
  }

  const home = os.homedir().toLowerCase();
  const under = (dir: string) => { const d = realFolder(dir); return lower === d || lower.startsWith(d + path.sep); };

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
  // S2 2.19: Aang's own settings folder holds the Google token, which can send mail as him, and the
  // Discord token. None of his own tools may read it, with or without a yes.
  if (under(AANG_STATE)) return 'that is my own settings folder, where the keys to your accounts are kept';
  for (const k of macKeyDirs()) if (under(k.dir)) return k.why;

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
  // The protected folder is followed through links too (2026-10-28): on the Mac /var is really /private/var, so a
  // file's real path never started with the folder's raw one and the guard silently let it through.
  const under = (dir: string) => { const d = realFolder(dir); return full === d || full.startsWith(d + path.sep); };
  if (under(p.stateDir)) return 'that is my own settings and permissions folder, and I never write to it myself';
  if (under(path.join(p.dataDir, 'aang.db')) || /[\\/]aang\.db(-wal|-shm)?$/.test(full)) return 'that is my memory database; memory changes go through remember and forget';
  if (under(UNDO_DIR)) return 'that is where my undo copies are kept';
  // S2 2.2: a page or a document must never be able to rewrite who Aang is or the code that keeps him
  // safe. Copilot was attacked exactly this way (CVE-2025-53773). Changes to himself go through
  // start_claude's "self" kind, on a branch Joshua reviews.
  // Read the whole vault, write only to my own folder in it. Everything else there is Joshua's.
  if (under(VAULT_DIR) && !under(VAULT_WRITABLE)) {
    return 'that is Joshua\'s vault. I read it, but the only part of it I write to is 10_Projects/Aang';
  }
  const win = process.env.SystemRoot ?? 'C:\\Windows';
  for (const sys of [win, process.env.ProgramFiles ?? 'C:\\Program Files', process.env['ProgramFiles(x86)'] ?? 'C:\\Program Files (x86)', process.env.ProgramData ?? 'C:\\ProgramData']) {
    if (under(sys)) return 'that is part of Windows or an installed program';
  }
  if (MAC && MAC_SYSTEM.some(under)) return 'that is part of macOS or an installed program';
  if (!path.isAbsolute(file)) return 'give the full path, starting with the drive, so there is no doubt which file it is';
  if (under(path.join(p.dataDir, 'Brain'))) return 'that is my Brain folder, who I am and what I know; it changes only through remember and correct';
  if (under(AANG_APP) || (MAC && under(AANG_APP_MAC))) return 'that is my own source code; changes to me go through a Claude session he reviews';
  if (persistenceDirs().some(under)) return 'that makes things run by themselves every time the computer or a shell starts';
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

