// Sheet 98 (2026-10-27, his interview after sheet 97): the top bar rethought and the notices reworked, on Samara itself.
// His picks: the lantern is the crest at the far left; options for the empty wood, the address bar's shape and how the
// lantern's menu opens; watching Claude, no words, a soft glow round the address bar that breathes, in the rune's colour,
// Stop in the rune; notices and Claude's asks one family, coloured as the rune (teal done, blue needs you, red went
// wrong), a sound only for needs-you, one at a time with a count, done ones stay until dismissed; places and feels shown.
// Not built: styles and pieces laid on for the picture. Run: npx electron test/electron/sheet98-shot.ts <out-prefix>
import { app, BrowserWindow, screen } from 'electron';
import http from 'node:http';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
process.on('uncaughtException', (e) => console.log('HARNESS NOTE ' + String((e as Error)?.message ?? e).split('\n')[0]));
process.on('unhandledRejection', (e) => { console.log('HARNESS REJECTION ' + String((e as Error)?.stack ?? e)); app.exit(2); });
setTimeout(() => { console.log('HARNESS TIMEOUT'); app.exit(3); }, 290_000).unref();
const HERE = path.dirname(fileURLToPath(import.meta.url));
app.setPath('userData', mkdtempSync(path.join(os.tmpdir(), 's98-ud-')));
app.commandLine.appendSwitch('disable-backgrounding-occluded-windows');
app.on('window-all-closed', () => {});
BrowserWindow.prototype.show = function (this: BrowserWindow) { this.setOpacity(0); this.showInactive(); };
BrowserWindow.prototype.focus = function () {};
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const ART = readFileSync(path.join(HERE, '..', '..', '..', '..', 'docs', 'cockpit', 'sheet-97', 'art.js'), 'utf8').replace(/export /g, '');
const PAGE = (t: string, c: string) => `<!doctype html><title>${t}</title><body style="margin:0;font:18px Georgia,serif;background:#f6f3ee;color:#222">
  <div style="height:56px;background:${c}"></div><div style="padding:30px 60px"><h1 style="margin:0 0 12px">${t}</h1>
  <p style="max-width:640px;line-height:1.6;color:#555">${'Battery, weight, screen, keyboard and price, side by side. '.repeat(4)}</p></div></body>`;
const SITES: Record<string, [string, string]> = { '/': ['Weekend plans', '#5a7a4a'], '/l1': ['ThinkPad X1 Carbon', '#c0392b'], '/l2': ['MacBook Air M4', '#6c6c70'], '/l3': ['Framework Laptop 13', '#2b2b2b'] };
const CV = `const cv = (w, h, s = 2) => { const c = document.createElement('canvas'); c.width = w * s; c.height = h * s; c.style.cssText = 'display:block;flex:none;image-rendering:pixelated'; const g = c.getContext('2d'); return [c, (x, y, col) => { g.fillStyle = col; g.fillRect(x * s, y * s, s, s); }]; };`;
// The plank (sheet 96 v2): the wood at its true 2x, the keys carved with the plum kept, raised (lit top-left).
const PLANK = `.band{height:66px !important;background-size:128px 52px !important;background-position:0 14px !important}
  .band::before{background-size:128px 52px !important}
  .band .rnd:not(.menukey):not(.upkey){border-radius:6px !important;border:2px solid #120A05 !important;background:#4A2C6E !important;box-shadow:inset 2px 2px 0 #7a5aa8,inset -2px -2px 0 #2C1848,0 2px 0 #120A05 !important}
  .band .menukey{display:none !important} #runeslot{display:none !important}
  #crest97{all:unset;flex:none;width:40px;height:40px;display:grid;place-items:center;cursor:pointer;margin-right:4px}`;
// The lantern as the crest, first in the bar.
const CREST_JS = `(() => { ${ART} ${CV} if (document.getElementById('crest97')) return 1;
  const b = document.createElement('button'); b.id = 'crest97'; b.type = 'button'; const [c, P] = cv(18, 18); lantern(P); b.append(c);
  document.getElementById('back').before(b); return 1; })()`;
