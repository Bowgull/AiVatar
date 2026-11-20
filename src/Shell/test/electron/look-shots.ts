// Samara's look, every surface outside the tab drawer (2026-11-20, sheet 120 A / 121): the band with the ⋯ menu, the
// star, the shield and the downloads panels, a notice, Settings, history, the right-click menu and the address
// suggestions, plus the new pieces (hover picture, side by side, peek, sound mark) once they exist. Each picture is the
// whole window as it shows: the frame with every visible layer drawn over it at its real place.
// Run (hidden desktop): npx electron test/electron/look-shots.ts <out folder> [only]
import { app, BrowserWindow, type WebContents } from 'electron';
import http from 'node:http';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
process.on('uncaughtException', (e) => console.log('HARNESS NOTE ' + (e as Error).message));
setTimeout(() => { console.log('HARNESS TIMEOUT'); app.exit(3); }, 240_000).unref();
const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = process.argv.slice(2).find((a) => !a.startsWith('-') && !a.endsWith('.ts')) ?? path.join(os.tmpdir(), 'look-shots');
const ONLY = process.argv.slice(2).filter((a) => !a.endsWith('.ts') && a !== OUT);
mkdirSync(OUT, { recursive: true });
app.setPath('userData', mkdtempSync(path.join(os.tmpdir(), 'look-ud-')));
app.commandLine.appendSwitch('disable-backgrounding-occluded-windows');
app.commandLine.appendSwitch('force-device-scale-factor', '1');
app.on('window-all-closed', () => {});
BrowserWindow.prototype.show = function (this: BrowserWindow) { this.setOpacity(0); this.showInactive(); };
BrowserWindow.prototype.focus = function () {};
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
/** Its own little web server (two of these can run at once on the hidden desktop: PORT=... for the second). */
const PORT = Number(process.env.PORT) || 47996;
const PAGE = (title: string, body: string) => `<!doctype html><title>${title}</title><style>body{margin:0;font:17px/1.6 Georgia,serif;color:#2b2620;background:#f7f4ee}
header{display:flex;gap:26px;align-items:center;padding:18px 48px;border-bottom:1px solid #e3dccf;font:600 15px system-ui;color:#6a5f50}header b{color:#2b2620;font-size:19px;margin-right:auto}
article{max-width:720px;margin:36px auto;padding:0 24px}h1{font-size:38px;line-height:1.15;margin:.2em 0 .5em}small{font:700 12px system-ui;letter-spacing:1.5px;color:#9a6a2a}a{color:#2b5fa8}</style>${body}`;
const ARTICLE = PAGE('Pressing maple leaves · Fieldnotes', `<header><b>Fieldnotes</b><span>Stories</span><span>Maps</span><span>Gear</span></header><article><small>FIELD GUIDE · 6 MIN</small><h1>Pressing autumn maple leaves so they keep their colour</h1>
<p>Pick leaves the morning after a dry night, when they are still supple. Red ones hold their colour best; the yellow ones fade within a month unless you seal them.</p>
<p>Lay each leaf between two sheets of <a href="/newsprint" id="lnk">plain newsprint</a>, never glossy paper, then stack heavy books on top and leave them for ten days.</p>
<p>Once flat, brush on a thin coat of wax or matte varnish. Pressed this way they last years on a window or inside a book.</p></article>`);
const WEATHER = PAGE('Weather · Montréal', `<header><b>Weather</b><span>Today</span><span>10 days</span></header><article><small>MONTRÉAL, QUEBEC</small><h1>4° · light rain, clearing tonight</h1><p>Feels like 1°, wind 18 km/h.</p></article>`);
const PAPER = PAGE('Newsprint · Papercraft', `<header><b>Papercraft</b><span>Guides</span><span>Supplies</span></header><article><small>SUPPLIES</small><h1>Newsprint: the cheap paper that presses best</h1><p>Newsprint is soft and unbleached, so it pulls water out of a leaf without sticking to it.</p></article>`);

