// Sheet 60 (his picks, 2026-10-22), checked off screen: the board (colour from the category, chips that filter, the
// ribbon not the pin), the quick note (the same note, small, focused, the same control row), Samara's notes rail (from
// the ... menu, a spring, the page narrows, x and Esc close it) and the notice (the note's name is the link, Aang holds
// the paper up in the note's colour, the keys only after ~1.5 s of hovering).
//
// The REAL pages and the REAL preload in hidden, off-screen windows; mouse and keys go into those windows only
// (sendInputEvent), never into his desktop or game; nothing touches the clipboard. Any harness error ends the run with
// app.exit, never a dialog. Four small pictures go to the folder given as the last argument.
//
// Run (from src/Shell): npx electron test/electron/notes60-check.ts <folder for pictures>
import { app, BrowserWindow, ipcMain } from 'electron';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { servePages } from '../../src/pageserver.ts';
import { NoteHeld } from '../../src/notes60.ts';

process.on('uncaughtException', (e) => { console.log('HARNESS ERROR ' + String((e as Error)?.stack ?? e)); app.exit(2); });
process.on('unhandledRejection', (e) => { console.log('HARNESS REJECTION ' + String((e as Error)?.stack ?? e)); app.exit(2); });
setTimeout(() => { console.log('HARNESS TIMEOUT'); app.exit(3); }, 150_000).unref();
app.on('window-all-closed', () => { /* the script decides */ });

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SHELL = path.resolve(HERE, '..', '..');
const ROOT = path.resolve(SHELL, '..', '..');
const OUT = path.resolve(process.argv[process.argv.length - 1] ?? os.tmpdir());
mkdirSync(OUT, { recursive: true });

