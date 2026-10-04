// Blocking YouTube ads.
//
// Ghostery's engine, but deliberately NOT its prebuilt list. The plan's research found the prebuilt
// one is EasyList-based and misses what actually works on YouTube; uBlock Origin's own lists are what
// keep up, because that is where the work happens. So the engine is Ghostery's and the lists are
// uBlock's, refreshed on a schedule.
//
// Honest about this one: it works, and it breaks for a day or two every few weeks when YouTube changes
// something. That is in the switch's own description, so a quiet week of ads is a known thing rather
// than a mystery. When it breaks, the lists catch up on their own.
//
// It runs ONLY on the stock Shell's session. The DRM runtime never sees it: a paid service has no ads
// to block, and putting a request filter in front of a licence negotiation is a good way to break
// playback for no gain.
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import type { Session } from 'electron';
import { reportWriteFailure, writeFileAtomic } from '../atomic.ts';

/** uBlock Origin's own lists, which is where the work on YouTube actually happens. */
export const LISTS = [
  'https://ublockorigin.github.io/uAssets/filters/filters.txt',
  'https://ublockorigin.github.io/uAssets/filters/privacy.txt',
  'https://ublockorigin.github.io/uAssets/filters/quick-fixes.txt',
  'https://easylist.to/easylist/easylist.txt',
];

/** Refreshed daily. The lists change often; that is the point of them. */
const KEEP_MS = 24 * 60 * 60 * 1000;

export interface AdBlock {
  /** Stop blocking, for example when he turns the switch off. */
  stop(): void;
  /** How many lists were actually loaded. Zero means it is not blocking anything. */
  lists: number;
}

/**
 * Start blocking on a session. Returns null if the blocker could not be built, which is not fatal: he
 * sees ads, and that is better than a browser that will not load anything.
 */
export async function blockAds(session: Session, stateDir: string): Promise<AdBlock | null> {
  const cacheDir = path.join(stateDir, 'adblock');
  try { mkdirSync(cacheDir, { recursive: true }); } catch { /* checked on write */ }

  let text = '';
  let got = 0;
  const cache = path.join(cacheDir, 'lists.txt');
  const fresh = (() => {
    try {
      if (!existsSync(cache)) return false;
      // A cache left behind by a run where a list failed is worse than it looks, so it is only
      // trusted when it held the full set.
      const when = JSON.parse(readFileSync(path.join(cacheDir, 'when.json'), 'utf8'));
      return Date.now() - when.at < KEEP_MS && when.lists === LISTS.length;
    } catch { return false; }
  })();

  if (fresh) {
    try { text = readFileSync(cache, 'utf8'); got = LISTS.length; } catch { /* fetch instead */ }
  }

  if (!text) {
    const missed: string[] = [];
    for (const url of LISTS) {
      try {
        const r = await fetch(url);
        if (!r.ok) { missed.push(`${url} said ${r.status}`); continue; }
        text += '\n' + await r.text();
        got++;
      } catch (e) { missed.push(`${url}: ${(e as Error).message}`); }
    }
    // A list that quietly failed to download means quietly blocking less, which looks exactly like a
    // blocker that is working. Say so. Seen on 2026-10-04: one run got three lists and the next got
    // four, and the rule for a well-known ad address was in the one that was missing.
    if (missed.length) console.error(`shell: ${missed.length} block list(s) did not load: ${missed.join('; ')}`);
    if (got) {
      try {
        writeFileAtomic(cache, text);
        writeFileAtomic(path.join(cacheDir, 'when.json'), JSON.stringify({ at: Date.now(), lists: got }));
      } catch (e) { reportWriteFailure(cache, e); }
    }
  }

  if (!got || !text.trim()) {
    console.error('shell: no block lists could be loaded, so ads are not being blocked');
    return null;
  }

  try {
    const { ElectronBlocker } = await import('@ghostery/adblocker-electron');
    const blocker = ElectronBlocker.parse(text);
    blocker.enableBlockingInSession(session);
    return {
      lists: got,
      stop: () => { try { blocker.disableBlockingInSession(session); } catch { /* already off */ } },
    };
  } catch (e) {
    console.error('shell: the ad blocker would not start, so ads are not being blocked: ' + (e as Error).message);
    return null;
  }
}