/** The whole window as he sees it: the frame, then every visible layer over it in order. */
async function composite(b: any, file: string): Promise<void> {
  const w: BrowserWindow = b.win;
  const [cw, ch] = w.getContentSize();
  const parts: { x: number; y: number; png: string }[] = [];
  const grab = async (wc: WebContents, x: number, y: number) => { try { const img = await wc.capturePage(); if (!img.isEmpty()) parts.push({ x, y, png: img.toDataURL() }); } catch { /* gone */ } };
  await grab(w.webContents, 0, 0);
  for (const v of w.contentView.children as any[]) {
    if (!v.webContents || v.webContents.isDestroyed() || !v.getVisible()) continue;
    const r = v.getBounds();
    if (r.width < 2 || r.height < 2) continue;
    await grab(v.webContents, r.x, r.y);
  }
  // The right-click menu is its own window: drawn where it stands, over the window.
  if (b.menu && !b.menu.isDestroyed() && b.menu.isVisible()) {
    const mb = b.menu.getBounds(), wb = w.getContentBounds();
    await grab(b.menu.webContents, mb.x - wb.x, mb.y - wb.y);
  }
  const c = new BrowserWindow({ show: false, width: cw, height: ch, webPreferences: { offscreen: true } });
  await c.loadURL('data:text/html,<canvas id=c></canvas>');
  const url: string = await c.webContents.executeJavaScript(`(async () => {
    const c = document.getElementById('c'); c.width = ${cw}; c.height = ${ch}; const g = c.getContext('2d');
    for (const p of ${JSON.stringify(parts)}) { const i = new Image(); i.src = p.png; await i.decode(); g.drawImage(i, p.x, p.y); }
    return c.toDataURL('image/png');
  })()`);
  c.destroy();
  writeFileSync(path.join(OUT, file), Buffer.from(url.split(',')[1]!, 'base64'));
  console.log('SHOT ' + file);
}
const want = (n: string) => !ONLY.length || ONLY.some((o) => n.startsWith(o));
const js = (wc: WebContents, code: string) => wc.executeJavaScript(code, true).catch((e: Error) => 'ERR ' + e.message);

