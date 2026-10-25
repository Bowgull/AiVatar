// 2026-10-25 (his "this doesn't work": double-clicking the band did nothing on the Mac): a double-click on the band's
// wood shrinks a window that fills the screen, and dragging the wood moves the window. Run: npx electron test/electron/band-wood-check.ts
import { app, BrowserWindow, screen } from 'electron';
import { mkdtempSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
setTimeout(() => { console.log('TIMEOUT'); app.exit(3); }, 60_000).unref();
const SH = path.join(path.dirname(new URL(import.meta.url).pathname), '..', '..');
app.setPath('userData', mkdtempSync(path.join(os.tmpdir(), 'db2-ud-')));
app.on('window-all-closed', () => {});
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
app.whenReady().then(async () => {
  const { servePages } = await import(SH + '/src/pageserver.ts');
  const { AangBrowser } = await import(SH + '/src/browser.ts');
  const { wireBrowser } = await import(SH + '/src/browseripc.ts');
  const pages = await servePages(SH + '/pages');
  const P = (f: string) => SH + '/src/' + f;
  const b: any = new AangBrowser({ origin: pages.origin, preloadPath: P('preload.cjs'), tabPreloadPath: P('tabpreload.cjs'), settingsPreloadPath: P('settingspreload.cjs'), thingsPreloadPath: P('thingspreload.cjs'), stateDir: mkdtempSync(path.join(os.tmpdir(), 'db2-s-')) });
  wireBrowser(() => b);
  b.open(); for (let i = 0; i < 100 && !b.win; i++) await wait(100); await wait(3000);
  const fw = b.win.webContents;
  const area = screen.getDisplayMatching(b.win.getBounds()).workArea;
  b.win.setBounds(area); await wait(800);
  const wood = { x: 200, y: 32 };
  const what = await fw.executeJavaScript(`(() => { const e = document.elementFromPoint(${wood.x}, ${wood.y}); return e ? e.className || e.id || e.tagName : 'none'; })()`);
  const click = (n: number) => { fw.sendInputEvent({ type: 'mouseDown', ...wood, button: 'left', clickCount: n }); fw.sendInputEvent({ type: 'mouseUp', ...wood, button: 'left', clickCount: n }); };
  click(1); await wait(60); click(2); await wait(1200);
  const small = b.win.getBounds();
  const shrank = small.width < area.width * 0.8;
  console.log(`${shrank ? 'PASS' : 'FAIL'} a real double-click on the wood (${what}) shrinks a window filling the screen (${small.width}x${small.height})`);
  // drag: press on the wood and move 120 to the right, 40 down
  await fw.executeJavaScript(`window.__pm = []; document.addEventListener('pointermove', (e) => window.__pm.push([e.screenX, e.screenY, e.buttons]), true); 1`);
  const drags: any[] = []; const wd = b.winDrag.bind(b); b.winDrag = (...a: any[]) => { drags.push(a.slice(1)); return wd(...a); };
  const at = b.win.getPosition();
  const cb = b.win.getContentBounds();
  const g = (x: number, y: number) => ({ x, y, globalX: cb.x + x, globalY: cb.y + y });
  fw.sendInputEvent({ type: 'mouseDown', ...g(wood.x, wood.y), button: 'left', clickCount: 1 } as any);
  for (let i = 1; i <= 6; i++) { fw.sendInputEvent({ type: 'mouseMove', ...g(wood.x + i * 20, wood.y + i * 7), modifiers: ['leftButtonDown'] } as any); await wait(40); }
  fw.sendInputEvent({ type: 'mouseUp', ...g(wood.x + 120, wood.y + 42), button: 'left', clickCount: 1 } as any);
  await wait(400);
  const now = b.win.getPosition();
  console.log('PM ' + JSON.stringify(await fw.executeJavaScript('window.__pm.slice(0,4)')) + ' DRAGS ' + JSON.stringify(drags.slice(0, 4)));
  const moved = Math.abs(now[0] - at[0]) > 50;
  console.log(`${moved ? 'PASS' : 'FAIL'} dragging the wood moves the window (${at} -> ${now})`);
  app.exit(shrank && moved ? 0 : 1);
});
