// Sheet 113 (2026-10-31, his answers): Mockups gets a NEW section at the top (each sheet leaves it once opened), a search
// by name or number, a filter by mark, and a sort (by topic or newest first); the Mockups plaque in the tab list shows a
// count of new sheets. Samara's real Mockups page with the made-up tree of sheet 112 (sheet112-preload.cjs) and the real
// tab list; the new pieces are laid on with the page's own classes. Nothing is built.
// Run (from src/Shell): VIEW=top|search|filter|newest|tray npx electron test/electron/sheet113-shot.ts <out.png>
import { app, BrowserWindow, screen } from 'electron';
import { mkdtempSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
process.on('uncaughtException', (e) => console.log('HARNESS NOTE ' + (e as Error).message));
setTimeout(() => { console.log('HARNESS TIMEOUT'); app.exit(3); }, 90_000).unref();
const HERE = path.dirname(fileURLToPath(import.meta.url));
app.setPath('userData', mkdtempSync(path.join(os.tmpdir(), 's113-ud-')));
app.commandLine.appendSwitch('disable-backgrounding-occluded-windows');
app.on('window-all-closed', () => {});
const away = () => { const d = screen.getAllDisplays().find((x) => x.id !== screen.getPrimaryDisplay().id); return d ? d.bounds : null; };
BrowserWindow.prototype.show = function (this: BrowserWindow) { const b = away(); if (b) this.setPosition(b.x + 20, b.y + 20); else this.setPosition(-6000, 100); this.setOpacity(0); this.setFocusable(false); this.showInactive(); };
BrowserWindow.prototype.focus = function () {};
app.focus = () => {};
app.dock?.hide();
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const VIEW = process.env.VIEW ?? 'top';
const CSS = `
  .find113{flex:none;display:flex;flex-direction:column;gap:8px;padding:0 0 10px;margin:0 0 6px;border-bottom:3px solid rgba(0,0,0,.45)}
  .find113 input{box-sizing:border-box;width:100%;font:600 14px var(--body);color:#FFE096;background:#0B0718;border:3px solid #120A05;border-radius:6px;padding:7px 10px 7px 32px;outline:none;
    background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 8 8' shape-rendering='crispEdges'%3E%3Cpath fill='%23c9a35a' d='M2 0h3v1H2zM1 1h1v1H1zM5 1h1v1H5zM0 2h1v3H0zM6 2h1v3H6zM1 5h1v1H1zM5 5h1v1H5zM2 6h3v1H2zM6 6h1v1H6zM7 7h1v1H7z'/%3E%3C/svg%3E");
    background-repeat:no-repeat;background-size:16px 16px;background-position:9px 50%}
  .find113 input::placeholder{color:#7d6a4c}
  .find113 .chips{display:flex;flex-wrap:wrap;gap:5px}
  .find113 .chips .mk{cursor:pointer;opacity:.45}
  .find113 .chips .mk.sel{opacity:1;outline:2px solid #FFE28C;outline-offset:1px}
  .find113 .sort{display:flex;gap:0;align-self:flex-start;border:3px solid #120A05;border-radius:6px;overflow:hidden}
  .find113 .sort b{font:700 11px var(--body);letter-spacing:.6px;padding:4px 9px;color:#a98e6a;background:#2c1a0c;cursor:pointer}
  .find113 .sort b.on{color:#2a1c00;background:#d9ae62}
  .topic.new113 span:not(.n){color:#7cc4ff}
  .topic.new113 .n{color:#7cc4ff}
  .gem113{flex:none;width:14px;height:14px;image-rendering:pixelated;background:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 7 7' shape-rendering='crispEdges'%3E%3Cpath fill='%234aa8ff' d='M2 0h3v1H2zM1 1h5v1H1zM0 2h7v1H0zM1 3h5v1H1zM2 4h3v1H2zM3 5h1v1H3z'/%3E%3Cpath fill='%23a8d6ff' d='M2 1h2v1H2zM1 2h2v1H1z'/%3E%3C/svg%3E") 0 0/14px 14px}
  .hl113{background:rgba(124,196,255,.28);border-radius:2px;color:#fff}
`;
async function mockups() {
  const { servePages } = await import('../../src/pageserver.ts');
  const pages = await servePages(path.join(HERE, '..', '..', 'pages'));
  const d = away();
  const w = new BrowserWindow({ width: 1100, height: 820, show: false, x: d ? d.x + 20 : -6000, y: 100, focusable: false,
    webPreferences: { preload: path.join(HERE, 'sheet112-preload.cjs'), contextIsolation: false, sandbox: false } });
  await w.loadURL(`${pages.origin}/mocklog.html`);
  await wait(1200);
  await w.webContents.insertCSS(CSS);
  await w.webContents.executeJavaScript(`(() => {
    const V = ${JSON.stringify(VIEW)};
    for (const m of document.querySelectorAll('.mk.ok')) if (m.textContent === 'OPEN') m.className = 'mk open';
    const list = document.getElementById('list');
    const rows = [...list.querySelectorAll('.sh')];
    const fresh = rows.filter((r) => r.querySelector('.new'));
    // The finder: search, marks, sort.
    const f = document.createElement('div'); f.className = 'find113';
    const q = document.createElement('input'); q.placeholder = 'Search by name or number'; if (V === 'search') q.value = 'tab';
    const chips = document.createElement('div'); chips.className = 'chips';
    for (const [t, c] of [['NEW', 'new'], ['OPEN', 'open'], ['APPROVED', 'ok'], ['FIX', 'chg'], ['BUILT', 'built'], ['PARKED', 'park']]) {
      const i = document.createElement(c === 'new' ? 'span' : 'i'); i.className = c === 'new' ? 'mk new' : 'mk ' + c; i.textContent = t;
      if (c === 'new') i.style.cssText = 'background:#4aa8ff;color:#08203a';
      if (V === 'filter' && c === 'chg') i.classList.add('sel');
      chips.append(i);
    }
    const sort = document.createElement('div'); sort.className = 'sort';
    sort.innerHTML = '<b class="' + (V === 'newest' ? '' : 'on') + '">BY TOPIC</b><b class="' + (V === 'newest' ? 'on' : '') + '">NEWEST</b>';
    f.append(q, chips, sort);
    // The NEW section: the sheets he has not opened, above the topics. They leave their topic while new.
    const h = document.createElement('button'); h.className = 'topic on new113';
    h.innerHTML = '<i class="chev"></i><span class="gem113"></span><span>New</span><span class="n">' + fresh.length + '</span>';
    if (V === 'top') { list.prepend(h, ...fresh); }
    if (V === 'search') { for (const r of rows) { const nm = r.querySelector('.nm'); if (!/tab/i.test(nm.textContent)) r.remove(); else nm.innerHTML = nm.textContent.replace(/(tab)/i, '<span class="hl113">$1</span>'); }
      for (const t of [...list.querySelectorAll('.topic')]) { let n = t.nextElementSibling; if (!n || !n.classList.contains('sh')) t.remove(); } }
    if (V === 'filter') { for (const r of rows) if (!r.querySelector('.mk.chg')) r.remove();
      for (const t of [...list.querySelectorAll('.topic')]) { let n = t.nextElementSibling; if (!n || !n.classList.contains('sh')) t.remove(); } }
    if (V === 'newest') { for (const t of [...list.querySelectorAll('.topic')]) t.remove(); rows.sort((a, b) => Number(b.querySelector('.num').textContent) - Number(a.querySelector('.num').textContent)); list.append(...rows); }
    list.prepend(f);
    return 1;
  })()`);
  await wait(400);
  const r = await w.webContents.executeJavaScript(`(() => { const l = document.getElementById('list').getBoundingClientRect(), a = [...document.querySelectorAll('#list > *')].pop().getBoundingClientRect(); return { x: Math.round(l.left), y: Math.round(l.top), w: Math.round(l.width), h: Math.round(Math.min(a.bottom, l.bottom) - l.top + 10) }; })()`);
  return w.webContents.capturePage({ x: r.x, y: r.y, width: r.w, height: r.h });
}
async function tray() {
  const { servePages } = await import('../../src/pageserver.ts');
  const { AangBrowser } = await import('../../src/browser.ts');
  const { wireBrowser } = await import('../../src/browseripc.ts');
  const pages = await servePages(path.join(HERE, '..', '..', 'pages'));
  const stateDir = mkdtempSync(path.join(os.tmpdir(), 's113-state-'));
  const b: any = new AangBrowser({ origin: pages.origin, stateDir, preloadPath: path.join(HERE, '..', '..', 'src', 'preload.cjs'),
    tabPreloadPath: path.join(HERE, '..', '..', 'src', 'tabpreload.cjs'), settingsPreloadPath: path.join(HERE, '..', '..', 'src', 'settingspreload.cjs'), thingsPreloadPath: path.join(HERE, '..', '..', 'src', 'thingspreload.cjs') } as any);
  wireBrowser(() => b);
  b.open();
  await wait(4000);
  b.tray(true, { x: 42, y: 62, hy: 80 });
  await wait(1500);
  await b.trayV.webContents.insertCSS(`.cnt113{position:absolute;right:12px;top:50%;transform:translateY(-50%);min-width:22px;height:22px;box-sizing:border-box;padding:0 6px;border-radius:11px;
    border:2.5px solid #120A05;background:#4aa8ff;color:#08203a;font:800 12px/17px var(--body);text-align:center;box-shadow:inset 0 2px 0 #a8d6ff}
    #mqkey{position:relative}`);
  await b.trayV.webContents.executeJavaScript(`(() => { const k = document.getElementById('mqkey'); const c = document.createElement('span'); c.className = 'cnt113'; c.textContent = '2'; k.append(c); return 1; })()`);
  await wait(400);
  const r = await b.trayV.webContents.executeJavaScript(`(() => { const k = document.getElementById('mqkey').getBoundingClientRect(); return { y: Math.max(0, Math.round(k.top - 40)), h: Math.round(k.height + 80) }; })()`);
  return b.trayV.webContents.capturePage({ x: 0, y: r.y, width: 340, height: r.h });
}
app.whenReady().then(async () => {
  const img = VIEW === 'tray' ? await tray() : await mockups();
  writeFileSync(process.argv.find((a) => a.endsWith('.png'))!, img.toPNG());
  console.log('SHOT ' + JSON.stringify(img.getSize()));
  app.exit(0);
});
