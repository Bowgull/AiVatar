// Sheet 87 v13 (his "everything on the tabs sections blends into one colour", 2026-10-25): three night looks for the tab
// list that keep the day list's contrast (dark panels, lighter rows, a bright tab in front, gold edges), on Samara's
// real list. Plain test tabs. Run: STATE=<dir> npx electron test/electron/secret-list-variants.ts <out-prefix>
import { app, BrowserWindow } from 'electron';
import { copyFileSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
process.on('uncaughtException', (e) => console.log('HARNESS NOTE ' + (e as Error).message));
setTimeout(() => { console.log('HARNESS TIMEOUT'); app.exit(3); }, 150_000).unref();
const HERE = path.dirname(fileURLToPath(import.meta.url));
app.setPath('userData', mkdtempSync(path.join(os.tmpdir(), 'slv-ud-')));
app.commandLine.appendSwitch('disable-backgrounding-occluded-windows');
app.on('window-all-closed', () => {});
BrowserWindow.prototype.show = function (this: BrowserWindow) { this.setOpacity(0); this.showInactive(); };
BrowserWindow.prototype.focus = function () {};
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
// Each look undoes the shipped night list first (gold edges back), then sets panels, rows and the tab in front.
const BASE = `
html.secret .drawer .tabpanel::after,html.secret .shelf-bk::after{filter:none !important}
html.secret .drawer .ptitle{color:#FFE096 !important}
html.secret .drawer .ptitle::after{background:linear-gradient(180deg,rgba(0,0,0,.6) 0 2px,rgba(255,224,150,.2) 2px 4px) !important}
html.secret .drawer .th{color:var(--gold) !important}
html.secret .drawer .th .n{color:#bfae8a !important}
html.secret .drawer .tp .fi.letter{color:#FFE096 !important}
html.secret .bm-add{border-color:rgba(255,224,150,.4) !important;color:#FFE096 !important}
html.secret .drawer{background-image:linear-gradient(rgba(2,4,14,.78),rgba(2,4,14,.82)),url(art/browser/tray.png) !important}
html.secret .drawer .tabpanel{background:radial-gradient(120% 40% at 50% 0%,rgba(140,170,255,.10),transparent 60%),linear-gradient(rgba(6,10,34,.72),rgba(6,10,34,.78)),url(art/browser/tray.png) 0 0/128px 256px !important;
  box-shadow:inset 0 0 0 4px #24305e,inset 0 0 0 5px #05030c,inset 0 7px 12px rgba(0,0,0,.55),0 3px 0 #02020a !important}
html.secret .drawer .newtab{background:linear-gradient(180deg,#141a3a,#0c1028) !important;color:#FFE096 !important;box-shadow:inset 0 2px 0 rgba(140,170,255,.18),0 3px 0 #02020a !important}
html.secret .drawer .tp.on{background:linear-gradient(180deg,#F4F7FF,#BCC9EC) !important;color:#141a38 !important}
`;
const LOOKS: Record<string, string> = {
  // A: starlight. Bright blue rows, deep panels, gold edges.
  a: BASE + `html.secret .drawer .tp{color:#F2F5FF !important;background:linear-gradient(180deg,#4a5ca8 0,#3a4a90 45%,#2e3c78 100%) !important;
    box-shadow:0 4px 0 #05030c,inset 0 3px 0 rgba(200,215,255,.35),inset 0 -2px 0 rgba(0,0,0,.35) !important}`,
  // B: moonlit wood. The day rows' own wood, cooled to plum under the moon; deep navy panels, gold edges.
  b: BASE + `html.secret .drawer .tp{color:#F6ECF6 !important;background:linear-gradient(180deg,#6a5078 0,#56405f 45%,#46344f 100%) !important;
    box-shadow:0 4px 0 #05030c,inset 0 3px 0 rgba(255,214,240,.24),inset 0 -2px 0 rgba(0,0,0,.35) !important}`,
  // C: velvet. The bookmarks shelf's purple velvet for the rows; deep navy panels, gold edges.
  c: BASE + `html.secret .drawer .tp{color:#F6EEFF !important;background:linear-gradient(rgba(120,70,170,.35),rgba(60,30,100,.45)),url(art/browser/velvet.png) 0 0/96px 96px !important;image-rendering:pixelated;
    box-shadow:0 4px 0 #05030c,inset 0 3px 0 rgba(230,200,255,.28),inset 0 -2px 0 rgba(0,0,0,.4) !important}`,
};
app.whenReady().then(async () => {
  const out = process.argv[process.argv.length - 1];
  const { servePages } = await import('../../src/pageserver.ts');
  const { AangBrowser } = await import('../../src/browser.ts');
  const { wireBrowser } = await import('../../src/browseripc.ts');
  const pages = await servePages(path.join(HERE, '..', '..', 'pages'));
  const P = (f: string) => path.join(HERE, '..', '..', 'src', f);
  const dir = mkdtempSync(path.join(os.tmpdir(), 'slv-s-')), sdir = path.join(dir, 'secret'); mkdirSync(sdir);
  copyFileSync(path.join(process.env.STATE!, 'browser-tabs.json'), path.join(sdir, 'browser-tabs.json'));
  const normal = Boolean(process.env.NORMAL);   // the same shots of normal Samara, to compare
  const s: any = new AangBrowser({ origin: pages.origin, preloadPath: P('preload.cjs'), tabPreloadPath: P('tabpreload.cjs'), settingsPreloadPath: P('settingspreload.cjs'), thingsPreloadPath: P('thingspreload.cjs'), stateDir: sdir, ...(normal ? {} : { sharedDir: dir, secret: true }) });
  wireBrowser(() => null, () => s);
  s.open();
  for (let i = 0; i < 100 && !s.win; i++) await wait(150);
  s.win.setContentSize(1100, 700);
  await wait(4000);
  // Unlocked the real way (the mask's PIN box), then the list opened the real way: his click on the band's arrow.
  if (!normal) { s.tray(true, { x: 42, y: 62, hy: 80 }); await wait(400); await s.secretPinAct({ act: 'set', pin: '1234' }); }
  await wait(1500);
  s.tray(false); await wait(1200);
  for (let i = 0; i < 40 && !(s.cur()?.view && !s.cur().loading); i++) await wait(250);
  await wait(2500);
  const fw = s.win.webContents;
  const page = async () => { const v = s.cur()?.view; return v ? { png: (await v.webContents.capturePage()).toPNG(), at: v.getBounds() } : null; };
  // 1: open, list closed: the arrow is back.
  writeFileSync(`${out}-closed-frame.png`, (await fw.capturePage()).toPNG());
  const p1 = await page(); if (p1) { writeFileSync(`${out}-closed-page.png`, p1.png); console.log('PAGE ' + JSON.stringify(p1.at)); }
  // 2: his click on the arrow.
  const p2 = await page();
  await fw.executeJavaScript(`document.getElementById('drawerkey').click(); 1`);
  await wait(1500);
  writeFileSync(`${out}-open-frame.png`, (await fw.capturePage()).toPNG());
  if (p2) writeFileSync(`${out}-open-page.png`, p2.png);
  console.log('TRAY ' + JSON.stringify(s.trayV.getBounds()));
  const tw = s.trayV.webContents;
  console.log('RAIL ' + await tw.executeJavaScript(`(() => { const h = document.querySelector('.railhandle'); const c = getComputedStyle(h); const r = h.getBoundingClientRect(); return JSON.stringify({ cls: document.documentElement.className, body: document.body.className, d: c.display, v: c.visibility, o: c.opacity, t: c.transform, r: [r.x, r.y, r.width, r.height] }); })()`));
  writeFileSync(`${out}-list-now.png`, (await tw.capturePage()).toPNG());
  for (const [k, css] of Object.entries(LOOKS)) {
    const key = await tw.insertCSS(css.replaceAll('html.secret ', 'html.secret body '));
    await wait(500);
    writeFileSync(`${out}-${k}.png`, (await tw.capturePage()).toPNG());
    await tw.removeInsertedCSS(key);
  }
  app.exit(0);
});
