// Sheet 56, look A (2026-10-21): Aang's new right-click menu, off screen. The real AangMenu window class, the real page
// and preload; never focused, never on his screen, no real mouse, keys or clipboard (the mouse is input events sent to
// the page itself, Esc a key event made inside it).
// Checks: the items and their order; the states (N RUNNING, UNTIL h:mm, the model, the ticks, Come back greyed, Quit
// red); the glove on the row under the mouse; the side submenus (Hush with Mute and Quiet in games, Dock, Model); a
// pick sends its id and closes; Esc, a click away and losing focus close with no pick; unknown ids are dropped.
// Picture: Hush open, pointing at "For 1 hour", at 2x like look-A.png.
//
// Run: npx electron test/electron/aangmenu-check.ts [folder for the picture]
import { app, BrowserWindow, ipcMain, screen } from 'electron';
import { mkdtempSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import os from 'node:os'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
import { servePages } from '../../src/pageserver.ts';
import { AangMenu, avoidRect } from '../../src/aangmenu.ts';

process.on('uncaughtException', (e) => { console.log('HARNESS ERROR ' + String((e as Error)?.stack ?? e).split('\n').slice(0, 3).join(' | ')); app.exit(2); });
process.on('unhandledRejection', (e) => { console.log('HARNESS REJECTION ' + String((e as Error)?.stack ?? e)); app.exit(2); });
setTimeout(() => { console.log('HARNESS TIMEOUT'); app.exit(3); }, 90_000).unref();
app.on('window-all-closed', () => {});
app.setPath('userData', mkdtempSync(path.join(os.tmpdir(), 'aangmenu-check-')));
const HERE = path.dirname(fileURLToPath(import.meta.url));
// Off his screen, never in front of his game.
BrowserWindow.prototype.show = function (this: BrowserWindow) { this.setPosition(-9000, 100); this.showInactive(); };
BrowserWindow.prototype.focus = function () {};
BrowserWindow.prototype.moveTop = function () {};
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
let bad = 0;
const check = (what: string, ok: boolean, d: unknown = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${what}${d !== '' ? '  -- ' + String(typeof d === 'string' ? d : JSON.stringify(d)).slice(0, 300) : ''}`); if (!ok) bad++; };
const until = async (fn: () => boolean | Promise<boolean>, ms = 6000) => { const end = Date.now() + ms; while (Date.now() < end) { if (await fn()) return true; await wait(60); } return fn(); };
const OUT = (() => { const a = process.argv.at(-1); try { return a && statSync(a).isDirectory() ? a : os.tmpdir(); } catch { return os.tmpdir(); } })();

app.whenReady().then(async () => {
  const pages = await servePages(path.join(HERE, '..', '..', 'pages'));
  const picks: string[] = [];
  const menu = new AangMenu({ origin: pages.origin, preloadPath: path.join(HERE, '..', '..', 'src', 'preload.cjs'),
    iconPath: path.join(HERE, '..', '..', 'assets', 'aang.ico'), pick: (id) => picks.push(id) });
  const shapes: unknown[] = [];
  let keepShapes = true;
  const realShape = BrowserWindow.prototype.setShape;
  BrowserWindow.prototype.setShape = function (this: BrowserWindow, r: Electron.Rectangle[]) { if (keepShapes) { shapes.push(r); realShape.call(this, r); } };
  // The same two doors main.ts opens for it.
  ipcMain.on('menu:pick', (e, id) => { if (menu.owns(e.sender)) menu.picked(e.sender, id); });
  ipcMain.on('menu:shape', (e, rects) => { if (menu.owns(e.sender)) menu.shape(e.sender, rects); });
  menu.warm();
  const w = BrowserWindow.getAllWindows()[0]!;
  const js = (s: string) => w.webContents.executeJavaScript(s, true);
  await until(async () => !w.webContents.isLoading() && (await js(`document.readyState`)) === 'complete', 10000);

  const prefs = (w.webContents as any).getLastWebPreferences?.() ?? {};
  check('safe settings (sandbox, isolation, no node)', prefs.sandbox === true && prefs.contextIsolation === true && prefs.nodeIntegration === false, prefs);
  check('frameless, see-through, on top', !w.isResizable() && w.isAlwaysOnTop() && await js(`getComputedStyle(document.body).backgroundColor === 'rgba(0, 0, 0, 0)'`) === true);
  check('the page cannot reach the machine', await js(`typeof require === 'undefined' && typeof process === 'undefined' && typeof window.aang.menuPick === 'function'`) === true);

  const wa = screen.getPrimaryDisplay().workArea;
  const phys = (x: number, y: number) => screen.dipToScreenPoint({ x: wa.x + x, y: wa.y + y });
  const hushEnd = new Date(); hushEnd.setHours(19, 40, 0, 0); if (hushEnd.getTime() < Date.now()) hushEnd.setDate(hushEnd.getDate() + 1);
  const STATE = { muted: false, quiet: 'auto', dock: 'none', docked: false, model: 'auto', saving: true, hushedUntil: hushEnd.getTime(), jobsRunning: 2,
    models: [{ id: 'auto', label: 'Auto: Quick for chat, Smart when the work needs it' }, { id: 'quick', label: 'Quick (Haiku): fastest, for chat' },
      { id: 'smart', label: 'Smart (Sonnet): better reasoning' }, { id: 'deep', label: 'Deep (Opus): the strongest, slowest' }] };
  const openAt = async (x: number, y: number, state: Record<string, unknown> = STATE) => {
    shapes.length = 0;
    menu.open(phys(x, y), state);
    return until(() => menu.visible && shapes.length > 0);
  };
  const rect = (sel: string) => js(`(() => { const r = document.querySelector(${JSON.stringify(sel)})?.getBoundingClientRect(); return r ? { x: r.left, y: r.top, w: r.width, h: r.height } : null; })()`);
  const move = async (x: number, y: number) => { w.webContents.sendInputEvent({ type: 'mouseMove', x: Math.round(x), y: Math.round(y) }); await wait(60); };
  const clickAt = async (x: number, y: number) => {
    await move(x, y);
    w.webContents.sendInputEvent({ type: 'mouseDown', x: Math.round(x), y: Math.round(y), button: 'left', clickCount: 1 });
    w.webContents.sendInputEvent({ type: 'mouseUp', x: Math.round(x), y: Math.round(y), button: 'left', clickCount: 1 });
    await wait(120);
  };
  const centre = async (sel: string) => { const r = await rect(sel); return r ? { x: r.x + Math.min(70, r.w / 2), y: r.y + r.h / 2 } : { x: -1, y: -1 }; };

  // 1. Opens at the mouse, near the bottom of the screen: up from the pointer, to its right.
  const Y = wa.height - 120;
  check('opens and shows once the page gave its shape', await openAt(300, Y));
  const main = await rect('#main');
  check('beside the mouse: to its right, bottom at the pointer', !!main && Math.abs(main.x - 302) <= 2 && Math.abs(main.y + main.h - Y) <= 3, main);
  check('cut to the menu (only it takes the mouse)', Array.isArray(shapes.at(-1)) && (shapes.at(-1) as unknown[]).length === 1, shapes.at(-1));

  // 2. The items, in his order, with their states.
  const items = await js(`[...document.querySelectorAll('#main > *')].map((e) => e.classList.contains('sep') ? '-' : e.querySelector('.lab').textContent
    + (e.querySelector('i.st') ? ' [' + e.querySelector('i.st').firstChild.textContent + ']' : '') + (e.dataset.sub ? ' >' : '') + (e.querySelector('[data-tick]') ? ' (tick)' : '')
    + (e.disabled ? ' (grey)' : '') + (e.classList.contains('danger') ? ' (red)' : ''))`);
  check('items in order with states', JSON.stringify(items) === JSON.stringify(['Look back', 'Claude jobs [2 RUNNING]', 'Job hunt now', '-', 'Hush [UNTIL 7:40] >', '-',
    'Dock >', 'Come back (grey)', 'Hide', '-', 'Model [AUTO] >', 'Save quota (tick)', '-', 'Quit Aang (red)']), items);
  check('the dropped items are gone', await js(`!/Panel|Permissions|Activity|hide key|which app|Conversation|Talk to Aang/.test(document.body.textContent)`) === true);
  check('a pixel icon on every row', await js(`[...document.querySelectorAll('#main button')].every((b) => b.querySelector('.lab canvas.ic'))`) === true);
  check('Quit is red', await js(`getComputedStyle(document.querySelector('[data-id=quit]')).color`) === 'rgb(255, 154, 138)');
  check('Samara’s wood', /tray\.png/.test(await js(`getComputedStyle(document.getElementById('main')).backgroundImage`)));

  // 3. The glove: the row under the mouse turns gold with the hand before it.
  const hunt = await centre('[data-id=hunt]');
  await move(hunt.x, hunt.y); await wait(150);
  const glove = await js(`(() => { const b = document.querySelector('[data-id=hunt]'); return { hover: b.matches(':hover'), color: getComputedStyle(b).color, hand: getComputedStyle(b, '::before').backgroundImage }; })()`);
  check('glove + gold on the hovered row', glove.hover && glove.color === 'rgb(255, 226, 140)' && /hand\.png/.test(glove.hand), glove);
  const off = await centre('[data-id=comeback]');
  await move(off.x, off.y); await wait(150);
  check('no glove on the greyed row', await js(`getComputedStyle(document.querySelector('[data-id=comeback]'), '::before').backgroundImage === 'none'`) === true);

  // 4. Hush opens to the side.
  const hush = await centre('[data-sub=hush]');
  await move(hush.x, hush.y);
  check('Hush opens its submenu on a rest', await until(async () => (await js(`document.querySelector('#sub')?.dataset.of`)) === 'hush', 2000));
  const sub = await rect('#sub'), hr = await rect('[data-sub=hush]');
  check('to the side of the main menu, level with Hush', !!sub && !!main && sub.x >= main.x + main.w - 8 && Math.abs(sub.y - (hr!.y - 9)) <= 3, { sub, hr });
  check('Hush reads gold while it is open', await js(`document.querySelector('[data-sub=hush]').classList.contains('on')`) === true);
  const subItems = await js(`[...document.querySelectorAll('#sub > *')].map((e) => e.classList.contains('sep') ? '-' : e.classList.contains('mhead') ? '#' + e.textContent
    : e.querySelector('.lab').textContent + (e.querySelector('[data-tick]') ? ' (tick)' : '') + (e.disabled ? ' (grey)' : ''))`);
  check('Hush items with Mute and Quiet in games', JSON.stringify(subItems) === JSON.stringify(['For 15 minutes', 'For 1 hour', 'For 4 hours', 'Until tomorrow', 'Stop hushing now', '-',
    'Mute: nothing unprompted', '-', '#QUIET IN GAMES', 'Auto: while WoW is in front (tick)', 'Always', 'Never']), subItems);
  check('the shape grew to take the submenu', (shapes.at(-1) as unknown[]).length === 2);
  const hour = await centre('#sub [data-id="hush.60"]');
  await move(hour.x, hour.y); await wait(200);
  check('glove in the submenu, submenu stays', await js(`document.querySelector('#sub [data-id="hush.60"]').matches(':hover') && !!document.querySelector('#sub')`) === true);

  // 5. The picture: Hush open, pointing at "For 1 hour", at 2x like look-A.png, with Aang where the mockup has him.
  {
    keepShapes = false;
    menu.close();
    w.webContents.setZoomFactor(2);
    await wait(200);
    const sprite = 'data:image/png;base64,' + readFileSync(path.join(HERE, '..', '..', '..', '..', 'assets', 'aang', 'frames', 'idle_0.png')).toString('base64');
    // The menu opens up from his chest: the mockup's own spot (sprite at 24,~288 CSS px; the click 134,150 into him).
    const cx = 24 + 134, cy = 520 - 224 - 8 + 150;
    // At zoom 2 the page's pixels are half the window's; the page reads the point in its own pixels, the mouse is sent in
    // the window's (twice as big).
    menu.open(phys(cx, cy), STATE);
    await until(() => menu.visible);
    await js(`(() => { const d = document.createElement('div'); d.id = 'shotbg'; d.style.cssText = 'position:fixed;inset:0;z-index:-5;background:radial-gradient(900px 500px at 85% 5%, rgba(80,96,140,.30), transparent 60%),radial-gradient(700px 500px at 5% 100%, rgba(120,70,110,.22), transparent 60%),linear-gradient(180deg,#1c1f2b,#151720)';
      document.body.prepend(d);
      const i = new Image(); i.src = ${JSON.stringify(sprite)}; i.style.cssText = 'position:fixed;left:24px;top:${520 - 224 - 8}px;width:224px;image-rendering:pixelated;z-index:-1';
      document.body.append(i); return i.decode().then(() => 1); })()`);
    const h2 = await js(`(() => { const r = document.querySelector('[data-sub=hush]').getBoundingClientRect(); return { x: r.left + 60, y: r.top + r.height / 2 }; })()`);
    await move(h2.x * 2, h2.y * 2);
    await until(async () => (await js(`document.querySelector('#sub')?.dataset.of`)) === 'hush', 2000);
    const t2 = await js(`(() => { const r = document.querySelector('#sub [data-id="hush.60"]').getBoundingClientRect(); return { x: r.left + 60, y: r.top + r.height / 2 }; })()`);
    await move(t2.x * 2, t2.y * 2); await wait(400);
    const box = await js(`(() => { const a = document.getElementById('main').getBoundingClientRect(), b = document.getElementById('sub').getBoundingClientRect();
      const top = Math.min(a.top, b.top) - 28; return { x: 0, y: Math.max(0, Math.floor(top)), w: Math.ceil(Math.max(a.right, b.right)) + 30, h: Math.min(innerHeight, 520) - Math.max(0, Math.floor(top)) }; })()`);
    const img = await w.webContents.capturePage({ x: box.x * 2, y: box.y * 2, width: box.w * 2, height: box.h * 2 });
    const f = path.join(OUT, 'aangmenu-hush.png'); writeFileSync(f, img.toPNG()); console.log('PICTURE ' + f + ' ' + JSON.stringify(img.getSize()));
    await js(`document.getElementById('shotbg')?.remove(); document.querySelectorAll('body > img').forEach((i) => i.remove()); 1`);
    menu.close();
    w.webContents.setZoomFactor(1);
    keepShapes = true;
    await wait(200);
  }

  // 6. A pick sends its id and closes.
  await openAt(300, Y);
  await move(...Object.values(await centre('[data-sub=hush]')) as [number, number]);
  await until(async () => !!(await js(`!!document.querySelector('#sub')`)), 2000);
  const q = await centre('#sub [data-id="hush.60"]');
  picks.length = 0;
  await clickAt(q.x, q.y);
  check('For 1 hour sends hush.60 and closes', JSON.stringify(picks) === '["hush.60"]' && !menu.visible, { picks, visible: menu.visible });

  await openAt(300, Y);
  picks.length = 0;
  const cb = await centre('[data-id=comeback]');
  await clickAt(cb.x, cb.y);
  check('greyed Come back does nothing', picks.length === 0 && menu.visible, picks);
  const lb = await centre('[data-id=back]');
  await clickAt(lb.x, lb.y);
  check('Look back sends back', JSON.stringify(picks) === '["back"]' && !menu.visible, picks);

  // Docked on the right edge: the menu opens to the left of the mouse, Come back works, Dock ticks the edge.
  await openAt(wa.width - 20, 200, { ...STATE, docked: true, dock: 'right', model: 'smart', saving: false, hushedUntil: 0, jobsRunning: 0 });
  const mr = await rect('#main');
  check('kept on screen: opens to the left at the right edge', !!mr && mr.x + mr.w <= wa.width - 2 && mr.x + mr.w <= wa.width - 18, mr);
  check('no hush, no jobs: no tags; Model reads SMART; no tick on Save quota', JSON.stringify(await js(`[...document.querySelectorAll('#main i.st')].map((i) => i.firstChild.textContent)`)) === '["SMART"]'
    && await js(`!document.querySelector('[data-id=saving] [data-tick]')`) === true);
  const dk = await centre('[data-sub=dock]');
  await clickAt(dk.x, dk.y);
  check('Dock opens on a click', await until(async () => (await js(`document.querySelector('#sub')?.dataset.of`)) === 'dock', 1500));
  check('Dock: four edges, tick on the current one', JSON.stringify(await js(`[...document.querySelectorAll('#sub button')].map((b) => b.textContent + (b.querySelector('[data-tick]') ? '*' : ''))`)) === '["Bottom","Left","Right*","Top"]');
  const sr = await rect('#sub');
  check('submenu goes left when the right is full', !!sr && !!mr && sr.x < mr.x, { sr, mr });
  const md = await centre('[data-sub=model]');
  await move(md.x, md.y);
  check('Model opens, its list as the old menu had, tick on the current', await until(async () => (await js(`document.querySelector('#sub')?.dataset.of`)) === 'model', 1500)
    && JSON.stringify(await js(`[...document.querySelectorAll('#sub button')].map((b) => b.dataset.id + (b.querySelector('[data-tick]') ? '*' : ''))`)) === '["model.auto","model.quick","model.smart*","model.deep"]');
  check('Stop hushing is greyed when not hushed', await (async () => { const h = await centre('[data-sub=hush]'); await move(h.x, h.y); await until(async () => (await js(`document.querySelector('#sub')?.dataset.of`)) === 'hush', 1500); return js(`document.querySelector('[data-id="hush.off"]').disabled`); })() === true);
  picks.length = 0;
  const cb2 = await centre('[data-id=comeback]');
  await clickAt(cb2.x, cb2.y);
  check('Come back works when docked', JSON.stringify(picks) === '["comeback"]');

  // 7. Esc, a click away, losing focus: closed, nothing picked. Esc with a submenu open closes just the submenu.
  await openAt(300, Y);
  picks.length = 0;
  const h3 = await centre('[data-sub=hush]');
  await move(h3.x, h3.y);
  await until(async () => !!(await js(`!!document.querySelector('#sub')`)), 1500);
  await js(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); 1`); await wait(100);
  check('Esc first closes the submenu', menu.visible && await js(`!document.querySelector('#sub')`) === true);
  await js(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); 1`); await wait(150);
  check('Esc again closes the menu, nothing picked', !menu.visible && picks.length === 0);
  await openAt(300, Y);
  const m3 = await rect('#main');
  await clickAt(m3!.x + m3!.w + 3, m3!.y + 10);
  check('a click away (on the shadow) closes, nothing picked', !menu.visible && picks.length === 0);
  await openAt(300, Y);
  await wait(200);
  w.emit('blur');
  await wait(60);
  check('losing focus (a click elsewhere) closes it', !menu.visible && picks.length === 0);

  // 7b. 2026-10-21 (his report): readable (14.5 px words, taller rows, 20 px icon slots), and at the bottom-right corner it
  // opens BESIDE Aang and his mark, never on top of him, fully on screen, its submenu too.
  {
    await openAt(300, Y);
    const look = await js(`(() => { const b = document.querySelector('#main button'), r = b.getBoundingClientRect(), ic = b.querySelector('.ic').getBoundingClientRect();
      return { font: getComputedStyle(b).fontSize, h: Math.round(r.height), ic: Math.round(ic.width) }; })()`);
    check('readable: 14.5 px words, rows at least 38 px, icons 18-20 px', look.font === '14.5px' && look.h >= 38 && look.ic >= 18 && look.ic <= 20, look);
    await js(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))`); await wait(100);
    if (menu.visible) { await js(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))`); await wait(100); }
    // Aang standing in the bottom-right corner (his sprite, real screen pixels as the pet sends it), right-clicked on his body.
    const spriteDip = { x: wa.x + wa.width - 200, y: wa.y + wa.height - 190, width: 180, height: 180 };
    const tl = screen.dipToScreenPoint({ x: spriteDip.x, y: spriteDip.y }), br = screen.dipToScreenPoint({ x: spriteDip.x + spriteDip.width, y: spriteDip.y + spriteDip.height });
    const avoid = avoidRect({ x: tl.x, y: tl.y, width: br.x - tl.x, height: br.y - tl.y });
    shapes.length = 0;
    menu.open(phys(wa.width - 110, wa.height - 100), STATE, avoid);
    await until(() => menu.visible && shapes.length > 0);
    const m = await rect('#main');
    const A = avoid ? { x: avoid.x - wa.x, y: avoid.y - wa.y, w: avoid.width, h: avoid.height } : null;
    const over = (r: { x: number; y: number; w: number; h: number } | null) => !!r && !!A && r.x < A.x + A.w && A.x < r.x + r.w && r.y < A.y + A.h && A.y < r.y + r.h;
    const onScreen = (r: { x: number; y: number; w: number; h: number } | null) => !!r && r.x >= 0 && r.y >= 0 && r.x + r.w <= wa.width && r.y + r.h <= wa.height;
    check('bottom-right corner: never over Aang or his mark, and on screen', !!A && !over(m) && onScreen(m), { m, A });
    check('...it opens to his left', !!m && !!A && m.x + m.w <= A.x, { m, A });
    const hs = await centre('[data-sub=hush]');
    await move(hs.x, hs.y);
    await until(async () => (await js(`document.querySelector('#sub')?.dataset.of`)) === 'hush', 2000);
    const s = await rect('#sub');
    check('its submenu flips away from Aang, on screen, never over him', !over(s) && onScreen(s) && !!s && !!m && s.x < m.x, { s, m, A });
    await js(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))`); await wait(80);
    await js(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))`); await wait(80);
    // Tucked at the bottom edge with only his head up: still never over him, still on screen.
    const avoid2 = avoidRect({ x: tl.x, y: screen.dipToScreenPoint({ x: 0, y: wa.y + wa.height - 70 }).y, width: br.x - tl.x, height: br.y - tl.y }, true);
    shapes.length = 0;
    menu.open(phys(wa.width - 110, wa.height - 40), STATE, avoid2);
    await until(() => menu.visible && shapes.length > 0);
    const m2 = await rect('#main');
    const A2 = avoid2 ? { x: avoid2.x - wa.x, y: avoid2.y - wa.y, w: avoid2.width, h: avoid2.height } : null;
    check('tucked at the bottom: beside his head, on screen', !!m2 && !!A2 && onScreen(m2) && !(m2.x < A2.x + A2.w && A2.x < m2.x + m2.w && m2.y < A2.y + A2.h && A2.y < m2.y + m2.h), { m2, A2 });
    await js(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))`); await wait(100);
    picks.length = 0;
  }

  // 8. Only known ids leave.
  await openAt(300, Y);
  await js(`window.aang.menuPick('panel'); 1`); await wait(150);
  check('an unknown id is dropped (and the menu closes)', picks.length === 0 && !menu.visible);

  console.log(bad ? `${bad} FAILED` : 'ALL PASS');
  setTimeout(() => app.exit(bad ? 1 : 0), 100);
});
