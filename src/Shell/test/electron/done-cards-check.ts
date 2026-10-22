// 2026-10-22, his words: "do done jobs disappear? i dont want them to and that teal glow around them needs to be softer
// its really ugly right now. I want to be able to either X out of done jobs or click them to go to session where it
// finished." And: "The percentages for all progress bars are hard to read ... it's squashed, I can't read it."
//
// The real bubble.html (cockpit closed), driven through the test preload as main.ts drives it: one running job and two
// finished ones the brain calls unread. Checks the done cards stay (no 4 s fold), the soft teal (no solid ring), the x on
// hover acks and folds without opening, a card click acks and opens, the last one X'd closes the bubble, and the %
// is the readable body font. One picture: the two done cards (the second hovered, its x showing) under the running bar.
//
// Off screen, never focused, no real input and no clipboard: mouse moves go to this page only.
// Run (from src/Shell): npx electron test/electron/done-cards-check.ts [picture.png]
import { app, BrowserWindow } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync, writeFileSync } from 'node:fs';
import { servePages } from '../../src/pageserver.ts';

process.on('uncaughtException', (e) => { console.log('HARNESS ERROR ' + String((e as Error)?.stack ?? e)); app.exit(2); });
process.on('unhandledRejection', (e) => { console.log('HARNESS REJECTION ' + String((e as Error)?.stack ?? e)); app.exit(2); });
setTimeout(() => { console.log('HARNESS TIMEOUT'); app.exit(3); }, 90_000).unref();
app.on('window-all-closed', () => { /* the test decides */ });
const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, '..', '..', '..', '..');
const SHOT = process.argv.slice(2).find((a) => a.endsWith('.png')) ?? path.join(HERE, 'perf-out', 'done-cards.png');
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
let bad = 0;
const check = (what: string, ok: boolean, d = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${what}${d ? '  -- ' + String(d).slice(0, 240) : ''}`); if (!ok) bad++; };

const SPRITE = 'data:image/png;base64,' + readFileSync(path.join(ROOT, 'assets', 'aang', 'frames', 'idle_0.png')).toString('base64');
const W = 940, H = 860;
const now = Date.now();
const RUN = {
  id: 's-waymark', machine: 'pc', project: 'Waymark', phase: 'working', startedAt: now - 9 * 60000, prompt: 'Build the route screen',
  tasks: [{ text: 'Read the map code', status: 'completed' }, { text: 'Add the grid layout', status: 'completed' },
    { text: 'Wire the route list', status: 'in_progress', active: 'Wiring the route list' }, { text: 'Write the tests', status: 'pending' }],
  current: '', percent: 62, etaMs: 6 * 60000, usage: null, open: 'claude://claude.ai/epitaxy/s-waymark', held: 0,
};
const D1 = { id: 's-samara', machine: 'pc', project: 'Samara', phase: 'idle', startedAt: now - 30 * 60000, prompt: 'Tidy the bookmarks bar',
  tasks: [{ text: 'Move bookmarks to the shelf', status: 'completed' }], open: 'claude://claude.ai/epitaxy/s-samara', unread: true, doneAt: now - 60000 };
const D2 = { id: 's-coach', machine: 'pc', project: 'Coach', phase: 'ended', startedAt: now - 50 * 60000, prompt: 'Fix the weekly report email',
  tasks: [], open: 'claude://claude.ai/epitaxy/s-coach', unread: true, doneAt: now - 5 * 60000 };

// Sheet 53's stage (speech-bubble-check.ts): dark desktop, Aang's idle frame at 1x, and the teal tick over his head.
const fx = W - 300, fy = H - 222;
const STAGE = `html,body{background:#191b24 !important}
body{background:radial-gradient(900px 500px at 15% 5%, rgba(80,96,140,.30), transparent 60%),linear-gradient(180deg,#1c1f2b,#151720) !important}
.wrap{margin:0 ${W - (fx + 96)}px ${H - (fy + 80)}px 14px !important}
.stg{position:fixed;pointer-events:none;image-rendering:pixelated}`;
const TICK = ['..........OOO', '.........OHHO', '........OHHFO', '.......OHHFSO', '.OOO..OHHFSO.', 'OHHHOOHHFSO..', 'OFHHHHHFSO...', '.OFFHHFSO....', '..OFFFSO.....', '...OSSO......', '....OO.......'];

app.whenReady().then(async () => {
  const pages = await servePages(path.join(HERE, '..', '..', 'pages'));
  const w = new BrowserWindow({ width: W, height: H, show: false, frame: false, useContentSize: true,
    webPreferences: { preload: path.join(HERE, 'cockpit-stub.cjs'), contextIsolation: false, sandbox: false, offscreen: true } });
  w.setPosition(-6000, 100); w.showInactive();
  const errors: string[] = [];
  w.webContents.on('console-message', (e) => { const m = e as unknown as { message?: string; level?: string }; if (m.level === 'error') errors.push(String(m.message)); });
  await w.loadURL(`${pages.origin}/bubble.html`);
  await wait(700);
  const js = (s: string) => w.webContents.executeJavaScript(s, true);
  const g = Number(await js(`parseFloat(getComputedStyle(document.getElementById('wrap')).marginRight) - 78`)) || 0;
  await js(`(() => {
    const st = new CSSStyleSheet(); st.replaceSync(${JSON.stringify(STAGE)}.replace('margin:0 ${W - (fx + 96)}px ${H - (fy + 80)}px', 'margin:0 ${W - (fx + 96) + g}px ${H - (fy + 80) + g}px'));
    document.adoptedStyleSheets = [st];
    const add = (src, x, y) => { const i = document.createElement('img'); i.src = src; i.className = 'stg'; i.style.left = x + 'px'; i.style.top = y + 'px'; document.body.append(i); return i; };
    add(${JSON.stringify(SPRITE)}, ${fx}, ${fy});
    const T = ${JSON.stringify(TICK)}, px = 3, c = document.createElement('canvas'); c.width = (T[0].length + 1) * px; c.height = (T.length + 1) * px;
    const x = c.getContext('2d'), mix = (h, t, k) => { const a = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)); return 'rgb(' + a.map((v, i) => Math.round(v + (t[i] - v) * k)).join(',') + ')'; };
    const F = '#3fc4b4', pal = { O: '#2a1a10', H: mix(F, [255, 255, 255], .55), F, S: mix(F, [40, 20, 10], .35) };
    T.forEach((r, y) => [...r].forEach((ch, k) => { if (ch !== '.') { x.fillStyle = 'rgba(0,0,0,.4)'; x.fillRect((k + 1) * px, (y + 1) * px, px, px); } }));
    T.forEach((r, y) => [...r].forEach((ch, k) => { if (pal[ch]) { x.fillStyle = pal[ch]; x.fillRect(k * px, y * px, px, px); } }));
    add(c.toDataURL(), ${fx + 113} - T[0].length * px / 2, ${fy + 69} - T.length * px);
    window.__fire('onAim', { x: ${fx + 112}, y: ${fy + 96}, flip: false });
    return true;
  })()`);
  const sent = async (name: string) => (await js(`window.__sent.filter(s => s[0] === ${JSON.stringify(name)}).map(s => s[1][0])`)) as any[];
  const visible = () => js(`!document.getElementById('bubble').hidden`) as Promise<boolean>;
  const cards = () => js(`[...document.querySelectorAll('#ckjobs .jdone')].map((d) => d.dataset.id)`) as Promise<string[]>;
  const jobs = (list: unknown[]) => js(`window.__deliver({ t: 'claude.jobs', jobs: ${JSON.stringify(list)} }); true`);

  await jobs([RUN, D1, D2]); await wait(200);
  await js(`window.__fire('onRecall', 'jobs')`); await wait(1500);
  check('the teal tick click opens the jobs: the running bar and both done cards, newest first', (await sent('recalled')).at(-1) === true && (await visible())
    && JSON.stringify(await cards()) === JSON.stringify([D1.id, D2.id]) && (await js(`document.querySelectorAll('#ckjobs .job').length`)) === 1, JSON.stringify(await cards()));
  await wait(4600);
  check('done cards stay (no fold after 4 s)', (await cards()).length === 2);
  const look = await js(`(() => { const d = document.querySelector('#ckjobs .jdone'), f = document.querySelector('#ckjobs .flip .ff'); const s = getComputedStyle(d), p = getComputedStyle(f);
    return { ring: s.boxShadow, label: getComputedStyle(d.querySelector('.jc')).color, pct: f.textContent, font: p.fontFamily, weight: p.fontWeight, nums: p.fontVariantNumeric, size: p.fontSize }; })()`);
  check('soft teal: the quiet card edge and a faint haze, no solid teal ring', look.ring.includes('rgba(120, 80, 30, 0.28)') && look.ring.includes('rgba(63, 196, 180, 0.3)') && !look.ring.includes('rgb(63, 196, 180)'), look.ring);
  check('JOB COMPLETE stays teal-ish', look.label === 'rgb(31, 125, 114)', look.label);
  check('the % is the readable body font, bold, even digits', /Figtree/i.test(look.font) && look.weight === '700' && look.nums === 'tabular-nums' && parseFloat(look.size) >= 12, JSON.stringify(look));
  const xAt = await js(`(() => { const x = document.querySelectorAll('#ckjobs .jdone .jx')[1].getBoundingClientRect(); return { x: Math.round(x.left + x.width / 2), y: Math.round(x.top + x.height / 2) }; })()`);
  w.webContents.sendInputEvent({ type: 'mouseMove', x: xAt.x - 120, y: xAt.y });
  await wait(250);
  check('the x hides until the card is hovered', (await js(`getComputedStyle(document.querySelectorAll('#ckjobs .jdone .jx')[0]).opacity`)) === '0'
    && (await js(`getComputedStyle(document.querySelectorAll('#ckjobs .jdone .jx')[1]).opacity`)) === '1');
  w.webContents.sendInputEvent({ type: 'mouseMove', x: xAt.x, y: xAt.y });
  await wait(300);
  // The picture: the bubble and Aang, the second card hovered with its x lit.
  const r = await js(`(() => { const a = document.getElementById('skin').getBoundingClientRect(); return { x: Math.max(0, Math.floor(a.left) - 20), y: Math.max(0, Math.floor(a.top) - 20), r: ${fx + 200}, b: ${fy + 200} }; })()`);
  writeFileSync(SHOT, (await w.webContents.capturePage({ x: r.x, y: r.y, width: Math.min(W - r.x, r.r - r.x), height: Math.min(H - r.y, r.b - r.y) })).toPNG());
  console.log('picture: ' + SHOT);

  await js(`window.__sent.length = 0; document.querySelectorAll('#ckjobs .jdone .jx')[1].click(); true`); await wait(700);
  check('the x acks it and folds it, without opening it', JSON.stringify(await sent('claude')) === JSON.stringify([{ t: 'claude.ackdone', id: D2.id }]) && !(await sent('openClaude')).length
    && JSON.stringify(await cards()) === JSON.stringify([D1.id]) && (await visible()), JSON.stringify([await sent('claude'), await cards()]));
  await jobs([RUN, D1, D2]); await wait(200);
  check('the brain still saying unread for a moment does not bring it back', JSON.stringify(await cards()) === JSON.stringify([D1.id]));
  await js(`window.__sent.length = 0; document.querySelector('#ckjobs .jdone').click(); true`); await wait(100);
  check('a card click acks it and opens that session; the bubble goes', JSON.stringify(await sent('claude')) === JSON.stringify([{ t: 'claude.ackdone', id: D1.id }])
    && JSON.stringify(await sent('openClaude')) === JSON.stringify([D1.open]) && !(await visible()));
  // Only done cards, nothing running: the line says what finished, and the last x closes the bubble.
  await jobs([{ ...D1, id: 's-one' }]); await wait(200);
  await js(`window.__fire('onRecall', 'jobs')`); await wait(1500);
  check('done only: "Claude finished one job."', (await js(`document.getElementById('said').textContent`)) === 'Claude finished one job.', await js(`document.getElementById('said').textContent`));
  await js(`document.querySelector('#ckjobs .jdone .jx').click(); true`); await wait(1400);
  check('the last done card X\'d with nothing else showing: the bubble goes', !(await visible()));
  check('no page errors', !errors.length, errors.join(' | '));
  w.destroy();
  pages.close();
  console.log(bad ? `${bad} FAILED` : 'ALL PASS');
  setTimeout(() => app.exit(bad ? 1 : 0), 200);
});
