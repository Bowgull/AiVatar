// Sheet 61 v2 (2026-10-22): the Hotkeys submenu in Aang's right-click menu, off screen. The real AangMenu window class,
// the real page and preload, the real HotkeyKeeper, but a PRETEND keyboard: no global key is ever taken on his machine
// (the keeper is handed a stand-in for globalShortcut; "Ctrl+Shift+S" is held by "another program" there). Never
// focused, never on his screen; the mouse is input events sent to the page, keys are key events made inside it.
// Checks: rest (every key listed, the fixed ones greyed, NEW on Quick note); a plain click changes nothing; the hold's
// gold fill and ring part-way; letting go early cancels; a full hold listens (and lets our keys go), new keys are kept
// and held at once; Esc keeps the old ones; taken by another program (red, the old key stays); another of ours.
// Pictures (<= 3): hold, listen, taken.
//
// Run: npx electron test/electron/hotkeys-check.ts [folder for the pictures]
import { app, BrowserWindow, ipcMain, screen } from 'electron';
import { mkdtempSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import os from 'node:os'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
import { servePages } from '../../src/pageserver.ts';
import { AangMenu } from '../../src/aangmenu.ts';
import { HotkeyKeeper, readKeys, type KeyId, type Shortcuts } from '../../src/hotkeys.ts';

process.on('uncaughtException', (e) => { console.log('HARNESS ERROR ' + String((e as Error)?.stack ?? e).split('\n').slice(0, 3).join(' | ')); app.exit(2); });
process.on('unhandledRejection', (e) => { console.log('HARNESS REJECTION ' + String((e as Error)?.stack ?? e)); app.exit(2); });
setTimeout(() => { console.log('HARNESS TIMEOUT'); app.exit(3); }, 90_000).unref();
app.on('window-all-closed', () => {});
app.setPath('userData', mkdtempSync(path.join(os.tmpdir(), 'hotkeys-check-')));
const HERE = path.dirname(fileURLToPath(import.meta.url));
BrowserWindow.prototype.show = function (this: BrowserWindow) { this.setPosition(-9000, 100); this.showInactive(); };
BrowserWindow.prototype.focus = function () {};
BrowserWindow.prototype.moveTop = function () {};
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
let bad = 0;
const check = (what: string, ok: boolean, d: unknown = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${what}${d !== '' ? '  -- ' + String(typeof d === 'string' ? d : JSON.stringify(d)).slice(0, 300) : ''}`); if (!ok) bad++; };
const until = async (fn: () => boolean | Promise<boolean>, ms = 4000) => { const end = Date.now() + ms; while (Date.now() < end) { if (await fn()) return true; await wait(50); } return fn(); };
const OUT = (() => { const a = process.argv.at(-1); try { return a && statSync(a).isDirectory() ? a : os.tmpdir(); } catch { return os.tmpdir(); } })();

app.whenReady().then(async () => {
  const pages = await servePages(path.join(HERE, '..', '..', 'pages'));
  // The pretend keyboard: what we hold, and one combo "another program" has.
  const held = new Map<string, () => void>();
  const gs: Shortcuts = {
    register(a, fn) { if (a === 'Control+Shift+S' || held.has(a)) return false; held.set(a, fn); return true; },
    unregister(a) { held.delete(a); },
  };
  const stateDir = mkdtempSync(path.join(os.tmpdir(), 'hotkeys-state-'));
  const fired: string[] = [];
  const keys = new HotkeyKeeper(stateDir, gs, Object.fromEntries((['talk', 'snip', 'popout', 'note', 'pin'] as KeyId[]).map((k) => [k, () => { fired.push(k); }])) as unknown as Record<KeyId, () => void>);
  for (const k of ['talk', 'snip', 'popout', 'note'] as KeyId[]) keys.want(k, true);
  const picks: string[] = [];
  const menu = new AangMenu({ origin: pages.origin, preloadPath: path.join(HERE, '..', '..', 'src', 'preload.cjs'), pick: (id) => picks.push(id), keys });
  ipcMain.on('menu:pick', (e, id) => { if (menu.owns(e.sender)) menu.picked(e.sender, id); });
  ipcMain.on('menu:shape', (e, rects) => { if (menu.owns(e.sender)) menu.shape(e.sender, rects); });
  ipcMain.on('menu:hotkey', (e, m) => { if (menu.owns(e.sender)) menu.hotkey(e.sender, m); });
  menu.warm();
  const w = BrowserWindow.getAllWindows()[0]!;
  const js = (s: string) => w.webContents.executeJavaScript(s, true);
  w.webContents.on('console-message', (e) => { if ((e as unknown as { level: string }).level === 'error') console.log('PAGE ERROR ' + (e as unknown as { message: string }).message); });
  await until(async () => !w.webContents.isLoading() && (await js(`document.readyState`)) === 'complete', 10000);

  const wa = screen.getPrimaryDisplay().workArea;
  const phys = (x: number, y: number) => screen.dipToScreenPoint({ x: wa.x + x, y: wa.y + y });
  const STATE = { muted: false, quiet: 'auto', dock: 'none', docked: false, model: 'auto', saving: true, hushedUntil: 0, jobsRunning: 2 };
  // Opened up from Aang near the bottom-left, as the sheet has him; the sprite and the sheet's desktop drawn behind.
  menu.open(phys(160, wa.height - 70), STATE);
  await until(() => menu.visible);
  const sprite = 'data:image/png;base64,' + readFileSync(path.join(HERE, '..', '..', '..', '..', 'assets', 'aang', 'frames', 'idle_0.png')).toString('base64');
  await js(`(() => { const d = document.createElement('div'); d.style.cssText = 'position:fixed;inset:0;z-index:-5;background:radial-gradient(900px 500px at 85% 5%, rgba(80,96,140,.30), transparent 60%),linear-gradient(180deg,#1c1f2b,#151720)'; document.body.prepend(d);
    const i = new Image(); i.src = ${JSON.stringify(sprite)}; i.style.cssText = 'position:fixed;left:24px;bottom:4px;width:224px;image-rendering:pixelated;z-index:-1'; document.body.append(i); return i.decode().then(() => 1); })()`);

  const rect = (sel: string) => js(`(() => { const r = document.querySelector(${JSON.stringify(sel)})?.getBoundingClientRect(); return r ? { x: r.left, y: r.top, w: r.width, h: r.height } : null; })()`);
  const centre = async (sel: string) => { const r = await rect(sel); return r ? { x: r.x + Math.min(90, r.w / 2), y: r.y + r.h / 2 } : { x: -1, y: -1 }; };
  const move = async (p: { x: number; y: number }) => { w.webContents.sendInputEvent({ type: 'mouseMove', x: Math.round(p.x), y: Math.round(p.y) }); await wait(60); };
  const down = (p: { x: number; y: number }) => w.webContents.sendInputEvent({ type: 'mouseDown', x: Math.round(p.x), y: Math.round(p.y), button: 'left', clickCount: 1 });
  const up = (p: { x: number; y: number }) => w.webContents.sendInputEvent({ type: 'mouseUp', x: Math.round(p.x), y: Math.round(p.y), button: 'left', clickCount: 1 });
  const press = (code: string, mods: { ctrl?: boolean; alt?: boolean; shift?: boolean } = {}) => js(`(() => { const o = { code: ${JSON.stringify(code)}, key: 'x', ctrlKey: ${!!mods.ctrl}, altKey: ${!!mods.alt}, shiftKey: ${!!mods.shift}, bubbles: true };
    document.body.dispatchEvent(new KeyboardEvent('keydown', o)); document.body.dispatchEvent(new KeyboardEvent('keyup', o)); return 1; })()`);
  const cls = (id: string) => js(`document.querySelector('#sub [data-hk="${id}"]')?.className ?? null`);
  const caps = (id: string) => js(`[...document.querySelectorAll('#sub [data-hk="${id}"] .kc')].map((k) => k.textContent).join(' ')`);
  const shot = async (name: string) => {
    const box = await js(`(() => { const a = document.getElementById('main').getBoundingClientRect(), b = document.getElementById('sub').getBoundingClientRect();
      const top = Math.max(0, Math.floor(Math.min(a.top, b.top) - 16)); return { x: 0, y: top, w: Math.ceil(Math.max(a.right, b.right)) + 20, h: Math.min(innerHeight, Math.ceil(Math.max(a.bottom, b.bottom)) + 30) - top }; })()`);
    const full = await w.webContents.capturePage(), f0 = full.getSize().width / (await js('innerWidth'));
    const img = full.crop({ x: Math.round(box.x * f0), y: Math.round(box.y * f0), width: Math.round(box.w * f0), height: Math.round(box.h * f0) });
    const f = path.join(OUT, `hotkeys-${name}.png`); writeFileSync(f, img.toPNG()); console.log('PICTURE ' + f + ' ' + JSON.stringify(img.getSize()));
  };

  // 1. Rest: the Hotkeys row in the menu, and its list.
  const row = await js(`(() => { const b = document.querySelector('[data-sub=hotkeys]'); return b ? b.textContent : null; })()`);
  check('a Hotkeys row with its count, after Save quota', row === 'Hotkeys7 KEYS▸' && await js(`document.querySelector('[data-sub=hotkeys]').previousElementSibling.dataset.id`) === 'saving', row);
  await move(await centre('[data-sub=hotkeys]'));
  check('Hotkeys opens its submenu', await until(async () => (await js(`document.querySelector('#sub')?.dataset.of`)) === 'hotkeys', 2000));
  const list = await js(`[...document.querySelectorAll('#sub > *')].map((e) => e.classList.contains('sep') ? '-' : e.classList.contains('mhead') ? '#' + e.textContent : e.classList.contains('note') ? 'note'
    : e.querySelector('.lab').textContent + ' [' + [...e.querySelectorAll('.kc')].map((k) => k.textContent).join(' ') + ']' + (e.classList.contains('fixed') ? ' (fixed)' : ''))`);
  check('every key, as the sheet lists them', JSON.stringify(list) === JSON.stringify(['#ANY TIME', 'Talk to Aang [CTRL +]', 'Snip [CTRL SHIFT +]', 'Show / hide the pop-out [CTRL SHIFT V]',
    'Quick noteNEW [CTRL *]', '-', '#ONLY WHILE SOMETHING IS UP', 'Pin what is under the mouse [CTRL ALT P]', 'Copy his line (mouse on the bubble) [CTRL C] (fixed)', 'Close the bubble [ESC] (fixed)',
    '-', 'Put them all back to the defaults []', 'note']), list);
  const look = await js(`(() => { const b = document.querySelector('#sub [data-hk=talk]'), f = document.querySelector('#sub .fixed .lab'); return { font: getComputedStyle(b).fontSize, h: Math.round(b.getBoundingClientRect().height), grey: getComputedStyle(f).color }; })()`);
  check('16 px words, 44 px rows, fixed rows greyed', look.font === '16px' && look.h >= 44 && look.grey === 'rgb(191, 174, 138)', look);
  const snip = await centre('#sub [data-hk=snip]');
  await move(snip); await wait(120);
  check('pointing at a row says HOLD TO CHANGE', await js(`getComputedStyle(document.querySelector('#sub [data-hk=snip] .hint')).display`) !== 'none',
    await js(`(() => { const b = document.querySelector('#sub [data-hk=snip]'), e = document.elementFromPoint(${snip.x}, ${snip.y}); return { hover: b.matches(':hover'), at: e?.outerHTML.slice(0, 80) }; })()`));

  // 2. A plain click changes nothing.
  const pop = await centre('#sub [data-hk=popout]');
  await move(pop); down(pop); await wait(40); up(pop); await wait(700);
  check('a plain click: no hold, no listening, nothing changed', !/holding|listen/.test(await cls('popout')) && keys.keys.popout === 'Control+Shift+V' && held.has('Control+Shift+V') && menu.visible, await cls('popout'));

  // 3. Holding: the gold fill part-way, the ring; then let go early: nothing.
  down(pop); await wait(370);
  const part = await js(`(() => { const b = document.querySelector('#sub [data-hk=popout]'); return { c: b.className, k: parseFloat(b.style.getPropertyValue('--k')), ring: !!b.querySelector('canvas.ring'), say: document.querySelector('#sub .say')?.textContent ?? '' }; })()`);
  check('holding: gold fill part-way, the ring, the keep-holding line', /holding/.test(part.c) && part.k > 20 && part.k < 95 && part.ring && /Keep holding/.test(part.say), part);
  await shot('hold');
  up(pop); await wait(120);
  check('let go early: back to rest, nothing changed', !/holding|listen/.test(await cls('popout')) && await js(`!document.querySelector('#sub .say')`) === true && keys.keys.popout === 'Control+Shift+V' && held.size === 6);

  // 4. A full hold listens, and our keys are let go while it does.
  await move(pop); down(pop); await wait(800); up(pop);
  check('a full hold: the row listens', /listen/.test(await cls('popout') ?? '') && /PRESS THE NEW KEYS/.test(await js(`document.querySelector('#sub [data-hk=popout]').textContent`)), await cls('popout'));
  check('...says Esc keeps Ctrl + Shift + V', /Esc keeps Ctrl \+ Shift \+ V/.test(await js(`document.querySelector('#sub .say')?.textContent ?? ''`)));
  check('...and our keys are let go while it listens', held.size === 0, [...held.keys()]);
  await shot('listen');
  // Esc keeps the old ones, and the menu stays up.
  await press('Escape');
  await wait(100);
  check('Esc: back to rest, the old key, the menu still open, our keys back', !/listen/.test(await cls('popout')) && menu.visible && keys.keys.popout === 'Control+Shift+V' && held.has('Control+Shift+V') && held.size === 6);

  // 5. New keys: kept, held at once, written down.
  await move(pop); down(pop); await wait(800); up(pop);
  await until(async () => /listen/.test(await cls('popout') ?? ''), 1500);
  await press('ShiftLeft', { shift: true });   // a modifier alone is not a choice
  await press('KeyV', { ctrl: true, alt: true });
  check('Ctrl+Alt+V is kept and held at once', await until(async () => (await caps('popout')) === 'CTRL ALT V')
    && keys.keys.popout === 'Control+Alt+V' && held.has('Control+Alt+V') && !held.has('Control+Shift+V') && readKeys(stateDir).popout === 'Control+Alt+V', { caps: await caps('popout'), held: [...held.keys()] });
  held.get('Control+Alt+V')?.();
  check('...and pressing it does the pop-out', fired.at(-1) === 'popout', fired);

  // 6. Taken by another program: red, says so, the old key stays.
  const note = await centre('#sub [data-hk=note]');
  await move(note); down(note); await wait(800); up(note);
  await until(async () => /listen/.test(await cls('note') ?? ''), 1500);
  await press('KeyS', { ctrl: true, shift: true });
  await until(async () => /taken/.test(await cls('note') ?? ''), 1500);
  const warn = await js(`document.querySelector('#sub .warn')?.textContent ?? ''`);
  check('taken: the row goes red with the keys he pressed, and says so', /taken/.test(await cls('note')) && (await caps('note')) === 'CTRL SHIFT S'
    && warn === 'Another program already has Ctrl + Shift + S, so it would never reach Aang. Try other keys or keep Ctrl + *.', warn);
  check('...the old key stays, held', keys.keys.note === 'Control+nummult' && held.has('Control+nummult'));
  await move(await centre('#sub [data-hk=snip]'));
  await move(await centre('#sub [data-hk=note]')); await wait(150);
  check('the submenu stays on the screen as it grows', await js(`document.getElementById('sub').getBoundingClientRect().bottom <= innerHeight`) === true,
    await js(`({ ih: innerHeight, sub: document.getElementById('sub').getBoundingClientRect().toJSON() })`));
  await shot('taken');
  // "keep Ctrl + *": back to rest.
  const keep = await js(`(() => { const r = document.querySelector('#sub .warn u[data-do=keep]').getClientRects()[0]; return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
  await move(keep); down(keep); up(keep); await wait(150);
  check('keep: back to rest', !/taken/.test(await cls('note')) && (await caps('note')) === 'CTRL *' && menu.visible);

  // 7. Another of ours, and a key never allowed.
  await move(note); down(note); await wait(800); up(note);
  await until(async () => /listen/.test(await cls('note') ?? ''), 1500);
  await press('KeyV', { ctrl: true, alt: true });
  await until(async () => /taken/.test(await cls('note') ?? ''), 1500);
  check('another of ours: named', /Ctrl \+ Alt \+ V already belong to Show \/ hide the pop-out/.test(await js(`document.querySelector('#sub .warn')?.textContent ?? ''`)));
  const again = await js(`(() => { const r = document.querySelector('#sub .warn u[data-do=again]').getClientRects()[0]; return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
  await move(again); down(again); up(again); await wait(150);
  check('Try other keys listens again', /listen/.test(await cls('note') ?? ''),
    { c: await cls('note'), at: await js(`document.elementFromPoint(${again.x}, ${again.y})?.outerHTML.slice(0, 80) ?? null`), again });
  await press('F4', { alt: true });
  await until(async () => /taken/.test(await cls('note') ?? ''), 1500);
  check('Alt+F4 is refused', /belongs to Windows/.test(await js(`document.querySelector('#sub .warn')?.textContent ?? ''`)) && keys.keys.note === 'Control+nummult');

  // 8. The menu going mid-listen gives the keys back.
  await move(await centre('#sub [data-hk=talk]'));
  const talk = await centre('#sub [data-hk=talk]');
  down(talk); await wait(800); up(talk);
  await until(async () => /listen/.test(await cls('talk') ?? ''), 1500);
  check('listening: keys let go', held.size === 0, { c: await cls('talk'), held: [...held.keys()] });
  w.emit('blur'); await wait(250);
  check('the menu closed mid-listen: our keys are back', !menu.visible && held.size === 6, [...held.keys()]);
  check('no menu pick was ever sent', picks.length === 0, picks);

  console.log(bad ? `${bad} FAILED` : 'ALL PASS');
  setTimeout(() => app.exit(bad ? 1 : 0), 100);
});
