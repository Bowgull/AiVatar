// Sheet 99 (2026-10-27): Send to TV, rebuilt on the TV's own apps (Google TV's remote service, tested on his TV that
// day: YouTube with his Premium, Netflix with ?source=30, Stremio's show page; Prime only opens its app). His ask: "can
// I see some sort of loading here in Samara so I know it's working". On Samara's REAL band (today's, the bar rethink is
// still open), over a stand-in Netflix page served as www.netflix.com. Not built: pieces laid on for the picture.
// Run: TEST_CERT_DIR=<dir with test-key.pem, test-cert.pem> npx electron test/electron/sheet99-shot.ts <out-prefix>
import { app, BrowserWindow, screen } from 'electron';
import https from 'node:https';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
process.on('uncaughtException', (e) => console.log('HARNESS NOTE ' + String((e as Error)?.message ?? e).split('\n')[0]));
process.on('unhandledRejection', (e) => { console.log('HARNESS REJECTION ' + String((e as Error)?.stack ?? e)); app.exit(2); });
setTimeout(() => { console.log('HARNESS TIMEOUT'); app.exit(3); }, 200_000).unref();
const HERE = path.dirname(fileURLToPath(import.meta.url));
app.setPath('userData', mkdtempSync(path.join(os.tmpdir(), 's99-ud-')));
app.commandLine.appendSwitch('host-resolver-rules', 'MAP www.netflix.com 127.0.0.1');
app.commandLine.appendSwitch('disable-backgrounding-occluded-windows');
app.on('window-all-closed', () => {});
BrowserWindow.prototype.show = function (this: BrowserWindow) { this.setOpacity(0); this.showInactive(); };
BrowserWindow.prototype.focus = function () {};
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const PAGE = `<!doctype html><title>Stranger Things | Netflix</title><body style="margin:0;background:#141414;color:#fff;font:16px Helvetica,Arial,sans-serif">
  <div style="height:68px;display:flex;align-items:center;padding:0 48px;font:900 30px Arial;color:#e50914;letter-spacing:1px">N</div>
  <div style="margin:30px 48px;width:760px;height:300px;background:linear-gradient(90deg,#141414 30%,rgba(20,20,20,0)),radial-gradient(circle at 75% 40%,#5a1a1a,#141414 70%);display:flex;flex-direction:column;justify-content:center;padding-left:10px">
  <div style="font:900 44px Georgia,serif;color:#e50914;letter-spacing:2px">STRANGER THINGS</div><div style="margin-top:12px;color:#bbb">Season 1 · Episode 1 · The Vanishing of Will Byers</div>
  <div style="margin-top:18px;display:flex;gap:10px"><span style="background:#fff;color:#000;padding:8px 22px;border-radius:4px;font-weight:700">Play</span><span style="background:rgba(109,109,110,.7);padding:8px 22px;border-radius:4px;font-weight:700">More info</span></div></div></body>`;
