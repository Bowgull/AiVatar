// Sheet 57 (2026-10-21): pictures of Samara's tab drawer with each quieter close-tab "x". Not a pass/fail test.
// The real browser.html, off screen at 2x (every CSS pixel is 2 picture pixels): 9 tabs (loose ones, a named trail with
// a child tab under its parent, the MOCKUPS trail with a mockup and its lettered child), the active one, one row hovered.
// Each take is laid on as a constructed stylesheet (the page's CSP refuses an added <style>); recipes in
// docs/cockpit/sheet-57/takes.cjs. A stand-in git repo holds the mockups, so nothing of his is read or written.
//
// Run: npx electron test/electron/tabclose-shots.ts      (writes docs/cockpit/sheet-57/*.png and shots.js)
import { app, BrowserWindow, screen } from 'electron';
import http from 'node:http';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
import { servePages } from '../../src/pageserver.ts'; import { AangBrowser } from '../../src/browser.ts'; import { wireBrowser } from '../../src/browseripc.ts';

process.on('uncaughtException', (e) => { console.log('HARNESS NOTE ' + String((e as Error)?.stack ?? e).split('\n').slice(0, 3).join(' | ')); });
process.on('unhandledRejection', (e) => { console.log('HARNESS REJECTION ' + String((e as Error)?.stack ?? e)); app.exit(2); });
setTimeout(() => { console.log('HARNESS TIMEOUT'); app.exit(3); }, 90_000).unref();
app.commandLine.appendSwitch('force-device-scale-factor', '2');
app.on('window-all-closed', () => {});
const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, '..', '..', '..', '..');
const OUT = path.join(ROOT, 'docs', 'cockpit', 'sheet-57');
const TAKES = createRequire(import.meta.url)(path.join(OUT, 'takes.cjs')) as { base: string; takes: Record<string, string>; zooms: Record<string, { name: string; row: 'hv' | 'on'; xh?: boolean; mid?: boolean }[]> };
BrowserWindow.prototype.show = function (this: BrowserWindow) { this.setPosition(-6000, 100); this.showInactive(); };
BrowserWindow.prototype.focus = function () {};
BrowserWindow.prototype.moveTop = function () {};
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const until = async (fn: () => boolean, ms = 8000) => { const end = Date.now() + ms; while (Date.now() < end) { if (fn()) return true; await wait(100); } return fn(); };

// ---- a stand-in repo with two mockups (a sheet and its lettered child)
const repo = mkdtempSync(path.join(os.tmpdir(), 'tabclose-repo-'));
const g = (...a: string[]) => execFileSync('git', ['-C', repo, '-c', 'user.name=t', '-c', 'user.email=t@t', '-c', 'commit.gpgsign=false', ...a], { encoding: 'utf8' }).trim();
const put = (p: string, s: string) => { mkdirSync(path.dirname(path.join(repo, p)), { recursive: true }); writeFileSync(path.join(repo, p), s); };
g('init', '-q');
put('docs/cockpit/sheet-56-aang-menu.html', '<!doctype html><title>Sheet 56 - Aang menu</title><body style="background:#141210">');
put('docs/cockpit/sheet-56b-hush.html', '<!doctype html><title>Sheet 56b - Hush</title><body style="background:#141210">');
g('add', '-A'); g('commit', '-q', '-m', 'one');

