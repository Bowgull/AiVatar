// Sheet 102 (2026-10-29, his "it's not very smooth, it's jumpy" and "does it remember anything I've typed"):
// Samara's real band and suggestion list at his screen's width (1920), filmed while a word is typed, then the same list
// redrawn bigger and steadier. Today's frames are Samara as it is; the "proposed" frames are drawn in with CSS and the
// DOM, nothing is built. Search guesses are held back by a gate so the two moments (his things, then the guesses) are
// caught exactly; the timing run lets them arrive like Brave's do (about 150 to 300 ms).
// Run: npx electron test/electron/typing-sheet-shot.ts <out-prefix>
import { app, BrowserWindow, screen } from 'electron';
import { mkdtempSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
process.on('uncaughtException', (e) => console.log('HARNESS NOTE ' + (e as Error).message));
process.on('unhandledRejection', (e) => { console.log('HARNESS REJECTION ' + String((e as Error)?.message ?? e)); app.exit(2); });
setTimeout(() => { console.log('HARNESS TIMEOUT'); app.exit(3); }, 200_000).unref();
const HERE = path.dirname(fileURLToPath(import.meta.url));
app.setPath('userData', mkdtempSync(path.join(os.tmpdir(), 'ts-ud-')));
app.commandLine.appendSwitch('disable-backgrounding-occluded-windows');
app.on('window-all-closed', () => {});
// His rule (2026-10-29): test windows never touch his main monitor or take his keyboard. They open see-through on the
// second monitor, never focused, with no Dock icon; letters are typed into the page itself, not through the system.
const away = () => { const d = screen.getAllDisplays().find((x) => x.id !== screen.getPrimaryDisplay().id); return d ? d.bounds : null; };
BrowserWindow.prototype.show = function (this: BrowserWindow) { const b = away(); if (b) this.setPosition(b.x + 20, b.y + 20); this.setOpacity(0); this.setFocusable(false); this.showInactive(); };
BrowserWindow.prototype.focus = function () {};
BrowserWindow.prototype.moveTop = function () {};
BrowserWindow.prototype.setAlwaysOnTop = function () {};
app.focus = () => {};
app.dock?.hide();
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const W = 1920, H = 1040;
const GUESS: Record<string, string[]> = {
  p: ['pinterest', 'paypal', 'pixel 10', 'prime video'],
  pi: ['pinterest', 'pizza near me', 'pixel 10', 'pickleball'],
  pix: ['pixel 10', 'pixel art', 'pixabay', 'pixel watch'],
  pixe: ['pixel 10', 'pixel art', 'pixel watch', 'pixel 11'],
  pixel: ['pixel 11', 'pixel art', 'pixel watch', 'pixel 10'],
};
app.whenReady().then(async () => {
  const out = process.argv[process.argv.length - 1];
  const { servePages } = await import('../../src/pageserver.ts');
  const { AangBrowser } = await import('../../src/browser.ts');
  const { wireBrowser } = await import('../../src/browseripc.ts');
  const pages = await servePages(path.join(HERE, '..', '..', 'pages'));
  const P = (f: string) => path.join(HERE, '..', '..', 'src', f);
  const b: any = new AangBrowser({ origin: pages.origin, preloadPath: P('preload.cjs'), tabPreloadPath: P('tabpreload.cjs'), settingsPreloadPath: P('settingspreload.cjs'), thingsPreloadPath: P('thingspreload.cjs'), stateDir: mkdtempSync(path.join(os.tmpdir(), 'ts-s-')) });
  wireBrowser(() => b);
  b.visits.add('https://en.wikipedia.org/wiki/Pixel_art', 'Pixel art - Wikipedia');
  b.visits.add('https://www.reddit.com/r/PixelArt/', 'r/PixelArt');
  b.visits.add('https://search.brave.com/search?q=pixel+art+tutorial', 'pixel art tutorial - Brave Search');
  b.visits.add('https://www.reddit.com/', 'Reddit - The heart of the internet');
  b.open('https://en.wikipedia.org/wiki/Pixel_art');
  for (let i = 0; i < 100 && !b.win; i++) await wait(150);
  b.win.setContentSize(W, H);
  await wait(6000);
  const fw = b.win.webContents;
  // How long the still picture of the page takes each time the list opens (the page is swapped for it).
  const shotOf = b.shotOf.bind(b);
  const shotMs: number[] = [];
  b.shotOf = async (t: unknown) => { const t0 = performance.now(); const r = await shotOf(t); shotMs.push(Math.round(performance.now() - t0)); return r; };
  // The guesses: a gate for the frames, Brave-like delays for the timing run.
  let gate: (() => void) | null = null, held = false, lag = () => 150 + Math.random() * 150;
  b.guesses = async (text: string) => {
    if (held) await new Promise<void>((r) => { gate = r; });
    else await wait(lag());
    return GUESS[text.trim()] ?? [];
  };
  const crop = (h = 420) => ({ x: 0, y: 0, width: W, height: h });
  const shot = async (name: string, h?: number) => writeFileSync(`${out}-${name}.png`, (await fw.capturePage(crop(h))).toPNG());
  const key = (k: string) => fw.executeJavaScript(`(() => { const e = document.getElementById('edit'); e.value += ${JSON.stringify(k)}; e.setSelectionRange(e.value.length, e.value.length); e.dispatchEvent(new InputEvent('input', { inputType: 'insertText', data: ${JSON.stringify(k)} })); return 1; })()`);
  const clear = async () => { await fw.executeJavaScript(`(() => { const ed = document.getElementById('edit'); ed.value = ''; ed.dispatchEvent(new Event('input')); return 1; })()`); await wait(250); };
  const openBar = async () => { await fw.executeJavaScript(`(() => { const e = document.getElementById('edit'); if (e.hidden) document.getElementById('slot').click(); e.focus(); return 1; })()`); await wait(400); };

  // 0 at rest, the whole window, and the bar's own size
  await shot('rest', 90);
  const restW = await fw.executeJavaScript(`Math.round(document.getElementById('slot').getBoundingClientRect().width)`);
  // before sheet 88: the bar took all the wood between the keys
  { const k = await fw.insertCSS('.band .slot{max-width:none !important;transition:none !important}'); await wait(300); await shot('before', 90);
    var beforeW = await fw.executeJavaScript(`Math.round(document.getElementById('slot').getBoundingClientRect().width)`); await fw.removeInsertedCSS(k); await wait(300); }

  // 1 the timing run: "pixel" at a steady 120 ms a letter, every change in the list's height written down
  await openBar();
  await clear();
  await wait(300);
  await fw.executeJavaScript(`(() => { window.__log = []; const s = document.getElementById('suggest'), t0 = performance.now();
    window.__t0 = t0; let last = -1, lastN = -1;
    const look = () => { const h = s.hidden ? 0 : Math.round(s.getBoundingClientRect().height); const n = s.hidden ? 0 : s.children.length;
      if (h !== last || n !== lastN) { window.__log.push([Math.round(performance.now() - t0), h, n]); last = h; lastN = n; }
      if (performance.now() - t0 < 3000) requestAnimationFrame(look); };
    requestAnimationFrame(look); document.getElementById('edit').addEventListener('input', () => window.__log.push([Math.round(performance.now() - t0), 'key'])); return 1; })()`);
  for (const k of 'pixel') { key(k); await wait(120); }
  await wait(2600);
  const log = await fw.executeJavaScript('window.__log');
  const editW = await fw.executeJavaScript(`Math.round(document.getElementById('slot').getBoundingClientRect().width)`);

  // 2 the jump caught: after "pix", his own things alone, then the guesses landing under them
  await openBar();
  await clear();
  held = true;
  for (const k of 'pix') { key(k); await wait(60); }
  await wait(500);
  await shot('jump-a');
  gate?.(); await wait(400);
  await shot('jump-b');
  // the next letter wipes the guesses: caught before they come back
  key('e'); await wait(400);
  await shot('jump-c');
  gate?.(); held = false; await wait(400);

  // 3 the bar's slide while he clicks in: four moments of the 0.24 s stretch
  await fw.executeJavaScript(`document.getElementById('edit').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); 1`);
  await fw.executeJavaScript(`document.getElementById('edit').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); 1`);
  await wait(600);
  const slide: number[] = await fw.executeJavaScript(`(async () => { const s = document.getElementById('slot'); const w = []; s.click();
    const t0 = performance.now(); while (performance.now() - t0 < 320) { w.push([Math.round(performance.now() - t0), Math.round(s.getBoundingClientRect().width)]); await new Promise(requestAnimationFrame); } return w; })()`);

  // 4 proposed: drawn in. Wider at rest and while typing, bigger words, taller rows, the sites' own icons, a clock for
  // his past searches, and the list held at its full height while he types (empty slots stay, nothing jumps).
  const PROPOSED = `
    .band .slot{max-width:1000px !important}
    .band .slot.editing{max-width:1280px !important}
    .slot .url,.slot .edit{font-size:15px !important}
    .suggest{padding:6px 0 8px !important}
    .suggest .srow{height:40px !important;gap:12px !important;padding:0 14px !important}
    .suggest .st{font-size:15px !important;max-width:60% !important}
    .suggest .su{font-size:13px !important;color:#7f739f !important}
    .suggest .sa{font-size:13px !important}
    .suggest .sg{flex:0 0 20px !important}
    .suggest .sg img{width:16px;height:16px;image-rendering:auto;display:block}
    .suggest .srow.slot-empty{pointer-events:none}
    .suggest .srow.slot-empty *{visibility:hidden}
    .suggest .gl{height:2px;margin:4px 14px;background:#241a3a}`;
  const css = await fw.insertCSS(PROPOSED);
  const dress = (opts: { past?: string[]; hold?: number }) => `(() => {
    const sbox = document.getElementById('suggest'); const rows = [...sbox.querySelectorAll('.srow')];
    const glass = rows[0]?.querySelector('.sg')?.innerHTML ?? '';
    const CLOCK = '<svg viewBox="0 0 7 7" width="14" height="14" shape-rendering="crispEdges"><path d="M1 0h5v1H1zM0 1h1v5H0zM6 1h1v5H6zM3 1h1v3H3zM4 3h1v1H4zM1 6h5v1H1z"/></svg>';
    const ICON = { 'en.wikipedia.org': 'https://en.wikipedia.org/static/favicon/wikipedia.ico', 'reddit.com': 'https://www.redditstatic.com/shreddit/assets/favicon/64x64.png' };
    let firstGuess = -1;
    // a past search is one clock row, never a "... - Brave Search" page
    for (const r of rows) if (/ - Brave Search$/.test(r.querySelector('.st')?.textContent ?? '')) r.remove();
    rows.splice(0, rows.length, ...sbox.querySelectorAll('.srow'));
    rows.forEach((r, i) => {
      const su = r.querySelector('.su')?.textContent ?? '';
      const host = Object.keys(ICON).find((h) => su.includes(h));
      if (host) r.querySelector('.sg').innerHTML = '<img src="' + ICON[host] + '" alt="">';
      if (r.querySelector('.sa')?.textContent === 'Search' && i > 0 && firstGuess < 0) firstGuess = i;
    });
    // His past searches (drawn in): a clock, his words, "Search", above the engine's guesses
    const past = ${JSON.stringify(opts.past ?? [])};
    const at = firstGuess > 0 ? rows[firstGuess] : null;
    const after = rows[1] ?? null;
    for (const p of past) {
      const r = document.createElement('div'); r.className = 'srow'; r.innerHTML = '<span class="sg">' + CLOCK + '</span><span class="st"></span><span class="sa">Search</span>';
      r.querySelector('.st').innerHTML = p; sbox.insertBefore(r, after);
    }
    if (at) sbox.insertBefore(Object.assign(document.createElement('div'), { className: 'gl' }), at);
    // Held height: empty slots keep the list as tall as its fullest moment
    const n = sbox.querySelectorAll('.srow').length;
    for (let i = n; i < ${opts.hold ?? 0}; i++) { const r = document.createElement('div'); r.className = 'srow slot-empty'; r.innerHTML = '<span class="st">.</span>'; sbox.append(r); }
    sbox.querySelectorAll('.srow .sg svg path').forEach((p) => p.closest('.srow').classList.contains('on') || 0);
    const s = document.getElementById('slot').getBoundingClientRect(), band = document.getElementById('band').getBoundingClientRect();
    sbox.style.left = Math.round(s.left - band.left) + 'px'; sbox.style.width = Math.round(s.width) + 'px';
    return n; })()`;
  await clear();
  held = true;
  for (const k of 'pix') { key(k); await wait(60); }
  await wait(600);
  await fw.executeJavaScript(dress({ past: ['<span>pix</span><b>el art tutorial</b>'], hold: 9 }));
  await wait(400);
  await shot('new-a', 520);
  gate?.(); await wait(500);
  await fw.executeJavaScript(dress({ past: ['<span>pix</span><b>el art tutorial</b>'], hold: 9 }));
  await wait(400);
  await shot('new-b', 520);
  // On click, before a letter: his recent searches and most-visited, so the bar remembers him straight away
  await clear();
  gate?.(); held = false;
  await fw.executeJavaScript(`(() => {
    const sbox = document.getElementById('suggest'); sbox.hidden = false; document.getElementById('slot').classList.add('open');
    const CLOCK = '<svg viewBox="0 0 7 7" width="14" height="14" shape-rendering="crispEdges"><path d="M1 0h5v1H1zM0 1h1v5H0zM6 1h1v5H6zM3 1h1v3H3zM4 3h1v1H4zM1 6h5v1H1z"/></svg>';
    const rows = [['c','pixel art tutorial','',  'Search'], ['c','valheim ashlands map','', 'Search'], ['c','weather tomorrow','', 'Search'],
      ['i:https://www.redditstatic.com/shreddit/assets/favicon/64x64.png','Reddit','reddit.com','Open'], ['i:https://en.wikipedia.org/static/favicon/wikipedia.ico','Pixel art - Wikipedia','en.wikipedia.org/wiki/Pixel_art','Open'],
      ['i:https://www.youtube.com/favicon.ico','YouTube','youtube.com','Open']];
    sbox.replaceChildren(...rows.map(([ic, t, u, a], i) => { const r = document.createElement('div'); r.className = 'srow' + (i === 0 ? ' on' : '');
      r.innerHTML = '<span class="sg">' + (ic === 'c' ? CLOCK : '<img src="' + ic.slice(2) + '" alt="">') + '</span><span class="st"></span>' + (u ? '<span class="su"></span>' : '') + '<span class="sa"></span>';
      r.querySelector('.st').textContent = t; if (u) r.querySelector('.su').textContent = u; r.querySelector('.sa').textContent = a; return r; }));
    sbox.insertBefore(Object.assign(document.createElement('div'), { className: 'gl' }), sbox.children[3]);
    const s = document.getElementById('slot').getBoundingClientRect(), band = document.getElementById('band').getBoundingClientRect();
    sbox.style.left = Math.round(s.left - band.left) + 'px'; sbox.style.width = Math.round(s.width) + 'px'; sbox.style.top = Math.round(s.bottom - band.top) + 'px';
    return 1; })()`);
  await wait(900);
  await shot('new-zero', 420);
  // At rest with the proposed width
  await fw.executeJavaScript(`document.getElementById('edit').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); 1`);
  await fw.executeJavaScript(`document.getElementById('edit').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); 1`);
  await fw.executeJavaScript(`document.getElementById('edit').blur(); 1`);
  await wait(700);
  await shot('new-rest', 90);
  const newRest = await fw.executeJavaScript(`Math.round(document.getElementById('slot').getBoundingClientRect().width)`);
  await fw.removeInsertedCSS(css);
  writeFileSync(`${out}-numbers.json`, JSON.stringify({ window: W, beforeW, restW, editW, newRest, log, slide, shotMs }, null, 1));
  console.log('DONE', JSON.stringify({ restW, editW, newRest, shotMs }));
  app.exit(0);
});
