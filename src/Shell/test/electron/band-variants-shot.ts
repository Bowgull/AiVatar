// Sheet 88 v2 (2026-10-25, his "look at all that negative space ... what else can we do here ... go big"): ideas for the
// band's spare wood, drawn on Samara's real band at 1440 wide over a real page. Not built: styles and pieces laid on for
// the picture. Run: npx electron test/electron/band-variants-shot.ts <out-prefix>
import { app, BrowserWindow } from 'electron';
import { mkdtempSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
process.on('uncaughtException', (e) => console.log('HARNESS NOTE ' + (e as Error).message));
process.on('unhandledRejection', (e) => { console.log('HARNESS REJECTION ' + String((e as Error)?.message ?? e)); app.exit(2); });
setTimeout(() => { console.log('HARNESS TIMEOUT'); app.exit(3); }, 150_000).unref();
const HERE = path.dirname(fileURLToPath(import.meta.url));
app.setPath('userData', mkdtempSync(path.join(os.tmpdir(), 'bv-ud-')));
app.commandLine.appendSwitch('disable-backgrounding-occluded-windows');
app.on('window-all-closed', () => {});
BrowserWindow.prototype.show = function (this: BrowserWindow) { this.setOpacity(0); this.showInactive(); };
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
// The bar calm in the middle, the site's name only (his page stays the same).
const CALM = `.band .slot{flex:0 1 760px !important;margin:0 auto !important}`;
// A thinner band: the bar 36 tall, the band 60, the keys a touch smaller (the lip stays).
const THIN = `.band{height:60px !important} .band .slot{padding-top:3px !important;padding-bottom:3px !important;min-height:0 !important}
  .band .rnd{width:29px !important;height:29px !important} .winkeys{top:12px !important;height:calc(100% - 12px) !important}`;
// The bar as a plaque: the drawer panels' own gold corner caps on its four corners.
const PLAQUE = `.band .slot{position:relative;overflow:visible !important}
  .band .slot::after{content:"";position:absolute;inset:-6px;pointer-events:none;z-index:2;image-rendering:pixelated;
  background:url(art/browser/cap3_tl.png) left top/22px 22px no-repeat,url(art/browser/cap3_tr.png) right top/22px 22px no-repeat,
  url(art/browser/cap3_bl.png) left bottom/22px 22px no-repeat,url(art/browser/cap3_br.png) right bottom/22px 22px no-repeat}`;
// Pinned sites on the left wood: carved keys like back and forward, each with its site's own icon.
const PINS = ['https://www.youtube.com/favicon.ico', 'https://www.reddit.com/favicon.ico', 'https://www.twitch.tv/favicon.ico'];
const PIN_JS = `(() => { if (document.getElementById('pins')) return 1; const box = document.createElement('div'); box.id = 'pins';
  Object.assign(box.style, { display: 'flex', gap: '7px', marginLeft: '14px', paddingLeft: '14px', borderLeft: '3px solid rgba(0,0,0,.35)', boxShadow: 'inset 1px 0 0 rgba(255,224,150,.12)' });
  for (const u of ${JSON.stringify(PINS)}) { const k = document.createElement('button'); k.className = 'rnd'; k.type = 'button';
    const i = document.createElement('img'); i.src = u; i.width = 16; i.height = 16; i.style.display = 'block'; k.append(i); box.append(k); }
  document.getElementById('reload').after(box); return 1; })()`;
const NAME_JS = `(() => { const u = document.getElementById('url'); u.replaceChildren(Object.assign(document.createElement('b'), { textContent: 'reddit.com' })); u.style.textAlign = 'center'; return 1; })()`;
app.whenReady().then(async () => {
  const out = process.argv[process.argv.length - 1];
  const { servePages } = await import('../../src/pageserver.ts');
  const { AangBrowser } = await import('../../src/browser.ts');
  const { wireBrowser } = await import('../../src/browseripc.ts');
  const pages = await servePages(path.join(HERE, '..', '..', 'pages'));
  const P = (f: string) => path.join(HERE, '..', '..', 'src', f);
  const b: any = new AangBrowser({ origin: pages.origin, preloadPath: P('preload.cjs'), tabPreloadPath: P('tabpreload.cjs'), settingsPreloadPath: P('settingspreload.cjs'), thingsPreloadPath: P('thingspreload.cjs'), stateDir: mkdtempSync(path.join(os.tmpdir(), 'bv-s-')) });
  wireBrowser(() => b);
  b.open('https://www.reddit.com/');
  for (let i = 0; i < 100 && !b.win; i++) await wait(150);
  b.win.setContentSize(1440, 900);
  await wait(7000);
  const fw = b.win.webContents;
  const page = () => b.cur()?.view;
  // Each picture: the frame with the page laid in where it sits, cropped to the top of the window.
  const shot = async (name: string) => {
    const f = await fw.capturePage({ x: 0, y: 0, width: 1440, height: 260 });
    writeFileSync(`${out}-${name}-frame.png`, f.toPNG());
    const v = page(); if (v) { const r = v.getBounds(); writeFileSync(`${out}-${name}-page.png`, (await v.webContents.capturePage({ x: 0, y: 0, width: r.width, height: Math.max(1, 260 - r.y) })).toPNG()); console.log(`PAGE ${name} ${r.x} ${r.y}`); }
  };
  const look = async (name: string, css: string, js?: string) => {
    const key = css ? await fw.insertCSS(css) : null;
    if (js) await fw.executeJavaScript(js);
    await wait(900);
    // the page moves up with a thinner band: tell Samara where the page now starts
    await fw.executeJavaScript(`window.dispatchEvent(new Event('resize')); 1`);
    await wait(700);
    await shot(name);
    if (key) await fw.removeInsertedCSS(key);
    await fw.executeJavaScript(`(() => { document.getElementById('pins')?.remove(); const u = document.getElementById('url'); u.style.textAlign = ''; delete document.getElementById('lock').dataset.u; return 1; })()`);
    await wait(300);
  };
  await look('now', '');
  await look('calm', CALM, NAME_JS);
  await look('thin', CALM + THIN, NAME_JS);
  await look('plaque', CALM + THIN + PLAQUE, NAME_JS);
  await look('pins', CALM + THIN + PLAQUE, NAME_JS + ';' + PIN_JS);
  app.exit(0);
});
