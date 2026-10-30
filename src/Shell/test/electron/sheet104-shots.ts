// Sheet 104 (2026-10-28): the look-and-feel pass's three looks, before and after, on the REAL pages (bubble, Look back,
// notes board, wheel) with the proposed CSS laid on top: pixel-stepped frames for the boxes inside the bubble, a fuller
// tail on the timer setup, and a wheel disc that lifts by whole pixels instead of growing to 1.1x. The rows' words are
// examples, never his history.
//
// Sheet 102 (2026-10-28): two notices from the notice review (R3, R12), drawn with the same real bubble as sheet 101.
//   R3: things held while he was busy come out as ONE bubble with a row each, not a drip of bubbles 6 s apart.
//   R12: back from away, one line saying what went to his phone, with a row each; nothing is sent again.
// The rows are the bubble's own present_list rows (paintList), unchanged. Everything below this header is
// mac-shots.ts (sheet 101) as it was.
//
// Sheet 101 (2026-10-28): Aang on the Mac, his picks from the Phase 3 interview. He rides up on top of the Mac's
// auto-hiding Dock, tucks into the edge when the Shadow window comes in front (the PC's Aang comes out there), gets a
// menu bar icon with the same menu as his right-click one, and keeps quiet (mark only) on a call, in full screen or with
// Shadow in front.
//
// Every Aang picture is the REAL bubble page, the REAL chat box and the REAL right-click menu, drawn off screen through
// the test stub exactly as the main process drives them (as sheet 53 and 56 were), with Aang's own frames at their real
// size on a 1x screen (the Mac runs one 1920x1080 1x display). The Mac around him (wallpaper, Dock, menu bar, the
// Shadow window) is context only, plain shapes, so the eye goes to Aang. Claude's mark is drawn from the pet's own pixel
// map (ClaudeMarks.cs), as on sheet 53. The menu bar icon is his real head at its native art size (one art pixel per
// screen pixel), never a redraw. Mockup only: "Go to the PC" is added to the real menu here, not in aangmenu.js.
//
// Run: npx electron test/electron/notice-shots.ts [only-prefix]  pictures -> docs/cockpit/sheet-102/
import { app, BrowserWindow } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { servePages } from '../../src/pageserver.ts';

process.on('uncaughtException', (e) => { console.log('HARNESS ERROR ' + String((e as Error)?.stack ?? e)); app.exit(2); });
process.on('unhandledRejection', (e) => { console.log('HARNESS REJECTION ' + String((e as Error)?.stack ?? e)); app.exit(2); });
setTimeout(() => { console.log('HARNESS TIMEOUT'); app.exit(3); }, 540_000).unref();
app.on('window-all-closed', () => { /* the script decides */ });
const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, '..', '..', '..', '..');
const OUT = path.join(ROOT, 'docs', 'cockpit', 'sheet-104');
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const ONLY = process.argv.slice(2).filter((a) => !a.endsWith('.ts'));
const wanted = (file: string) => !ONLY.length || ONLY.some((o) => file.startsWith(o));
const b64 = (f: string) => 'data:image/png;base64,' + readFileSync(f).toString('base64');
const FRAME = (n: string) => b64(path.join(ROOT, 'assets', 'aang', 'frames', n + '.png'));
const SPRITE = FRAME('idle_0');
const CLAUDE_ICON = b64(path.join(ROOT, 'docs', 'cockpit', 'sheet-45d', 'claude-icon.png'));
const SAMARA_ICON = b64(path.join(ROOT, 'src', 'Shell', 'pages', 'art', 'samara', 'samara-lantern-64.png'));
const W = 960, H = 800;

// Aang's 224 px frame: his art runs from row 78 (top of his head) to 203; eyes at about 100-112 (PetWindow, Dock.cs).
const ART_TOP = 78, PEEK = 34, MORE = 90;
/** The Mac's Dock at 64 px tiles: its top edge sits this far above the screen's bottom. */
const DOCK_H = 80;

type Js = (s: string) => Promise<any>;
const hover = (w: BrowserWindow, x: number, y: number) => w.webContents.sendInputEvent({ type: 'mouseMove', x, y });

