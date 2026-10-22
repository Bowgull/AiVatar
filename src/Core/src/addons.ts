// Phase 7.6: what addons he has, read from their .toc files (used when he asks about an addon by name).
//
// 2026-10-22, his call: Aang now DRIVES THE CURSEFORGE APP on his yes. The morning brief's Addons slip (addonbrief.ts)
// is read from CurseForge's own status file, and "Update ticked" presses CurseForge's Install button by name
// (addondesk.ts), only with WoW closed. Aang still never writes into the game folder himself: CurseForge does the
// installing, the way he would. The old CurseForge API-key path that used to live here is gone (their terms forbid
// it for an app like this, and the local file already says what is out of date).
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

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