const SLIM = `.band{height:60px !important;background-position:0 8px !important;padding-top:8px !important} .band::before{height:8px !important}`;
const WIDE = `.band .slot{max-width:1060px !important}`;
const SITES_JS = `(() => { if (document.getElementById('pins97')) return 1; const box = document.createElement('div'); box.id = 'pins97';
  Object.assign(box.style, { display: 'flex', gap: '7px', marginLeft: '10px', paddingLeft: '12px', borderLeft: '2px solid rgba(18,10,5,.55)', boxShadow: 'inset 2px 0 0 rgba(255,224,150,.14)' });
  for (const u of ['https://www.youtube.com/favicon.ico', 'https://web.stremio.com/favicon.ico', 'https://www.twitch.tv/favicon.ico']) { const k = document.createElement('button'); k.className = 'rnd'; k.type = 'button';
    const i = new Image(); i.src = u; i.width = 16; i.height = 16; i.style.display = 'block'; k.append(i); box.append(k); }
  document.getElementById('reload').after(box); return 1; })()`;
const RADIUS = (r: number) => `.band .slot{border-radius:${r}px !important}`;
// The menu dropping from the crest: the real menu, opened, hung under the lantern.
const MENU_JS = `(() => { const m = document.getElementById('menu'); m.hidden = false; m.classList.add('ov97'); m.style.left = '8px'; m.style.right = 'auto'; return 1; })()`;
// Watching Claude's page: no words; a soft glow round the address bar in the rune's colour (the breathing's brightest
// moment); the rune at the bar's end.
const GLOW_JS = (col: string, state: string) => `(() => { ${ART} ${CV}
  const slot = document.getElementById('slot'); document.getElementById('r98')?.remove();
  const [rc, rp] = cv(18, 18); rune(rp, 0, 0, '${state}', ${state === 'needs' ? 1 : 0.4}); rc.id = 'r98'; rc.style.margin = '-5px 0 -5px 2px'; slot.append(rc);
  slot.style.boxShadow = 'inset 0 4px 0 rgba(0,0,0,.7), 0 0 10px 2px ${col}cc, 0 0 26px 6px ${col}66'; return 1; })()`;
