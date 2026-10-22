// The ad blocker with day-old lists (2026-10-22): it must start at once from the kept lists, keep blocking while fresh
// lists are fetched and built in the worker, and still block (with the same paused sites) after the swap.
// Run: npx electron test/electron/adrefresh-check.ts        (fetches the five real lists once, ~3 MB)
import { BrowserWindow, app, session } from 'electron';
import { createHash } from 'node:crypto';
import http from 'node:http';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { blockAds } from '../../src/skip/ads.ts';
process.on('uncaughtException', (e) => { console.log('HARNESS NOTE ' + String((e as Error).message).split('\n')[0]); });
process.on('unhandledRejection', (e) => { console.log('HARNESS REJECTION ' + String((e as Error)?.stack ?? e)); app.exit(2); });
setTimeout(() => { console.log('HARNESS TIMEOUT'); app.exit(3); }, 240_000).unref();
app.on('window-all-closed', () => { /* the check decides */ });
app.on('will-quit', () => console.log('HARNESS will-quit'));
process.on('exit', (c) => console.log('HARNESS exit ' + c));

const AD = 'https://securepubads.g.doubleclick.net/tag/js/gpt.js';
/** Would the blocker cancel this request? Asked the way Chromium asks it, through the session's hook. */
async function blocks(ses: Electron.Session, url: string, from = 'https://news.example/', page = ''): Promise<boolean> {
  return new Promise((resolve) => {
    const w = new BrowserWindow({ show: false, webPreferences: { session: ses } });
    const html = `<!doctype html><script src="${url}"></script>`;
    w.webContents.on('did-fail-load', () => {});
    ses.webRequest.onErrorOccurred({ urls: ['<all_urls>'] }, (d: any) => { if (process.env.DEBUG) console.log('err', d.url.slice(0, 80), d.error); if (d.url === url) { resolve(d.error === 'net::ERR_BLOCKED_BY_CLIENT' || d.error === 'net::ERR_ABORTED'); w.destroy(); } });
    ses.webRequest.onCompleted({ urls: ['<all_urls>'] }, (d: any) => { if (process.env.DEBUG) console.log('done', d.url.slice(0, 80)); if (d.url === url) { resolve(false); w.destroy(); } });
    if (page) void w.loadURL(page); else void w.loadURL(`data:text/html,${encodeURIComponent(html)}`, { baseURLForDataURL: from });
    setTimeout(() => { resolve(false); try { w.destroy(); } catch { /* gone */ } }, 15_000);
  });
}

app.whenReady().then(async () => {
  // A real page on this machine that loads the ad script: pausing its host must let the script through.
  const srv = http.createServer((_q, r) => r.writeHead(200, { 'Content-Type': 'text/html' }).end(`<!doctype html><script src="${AD}"></script>`));
  await new Promise<void>((r) => srv.listen(47961, '127.0.0.1', () => r()));
  const PAGE = 'http://localhost:47961/';
  const dir = mkdtempSync(path.join(os.tmpdir(), 'adr-'));
  // 1) A normal first start fetches and builds (in the worker); wait for the kept engine.
  const ses1 = session.fromPartition('adr1');
  let t = performance.now();
  const a = await blockAds(ses1, dir, { cosmetic: true });
  console.log(`first start ${Math.round(performance.now() - t)} ms, lists ${a?.lists}`);
  await new Promise((r) => setTimeout(r, 6500));
  a?.stop();                                     // one blocker per app with page tidying on, as in Samara
  // 2) Make the kept lists a day old and change them a little, so a refresh brings a different engine.
  const when = path.join(dir, 'adblock', 'when.json'), lists = path.join(dir, 'adblock', 'lists.txt');
  writeFileSync(when, JSON.stringify({ ...JSON.parse(readFileSync(when, 'utf8')), at: Date.now() - 2 * 86_400_000 }));
  // The kept engine stays the one built in step 1; only its key follows the changed text, as if it had been built from it.
  const old = readFileSync(lists, 'utf8') + '\n! yesterday\n';
  writeFileSync(lists, old);
  writeFileSync(path.join(dir, 'adblock', 'engine-cosmetic.bin.key'), createHash('sha256').update('cosmetic|').update(old).digest('hex'));
  const ses2 = ses1;
  t = performance.now();
  const b = await blockAds(ses2, dir, { cosmetic: true });
  const startMs = Math.round(performance.now() - t);
  console.log(`step 2 started in ${startMs} ms`);
  b?.pauseMany(['localhost'], true);
  // The probe's own control: with the blocker off, the same request is not stopped.
  b?.stop(); const control = await blocks(ses2, AD); b?.start();
  console.log(`control (blocker off) stopped: ${control}`);
  const before = await blocks(ses2, AD);
  const pausedBefore = !(await blocks(ses2, AD, '', PAGE));
  console.log(`paused site left alone before the refresh: ${pausedBefore}`);
  // 3) Wait for the background refresh to swap in, then check again (blocking and the paused site).
  const lines: string[] = [];
  const log = console.log; console.log = (...x: unknown[]) => { lines.push(x.join(' ')); log(...x); };
  for (let i = 0; i < 120 && !lines.some((l) => l.includes('ad lists refreshed')); i++) await new Promise((r) => setTimeout(r, 1000));
  const swapped = lines.some((l) => l.includes('ad lists refreshed'));
  const after = await blocks(ses2, AD);
  const pausedOk = !(await blocks(ses2, AD, '', PAGE));
  console.log = log;
  console.log(`day-old start ${startMs} ms; blocks before refresh ${before}; refreshed ${swapped}; blocks after ${after}; paused site left alone ${pausedOk}`);
  const ok = Boolean(a && b) && startMs < 1500 && !control && before && after && pausedOk;
  console.log(ok ? 'ALL PASS' : 'FAILED'); app.exit(ok ? 0 : 1);
});
