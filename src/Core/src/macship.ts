// The Mac update, put together (2026-10-20). These are the pieces the brain uses to build the signed update the
// MacBook runs, as plain functions with every path passed in, so the same update can also be built without the
// brain running: tools/push-mac.ts sends it straight to the Mac over SSH when Samara runs there alone. The brain
// (core.ts) calls these too, so there is one way to build an update, never two that can drift apart.
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { createHash, createPrivateKey, createPublicKey, generateKeyPairSync, randomBytes, sign as signBytes, type KeyObject } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { writeFileAtomic } from './atomic.ts';
import { releaseName } from './releasenames.ts';
import { macBrowserBundle, macSetupScript, macSourceVersion, FRONT_DESK_PORT, type DeskPayload, type MacRelease } from './macsetup.ts';

/** The front desk's files: what the Mac runs from Core/src, so they also count toward the version. */
export const DESK_FILES = ['frontdesk.ts', 'discord-client.ts', 'discord-logic.ts', 'macbrain.ts', 'macpowers.ts', 'macjobs.ts', 'weather.ts', 'briefcard.ts', 'google.ts', 'mail.ts', 'emailfacts.ts', 'attachments.ts', 'emailcard.ts', 'booking.ts', 'filters.ts', 'travel.ts', 'addresses.ts', 'lists.ts', 'atomic.ts', 'route.ts'];

/** git, run in the app's own repo; '' when it fails (the callers treat '' as "not there"). */
export function git(repoRoot: string, args: string[]): string {
  try { return execFileSync('git', args, { cwd: repoRoot, encoding: 'utf8', timeout: 10_000, stdio: ['ignore', 'pipe', 'ignore'] }).trim(); } catch { return ''; }
}

/**
 * The finished version, frozen (2026-10-14: his update key vanished while Claude was mid-work). The Mac's updates
 * are built only from a separate copy of the code at the commit Claude marked shipped (mac-ship), never from the
 * files being worked on, so work in progress can neither change nor withdraw what the Mac is offered. `dir` is where
 * that copy lives (a git worktree of the app's repo). `prune` tidies away copies that are gone first; the SSH push
 * skips it, because from Claude's shell the brain's own copy (in %APPDATA%) can look gone when it is not.
 */
export function releaseRoot(repoRoot: string, dataDir: string, dir: string, prune = true): string | null {
  let ship = ''; try { ship = readFileSync(path.join(dataDir, 'mac-ship'), 'utf8').trim(); } catch { return null; }
  if (!/^[0-9a-f]{7,40}$/.test(ship)) return null;
  if (!existsSync(path.join(dir, '.git'))) { if (prune) git(repoRoot, ['worktree', 'prune']); git(repoRoot, ['worktree', 'add', '--detach', '--force', dir, ship]); }
  else if (!git(repoRoot, ['-C', dir, 'rev-parse', 'HEAD']).startsWith(ship)) git(repoRoot, ['-C', dir, 'checkout', '--detach', '--force', ship]);
  return git(repoRoot, ['-C', dir, 'rev-parse', 'HEAD']).startsWith(ship) ? dir : null;
}

/** Which version a frozen copy is: the fingerprint of the files the Mac runs, and its commit. */
export function releaseOf(repoRoot: string, root: string): MacRelease {
  return { version: macSourceVersion(path.join(root, 'src', 'Shell'), path.join(root, 'src', 'Core', 'src'), DESK_FILES), commit: git(repoRoot, ['-C', root, 'rev-parse', '--short=12', 'HEAD']) };
}

/** The finished version's own setup code (loaded from the frozen copy, so it matches the files it sends). */
export interface Frozen { commit: string; root: string; setup: typeof macSetupScript; bundle: typeof macBrowserBundle }
export async function loadFrozen(root: string, commit: string): Promise<Frozen> {
  const m: typeof import('./macsetup.ts') = await import(pathToFileURL(path.join(root, 'src', 'Core', 'src', 'macsetup.ts')).href + '?c=' + commit);
  return { commit, root, setup: m.macSetupScript, bundle: m.macBrowserBundle };
}

