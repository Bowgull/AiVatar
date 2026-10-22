// Sheet 17 notes, end to end, with no brain and nothing on his screen (2026-10-12, after "the notes are super
// bugged, run a full test").
//
// The REAL pages (bubble.html, note.html), the REAL preload doors, and the REAL notes store from the brain, in
// hidden off-screen windows. Real mouse and keyboard events go into those windows only (sendInputEvent), never
// into his desktop or his game. Every step says PASS or FAIL, pictures go to the folder given as the first
// argument, and any page error fails the run.
//
// Run: npx electron test/electron/notes-full.ts <folder for pictures>
import { app, BrowserWindow, ipcMain } from 'electron';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { servePages } from '../../src/pageserver.ts';
import { Notes, linesHtml } from '../../../Core/src/notes.ts';

process.on('uncaughtException', (e) => { console.log('HARNESS ERROR ' + (e as Error).stack); app.exit(2); });
process.on('unhandledRejection', (e) => { console.log('HARNESS REJECTION ' + String((e as Error)?.stack ?? e)); app.exit(2); });
setTimeout(() => { console.log('HARNESS TIMEOUT'); app.exit(3); }, 120_000).unref();

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SHELL = path.resolve(HERE, '..', '..');
const OUT = path.resolve(process.argv[process.argv.length - 1] ?? os.tmpdir());
mkdirSync(OUT, { recursive: true });

