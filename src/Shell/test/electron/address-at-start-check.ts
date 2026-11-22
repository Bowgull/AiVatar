// The address bar the moment Samara opens (his ask, 2026-11-20: "when samara opens sometimes i like to grab the address
// bar as its opening and google something"; 2026-11-22: "it should just load normally"). A restored session of two tabs,
// one slow. Checks that the bar is NOT opened for him, that a bar he grabs while Samara opens is not taken away by tabs
// coming back, that his typing lands there, and that Enter hands the keyboard to the page.
// Run it on the hidden desktop only (tools/hidden-desktop-run.ps1): it uses real focus.
//
// Run (from src/Shell):  npx electron test/electron/address-at-start-check.ts
import { app, screen } from 'electron';
import http from 'node:http';
import { mkdtempSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

process.on('uncaughtException', (e) => { console.log('HARNESS ERROR ' + String((e as Error)?.stack ?? e)); app.exit(2); });
process.on('unhandledRejection', (e) => { console.log('HARNESS REJECTION ' + String((e as Error)?.stack ?? e)); app.exit(2); });
setTimeout(() => { console.log('HARNESS TIMEOUT'); app.exit(3); }, 60_000).unref();

const HERE = path.dirname(fileURLToPath(import.meta.url));
app.setPath('userData', mkdtempSync(path.join(os.tmpdir(), 'samara-addr-ud-')));
app.on('window-all-closed', () => { /* the harness decides */ });
const results: boolean[] = [];
const check = (step: string, ok: boolean, detail = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${step}${detail ? '  -- ' + detail : ''}`); };
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

app.whenReady().then(async () => {
  (screen as any).getCursorScreenPoint = () => ({ x: -20000, y: 500 });
  const server = http.createServer((q, r) => {
    // The second tab answers slowly, so it finishes after the cursor is already in the bar.
    const slow = (q.url ?? '').includes('slow');
    setTimeout(() => r.writeHead(200, { 'Content-Type': 'text/html' }).end(`<!doctype html><title>Page</title><p>${q.url}</p>`), slow ? 2500 : 0);
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
  const port = (server.address() as { port: number }).port;
  const url = (p: string) => `http://127.0.0.1:${port}${p}`;
  const { servePages } = await import('../../src/pageserver.ts');
  const { AangBrowser } = await import('../../src/browser.ts');
  const { wireBrowser } = await import('../../src/browseripc.ts');
  const pages = await servePages(path.join(HERE, '..', '..', 'pages'));
  const stateDir = mkdtempSync(path.join(os.tmpdir(), 'samara-addr-state-'));
  writeFileSync(path.join(stateDir, 'browser-tabs.json'), JSON.stringify({ v: 1, at: new Date().toISOString(), active: 0, fronts: [0],
    tabs: ['/first', '/slow'].map((p, i) => ({ url: url(p), title: `Tab ${i + 1}`, opener: null, scrollY: 0, zoom: 0, muted: false, trail: null, done: false, win: 0 })),
    trails: [], closed: [] }));

  const src = path.join(HERE, '..', '..', 'src');
  const b: any = new AangBrowser({ origin: pages.origin, stateDir, preloadPath: path.join(src, 'samarapreload.cjs'),
    tabPreloadPath: path.join(src, 'tabpreload.cjs'), settingsPreloadPath: path.join(src, 'settingspreload.cjs'),
    thingsPreloadPath: path.join(src, 'thingspreload.cjs') } as any);
  wireBrowser(() => b);
  b.open();
  const w = b.win as Electron.BrowserWindow;
  if (process.env.TRACE) {
    const proto = Object.getPrototypeOf(w.webContents); const f = proto.focus;
    proto.focus = function (this: any) { const st = String(new Error().stack).split('\n').slice(2, 5).map((l) => l.trim()).join(' < '); console.log('FOCUS ' + String(this.getURL()).slice(0, 50) + ' ' + st); return f.call(this); };
  }
  await new Promise<void>((r) => w.webContents.once('did-finish-load', () => r()));
  const bar = async () => ({ ...(await w.webContents.executeJavaScript(`(() => { const e = document.getElementById('edit'); return { open: !e.hidden, focused: document.activeElement === e, value: e.value, hint: e.placeholder }; })()`)),
    keys: (await import('electron')).webContents.getFocusedWebContents()?.getURL().slice(0, 60) ?? 'none', slotOpen: b.pane.slotOpen, winFocused: w.isFocused() });

  await wait(800);
  let s = await bar();
  // 2026-11-22 (his ask, changing 11-20's): it loads normally, the bar not opened or selected for him
  check('Samara opens with the address bar closed, nothing selected', !s.open && !s.focused, JSON.stringify(s));

  // he grabs the bar while it is still opening (the slow tab has not loaded yet)
  // (Ctrl+L's route: a synthetic mouse click does not reach the frame on the hidden desktop)
  w.webContents.focus(); w.webContents.send('browser:focusslot');
  if (process.env.TRACE2) for (const ms of [0, 30, 60, 120, 250]) { await wait(ms ? 30 : 0); console.log('T+' + ms, JSON.stringify(await bar())); }
  await wait(300);
  s = await bar();
  check('grabbing the bar while Samara opens opens it', s.open && s.focused, JSON.stringify(s));

  await wait(3000);                                      // the slow tab has finished; Claude's tabs had their turn
  s = await bar();
  check('tabs coming back did not take the bar away', s.open && s.focused && w.webContents.isFocused(), JSON.stringify(s));

  const second = b.tabs.find((t: any) => String(t.url).includes('/slow'));
  b.activate(second.id);
  await wait(300);
  s = await bar();
  check('a tab coming forward while he types leaves the keyboard in the bar', s.open && s.focused && w.webContents.isFocused(), JSON.stringify(s));

  // He clicks the page while Samara is still in its first seconds: the page keeps the keyboard, the bar closes.
  const page = second.view.webContents as Electron.WebContents;
  page.sendInputEvent({ type: 'mouseDown', x: 200, y: 200, button: 'left', clickCount: 1 });
  page.focus();
  page.sendInputEvent({ type: 'mouseUp', x: 200, y: 200, button: 'left', clickCount: 1 });
  await wait(600);
  s = await bar();
  check('clicking the page while Samara opens gives the page the keyboard', page.isFocused() && !s.open, JSON.stringify(s));
  w.webContents.focus(); w.webContents.send('browser:focusslot');
  await wait(300);

  await w.webContents.executeJavaScript(`(() => { const e = document.getElementById('edit'); e.value = 'wowhead'; e.dispatchEvent(new Event('input')); return true; })()`);
  w.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Return' });
  w.webContents.sendInputEvent({ type: 'char', keyCode: '\r' });
  w.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Return' });
  await wait(1200);
  s = await bar();
  const front = b.tabs.find((t: any) => t.id === b.pane.active);
  check('Enter searches and closes the bar', !s.open, JSON.stringify(s));
  check('the page he asked for gets the keyboard', Boolean(front?.view?.webContents.isFocused()), String(front?.url));

  const failed = results.filter((x) => !x).length;
  console.log(`\n${results.length - failed}/${results.length} passed`);
  pages.close?.(); server.close();
  app.exit(failed ? 1 : 0);
});
