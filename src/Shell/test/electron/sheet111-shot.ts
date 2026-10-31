// Sheet 111 (2026-10-31, his ask: "i should also be able to start and stop claude per each tab", top priority). One
// STOP today ends Claude's whole job and the chat cannot start again. The sheet shows Pause and Go on per tab, in the
// tab list and on the band, with STOP left as the stop for all. Real band and list layer: the list holds a made-up
// "Job scan" of three Claude tabs (as sheet 110), the band shows him watching one of them (Samara's real paintWho).
// The new pieces use Samara's own keys (takek, stopk) and chip (dupchip), on the rows as sheet 110 v3 built them
// (Claude's spark at the end, the orange breath). Nothing is built.
// Run (from src/Shell): perl -e 'alarm 120; exec @ARGV' node_modules/electron/dist/Electron.app/Contents/MacOS/Electron test/electron/sheet111-shot.ts <out-prefix>
import { app, BrowserWindow, screen } from 'electron';
import http from 'node:http';
import { mkdtempSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
process.on('uncaughtException', (e) => console.log('HARNESS NOTE ' + (e as Error).message));
setTimeout(() => { console.log('HARNESS TIMEOUT'); app.exit(3); }, 110_000).unref();
const HERE = path.dirname(fileURLToPath(import.meta.url));
app.setPath('userData', mkdtempSync(path.join(os.tmpdir(), 's111-ud-')));
app.commandLine.appendSwitch('disable-backgrounding-occluded-windows');
app.on('window-all-closed', () => {});
// His rule (2026-10-29): test windows never touch his main monitor or take his keyboard.
const away = () => { const d = screen.getAllDisplays().find((x) => x.id !== screen.getPrimaryDisplay().id); return d ? d.bounds : null; };
BrowserWindow.prototype.show = function (this: BrowserWindow) { const b = away(); if (b) this.setPosition(b.x + 20, b.y + 20); this.setOpacity(0); this.setFocusable(false); this.showInactive(); };
BrowserWindow.prototype.focus = function () {};
BrowserWindow.prototype.moveTop = function () {};
BrowserWindow.prototype.setAlwaysOnTop = function () {};
app.focus = () => {};
app.dock?.hide();
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const fav = (bg: string, ch: string) => 'data:image/svg+xml,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><rect width="16" height="16" rx="3" fill="${bg}"/><text x="8" y="12.5" font-family="Arial" font-weight="700" font-size="12" fill="#fff" text-anchor="middle">${ch}</text></svg>`);
const PAGES = [
  { id: 11, url: 'https://jobs.northwind.example/1', title: 'Client Account Manager @ Northwind', favicon: fav('#3b4bd8', 'N') },
  { id: 12, url: 'https://jobs.contoso.example/2', title: 'Contoso - Account Manager, Partners', favicon: fav('#2f8f7f', 'C') },
  { id: 13, url: 'https://jobs.fabrikam.example/3', title: 'Fabrikam - Onboarding Specialist', favicon: fav('#d07a2a', 'F') },
];
const POSTING = `<!doctype html><title>Contoso - Account Manager, Partners</title><body style="margin:0;font:16px/1.55 -apple-system,Segoe UI,Helvetica,Arial,sans-serif;background:#fff;color:#1d2433">
  <div style="height:64px;display:flex;align-items:center;gap:12px;padding:0 64px;border-bottom:1px solid #e4e7ee"><div style="width:28px;height:28px;border-radius:6px;background:#2f8f7f"></div><b style="font-size:19px">Contoso</b></div>
  <div style="padding:36px 64px;max-width:760px"><div style="color:#2f8f7f;font-weight:600;font-size:14px">Partners · Remote</div><h1 style="margin:6px 0 18px;font-size:34px">Account Manager, Partners</h1>
  <p style="color:#3a4252">Look after a group of partner companies, help them grow, and be their voice inside Contoso.</p></div></body>`;

// Two pixel glyphs in the stop key's own 7x7 grid: Pause (two bars) and Go on (a right arrow).
const PAUSE = '<svg viewBox="0 0 7 7" width="12" height="12" shape-rendering="crispEdges" aria-hidden="true"><path d="M1 1h2v5H1zM4 1h2v5H4z" fill="#2a1c00"/></svg>';
const GO = '<svg viewBox="0 0 7 7" width="12" height="12" shape-rendering="crispEdges" aria-hidden="true"><path d="M2 1h1v5H2zM3 2h1v3H3zM4 3h1v1H4z" fill="#2a1c00"/></svg>';
const LIST_CSS = `
  .pk111{margin-left:4px;width:22px;height:22px;flex:0 0 auto;border-radius:6px;border:2.5px solid var(--outline);display:grid;place-items:center;padding:0;cursor:pointer;
    background:var(--gold);box-shadow:0 3px 0 var(--outline),inset 0 2px 0 var(--gold-light);position:relative;top:-1px}
  .drawer .tp.drv.paused111{animation:none}
  .drawer .tp.drv.paused111 .t{opacity:.55}
  .drawer .tp.drv.paused111 .fi,.drawer .tp.drv.paused111 .own{opacity:.55;filter:grayscale(1)}
  .drawer .tp.drv .dupchip{margin-left:auto}
  .drawer .tp.drv .dupchip+.own{margin-left:6px}`;
// Sheet 110 v3 (built): Claude's rows end with its spark and breathe orange; Pause goes after the spark.
// The list: Pause on every working row, the paused row dimmed with PAUSED and Go on. The header's STOP stops all.
const LIST = (paused: number | null, armed: boolean) => `(() => { try {
  document.querySelectorAll('.drawer .tp.drv .pk111, .drawer .tp.drv .dupchip').forEach((x) => x.remove());
  for (const r of document.querySelectorAll('.drawer .tp.drv')) {
    const id = [...document.querySelectorAll('.drawer .tp.drv')].indexOf(r) + 11, off = id === ${paused};
    r.classList.toggle('paused111', off);
    if (off) r.querySelector('.own').before(Object.assign(document.createElement('span'), { className: 'dupchip', textContent: 'PAUSED' }));
    const k = document.createElement('button'); k.className = 'pk111'; k.type = 'button'; k.innerHTML = off ? ${JSON.stringify(GO)} : ${JSON.stringify(PAUSE)}; r.append(k);
  }
  if (${armed}) { const s = document.querySelector('.drawer .th.driver .stopk'); s.classList.add('armed'); s.textContent = 'STOP ALL?'; }
  return document.querySelectorAll('.drawer .tp.drv').length; } catch (e) { return 'ERR ' + e.message; } })()`;
const BAND_CSS = `.slot .who.paused111{color:#d9c7a3}`;
// The band while he watches one of Claude's tabs: Samara's real paintWho, then Pause before STOP, or PAUSED and Go on.
const BAND = (paused: boolean) => `(() => {
  window.__o111?.disconnect();
  document.activeElement?.blur();
  const who = document.getElementById('who'), stop = who.querySelector('.stopk').outerHTML;
  const key = (t) => '<button class="takek" type="button" style="order:3;height:24px;margin-left:4px;padding:0 9px;border-radius:6px;border:2.5px solid var(--outline);font:700 12px var(--body);color:#2a1c00;background:var(--gold);box-shadow:0 3px 0 var(--outline),inset 0 2px 0 var(--gold-light);display:inline-flex;align-items:center;position:relative;top:-1px">' + t + '</button>';
  const ic = who.firstElementChild.outerHTML;
  const html = ic + (${paused} ? 'PAUSED HERE' + key('Go on') : 'CLAUDE IS DRIVING' + key('Pause')) + stop;
  const put = () => { o.disconnect(); who.hidden = false; who.classList.toggle('paused111', ${paused}); who.innerHTML = html; o.observe(who, { childList: true }); };
  const o = new MutationObserver(put); window.__o111 = o; put(); return who.textContent; })()`;

app.whenReady().then(async () => {
  (screen as any).getCursorScreenPoint = () => ({ x: -20000, y: 500 });
  const out = process.argv[process.argv.length - 1];
  http.createServer((q, r) => r.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }).end(q.url === '/c' ? POSTING : `<!doctype html><title>${q.url === '/p/0' ? 'Inbox - Mail' : 'Weekend plans'}</title><p>${q.url}`)).listen(47111, '127.0.0.1');
  const { servePages } = await import('../../src/pageserver.ts');
  const { AangBrowser } = await import('../../src/browser.ts');
  const { wireBrowser } = await import('../../src/browseripc.ts');
  const pages = await servePages(path.join(HERE, '..', '..', 'pages'));
  const stateDir = mkdtempSync(path.join(os.tmpdir(), 's111-state-'));
  writeFileSync(path.join(stateDir, 'browser-tabs.json'), JSON.stringify({ v: 1, active: 0, fronts: [0], tabs: [0, 1].map((i) => ({ url: `http://127.0.0.1:47111/p/${i}`, title: i ? 'Weekend plans' : 'Inbox - Mail', scrollY: 0, zoom: 0, win: 0, trail: null })), trails: [], closed: [] }));
  const P = (f: string) => path.join(HERE, '..', '..', 'src', f);
  const b: any = new AangBrowser({ origin: pages.origin, stateDir, preloadPath: P('preload.cjs'), tabPreloadPath: P('tabpreload.cjs'), settingsPreloadPath: P('settingspreload.cjs'), thingsPreloadPath: P('thingspreload.cjs') } as any);
  wireBrowser(() => b);
  b.open();
  await wait(4000);
  // The made-up job reaches the page the way a real one does: through the state Samara sends (its page state is private).
  b.driver.view = () => [{ id: 1, kind: 'claude', name: 'JOB SCAN', working: true, stopped: false, pages: PAGES }];
  b.sendTabs(); await wait(600);

  // The list layer.
  b.tray(true, { x: 42, y: 62, hy: 80 });
  await wait(1500);
  const tv = b.trayV.webContents;
  await tv.insertCSS(LIST_CSS); await wait(1500);
  for (const [name, paused, armed] of [['list-working', null, false], ['list-paused', 12, false], ['list-stopall', 12, true]] as const) {
    await tv.executeJavaScript(LIST(paused, armed)); await wait(500);
    console.log('ROWS ' + await tv.executeJavaScript(LIST(paused, armed)));
    writeFileSync(`${out}-${name}.png`, (await tv.capturePage()).toPNG());
  }
  b.tray(false);
  await wait(800);

  // The band, watching Claude's Contoso tab (his tab shows the same posting as the watched picture would).
  b.win.setContentSize(1280, 700);
  await b.cur().view.webContents.loadURL('http://127.0.0.1:47111/c');
  await wait(1800);
  const fw = b.win.webContents;
  await fw.insertCSS(BAND_CSS);
  // He is watching Claude's Contoso tab: Samara's real paintWho draws the band from this.
  const realPage = b.driver.page.bind(b.driver), realJob = b.driver.job.bind(b.driver);
  b.driver.page = (id: number) => id === 12 ? { id: 12, job: 1, url: PAGES[1]!.url, title: PAGES[1]!.title } : realPage(id);
  b.driver.job = (id: number) => id === 1 ? { id: 1, kind: 'claude', working: true } : realJob(id);
  b.watching = 12; b.sendTabs(); await wait(800);
  for (const [name, paused] of [['band-driving', false], ['band-paused', true]] as const) {
    console.log('WHO ' + await fw.executeJavaScript(BAND(paused)));
    await wait(400);
    // The page's own picture under the band, so the frame is whole.
    const v = b.cur().view, r = v.getBounds(), pic = (await v.webContents.capturePage()).toDataURL();
    await fw.executeJavaScript(`(() => { document.querySelectorAll('.img111').forEach((x) => x.remove()); const i = document.createElement('img'); i.className = 'img111'; i.src = ${JSON.stringify(pic)};
      Object.assign(i.style, { position: 'fixed', zIndex: 1, left: '${r.x}px', top: '${r.y}px', width: '${r.width}px', height: '${r.height}px' }); document.body.append(i); return new Promise((ok) => i.decode().then(() => ok(1))); })()`);
    v.setVisible(false); await wait(400);
    writeFileSync(`${out}-${name}.png`, (await fw.capturePage({ x: 0, y: 0, width: 1280, height: 300 })).toPNG());
    v.setVisible(true);
  }
  app.exit(0);
});