const CV = `const cv = (w, h, s = 2) => { const c = document.createElement('canvas'); c.width = w * s; c.height = h * s; c.style.cssText = 'display:block;flex:none;image-rendering:pixelated'; const g = c.getContext('2d'); return [c, (x, y, col) => { g.fillStyle = col; g.fillRect(x * s, y * s, s, s); }]; };`;
// The TV icon (pixicons' "video", 10 x 10): its screen fills a third at a time as each step is done, a lit edge where
// the fill has reached; when the show plays it is the full picture with the play mark. Its own palette, whole pixels.
const TV_JS = (step: number, look: '' | 'dim' | 'hover' = '') => `(() => { ${CV}
  const K = '#2E3248', b = '#2B78D0', B = '#8ED2FF', w = '#FFFFFF', G = '#A2AAC0', off = '#161a2c';
  const map = ['kkkkkkkkkk', 'kSSSSSSSSk', 'kSSSSSSSSk', 'kSSSSSSSSk', 'kSSSSSSSSk', 'kSSSSSSSSk', 'kSSSSSSSSk', 'kkkkkkkkkk', '...kGGk...', '.kkkkkkkk.'];
  const play = ['kBBBBBBBBk', 'kbbwbbbbbk', 'kbbwwbbbbk', 'kbbwwwbbbk', 'kbbwwbbbbk', 'kbbwbbbbbk'];
  const [c, P] = cv(10, 10);
  const upto = ${step} >= 3 ? 9 : 1 + ${step} * 3 - ${step === 0 ? 1 : 0};
  map.forEach((r, y) => [...r].forEach((ch, x) => {
    if (ch === 'k') P(x, y, K); else if (ch === 'G') P(x, y, G);
    else if (ch === 'S') { if (${step} >= 3) { const p = play[y - 1][x]; P(x, y, p === 'w' ? w : p === 'B' ? B : b); } else P(x, y, x < upto - 1 ? b : x === upto - 1 && ${step} > 0 ? B : off); }
  }));
  const k = document.getElementById('tvkey'); k.hidden = false; k.replaceChildren(c); k.classList.add('ov99');
  k.style.filter = ${step} >= 3 ? 'drop-shadow(0 0 4px rgba(190,150,255,.85))' : '${look}' === 'hover' ? 'drop-shadow(0 0 6px rgba(190,150,255,1)) brightness(1.25)' : 'none';
  k.style.opacity = '${look}' === 'dim' ? '.6' : '1';
  return 1; })()`;
// The menu: Send to TV opens to the TV's own app first (this page is Netflix: the video is copy-protected, so "Just the
// video" is not offered), then the whole window.
const MENU_JS = `(() => { const m = document.getElementById('menu'); m.hidden = false; m.classList.add('ov99');
  document.getElementById('m-tv').classList.add('open'); const box = document.getElementById('m-tvbox'); box.hidden = false;
  document.getElementById('m-tvvid').remove();
  const r = document.createElement('button'); r.type = 'button'; r.className = 'mrow sub';
  r.innerHTML = '<span>In the TV\\'s Netflix</span><kbd>BEST</kbd>'; box.prepend(r);
  document.getElementById('m-tvwin').querySelector('span').textContent = 'The whole window';
  r.dispatchEvent(new MouseEvent('mouseover', { bubbles: true })); r.classList.add('hov99'); return 1; })()`;
const HOVER = `.menu .mrow.hov99{background:none !important;color:#ffe28c !important;padding-left:34px !important}
  .menu .mrow.hov99::before{content:"";position:absolute;left:4px;top:50%;width:24px;height:18px;margin-top:-9px;background:url(art/browser/hand.png) 0 0/24px 18px;image-rendering:pixelated}`;

// Right-click on the TV icon: the other ways, in Samara's own right-click menu (.tabmenu), the glove on the first.
const RCLICK_JS = `(() => { document.getElementById('tabmenu')?.remove();
  const m = document.createElement('div'); m.id = 'tabmenu'; m.className = 'tabmenu ov99'; m.setAttribute('role', 'menu');
  const gh = (t) => m.append(Object.assign(document.createElement('div'), { className: 'gh', textContent: t }));
  const item = (t, off = false) => { const b = document.createElement('button'); b.type = 'button'; b.textContent = t; b.disabled = off; m.append(b); return b; };
  gh('SEND TO YEET'); const first = item("In the TV's Netflix"); item('The whole window'); item('Just the video (not on Netflix)', true);
  m.append(Object.assign(document.createElement('div'), { className: 'sep' })); item('TV settings');
  document.body.append(m); const t = document.getElementById('tvkey').getBoundingClientRect();
  m.style.left = Math.round(t.left - 10) + 'px'; m.style.top = Math.round(t.bottom + 6) + 'px';
  first.classList.add('hov99m'); return 1; })()`;
const RHOVER = `.tabmenu button.hov99m{background:none !important;color:#ffe28c !important;padding-left:34px !important;position:relative}
  .tabmenu button.hov99m::before{content:"";position:absolute;left:4px;top:50%;width:24px;height:18px;margin-top:-9px;background:url(art/browser/hand.png) 0 0/24px 18px;image-rendering:pixelated}`;
