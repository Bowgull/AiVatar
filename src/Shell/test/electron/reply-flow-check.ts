// His ask (2026-10-21): "make the way Aang replies to me, the way he thinks, how long he thinks smoother and faster, and
// displaying what he's saying, because right now it's a bit jumpy". The real bubble page, off screen, driven exactly as
// main.ts drives it: Enter (`asked`), the brain's dots 15 ms later, then a Smart answer streamed in 40-60 ms chunks at a
// model's pace (about 60 words a second), then the finished reply. Sampled every 16 ms, it checks:
//   - thinking shows on Enter, and thinking -> answer is ONE bubble: never hidden, never empty between dots and words
//   - the first word is painted within 100 ms of the first chunk
//   - the width is fixed from the first chunk on, and no visible word ever changes line (no rewrap)
//   - the balloon's height only grows while the answer arrives, and no word jumps (frame to frame)
//   - the window is resized at most every ~150 ms while it streams, and the finished reply does not blink (no re-fade)
// and saves a frame strip to test/electron/perf-out/reply-flow/strip.png to LOOK at.
// Off screen, never focused, no real input. Run: npx electron test/electron/reply-flow-check.ts
import { app, BrowserWindow, nativeImage } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { servePages } from '../../src/pageserver.ts';

process.on('uncaughtException', (e) => { console.log('HARNESS ERROR ' + String((e as Error)?.stack ?? e)); app.exit(2); });
process.on('unhandledRejection', (e) => { console.log('HARNESS REJECTION ' + String((e as Error)?.stack ?? e)); app.exit(2); });
setTimeout(() => { console.log('HARNESS TIMEOUT'); app.exit(3); }, 90_000).unref();
app.on('window-all-closed', () => { /* the test decides */ });
const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, '..', '..', '..', '..');
const OUT = path.join(HERE, 'perf-out', 'reply-flow');
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
let bad = 0;
const check = (what: string, ok: boolean, d = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${what}${d ? '  -- ' + String(d).slice(0, 300) : ''}`); if (!ok) bad++; };

const SPRITE = 'data:image/png;base64,' + readFileSync(path.join(ROOT, 'assets', 'aang', 'frames', 'idle_0.png')).toString('base64');
const W = 940, H = 760;
const fx = W - 300, fy = H - 222;
const HEAD = { x: fx + 112, y: fy + 96 };

const ANSWER = 'Tomorrow you have three things on. The dentist at 9:30 on King Street, about twenty minutes from home, so leave by '
  + '9:05. Lunch with Sam at 12:30 at the ramen place he likes. Then your raid at 8, and the weather says rain all '
  + 'afternoon, so take the umbrella when you head out for lunch. Want me to set a reminder for the dentist?';

// The sampler runs inside the page: every 16 ms, what he would see.
const PROBE = `(() => {
  const P = window.aang; window.__sizes = [];
  window.aang = new Proxy({}, { get(_, k) { if (k === 'bubbleSize') return (s) => { window.__sizes.push({ at: performance.now(), ...s }); return P.bubbleSize(s); }; return P[k]; } });
  const bubble = document.getElementById('bubble'), said = document.getElementById('said'), working = document.getElementById('working');
  window.__s = []; window.__enter = []; window.__firstLit = 0;
  let wasEnter = bubble.classList.contains('enter');
  new MutationObserver(() => { const on = bubble.classList.contains('enter'); if (on !== wasEnter) window.__enter.push({ at: performance.now(), on }); wasEnter = on; }).observe(bubble, { attributes: true, attributeFilter: ['class'] });
  const lineOf = new Map();
  window.__rewraps = 0;
  setInterval(() => {
    const ws = [...said.querySelectorAll('span.w')];
    const lit = ws.filter((w) => !w.classList.contains('o'));
    if (lit.length && !window.__firstLit) window.__firstLit = performance.now();
    const b = bubble.getBoundingClientRect();
    const f = lit[0]?.getBoundingClientRect();
    // a word's line = its top inside the text; a lit word must never move to another line
    lit.forEach((w, i) => { const t = Math.round(w.offsetTop); if (!lineOf.has(i)) lineOf.set(i, { t, text: w.textContent }); else if (lineOf.get(i).text === w.textContent && Math.abs(lineOf.get(i).t - t) > 2) { window.__rewraps++; lineOf.set(i, { t, text: w.textContent }); } });
    window.__s.push({ at: performance.now(), hidden: bubble.hidden, dots: !working.hidden, words: lit.length, w: Math.round(b.width), h: Math.round(b.height),
      wide: bubble.classList.contains('wide'), widest: bubble.classList.contains('widest'), cw: bubble.style.getPropertyValue('--cw'),
      fx: f ? Math.round(f.left) : null, fy: f ? Math.round(f.top) : null });
  }, 16);
  return true;
})()`;

app.whenReady().then(async () => {
  mkdirSync(OUT, { recursive: true });
  // REPLY_FLOW_PAGES: run the same check against another copy of the pages (the before numbers).
  const pages = await servePages(process.env.REPLY_FLOW_PAGES || path.join(HERE, '..', '..', 'pages'));
  const w = new BrowserWindow({ width: W, height: H, show: false, frame: false, useContentSize: true,
    webPreferences: { preload: path.join(HERE, 'cockpit-stub.cjs'), contextIsolation: false, sandbox: false, offscreen: true } });
  w.webContents.setFrameRate(60);
  w.setPosition(-6000, 100); w.showInactive();
  const errors: string[] = [];
  w.webContents.on('console-message', (e) => { const m = e as unknown as { message?: string; level?: string }; if (m.level === 'error') { errors.push(String(m.message)); console.log('PAGE ERROR ' + String(m.message)); } });
  await w.loadURL(`${pages.origin}/bubble.html`);
  await wait(700);
  const js = (s: string) => w.webContents.executeJavaScript(s, true);
  const g = Number(await js(`parseFloat(getComputedStyle(document.getElementById('wrap')).marginRight) - 78`)) || 0;
  await js(`(() => {
    const st = new CSSStyleSheet(); st.replaceSync('html,body{background:#191b24 !important} .wrap{margin:0 ${W - (fx + 96) + g}px ${H - (fy + 80) + g}px 14px !important} .stg{position:fixed;pointer-events:none;image-rendering:pixelated}');
    document.adoptedStyleSheets = [st];
    const i = document.createElement('img'); i.src = ${JSON.stringify(SPRITE)}; i.className = 'stg'; i.style.left = '${fx}px'; i.style.top = '${fy}px'; document.body.append(i);
    window.__fire('onAim', { x: ${HEAD.x}, y: ${HEAD.y}, flip: false });
    return true; })()`);
  await js(PROBE);
  const frames: { name: string; png: Electron.NativeImage }[] = [];
  const shot = async (name: string) => { frames.push({ name, png: await w.webContents.capturePage({ x: 260, y: 60, width: W - 260, height: H - 60 }) }); };

  // ---- Enter: what he typed reaches the bubble at once (the Shell's `asked`), the brain's dots 15 ms later
  await shot('0-before');
  const t0 = Number(await js(`performance.now()`));
  console.log('asked: ' + await js(`(() => { try { window.__deliver({ t: 'asked', text: 'whats on my calendar tomorrow?' }); return 'ok'; } catch (e) { return String(e.stack); } })()`));
  await wait(15);
  await js(`window.__deliver({ t: 'bubble.dots', who: 'Smart' }); window.__deliver({ t: 'state', state: 'think' }); true`);
  await wait(120); await shot('1-enter+135ms');
  await wait(500); await shot('2-thinking');
  await wait(400);
  // ---- the answer streams: 40-60 ms apart, 2-4 words a chunk (about 60 words a second, a Sonnet's pace)
  const words = ANSWER.split(' ');
  let n = 3, chunks = 0;
  const tFirst = Number(await js(`performance.now()`));
  await js(`window.__deliver({ t: 'bubble', text: ${JSON.stringify(words.slice(0, n).join(' ') + ' ')}, stream: true, id: 's1', who: 'Smart' }); true`);
  await wait(60); await shot('3-first-chunk+60ms');
  while (n < words.length) {
    n = Math.min(words.length, n + 2 + (chunks % 3));
    chunks++;
    const text = words.slice(0, n).join(' ') + (n < words.length ? ' ' : '');
    await js(`window.__deliver({ t: 'bubble', text: ${JSON.stringify(text)}, stream: true, id: 's1', who: 'Smart' }); true`);
    await wait(40 + (chunks * 7) % 21);
    if (chunks === 8) await shot('4-streaming');
    if (chunks === 16) await shot('5-streaming');
  }
  const tLast = Number(await js(`performance.now()`));
  await js(`window.__deliver({ t: 'bubble', text: ${JSON.stringify(ANSWER)}, stream: false, id: 's1', who: 'Smart', turn: 41 }); window.__deliver({ t: 'state', state: 'idle' }); true`);
  await wait(250); await shot('6-finished');
  await wait(1500); await shot('7-settled');

  const r = await js(`({ s: window.__s, sizes: window.__sizes, enter: window.__enter, firstLit: window.__firstLit, rewraps: window.__rewraps,
    hiddenSent: window.__sent.filter((x) => x[0] === 'bubbleHidden').length, words: document.querySelectorAll('#said span.w').length,
    lit: document.querySelectorAll('#said span.w:not(.o)').length, more: !document.getElementById('more').hidden })`);
  const S = (r.s as any[]).filter((x) => x.at >= t0);
  const after = (t: number) => S.filter((x) => x.at >= t);

  // thinking
  const firstShown = S.find((x) => !x.hidden && x.dots);
  check('thinking shows on Enter (the dots, before the brain answers)', Boolean(firstShown) && firstShown.at - t0 < 60, firstShown ? `${Math.round(firstShown.at - t0)} ms` : 'never');
  const gap = S.filter((x) => x.at >= firstShown?.at && x.at <= tLast + 300).filter((x) => x.hidden || (!x.dots && x.words === 0));
  check('thinking -> answer is one bubble: never hidden, never empty between the dots and the words', gap.length === 0 && r.hiddenSent === 0, JSON.stringify(gap.slice(0, 3)));
  // first word
  const fl = r.firstLit - tFirst;
  check('first word painted within 100 ms of the first chunk', r.firstLit > 0 && fl < 100, `${Math.round(fl)} ms`);
  // width
  const firstText = after(r.firstLit);
  const widths = new Set(firstText.filter((x) => x.at <= tLast + 300).map((x) => `${x.wide}/${x.widest}/${x.cw}`));
  check('the width is decided at the first chunk and never changes while it streams', widths.size === 1, [...widths].join(' | '));
  check('no word he could see ever moved to another line (no rewrap)', r.rewraps === 0, `${r.rewraps} rewraps`);
  // height: only grows while it arrives (spring overshoot settles within 3 px)
  let shrink = 0, jump = 0, prev: any = null;
  const grown = firstText.filter((x) => x.at <= tLast + 300 && x.at >= r.firstLit + 600);
  for (const x of grown) { if (prev && x.h < prev.h - 3) shrink = Math.max(shrink, prev.h - x.h); prev = x; }
  check('the balloon only grows while the answer arrives', shrink === 0, `shrank ${shrink} px`);
  prev = null;
  for (const x of firstText.filter((y) => y.fy !== null)) { if (prev && prev.fy !== null) jump = Math.max(jump, Math.abs(x.fy - prev.fy), Math.abs(x.fx - prev.fx)); prev = x; }
  check('no word jumps: the first word moves at most a few px a frame (it rides the spring, it never teleports)', jump <= 14, `largest step ${jump} px`);
  // window
  const sz = (r.sizes as any[]).filter((x) => x.at >= tFirst && x.at <= tLast + 200);
  let minGap = Infinity; for (let i = 1; i < sz.length; i++) minGap = Math.min(minGap, sz[i].at - sz[i - 1].at);
  check('the window is resized at most every ~150 ms while it streams', sz.length <= 1 || minGap >= 140, `${sz.length} resizes, closest ${Math.round(minGap)} ms apart`);
  const reenter = (r.enter as any[]).filter((x) => x.at > tFirst && x.on).length;
  check('the finished reply does not blink: no fade-in restart after the first word', reenter === 0, `${reenter} restarts`);
  check('every word is shown at the end', r.lit === r.words && r.words > 30, `${r.lit}/${r.words}`);
  check('no page errors', errors.length === 0, errors.join(' | '));
  console.log(`numbers: Enter->dots ${firstShown ? Math.round(firstShown.at - t0) : '-'} ms, first chunk->first word ${Math.round(fl)} ms, window resizes while streaming ${sz.length} (streamed ${chunks + 1} chunks over ${Math.round(tLast - tFirst)} ms), last chunk->all words lit ${Math.round((S.find((x) => x.at > tLast && x.words >= r.words)?.at ?? NaN) - tLast)} ms`);

  // the strip, to look at
  for (const f of frames) writeFileSync(path.join(OUT, f.name + '.png'), f.png.toPNG());
  const sz0 = frames[0]!.png.getSize(), k = 0.5, fw = Math.round(sz0.width * k), fh = Math.round(sz0.height * k);
  const strip = Buffer.alloc(fw * frames.length * fh * 4);
  frames.forEach((f, i) => {
    const bm = f.png.resize({ width: fw, height: fh, quality: 'good' }).toBitmap();
    for (let y = 0; y < fh; y++) bm.copy(strip, (y * fw * frames.length + i * fw) * 4, y * fw * 4, (y + 1) * fw * 4);
  });
  writeFileSync(path.join(OUT, 'strip.png'), nativeImage.createFromBitmap(strip, { width: fw * frames.length, height: fh }).toPNG());
  console.log('strip: ' + path.join(OUT, 'strip.png'));
  w.destroy();
  console.log(bad ? `${bad} FAILED` : 'ALL PASS');
  app.exit(bad ? 1 : 0);
});
