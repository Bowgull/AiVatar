// 2026-10-25 (his "stop old Stremio downloads as soon as I leave a video"): against a stand-in for Stremio's engine.
//  1 what his Stremio app had running before is never touched
//  2 a video, then another: the first one's download stops, the one he is watching stays
//  3 leaving the video: its download stops
// Run: npx electron test/electron/stremio-clean-check.ts
import { app } from 'electron';
import http from 'node:http';
import { mkdtempSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
process.on('unhandledRejection', (e) => { console.log('HARNESS REJECTION ' + String((e as Error)?.message ?? e)); app.exit(2); });
setTimeout(() => { console.log('HARNESS TIMEOUT'); app.exit(3); }, 60_000).unref();
const HERE = path.dirname(fileURLToPath(import.meta.url));
app.setPath('userData', mkdtempSync(path.join(os.tmpdir(), 'scl-ud-')));
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
let bad = 0;
const check = (w: string, ok: boolean, d = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${w}${d ? ' (' + d + ')' : ''}`); if (!ok) bad++; };
const H = (c: string) => c.repeat(40);
app.whenReady().then(async () => {
  const running = new Set<string>([H('a')]);            // 'aaa…': his Stremio app's own
  const srv = http.createServer((q, r) => {
    const m = /^\/([0-9a-f]{40})\/remove$/.exec(String(q.url));
    if (m) { running.delete(m[1]!); r.end('{}'); return; }
    r.setHeader('Content-Type', 'application/json'); r.end(JSON.stringify(Object.fromEntries([...running].map((h) => [h, { infoHash: h }]))));
  });
  await new Promise<void>((res) => srv.listen(0, '127.0.0.1', () => res()));
  const { AangBrowser } = await import('../../src/browser.ts');
  const P = (f: string) => path.join(HERE, '..', '..', 'src', f);
  const b: any = new AangBrowser({ origin: 'http://127.0.0.1:1', preloadPath: P('preload.cjs'), tabPreloadPath: P('tabpreload.cjs'), settingsPreloadPath: P('settingspreload.cjs'), thingsPreloadPath: P('thingspreload.cjs'), stateDir: mkdtempSync(path.join(os.tmpdir(), 'scl-s-')) });
  b.stremioApi = `http://127.0.0.1:${(srv.address() as any).port}`;
  const tab = { id: 7, url: 'https://web.stremio.com/' };
  b.stremioMoved(tab, 'https://web.stremio.com/#/'); await wait(500);
  // a video: Stremio starts its download a moment BEFORE Samara notices (the race)
  running.add(H('b')); b.stremioMoved(tab, 'https://web.stremio.com/#/player/one'); await wait(3800);
  check('1 his Stremio app\'s download is left alone, and the one he plays is followed', running.has(H('a')) && running.has(H('b')), [...running].map((h) => h[0]).join(','));
  // another video
  b.stremioMoved(tab, 'https://web.stremio.com/#/player/two'); await wait(300); running.add(H('c')); await wait(3800);
  check('2 onto another video: the first download stops, the new one stays', !running.has(H('b')) && running.has(H('c')) && running.has(H('a')), [...running].map((h) => h[0]).join(','));
  // leaving the video
  b.stremioMoved(tab, 'https://web.stremio.com/#/discover'); await wait(800);
  check('3 leaving the video: its download stops; the app\'s stays', !running.has(H('c')) && running.has(H('a')), [...running].map((h) => h[0]).join(','));
  console.log(bad ? `${bad} FAILED` : 'ALL PASS');
  srv.close(); app.exit(bad ? 1 : 0);
});