/**
 * The PC's update stamp (code audit M4, 2026-10-14): an Ed25519 key kept in the state folder (never in his Aang
 * folder, which is backed up to git). Every Mac update is signed with it; the Mac keeps the public half and runs
 * nothing that does not match. Only the brain makes one (`create`): a second key made anywhere else would sign
 * updates the Mac refuses.
 */
export interface UpdateKey { key: KeyObject; pub: string }
export function loadUpdateKey(stateDir: string, create: boolean): UpdateKey {
  const file = path.join(stateDir, 'mac-update-sign.pem');
  let pem = '';
  try { pem = readFileSync(file, 'utf8'); } catch { /* first time */ }
  if (!pem) {
    if (!create) throw new Error(`no update key at ${file}`);
    pem = generateKeyPairSync('ed25519').privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
    mkdirSync(stateDir, { recursive: true }); writeFileAtomic(file, pem);
  }
  const key = createPrivateKey(pem);
  return { key, pub: createPublicKey(key).export({ type: 'spki', format: 'pem' }).toString() };
}

/** A secret shared with the MacBook, kept in the data folder (hook.key, mac-front.key, bsync.key). Made the first
 *  time only when `create`: anything else must use the one the Mac already has, or the Mac stops hearing the PC. */
export function readKey(dataDir: string, name: string, create: boolean): string {
  const file = path.join(dataDir, name);
  try { const k = readFileSync(file, 'utf8').trim(); if (k.length >= 20) return k; } catch { /* first run */ }
  if (!create) throw new Error(`no ${name} in ${dataDir}`);
  const k = randomBytes(18).toString('base64url');
  try { mkdirSync(dataDir, { recursive: true }); writeFileAtomic(file, k); } catch (e) { console.error(`could not save ${name}: ` + (e as Error).message); }
  return k;
}

/**
 * M3: the MacBook front desk's part of the setup, when Discord is set up here and the Mac's address is known.
 * `pcHalf`: the brain also writes this PC's half (frontdesk.json + frontdesk.key in the state folder), so its next start
 * drives Discord through the Mac instead of logging in itself: never two connections. Without it (the SSH push), the
 * state folder is only read, and a missing front desk key stops the update rather than making a new one.
 */
