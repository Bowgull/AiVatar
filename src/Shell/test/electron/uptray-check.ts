// The update tray, sheet 35 (his picks, 2026-10-14): the update itself as ticks on parchment (lines he can leave out
// are tick boxes), the ... menu on top, Skip asks twice with "Never mind, take the update" first, every version shown
// in the tray, the key's colours by age (gold, turquoise glow, red, swell and shake), and the overnight drop-down.
//
// Run: npx electron test/electron/uptray-check.ts
import { app, BrowserWindow, ipcMain, screen } from 'electron';
import { mkdtempSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { servePages } from '../../src/pageserver.ts';
import { AangBrowser } from '../../src/browser.ts';
import { wireBrowser } from '../../src/browseripc.ts';

process.on('uncaughtException', (e) => { console.log('HARNESS NOTE ' + String((e as Error).message).split('\n')[0]); });
process.on('unhandledRejection', (e) => { console.log('HARNESS REJECTION ' + String((e as Error)?.stack ?? e)); app.exit(2); });
setTimeout(() => { console.log('HARNESS TIMEOUT'); app.exit(3); }, 90_000).unref();
app.on('window-all-closed', () => { /* the test decides */ });
const HERE = path.dirname(fileURLToPath(import.meta.url));
BrowserWindow.prototype.show = function (this: BrowserWindow) { this.setPosition(-6000, 100); this.showInactive(); };
BrowserWindow.prototype.focus = function () { /* not in a test */ };
let bad = 0;
const check = (what: string, ok: boolean, d = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${what}${d ? '  -- ' + d : ''}`); if (!ok) bad++; };
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const DAY = 86_400_000;

app.whenReady().then(async () => {
  (screen as any).getCursorScreenPoint = () => ({ x: -20000, y: 500 });
  const pages = await servePages(path.join(HERE, '..', '..', 'pages'));
  const b = new AangBrowser({ origin: pages.origin, stateDir: mkdtempSync(path.join(os.tmpdir(), 'uptray-')), preloadPath: path.join(HERE, '..', '..', 'src', 'preload.cjs'),
    tabPreloadPath: path.join(HERE, '..', '..', 'src', 'tabpreload.cjs'), settingsPreloadPath: path.join(HERE, '..', '..', 'src', 'settingspreload.cjs'), thingsPreloadPath: path.join(HERE, '..', '..', 'src', 'thingspreload.cjs') });
  wireBrowser(() => b);
  const gone: any[] = [], acts: any[] = [];
  ipcMain.on('browser:updatego', (_e, c) => gone.push(c));
  ipcMain.on('browser:updateact', (e, a) => { acts.push(a); if (a.act === 'changelog') e.sender.send('browser:changelog', '# Samara Changelog\n\nintro words\n\n## Version 1.0.0: Gojo\n*October 14, 2026*\n\n- Big change: Your browser is now called Samara.\n'); });
  b.open('about:blank'); await wait(2500);
  const w = (b as any).win as BrowserWindow;
  const js = (s: string) => w.webContents.executeJavaScript(s);
  check('the window is called Samara', /Samara$/.test(w.getTitle()), w.getTitle());
  const card = (since: number) => ({ version: '44.7.2', since, title: 'Version 1.1.0: Gojo', canBack: true, overnight: false,
    groups: [{ name: 'SAMARA', items: [{ text: 'Only one Samara in your Dock, always.' }] }, { name: "SAMARA'S ENGINE", items: [
      { text: "Chrome's newest security fixes.", note: 'Always included: they close known holes.' },
      { text: "Lock your saved logins with your computer's own lock.", key: 'lock', on: true },
      { text: 'Close a back door other programs could use.', key: 'closeBackdoors', on: true }] }] });
  const keyClass = () => js(`document.getElementById('upkey').className`);
  b.setUpdate(card(Date.now())); await wait(400);
  check('today the key is gold and pulses', /age0/.test(await keyClass()) && (await js(`getComputedStyle(document.querySelector('#upkey .w'), '::after').animationName`)) === 'upglow');
  b.setUpdate(card(Date.now() - 1.2 * DAY)); await wait(300);
  const tq = await js(`(() => { const k = document.getElementById('upkey'); return { c: k.className, ink: getComputedStyle(k).getPropertyValue('--ink').trim(), bg: getComputedStyle(k).backgroundImage }; })()`);
  check('after a day the arrow and word glow turquoise, the purple stays', /age1/.test(tq.c) && tq.ink === '#9FF0E6' && !/184, 69, 46/.test(tq.bg), `${tq.ink} ${String(tq.bg).slice(0, 60)}`);
  b.setUpdate(card(Date.now() - 3.2 * DAY)); await wait(300);
  check('after three days it is red', /age2/.test(await keyClass()) && !/swell/.test(await keyClass()));
  b.setUpdate(card(Date.now() - 4.5 * DAY)); await wait(300);
  const sw = await js(`getComputedStyle(document.getElementById('upkey')).animationName`);
  check('after four it swells and shakes', /swell/.test(await keyClass()) && /swellshake/.test(sw), sw);
  // the tray
  await js(`document.getElementById('upkey').click()`); await wait(300);
  const t = await js(`({ open: !document.getElementById('uptray').hidden, name: document.getElementById('upname').textContent, boxes: document.querySelectorAll('#uplist .bx').length, opts: document.querySelectorAll('#uplist .it.opt').length, groups: [...document.querySelectorAll('#uplist .grp')].map(g => g.textContent), lantern: !!document.querySelector('#uptray .uphd img[src*="samara-lantern"]') })`);
  check('the tray: the lantern, the version and name, the update as ticks in groups', t.open && t.name === 'Version 1.1.0: Gojo' && t.boxes === 4 && t.lantern && t.groups.join('|') === "SAMARA|SAMARA'S ENGINE", JSON.stringify(t));
  check('two lines he can leave out', t.opts === 2);
  if (process.env.UPTRAY_SHOT) { const r = await js(`(() => { const x = document.getElementById('uptray').getBoundingClientRect(); return { x: Math.max(0, x.left - 20), y: Math.max(0, x.top - 70), width: x.width + 40, height: x.height + 90 }; })()`); const img = await w.webContents.capturePage({ x: Math.round(r.x), y: Math.round(r.y), width: Math.round(r.width), height: Math.round(r.height) }); (await import('node:fs')).writeFileSync(process.env.UPTRAY_SHOT, img.toPNG()); }
  await js(`document.querySelectorAll('#uplist .it.opt')[0].click()`); await wait(100);
  check('unticking says it is left out', await js(`/Left out/.test(document.querySelectorAll('#uplist .it.opt')[0].textContent) && document.querySelectorAll('#uplist .it.opt .bx.off').length === 1`));
  // the ... menu, on top of everything
  await js(`document.getElementById('upmore').click()`); await wait(150);
  const m = await js(`(() => { const r = document.getElementById('upmenu').getBoundingClientRect(); const top = document.elementFromPoint(r.left + 20, r.top + 12); return { shown: !document.getElementById('upmenu').hidden, onTop: document.getElementById('upmenu').contains(top), items: [...document.querySelectorAll('#upmenu button')].map(b => b.textContent.trim()) }; })()`);
  check('the ... menu opens on top', m.shown && m.onTop, JSON.stringify(m.items));
  check('it holds exactly his items, no Remind me, no Check for updates', m.items.join('|') === 'Checked and safe|Skip this version|Every version|Go back to the last version|Update by itself overnight', m.items.join('|'));
  check('no emoji anywhere in it', !/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(m.items.join('')));
  // Skip asks twice; Never mind is first
  await js(`document.querySelector('#upmenu [data-up=skip]').click()`); await wait(150);
  const s1 = await js(`({ shown: !document.getElementById('upskip1').hidden, first: document.querySelector('#upskip1 .key').textContent, keys: [...document.querySelectorAll('#upskip1 .key')].map(k => k.className) })`);
  check('skip: first a warning, with "Never mind, take the update" first and gold', s1.shown && s1.first === 'Never mind, take the update' && /primary/.test(s1.keys[0]) && /plum/.test(s1.keys[1]) && /danger/.test(s1.keys[2]), JSON.stringify(s1));
  const fits = await js(`[...document.querySelectorAll('#upskip1 .key')].every(k => k.scrollWidth <= k.clientWidth + 1 && k.getBoundingClientRect().height < 40)`);
  check('the buttons fit their words, on one line', fits);
  await js(`document.querySelector('#upskip1 [data-up=skip2]').click()`); await wait(150);
  check('skip for good: one last are-you-sure', await js(`!document.getElementById('upskip2').hidden && /gone for good/.test(document.getElementById('upskip2msg').textContent)`));
  await js(`document.querySelector('#upskip2 [data-up=take]').click()`); await wait(200);
  check('never mind takes the update, with his boxes as he left them', gone.length === 1 && gone[0]?.lock === false && gone[0]?.closeBackdoors === true, JSON.stringify(gone[0]));
  // every version, inside the tray
  if (await js(`document.getElementById('uptray').hidden`)) { await js(`document.getElementById('upkey').click()`); await wait(150); }
  await js(`document.getElementById('upmore').click()`); await wait(100);
  await js(`document.querySelector('#upmenu [data-up=changelog]').click()`); await wait(300);
  const v = await js(`({ shown: !document.getElementById('upvers').hidden, text: document.getElementById('uplog').textContent })`);
  check('every version reads in the tray', v.shown && /Version 1\.0\.0: Gojo/.test(v.text) && /called Samara/.test(v.text), String(v.text).slice(0, 80));
  // check for updates lives in Samara's own menu
  await js(`document.getElementById('m-updates').click()`); await wait(100);
  check('"Check for updates" is in Samara\'s own ... menu', acts.some((a) => a.act === 'check'));
  // the overnight drop-down: plain lines, no tick boxes
  b.setUpdated({ title: 'Version 1.1.0: Gojo', lines: ['Only one Samara in your Dock, always.', "Chrome's newest security fixes."] }); await wait(400);
  const d = await js(`({ shown: !document.getElementById('updone').hidden, name: document.getElementById('updonename').textContent, dots: document.querySelectorAll('#updonelist .dot').length, boxes: document.querySelectorAll('#updonelist .bx').length })`);
  check('after an overnight update: what changed, plain lines, no tick boxes', d.shown && d.name === 'Version 1.1.0: Gojo' && d.dots === 2 && d.boxes === 0, JSON.stringify(d));
  await js(`document.getElementById('updoneok').click()`); await wait(150);
  check('Got it closes it and says it was seen', (await js(`document.getElementById('updone').hidden`)) && acts.some((a) => a.act === 'seen'));
  (b as any).closeAll?.(); pages.close();
  console.log(bad ? `${bad} failed` : 'all passed');
  setTimeout(() => app.exit(bad ? 1 : 0), 500);
});