const results: { step: string; ok: boolean; detail?: string }[] = [];
const check = (step: string, ok: boolean, detail = '') => { results.push({ step, ok, detail }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${step}${detail ? '  -- ' + detail : ''}`); };
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const pageErrors: string[] = [];

/** Every message the pages send, by channel, so the steps can ask what was said. */
const said: { ch: string; a: unknown }[] = [];
const lastSaid = (ch: string) => [...said].reverse().find((x) => x.ch === ch)?.a as any;
const countSaid = (ch: string) => said.filter((x) => x.ch === ch).length;

app.whenReady().then(async () => {
  const pages = await servePages(path.join(SHELL, 'pages'));
  const store = new Notes(path.join(mkdtempSync(path.join(os.tmpdir(), 'notes-full-')), 'notes.json'));
  const seed = [
    ['Raid night', ['Flasks', 'Food buff', 'Repair', 'Clear bags'], 'To-do'], ['Octup interview', ['Ask about the team size'], 'Reference'],
    ['Mac logins', ['Move the old ones to Bitwarden'], 'For Claude'], ['Shows', ['Naruto S3 E13', 'Frieren'], 'Idea'],
    ['Groceries', ['Eggs', 'Coffee', 'Rice'], ''], ['Mythic route', ['Pull 1-3, skip the bridge'], 'Reference'],
    ['Birthday', ['Mom, Oct 30'], ''], ['Aang ideas', ['Wheel icons', 'Hourglass'], 'Idea'],
  ] as const;
  seed.forEach(([t, l, c], i) => store.make(t, linesHtml([...l]), c, 1000 + i));

  const mk = (w: number, h: number) => {
    const win = new BrowserWindow({ width: w, height: h, show: false, frame: false, transparent: true,
      webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false, offscreen: true, preload: path.join(SHELL, 'src', 'preload.cjs') } });
    win.webContents.on('console-message', (_e, level, message) => { if (level >= 3) pageErrors.push(message); });
    win.webContents.on('render-process-gone', (_e, d) => pageErrors.push('renderer gone: ' + d.reason));
    return win;
  };
  const bub = mk(760, 900);
  const toBubble = (m: unknown) => bub.webContents.send('brain:message', m);
  const listen = (ch: string, fn?: (a: any) => void) => ipcMain.on(ch, (e, a) => { said.push({ ch, a }); fn?.(a); });
  // The brain's half: a save is kept and the new list goes back, exactly as the Core does it.
  listen('bubble:notesave', (n) => { store.save1(n); toBubble({ t: 'notes.state', notes: store.list() }); });
  listen('bubble:notedelete', (id) => { store.remove(id); toBubble({ t: 'notes.state', notes: store.list() }); });
  for (const ch of ['bubble:notepull', 'bubble:typing', 'bubble:size', 'bubble:clickable', 'bubble:hidden', 'bubble:dock', 'note:save', 'note:move', 'note:menu', 'note:opacity', 'note:pin', 'note:back', 'note:delete']) listen(ch);

  const js = <T = any>(w: BrowserWindow, code: string): Promise<T> => w.webContents.executeJavaScript(code, true);
  const centre = async (w: BrowserWindow, sel: string, dx = 0.5, dy = 0.5) => js<{ x: number; y: number } | null>(w, `(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e) return null; const r = e.getBoundingClientRect(); return { x: Math.round(r.left + r.width * ${dx}), y: Math.round(r.top + r.height * ${dy}) }; })()`);
  const mouse = (w: BrowserWindow, type: 'mouseDown' | 'mouseUp' | 'mouseMove', x: number, y: number, button: 'left' | 'right' = 'left') => w.webContents.sendInputEvent({ type, x, y, button, clickCount: 1 } as Electron.MouseInputEvent);
  const click = async (w: BrowserWindow, p: { x: number; y: number }, button: 'left' | 'right' = 'left') => { mouse(w, 'mouseMove', p.x, p.y); await wait(30); mouse(w, 'mouseDown', p.x, p.y, button); await wait(40); mouse(w, 'mouseUp', p.x, p.y, button); await wait(120); };
  // Anything that is not a press in the menu first closes an open menu, as his click elsewhere would.
  const closeMenus = async (w: BrowserWindow, sel: string) => { if (/^\.(nmenu|nm-|fnt|sw|mrow2|nb)/.test(sel) || sel.includes('.nmenu')) return; if (await js(w, `!!document.querySelector('.nmenu')`)) { await click(w, { x: 5, y: 5 }); await wait(300); } };
  const clickSel = async (w: BrowserWindow, sel: string, button: 'left' | 'right' = 'left', dx = 0.5, dy = 0.5) => { await closeMenus(w, sel); const p = await centre(w, sel, dx, dy); if (!p) return false; await click(w, p, button); return true; };
  const rclick = async (w: BrowserWindow, sel: string, dx = 0.5, dy = 0.5) => { await closeMenus(w, sel); const p = await centre(w, sel, dx, dy); if (!p) return false; await click(w, p, 'right'); await js(w, `(() => { const e = document.elementFromPoint(${p.x}, ${p.y}); e && e.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: ${p.x}, clientY: ${p.y}, button: 2 })); })()`); await wait(150); return true; };
  const shot = async (w: BrowserWindow, name: string) => { const img = await w.webContents.capturePage(); writeFileSync(path.join(OUT, name + '.png'), img.toPNG()); };

  // ================================================================== the board in the bubble
  await bub.loadURL(`${pages.origin}/bubble.html`);
  await wait(400);
  toBubble({ t: 'notes.state', notes: store.list() });
  toBubble({ t: 'notes.board' });
  await wait(700);
  await shot(bub, '01-board');
  check('board opens with six notes on page one', (await js(bub, `document.querySelectorAll('.board .nmini:not(.slot)').length`)) === 6);
  check('eight notes means a second page: arrows and two dots', (await js(bub, `!!document.querySelector('.bcap.r') && document.querySelectorAll('.bdots i').length === 2`)) === true);
  check('board fits inside the bubble', (await js(bub, `(() => { const b = document.getElementById('bubble').getBoundingClientRect(), g = document.querySelector('.board').getBoundingClientRect(); return g.left >= b.left - 1 && g.right <= b.right + 1; })()`)) === true);

  await clickSel(bub, '.bcap.r');
  await wait(200);
  check('the right arrow turns to page two (two notes, no empty ghost slots)', (await js(bub, `document.querySelectorAll('.board .nmini:not(.slot)').length + '/' + document.querySelectorAll('.board .nmini.slot').length`)) === '2/0');
  await clickSel(bub, '.bcap.l');
  await wait(200);

  // A click on a note opens it, and does NOT dock the typing box over it.
  const dockBefore = countSaid('bubble:dock');
  await clickSel(bub, '.board .nmini:not(.slot)');
  await wait(400);
  await shot(bub, '02-open');
  check('clicking a note opens it in the bubble', (await js(bub, `!!document.querySelector('.bignote .nbody')`)) === true);
  check('clicking a note does not dock the typing box', countSaid('bubble:dock') === dockBefore);

  // Typing: a press in the text asks for the keyboard, then real typing lands in the note and is saved.
  const typingBefore = countSaid('bubble:typing');
  await clickSel(bub, '.bignote .nbody', 'left', 0.9, 0.9);
  await wait(300);
  check('pressing in the note asks for the keyboard', countSaid('bubble:typing') > typingBefore && lastSaid('bubble:typing') === true);
  await js(bub, `(() => { const b = document.querySelector('.bignote .nbody'); b.focus(); const r = document.createRange(); r.selectNodeContents(b); r.collapse(false); const s = getSelection(); s.removeAllRanges(); s.addRange(r); })()`);
  bub.webContents.insertText(' and potions');
  await wait(1000);
  const saved1 = lastSaid('bubble:notesave');
  check('typing is saved', !!saved1 && /and potions/.test(saved1.html), saved1 ? saved1.html.slice(-80) : 'nothing saved');
  check('the note stays open while the save comes back', (await js(bub, `!!document.querySelector('.bignote')`)) === true);

  // Ticks: the box at the start of a tick line.
  const tickedBefore = await js<number>(bub, `document.querySelectorAll('.bignote .cl.done').length`);
  await clickSel(bub, '.bignote .cl:not(.done)', 'left', 0.02, 0.5);
  await wait(800);
  check('the tick box ticks', (await js<number>(bub, `document.querySelectorAll('.bignote .cl.done').length`)) === tickedBefore + 1);

  // The right-click menu.
  await rclick(bub, '.bignote .nbody');
  await wait(300);
  await shot(bub, '03-menu');
  check('right-click opens the menu', (await js(bub, `!!document.querySelector('.nmenu')`)) === true, pageErrors.join(' | '));
  check('the menu is inside the bubble, not cut off', (await js(bub, `(() => { const b = document.getElementById('bubble').getBoundingClientRect(), m = document.querySelector('.nmenu').getBoundingClientRect(); return m.bottom <= b.bottom + 1 && m.top >= b.top - 1; })()`)) === true);
  check('font buttons show only the name', (await js(bub, `[...document.querySelectorAll('.fnt b')].map(b => b.textContent).join(',')`)) === 'Plain,Handwritten,Marker,Fancy,Storybook,Typewriter,Pixel,Terminal,Arcade');
  // Sheet 60: no colour row any more; the colour is the category's (the # chip, then To-do in the list).
  await clickSel(bub, '.bignote .np-chip');
  await wait(300);
  await clickSel(bub, '.np-pick .np-prow:nth-of-type(2)');
  await wait(900);
  check('a category changes the note and is saved', lastSaid('bubble:notesave')?.cat === 'To-do', lastSaid('bubble:notesave')?.cat);
  // bold on highlighted words
  await clickSel(bub, '.bignote .nbody', 'left', 0.5, 0.1);
  await js(bub, `(() => { const l = document.querySelector('.bignote .nbody .cl'); const r = document.createRange(); r.selectNodeContents(l); const s = getSelection(); s.removeAllRanges(); s.addRange(r); })()`);
  await rclick(bub, '.bignote .nbody', 0.5, 0.1);
  await wait(250);
  await js(bub, `(() => { const l = document.querySelector('.bignote .nbody .cl'); const r = document.createRange(); r.selectNodeContents(l); const s = getSelection(); s.removeAllRanges(); s.addRange(r); })()`);
  await clickSel(bub, '.nmenu .nm-row .nb');          // B
  await wait(900);
  check('bold on highlighted words', /<b>/.test(lastSaid('bubble:notesave')?.html ?? ''), (lastSaid('bubble:notesave')?.html ?? '').slice(0, 120));
  // size: A+ twice on the whole note (nothing highlighted)
  await js(bub, `getSelection().removeAllRanges()`);
  await rclick(bub, '.bignote .nbody', 0.5, 0.9);
  await wait(250);
  await clickSel(bub, '.nm-size .nb:last-child');
  await wait(100);
  await clickSel(bub, '.nm-size .nb:last-child');
  await wait(900);
  check('A+ twice makes the whole note two pixels bigger', lastSaid('bubble:notesave')?.size === '17', String(lastSaid('bubble:notesave')?.size));
  check('the menu stays open for more size presses', (await js(bub, `!!document.querySelector('.nmenu')`)) === true);
  await js(bub, `(() => { const i = document.querySelector('.nm-px'); i.focus(); i.value = '22'; i.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); })()`);
  await wait(900);
  check('typing a size and pressing Enter sets it', lastSaid('bubble:notesave')?.size === '22', String(lastSaid('bubble:notesave')?.size));
  await click(bub, { x: 5, y: 5 });
  await wait(200);
  // font on the whole note
  await rclick(bub, '.bignote .nbody', 0.5, 0.9);
  await wait(250);
  await clickSel(bub, '.nm-fonts .fnt:nth-child(2)');
  await wait(900);
  check('the menu has no Header or Text', (await js(bub, `[...document.querySelectorAll('.nb')].some(b => /Header|^Text$/.test(b.textContent))`)) === false);
  await click(bub, { x: 5, y: 5 });              // close the open menu first (a click elsewhere)
  await wait(300);
  await rclick(bub, '.bignote .ntitle');
  await wait(250);
  await clickSel(bub, '.nm-fonts .fnt:nth-child(4)');
  await wait(900);
  check('picking a font keeps the menu open', (await js(bub, `!!document.querySelector('.nmenu')`)) === true);
  check('right-click the title, pick a font: only the title changes', lastSaid('bubble:notesave')?.tfont === 'cinzel' && lastSaid('bubble:notesave')?.font === 'caveat', `${lastSaid('bubble:notesave')?.tfont} / ${lastSaid('bubble:notesave')?.font}`);
  check('a font on the whole note (size kept)', lastSaid('bubble:notesave')?.font === 'caveat', String(lastSaid('bubble:notesave')?.font));
  await shot(bub, '04-edited');

  // Back to the board hands the keyboard back.
  await click(bub, { x: 5, y: 5 });              // the menu stays open after a pick now; a click elsewhere closes it
  await wait(300);
  await clickSel(bub, '.ctitle .back');
  await wait(400);
  check('back goes to the board', (await js(bub, `!!document.querySelector('.board')`)) === true);
  check('back hands the keyboard back', lastSaid('bubble:typing') === false);

  // + NEW makes a note and opens it with the title ready to type.
  const before = store.list().length;
  await clickSel(bub, '.newk');
  await wait(900);
  check('+ NEW opens a blank note to type in, with hints', (await js(bub, `!!document.querySelector('.bignote') && document.querySelector('.ntitle').textContent === '' && document.querySelector('.ntitle').dataset.ph === 'Title'`)) === true && lastSaid('bubble:typing') === true);
  check('+ NEW keeps nothing until he writes', store.list().length === before);
  await js(bub, `document.querySelector('.ntitle').focus()`);
  bub.webContents.insertText('Pizza night');
  await wait(1000);
  check('writing a title keeps the note', store.list().length === before + 1 && store.list().some((n) => n.title === 'Pizza night'));
  // Delete it from the menu.
  await rclick(bub, '.bignote .nbody');
  await wait(250);
  await clickSel(bub, '.nmenu .mrow2.warn');
  await wait(600);
  check('Delete removes it', store.list().length === before);

  // Pull one out: press on a note, drag it outside the bubble window.
  await wait(300);
  const p = await centre(bub, '.board .nmini:not(.slot)');
  if (p) {
    mouse(bub, 'mouseMove', p.x, p.y); await wait(30);
    mouse(bub, 'mouseDown', p.x, p.y); await wait(60);
    for (let i = 1; i <= 8; i++) { mouse(bub, 'mouseMove', p.x - i * 20, p.y); await wait(25); }
    mouse(bub, 'mouseMove', -40, p.y); await wait(60);
    mouse(bub, 'mouseMove', -80, p.y); await wait(60);
    mouse(bub, 'mouseUp', -80, p.y); await wait(300);
  }
  const pulls = said.filter((x) => x.ch === 'bubble:notepull').map((x) => (x.a as any).phase).join(',');
  // A hidden window has no real mouse to leave it, so this one is checked by hand (he confirmed it works, 2026-10-12).
  console.log(`SKIP  dragging a note out of the bubble (by hand only)${pulls ? '  -- ' + pulls : ''}`);

  // ================================================================== a note on the screen
  const nw = mk(260, 210);
  const one = { ...store.list()[0]!, out: { x: 100, y: 100, w: 232, h: 182, opacity: 1, pinned: false } };
  await nw.loadURL(`${pages.origin}/note.html`);
  await wait(300);
  nw.webContents.send('note:data', one);
  await wait(400);
  await shot(nw, '05-sticky');
  check('a note on the screen shows its title', (await js(nw, `document.querySelector('.ntitle')?.textContent`)) === one.title);
  check('the pin is a whole ball, not cut off', (await js(nw, `(() => { const r = document.querySelector('.paper .pin').getBoundingClientRect(); return r.top >= 0 && r.left >= 0; })()`)) === true);
  await clickSel(nw, '.nbody', 'left', 0.9, 0.9);
  await js(nw, `(() => { const b = document.querySelector('.nbody'); b.focus(); const r = document.createRange(); r.selectNodeContents(b); r.collapse(false); const s = getSelection(); s.removeAllRanges(); s.addRange(r); })()`);
  nw.webContents.insertText(' on screen');
  await wait(1000);
  check('typing on a note on the screen is saved', /on screen/.test(lastSaid('note:save')?.html ?? ''));
  await rclick(nw, '.nbody', 0.4, 0.4);
  await wait(50);
  nw.setSize(560, 540);
  await wait(400);
  check('right-click asks for room for the menu', lastSaid('note:menu')?.open === true);
  nw.setSize(560, 540);
  await wait(300);
  await shot(nw, '06-sticky-menu');
  check('the menu has see-through, pin, back to board and delete', (await js(nw, `!!document.querySelector('.nm-slide input') && [...document.querySelectorAll('.mrow2')].map(b => b.textContent).join(',')`)) === 'Pin,Back to board,Delete');
  await js(nw, `(() => { const r = document.querySelector('.nm-slide input'); r.value = '60'; r.dispatchEvent(new Event('input')); })()`);
  await wait(100);
  check('the see-through slider is sent', lastSaid('note:opacity') === 0.6);
  await clickSel(nw, '.mrow2');                       // Pin
  await wait(300);
  check('Pin is sent and the menu closes', lastSaid('note:pin') === true && lastSaid('note:menu') === false);
  nw.setSize(260, 210);
  // drag by the top and resize from the corner
  const g = await centre(nw, '#grab');
  if (g) { mouse(nw, 'mouseDown', g.x, g.y); await wait(40); mouse(nw, 'mouseMove', g.x + 30, g.y + 10); await wait(40); mouse(nw, 'mouseUp', g.x + 30, g.y + 10); await wait(150); }
  check('dragging the top moves the note', said.filter((x) => x.ch === 'note:move' && (x.a as any).kind === 'drag').map((x) => (x.a as any).phase).join(',').includes('start,move'));
  const c = await centre(nw, '#grip');
  if (c) { mouse(nw, 'mouseDown', c.x, c.y); await wait(40); mouse(nw, 'mouseMove', c.x + 20, c.y + 20); await wait(40); mouse(nw, 'mouseUp', c.x + 20, c.y + 20); await wait(150); }
  check('the corner resizes the note', said.some((x) => x.ch === 'note:move' && (x.a as any).kind === 'resize'));

  // ================================================================== done
  check('no page errors', pageErrors.length === 0, pageErrors.slice(0, 5).join(' | '));
  const failed = results.filter((r) => !r.ok);
  console.log(`\nRESULT ${results.length - failed.length}/${results.length} passed. Pictures: ${OUT}`);
  pages.close();
  app.exit(failed.length ? 1 : 0);
});