// ---------------------------------------------------------------- what Aang says (the brain's real words where they exist)
const JOB = {
  id: 's-waymark', machine: 'mac', project: 'Waymark', phase: 'working', startedAt: Date.now() - 9 * 60000, prompt: 'Build the route screen',
  tasks: [
    { text: 'Read the map code', status: 'completed' }, { text: 'Add the grid layout', status: 'completed' },
    { text: 'Wire the route list', status: 'in_progress', active: 'Wiring the route list' },
    { text: 'Write the tests', status: 'pending' }, { text: 'Run the checks', status: 'pending' },
  ],
  current: '', percent: 62, etaMs: 6 * 60000, usage: { rateLimits: [{ kind: 'seven_day', percentUsed: 31 }] }, open: 'claude://claude.ai/epitaxy/s-waymark', held: 0,
};
const QUESTION = {
  id: 'w-1', session: 's-waymark', project: 'Waymark', kind: 'question', tool: 'AskUserQuestion', canAlways: false, summary: '',
  questions: [{ question: 'Which layout should the map use?', header: 'Layout', multiSelect: false, options: [
    { label: 'Full-screen map (Recommended)', description: 'The map fills the screen.' },
    { label: 'Split: map and list', description: 'Turns listed underneath.' },
  ] }],
};
/** core.ts, the brb fast path (2026-10-28), word for word. */
const BRB_REPLY = 'Okay. Everything goes to Discord until you are back.';

// ---------------------------------------------------------------- the pet's own pixel maps (as on sheet 53)
const PIX = `
const mix = (h, t, k) => { const a = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)); return 'rgb(' + a.map((v, i) => Math.round(v + (t[i] - v) * k)).join(',') + ')'; };
const WORK = ['..OOOOOOOOO..', '.OHHHHHFFFSO.', 'OHFFFFFFFFFSO', 'OHFOFFOFFOFSO', 'OHFFFFFFFFFSO', '.OFFFFFFFFSO.', '..OOOFSOOOO..', '....OSO......', '....OO.......'];
window.__markOf = (F) => { const px = 3, c = document.createElement('canvas'); c.width = (WORK[0].length + 1) * px; c.height = (WORK.length + 1) * px; const g = c.getContext('2d');
  const pal = { O: '#2a1a10', H: mix(F, [255, 255, 255], .55), F, S: mix(F, [40, 20, 10], .35) };
  WORK.forEach((r, y) => [...r].forEach((ch, x) => { if (ch !== '.') { g.fillStyle = 'rgba(0,0,0,.4)'; g.fillRect((x + 1) * px, (y + 1) * px, px, px); } }));
  WORK.forEach((r, y) => [...r].forEach((ch, x) => { if (pal[ch]) { g.fillStyle = pal[ch]; g.fillRect(x * px, y * px, px, px); } }));
  return c.toDataURL(); };
window.__markW = WORK[0].length * 3; window.__markH = WORK.length * 3;
`;