let failed = 0;
const check = (step: string, ok: boolean, detail = '') => { if (!ok) failed++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${step}${detail ? '  -- ' + detail : ''}`); };
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const pageErrors: string[] = [];
const said: { ch: string; a: any }[] = [];
const lastSaid = (ch: string) => [...said].reverse().find((x) => x.ch === ch)?.a;
const countSaid = (ch: string) => said.filter((x) => x.ch === ch).length;
for (const ch of ['bubble:notesave', 'bubble:noticeheld', 'bubble:notecat', 'bubble:typing', 'bubble:size', 'bubble:clickable', 'bubble:hidden', 'note:save', 'note:menu', 'note:quickdone',
  'browser:act', 'browser:insets', 'browser:notesave', 'browser:noteopen']) ipcMain.on(ch, (_e, a) => said.push({ ch, a }));

const NOW = Date.now();
const NOTES = [
  { id: 'nbf1', title: 'Before Friday', cat: 'To-do', font: 'figtree', size: 'm', updated: NOW - 1000,
    html: '<div class="cl done">Book the vet for Momo</div><div class="cl done">Passport photos</div><div class="cl">Call the bank</div><div class="cl">Renew the passport</div>' },
  { id: 'nrl1', title: 'Route list idea', cat: 'Idea', font: 'figtree', size: 'm', updated: NOW - 2000, html: '<div>Waymark: fold the route list to one line while driving.</div>' },
  { id: 'nsb1', title: 'Samara bookmarks', cat: 'For Claude', font: 'figtree', size: 'm', updated: NOW - 3000, html: '<div>Bookmarks shelf should open on hover, not click.</div>' },
  { id: 'npl1', title: 'Note', font: 'figtree', size: 'm', updated: NOW - 4000, html: '<div>Dentist moved to <b>Thu 3pm</b>.</div><div>Oat milk, bin bags, the good coffee.</div>' },
  { id: 'nrc1', title: 'Pancakes', cat: 'Recipes', font: 'figtree', size: 'm', updated: NOW - 5000, html: '<div>2 eggs, a cup of milk, a cup of flour.</div>' },
  { id: 'nrg1', title: 'Ragnaros knockback', cat: 'Reference', font: 'figtree', size: 'm', updated: NOW - 6000, html: '<div>Tanks back to the wall at each submerge.</div>',
    src: { url: 'https://forever.warcraft.com/guides/molten-core', site: 'forever.warcraft.com' } },
  { id: 'nfr1', title: 'Ask the guild', font: 'figtree', size: 'm', updated: NOW - 7000, html: '<div>Ask the guild about fire resist before Friday.</div>',
    src: { url: 'https://forever.warcraft.com/guides/molten-core', site: 'forever.warcraft.com' } },
];
const CATS = { builtin: ['To-do', 'Idea', 'Reference', 'For Claude'], own: ['Recipes'] };

app.whenReady().then(async () => {
  const pages = await servePages(path.join(SHELL, 'pages'));
  const mk = (w: number, h: number) => {
    const win = new BrowserWindow({ width: w, height: h, show: false, frame: false, transparent: true, useContentSize: true,
      webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false, offscreen: true, backgroundThrottling: false, preload: path.join(SHELL, 'src', 'preload.cjs') } });
    win.webContents.on('console-message', (e) => { const m = e as unknown as { message?: string; level?: string }; if (m.level === 'error') pageErrors.push(String(m.message)); });
    win.webContents.on('render-process-gone', (_e, d) => pageErrors.push('renderer gone: ' + d.reason));
    return win;
  };
  const js = <T = any>(w: BrowserWindow, code: string): Promise<T> => w.webContents.executeJavaScript(code, true);
  const at = (w: BrowserWindow, sel: string, dx = 0.5, dy = 0.5) => js<{ x: number; y: number } | null>(w, `(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e) return null; const r = e.getBoundingClientRect(); return { x: Math.round(r.left + r.width * ${dx}), y: Math.round(r.top + r.height * ${dy}) }; })()`);
  const mouse = (w: BrowserWindow, type: 'mouseDown' | 'mouseUp' | 'mouseMove', x: number, y: number) => w.webContents.sendInputEvent({ type, x, y, button: 'left', clickCount: 1 } as Electron.MouseInputEvent);
  const click = async (w: BrowserWindow, sel: string, dx = 0.5, dy = 0.5) => { const p = await at(w, sel, dx, dy); if (!p) return false; mouse(w, 'mouseMove', p.x, p.y); await wait(30); mouse(w, 'mouseDown', p.x, p.y); await wait(40); mouse(w, 'mouseUp', p.x, p.y); await wait(150); return true; };
  const shot = async (w: BrowserWindow, name: string, rect?: Electron.Rectangle) => { const img = await w.webContents.capturePage(rect); writeFileSync(path.join(OUT, name + '.png'), img.toPNG()); return img; };
  const rectOf = (w: BrowserWindow, sel: string, pad = 16) => js<Electron.Rectangle>(w, `(() => { const r = document.querySelector(${JSON.stringify(sel)}).getBoundingClientRect(); return { x: Math.max(0, Math.floor(r.left - ${pad})), y: Math.max(0, Math.floor(r.top - ${pad})), width: Math.ceil(r.width + ${pad * 2}), height: Math.ceil(r.height + ${pad * 2}) }; })()`);

  // ================================================================== 1. the board in the bubble
  const bub = mk(780, 900);
  const toBubble = (m: unknown) => bub.webContents.send('brain:message', m);
  ipcMain.on('bubble:notesave', (_e, n) => { const i = NOTES.findIndex((x) => x.id === n.id); if (i >= 0) NOTES[i] = { ...NOTES[i], ...n }; });
  await bub.loadURL(`${pages.origin}/bubble.html`);
  await wait(500);
  toBubble({ t: 'notes.state', notes: NOTES, cats: CATS });
  toBubble({ t: 'notes.board' });
  await wait(900);
  const board = await js<any>(bub, `(() => {
    const minis = [...document.querySelectorAll('.board .nmini')];
    const bg = (n) => getComputedStyle(n.querySelector('.np-fill')).backgroundColor;
    return { n: minis.length, pins: document.querySelectorAll('.board .pin, .nmini .pin').length, ribbons: document.querySelectorAll('.board .np-ribbon').length,
      chips: [...document.querySelectorAll('.bchip')].map((c) => c.textContent), colours: minis.map(bg), slots: document.querySelectorAll('.nmini.slot').length,
      swatchDots: document.querySelectorAll('.board .ndot').length, title: getComputedStyle(document.querySelector('.nmini .mt')).fontFamily };
  })()`);
  check('board: six notes on page one, each on its ribbon, no pushpin, no ghost slots', board.n === 6 && board.ribbons === 6 && board.pins === 0 && board.slots === 0, JSON.stringify({ n: board.n, r: board.ribbons, p: board.pins, s: board.slots }));
  check('board: the chips are All, Just notes, the four, his own, + Category', JSON.stringify(board.chips) === JSON.stringify(['All · 7', 'Just notes · 2', 'To-do', 'Idea', 'Reference', 'For Claude', 'Recipes', '+ Category']), JSON.stringify(board.chips));
  check('board: the colour comes from the category (To-do sky, Idea green, For Claude coral, plain butter, Recipes mauve)',
    JSON.stringify(board.colours.slice(0, 5)) === JSON.stringify(['rgb(132, 201, 248)', 'rgb(168, 219, 165)', 'rgb(231, 156, 123)', 'rgb(248, 220, 142)', 'rgb(212, 157, 187)']), board.colours.join(' '));
  check('board: titles in a readable hand (Patrick Hand), not pixel caps', /Patrick Hand/.test(board.title), board.title);
  await shot(bub, 'notes-board', await rectOf(bub, '#bubble', 6));
  await click(bub, '.bchip:nth-child(2)');                 // Just notes
  await wait(300);
  check('board: "Just notes" shows only the plain ones', (await js(bub, `[...document.querySelectorAll('.board .nmini')].length`)) === 2);
  await click(bub, '.bchip:nth-child(3)');                 // To-do
  await wait(300);
  check('board: a category chip filters to it', (await js(bub, `[...document.querySelectorAll('.board .nmini .mt')].map((e) => e.textContent).join(',')`)) === 'Before Friday');
  // Open it, change its category: the paper cross-fades and it is saved with the new category.
  await click(bub, '.board .nmini');
  await wait(400);
  check('a note opened from the board has the control row: # category, checklist, "Aang can bring this up"',
    (await js(bub, `!!document.querySelector('.bignote .np-chip') && !!document.querySelector('.bignote .np-ck.on') && /Aang can bring this up/.test(document.querySelector('.bignote .np-r2').textContent)`)) === true);
  check('the paper cross-fades (a 0.25 s transition on its colour)', (await js(bub, `getComputedStyle(document.querySelector('.bignote .np-fill')).transition`)).includes('background-color 0.25s'));
  await click(bub, '.bignote .np-chip');
  await wait(300);
  check('the category list shows each with its colour, plain first, + New category last',
    (await js(bub, `[...document.querySelectorAll('.np-pick .np-prow')].map((b) => b.querySelector('span').textContent).join(',')`)) === 'Just a note,To-do,Idea,Reference,For Claude,Recipes,+ New category');
  await click(bub, '.np-pick .np-prow:nth-of-type(3)');   // Idea (the header is the first child)
  await wait(400);
  check('picking a category recolours and saves it', lastSaid('bubble:notesave')?.cat === 'Idea' && (await js(bub, `document.querySelector('.bignote').dataset.cat`)) === 'Idea', String(lastSaid('bubble:notesave')?.cat));
  await click(bub, '.bignote .np-r2');
  await wait(300);
  check('the per-note switch: off = "Aang keeps this one to himself", saved as notice:false', lastSaid('bubble:notesave')?.notice === false && /keeps this one/.test(await js(bub, `document.querySelector('.bignote .np-r2').textContent`)));
  await click(bub, '.bignote .np-r2');
  await wait(300);
  check('...and on again', lastSaid('bubble:notesave')?.notice === undefined);
  // put it back as it was for the notice
  NOTES[0] = { ...NOTES[0]!, cat: 'To-do' };

  // ================================================================== 2. the quick note (Ctrl + *): the same note, small
  const qn = mk(328, 224);
  await qn.loadURL(`${pages.origin}/note.html?quick`);
  qn.webContents.send('note:data', { id: 'nquick1', title: '', html: '', font: 'figtree', size: 'm', updated: NOW, cats: ['Recipes'] });
  await wait(500);
  const q = await js<any>(qn, `({ quick: document.body.classList.contains('quick'), focused: document.activeElement?.classList.contains('nbody'), ph: document.querySelector('.nbody').dataset.ph,
    title: document.querySelector('.ntitle').hidden, chip: !!document.querySelector('.np-chip.ghost'), ck: !!document.querySelector('.np-ck'), sw: /Aang can bring this up/.test(document.querySelector('.np-r2').textContent),
    ribbon: !!document.querySelector('.np-ribbon'), pin: !!document.querySelector('.pin'), paper: getComputedStyle(document.querySelector('.np-fill')).backgroundColor })`);
  check('quick note: the same note, small, empty and focused, "A thought, a to-do, anything..."', q.quick && q.focused && q.ph === 'A thought, a to-do, anything...' && q.title, JSON.stringify(q));
  check('quick note: the same control row (# category, checklist, "Aang can bring this up"), the ribbon, plain butter', q.chip && q.ck && q.sw && q.ribbon && !q.pin && q.paper === 'rgb(248, 220, 142)', JSON.stringify(q));
  qn.webContents.insertText('Buy the blue food for Momo');
  await wait(200);
  await shot(qn, 'notes-quick');
  check('quick note: nothing is saved while typing', countSaid('note:save') === 0);
  await click(qn, '.np-chip');
  await wait(450);
  check('quick note: the # chip opens the category list (the window asks for room first)', (await js(qn, `!!document.querySelector('.np-pick')`)) === true && countSaid('note:menu') > 0);
  await click(qn, '.np-pick .np-prow:nth-of-type(2)');    // To-do
  await wait(400);
  check('quick note: picking To-do turns the paper sky blue', (await js(qn, `getComputedStyle(document.querySelector('.np-fill')).backgroundColor`)) !== 'rgb(248, 220, 142)'
    && (await js(qn, `document.querySelector('.sticky').dataset.cat`)) === 'To-do');
  qn.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Enter' } as Electron.KeyboardInputEvent);
  qn.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Enter' } as Electron.KeyboardInputEvent);
  await wait(500);
  const kept = lastSaid('note:quickdone');
  check('quick note: Enter keeps it, with its words, title and category', !!kept && /Buy the blue food/.test(kept.html) && kept.title === 'Buy the blue food' && kept.cat === 'To-do', JSON.stringify(kept)?.slice(0, 160));
  qn.destroy();

  // ================================================================== 3. Samara: "Notes for this site", the right rail
  const sam = mk(1100, 640);
  await sam.loadURL(`${pages.origin}/browser.html`);
  await wait(700);
  sam.webContents.send('browser:tabs', { active: 1, tabs: [{ id: 1, url: 'https://forever.warcraft.com/guides/molten-core', title: 'Molten Core', pane: 1 }], canBack: false, canForward: false });
  sam.webContents.send('browser:notes', { notes: NOTES.filter((n) => n.src), cats: ['Recipes'] });
  await wait(300);
  check('Samara: the rail is nothing at all until asked (no key in the band)', (await js(sam, `!document.querySelector('.siterail.on') && !document.querySelector('.band .sitenotes')`)) === true);
  check('Samara: "Notes for this site" sits in the ... menu under Find', (await js(sam, `(() => { const f = document.getElementById('m-find'), n = document.getElementById('m-sitenotes'); return !!n && f.nextElementSibling === n && n.textContent === 'Notes for this site'; })()`)) === true);
  const pageW0 = await js<number>(sam, `document.getElementById('page').getBoundingClientRect().width`);
  await js(sam, `document.getElementById('m-sitenotes').click()`);
  await wait(120);
  const midW = await js<number>(sam, `document.getElementById('siterail').getBoundingClientRect().width`);
  await wait(800);
  const r = await js<any>(sam, `({ w: document.getElementById('siterail').getBoundingClientRect().width, page: document.getElementById('page').getBoundingClientRect().width,
    cards: [...document.querySelectorAll('.sr-card')].map((c) => c.querySelector('.sr-t')?.textContent ?? c.querySelector('.sr-l').textContent), site: document.querySelector('.sr-site').textContent })`);
  check('Samara: the rail springs in (part way after 120 ms, all the way after) and tells the browser', midW > 20 && midW < 330 && r.w === 330 && said.some((x) => x.ch === 'browser:act' && x.a === 'siterail-on'), `mid ${midW}, end ${r.w}`);
  check('Samara: the page narrows beside it (nothing covered), and the page view is told', r.page <= pageW0 - 300, `page ${pageW0} -> ${r.page}`);
  check('Samara: it lists this site\'s notes and says which site', r.cards.length === 2 && /forever\.warcraft\.com/i.test(r.site) && r.site.endsWith('2'), JSON.stringify(r));
  await shot(sam, 'notes-rail', { x: 520, y: 0, width: 580, height: 640 });
  await js(sam, `document.querySelector('.sr-add').click()`);
  await wait(200);
  sam.webContents.insertText('Bring fire resist');
  await js(sam, `document.querySelector('.sr-card.new .nbody').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))`);
  await wait(200);
  const ns = lastSaid('browser:notesave');
  check('Samara: "+ note for this site" keeps a note (the browser adds where it came from)', !!ns && /Bring fire resist/.test(ns.html) && /^n[a-z0-9]+$/.test(ns.id), JSON.stringify(ns));
  await js(sam, `document.querySelector('.sr-card:not(.new)').click()`);
  check('Samara: a note in the rail opens', typeof lastSaid('browser:noteopen') === 'string');
  sam.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Escape' } as Electron.KeyboardInputEvent);
  await wait(900);
  check('Samara: Esc closes the rail and the page widens again', (await js(sam, `!document.getElementById('siterail').classList.contains('on')`)) === true
    && Math.abs((await js<number>(sam, `document.getElementById('page').getBoundingClientRect().width`)) - pageW0) < 2);
  await js(sam, `document.getElementById('m-sitenotes').click()`);
  await wait(800);
  await js(sam, `document.querySelector('.sr-x').click()`);
  await wait(900);
  check('Samara: its x closes it too', (await js(sam, `!document.getElementById('siterail').classList.contains('on')`)) === true);
  sam.destroy();

  // ================================================================== 4. the notice: Aang holds it up
  toBubble({ t: 'notes.state', notes: NOTES, cats: CATS });
  bub.webContents.send('bubble:dismiss', 'esc');
  await wait(900);
  const heldBefore = countSaid('bubble:noticeheld');
  toBubble({ t: 'bubble', text: 'Renew the passport is due tomorrow!', stream: false, proactive: true, kind: 'note.notice', notice: { noteId: 'nbf1', line: 'Renew the passport' }, link: 'Renew the passport' });
  await wait(2600);
  const held = [...said].reverse().find((x) => x.ch === 'bubble:noticeheld' && said.indexOf(x) >= heldBefore)?.a;
  check('notice: the note\'s name in his line is the link', (await js(bub, `[...document.querySelectorAll('#said .link')].map((e) => e.textContent.trim()).join(' ')`)) === 'Renew the passport', await js(bub, `document.getElementById('said').innerHTML.slice(0, 300)`));
  check('notice: Aang holds it up, in the note\'s colour (To-do sky)', held?.on === true && held?.paper === '#84c9f8', JSON.stringify(held));
  check('notice: no keys before he points at it', (await js(bub, `!document.querySelector('.nkeys') || document.querySelector('.nkeys').hidden`)) === true);
  const p = await at(bub, '#said');
  mouse(bub, 'mouseMove', p!.x, p!.y);
  await wait(700);
  check('notice: still no keys 0.7 s into pointing (they wait for intent)', (await js(bub, `!document.querySelector('.nkeys') || document.querySelector('.nkeys').hidden`)) === true);
  await wait(1200);
  const keys = await js<string[]>(bub, `[...document.querySelectorAll('.nkeys:not([hidden]) .key')].map((k) => k.textContent)`);
  check('notice: after ~1.5 s, Tick it / Open / Later', JSON.stringify(keys) === JSON.stringify(['Tick it', 'Open', 'Later']), JSON.stringify(keys));
  await wait(600);                                        // the keys fade in (the bubble's own fill-in)
  const bubbleImg = await shot(bub, 'notes-notice-bubble-tmp', await rectOf(bub, '#bubble', 4));

  // The held paper's own window, beside a sprite where the pet would be (no real pet here).
  const pet = { sprite: { x: -5000, y: 300, width: 49, height: 125 }, screen: { x: -5600, y: 0, width: 1920, height: 1040 }, scale: 1, edge: 'none' as const, peeking: false };
  // Off screen and far off his desktop: this window is never drawn where he can see it.
  const h = new NoteHeld({ origin: pages.origin, preloadPath: path.join(SHELL, 'src', 'preload.cjs'), pet: () => pet, offscreen: true });
  h.set({ on: true, paper: held?.paper ?? '#84c9f8', deep: held?.deep ?? '#2f78b8' });
  await wait(900);
  const hw = (h as unknown as { win: BrowserWindow }).win;
  const hb = hw.getBounds();
  check('notice: the paper sits over his hands (17 left of and 32 below his head, 34 x 28)', hb.x === -5000 - 88 + 112 - 17 && hb.y === 300 - 78 + 96 + 32 && hb.width === 34 && hb.height >= 28, JSON.stringify(hb));
  check('notice: it never takes the keyboard', hw.isFocusable() === false);
  const heldImg = await hw.webContents.capturePage();
  // Each picture of Aang in this check is his real idle frame; the three are put side by side as the sheet does.
  const comp = mk(bubbleImg.getSize().width + 200, Math.max(bubbleImg.getSize().height + 210, 300));
  await comp.loadURL('data:text/html,<body style="margin:0;background:%23191b24"></body>');
  const sprite = 'data:image/png;base64,' + readFileSync(path.join(ROOT, 'assets', 'aang', 'frames', 'idle_0.png')).toString('base64');
  const bw = bubbleImg.getSize().width, bh = bubbleImg.getSize().height;
  await js(comp, `(async () => { const add = (src, x, y, w) => new Promise((ok) => { const i = new Image(); i.onload = ok; i.src = src; i.style.cssText = 'position:absolute;left:' + x + 'px;top:' + y + 'px;image-rendering:pixelated' + (w ? ';width:' + w + 'px' : ''); document.body.append(i); });
    await add(${JSON.stringify(bubbleImg.toDataURL())}, 6, 6);
    await add(${JSON.stringify(sprite)}, ${bw - 70}, ${bh - 40});
    await add(${JSON.stringify(heldImg.toDataURL())}, ${bw - 70 + 112 - 17}, ${bh - 40 + 96 + 32}, 34); return true; })()`);
  await wait(200);
  await shot(comp, 'notes-notice');
  try { (await import('node:fs')).rmSync(path.join(OUT, 'notes-notice-bubble-tmp.png')); } catch { /* fine */ }
  // Later: he lowers it.
  await click(bub, '.nkeys .key:nth-child(3)');
  await wait(800);
  check('notice: Later lowers the paper and the line goes', lastSaid('bubble:noticeheld')?.on === false);
  h.set({ on: false });
  await wait(700);
  check('notice: the held window hides once lowered', !hw.isVisible() && !h.showing, JSON.stringify({ visible: hw.isVisible(), showing: h.showing, anim: !!(h as unknown as { anim: unknown }).anim, op: hw.getOpacity() }));
  h.close(); comp.destroy();

  const real = pageErrors.filter((e) => /notecats|notepaper|sitenotes|noteheld|note\.js|TypeError|ReferenceError|SyntaxError/.test(e));
  check('no page errors from the note parts', real.length === 0, real.slice(0, 3).join(' | '));
  if (pageErrors.length) console.log(`(other page messages: ${pageErrors.length}, e.g. ${pageErrors.slice(0, 2).join(' | ').slice(0, 200)})`);
  console.log(failed ? `${failed} FAILED` : 'ALL PASSED');
  pages.close();
  setTimeout(() => app.exit(failed ? 1 : 0), 100);
});