const NOWHO = `#who{display:none !important}`;
// ---- notices: one family. Kind colours are the rune's: teal done, blue needs you, red went wrong.
const KIND: Record<string, { mark: string; deep: string; word: string }> = { done: { mark: '#3fc4b4', deep: '#1f7f74', word: 'Done' }, needs: { mark: '#7cc4ff', deep: '#1f6fb0', word: 'Needs your OK' }, wrong: { mark: '#ff8a78', deep: '#a8382a', word: 'Went wrong' } };
const ICON: Record<string, string[]> = {
  done: ['......#..', '.....##..', '#...##...', '##.##....', '.###.....', '..#......', '.........', '.........', '.........'].map((r) => r),
  needs: ['.........', '.........', '.###.....', '##.##....', '#...#####', '##.##.#.#', '.###..#.#', '.........', '.........'],
  wrong: ['.........', '.#.....#.', '..#...#..', '...#.#...', '....#....', '...#.#...', '..#...#..', '.#.....#.', '.........'],
};
type Notice = { kind: 'done' | 'needs' | 'wrong'; claude?: boolean; q: string; m: string; keys: [string, string?]; count?: string };
const N_DONE: Notice = { kind: 'done', q: 'Saved to Downloads', m: '<b>tax-form.pdf</b> is in your Downloads folder.', keys: ['Got it'], count: '1 of 3' };
const N_NEEDS: Notice = { kind: 'needs', claude: true, q: 'Claude wants to open the checkout', m: '<b>Compare laptops</b> is on <b>bestbuy.ca</b>. It will only look at the price with tax.', keys: ['Allow once', 'No'], count: '2 of 3' };
const N_WRONG: Notice = { kind: 'wrong', q: "The TV didn't answer", m: 'Check that it is on, then try <b>Send to TV</b> again.', keys: ['Try again', 'Got it'], count: '3 of 3' };
// Feel 1: the parchment that hangs from the band (sheet 86's family, the real .bandchip.kind), at `where`.
const HANG_JS = (n: Notice, where: 'left' | 'mid' | 'right') => `(() => { ${ART} ${CV}
  document.getElementById('n98')?.remove();
  const K = ${JSON.stringify(KIND)}[${JSON.stringify(n.kind)}], I = ${JSON.stringify(ICON)}[${JSON.stringify(n.kind)}];
  const a = document.getElementById('tvchip').cloneNode(true); a.id = 'n98'; a.hidden = false; a.classList.remove('k-tv'); a.classList.add('ov97'); a.style.setProperty('--kc', K.deep);
  for (const e of a.querySelectorAll('[id]')) e.removeAttribute('id');
  const tag = a.querySelector('.tag'); tag.textContent = ''; const [ic, IP] = cv(9, 9); I.forEach((r, y) => [...r].forEach((ch, x) => { if (ch === '#') IP(x, y, K.mark); })); tag.append(ic, K.word);
  ${n.count ? `const ct = document.createElement('span'); ct.textContent = ${JSON.stringify(n.count)}; ct.style.cssText = 'float:right;font:400 10px Silkscreen,monospace;letter-spacing:1px;color:#6b5132;margin-top:5px'; tag.after(ct);` : ''}
  const faces = a.querySelector('.faces'); faces.replaceChildren();
  ${n.claude ? `const f = document.createElement('span'); f.className = 'face'; const [rc, RP] = cv(12, 12); rune(RP, 0, 0, 'needs', 1, false); f.append(rc); faces.append(f);` : `faces.remove();`}
  const q2 = a.querySelector('.q2'); q2.lastElementChild.textContent = ${JSON.stringify(n.q)};
  a.querySelector('.m').innerHTML = ${JSON.stringify(n.m)};
  const ks = a.querySelectorAll('.keys button'); ks[0].firstElementChild.textContent = ${JSON.stringify(n.keys[0])};
  ${n.keys[1] ? `ks[1].firstElementChild.textContent = ${JSON.stringify(n.keys[1])};` : `ks[1].remove(); ks[0].querySelector('.k').textContent = 'A';`}
  ${n.kind === 'done' ? `ks[0].classList.remove('primary');` : ''}
  const band = document.getElementById('band').getBoundingClientRect(); a.style.width = '330px';
  const anchor = ${where === 'left' ? "document.getElementById('crest97')" : where === 'mid' ? "document.getElementById('slot')" : "document.getElementById('wmin')"}.getBoundingClientRect();
  a.style.left = Math.round(${where === 'left' ? 'anchor.left - band.left - 6' : where === 'mid' ? '(anchor.left + anchor.right) / 2 - band.left - 179' : 'anchor.right - band.left - 330'}) + 'px';
  document.getElementById('band').append(a); return 1; })()`;