// ---------------------------------------------------------------- the Mac around him (context: plain, quiet shapes)
const MAC_CSS = `
html,body{background:#151821 !important}
body{background:radial-gradient(1000px 600px at 20% 0%, rgba(70,90,140,.32), transparent 60%),radial-gradient(800px 600px at 100% 100%, rgba(110,70,120,.24), transparent 60%),linear-gradient(180deg,#1b1f2c,#12141c) !important}
.stg{position:fixed;pointer-events:none;image-rendering:pixelated}
.mx-clip{position:fixed;overflow:hidden;pointer-events:none}
.mx-clip img{position:absolute;left:0;image-rendering:pixelated}
.mx-dock{position:fixed;height:${DOCK_H - 8}px;bottom:4px;border-radius:18px;background:rgba(46,48,58,.72);box-shadow:inset 0 0 0 1px rgba(255,255,255,.12),0 8px 30px rgba(0,0,0,.35);display:flex;align-items:center;gap:10px;padding:0 10px;pointer-events:none}
.mx-dock .mx-t{width:56px;height:56px;border-radius:13px;background:rgba(255,255,255,.07)}
.mx-dock img{width:56px;height:56px;image-rendering:auto}
.mx-bar{position:fixed;left:0;right:0;top:0;height:24px;background:rgba(28,28,32,.86);box-shadow:0 1px 0 rgba(255,255,255,.06);display:flex;align-items:center;justify-content:flex-end;gap:14px;padding:0 14px;font:500 13px/1 -apple-system,'Helvetica Neue',sans-serif;color:#e8e8ec;pointer-events:none}
.mx-bar .head{width:27px;height:21px;image-rendering:pixelated;margin-top:1px}
.mx-bar .on{background:rgba(255,255,255,.18);border-radius:4px;padding:1px 4px}
.mx-win{position:fixed;border-radius:10px;overflow:hidden;box-shadow:0 0 0 1px rgba(255,255,255,.10),0 18px 50px rgba(0,0,0,.5);pointer-events:none}
.mx-win .mx-tb{height:28px;background:#2b2d35;display:flex;align-items:center;gap:7px;padding:0 11px;font:600 12px/1 -apple-system,'Helvetica Neue',sans-serif;color:#aab}
.mx-win .mx-tb i{width:11px;height:11px;border-radius:50%;background:#5a5d68}
.mx-win.front .mx-tb i:nth-child(1){background:#ff5f57}.mx-win.front .mx-tb i:nth-child(2){background:#febc2e}.mx-win.front .mx-tb i:nth-child(3){background:#28c840}
.mx-win .mx-pc{position:absolute;left:0;right:0;top:28px;bottom:0;background:linear-gradient(180deg,#0f3a64,#0a2440)}
.mx-win .mx-pc .mx-task{position:absolute;left:0;right:0;bottom:0;height:40px;background:rgba(32,32,36,.92)}
.mx-win.full .mx-tb{display:none}.mx-win.full .mx-pc{top:0}
.mx-note{position:fixed;font:700 11px/1 Figtree,sans-serif;letter-spacing:.6px;color:#c9c3d6;background:rgba(20,18,28,.7);padding:5px 8px;border-radius:6px;pointer-events:none}
`;

interface Scene {
  /** Where his frame sits and how much of him shows: 'peek' 34 px, 'more' 90 px, 'stand' all of him. */
  pose: 'peek' | 'more' | 'stand' | 'none';
  dock?: boolean; bar?: boolean; barOn?: boolean; box?: string | null; mark?: string;
  shadow?: 'back' | 'front'; pcAang?: boolean; note?: string; menu?: { x: number; y: number; png: string }; video?: boolean;
  fx?: number;
  run?: (js: Js, w: BrowserWindow) => Promise<void>;
  crop?: { x: number; y: number; width: number; height: number };
}

let boxPngEmpty = '', boxPngBrb = '';
async function boxPicture(pages: { origin: string }, typed: string) {
  const w = new BrowserWindow({ width: 268, height: 112, show: false, frame: false, transparent: true, backgroundColor: '#00000000',
    webPreferences: { preload: path.join(HERE, 'cockpit-stub.cjs'), contextIsolation: false, sandbox: false, offscreen: true } });
  w.setPosition(-6000, 100); w.showInactive();
  await w.loadURL(`${pages.origin}/input.html`);
  await wait(700);
  await w.webContents.executeJavaScript(`window.__fire('onInputState', { opened: true, mode: 'auto', week: 0.31, history: [] }); true`, true);
  await wait(400);
  if (typed) {
    await w.webContents.executeJavaScript(`(() => { const t = document.getElementById('box'); if (!t) return false; t.value = ${JSON.stringify(typed)}; t.dispatchEvent(new Event('input', { bubbles: true })); return true; })()`, true);
    await wait(400);
  }
  const png = (await w.webContents.capturePage()).toPNG();
  w.destroy();
  return 'data:image/png;base64,' + png.toString('base64');
}