app.whenReady().then(async () => {
  http.createServer((q, r) => {
    const body = q.url?.startsWith('/weather') ? WEATHER : q.url?.startsWith('/newsprint') ? PAPER : ARTICLE;
    r.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }).end(body);
  }).listen(PORT, '127.0.0.1');
  const { servePages } = await import('../../src/pageserver.ts');
  const { AangBrowser } = await import('../../src/browser.ts');
  const { wireBrowser } = await import('../../src/browseripc.ts');
  const pages = await servePages(path.join(HERE, '..', '..', 'pages'));
  const stateDir = mkdtempSync(path.join(os.tmpdir(), 'look-state-'));
  const T = [['/maple', 'Pressing maple leaves · Fieldnotes'], ['/weather', 'Weather · Montréal'], ['/lofi', 'Lo-fi to read to, 3 hours'], ['/miso', 'Miso soup in ten minutes']];
  writeFileSync(path.join(stateDir, 'browser-tabs.json'), JSON.stringify({ v: 1, active: 0, fronts: [0], tabs: T.map(([u, t]) => ({ url: `http://127.0.0.1:${PORT}${u}`, title: t, scrollY: 0, zoom: 0, win: 0, trail: null })), trails: [], closed: [] }));
  const b: any = new AangBrowser({ origin: pages.origin, stateDir, preloadPath: path.join(HERE, '..', '..', 'src', 'preload.cjs'),
    tabPreloadPath: path.join(HERE, '..', '..', 'src', 'tabpreload.cjs'), settingsPreloadPath: path.join(HERE, '..', '..', 'src', 'settingspreload.cjs'), thingsPreloadPath: path.join(HERE, '..', '..', 'src', 'thingspreload.cjs') } as any);
  wireBrowser(() => b);
  b.open();
  await wait(2500);
  b.win.setContentSize(1440, 900);
  await wait(4500);
  const F = b.win.webContents as WebContents;
  const click = async (id: string) => { await js(F, `document.getElementById(${JSON.stringify(id)}).dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, detail: 1 })), 1`); await wait(900); };
  const esc = async () => { for (const wc of [F, b.pane.floatV?.webContents].filter(Boolean)) await js(wc, `document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })); document.body.click(); 1`); await wait(700); };
  if (want('01')) { await composite(b, '01-window.png'); }
  if (want('02')) { await click('menukey'); await composite(b, '02-menu.png'); await esc(); }
  if (want('03')) { await click('star'); await composite(b, '03-star.png'); await esc(); }
  if (want('04')) { await click('lock'); await composite(b, '04-shield.png'); await esc(); }
  if (want('05')) {
    // A finished download in the tray (the key shows once the tray has something).
    const f = path.join(os.tmpdir(), 'leaf-press-guide.pdf'); writeFileSync(f, 'x');
    b.dls.list.push({ id: 9001, name: 'leaf-press-guide.pdf', file: f, site: 'fieldnotes.example', size: 2_400_000, at: Date.now(), state: 'done' }, { id: 9002, name: 'maple-map.png', file: f, site: 'fieldnotes.example', size: 840_000, at: Date.now() - 60_000, state: 'done' });
    b.traySince = 0; b.sendDownloads();
    await wait(600);
    await click('dlkey'); await composite(b, '05-downloads.png'); await esc();
  }
  if (want('06')) { const id = b.note('leaf-press-guide.pdf is ready', { kind: 'done', from: 'dl', kick: 'Downloaded', title: 'Download done', keys: [{ label: 'Open', act: 'ok' }, { label: 'Show in folder', act: 'show', plain: true }] }); await wait(1800); await composite(b, '06-notice.png'); b.notices.drop(id); await wait(600); }
  const views = () => (b.win.contentView.children as any[]).map((v) => `${v.webContents?.getURL?.() ?? '?'} vis=${v.getVisible?.()} ${JSON.stringify(v.getBounds?.())}`).join('\n  ');
  if (want('07')) {
    b.openSettings('general'); await wait(3000);
    console.log('VIEWS 07\n  ' + views());
    await composite(b, '07-settings.png');
    const sw = b.tabs.find((x: any) => x.internal === 'settings')?.view?.webContents as WebContents | undefined;
    if (sw) for (const s of ['look', 'privacy']) { await js(sw, `document.querySelector('.side a[data-sec="${s}"]').click(), 1`); await wait(700); await composite(b, `07-settings-${s}.png`); }
    if (sw) { await js(sw, `document.querySelector('.side a[data-sec="autofill"]').click(); document.querySelector('[data-go=pin]').click(), 1`); await wait(700); await composite(b, '07-settings-pin.png'); }
  }
  if (want('08')) { b.openThings('history'); await wait(3000); console.log('VIEWS 08\n  ' + views()); await composite(b, '08-history.png'); }
  if (want('09')) {
    b.activate(b.tabs[0].id); await wait(1200);
    b.pageMenu(b.cur(), { x: 400, y: 300, linkURL: '', srcURL: '', selectionText: '', isEditable: false, mediaType: 'none', editFlags: {} });
    await wait(1500);
    // The menu opens at the real mouse, which on the hidden desktop is anywhere: put it where the right-click was.
    const m = b.menu, wb = b.win.getContentBounds();
    console.log(`MENU 09 ${m && !m.isDestroyed() ? `visible=${m.isVisible()} ${JSON.stringify(m.getBounds())}` : 'none'}`);
    if (m && !m.isDestroyed() && m.isVisible()) { m.setPosition(wb.x + 400, wb.y + 300); await wait(300); }
    await composite(b, '09-rightclick.png'); b.hideMenu();
  }
  if (want('10')) { await js(F, `(() => { const s = document.getElementById('slot'); s.click(); const e = document.getElementById('edit'); e.hidden = false; e.focus(); e.value = 'ma'; e.dispatchEvent(new Event('input', { bubbles: true })); return 1; })()`); await wait(1500); await composite(b, '10-suggest.png'); await esc(); }
  // The new pieces (only once built): each harness step is skipped quietly when its piece is missing.
  if (want('11') && b.tabPeek) { b.activate(b.tabs[1].id); await wait(3500); b.activate(b.tabs[0].id); await wait(1500); b.tray(true, { x: 42, y: 62, hy: 80 }); await wait(1400); await js(b.trayV.webContents, `(() => { const r = document.querySelectorAll('#tabs .tp[data-tab]')[1]; r.dispatchEvent(new PointerEvent('pointerover', { bubbles: true })); return r.dataset.tab; })()`); await wait(1600); await composite(b, '11-hover-tab.png'); b.tabPeek(null); b.tray(false); await wait(600); }
  if (want('12') && b.splitOpen) { b.splitOpen(b.tabs[1].id); await wait(2200); await composite(b, '12-side-by-side.png'); }
  if (want('13') && b.linkPeek) { b.splitClose?.(); await wait(800); b.linkPeek(`http://127.0.0.1:${PORT}/newsprint`); await wait(2500); await composite(b, '13-peek.png'); b.linkPeekClose?.(); await wait(600); }
  if (want('14')) { const t = b.tabs[2]; if (t) { t.audible = true; b.sendTabs(); } await wait(900); await composite(b, '14-sound-mark.png'); }
  app.exit(0);
});
