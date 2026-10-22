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
  // 2026-10-21 (his report): the bubble's width is set ONCE per exchange. Opening gives the window one width (it went
  // 287 -> 466 -> 416), and the long answer above never changed width from thinking to the end.
  const openSizes = (r.sizes as any[]).filter((x) => x.at >= t0 && x.at < tFirst);
  check('opening: the window is given one width (no 287 -> 466 -> 416)', new Set(openSizes.map((x) => x.width)).size <= 1, openSizes.map((x) => `${x.width}x${x.height}`).join(' '));
  const shown1 = S.filter((x) => !x.hidden && x.at >= (firstShown?.at ?? t0) + 600 && x.at <= tLast + 1500);
  check('one width from thinking to the end of the answer', new Set(shown1.map((x) => x.w)).size === 1, [...new Set(shown1.map((x) => x.w))].join(' -> '));

  // Thinking -> a SHORT answer: his "Clear, cool, calm." Each starts from a closed bubble. Whole, streamed, and small talk.
  const shortFrames: { name: string; png: Electron.NativeImage }[] = [];
  const exchange = async (name: string, question: string, lane: string, parts: string[], whole: string) => {
    await js(`window.__deliver({ t: 'bubble.clear' }); true`); await wait(500);
    const a = Number(await js(`performance.now()`));
    await js(`window.__deliver({ t: 'asked', text: ${JSON.stringify(question)} }); true`);
    await wait(15);
    await js(`window.__deliver({ t: 'bubble.dots', who: ${JSON.stringify(lane)} }); window.__deliver({ t: 'state', state: 'think' }); true`);
    await wait(700);
    shortFrames.push({ name: name + '-thinking', png: await w.webContents.capturePage({ x: 260, y: 60, width: W - 260, height: H - 60 }) });
    const b = Number(await js(`performance.now()`));
    for (const p of parts) { await js(`window.__deliver({ t: 'bubble', text: ${JSON.stringify(p)}, stream: true, id: ${JSON.stringify(name)}, who: ${JSON.stringify(lane)} }); true`); await wait(50); }
    await js(`window.__deliver({ t: 'bubble', text: ${JSON.stringify(whole)}, stream: false, id: ${JSON.stringify(name)}, who: ${JSON.stringify(lane)} }); window.__deliver({ t: 'state', state: 'idle' }); true`);
    await wait(1400);
    shortFrames.push({ name: name + '-answer', png: await w.webContents.capturePage({ x: 260, y: 60, width: W - 260, height: H - 60 }) });
    const q = await js(`({ s: window.__s, sizes: window.__sizes, lit: document.querySelectorAll('#said span.w:not(.o)').length })`);
    const seen = (q.s as any[]).filter((x) => x.at >= a && !x.hidden);
    const settled = seen.filter((x) => x.at >= a + 600);
    const widths = [...new Set(settled.map((x) => x.w))];
    const opening = (q.sizes as any[]).filter((x) => x.at >= a && x.at < b);
    const all = (q.sizes as any[]).filter((x) => x.at >= a);
    // the balloon's width frame to frame once it is open: never a step bigger than a glide makes
    let step = 0, prevW: number | null = null;
    for (const x of settled) { if (prevW !== null) step = Math.max(step, Math.abs(x.w - prevW)); prevW = x.w; }
    console.log(`${name}: balloon widths after opening ${widths.join(' -> ')}; window sizes ${all.map((x) => `${x.width}x${x.height}`).join(' ')}`);
    return { widths, opening, all, step, lit: q.lit, b };
  };
  const whole = await exchange('whole', 'describe yourself in three words', 'Smart', [], 'Clear, cool, calm.');
  check('thinking -> short whole answer: no width snap (one balloon width throughout)', whole.widths.length === 1, whole.widths.join(' -> '));
  check('...opening gives the window one width', new Set(whole.opening.map((x: any) => x.width)).size <= 1, whole.opening.map((x: any) => x.width).join(' '));
  check('...the window keeps one width for the whole exchange', new Set(whole.all.map((x: any) => x.width)).size <= 1, whole.all.map((x: any) => x.width).join(' '));
  check('...the answer is shown', whole.lit === 3, `${whole.lit} words`);
  const streamed = await exchange('streamed', 'describe yourself in three words', 'Smart', ['Clear, ', 'Clear, cool, ', 'Clear, cool, calm.'], 'Clear, cool, calm.');
  check('thinking -> short STREAMED answer: no width snap at the end', streamed.widths.length === 1, streamed.widths.join(' -> '));
  check('...the window keeps one width for the whole exchange', new Set(streamed.all.map((x: any) => x.width)).size <= 1, streamed.all.map((x: any) => x.width).join(' '));
  const small = await exchange('smalltalk', 'hey buddy', 'Quick', ['Hey! ', 'Hey! Good to see you.'], 'Hey! Good to see you.');
  check('small talk: opens narrow and stays narrow (one width)', small.widths.length === 1 && small.widths[0]! < 300, small.widths.join(' -> '));
  check('no frame-to-frame width jump bigger than a glide step in any of them', Math.max(whole.step, streamed.step, small.step) <= 60, `${whole.step}/${streamed.step}/${small.step} px`);
  {
    const sz1 = shortFrames[0]!.png.getSize(), k1 = 0.5, fw1 = Math.round(sz1.width * k1), fh1 = Math.round(sz1.height * k1);
    const st = Buffer.alloc(fw1 * shortFrames.length * fh1 * 4);
    shortFrames.forEach((f, i) => {
      const bm = f.png.resize({ width: fw1, height: fh1, quality: 'good' }).toBitmap();
      for (let y = 0; y < fh1; y++) bm.copy(st, (y * fw1 * shortFrames.length + i * fw1) * 4, y * fw1 * 4, (y + 1) * fw1 * 4);
    });
    writeFileSync(path.join(OUT, 'short-strip.png'), nativeImage.createFromBitmap(st, { width: fw1 * shortFrames.length, height: fh1 }).toPNG());
    console.log('short strip: ' + path.join(OUT, 'short-strip.png'));
  }
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
