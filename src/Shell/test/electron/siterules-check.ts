// Sheet 37 (2026-10-14): the shield's site rules. Each switch changes the rule; AI off means a session can never open
// the site; "use my login" on opens it signed in for any job; camera / mic cycle Allow, Ask, Block; Settings lists the
// site with all its rules; a rule from the other computer only ever makes this one stricter.
//
// Run: npx electron test/electron/siterules-check.ts
import { app, BrowserWindow, screen } from 'electron';
import http from 'node:http';
import { mkdtempSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { servePages } from '../../src/pageserver.ts';
import { AangBrowser } from '../../src/browser.ts';
import { wireBrowser } from '../../src/browseripc.ts';

const PORT = 47918;
app.commandLine.appendSwitch('host-resolver-rules', `MAP www.example-site.com 127.0.0.1:${PORT}, MAP news.other-site.com 127.0.0.1:${PORT}`);
process.on('uncaughtException', (e) => { console.log('HARNESS NOTE ' + String((e as Error).message).split('\n')[0]); });
process.on('unhandledRejection', (e) => { console.log('HARNESS REJECTION ' + String((e as Error)?.stack ?? e)); app.exit(2); });
setTimeout(() => { console.log('HARNESS TIMEOUT'); app.exit(3); }, 90_000).unref();
app.on('window-all-closed', () => { /* the test decides */ });
const HERE = path.dirname(fileURLToPath(import.meta.url));
BrowserWindow.prototype.show = function (this: BrowserWindow) { this.setPosition(-6000, 100); this.showInactive(); };
BrowserWindow.prototype.focus = function () { /* not in a test */ };
let bad = 0;
const check = (what: string, ok: boolean, d = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${what}${d ? '  -- ' + d.slice(0, 220) : ''}`); if (!ok) bad++; };
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

app.whenReady().then(async () => {
  (screen as any).getCursorScreenPoint = () => ({ x: -20000, y: 500 });
  const site = http.createServer((_q, r) => { r.writeHead(200, { 'Content-Type': 'text/html' }).end('<!doctype html><title>A site</title><p>Hello</p>'); });
  await new Promise<void>((r) => site.listen(PORT, '127.0.0.1', () => r()));
  const pages = await servePages(path.join(HERE, '..', '..', 'pages'));
  const b = new AangBrowser({ origin: pages.origin, stateDir: mkdtempSync(path.join(os.tmpdir(), 'rules-')), preloadPath: path.join(HERE, '..', '..', 'src', 'preload.cjs'),
    tabPreloadPath: path.join(HERE, '..', '..', 'src', 'tabpreload.cjs'), settingsPreloadPath: path.join(HERE, '..', '..', 'src', 'settingspreload.cjs'), thingsPreloadPath: path.join(HERE, '..', '..', 'src', 'thingspreload.cjs') }) as any;
  wireBrowser(() => b);
  b.open(`http://www.example-site.com:${PORT}/`); await wait(2500);
  const w = b.win as BrowserWindow;
  const js = (s: string) => w.webContents.executeJavaScript(s);
  await js(`document.getElementById('lock').hidden = false; document.getElementById('lock').click()`); await wait(400);
  const shown = await js(`({ open: !document.getElementById('sitepanel').hidden, host: document.getElementById('sitehost').textContent, rows: document.querySelectorAll('#sitepanel .srow').length,
    icons: document.querySelectorAll('#sitepanel .sic svg').length, ai: document.getElementById('aisw').getAttribute('aria-checked'), cam: document.getElementById('camk').textContent,
    helper: document.querySelectorAll('#sitepanel small:not(#popurl)').length })`);
  check('the shield opens with every rule, an icon each, no helper text', shown.open && shown.host === 'example-site.com' && shown.rows === 7 && shown.icons === 7 && shown.helper === 0, JSON.stringify(shown));
  { const img = await w.webContents.capturePage(); (await import('node:fs')).writeFileSync(path.join(os.tmpdir(), 'shield-real.png'), img.toPNG()); }
  check('a new site starts: AI on, camera asks', shown.ai === 'true' && shown.cam === 'Ask', JSON.stringify(shown));

  await js(`document.getElementById('camk').click()`); await wait(300);
  await js(`document.getElementById('mick').click()`); await js(`document.getElementById('mick').click()`); await wait(300);
  const tri = await js(`[document.getElementById('camk').textContent, document.getElementById('camk').className, document.getElementById('mick').textContent]`);
  check('camera cycles Ask, Block (burnt orange); mic Ask, Block, Allow (gold)', tri[0] === 'Block' && /burnt/.test(tri[1]) && tri[2] === 'Allow' && b.rules.media('www.example-site.com', 'mic') === 'allow', JSON.stringify(tri));
  await js(`document.getElementById('popsw').click()`); await wait(300);
  check('the popup blocker switches off for this site only', b.popupOk.has('example-site.com') && (await js(`document.getElementById('popsw').getAttribute('aria-checked')`)) === 'false');

  // AI off: a session can never open it, and the login switch greys out
  await js(`document.getElementById('aisw').click()`); await wait(300);
  const job = (await b.drive('start', { kind: 'claude', name: 'test' })).job;
  b.driver.d.testLocal = true;
  const o1 = await b.drive('open', { job, url: `http://www.example-site.com:${PORT}/x` }).catch((e: Error) => ({ ok: false, error: e.message }));
  check('AI off: a Claude session cannot open the site', o1.ok === false && /turned AI off/.test(o1.error), JSON.stringify(o1));
  check('and "use my login" is greyed out while AI is off', await js(`document.getElementById('loginsw').disabled`));
  await js(`document.getElementById('aisw').click()`); await wait(300);

  // Use my login: a site outside the job's own opens signed in, not as a guest (the job's first site is its own)
  await b.drive('open', { job, url: `http://www.example-site.com:${PORT}/first` });
  const o2 = await b.drive('open', { job, url: `http://news.other-site.com:${PORT}/` });
  check('without the login rule, another site opens logged out', o2.ok && o2.guest === true, JSON.stringify(o2));
  b.setSiteRule('login', true, 'news.other-site.com');
  const o3 = await b.drive('open', { job, url: `http://news.other-site.com:${PORT}/two` });
  check('with "use my login" on, it opens signed in', o3.ok && !o3.guest, JSON.stringify(o3));

  // Settings lists the site with every rule
  const d = await b.settingsData();
  const row = d.sites.find((x: any) => x.host === 'example-site.com');
  check('Settings > Your sites lists it with its rules', !!row && row.ai === true && row.camera === 'block' && row.mic === 'allow' && row.popups === false && row.ads === true, JSON.stringify(row));
  // the real Settings tab: the row, its words, and a click on a slot
  b.openSettings('privacy'); await wait(2500);
  const st = b.tabs.find((x: any) => x.internal === 'settings');
  const sj = (s: string) => st.view.webContents.executeJavaScript(s);
  const srow = await sj(`(() => { const r = [...document.querySelectorAll('.ysrow')].find((x) => x.textContent.includes('example-site.com')); return r ? { words: [...r.querySelectorAll('.yscell i')].map((i) => i.textContent), icons: r.querySelectorAll('.slot svg').length } : null; })()`);
  check('Settings shows the row with every slot and its word', !!srow && srow.icons === 7 && srow.words.join(',') === 'ON,OFF,ON,OFF,ON,BLOCK,ALLOW', JSON.stringify(srow));
  await sj(`[...document.querySelectorAll('.ysrow')].find((x) => x.textContent.includes('example-site.com')).querySelectorAll('.slot')[5].click()`); await wait(400);
  check('clicking the camera slot in Settings changes the rule', b.rules.media('example-site.com', 'camera') === 'allow');
  { // a picture: the settings tab has no size off screen, so its page, exactly as drawn, is copied into a window of its own
    const html = String(await sj(`document.documentElement.outerHTML`)).replace(/<meta http-equiv="Content-Security-Policy"[^>]*>/, '').replace('<head>', `<head><base href="${pages.origin}/">`).replace(/<script[^>]*><\/script>/g, '');
    const pw = new BrowserWindow({ show: false, width: 1000, height: 900, webPreferences: { offscreen: true } });
    const fs = await import('node:fs'); const f = path.join(os.tmpdir(), 'yoursites-copy.html'); fs.writeFileSync(f, html);
    await pw.loadFile(f); await pw.webContents.executeJavaScript(`document.querySelector('.yoursites').scrollIntoView()`); await wait(900);
    fs.writeFileSync(path.join(os.tmpdir(), 'yoursites-real.png'), (await pw.webContents.capturePage()).toPNG()); pw.destroy(); }
  b.clearSite('example-site.com');
  check('the x forgets every rule for the site', !b.popupOk.has('example-site.com') && b.rules.media('example-site.com', 'mic') === 'ask');

  // From the other computer: stricter applies, looser waits for him
  b.rules.set('trusted.example', { camera: 'allow' });
  b.takeLists({ siteRules: { 'trusted.example': { camera: 'block' }, 'new.example': { ai: false, login: true } } });
  check('a stricter rule from the other computer applies', b.rules.media('trusted.example', 'camera') === 'block' && b.rules.ai('new.example') === false);
  check('a looser one does not (his login is never switched on from the other side)', b.rules.login('new.example') === undefined);
  check('a rule on a site covers its sub-addresses', (b.rules.set('reddit.com', { ai: false }), !b.rules.ai('https://old.reddit.com/r/x')));

  console.log(bad ? `${bad} FAILED` : 'ALL PASS'); app.exit(bad ? 1 : 0);
});