export interface DeskOpts {
  root: string; stateDir: string; macAddr: string | null; bundle: (shellDir: string) => Buffer;
  bsyncKey: () => string; pcHalf: boolean; log: (line: string) => void;
}
export function frontDeskFor(o: DeskOpts): DeskPayload | null {
  const tokenFile = path.join(o.stateDir, 'discord.token');
  const mac = o.macAddr;
  if (!mac || !existsSync(tokenFile)) return null;
  try {
    const token = readFileSync(tokenFile, 'utf8').trim();
    if (!token) return null;
    const keyFile = path.join(o.stateDir, 'frontdesk.key');
    let key = '';
    try { key = readFileSync(keyFile, 'utf8').trim(); } catch { /* first time */ }
    if (key.length < 20) {
      if (!o.pcHalf) throw new Error('no front desk key on this PC yet');
      key = randomBytes(24).toString('base64url'); writeFileAtomic(keyFile, key);
    }
    const here = path.join(o.root, 'src', 'Core', 'src'), pkg = path.join(here, '..', 'frontdesk-pkg');
    const files: Record<string, string | Buffer> = {
      'frontdesk.ts': readFileSync(path.join(here, 'frontdesk.ts'), 'utf8'),
      'discord-client.ts': readFileSync(path.join(here, 'discord-client.ts'), 'utf8'),
      'discord-logic.ts': readFileSync(path.join(here, 'discord-logic.ts'), 'utf8'),
      // M4: the Mac answering as Aang while this PC is off, and the small pieces it shares with this PC.
      ...Object.fromEntries(['macbrain.ts', 'macpowers.ts', 'macjobs.ts', 'weather.ts', 'briefcard.ts', 'google.ts', 'mail.ts', 'emailfacts.ts', 'attachments.ts', 'emailcard.ts', 'booking.ts', 'filters.ts', 'travel.ts', 'addresses.ts', 'lists.ts', 'atomic.ts', 'route.ts'].map(f => [f, readFileSync(path.join(here, f), 'utf8')])),
      'package.json': readFileSync(path.join(pkg, 'package.json'), 'utf8'),
      'package-lock.json': readFileSync(path.join(pkg, 'package-lock.json'), 'utf8'),
      // 9.D D4: the speakers' pictures, made once with their webhooks
      'avatar-claude.png': readFileSync(path.join(here, '..', 'assets', 'speakers', 'claude.png')),
      'avatar-jobhunt.png': readFileSync(path.join(here, '..', 'assets', 'speakers', 'jobhunt.png')),
    };
    // M6: Aang's browser for the Mac, packed from this PC's own Shell, and the key its sync uses.
    let browser: DeskPayload['browser'];
    try { browser = { bundle: o.bundle(path.join(here, '..', '..', 'Shell')), bsyncKey: o.bsyncKey(), castlabsSig: readFileSync(path.join(here, '..', '..', 'Shell', 'mac-pkg', 'castlabs-44.5.1-darwin-x64.sig')) }; }
    catch (e) { console.error('mac-setup: the Mac browser could not be packed: ' + (e as Error).message); }
    if (o.pcHalf) {
      writeFileAtomic(path.join(o.stateDir, 'frontdesk.json'), JSON.stringify({ mac, port: FRONT_DESK_PORT }));
      o.log(`mac-setup: the front desk goes to the MacBook (${mac}); Discord moves there at the next start`);
    }
    // M4b (his pick, 2026-10-13): his Gmail and Calendar on the Mac too, for while this PC is off.
    let google = '';
    try { google = readFileSync(path.join(o.stateDir, 'google.json'), 'utf8'); } catch { /* not signed in here */ }
    return { token, key, port: FRONT_DESK_PORT, files, ...(browser ? { browser } : {}), ...(google ? { google } : {}) };
  } catch (e) { console.error('mac-setup: front desk skipped: ' + (e as Error).message); return null; }
}

/** What each release brings, in his words: the frozen copy's Shell/whats-new.json plus the engine notes. */
export interface NewsItem { at: string; text: string; kind: string }
export function whatsNew(root: string, dataDir: string): NewsItem[] {
  const read = (f: string, list: (j: any) => any[]) => { try { return list(JSON.parse(readFileSync(f, 'utf8'))); } catch { return []; } };
  const all = [...read(path.join(root, 'src', 'Shell', 'whats-new.json'), j => j.items ?? []), ...read(path.join(dataDir, 'engine-notes.json'), j => (Array.isArray(j) ? j : []))];
  return all.filter((x: any) => typeof x?.text === 'string').map((x: any) => ({ at: String(x.at), text: String(x.text), kind: ['major', 'feature', 'fix'].includes(x.kind) ? x.kind : 'fix' })).sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
}

/** One named release in mac-releases.json (his Aang folder). */
export interface Rel { semver: string; name: string; version: string; commit: string; at: string }
export function readReleases(dataDir: string): Rel[] {
  try { const j = JSON.parse(readFileSync(path.join(dataDir, 'mac-releases.json'), 'utf8')); if (Array.isArray(j)) return j.filter((x: Rel) => typeof x?.semver === 'string'); } catch { /* the first */ }
  return [];
}
export function saveReleases(dataDir: string, list: Rel[]): void { writeFileAtomic(path.join(dataDir, 'mac-releases.json'), JSON.stringify(list, null, 1)); }

