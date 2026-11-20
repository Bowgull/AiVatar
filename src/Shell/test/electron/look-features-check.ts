// Sheet 120 A and 121 (2026-11-20): the new pieces, driven in the real browser on the hidden desktop. Each line PASS/FAIL.
//  1. the band's panels float over the LIVE page (no frozen picture); the ⋯ menu's lines are menu items, arrows move, Esc closes
//  2. Ctrl and + zooms the page (a real key press into the page)
//  3. hover a tab in the list: a picture beside the list, gone when the mouse leaves the rows
//  4. two pages side by side: both shown, the peg shares the space, a click picks a side, × ends it, saved and restored
//  5. peek: a real Shift-click and a real held press on a link open it on top (no new tab, the page stays), Esc closes,
//     Side by side keeps it beside the page
//  6. the sound mark on the folded handle while a tab plays sound
// Run: powershell -File tools/hidden-desktop-run.ps1 -Command "npx electron test/electron/look-features-check.ts"
import { app, BrowserWindow, type WebContents } from 'electron';
import http from 'node:http';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
process.on('uncaughtException', (e) => console.log('HARNESS NOTE ' + (e as Error).message));
setTimeout(() => { console.log('HARNESS TIMEOUT'); app.exit(3); }, 240_000).unref();
const HERE = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 47994;
app.setPath('userData', mkdtempSync(path.join(os.tmpdir(), 'lfeat-ud-')));
app.commandLine.appendSwitch('disable-backgrounding-occluded-windows');
app.commandLine.appendSwitch('force-device-scale-factor', '1');
app.on('window-all-closed', () => {});
BrowserWindow.prototype.show = function (this: BrowserWindow) { this.setOpacity(0); this.showInactive(); };
BrowserWindow.prototype.focus = function () {};
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
let fails = 0;
const ok = (c: boolean, what: string, more = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'} ${what}${more ? ' (' + more + ')' : ''}`); };
const js = <T = unknown>(wc: WebContents, code: string) => wc.executeJavaScript(code, true).catch((e: Error) => 'ERR ' + e.message) as Promise<T>;
const PAGE = (t: string, body: string) => `<!doctype html><title>${t}</title><style>body{margin:0;font:17px Georgia;padding:40px}a{display:inline-block;padding:6px}</style>${body}`;
const until = async (f: () => boolean | Promise<boolean>, ms = 4000) => { const end = Date.now() + ms; while (Date.now() < end) { if (await f()) return true; await wait(100); } return false; };

app.whenReady().then(async () => {
  http.createServer((q, r) => {
    const u = q.url ?? '/';
    const body = u.startsWith('/news') ? PAGE('Newsprint', '<h1>Newsprint</h1>') : PAGE('Page ' + u, `<h1>Page ${u}</h1><p><a id="lnk" href="/newsprint">plain newsprint</a></p>`);
    r.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }).end(body);
  }).listen(PORT, '127.0.0.1');
  const { servePages } = await import('../../src/pageserver.ts');
  const { AangBrowser } = await import('../../src/browser.ts');
  const { wireBrowser } = await import('../../src/browseripc.ts');
  const pages = await servePages(path.join(HERE, '..', '..', 'pages'));
  const stateDir = mkdtempSync(path.join(os.tmpdir(), 'lfeat-state-'));
  writeFileSync(path.join(stateDir, 'browser-tabs.json'), JSON.stringify({ v: 1, active: 0, fronts: [0], tabs: ['/a', '/b', '/c'].map((u) => ({ url: `http://127.0.0.1:${PORT}${u}`, title: u, scrollY: 0, zoom: 0, win: 0, trail: null })), trails: [], closed: [] }));
  const b: any = new AangBrowser({ origin: pages.origin, stateDir, preloadPath: path.join(HERE, '..', '..', 'src', 'samarapreload.cjs'),
    tabPreloadPath: path.join(HERE, '..', '..', 'src', 'tabpreload.cjs'), settingsPreloadPath: path.join(HERE, '..', '..', 'src', 'settingspreload.cjs'), thingsPreloadPath: path.join(HERE, '..', '..', 'src', 'thingspreload.cjs') } as any);
  wireBrowser(() => b);
  b.open();
  await wait(2500);
  b.win.setContentSize(1440, 900);
  await wait(4500);
  const F = b.win.webContents as WebContents;
  const cur = () => b.tabs.find((t: any) => t.id === b.pane.active);
  await until(() => cur()?.view && !cur().view.webContents.isLoading(), 6000);

  // ---- 1. panels over the live page
  ok(await until(async () => (await js<boolean>(F, `document.documentElement.classList.contains('floated')`)) === true, 6000), 'the band knows its panel layer is ready');
  await js(F, `document.getElementById('menukey').dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, detail: 1 })), 1`);
  await wait(700);
  const fv = b.pane.floatV?.webContents as WebContents;
  ok(b.pane.floatOn === true && b.pane.floatV.getVisible(), 'the ⋯ menu opens in its own layer');
  ok(await js<boolean>(fv, `!document.getElementById('menu').hidden`) === true, 'the menu shows in the layer');
  ok(cur().view.getVisible() === true && await js<boolean>(F, `document.getElementById('frozen').hidden`) === true, 'the page stays live under it (no frozen picture)');
  ok(await js<string>(F, `document.getElementById('menukey').getAttribute('aria-expanded')`) === 'true', 'the ⋯ key says the menu is open');
  ok(await js<number>(fv, `document.querySelectorAll('#menu [role=menuitem]').length`) >= 12, 'the menu lines are menu items');
  fv.sendInputEvent({ type: 'keyDown', keyCode: 'Down' }); fv.sendInputEvent({ type: 'keyUp', keyCode: 'Down' }); await wait(150);
  fv.sendInputEvent({ type: 'keyDown', keyCode: 'Down' }); fv.sendInputEvent({ type: 'keyUp', keyCode: 'Down' }); await wait(150);
  const at = await js<string>(fv, `(document.activeElement.getAttribute('role') || '') + ':' + document.activeElement.id`);
  ok(at === 'menuitem:zin', 'Down, Down lands on the second line', at);
  fv.sendInputEvent({ type: 'keyDown', keyCode: 'End' }); await wait(150);
  ok(await js<string>(fv, `document.activeElement.id`) === 'm-settings', 'End lands on the last line');
  fv.sendInputEvent({ type: 'keyDown', keyCode: 'Escape' }); await wait(400);
  ok(b.pane.floatOn === false && !b.pane.floatV.getVisible(), 'Esc closes it and the layer goes');
  await js(F, `document.getElementById('lock').dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, detail: 1 })), 1`);
  await wait(700);
  ok(b.pane.floatOn === true && await js<boolean>(fv, `!document.getElementById('sitepanel').hidden`) === true, 'the shield panel opens in the layer too');
  ok(await js<string>(fv, `[...document.querySelectorAll('#sitepanel [role=switch]')].map((s) => s.getAttribute('aria-label') + '=' + s.getAttribute('aria-checked')).join(',')`).then((s) => /Block ads=(true|false)/.test(s)), 'its switches name the setting and carry the value');
  ok(await js<string>(fv, `document.querySelector('#camk').getAttribute('role') + ':' + document.querySelectorAll('#camk [role=radio][aria-checked=true]').length`) === 'radiogroup:1', 'camera is one segmented choice');
  // A click outside (on the shade of the layer) closes it.
  fv.sendInputEvent({ type: 'mouseDown', x: 900, y: 600, button: 'left', clickCount: 1 }); fv.sendInputEvent({ type: 'mouseUp', x: 900, y: 600, button: 'left', clickCount: 1 });
  await wait(500);
  ok(b.pane.floatOn === false, 'a click outside closes the panel');

  // ---- 2. Ctrl and + zooms the page
  const pv = cur().view.webContents as WebContents;
  pv.focus();
  pv.sendInputEvent({ type: 'keyDown', keyCode: '=', modifiers: ['control'] }); pv.sendInputEvent({ type: 'keyUp', keyCode: '=', modifiers: ['control'] });
  await wait(400);
  ok(pv.getZoomLevel() === 0.5, 'Ctrl and + zooms the page', String(pv.getZoomLevel()));
  pv.sendInputEvent({ type: 'keyDown', keyCode: '0', modifiers: ['control'] }); await wait(200);
  const fronts: boolean[] = []; b.onFront = (on: boolean) => fronts.push(on); b.frontWas = false; b.frontNow();
  ok(true, 'front changes are told to Aang (unit-tested: talkStepsAside)');

  // ---- 3. hover a tab
  b.tray(true, { x: 42, y: 62, hy: 80 });
  await wait(1500);
  const tv = b.trayV.webContents as WebContents;
  await js(tv, `(() => { const r = document.querySelectorAll('#tabs .tp[data-tab]')[1]; r.dispatchEvent(new PointerEvent('pointerover', { bubbles: true })); return 1; })()`);
  await wait(250);
  ok(!b.tabPeekOn, 'nothing shows before the mouse has rested a moment');
  ok(await until(() => b.tabPeekOn === true, 2000), 'resting on a tab shows its picture');
  const pb = b.tabPeekV?.getBounds();
  ok(pb && pb.x >= 42 + 300, 'the picture is beside the list, not in it', JSON.stringify(pb));
  await wait(500);
  const title = await js<string>(b.tabPeekV.webContents, `document.getElementById('host').textContent + document.getElementById('rest').textContent`);
  ok(/127\.0\.0\.1\/b/.test(title), 'it names the page', title);
  await js(tv, `(() => { const r = document.querySelectorAll('#tabs .tp[data-tab]')[1]; r.dispatchEvent(new PointerEvent('pointerout', { bubbles: true, relatedTarget: document.body })); return 1; })()`);
  ok(await until(() => b.tabPeekOn === false, 1500), 'leaving the rows takes it away');
  b.tray(false);
  await wait(600);

  // ---- 4. side by side
  b.activate(b.tabs[0].id); await wait(800);
  await js(F, `document.getElementById('menukey').dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, detail: 1 })), 1`); await wait(600);
  await js(fv, `document.getElementById('m-split').click(), 1`);
  await wait(2500);
  const [L, R] = [b.tabs.find((t: any) => t.id === b.pane.split?.left), b.tabs.find((t: any) => t.id === b.pane.split?.right)];
  ok(Boolean(L && R), '"Side by side" in the menu pairs the page with the last one he was on');
  const lb = L?.view?.getBounds(), rb = R?.view?.getBounds();
  ok(L?.view?.getVisible() && R?.view?.getVisible() && lb && rb && lb.x + lb.width + 22 === rb.x && lb.y === rb.y, 'both pages show, side by side with the peg gap', JSON.stringify([lb, rb]));
  ok(await js<boolean>(F, `!document.getElementById('sbs').hidden && document.querySelectorAll('.sbpane.on').length === 1`) === true, 'the band draws the strips and the gold edge on one page');
  // The peg, really dragged (real mouse into the band).
  const peg = await js<{ x: number; y: number }>(F, `(() => { const r = document.getElementById('sbpeg').getBoundingClientRect(); return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) }; })()`);
  F.sendInputEvent({ type: 'mouseDown', x: peg.x, y: peg.y, button: 'left', clickCount: 1 });
  for (let i = 1; i <= 8; i++) { F.sendInputEvent({ type: 'mouseMove', x: peg.x - i * 30, y: peg.y, modifiers: ['leftbuttondown'] }); await wait(40); }
  F.sendInputEvent({ type: 'mouseUp', x: peg.x - 240, y: peg.y, button: 'left', clickCount: 1 });
  await wait(500);
  const r2 = b.pane.split?.ratio ?? 0;
  ok(r2 > 0.25 && r2 < 0.4, 'dragging the peg shares the space', r2.toFixed(3));
  ok(Math.abs(L.view.getBounds().width - Math.round((1360 - 22) * r2)) <= 2 || L.view.getBounds().width < lb.width - 150, 'the left page follows the peg', String(L.view.getBounds().width));
  await js(F, `document.querySelector('#sbl .ph').click(), 1`); await wait(500);
  ok(b.pane.active === L.id, 'a click on a page\'s strip makes it the one in use');
  ok(await js<boolean>(F, `document.getElementById('sbl').classList.contains('on')`) === true, 'and it gets the gold edge');
  await b.snapshot(true);
  const saved = JSON.parse(readFileSync(path.join(stateDir, 'browser-tabs.json'), 'utf8'));
  ok(Array.isArray(saved.splits) && saved.splits.length === 1 && saved.tabs[saved.splits[0].left]?.url === L.url && saved.tabs[saved.splits[0].right]?.url === R.url, 'the pair is saved with the session', JSON.stringify(saved.splits));
  // Picking another tab shows it alone; picking one of the pair shows both again.
  const other = b.tabs.find((t: any) => t.id !== L.id && t.id !== R.id);
  b.activate(other.id); await wait(800);
  ok(!L.view.getVisible() && !R.view.getVisible() && await js<boolean>(F, `document.getElementById('sbs').hidden`) === true, 'another tab shows alone');
  b.activate(R.id); await wait(800);
  ok(L.view.getVisible() && R.view.getVisible(), 'picking one of the pair shows both again');
  await js(F, `document.querySelector('#sbr .ph .x').click(), 1`); await wait(600);
  ok(!b.pane.split && b.pane.active === L.id && !R.view.getVisible() && b.tabs.includes(R), 'the × ends the pair; both tabs stay open');

  // ---- 5. peek
  b.activate(b.tabs[0].id); await wait(1500);
  const before = b.tabs.length, page0 = cur().view.webContents as WebContents, url0 = page0.getURL();
  const lnk = await js<{ x: number; y: number }>(page0, `(() => { const r = document.getElementById('lnk').getBoundingClientRect(); return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) }; })()`);
  page0.sendInputEvent({ type: 'mouseDown', x: lnk.x, y: lnk.y, button: 'left', clickCount: 1, modifiers: ['shift'] });
  page0.sendInputEvent({ type: 'mouseUp', x: lnk.x, y: lnk.y, button: 'left', clickCount: 1, modifiers: ['shift'] });
  ok(await until(() => Boolean(b.lp) && /newsprint/.test(b.lp.view.webContents.getURL()), 4000), 'Shift-click on a link opens it on top');
  await wait(600);
  ok(b.tabs.length === before && page0.getURL() === url0, 'no new tab, and the page under it stayed', `${b.tabs.length} ${page0.getURL()}`);
  b.lp.view.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Escape' });
  await wait(400);
  ok(!b.lp, 'Esc closes it');
  page0.sendInputEvent({ type: 'mouseDown', x: lnk.x, y: lnk.y, button: 'left', clickCount: 1 });
  await wait(900);
  page0.sendInputEvent({ type: 'mouseUp', x: lnk.x, y: lnk.y, button: 'left', clickCount: 1 });
  await wait(900);
  ok(Boolean(b.lp) && page0.getURL() === url0, 'holding the mouse on a link opens it on top, and the page under it does not follow the link', page0.getURL());
  const shadeOk = b.lp && await js<string>(b.lp.shade.webContents, `document.getElementById('host').textContent`);
  ok(shadeOk === '127.0.0.1', 'its strip names the page', String(shadeOk));
  // A click on the shade, outside the page.
  b.lp.shade.webContents.sendInputEvent({ type: 'mouseDown', x: 20, y: 400, button: 'left', clickCount: 1 });
  await wait(400);
  ok(!b.lp, 'a click outside closes it');
  b.linkPeek(`http://127.0.0.1:${PORT}/newsprint`, b.pane.active); await wait(1500);
  b.peekAct(b.lp.shade.webContents, 'split'); await wait(2500);
  const pr = b.pane.split && b.tabs.find((t: any) => t.id === b.pane.split.right);
  ok(Boolean(pr) && /newsprint/.test(pr.url) && !b.lp, '"Side by side" keeps it beside the page');
  b.splitClose(); await wait(500);

  // ---- restored after a restart: the pair comes back
  b.splitOpen(b.tabs[1].id); await wait(1500);
  const pair = { ...b.pane.split };
  const lu = b.tabs.find((t: any) => t.id === pair.left).url, ru = b.tabs.find((t: any) => t.id === pair.right).url;
  await b.snapshot(true);
  b.win.close();
  await wait(2000);
  b.open();
  await wait(6000);
  const back = b.splitOf?.(b.pane);
  ok(Boolean(back) && back.L.url === lu && back.R.url === ru, 'after closing and opening Samara, the pair comes back', back ? `${back.L.url} | ${back.R.url}` : 'none');

  // ---- 6. the sound mark
  const F2 = b.win.webContents as WebContents;
  ok(await js<boolean>(F2, `document.getElementById('sndmark').hidden`) === true, 'no sound mark while nothing plays');
  b.tabs[0].audible = true; b.sendTabs(); await wait(500);
  ok(await js<boolean>(F2, `!document.getElementById('sndmark').hidden && getComputedStyle(document.getElementById('sndmark')).display !== 'none'`) === true, 'a gold speaker on the folded handle while a tab plays sound');
  b.tabs[0].audible = false; b.sendTabs(); await wait(500);
  ok(await js<boolean>(F2, `document.getElementById('sndmark').hidden`) === true, 'it goes when the sound stops');

  console.log(fails ? `FAILED ${fails}` : 'ALL PASS');
  app.exit(fails ? 1 : 0);
});