// An ask from the TV, in its own colour (sheet 89's family, the real .bandchip.kind k-tv): hung under the TV icon.
const ASK_JS = (kind: 'link' | 'asleep') => `(() => {
  document.getElementById('a99')?.remove();
  const a = document.getElementById('tvchip').cloneNode(true); a.id = 'a99'; a.hidden = false; a.classList.add('ov99');
  for (const e of a.querySelectorAll('[id]')) e.removeAttribute('id');
  ${kind === 'asleep' ? `a.classList.remove('k-tv'); a.style.setProperty('--kc', '#a8382a');` : ''}
  const tag = a.querySelector('.tag'); tag.textContent = ${kind === 'link' ? "'Your TV'" : "'Went wrong'"};
  const faces = a.querySelector('.faces'); faces.remove();
  a.querySelector('.q2').lastElementChild.textContent = ${kind === 'link' ? "'Link Samara to yeet'" : "\"yeet didn't wake up\""};
  a.querySelector('.m').innerHTML = ${kind === 'link' ? "'Type the code your TV is showing. Only this once.'" : "'Turn it on with its remote, then try again. <b>The whole window</b> works with it asleep.'"};
  ${kind === 'link' ? `const row = document.createElement('div'); row.style.cssText = 'display:flex;gap:6px;margin:10px 0 2px';
    for (const ch of ['5', '5', 'F', '', '', '']) { const c = document.createElement('span'); c.textContent = ch;
      c.style.cssText = 'width:34px;height:40px;display:grid;place-items:center;border-radius:7px;border:3px solid #120A05;background:#0B0718;box-shadow:inset 0 3px 0 rgba(0,0,0,.6);font:800 18px Figtree,sans-serif;color:#ffe28c' + (ch === '' && !row.querySelector('.cur') ? ';box-shadow:inset 0 3px 0 rgba(0,0,0,.6),0 0 0 2px #FFC43C' : '');
      if (ch === '' && !row.querySelector('.cur')) c.className = 'cur'; row.append(c); }
    a.querySelector('.m').after(row);` : ''}
  const ks = a.querySelectorAll('.keys button'); ks[0].firstElementChild.textContent = ${kind === 'link' ? "'Link'" : "'Try again'"}; ks[1].firstElementChild.textContent = ${kind === 'link' ? "'Not now'" : "'Whole window'"};
  const t = document.getElementById('tvkey').getBoundingClientRect(), band = document.getElementById('band').getBoundingClientRect();
  a.style.width = '300px'; a.style.left = Math.round(t.left - band.left - 22) + 'px';
  document.getElementById('band').append(a); return 1; })()`;