// Feel 2: a game text box at the bottom of the window: the menu's own wood frame round the asks' parchment, a portrait
// on the left (the kind's icon, or the rune for Claude), the words, the keys at its right.
const BOX_JS = (n: Notice) => `(() => { ${ART} ${CV}
  document.getElementById('n98')?.remove();
  const K = ${JSON.stringify(KIND)}[${JSON.stringify(n.kind)}], I = ${JSON.stringify(ICON)}[${JSON.stringify(n.kind)}];
  const box = document.createElement('div'); box.id = 'n98'; box.className = 'ov97';
  box.style.cssText = 'position:fixed;left:50%;bottom:22px;transform:translateX(-50%);width:620px;z-index:60;display:flex;gap:14px;align-items:center;padding:12px 16px 12px 12px;border-style:solid;border-width:8px;border-image:url(art/browser/trayframe.png) 4 repeat;image-rendering:pixelated;background:linear-gradient(180deg,#F0DCB4,#DEC28C);color:#271c10;box-shadow:0 8px 0 rgba(0,0,0,.4),0 18px 30px rgba(0,0,0,.45)';
  const face = document.createElement('div'); face.style.cssText = 'flex:none;width:56px;height:56px;border-radius:8px;border:2px solid #120A05;display:grid;place-items:center;background:linear-gradient(rgba(0,0,0,.55),rgba(0,0,0,.55)),url(art/browser/tray.png) 0 0/128px 256px;box-shadow:inset 0 0 0 2px ' + K.deep;
  ${n.claude ? `const [rc, RP] = cv(18, 18); rune(RP, 0, 0, 'needs', 1); face.append(rc);` : `const [ic, IP] = cv(9, 9, 4); I.forEach((r, y) => [...r].forEach((ch, x) => { if (ch === '#') IP(x, y, K.mark); })); face.append(ic);`}
  const mid = document.createElement('div'); mid.style.cssText = 'flex:1;min-width:0';
  const top = document.createElement('div'); top.style.cssText = 'display:flex;align-items:center;gap:8px;font:400 10px Silkscreen,monospace;letter-spacing:1.2px;color:' + K.deep;
  top.textContent = ${JSON.stringify((n.claude ? 'CLAUDE · ' : '') + KIND[n.kind].word.toUpperCase())};
  ${n.count ? `const ct = document.createElement('span'); ct.textContent = ${JSON.stringify(n.count)}; ct.style.cssText = 'margin-left:auto;color:#6b5132'; top.append(ct);` : ''}
  const q = document.createElement('div'); q.style.cssText = 'font:800 15px Figtree,sans-serif;margin:3px 0 2px'; q.textContent = ${JSON.stringify(n.q)};
  const m = document.createElement('div'); m.style.cssText = 'font:500 13px/1.4 Figtree,sans-serif;color:#4e3d28'; m.innerHTML = ${JSON.stringify(n.m)};
  mid.append(top, q, m);
  const keys = document.createElement('div'); keys.style.cssText = 'display:flex;flex-direction:column;gap:6px;flex:none';
  const src = document.querySelector('#tvchip .keys');
  ${JSON.stringify(n.keys)}.filter(Boolean).forEach((t, i) => { const k = src.children[Math.min(i, 1)].cloneNode(true); k.removeAttribute('id'); k.firstElementChild.textContent = t; k.querySelector('.k').textContent = i ? 'Z' : 'A'; if (${JSON.stringify(n.kind)} === 'done') k.classList.remove('primary'); keys.append(k); });
  box.append(face, mid, keys); document.body.append(box); return 1; })()`;
