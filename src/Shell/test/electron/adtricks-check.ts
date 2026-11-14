// The page tricks really run in a tab (2026-11-13), in the normal AND the secret window's session.
// A stand-in www.youtube.com page (served locally, nothing reaches YouTube) fetches player data with an ad in it.
// uBlock's real YouTube rule rewrites "adPlacements" to "no_ads" inside the page, so the page sees no ad, and the
// tricks must already be there when the page's first script runs (early=object).
// Run: npx electron test/electron/adtricks-check.ts
import { app, BrowserWindow, session } from 'electron';
import { mkdtempSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { blockAds } from '../../src/skip/ads.ts';
process.on('unhandledRejection', (e) => { console.log('HARNESS REJECTION ' + String((e as Error)?.stack ?? e)); app.exit(2); });
setTimeout(() => { console.log('HARNESS TIMEOUT'); app.exit(3); }, 180_000).unref();

const PAGE = `<!doctype html><title>t</title><script>var early = typeof window.scriptletGlobals;
  fetch('/youtubei/v1/player?key=1', { method: 'POST' }).then((r) => r.text()).then((t) => { document.title = 'got ' + t + ' early=' + early + ' late=' + typeof window.scriptletGlobals; });
</script>`;

async function trial(name: string, slot?: string): Promise<boolean> {
  const ses = session.fromPartition(name);
  ses.protocol.handle('https', (req) => {
    const u = new URL(req.url);
    if (u.hostname !== 'www.youtube.com') return new Response('', { status: 404 });
    if (u.pathname.startsWith('/youtubei/v1/player')) return new Response('{"adPlacements":[{"ad":1}],"videoDetails":{}}', { headers: { 'content-type': 'application/json' } });
    return new Response(PAGE, { headers: { 'content-type': 'text/html' } });
  });
  const ab = await blockAds(ses, dir, { cosmetic: true, slot });
  if (!ab) { console.log(name + ': blocker did not start'); return false; }
  const w = new BrowserWindow({ show: false, webPreferences: { session: ses, sandbox: true, contextIsolation: true, nodeIntegration: false } });
  await w.loadURL('https://www.youtube.com/watch?v=x');
  for (let i = 0; i < 50 && !w.getTitle().startsWith('got'); i++) await new Promise((r) => setTimeout(r, 100));
  const seen = w.getTitle();
  w.destroy();
  const ok = seen.includes('no_ads') && !seen.includes('adPlacements') && seen.includes('early=object');
  console.log(`${name}: lists ${ab.lists}, page saw ${seen.slice(4, 140)} -> ${ok ? 'PASS' : 'FAIL'}`);
  ab.stop();
  return ok;
}

let dir = '';
app.on('window-all-closed', () => { /* the second trial still needs the app */ });
app.whenReady().then(async () => {
  dir = mkdtempSync(path.join(os.tmpdir(), 'adt-'));
  const a = await trial('adt-normal');
  const b = await trial('adt-secret', 'secret');
  console.log(a && b ? 'ALL PASS' : 'FAILED'); app.exit(a && b ? 0 : 1);
});
