// Phase 7.6: what addons he has, and which have fallen behind.
//
// Joshua, 2026-10-03: "let me know when addons need updating... Can he not just tell me in a Custom
// formatted message in a bubble right? surface a message - Hey XYZ needs an update".
//
// TELLS, NEVER TOUCHES. There is deliberately no code here that downloads, installs, updates, moves or
// deletes anything in his game folder, and there should never be. That is not only his preference - it
// is also the difference between this and the kind of application CurseForge refuses, because it sends
// him to their page to download rather than replacing their app.
//
// Reading what is installed needs nothing at all: the versions and the CurseForge project ids are
// already sitting in the .toc files on disk. Only "what is the newest version" needs the API key.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import type { Fetch } from './google.ts';

export interface Installed {
  folder: string;
  title: string;
  version: string;
  /** From `## X-Curse-Project-ID`. Absent for addons that do not declare one, which is fine. */
  projectId?: number;
  /** A sub-folder of a bigger addon (GearQuestForever_DRUID), so it is not reported on its own. */
  partOf?: string;
}

export interface Behind {
  addon: Installed;
  latest: string;
  released: string;
  url: string;
}

/** Where WoW keeps its addons. More than one flavour can be installed; each has its own folder. */
export function addonDirs(wowRoot: string): string[] {
  const out: string[] = [];
  try {
    for (const flavour of readdirSync(wowRoot)) {
      const dir = path.join(wowRoot, flavour, 'Interface', 'AddOns');
      if (flavour.startsWith('_') && existsSync(dir)) out.push(dir);
    }
  } catch { /* no WoW installed, or not readable */ }
  return out;
}

const field = (toc: string, name: string): string => {
  const m = new RegExp(`^##\\s*${name}\\s*:\\s*(.+)$`, 'im').exec(toc);
  return (m?.[1] ?? '').replace(/\r/g, '').trim();
};

/**
 * Everything installed, with its version and CurseForge id.
 *
 * Verified against his machine 2026-10-03: 22 addons, and fifteen of them carry an
 * `## X-Curse-Project-ID`, so most of the work needs no network at all.
 */
export function installed(addonsDir: string): Installed[] {
  const out: Installed[] = [];
  let names: string[] = [];
  try { names = readdirSync(addonsDir); } catch (e) {
    console.error(`addons: could not read ${addonsDir}: ${(e as Error).message}`);
    return out;
  }
  for (const folder of names) {
    if (folder.startsWith('.') || folder === 'Blizzard_') continue;
    const dir = path.join(addonsDir, folder);
    try { if (!statSync(dir).isDirectory()) continue; } catch { continue; }
    // The .toc is normally <Folder>.toc, but flavoured builds use <Folder>_Mainline.toc and the like.
    let toc = '';
    try {
      const candidates = readdirSync(dir).filter(n => n.toLowerCase().startsWith(folder.toLowerCase()) && n.toLowerCase().endsWith('.toc'));
      const pick = candidates.find(n => n.toLowerCase() === `${folder.toLowerCase()}.toc`) ?? candidates[0];
      if (!pick) continue;
      toc = readFileSync(path.join(dir, pick), 'utf8');
    } catch { continue; }

    const id = Number(field(toc, 'X-Curse-Project-ID'));
    const a: Installed = {
      folder,
      title: (field(toc, 'Title') || folder).replace(/\|c[0-9a-fA-F]{8}|\|r/g, '').trim(),
      version: field(toc, 'Version'),
      ...(Number.isFinite(id) && id > 0 ? { projectId: id } : {}),
    };
    // GearQuestForever_DRUID belongs to GearQuestForever. Nine class modules reported as nine separate
    // out-of-date addons is nine times the noise for one piece of news.
    const under = names.find(n => n !== folder && folder.startsWith(n + '_'));
    if (under) a.partOf = under;
    out.push(a);
  }
  return out;
}