app.whenReady().then(async () => {
  (screen as any).getCursorScreenPoint = () => ({ x: -20000, y: 500 });
  const out = process.argv[process.argv.length - 1];
  const site = http.createServer((q, r) => { const s = SITES[q.url ?? '/'] ?? SITES['/']; r.writeHead(200, { 'Content-Type': 'text/html' }).end(PAGE(s[0], s[1])); });
  await new Promise<void>((r) => site.listen(0, '127.0.0.1', () => r()));
  const port = (site.address() as { port: number }).port, U = (p: string) => `http://127.0.0.1:${port}${p}`;
  const { servePages } = await import('../../src/pageserver.ts');
  const { AangBrowser } = await import('../../src/browser.ts');
  const { wireBrowser } = await import('../../src/browseripc.ts');
  const pages = await servePages(path.join(HERE, '..', '..', 'pages'));
  const P = (f: string) => path.join(HERE, '..', '..', 'src', f);
  const b: any = new AangBrowser({ origin: pages.origin, preloadPath: P('preload.cjs'), tabPreloadPath: P('tabpreload.cjs'), settingsPreloadPath: P('settingspreload.cjs'), thingsPreloadPath: P('thingspreload.cjs'), stateDir: mkdtempSync(path.join(os.tmpdir(), 's98-st-')), testLocal: true });
  wireBrowser(() => b);
  b.open(U('/'));
  for (let i = 0; i < 100 && !b.win; i++) await wait(150);
  b.win.setContentSize(1440, 860);
  await wait(5000);
  const s = await b.drive('start', { kind: 'claude', name: 'Compare laptops' });
  const opened: any[] = [];
  for (const p of ['/l1', '/l2', '/l3']) { opened.push(await b.drive('open', { job: s.job, url: U(p) })); await wait(700); }
  b.driver.job(s.job).working = true; b.driverAct('noop', 0);
  await wait(1500);
  const fw = b.win.webContents;
  // The frame, the page under it, and the boxes laid over the page (pasted back on top: a page is drawn above the frame).
  const frame = async (name: string) => {
    await fw.executeJavaScript(`document.activeElement?.blur(); 1`); await wait(300);
    writeFileSync(`${out}-${name}-frame.png`, (await fw.capturePage()).toPNG());
    const v = b.cur()?.view; if (v) { const r = v.getBounds(); writeFileSync(`${out}-${name}-page.png`, (await v.webContents.capturePage()).toPNG()); writeFileSync(`${out}-${name}-at.json`, JSON.stringify(r)); }
    const ov = await fw.executeJavaScript(`JSON.stringify([...document.querySelectorAll('.ov97')].map((e) => { const q = e.getBoundingClientRect(); return [Math.round(q.left), Math.round(q.top), Math.round(q.width), Math.round(q.height)]; }))`);
    writeFileSync(`${out}-${name}-ov.json`, ov); console.log('SHOT ' + name + ' ' + ov);
  };
  const css = async (c: string) => fw.insertCSS(c);
  const js = async (c: string) => fw.executeJavaScript(c);
  await frame('today');
  const k0 = await css(PLANK); await js(CREST_JS); await wait(500);
  await frame('crest');
  let k = await css(SLIM); await wait(500); await frame('wood-slim'); await fw.removeInsertedCSS(k);
  await js(SITES_JS); await wait(1800); await frame('wood-sites'); await js(`document.getElementById('pins97')?.remove(); 1`);
  k = await css(WIDE); await wait(500); await frame('wood-wide'); await fw.removeInsertedCSS(k);
  k = await css(RADIUS(14)); await wait(300); await frame('shape-round'); await fw.removeInsertedCSS(k);
  k = await css(RADIUS(999)); await wait(300); await frame('shape-pill'); await fw.removeInsertedCSS(k);
  await js(MENU_JS); await wait(600); await frame('menu-drop'); await js(`(() => { const m = document.getElementById('menu'); m.hidden = true; m.classList.remove('ov97'); return 1; })()`);
  // Claude's glow, watching its page
  b.driverAct('watch', opened[1].page); await wait(2500);
  k = await css(NOWHO); await js(GLOW_JS('#f0a64a', 'working')); await wait(500); await frame('glow-working');
  await js(GLOW_JS('#7cc4ff', 'needs')); await wait(400); await frame('glow-needs');
  await fw.removeInsertedCSS(k); await js(`(() => { document.getElementById('slot').style.boxShadow = ''; document.getElementById('r98')?.remove(); return 1; })()`);
  b.driverAct('unwatch', 0); await wait(1500);
  // Notices: feel 1 hanging, three places (the needs-you one), then each kind; feel 2 the text box, each kind
  for (const w of ['left', 'mid', 'right'] as const) { await js(HANG_JS(N_NEEDS, w)); await wait(500); await frame(`hang-${w}`); }
  await js(HANG_JS(N_DONE, 'mid')); await wait(400); await frame('hang-done');
  await js(HANG_JS(N_WRONG, 'mid')); await wait(400); await frame('hang-wrong');
  for (const [n, nm] of [[N_NEEDS, 'needs'], [N_DONE, 'done'], [N_WRONG, 'wrong']] as const) { await js(BOX_JS(n)); await wait(500); await frame(`box-${nm}`); }
  await js(`document.getElementById('n98')?.remove(); 1`);
  void k0; site.close(); app.exit(0);
});
