// Sheet 99 v3, Send to TV in one click, against the real browser and a PRETEND TV (test/faketv.ts): his rule
// (2026-10-27) is "keep fixing this feature but not testing on my current TV", so nothing here looks for or talks to it.
//  1 the TV icon sits in the bar on a Netflix page, dim, ready to Send to TV
//  2 the first click asks for the TV's code, hanging from the icon; the pretend TV is showing one
//  3 a wrong code is caught and said, and nothing is sent
//  4 the right code links Samara; the TV wakes, goes Home, and opens the Netflix title link with source=30
//  5 playing: the icon is lit, Stop takes the TV back Home
//  6 linked, the next click goes straight through, no code
//  7 a TV that does not wake: the ask says so, with Try again and Send window
//  8 Settings > TV: the TV and its two switches, saved; Unlink means the next send asks for the code again
//  9 the right-click menu: Send to TV, Send window, TV settings
// Run: TEST_CERT_DIR=<dir with test-key.pem, test-cert.pem> npx electron test/electron/tvsend-check.ts
import { app, BrowserWindow, screen } from 'electron';
import https from 'node:https';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { FakeTv } from '../faketv.ts';
process.on('uncaughtException', (e) => console.log('HARNESS NOTE ' + String((e as Error)?.message ?? e).split('\n')[0]));
process.on('unhandledRejection', (e) => { console.log('HARNESS REJECTION ' + String((e as Error)?.stack ?? e).split('\n').slice(0, 3).join(' | ')); app.exit(2); });
setTimeout(() => { console.log('HARNESS TIMEOUT'); app.exit(3); }, 180_000).unref();
app.commandLine.appendSwitch('host-resolver-rules', 'MAP www.netflix.com 127.0.0.1');
app.commandLine.appendSwitch('disable-backgrounding-occluded-windows');
const HERE = path.dirname(fileURLToPath(import.meta.url));
app.setPath('userData', mkdtempSync(path.join(os.tmpdir(), 'tvs-ud-')));
app.on('window-all-closed', () => {});
BrowserWindow.prototype.show = function (this: BrowserWindow) { this.setOpacity(0); this.showInactive(); };
BrowserWindow.prototype.focus = function () {};
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const until = async (fn: () => boolean | Promise<boolean>, ms = 8000) => { const end = Date.now() + ms; while (Date.now() < end) { if (await fn()) return true; await wait(100); } return fn(); };
let bad = 0;
const check = (w: string, ok: boolean, d = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${w}${d ? ' (' + d + ')' : ''}`); if (!ok) bad++; };

app.whenReady().then(async () => {
  (screen as any).getCursorScreenPoint = () => ({ x: -20000, y: 500 });
  const tv = await new FakeTv().start();
  const CERT = process.env.TEST_CERT_DIR!;
  const srv = https.createServer({ key: readFileSync(path.join(CERT, 'test-key.pem')), cert: readFileSync(path.join(CERT, 'test-cert.pem')) },
    (_q, r) => { r.writeHead(200, { 'Content-Type': 'text/html' }); r.end('<!doctype html><title>Stranger Things | Netflix</title><body style="background:#141414;color:#fff">Stranger Things</body>'); });
  await new Promise<void>((r) => srv.listen(0, '127.0.0.1', () => r()));
  const port = (srv.address() as { port: number }).port;
  const { servePages } = await import('../../src/pageserver.ts');
  const { AangBrowser } = await import('../../src/browser.ts');
  const { wireBrowser } = await import('../../src/browseripc.ts');
  const pages = await servePages(path.join(HERE, '..', '..', 'pages'));
  const P = (f: string) => path.join(HERE, '..', '..', 'src', f);
  const state = mkdtempSync(path.join(os.tmpdir(), 'tvs-st-'));
  const b: any = new AangBrowser({ origin: pages.origin, preloadPath: P('preload.cjs'), tabPreloadPath: P('tabpreload.cjs'), settingsPreloadPath: P('settingspreload.cjs'), thingsPreloadPath: P('thingspreload.cjs'), stateDir: state,
    tvAt: { host: '127.0.0.1', port: tv.remotePort, pairPort: tv.pairPort, name: 'Pretend TV' } });
  wireBrowser(() => b);
  b.ses.setCertificateVerifyProc((_r: unknown, cb: (n: number) => void) => cb(0));
  b.open(`https://www.netflix.com:${port}/title/80057281`);
  await until(() => !!b.win);
  b.ses.setCertificateVerifyProc((_r: unknown, cb: (n: number) => void) => cb(0));
  b.win.setContentSize(1440, 860);
  const fw = b.win.webContents;
  const js = (s: string) => fw.executeJavaScript(s, true);
  await until(async () => (await js(`document.readyState === 'complete' && !!document.getElementById('tvkey')`)) === true, 15000);
  await wait(3500); b.sendTabs(); await wait(500);
  const icon = () => js(`(() => { const k = document.getElementById('tvkey'); return { shown: !k.hidden, idle: k.classList.contains('idle'), title: k.title, canvas: !!k.querySelector('canvas') }; })()`);
  const ask = () => js(`(() => { const c = document.getElementById('tvchip'); return { shown: !c.hidden, q: document.getElementById('tvq').textContent, m: document.getElementById('tvm').textContent, code: !document.getElementById('tvcode').hidden, bad: c.classList.contains('k-bad'), yes: document.getElementById('tvyes').firstChild.textContent, no: document.getElementById('tvno').firstChild.textContent }; })()`);
  const type = (code: string) => js(`(() => { const bs = [...document.querySelectorAll('#tvcode input')]; bs.forEach((x) => { x.value = ''; }); [...${JSON.stringify(code)}].forEach((ch, i) => { bs[i].value = ch; bs[i].dispatchEvent(new Event('input', { bubbles: true })); }); return 1; })()`);

  // 1
  const i1 = await icon();
  check('1 the TV icon is in the bar on a Netflix page, dim, saying Send to TV', i1.shown && i1.idle && i1.title === 'Send to TV', JSON.stringify(i1));
  // 2
  await js(`document.getElementById('tvkey').click(); 1`);
  await until(async () => (await ask()).code === true, 12000);
  const a2 = await ask();
  if (process.env.SHOT) writeFileSync(process.env.SHOT + '-link.png', (await fw.capturePage()).toPNG());
  check('2 the first click asks for the code, the pretend TV showing one', a2.shown && a2.code && /Link Samara to Pretend TV/.test(a2.q) && /^[0-9A-F]{6}$/.test(tv.shownCode ?? ''), JSON.stringify(a2) + ' code ' + tv.shownCode);
  // 3
  const wrong = (tv.shownCode!.slice(0, 2) === '00' ? '01' : '00') + tv.shownCode!.slice(2);
  await type(wrong);
  await until(async () => /does not match/.test((await ask()).m), 6000);
  check('3 a wrong code is said, nothing sent', /does not match/.test((await ask()).m) && tv.links.length === 0, (await ask()).m);
  // 4
  await type(tv.shownCode!);
  if (process.env.SHOT) { await wait(1600); writeFileSync(process.env.SHOT + '-going.png', (await fw.capturePage()).toPNG()); }
  await until(() => tv.links.length > 0, 12000);
  check('4 the right code links; the TV wakes, goes Home, opens Netflix with source=30',
    JSON.stringify(tv.links) === JSON.stringify(['https://www.netflix.com/title/80057281?source=30']) && tv.keys[0] === 224 && tv.keys[1] === 3, `${JSON.stringify(tv.links)} ${JSON.stringify(tv.keys)}`);
  // 5
  await until(() => b.tv?.kind === 'app', 6000); await wait(400);
  const i5 = await icon();
  check('5 playing: the icon is lit, not dim, and the ask is closed', b.tv?.kind === 'app' && i5.shown && !i5.idle && !(await ask()).shown, JSON.stringify(i5));
  const k5 = tv.keys.length;
  await b.tvAct('stop'); await until(() => tv.keys.length > k5, 6000);
  check('5 Stop takes the TV back Home', tv.keys[tv.keys.length - 1] === 3 && b.tv === null, JSON.stringify(tv.keys));
  // 6
  const l6 = tv.links.length; tv.shownCode = null;
  await js(`document.getElementById('tvkey').click(); 1`);
  await until(() => tv.links.length > l6, 12000);
  await until(() => b.tv?.kind === 'app', 6000);
  const a6 = await ask();
  check('6 linked, the next click goes straight through, no code', tv.links.length === l6 + 1 && tv.shownCode === null && !(a6.shown && a6.code), `${tv.links.length} code ${tv.shownCode} ask ${JSON.stringify(a6)}`);
  await b.tvAct('stop'); await until(() => b.tv === null, 4000); await wait(600);
  // 7
  tv.asleep = true;
  await js(`document.getElementById('tvkey').click(); 1`);
  await until(async () => (await ask()).bad === true, 15000);
  const a7 = await ask();
  if (process.env.SHOT) writeFileSync(process.env.SHOT + '-asleep.png', (await fw.capturePage()).toPNG());
  check('7 a TV that does not wake: said so, with Try again and Send window', a7.shown && a7.bad && /didn't wake up/.test(a7.q) && a7.yes === 'Try again' && a7.no === 'Send window', JSON.stringify(a7));
  tv.asleep = false; await wait(300);
  await b.tvAct('close');
  check('7 a TV that is only asleep stays linked', JSON.parse(readFileSync(path.join(state, 'tv-remote.json'), 'utf8')).linked === true);
  // 8
  const d8 = await b.settingsData();
  check('8 Settings > TV shows the linked TV and both switches on', d8.tv?.linked === true && d8.tv?.name === 'Pretend TV' && d8.tvAnswer === true && d8.tvPause === true, JSON.stringify({ tv: d8.tv, a: d8.tvAnswer, p: d8.tvPause }));
  b.setSetting('tvPause', false);
  const saved = JSON.parse(readFileSync(path.join(state, 'tv-remote.json'), 'utf8'));
  check('8 a switch is saved in this Mac\'s own TV file', saved.pause === false && saved.linked === true, JSON.stringify(saved));
  b.settingsAct('tvunlink');
  await js(`document.getElementById('tvkey').click(); 1`);
  await until(async () => (await ask()).code === true, 12000);
  check('8 unlinked, the next Send to TV asks for the code again', (await ask()).code === true && /^[0-9A-F]{6}$/.test(tv.shownCode ?? ''));
  await b.tvAct('nolink'); await wait(400);
  // 9
  await js(`document.getElementById('tvkey').dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: 900, clientY: 40 })); 1`);
  await wait(300);
  const menu = await js(`[...document.querySelectorAll('#tabmenu button')].map((x) => x.textContent + (x.disabled ? ' (off)' : ''))`);
  check('9 the right-click menu: Send to TV, Send window, TV settings', JSON.stringify(menu) === JSON.stringify(['Send to TV', 'Send window', 'TV settings']), JSON.stringify(menu));

  tv.stop(); srv.close(); pages.close?.();
  console.log(bad ? `${bad} FAILED` : 'ALL PASS');
  setTimeout(() => app.exit(bad ? 1 : 0), 300);
});
