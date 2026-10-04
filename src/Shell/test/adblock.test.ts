// Step 6.6: ad blocking, tested by what the engine actually DECIDES about real addresses.
//
// Loading four lists proves nothing: a blocker can start, report its lists and let everything through.
// So this builds the real engine from the real lists and asks it, request by request.
//
// It needs the lists on disk, which the Shell caches on its first run. Without them the test says so
// and skips rather than passing quietly on nothing.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/** Wherever a Shell run last cached the lists. Tests do not fetch them: that is the product's job. */
function findLists(): string | null {
  const roots = [
    path.join(process.env.APPDATA ?? path.join(os.homedir(), 'AppData', 'Roaming'), 'Aang', 'adblock'),
    path.resolve(import.meta.dirname, '..', '..', '..', 'tests', 'out', 'adblock', 'state', 'adblock'),
    path.resolve(import.meta.dirname, '..', '..', '..', 'tests', 'out', 'skipping', 'state', 'adblock'),
  ];
  // The most complete one wins. A run where a list failed to download leaves a smaller file behind,
  // and testing against that reports gaps in the lists rather than in the code.
  let best: { file: string; size: number } | null = null;
  for (const r of roots) {
    const f = path.join(r, 'lists.txt');
    if (!existsSync(f)) continue;
    const size = statSync(f).size;
    if (!best || size > best.size) best = { file: f, size };
  }
  if (best) return best.file;
  // Any scratch run will do.
  const scratch = path.join(os.tmpdir(), 'claude');
  try {
    for (const d of readdirSync(scratch, { recursive: true, encoding: 'utf8' })) {
      if (d.endsWith(path.join('adblock', 'lists.txt'))) return path.join(scratch, d);
    }
  } catch { /* nothing cached */ }
  return null;
}

const listsFile = findLists();

test('the lists really block ad addresses, and really leave his sites alone', async t => {
  if (!listsFile) {
    t.skip('no cached block lists; run the Shell once so it fetches them');
    return;
  }
  const { ElectronBlocker, makeRequest } = await import('@ghostery/adblocker-electron');
  const blocker = ElectronBlocker.parse(readFileSync(listsFile, 'utf8'));

  // The engine wants a request it built itself: a hand-made object looks like a request but is missing
  // the tokens it matches on, and everything then comes back "not blocked", which reads exactly like a
  // blocker that is working and is not.
  const wouldBlock = (url: string, type = 'script', from = 'https://www.youtube.com/watch?v=x') =>
    blocker.match(makeRequest({ url, type, sourceUrl: from } as never)).match;

  // Things that should go. The page is a neutral site, which is the ordinary case.
  for (const url of [
    'https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js',
    'https://www.googletagservices.com/tag/js/gpt.js',
    'https://securepubads.g.doubleclick.net/tag/js/gpt.js',
  ]) {
    assert.equal(wouldBlock(url, 'script', 'https://example.com/'), true, `should be blocked: ${url}`);
  }

  // And things that must keep working, or a blocker is just a broken browser.
  for (const url of [
    'https://www.youtube.com/s/player/base.js',
    'https://i.ytimg.com/vi/abc/hqdefault.jpg',
    'https://static.crunchyroll.com/vilos-v2/web/vilos/player.html',
    'https://player.twitch.tv/js/player.js',
  ]) {
    assert.equal(wouldBlock(url, 'script', 'https://example.com/'), false, `must NOT be blocked: ${url}`);
  }
});

test('the lists are uBlock\'s own, not a prebuilt EasyList bundle', async () => {
  const { LISTS } = await import('../src/skip/ads.ts');
  assert.ok(LISTS.some(u => u.includes('ublockorigin.github.io')), 'uBlock lists are where YouTube work happens');
  assert.ok(LISTS.some(u => u.includes('quick-fixes')), 'and the quick-fixes list, which is what catches up when YouTube changes');
});

test('the honest limit: an ad served by YouTube itself cannot be request-blocked', async t => {
  if (!listsFile) { t.skip('no cached block lists'); return; }
  const { ElectronBlocker, makeRequest } = await import('@ghostery/adblocker-electron');
  const blocker = ElectronBlocker.parse(readFileSync(listsFile, 'utf8'));
  const fromYouTube = (url: string) =>
    blocker.match(makeRequest({ url, type: 'script', sourceUrl: 'https://www.youtube.com/watch?v=x' } as never)).match;

  // Google's ad domains ARE blocked, even from YouTube.
  assert.equal(fromYouTube('https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js'), true);

  // But YouTube increasingly serves its own ads from its own address, alongside the video itself.
  // Refusing those requests would break the player, so no list does it, and no list can. That is why
  // uBlock does this part with rules injected into the page instead, and it is the real reason the
  // switch says "works, breaks for a day or two every few weeks".
  //
  // Written down as a test so nobody later "fixes" this by blocking youtube.com and breaks the player.
  assert.equal(fromYouTube('https://www.youtube.com/api/stats/ads?a=1'), false);
  assert.equal(fromYouTube('https://www.youtube.com/s/player/base.js'), false, 'and the player must keep working');
});