/** His versions (2026-10-14), Semantic Versioning: MAJOR.MINOR.PATCH. A big change starts a new major and a new
 *  character's name; a new feature bumps the middle number; a fix the last. Which it is comes from the plain-words
 *  lines this release adds (whats-new.json "kind": major, feature or fix). The first named release is 1.0.0 Gojo.
 *  Adds a new version to `list` (the caller saves it); `items` is asked for only when a new number is needed. */
export function releaseNo(list: Rel[], version: string, commit: string, items: () => NewsItem[]): { e: Rel; added: boolean } {
  const had = list.find(x => x.version === version);
  if (had) return { e: had, added: false };
  const last = list[list.length - 1];
  let semver = '1.0.0';
  if (last) {
    const [ma, mi, pa] = last.semver.split('.').map(Number) as [number, number, number];
    const kinds = items().filter(x => Date.parse(x.at) > Date.parse(last.at)).map(x => x.kind);
    semver = kinds.includes('major') ? `${ma + 1}.0.0` : kinds.includes('feature') ? `${ma}.${mi + 1}.0` : `${ma}.${mi}.${pa + 1}`;
  }
  const e = { semver, name: releaseName(Number(semver.split('.')[0])), version, commit, at: new Date().toISOString() };
  list.push(e);
  return { e, added: true };
}

/** His ask (2026-10-14): one readable history of Samara, every version and what it brought, in his Aang folder
 *  (Aang reads it there) and copied to the Mac with every update. Written from mac-releases.json + whats-new.json. */
export function changelogText(list: { semver: string; name: string; at: string }[], items: NewsItem[]): string {
  const day = (iso: string) => new Date(iso).toLocaleDateString('en-CA', { timeZone: 'America/Toronto', year: 'numeric', month: 'long', day: 'numeric' });
  const tag = (k: string) => (k === 'major' ? 'Big change' : k === 'feature' ? 'New' : 'Fix');
  const out = ['# Samara Changelog', '', "Every version of Samara, Aang's browser, and what it brought. Newest first. Versions go MAJOR.MINOR.PATCH: a big change starts a new number and a new character's name, a new feature bumps the middle number, a fix the last.", ''];
  const pending = list.length ? items.filter(i => Date.parse(i.at) > Date.parse(list[list.length - 1]!.at)) : items;
  if (pending.length) out.push('## Coming next (not released yet)', '', ...pending.map(i => `- ${tag(i.kind)}: ${i.text}`), '');
  for (let k = list.length - 1; k >= 0; k--) {
    const r = list[k]!, from = k > 0 ? Date.parse(list[k - 1]!.at) : -Infinity;
    const mine = items.filter(i => Date.parse(i.at) > from && Date.parse(i.at) <= Date.parse(r.at));
    out.push(`## Version ${r.semver}: ${r.name}`, `*${day(r.at)}*`, '', ...(mine.length ? mine.map(i => `- ${tag(i.kind)}: ${i.text}`) : ['- Small fixes to keep things running smoothly.']), '');
  }
  return out.join('\n');
}

/** The update itself: the frozen version's own setup script in update mode, its fingerprint, and the PC's signature
 *  over it (the Mac checks that signature before it runs a line of it). */
export interface UpdateParts {
  tailnet: string; hookPort: number; hookKey: string; frontKey: string; desk: DeskPayload | null;
  release: MacRelease; changelog: string; key: UpdateKey;
}
export function signedUpdate(f: Frozen, o: UpdateParts): { script: string; sha256: string; sig: string } {
  const script = f.setup(o.tailnet, o.hookPort, o.hookKey, o.frontKey, o.desk, { release: o.release, update: true, changelog: o.changelog, signPub: o.key.pub });
  return { script, sha256: createHash('sha256').update(script).digest('hex'), sig: signBytes(null, Buffer.from(script), o.key.key).toString('base64') };
}

/** The changelog in his Aang folder, rewritten whenever a new version gets its number. */
export function writeChangelogFile(dataDir: string, text: string): void { writeFileAtomic(path.join(dataDir, 'Samara Changelog.md'), text); }