/** The REAL right-click menu, with "Go to the PC" added through the page's own row() and icon(). */
async function menuPicture(pages: { origin: string }, o: { onPc?: boolean } = {}) {
  const w = new BrowserWindow({ width: 640, height: 760, show: false, frame: false, transparent: true, backgroundColor: '#00000000',
    webPreferences: { preload: path.join(HERE, 'cockpit-stub.cjs'), contextIsolation: false, sandbox: false, offscreen: true } });
  w.setPosition(-6000, 100); w.showInactive();
  await w.loadURL(`${pages.origin}/aangmenu.html`);
  await wait(700);
  const js: Js = (s) => w.webContents.executeJavaScript(s, true);
  await js(`window.__fire('onMenu', { kind: 'show', x: 20, y: 20, state: { docked: true, dock: 'bottom', model: 'auto', jobsRunning: 1 } }); true`);
  await wait(500);
  // aangmenu.js is a module, so its row() and icon() cannot be called from here: the Hide row is copied and only its
  // icon is redrawn, exactly as icon() draws (TONE.O on TONE.sh, 2 px art pixels, a 1 px drop), 11x11 like the others.
  const ok = await js(`(() => {
    const map = ['OOOOOOOOOOO', 'O.........O', 'O...O.....O', 'O....O....O', 'O.OOOOO...O', 'O....O....O', 'O...O.....O', 'O.........O', 'OOOOOOOOOOO', '....OOO....', '..OOOOOOO..'];
    const after = document.querySelector('#main button[data-id="hide"]');
    if (!after) return 'no Hide row';
    const b = after.cloneNode(true); b.dataset.id = 'gopc';
    const old = b.querySelector('canvas.ic');
    const dpr = window.devicePixelRatio || 1, px = Math.max(1, Math.round(2 * dpr)), sh = Math.max(1, Math.round(dpr));
    const c = document.createElement('canvas'); c.width = 11 * px + sh; c.height = 11 * px + sh; const g = c.getContext('2d');
    const put = (col, o) => map.forEach((r, y) => [...r].forEach((ch, x) => { if (ch === 'O') { g.fillStyle = col; g.fillRect(x * px + o, y * px + o, px, px); } }));
    put('rgba(0,0,0,.65)', sh); put('#d8c8a8', 0);
    c.className = 'ic'; c.style.width = (c.width / dpr) + 'px'; c.style.height = (c.height / dpr) + 'px';
    old.replaceWith(c);
    const lab = b.querySelector('.lab'); lab.lastChild.textContent = ${JSON.stringify(o.onPc ? 'Go to the Mac' : 'Go to the PC')};
    after.after(b);
    return 'ok';
  })()`);
  if (ok !== 'ok') console.log('menu: ' + ok);
  await wait(200);
  // Its own resting state: the new row pointed at, as his mouse would.
  const at = await js(`(() => { const r = document.querySelector('#main button[data-id="gopc"]').getBoundingClientRect(); return { x: Math.round(r.left + 30), y: Math.round(r.top + r.height / 2) }; })()`) as { x: number; y: number };
  hover(w, at.x, at.y);
  await wait(500);
  const r = await js(`(() => { const r = document.getElementById('main').getBoundingClientRect(); return { x: Math.floor(r.left) - 14, y: Math.floor(r.top) - 10, width: Math.ceil(r.width) + 28, height: Math.ceil(r.height) + 30 }; })()`) as { x: number; y: number; width: number; height: number };
  const png = (await w.webContents.capturePage({ x: Math.max(0, r.x), y: Math.max(0, r.y), width: r.width, height: r.height })).toPNG();
  w.destroy();
  return { png: 'data:image/png;base64,' + png.toString('base64'), width: r.width, height: r.height };
}