app.whenReady().then(async () => {
  (screen as any).getCursorScreenPoint = () => ({ x: -20000, y: 500 });
  const out = process.argv[process.argv.length - 1];
  const CERT = process.env.TEST_CERT_DIR!;
  const srv = https.createServer({ key: readFileSync(path.join(CERT, 'test-key.pem')), cert: readFileSync(path.join(CERT, 'test-cert.pem')) }, (_q, r) => { r.writeHead(200, { 'Content-Type': 'text/html' }); r.end(PAGE); });
  await new Promise<void>((r) => srv.listen(0, '127.0.0.1', () => r()));
  const port = (srv.address() as { port: number }).port;
  const { servePages } = await import('../../src/pageserver.ts');
  const { AangBrowser } = await import('../../src/browser.ts');
  const { wireBrowser } = await import('../../src/browseripc.ts');
  const pages = await servePages(path.join(HERE, '..', '..', 'pages'));
  const P = (f: string) => path.join(HERE, '..', '..', 'src', f);
  const b: any = new AangBrowser({ origin: pages.origin, preloadPath: P('preload.cjs'), tabPreloadPath: P('tabpreload.cjs'), settingsPreloadPath: P('settingspreload.cjs'), thingsPreloadPath: P('thingspreload.cjs'), stateDir: mkdtempSync(path.join(os.tmpdir(), 's99-st-')) });
  wireBrowser(() => b);
  b.ses.setCertificateVerifyProc((_r: unknown, cb: (n: number) => void) => cb(0));
  b.open(`https://www.netflix.com:${port}/title/80057281`);
  for (let i = 0; i < 100 && !b.win; i++) await wait(150);
  b.ses.setCertificateVerifyProc((_r: unknown, cb: (n: number) => void) => cb(0));
  b.win.setContentSize(1440, 860);
  await wait(6000);
  const fw = b.win.webContents;
  const frame = async (name: string) => {
    await fw.executeJavaScript(`document.activeElement?.blur(); 1`); await wait(300);
    writeFileSync(`${out}-${name}-frame.png`, (await fw.capturePage()).toPNG());
    const v = b.cur()?.view; if (v) { writeFileSync(`${out}-${name}-page.png`, (await v.webContents.capturePage()).toPNG()); writeFileSync(`${out}-${name}-at.json`, JSON.stringify(v.getBounds())); }
    const ov = await fw.executeJavaScript(`JSON.stringify([...document.querySelectorAll('.ov99')].map((e) => { const q = e.getBoundingClientRect(); return [Math.round(q.left), Math.round(q.top), Math.round(q.width), Math.round(q.height)]; }))`);
    writeFileSync(`${out}-${name}-ov.json`, ov); console.log('SHOT ' + name + ' ' + ov);
  };
  const js = (c: string) => fw.executeJavaScript(c);
  await fw.insertCSS('#tvkey[hidden]{display:grid !important}');
  await js(TV_JS(0, 'dim')); await wait(400); await js(TV_JS(0, 'dim')); await wait(300); await frame('idle');
  await js(TV_JS(0, 'hover')); await wait(300); await frame('hover');
  await fw.insertCSS(RHOVER); await js(TV_JS(0)); await js(RCLICK_JS); await wait(500); await frame('rclick');
  await js(`document.getElementById('tabmenu')?.remove(); 1`); void HOVER; void MENU_JS;
  for (const s of [0, 1, 2, 3]) { await js(TV_JS(s)); await wait(300); await frame('tv' + s); }
  await js(TV_JS(0)); await js(ASK_JS('link')); await wait(600); await frame('link');
  await js(`document.getElementById('a99')?.remove(); 1`);
  await js(TV_JS(1)); await js(ASK_JS('asleep')); await wait(600); await frame('asleep');
  const sw = new BrowserWindow({ show: false, width: 1100, height: 700, webPreferences: { offscreen: true } });
  await sw.loadURL(`${pages.origin}/settings.html`); await wait(800);
  await sw.webContents.executeJavaScript(`(() => { try {
    const nav = document.querySelector('.side a[data-sec="about"]'); const a = nav.cloneNode(true); a.dataset.sec = 'tv'; a.setAttribute('href', '#tv'); a.childNodes[a.childNodes.length - 1].textContent = 'TV'; nav.before(a);
    for (const x of document.querySelectorAll('.side a')) x.classList.toggle('on', x.dataset.sec === 'tv');
    for (const x of document.querySelectorAll('section[data-sec]')) x.hidden = true;
    const sec = document.createElement('section'); sec.dataset.sec = 'tv';
    sec.innerHTML = '<h2>TV</h2><div class="card"><i class="caps"></i>' +
      '<div class="r"><b>Your TV</b><span class="v">yeet · linked</span></div>' +
      '<div class="r"><b>Answer "Who&#39;s watching?"</b><span class="v">Me on YouTube</span></div>' +
      '<div class="r"><b>Pause the video here</b><span class="v">When the TV takes it</span></div>' +
      '<div class="r"><b>Unlink yeet</b><i class="go"></i></div></div>';
    document.querySelector('section[data-sec="start"]').before(sec); return 1; } catch (e) { return String(e); } })()`).then((r) => console.log('SETTINGS ' + r));
  await wait(600); writeFileSync(`${out}-settings.png`, (await sw.webContents.capturePage()).toPNG()); console.log('SHOT settings');
  srv.close(); app.exit(0);
});
