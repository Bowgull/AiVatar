// Sheet 67 v2: a picture of the timer's right-click menu (its real page, timermenu.html), with New timer ▸ open, in a plain
// off-screen window (the real menu window is cut to its shape, and a shaped window captures blank). Next to a timer plate.
// Run: npx electron test/electron/timer-menu-shot.ts <folder>
import { app, BrowserWindow, dialog, nativeImage } from 'electron';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path'; import { fileURLToPath } from 'node:url';
import { servePages } from '../../src/pageserver.ts';

process.on('uncaughtException', (e) => { console.log('HARNESS ERROR ' + String((e as Error)?.stack ?? e).split('\n').slice(0, 4).join(' | ')); app.exit(2); });
process.on('unhandledRejection', (e) => { console.log('HARNESS REJECTION ' + String(e)); app.exit(2); });
setTimeout(() => { console.log('HARNESS TIMEOUT'); app.exit(3); }, 30_000).unref();
dialog.showErrorBox = () => {};
app.commandLine.appendSwitch('disable-features', 'CalculateNativeWinOcclusion');
app.on('window-all-closed', () => {});
const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = process.argv.at(-1)!.endsWith('.ts') ? HERE : process.argv.at(-1)!;
mkdirSync(OUT, { recursive: true });
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

app.whenReady().then(async () => {
  const pages = await servePages(path.join(HERE, '..', '..', 'pages'));
  const preload = path.join(HERE, '..', '..', 'src', 'preload.cjs');
  const mk = (x: number, w: number, h: number, page: string) => {
    const b = new BrowserWindow({ x, y: 200, width: w, height: h, frame: false, transparent: true, backgroundColor: '#00000000', show: false, focusable: false, webPreferences: { sandbox: true, contextIsolation: true, preload } });
    void b.loadURL(`${pages.origin}/${page}`);
    b.once('ready-to-show', () => b.showInactive());
    return b;
  };
  const tw = mk(-5200, 300, 250, 'timer.html'), mw = mk(-4880, 640, 560, 'timermenu.html');
  while (tw.webContents.isLoading() || mw.webContents.isLoading()) await wait(80);
  await wait(300);
  tw.webContents.send('timer:data', { id: 'tshot', label: 'Pizza', total: 600_000, end: Date.now() + 412_000, paused: 0, colour: 'blue' });
  mw.webContents.send('timer:menushow', { label: 'Pizza', colour: 'blue', paused: false, done: false, fam: { n: 2, opacity: 0.85, pinned: false, through: false }, x: 8, y: 8, w: 640, h: 560 });
  await wait(400);
  await mw.webContents.executeJavaScript(`document.querySelector('#tm button[data-id="new"]').dispatchEvent(new PointerEvent('pointerenter')); document.querySelector('#tm button[data-id="new"]').classList.add('hov')`, true);
  await wait(500);
  const a = await tw.webContents.capturePage(), b = await mw.webContents.capturePage();
  const W = 300 + 640 + 24, H = 572, px = Buffer.alloc(W * H * 4);
  for (let i = 0; i < px.length; i += 4) { px[i] = 34; px[i + 1] = 36; px[i + 2] = 40; px[i + 3] = 255; }
  const put = (img: Electron.NativeImage, ox: number, oy: number) => {
    const s = img.getSize(), bm = img.toBitmap();
    for (let y = 0; y < s.height; y++) for (let x = 0; x < s.width; x++) {
      const si = (y * s.width + x) * 4, d = ((y + oy) * W + x + ox) * 4, al = bm[si + 3]! / 255;
      if (!al || x + ox >= W || y + oy >= H) continue;
      for (let c = 0; c < 3; c++) px[d + c] = Math.round(bm[si + c]! * al + px[d + c]! * (1 - al));
    }
  };
  put(a, 8, 8); put(b, 312, 6);
  const f = path.join(OUT, 'timer-menu.png');
  writeFileSync(f, nativeImage.createFromBitmap(px, { width: W, height: H }).toPNG());
  console.log('PICTURE ' + f + ' menu capture ' + JSON.stringify(b.getSize()));
  for (const w of BrowserWindow.getAllWindows()) w.destroy();
  app.exit(0);
}).catch((e) => { console.log('HARNESS ERROR ' + String(e)); app.exit(2); });