// ---- the sites: a title and a small pixel icon each (data: icons, the only kind the drawer's CSP shows from here)
const px = (rows: string[], pal: Record<string, string>) => 'data:image/svg+xml,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" shape-rendering="crispEdges">${
  rows.flatMap((r, y) => [...r].map((c, x) => (pal[c] ? `<rect x="${x}" y="${y}" width="1" height="1" fill="${pal[c]}"/>` : ''))).join('')}</svg>`);
const ICON: Record<string, string> = {
  mail: px(['', '', '', 'wwwwwwwwwwwwwwww', 'wrwwwwwwwwwwwwrw', 'wrrwwwwwwwwwwrrw', 'wrwrwwwwwwwwrwrw', 'wrwwrwwwwwwrwwrw', 'wrwwwrwwwwrwwwrw', 'wrwwwwrwwrwwwwrw', 'wrwwwwwrrwwwwwrw', 'wrwwwwwwwwwwwwrw', 'wrwwwwwwwwwwwwrw', 'wwwwwwwwwwwwwwww'], { w: '#f2f2f2', r: '#d93025' }),
  tube: px(['', '', '', ' rrrrrrrrrrrrrr ', 'rrrrrrrrrrrrrrrr', 'rrrrrrwrrrrrrrrr', 'rrrrrrwwrrrrrrrr', 'rrrrrrwwwrrrrrrr', 'rrrrrrwwwwrrrrrr', 'rrrrrrwwwrrrrrrr', 'rrrrrrwwrrrrrrrr', 'rrrrrrwrrrrrrrrr', 'rrrrrrrrrrrrrrrr', ' rrrrrrrrrrrrrr '], { r: '#ff0033', w: '#ffffff' }),
  hub: px(['     kkkkkk     ', '   kkkkkkkkkk   ', '  kkkkkkkkkkkk  ', ' kkkwkkkkkkwkkk ', ' kkkwwwwwwwwkkk ', 'kkkwwwwwwwwwwkkk', 'kkkwwwwwwwwwwkkk', 'kkkwwwwwwwwwwkkk', 'kkkwwwwwwwwwwkkk', 'kkkkwwwwwwwwkkkk', ' kkkkkwwwwkkkkk ', ' kwkkkwwwwkkkkk ', '  kkwwwwwwkkkk  ', '   kkkwwwwkkk   ', '     kwwwwk     ', ''], { k: '#1b1f24', w: '#f0f3f6' }),
  wow: px(['', '  oooooooooooo  ', ' oyyyyyyyyyyyyo ', ' oyrrrrrrrrrryo ', ' oyryyyryyyyryo ', ' oyryyyryyyyryo ', ' oyryyrrryyyryo ', ' oyryrryrryyryo ', ' oyrrryyyrrrryo ', ' oyryyyyyyyyryo ', ' oyrrrrrrrrrryo ', ' oyyyyyyyyyyyyo ', '  oooooooooooo  '], { o: '#3a1d06', y: '#e7b445', r: '#7a1c10' }),
  wiki: px(['', '', '    wwwwwwww    ', '  wwkkkkkkkkww  ', ' wkkwwwwwwwwkkw ', ' wkwwwwwwwwwwkw ', 'wkwkwkwkwkwkwwkw', 'wkwkwkwkwkwkwwkw', 'wkwwkwkwwkwkwwkw', 'wkwwkwkwwkwkwwkw', ' wkwwwwwwwwwwkw ', ' wkkwwwwwwwwkkw ', '  wwkkkkkkkkww  ', '    wwwwwwww    '], { w: '#ffffff', k: '#202122' }),
  red: px(['', '      oooo      ', '    oooooooo    ', '   oooooooooo   ', '  oowwwwwwwwoo  ', '  owwkwwwwkwwo  ', ' oowwkwwwwkwwoo ', ' oowwwwwwwwwwoo ', ' oowwkwwwwkwwoo ', '  owwwkkkkwwwo  ', '  oowwwwwwwwoo  ', '   oooooooooo   ', '    oooooooo    ', '      oooo      '], { o: '#ff4500', w: '#ffffff', k: '#1a1a1b' }),
};
const SITES: Record<string, { title: string; icon: string }> = {
  mail: { title: 'Inbox (3) - you@example.com - Gmail', icon: 'mail' },
  tube: { title: 'Patch 1.15.8 first look - YouTube', icon: 'tube' },
  hub: { title: 'Bowgull/CereBro: specs and notes', icon: 'hub' },
  red: { title: 'r/classicwow - new raid tier tonight', icon: 'red' },
  wow1: { title: 'Wowhead - Patch 1.15.8 notes', icon: 'wow' },
  wow2: { title: 'Molten Core loot table - Wowhead', icon: 'wow' },
  wow3: { title: 'Ragnaros strategy guide', icon: 'wiki' },
};

app.whenReady().then(async () => {
  (screen as any).getCursorScreenPoint = () => ({ x: -20000, y: 500 });
  const site = http.createServer((q, r) => {
    const k = new URL(q.url ?? '/', 'http://x').searchParams.get('s') ?? 'mail', s = SITES[k] ?? SITES.mail;
    r.writeHead(200, { 'Content-Type': 'text/html' }).end(`<!doctype html><title>${s.title}</title><link rel="icon" href="${ICON[s.icon]}"><body style="margin:0;background:#202124;color:#ddd;font:16px sans-serif"><div style="padding:40px">${s.title}</div>`);
  });
  await new Promise<void>((r) => site.listen(47957, '127.0.0.1', () => r()));
  const U = (k: string) => `http://127.0.0.1:47957/?s=${k}`;
  const st = mkdtempSync(path.join(os.tmpdir(), 'tabclose-state-'));
  const pages = await servePages(path.join(HERE, '..', '..', 'pages'));
  const b = new AangBrowser({ origin: pages.origin, stateDir: st, repoDir: repo, preloadPath: path.join(HERE, '..', '..', 'src', 'preload.cjs'),
    tabPreloadPath: path.join(HERE, '..', '..', 'src', 'tabpreload.cjs'), settingsPreloadPath: path.join(HERE, '..', '..', 'src', 'settingspreload.cjs'),
    thingsPreloadPath: path.join(HERE, '..', '..', 'src', 'thingspreload.cjs'), testLocal: true }) as any;
  wireBrowser(() => b);
  b.open(U('mail'));
  await until(() => !!b.win && b.tabs.length === 1, 10000); await wait(1500);
  const id = (k: string) => b.tabs.find((t: any) => t.url === U(k))?.id;
  for (const k of ['tube', 'hub', 'red']) { b.newTab(U(k), null, false); await wait(250); }
  // A trail: three Wowhead tabs, the third tucked under the second (a child tab).
  b.newTab(U('wow1'), null, false); await wait(250);
  b.moveTab(id('wow1'), 'new');
  const trail = b.tabs.find((t: any) => t.url === U('wow1')).trail;
  b.renameTrail(trail, 'Patch 1.15.8');
  b.newTab(U('wow2'), null, false); await wait(250); b.moveTab(id('wow2'), trail);
  b.newTab(U('wow3'), null, false); await wait(250); b.moveTab(id('wow3'), trail);
  const placed = b.placeTabs([id('wow3')], trail, null, id('wow2'));
  // The MOCKUPS trail: sheet 56 and its lettered child 56b.
  await b.openMockup('docs/cockpit/sheet-56-aang-menu.html', '56 · Aang menu');
  await b.openMockup('docs/cockpit/sheet-56b-hush.html', '56b · Hush');
  await until(() => b.tabs.filter((t: any) => t.mock).length === 2);
  await until(() => b.tabs.every((t: any) => !t.loading), 10000); await wait(800);
  b.activate(id('wow1'));
  const w: BrowserWindow = b.win;
  w.setSize(1100, 1060); await wait(400);
  const wc = w.webContents;
  await wc.executeJavaScript("document.body.classList.add('drawer-open'); true"); await wait(900);
  console.log('tabs ' + b.tabs.length + ' child placed ' + placed);

  // The hovered row (a loose one) wears .hv, the "pointed at" stand-in; each take's rules say :is(:hover,.hv).
  const setup = (css: string) => wc.executeJavaScript(`(() => {
    const s = new CSSStyleSheet(); s.replaceSync(${JSON.stringify(TAKES.base + '\n' + css)}); document.adoptedStyleSheets = [s];
    document.querySelectorAll('.tp').forEach((r) => r.classList.remove('hv'));
    document.querySelectorAll('.tp .x').forEach((x) => x.classList.remove('xh', 'mid'));
    const rows = [...document.querySelectorAll('#tabs .tp')];
    const hv = rows.find((r) => r.querySelector('.t')?.textContent.startsWith('Bowgull')); hv.classList.add('hv');
    return rows.length; })()`);
  const geo = () => wc.executeJavaScript(`(() => {
    const R = (e) => { const r = e.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; };
    // Just the rows (and the trail heads between them): the panel's width, from the first row to the last.
    const p = document.querySelector('.drawer .tabpanel'), pp = R(p), rs = [...document.querySelectorAll('#tabs .tp')];
    const top = R(rs[0]).y - 14, bot = R(rs[rs.length - 1]).y + R(rs[rs.length - 1]).h + 9;
    const pr = { x: pp.x, y: top, w: pp.w, h: bot - top };
    const hv = document.querySelector('#tabs .tp.hv'), on = document.querySelector('#tabs .tp.on');
    const vis = (e) => e && getComputedStyle(e).display !== 'none' && getComputedStyle(e).opacity !== '0' ? R(e) : null;
    return { panel: pr, hv: R(hv), on: R(on), hvx: vis(hv.querySelector('.x')), onx: vis(on.querySelector('.x')) }; })()`);
  const SH: Record<string, any> = {};
  const cap = async (r: { x: number; y: number; w: number; h: number }, name: string) => {
    const rr = { x: Math.floor(r.x), y: Math.floor(r.y), width: Math.ceil(r.w), height: Math.ceil(r.h) };
    const img = await wc.capturePage(rr);
    writeFileSync(path.join(OUT, name + '.png'), img.toPNG());
    const s = img.getSize(); return { w: s.width, h: s.height, ox: rr.x, oy: rr.y };
  };
  for (const [name, css] of Object.entries(TAKES.takes)) {
    const n = await setup(css); await wait(350);
    const G = await geo();
    const area = G.panel;
    const s = await cap(area, name);
    const rel = (q: any) => q && { x: q.x - s.ox, y: q.y - s.oy, w: q.w, h: q.h };
    SH[name] = { w: s.w, h: s.h, rows: n, hv: rel(G.hv), on: rel(G.on), hvx: rel(G.hvx), onx: rel(G.onx), zooms: [] };
    // Close-ups: the right half of the row (the left half for the favicon-spot take), kept at 2x; the sheet shows them at 4x.
    for (const z of TAKES.zooms[name] ?? []) {
      await wc.executeJavaScript(`(() => { const r = document.querySelector('#tabs .tp.${z.row}'); const x = r.querySelector('.x');
        x.classList.toggle('xh', ${!!z.xh}); x.classList.toggle('mid', ${!!z.mid}); return true; })()`);
      await wait(250);
      const r = (z.row === 'hv' ? G.hv : G.on);
      const left = name === 'B' ? r.x - 6 : r.x + r.w - 74;
      const zs = await cap({ x: left, y: r.y - 6, w: 80, h: r.h + 14 }, name + '-' + z.name);
      SH[name].zooms.push({ name: z.name, w: zs.w, h: zs.h });
      await wc.executeJavaScript(`document.querySelectorAll('.tp .x').forEach((x) => x.classList.remove('xh', 'mid')); true`);
    }
    console.log(`${name}: panel ${JSON.stringify(G.panel)} hv ${JSON.stringify(G.hv)} ${s.w}x${s.h} rows ${n} hvx ${JSON.stringify(G.hvx)} onx ${JSON.stringify(G.onx)}`);
  }
  writeFileSync(path.join(OUT, 'shots.js'), '// Written by src/Shell/test/electron/tabclose-shots.ts: each picture\'s size (2x) and where the x sits in it (CSS px).\nwindow.SHOTS = ' + JSON.stringify(SH, null, 1) + ';\n');
  console.log('done');
  app.exit(0);
});
