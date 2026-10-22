// Sheet 62, "One Send to Aang" (his pick, 2026-10-22): one offscreen check of the whole flow, with the real pages.
// Never on his screen (offscreen windows; the pinned snip is put far off any display by a stubbed pointer), never
// focused, no real mouse, keys or clipboard, no dialogs (every error ends the run with app.exit).
// Checks: Samara's real page menu (pagemenu.html, fed by sendtoaang.ts pageMenuItems as browser.ts feeds it) has Send to
// Aang FIRST with its line under it, for highlighted words, a picture, a link and the page; a send lands as a chip on the
// real typing box (input.html); the real bubble (bubble.html) asks one line with the keys Ask about it / Keep as a note,
// plus Pin it for a snip; Keep as a note makes a note (Core's Notes.keep) with the link; Pin it opens the pinned snip's
// window (on top, the pin and close work).
// Pictures (3): send-menu.png (the words menu), send-land.png (the snip landing: bubble + box + Aang), send-pin.png.
//
// Run (from src/Shell): npx electron test/electron/send-check.ts [folder for the pictures]
import { app, BrowserWindow, screen } from 'electron';
import { mkdtempSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import os from 'node:os'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
import { servePages } from '../../src/pageserver.ts';
import { SendDesk, pageMenuItems, type MenuParams, type MenuHas } from '../../src/sendtoaang.ts';
import { PinSnips } from '../../src/pinsnip.ts';
import { Notes } from '../../../Core/src/notes.ts';

process.on('uncaughtException', (e) => { console.log('HARNESS ERROR ' + String((e as Error)?.stack ?? e).split('\n').slice(0, 3).join(' | ')); app.exit(2); });
process.on('unhandledRejection', (e) => { console.log('HARNESS REJECTION ' + String((e as Error)?.stack ?? e)); app.exit(2); });
setTimeout(() => { console.log('HARNESS TIMEOUT'); app.exit(3); }, 120_000).unref();
app.on('window-all-closed', () => {});
app.setPath('userData', mkdtempSync(path.join(os.tmpdir(), 'send-check-')));
const HERE = path.dirname(fileURLToPath(import.meta.url));
const SHELL = path.join(HERE, '..', '..'), ROOT = path.join(SHELL, '..', '..');
const STUB = path.join(HERE, 'cockpit-stub.cjs');
BrowserWindow.prototype.show = function (this: BrowserWindow) { this.setPosition(-6000, 100); this.showInactive(); };
BrowserWindow.prototype.focus = function () {};
BrowserWindow.prototype.moveTop = function () {};
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
let bad = 0;
const check = (what: string, ok: boolean, d: unknown = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${what}${d !== '' ? '  -- ' + String(typeof d === 'string' ? d : JSON.stringify(d)).slice(0, 300) : ''}`); if (!ok) bad++; };
const until = async (fn: () => boolean | Promise<boolean>, ms = 6000) => { const end = Date.now() + ms; while (Date.now() < end) { if (await fn()) return true; await wait(80); } return fn(); };
const OUT = (() => { const a = process.argv.at(-1); try { return a && statSync(a).isDirectory() ? a : os.tmpdir(); } catch { return os.tmpdir(); } })();
const save = (name: string, png: Buffer) => { const f = path.join(OUT, name); writeFileSync(f, png); console.log('PICTURE ' + f); };
const offscreen = (o: Electron.BrowserWindowConstructorOptions = {}, preload = STUB) => new BrowserWindow({ show: false, frame: false, ...o,
  webPreferences: { preload, contextIsolation: preload !== STUB, sandbox: false, offscreen: true } });

const P = (o: Partial<MenuParams>): MenuParams => ({ linkURL: '', srcURL: '', mediaType: 'none', selectionText: '', isEditable: false, misspelledWord: '',
  dictionarySuggestions: [], editFlags: { canCut: true, canCopy: true, canPaste: true, canSelectAll: true }, ...o });
const HAS: MenuHas = { send: true, other: 'Open on Mac', popout: true, popVideo: true, canBack: true, pageIsWeb: true };

app.whenReady().then(async () => {
  (screen as unknown as { getCursorScreenPoint: () => Electron.Point }).getCursorScreenPoint = () => ({ x: -20000, y: 400 });
  const pages = await servePages(path.join(SHELL, 'pages'));

  // ---- 1. the page menu: the real pagemenu.html with the real preload, fed exactly as browser.ts feeds it
  const mw = offscreen({ width: 360, height: 420, backgroundColor: '#3A2414' }, path.join(SHELL, 'src', 'preload.cjs'));
  await mw.loadURL(`${pages.origin}/pagemenu.html`);
  await mw.webContents.executeJavaScript('document.fonts.ready.then(() => 1)', true);
  const CASES: [string, MenuParams][] = [
    ['highlighted words', P({ selectionText: 'Ragnaros knocks back everyone in melee range at the start of each submerge,' })],
    ['a picture', P({ mediaType: 'image', srcURL: 'https://forever.warcraft.com/lava.png' })],
    ['a link', P({ linkURL: 'https://forever.warcraft.com/ragnaros' })],
    ['the page (empty space)', P({})],
  ];
  for (const [name, p] of CASES) {
    mw.webContents.send('pagemenu:items', pageMenuItems(p, HAS));
    await wait(200);
    const r = await mw.webContents.executeJavaScript(`[...document.getElementById('pm').children].map(e => e.classList.contains('sep') ? '|' : e.textContent.trim().split('\\n')[0])`, true) as string[];
    check(`menu for ${name}: Send to Aang first, its line under it`, r[0] === 'Send to Aang' && r[1] === '|' && r.filter((x) => x === 'Send to Aang').length === 1, r);
    if (name === 'highlighted words') {
      const h = await mw.webContents.executeJavaScript(`(() => { const r = document.getElementById('pm').getBoundingClientRect(); const b = document.querySelector('#pm button').getBoundingClientRect(); return { w: Math.ceil(r.right), h: Math.ceil(r.bottom), x: Math.round(b.left + 40), y: Math.round(b.top + 10) }; })()`, true) as { w: number; h: number; x: number; y: number };
      // The pointer on the first item, as sheet 62 draws it (the glove), inside this offscreen page only.
      mw.webContents.sendInputEvent({ type: 'mouseMove', x: h.x, y: h.y });
      await wait(400);
      save('send-menu.png', (await mw.webContents.capturePage({ x: 0, y: 0, width: Math.min(360, h.w), height: Math.min(420, h.h) })).toPNG());
    }
  }
  mw.destroy();

  // ---- 2. the landing: a chip on the real typing box, and Aang's line in the real bubble
  const desk = new SendDesk();
  const words = desk.land({ kind: 'words', text: 'Ragnaros knocks back everyone in melee range at the start of each submerge.', url: 'https://forever.warcraft.com/guides/molten-core', site: 'forever.warcraft.com', samara: true })!;
  // A snip: a small made-up picture saved where the Shell would save one.
  const dir = mkdtempSync(path.join(os.tmpdir(), 'send-check-snip-'));
  const pw = offscreen({ width: 320, height: 200 });
  await pw.loadURL('data:text/html,<body style="margin:0;background:linear-gradient(180deg,%231b4a5a,%239fe0d0 60%,%232a1e40 60%)"><div style="position:absolute;left:200px;top:70px;width:70px;height:40px;background:%23ffe0a0"></div></body>');
  await wait(300);
  const snipFile = path.join(dir, 'Snip 2026-10-22 20.15.00.png');
  const snipImg = await pw.webContents.capturePage();
  writeFileSync(snipFile, snipImg.toPNG());
  pw.destroy();
  const snip = desk.land({ kind: 'snip', file: snipFile, thumb: snipImg.resize({ width: 48 }).toDataURL(), site: 'your screen', title: 'lava fields map' })!;
  check('a send and a snip land as two chips', desk.chips().length === 2, desk.chips().map((c) => c.label + ' ' + c.title));

  const BOXH = 170;
  const bw = offscreen({ width: 268, height: BOXH, transparent: true, backgroundColor: '#00000000' });
  await bw.loadURL(`${pages.origin}/input.html`);
  await wait(600);
  await bw.webContents.executeJavaScript(`window.__fire('onInputState', { opened: true, mode: 'auto', week: 0.31, history: [] }); true`, true);
  await wait(200);
  await bw.webContents.executeJavaScript(`window.__fire('onChips', ${JSON.stringify({ sent: desk.chips().slice(1) })});
    document.body.style.cssText += ';display:flex;flex-direction:column;justify-content:flex-end;height:${BOXH}px'; true`, true);
  await wait(400);
  const chipText = await bw.webContents.executeJavaScript(`[...document.querySelectorAll('#pinned .pinchip')].map(c => c.textContent)`, true) as string[];
  check('the chip lands on the typing box: what it is and the site', chipText.length === 1 && /^SNIPyour screen · lava fields map/.test(chipText[0]!) && !!(await bw.webContents.executeJavaScript(`!!document.querySelector('#pinned .pinchip img')`, true)), chipText);
  await bw.webContents.executeJavaScript(`window.__fire('onChips', ${JSON.stringify({ sent: desk.chips().slice(0, 1) })}); true`, true);
  await wait(200);
  const chip2 = await bw.webContents.executeJavaScript(`[...document.querySelectorAll('#pinned .pinchip')].map(c => c.textContent)`, true) as string[];
  check('a words chip: WORDS and the site', /^WORDSforever\.warcraft\.com · Ragnaros knocks/.test(chip2[0] ?? ''), chip2);
  await bw.webContents.executeJavaScript(`window.__fire('onChips', ${JSON.stringify({ sent: desk.chips().slice(1) })}); true`, true);
  await wait(300);
  const boxPng = 'data:image/png;base64,' + (await bw.webContents.capturePage()).toPNG().toString('base64');
  bw.destroy();

  const W = 940, H = 640;
  const fx = W - 300, fy = H - 222, boxTop = fy + 74, boxLeft = fx + 72 - 256 - 6 - 22, head = { x: fx + 112, y: fy + 96 };
  const SPRITE = 'data:image/png;base64,' + readFileSync(path.join(ROOT, 'assets', 'aang', 'frames', 'idle_0.png')).toString('base64');
  const w = offscreen({ width: W, height: H, useContentSize: true });
  const errors: string[] = [];
  w.webContents.on('console-message', (e) => { const m = e as unknown as { message?: string; level?: string }; if (m.level === 'error') errors.push(String(m.message)); });
  await w.loadURL(`${pages.origin}/bubble.html`);
  await wait(700);
  const js = (s: string) => w.webContents.executeJavaScript(s, true);
  const bubbleBottom = boxTop - (BOXH - 112) - 8, bubbleRight = fx + 96;
  const css = `html,body{background:#191b24 !important}
body{background:radial-gradient(900px 500px at 15% 5%, rgba(80,96,140,.30), transparent 60%),linear-gradient(180deg,#1c1f2b,#151720) !important}
.wrap{margin:0 ${W - bubbleRight}px ${H - bubbleBottom}px 14px !important}
.stg{position:fixed;pointer-events:none;image-rendering:pixelated}`;
  await js(`(() => { const st = new CSSStyleSheet(); st.replaceSync(${JSON.stringify(css)}); document.adoptedStyleSheets = [st];
    const add = (src, x, y, cls) => { const i = document.createElement('img'); i.src = src; i.className = 'stg ' + cls; i.style.left = x + 'px'; i.style.top = y + 'px'; document.body.append(i); return i; };
    add(${JSON.stringify(SPRITE)}, ${fx}, ${fy}, 'aang'); add(${JSON.stringify(boxPng)}, ${boxLeft}, ${boxTop - (BOXH - 112)}, 'box');
    window.__fire('onAim', { x: ${head.x}, y: ${head.y}, flip: false }); return true; })()`);
  await wait(150);
  // The words' line first: two keys.
  await js(`window.__deliver(${JSON.stringify(words.ask)}); true`);
  await until(async () => Boolean(await js(`document.getElementById('said').textContent`)), 3000);
  const keysOf = async () => await js(`[...document.querySelectorAll('#asks button.key')].map(b => b.firstChild.textContent + '/' + b.querySelector('.k').textContent)`) as string[];
  const k1 = await keysOf();
  const said1 = await js(`[document.getElementById('who').textContent, document.getElementById('said').textContent]`) as string[];
  check('Aang asks one line: SENT FROM SAMARA, two keys', said1[0] === 'SENT FROM SAMARA' && said1[1] === 'Got it. Ask about it, or keep it as a note?' && JSON.stringify(k1) === JSON.stringify(['Ask about it/A', 'Keep as a note/S']), { said1, k1 });
  // Keep as a note: the real key, the bubble's own answer, and the note made by Core's Notes.keep.
  await wait(700);                                    // the 600 ms guard on new keys
  await js(`window.__sent.length = 0; [...document.querySelectorAll('#asks button.key')].find(b => b.dataset.key === 'S').click(); true`);
  const ans = (await js(`window.__sent.filter(s => s[0] === 'answerAsk').map(s => s[1][0])`)) as { t: string; id: string; choice: string }[];
  // Exactly {t, id, choice}: nothing of a Samara plan's answer (keep/note) rides along.
  check('the Keep key answers the send', ans.length === 1 && ans[0]!.t === 'send.ask' && ans[0]!.id === words.ask.id && ans[0]!.choice === 'note' && Object.keys(ans[0]!).length === 3, ans);
  check('no Samara plan card drawn for it', await js(`!document.querySelector('.samaraplan:not([hidden]), #samaraplan:not([hidden])')`) === true);
  const kept = ans[0] ? desk.answer(ans[0].id, ans[0].choice) : null;
  const notes = new Notes(path.join(dir, 'notes.json'));
  const note = kept?.do === 'note' ? notes.keep(kept.note.text, kept.note.url, kept.note.site) : null;
  check('Keep as a note makes a note with the link', !!note && note.src?.url === 'https://forever.warcraft.com/guides/molten-core' && /Ragnaros knocks back/.test(note.html) && note.html.includes('forever.warcraft.com/guides/molten-core'), note);
  check('the kept one leaves the box', desk.chips().length === 1 && desk.chips()[0]!.label === 'SNIP');

  // The snip's line: three keys. Pointer on the bubble so the keys show (his rule, 2026-10-11), for the picture.
  await js(`window.__deliver(${JSON.stringify(snip.ask)}); true`);
  await wait(900);
  const p = await js(`(() => { const r = document.getElementById('bubble').getBoundingClientRect(); return { x: Math.round(r.left + 30), y: Math.round(r.top + 20) }; })()`) as { x: number; y: number };
  w.webContents.sendInputEvent({ type: 'mouseMove', x: p.x, y: p.y });
  await wait(1300);
  const k2 = await keysOf();
  const said2 = await js(`[document.getElementById('who').textContent, document.getElementById('said').textContent]`) as string[];
  check('a snip gets a third key, Pin it', said2[0] === 'YOUR SNIP' && JSON.stringify(k2) === JSON.stringify(['Ask about it/A', 'Keep as a note/S', 'Pin it/D']), { said2, k2 });
  const r = await js(`(() => { const sk = document.getElementById('skin');
    const rs = [document.querySelector('.stg.aang'), document.querySelector('.stg.box'), sk].map((e) => e.getBoundingClientRect());
    const x0 = Math.min(...rs.map((q) => q.left)) - 20, y0 = Math.min(...rs.map((q) => q.top)) - 20, x1 = Math.max(...rs.map((q) => q.right)) - 60, y1 = Math.max(...rs.map((q) => q.bottom)) - 6;
    return { x: Math.max(0, Math.floor(x0)), y: Math.max(0, Math.floor(y0)), width: Math.ceil(x1 - Math.max(0, x0)), height: Math.ceil(y1 - Math.max(0, y0)) }; })()`) as Electron.Rectangle;
  save('send-land.png', (await w.webContents.capturePage({ x: r.x, y: r.y, width: Math.min(W - r.x, r.width), height: Math.min(H - r.y, r.height) })).toPNG());
  // Ask about it keeps the chip (he types; it goes with his words).
  check('Ask about it keeps the chip for his question', desk.answer(snip.ask.id, 'ask')?.do === 'ask' && desk.size === 1);
  await js(`window.__sent.length = 0; [...document.querySelectorAll('#asks button.key')].find(b => b.dataset.key === 'D').click(); true`);
  const ans2 = (await js(`window.__sent.filter(s => s[0] === 'answerAsk').map(s => s[1][0])`)) as { id: string; choice: string }[];
  check('the Pin key answers the snip', ans2.length === 1 && ans2[0]!.choice === 'pin' && ans2[0]!.id === snip.ask.id, ans2);
  check('no page errors in the bubble', errors.length === 0, errors.slice(0, 3));
  w.destroy();

  // ---- 3. Pin it: the pinned snip's window
  const pins = new PinSnips({ origin: pages.origin, preloadPath: path.join(SHELL, 'src', 'pinsnippreload.cjs'), iconPath: path.join(SHELL, 'assets', 'aang.ico'), clampToScreen: false });
  const pinned = ans2[0] ? desk.answer(ans2[0].id, ans2[0].choice) : null;
  const win = pinned?.do === 'pin' && pinned.sent.file ? pins.open(pinned.sent.file, pinned.sent.title) : null;
  check('Pin it opens a window', !!win && pins.windows().length === 1);
  if (win) {
    const pj = (s: string) => win.webContents.executeJavaScript(s, true);
    check('the picture is in it, with its name', await until(async () => (await pj(`(() => { const i = document.getElementById('pic'); return !!i && i.naturalWidth > 0 && document.getElementById('what').textContent === 'lava fields map'; })()`)) === true, 8000));
    check('it stays on top, never takes the keyboard', win.isAlwaysOnTop() && !win.isFocusable());
    check('the pin looks pinned', await pj(`document.getElementById('pin').classList.contains('on')`) === true);
    // The slider shows on hover, as on the other pop-outs (shown for the picture).
    await pj(`document.getElementById('vs').classList.add('on'); document.body.style.background = 'radial-gradient(80% 90% at 30% 10%,#2e333c 0%,#22262d 55%,#1a1c21 100%)'; true`);
    await wait(250);
    save('send-pin.png', (await win.webContents.capturePage()).toPNG());
    await pj(`document.getElementById('pin').click(); true`);
    check('the pin unpins it (not on top)', await until(() => !win.isAlwaysOnTop(), 3000));
    // Clicked a moment later, so this call returns before the window it runs in is gone.
    await pj(`setTimeout(() => document.getElementById('close').click(), 50); true`);
    check('close closes it', await until(() => win.isDestroyed() && pins.windows().length === 0, 3000));
  }
  pins.dispose();
  pages.close();
  console.log(bad ? `${bad} FAILED` : 'ALL PASSED');
  setTimeout(() => app.exit(bad ? 1 : 0), 200);
});