/** His real head at its native art size: frame rows 78..119, every other pixel (one art pixel = one screen pixel). */
function headIcon() {
  return `(() => { const img = new Image(); img.src = ${JSON.stringify(SPRITE)};
    return new Promise((res) => { img.onload = () => {
      const c = document.createElement('canvas'); c.width = 224; c.height = 224; const g = c.getContext('2d'); g.drawImage(img, 0, 0);
      const src = g.getImageData(86, 78, 54, 42);
      const o = document.createElement('canvas'); o.width = 27; o.height = 21; const h = o.getContext('2d'); const d = h.createImageData(27, 21);
      for (let y = 0; y < 21; y++) for (let x = 0; x < 27; x++) { const i = ((y * 2) * 54 + x * 2) * 4, j = (y * 27 + x) * 4; for (let k = 0; k < 4; k++) d.data[j + k] = src.data[i + k]; }
      h.putImageData(d, 0, 0); res(o.toDataURL()); }; }); })()`;
}

async function scene(pages: { origin: string }, file: string, o: Scene) {
  if (!wanted(file)) return;
  const w = new BrowserWindow({ width: W, height: H, show: false, frame: false, useContentSize: true,
    webPreferences: { preload: path.join(HERE, 'cockpit-stub.cjs'), contextIsolation: false, sandbox: false, offscreen: true } });
  w.setPosition(-6000, 100); w.showInactive();
  const errors: string[] = [];
  w.webContents.on('console-message', (e) => { const m = e as unknown as { message?: string; level?: string }; if (m.level === 'error') errors.push(String(m.message)); });
  await w.loadURL(`${pages.origin}/bubble.html`);
  await wait(700);
  const js: Js = (s) => w.webContents.executeJavaScript(s, true);
  const head = o.bar ? await js(headIcon()) : '';
  // Where his frame is. Docked at the bottom: the screen's bottom edge, or the Dock's top edge when it is up (his pick).
  const floor = o.dock ? H - DOCK_H : H;
  const fx = o.fx ?? W - 330;
  const show = o.pose === 'peek' ? PEEK : o.pose === 'more' ? MORE : 224 - ART_TOP;
  const fy = o.pose === 'stand' ? H - 222 : floor - ART_TOP - show;
  const headPt = { x: fx + 112, y: fy + 96 };
  const bubbleRight = fx + 96;
  const boxTop = fy + 74;
  const bubbleBottom = o.box ? boxTop - 8 : fy + ART_TOP - 6;
  const css = MAC_CSS + `.wrap{margin:0 ${W - bubbleRight}px ${H - bubbleBottom}px 14px !important}`;
  await js(`(() => {
    ${PIX}
    const st = new CSSStyleSheet(); st.replaceSync(${JSON.stringify(css)});
    document.adoptedStyleSheets = [st];
    const el = (tag, cls, css) => { const e = document.createElement(tag); if (cls) e.className = cls; if (css) Object.assign(e.style, css); document.body.append(e); return e; };
    ${o.shadow ? `{
      const full = ${JSON.stringify(o.shadow === 'front')};
      const win = el('div', 'mx-win' + (full ? ' front full' : ''), full ? { left: '0px', top: '0px', width: '${W}px', height: '${H}px', borderRadius: '0' } : { left: '40px', top: '${H - 470}px', width: '520px', height: '330px' });
      const tb = document.createElement('div'); tb.className = 'mx-tb'; tb.innerHTML = '<i></i><i></i><i></i><span style="margin-left:8px">Shadow PC</span>'; win.append(tb);
      const pc = document.createElement('div'); pc.className = 'mx-pc'; win.append(pc);
      const task = document.createElement('div'); task.className = 'mx-task'; pc.append(task);
      ${o.pcAang ? `{ const c = document.createElement('div'); c.className = 'mx-clip'; Object.assign(c.style, { position: 'absolute', left: '${W - 300}px', bottom: '40px', width: '224px', height: '${PEEK}px' });
        const i = document.createElement('img'); i.src = ${JSON.stringify(SPRITE)}; i.style.top = '-${ART_TOP}px'; c.append(i); pc.append(c); }` : ''}
    }` : ''}
    ${o.video ? `el('div', '', { position: 'fixed', inset: '0', background: 'linear-gradient(180deg,#2c3f66 0%,#7a5a7e 55%,#e0905a 80%,#3a2440 81%,#221830 100%)' });` : ''}
    ${o.dock ? `{ const d = el('div', 'mx-dock', { left: '${fx - 230}px' });
      d.innerHTML = '<div class="mx-t"></div><div class="mx-t"></div><img src="${SAMARA_ICON}"><img src="${CLAUDE_ICON}"><div class="mx-t"></div><div class="mx-t"></div><div class="mx-t"></div>'; }` : ''}
    ${o.bar ? `{ const b = el('div', 'mx-bar'); b.innerHTML = '<span class="${o.barOn ? 'on' : ''}"><img class="head" src="${head}"></span><span>Wed 12:10 PM</span>'; }` : ''}
    ${o.pose !== 'none' ? `{
      const c = el('div', 'mx-clip', { left: '${fx}px', top: '${fy + ART_TOP}px', width: '224px', height: '${show}px' });
      const i = document.createElement('img'); i.src = ${JSON.stringify(SPRITE)}; i.className = 'aang'; i.style.top = '-${ART_TOP}px'; c.append(i);
    }` : ''}
    ${o.box ? `{ const i = el('img', 'stg box', { left: '${fx + 72 - 256 - 6 - 22}px', top: '${boxTop}px' }); i.src = ${JSON.stringify(o.box)}; }` : ''}
    ${o.mark ? `{ const i = el('img', 'stg mark'); i.src = window.__markOf(${JSON.stringify(o.mark)}); i.style.left = (${fx + 113} - window.__markW / 2) + 'px'; i.style.top = (${fy + ART_TOP - 9} - window.__markH) + 'px'; }` : ''}
    ${o.menu ? `{ const i = el('img', 'stg menu', { left: '${o.menu.x}px', top: '${o.menu.y}px', imageRendering: 'auto' }); i.src = ${JSON.stringify(o.menu.png)}; }` : ''}
    ${o.note ? `el('div', 'mx-note', { left: '18px', bottom: '14px' }).textContent = ${JSON.stringify(o.note)};` : ''}
    const wrap = document.getElementById('wrap'); wrap.dataset.name = 'AANG';
    window.__fire('onAim', { x: ${headPt.x}, y: ${headPt.y}, flip: false });
    return true;
  })()`);
  await wait(150);
  if (o.run) await o.run(js, w);
  // The crop: what is in the picture (his bubble, him, the box, the mark, the menu, the Dock, the Shadow window), with a
  // margin, so nothing is mostly empty wallpaper. A scene can still name its own.
  const fit = await js(`(() => {
    const R = (e) => { if (!e) return null; const q = e.getBoundingClientRect(); return q.width > 2 && q.height > 2 ? q : null; };
    const b = document.getElementById('bubble');
    const rs = [b && !b.hidden ? R(document.getElementById('skin')) : null, ...[...document.querySelectorAll('.mx-clip, .stg, .mx-dock, .mx-win, .mx-bar')].map(R)].filter(Boolean);
    if (!rs.length) return null;
    return { a: Math.min(...rs.map((q) => q.left)), b: Math.min(...rs.map((q) => q.top)), c: Math.max(...rs.map((q) => q.right)), d: Math.max(...rs.map((q) => q.bottom)) };
  })()`) as { a: number; b: number; c: number; d: number } | null;
  const pad = 28;
  const auto = fit ? { x: Math.max(0, Math.floor(fit.a) - pad), y: Math.max(0, Math.floor(fit.b) - pad) } : { x: 0, y: 0 };
  const r = o.crop ?? (fit ? { ...auto, width: Math.min(W - auto.x, Math.ceil(fit.c - auto.x) + pad), height: Math.min(H - auto.y, Math.ceil(fit.d - auto.y) + pad) } : { x: 0, y: 0, width: W, height: H });
  writeFileSync(path.join(OUT, file + '.png'), (await w.webContents.capturePage(r)).toPNG());
  console.log('picture: ' + file + (errors.length ? '  (page errors: ' + errors.slice(0, 3).join(' | ') + ')' : ''));
  w.destroy();
}