/** The newest file CurseForge has for a project, or null when it cannot say. */
export async function latestFor(fetch: Fetch, key: string, projectId: number): Promise<{ version: string; released: string; url: string } | null> {
  try {
    const r = await fetch(`https://api.curseforge.com/v1/mods/${projectId}`, {
      headers: { 'x-api-key': key, Accept: 'application/json' },
    });
    if (!r.ok) { console.error(`addons: CurseForge said ${r.status} for project ${projectId}`); return null; }
    const j = await r.json();
    const mod = j?.data;
    if (!mod) return null;
    // latestFiles is newest-first in practice, but sort rather than trust it.
    const files = [...(mod.latestFiles ?? [])].sort((a: any, b: any) => String(b.fileDate ?? '').localeCompare(String(a.fileDate ?? '')));
    const newest = files[0];
    if (!newest) return null;
    return {
      version: String(newest.displayName ?? newest.fileName ?? '').trim(),
      released: String(newest.fileDate ?? ''),
      url: String(mod.links?.websiteUrl ?? `https://www.curseforge.com/wow/addons/${mod.slug ?? ''}`),
    };
  } catch (e) {
    console.error(`addons: could not ask about project ${projectId}: ${(e as Error).message}`);
    return null;
  }
}

/**
 * Is the installed version older than what CurseForge has?
 *
 * Addon versions are not semver and cannot be assumed to be. They are "0.2.18-beta", "v1.60.11", "340",
 * "11.0.0-beta10". So this compares the NUMBERS in each, left to right, which is what a person does
 * when they look at the two strings - and when it cannot tell, it says so rather than guessing, because
 * a false "you are out of date" is worse than silence.
 */
export function isBehind(mine: string, theirs: string): boolean {
  const a = core(mine), b = core(theirs);
  if (a.length === 0 || b.length === 0) return false;
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const x = a[i] ?? 0, y = b[i] ?? 0;
    if (x !== y) return y > x;
  }
  return false;
}

/**
 * The numbers that are actually the version, and nothing else.
 *
 * Taking every number in the string was wrong twice on the first real run against his addons:
 *
 *  - RestedXP publishes "v4.11.13-2-gf3570d0", which is git's way of saying "2 commits after tag
 *    v4.11.13". Counting the 2 and the hex made it look newer than his identical v4.11.13, so he
 *    would have been sent to re-download the release he already had.
 *  - Talents Forever publishes the FILE NAME, "TalentsForeverBook-0.36.1.zip". He was lucky there -
 *    a name with a digit in it, like "Addon2-1.2.3.zip", would have compared 2.1.2.3 against 1.2.3
 *    and claimed he was years behind.
 *
 * So: drop a git-describe tail, drop anything before the first dotted number group, and read only
 * that group plus a trailing beta/rc number if there is one - which is what keeps beta10 ahead of
 * beta9 rather than level with it.
 */
function core(v: string): number[] {
  const s = String(v ?? '').trim().replace(/-\d+-g[0-9a-f]{7,}$/i, '');
  // A dotted group wherever it appears beats a bare number earlier in the string: "Addon2-0.36.1.zip"
  // must read as 0.36.1, not as 2. Only fall back to a bare number when there is no dotted group at
  // all, which is how Auctionator's "340" still works.
  const m = /(\d+(?:\.\d+)+)/.exec(s) ?? /(\d+)/.exec(s);
  if (!m) return [];
  const out = m[1].split('.').map(Number);
  const tail = new RegExp(`${m[1].replace(/\./g, '\\.')}[-_.]?(?:beta|rc|alpha|b|a)[-_.]?(\\d+)`, 'i').exec(s);
  if (tail) out.push(Number(tail[1]));
  return out;
}

/**
 * Everything that has fallen behind.
 *
 * Only addons that declare a project id, only the parent of a multi-folder addon, and one request per
 * project with a small pause - about fifteen calls once a day is nothing, but there is no reason to
 * make them all at once either.
 */
export async function behind(fetch: Fetch, key: string, addons: Installed[]): Promise<Behind[]> {
  const out: Behind[] = [];
  const ask = addons.filter(a => a.projectId && !a.partOf);
  for (const a of ask) {
    const latest = await latestFor(fetch, key, a.projectId!);
    if (!latest || !latest.version) continue;
    if (isBehind(a.version, latest.version)) out.push({ addon: a, latest: latest.version, released: latest.released, url: latest.url });
    await new Promise(r => setTimeout(r, 120));
  }
  return out;
}

/** What he is told, in the bubble. Short, because the detail is a question away. */
export function sayBehind(list: Behind[]): string {
  if (list.length === 0) return '';
  if (list.length === 1) {
    const b = list[0];
    return `${b.addon.title} has an update: you have ${b.addon.version}, the latest is ${b.latest}.`;
  }
  const names = list.slice(0, 3).map(b => b.addon.title).join(', ');
  const more = list.length > 3 ? ` and ${list.length - 3} more` : '';
  return `${list.length} of your addons have updates: ${names}${more}.`;
}
