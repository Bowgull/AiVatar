// Comic lettering in the speech bubble (2026-10-22, docs/POPOUTS-NOTES-RESEARCH.md section 1, "Rules to adopt").
//
// bubble.html as it ships, driven through the test preload exactly as main.ts drives it, on sheet 53's stage (dark
// desktop, Aang's idle frame where the Shell puts him). Checks: "Hey!" in a tight balloon, not a 256-wide empty one;
// a two-line line stays narrow and balanced (whole and streamed); a long streamed reply widens only at its third line
// and the two lines he has read keep their words and places; the 5-minute recall line; Claude's choices; the tail
// aimed at his mouth; the grow never jumps.
//
// Off screen, never focused, no real input and no clipboard (the stub records copies). Any error ends the run.
// Run: npx electron test/electron/lettering-check.ts [out dir for pictures]
import { app, BrowserWindow } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { servePages } from '../../src/pageserver.ts';

process.on('uncaughtException', (e) => { console.log('HARNESS ERROR ' + String((e as Error)?.stack ?? e)); app.exit(2); });
process.on('unhandledRejection', (e) => { console.log('HARNESS REJECTION ' + String((e as Error)?.stack ?? e)); app.exit(2); });
setTimeout(() => { console.log('HARNESS TIMEOUT'); app.exit(3); }, 120_000).unref();
app.on('window-all-closed', () => { /* the test decides */ });
const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, '..', '..', '..', '..');
const OUT = process.argv.slice(2).find((a) => !a.startsWith('-') && !a.endsWith('.ts')) ?? path.join(HERE, 'perf-out', 'lettering');
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
let bad = 0;
const check = (what: string, ok: boolean, d = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${what}${d ? '  -- ' + String(d).slice(0, 300) : ''}`); if (!ok) bad++; };

const SPRITE = 'data:image/png;base64,' + readFileSync(path.join(ROOT, 'assets', 'aang', 'frames', 'idle_0.png')).toString('base64');
const W = 940, H = 760;
const fx = W - 300, fy = H - 222;
const HEAD = { x: fx + 112, y: fy + 96 }, MOUTH = { x: fx + 112, y: fy + 122 };
const STAGE = `
html,body{background:#191b24 !important}
body{background:linear-gradient(180deg,#1c1f2b,#151720) !important}
.wrap{margin:0 ${W - (fx + 96)}px ${H - (fy + 80)}px 14px !important}
.stg{position:fixed;pointer-events:none;image-rendering:pixelated}`;

type Js = (s: string) => Promise<any>;
interface Page { w: BrowserWindow; js: Js; errors: string[] }
async function open(origin: string): Promise<Page> {
  const w = new BrowserWindow({ width: W, height: H, show: false, frame: false, useContentSize: true,
    webPreferences: { preload: path.join(HERE, 'cockpit-stub.cjs'), contextIsolation: false, sandbox: false, offscreen: true } });
  w.setPosition(-6000, 100); w.showInactive();
  const errors: string[] = [];
  w.webContents.on('console-message', (e) => { const m = e as unknown as { message?: string; level?: string }; if (m.level === 'error') errors.push(String(m.message)); });
  await w.loadURL(`${origin}/bubble.html`);
  await wait(700);
  const js: Js = (s) => w.webContents.executeJavaScript(s, true);
  const g = Number(await js(`parseFloat(getComputedStyle(document.getElementById('wrap')).marginRight) - 78`)) || 0;
  const css = STAGE.replace(/margin:0 (\d+)px (\d+)px/, (_m, a, b) => `margin:0 ${Number(a) + g}px ${Number(b) + g}px`);
  await js(`(() => { const st = new CSSStyleSheet(); st.replaceSync(${JSON.stringify(css)}); document.adoptedStyleSheets = [st];
    const i = document.createElement('img'); i.src = ${JSON.stringify(SPRITE)}; i.className = 'stg aang'; i.style.left = '${fx}px'; i.style.top = '${fy}px'; document.body.append(i);
    window.__fire('onAim', { x: ${HEAD.x}, y: ${HEAD.y}, flip: false }); return true; })()`);
  await wait(100);
  return { w, js, errors };
}
async function picture(p: Page, name: string) {
  const r = await p.js(`(() => { const a = document.getElementById('skin').getBoundingClientRect(), b = document.querySelector('.stg.aang').getBoundingClientRect();
    const x = Math.max(0, Math.floor(Math.min(a.left, b.left)) - 16), y = Math.max(0, Math.floor(Math.min(a.top, b.top)) - 16);
    return { x, y, width: Math.min(innerWidth - x, Math.ceil(Math.max(a.right, b.right) - x) + 16), height: Math.min(innerHeight - y, Math.ceil(Math.max(a.bottom, b.bottom) - y) + 8) }; })()`);
  const file = path.join(OUT, `lettering-${name}.png`);
  writeFileSync(file, (await p.w.webContents.capturePage(r)).toPNG());
  console.log('picture: ' + file);
}
/** The text's real lines: the words on each, and where each word sits relative to the text box. */
const LINES = `(() => { const s = document.getElementById('said').getBoundingClientRect(), out = [];
  for (const sp of document.querySelectorAll('#said .w')) { const q = sp.getClientRects()[0]; if (!q) continue;
    const l = out.at(-1), w = { t: sp.textContent, x: Math.round(q.left - s.left), lit: !sp.classList.contains('o') };
    if (l && Math.abs(q.top - s.top - l.y) < 3) { l.words.push(w); l.width = Math.round(q.right - s.left) - l.words[0].x; }
    else out.push({ y: Math.round(q.top - s.top), words: [w], width: Math.round(q.width) }); }
  return out; })()`;
interface Line { y: number; words: { t: string; x: number; lit: boolean }[]; width: number }
const STATE = `(() => { const b = document.getElementById('bubble'), r = b.getBoundingClientRect(), s = getComputedStyle(document.getElementById('said'));
  return { w: Math.round(r.width), h: Math.round(r.height), wide: b.classList.contains('wide'), widest: b.classList.contains('widest'), comic: b.classList.contains('comic'),
    tight: b.classList.contains('tight'), whisper: b.classList.contains('whisper'), align: s.textAlign, lh: s.lineHeight, wrap: s.textWrapStyle, shown: !b.hidden }; })()`;

app.whenReady().then(async () => {
  mkdirSync(OUT, { recursive: true });
  const pages = await servePages(path.join(HERE, '..', '..', 'pages'));

  // ---- 1. "Hey!": a tight balloon round one short line, centred, the tail on his mouth, grown without a jump
  {
    const p = await open(pages.origin);
    await p.js(`window.__sizes = []; const b = document.getElementById('bubble'); window.__iv = setInterval(() => { if (b.style.width) window.__sizes.push(parseFloat(b.style.width)); }, 8); true`);
    await p.js(`window.__deliver({ t: 'bubble', text: 'Hey!', stream: false, turn: 1, proactive: true })`);
    await wait(1500);
    await p.js(`clearInterval(window.__iv); true`);
    const s = await p.js(STATE), lines = await p.js(LINES) as Line[];
    check('"Hey!" sits in a tight balloon (96-130 wide), not a 256-wide empty one', s.shown && s.tight && s.w >= 96 && s.w <= 130 && !s.wide, JSON.stringify(s));
    check('"Hey!" is one centred line on 22 px leading', lines.length === 1 && s.comic && s.align === 'center' && s.lh === '22px', JSON.stringify({ s, lines }));
    const sizes = await p.js(`window.__sizes`) as number[];
    const jump = sizes.some((v, i) => i > 0 && v < sizes[i - 1]! - 0.5);
    check('the grow never jumps: the width only rises to its own size', sizes.length > 5 && !jump && Math.round(sizes.at(-1)!) === s.w, sizes.map((v) => Math.round(v)).join(','));
    // The tail aims at his mouth (26 px under his head's centre), not at his head.
    const aim = await p.js(`import('./balloon.js').then((m) => { const b = document.getElementById('bubble').getBoundingClientRect();
      const ds = [...document.querySelectorAll('#skin path')].map((e) => e.getAttribute('d'));
      const dm = m.balloonPath(b.width, b.height, { x: ${MOUTH.x} - b.left, y: ${MOUTH.y} - b.top }), dh = m.balloonPath(b.width, b.height, { x: ${HEAD.x} - b.left, y: ${HEAD.y} - b.top });
      return { mouth: ds.includes(dm), head: ds.includes(dh), reach: m.REACH }; })`);
    check('the tail is aimed at his mouth (reach kept at 0.75)', aim.mouth && !aim.head && aim.reach === 0.75, JSON.stringify(aim));
    await picture(p, 'hey');
    check('no page errors (hey)', !p.errors.length, p.errors.join(' | '));
    p.w.destroy();
  }

  // ---- 2. a two-line line: narrow, balanced, the balloon hugging it; then the same as a streamed Quick answer
  {
    const p = await open(pages.origin);
    await p.js(`window.__deliver({ t: 'bubble', text: 'Your build finished. Every test passed, all 212 of them.', stream: false, turn: 2, proactive: true })`);
    await wait(2600);
    const s = await p.js(STATE), lines = await p.js(LINES) as Line[];
    const ws = lines.map((l) => l.width);
    check('a two-line message stays narrow (under 256) with balanced lines', s.shown && !s.wide && s.w < 256 && lines.length === 2 && Math.min(...ws) / Math.max(...ws) > 0.7 && s.wrap === 'balance', JSON.stringify({ s, ws }));
    check('...centred, 22 px leading, no lone last word', s.comic && s.align === 'center' && s.lh === '22px' && lines.at(-1)!.words.length > 1, JSON.stringify(lines.map((l) => l.words.map((w) => w.t).join(' '))));
    await picture(p, 'two-lines');
    // A 60-word whole message: 416 band, left-aligned (over 3 lines), and `pretty` past 6 lines.
    await p.js(`window.__fire('onDismiss', 'esc')`); await wait(900);
    await p.js(`window.__deliver({ t: 'bubble', text: ${JSON.stringify('The demo moved to Monday at two, and Dana asked whether the slides can be shared before then so her team can read them over the weekend. I said probably, but I wanted to check with you first because two of them still show the old numbers from the spring.')}, stream: false, turn: 3, proactive: true })`);
    await wait(900);
    const l = await p.js(STATE), ll = await p.js(LINES) as Line[];
    check('a longer whole message: the 416 band, left-aligned, balanced or pretty', l.wide && !l.widest && !l.comic && l.align !== 'center' && /balance|pretty/.test(l.wrap) && l.w <= 416, JSON.stringify({ l, n: ll.length }));
    await p.js(`window.__fire('onDismiss', 'esc')`); await wait(900);

    // The streamed Quick answer to a hello: two lines, still narrow.
    await p.js(`window.__deliver({ t: 'asked', text: 'hey' })`);
    await p.js(`window.__deliver({ t: 'bubble.dots', on: true, who: 'Quick' })`); await wait(500);
    const two = 'Hey! Doing well, thanks for asking. How is yours going?';
    await p.js(`window.__deliver({ t: 'bubble', text: ${JSON.stringify(two.slice(0, 20))}, stream: true, turn: 4, id: 'q1', who: 'Quick' })`); await wait(200);
    await p.js(`window.__deliver({ t: 'bubble', text: ${JSON.stringify(two)}, stream: true, turn: 4, id: 'q1', who: 'Quick' })`); await wait(200);
    await p.js(`window.__deliver({ t: 'bubble', text: ${JSON.stringify(two)}, stream: false, turn: 4, id: 'q1', who: 'Quick' })`); await wait(2600);
    const q = await p.js(STATE), ql = await p.js(LINES) as Line[];
    check('a streamed two-line Quick answer is not widened at its second line', !q.wide && q.w === 256 && ql.length === 2, JSON.stringify({ q, n: ql.length }));
    check('...and streamed text keeps plain greedy wrapping', q.wrap !== 'balance' && q.wrap !== 'pretty', q.wrap);
    check('no page errors (two lines)', !p.errors.length, p.errors.join(' | '));
    p.w.destroy();
  }

  // ---- 3. a long streamed reply: widens only when line 3 arrives, before it lights; lines 1-2 never move
  {
    const p = await open(pages.origin);
    await p.js(`window.__deliver({ t: 'asked', text: 'hey' })`);
    await p.js(`window.__deliver({ t: 'bubble.dots', on: true, who: 'Quick' })`); await wait(500);
    const text = 'Hey! Doing well. I tidied your downloads folder this morning and moved the old installers into a box called Old, so nothing is gone. The build from last night passed too, and the demo is still on for Monday at two.';
    const ws = text.split(' ');
    let before: Line[] = [], at: Line[] = [], widenedAt = -1, wideAt2 = false, w2 = 0, w3 = 0;
    for (let k = 1; k <= ws.length; k++) {
      await p.js(`window.__deliver({ t: 'bubble', text: ${JSON.stringify(ws.slice(0, k).join(' '))}, stream: true, turn: 5, id: 'q2', who: 'Quick' })`);
      const s = await p.js(STATE), ls = await p.js(LINES) as Line[];
      if (!s.wide) { before = ls; w2 = s.w; if (ls.length === 2) wideAt2 = wideAt2 || s.wide; }
      if (s.wide && widenedAt < 0) { widenedAt = k; at = ls; w3 = s.w; }
      await wait(widenedAt < 0 ? 140 : 40);
      if (widenedAt > 0 && k === widenedAt + 8) { await wait(700); await picture(p, 'stream-widened'); }
    }
    check('(the reply did widen)', widenedAt > 0, String(widenedAt));
    check('it stayed narrow through two lines and widened only as the third arrived', before.length === 2 && !wideAt2 && w2 === 256 && at.length >= 3, JSON.stringify({ before: before.length, at: at.length, w2, w3 }));
    const sameLines = (a: Line[], b: Line[]) => a.slice(0, 2).every((l, i) => b[i] && b[i]!.y === l.y && b[i]!.words.length === l.words.length && l.words.every((w, j) => b[i]!.words[j]!.t === w.t && b[i]!.words[j]!.x === w.x));
    check('lines 1-2 keep the same words in the same places when it widens', sameLines(before, at), JSON.stringify({ before: before.slice(0, 2).map((l) => l.words.map((w) => w.t).join(' ')), at: at.slice(0, 3).map((l) => l.words.map((w) => w.t).join(' ')) }));
    check('no word of the third line was lit when it widened', at.slice(2).every((l) => l.words.every((w) => !w.lit)), JSON.stringify(at.slice(2).map((l) => l.words.map((w) => w.t + (w.lit ? '*' : '')).join(' '))));
    await p.js(`window.__deliver({ t: 'bubble', text: ${JSON.stringify(text)}, stream: false, turn: 5, id: 'q2', who: 'Quick' })`);
    await wait(4500);
    const end = await p.js(LINES) as Line[];
    check('...and still the same when the whole reply is in and lit', sameLines(before, end) && end.every((l) => l.words.every((w) => w.lit)), JSON.stringify(end.map((l) => l.words.map((w) => w.t).join(' '))));
    check('no page errors (stream)', !p.errors.length, p.errors.join(' | '));
    p.w.destroy();
  }

  // ---- 4. the 5-minute recall line, and Claude's choices: unchanged by the lettering
  {
    const p = await open(pages.origin);
    await p.js(`window.__deliver({ t: 'bubble', text: 'Your demo moved to Monday at 2 pm.', stream: false, turn: 6, proactive: true })`); await wait(1500);
    await p.js(`window.__fire('onDismiss', 'esc')`); await wait(900);
    await p.js(`(() => { const real = Date.now; Date.now = () => real() + 120_000; return true; })()`);
    await p.js(`window.__fire('onRecall', 'recent')`); await wait(1400);
    const r = await p.js(`(() => ({ said: document.getElementById('said').textContent, ago: document.getElementById('wrap').dataset.ago, ...${STATE} }))()`);
    check('the recall line comes back small, with its 2 MIN AGO stamp, as a whisper (no comic sizing)', r.shown && r.whisper && !r.tight && r.ago === '2 MIN AGO' && r.said === 'Your demo moved to Monday at 2 pm.', JSON.stringify(r));
    await p.js(`window.__fire('onDismiss', 'boxclosed')`); await wait(900);
    const QUESTION = { id: 'w-1', session: 's-waymark', project: 'Waymark', kind: 'question', tool: 'AskUserQuestion', canAlways: false, summary: '',
      questions: [{ question: 'Which layout should the map use?', header: 'Layout', multiSelect: false, options: [
        { label: 'Full-screen map (Recommended)', description: 'The map fills the screen.' }, { label: 'Split: map and list', description: 'Turns listed underneath.' }, { label: 'List first', description: 'Turn by turn.' }] }] };
    await p.js(`window.__deliver({ t: 'claude.wait', items: [${JSON.stringify(QUESTION)}] })`); await wait(1500);
    const c = await p.js(`(() => ({ rows: document.querySelectorAll('#ckpins .opt').length, best: document.querySelector('#ckpins .rec')?.textContent, ...${STATE} }))()`);
    check("Claude's choices: each answer its own box, BEST tag, left-aligned, not squeezed", c.shown && c.rows === 4 && c.best === 'BEST' && !c.tight && !c.comic, JSON.stringify(c));
    await picture(p, 'choices');
    check('no page errors (recall, choices)', !p.errors.length, p.errors.join(' | '));
    p.w.destroy();
  }

  pages.close();
  console.log(bad ? `${bad} FAILED` : 'ALL PASS');
  setTimeout(() => app.exit(bad ? 1 : 0), 200);
});