async function jobBars(js: Js, jobs: object[]) {
  await js(`window.__fire('onCockpit', { open: true, state: { maxH: 700 } })`);
  await wait(500);
  await js(`window.__deliver({ t: 'claude.jobs', jobs: ${JSON.stringify(jobs)} })`);
  await wait(400);
  await js(`(() => { window.__bars = [...document.querySelectorAll('#ckjobs .job')]; for (const b of window.__bars) b.remove(); return window.__bars.length; })()`);
  await js(`window.__fire('onCockpit', { open: false })`);
  await wait(900);
  await js(`(() => { const box = document.createElement('div'); box.className = 'ckjobs injob'; box.append(...window.__bars);
    document.getElementById('scroller').after(box); return true; })()`);
}
async function hoverBubble(js: Js, w: BrowserWindow) {
  const p = await js(`(() => { const r = document.getElementById('bubble').getBoundingClientRect(); return { x: Math.round(r.left + 30), y: Math.round(r.top + 20) }; })()`) as { x: number; y: number };
  hover(w, p.x, p.y);
}

// ---------------------------------------------------------------- run

/** A 9-slice pixel frame: 7x7 art at exactly 2x, stepped corners, outline, a light inner edge, the fill. */
function frame(fill: string, outline: string, light: string): string {
  const O = outline, L = light, F = fill, _ = 'none';
  const art = [
    [_, _, O, O, O, _, _].map((c, i) => (i >= 2 && i <= 4 ? O : _)),
    [_, O, L, L, L, O, _],
    [O, L, F, F, F, L, O],
    [O, L, F, F, F, L, O],
    [O, L, F, F, F, L, O],
    [_, O, L, L, L, O, _],
    [_, _, O, O, O, _, _],
  ];
  // corners stepped: row 0 and 6 only the middle; rows 1 and 5 inset by one
  art[0] = [_, _, O, O, O, _, _];
  let rects = '';
  art.forEach((row, y) => row.forEach((c, x) => { if (c !== 'none') rects += `<rect x="${x}" y="${y}" width="1" height="1" fill="${c}"/>`; }));
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="7" height="7" viewBox="0 0 7 7" shape-rendering="crispEdges">${rects}</svg>`;
  return `url("data:image/svg+xml;utf8,${encodeURIComponent(svg)}")`;
}
const PIXCSS = (() => {
  const slip = frame('#f6e7c4', '#7a5328', '#fff8e6');
  const lamp = frame('#ead6a8', '#7a5328', '#fbefd2');
  const chip = frame('#fbf1dc', '#6e4a26', '#ffffff');
  const chipOn = frame('#5a3a8a', '#2a1446', '#8a6ac0');
  const tile = frame('#f4d9cc', '#8a4a32', '#fff0e8');
  const fr = (img: string) => `border:6px solid transparent!important;border-image:${img} 3 fill / 6px / 0 stretch!important;border-radius:0!important;background:none!important;box-shadow:none!important;image-rendering:pixelated;`;
  return `
    .lt-slip{${fr(slip)}filter:drop-shadow(0 2px 0 rgba(90,60,25,.25))}
    .lt-lamp{${fr(lamp)}}
    .lt-part.now{border-radius:0!important;box-shadow:inset 0 0 0 2px #c89a3c!important}
    .bchip{${fr(chip)}padding:3px 9px 4px!important}
    .bchip.on{${fr(chipOn)}color:#fff!important}
    .bchip.add{${fr(frame('#f3e3c0', '#9a7a52', '#f3e3c0'))}}
    .lt-tile{${fr(tile)}}`;
})();
const pixOn = (on: boolean) => async (js: Js) => { if (on) await js(`(() => { const st = new CSSStyleSheet(); st.replaceSync(${JSON.stringify(PIXCSS)}); document.adoptedStyleSheets = [...document.adoptedStyleSheets, st]; return true; })()`); };

const BRIEF = { t: 'bubble', text: 'Your brief', stream: false, brief: {
  day: 'Wednesday, October 28', weather: { words: 'overcast', low: 7, high: 14 },
  parts: [{ part: 'morn', sky: 'cloud', temp: 10 }, { part: 'aftn', sky: 'sun', temp: 14 }, { part: 'eve', sky: 'moon', temp: 10 }],
  unread: [], events: [] } };
const now = Date.now();
const TURNS = [
  { id: 901, ts: new Date(now - 3_600_000).toISOString(), who: 'you', text: 'what time is it' },
  { id: 902, ts: new Date(now - 3_590_000).toISOString(), who: 'aang', text: "It's 4:53 pm." },
  { id: 903, ts: new Date(now - 1_800_000).toISOString(), who: 'aang', text: 'Waymark replied: every test passed.', extra: { kind: 'claude', project: 'Waymark' } },
  { id: 904, ts: new Date(now - 600_000).toISOString(), who: 'aang', text: 'Reminder: call the dentist.' },
];
const lookback = async (js: Js) => { await js(`window.__fire('onRecall', 'back')`); await wait(600); await js(`window.__deliver({ t: 'history.reply', items: ${JSON.stringify(TURNS)} })`); await wait(900); };

app.whenReady().then(async () => {
  mkdirSync(OUT, { recursive: true });
  const pages = await servePages(path.join(HERE, '..', '..', 'pages'));
  for (const [tag, on] of [['before', false], ['after', true]] as const) {
    await scene(pages, `1-brief-${tag}`, { pose: 'more', run: async (js) => { await pixOn(on)(js); await js(`window.__deliver(${JSON.stringify(BRIEF)})`); await wait(1800); } });
    await scene(pages, `2-board-${tag}`, { pose: 'more', run: async (js) => { await pixOn(on)(js); await js(`window.__deliver({ t: 'notes.state', notes: [], cats: { own: [] } })`); await js(`window.__deliver({ t: 'notes.board' })`); await wait(1500); } });
    await scene(pages, `3-lookback-${tag}`, { pose: 'more', run: async (js) => { await pixOn(on)(js); await lookback(js); } });
  }
  // The timer setup's tail: today it aims at his cheek from a bubble that sits right against him; after, the bubble
  // keeps a 14 px gap so the tail has room to be a tail.
  await scene(pages, '4-tail-before', { pose: 'more', run: async (js) => { await js(`window.__deliver({ t: 'timer.setup' })`); await wait(1200); } });
  await scene(pages, '4-tail-after', { pose: 'more', fx: W - 316, run: async (js) => { await js(`window.__deliver({ t: 'timer.setup' })`); await wait(1200); } });
  await wheelShots(pages);
  pages.close();
  setTimeout(() => app.exit(0), 300);
});

/** The REAL wheel, one disc pointed at: today it grows to 1.1x; after, it lifts 2 px with a brighter rim, kept whole. */
async function wheelShots(pages: { origin: string }) {
  for (const [tag, css] of [['before', ''], ['after', '.disc.on{transform:translateY(-3px)!important;box-shadow:0 0 0 3px #FFE28C,0 0 0 6px #120A05,0 7px 0 var(--outline)!important}.disc svg{image-rendering:pixelated}']] as const) {
    const w = new BrowserWindow({ width: 520, height: 420, show: false, frame: false, transparent: true, backgroundColor: '#00000000',
      webPreferences: { preload: path.join(HERE, 'cockpit-stub.cjs'), contextIsolation: false, sandbox: false, offscreen: true } });
    w.setPosition(-6000, 100); w.showInactive();
    await w.loadURL(`${pages.origin}/wheel.html`);
    await wait(600);
    if (css) await w.webContents.insertCSS(css);
    await w.webContents.executeJavaScript(`window.__fire('onWheel', { kind: 'show', cx: 300, cy: 330, w: 520, h: 420 }); true`, true);
    await wait(700);
    await w.webContents.executeJavaScript(`(() => { const d = document.querySelectorAll('.disc')[1]; if (d) d.classList.add('on'); return !!d; })()`, true);
    await wait(500);
    writeFileSync(path.join(OUT, `5-wheel-${tag}.png`), (await w.webContents.capturePage()).toPNG());
    console.log('picture: 5-wheel-' + tag);
    w.destroy();
  }
}
