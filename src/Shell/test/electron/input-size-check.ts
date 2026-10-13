// The typing box's window must be tall enough for everything drawn in it (2026-10-13: he saw the strip under the
// field cut off). Loads the REAL InputBox off screen, never focused, and compares the window with the page's frame.
//
// Run: npx electron test/electron/input-size-check.ts <folder for pictures>
import { app } from 'electron';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { servePages } from '../../src/pageserver.ts';
import { InputBox } from '../../src/input.ts';
import { CardRenderer } from '../../src/cardrender.ts';

process.on('uncaughtException', (e) => { console.log('HARNESS ERROR ' + (e as Error).stack); app.exit(2); });
process.on('unhandledRejection', (e) => { console.log('HARNESS REJECTION ' + String((e as Error)?.stack ?? e)); app.exit(2); });
setTimeout(() => { console.log('HARNESS TIMEOUT'); app.exit(3); }, 60_000).unref();
app.on('window-all-closed', () => { /* keep going: the card window closes before the box opens */ });
app.setPath('userData', mkdtempSync(path.join(os.tmpdir(), 'input-size-')));

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(process.argv[process.argv.length - 1] ?? os.tmpdir());
mkdirSync(OUT, { recursive: true });
const wait = (ms: number) => new Promise(r => setTimeout(r, ms));

app.whenReady().then(async () => {
  const pages = await servePages(path.join(HERE, '..', '..', 'pages'));
  // What happened live: a Discord card was drawn at 2x first, and its zoom leaked onto every Aang page.
  const cards = new CardRenderer(pages.origin);
  const card = await cards.render('needs', { title: 'A test card', text: 'Drawn first, the way it happened.' });
  console.log(card.ok ? 'a card was drawn first' : 'the card did not draw: ' + card.error);
  cards.close();
  const box = new InputBox({ origin: pages.origin, preloadPath: path.join(HERE, '..', '..', 'src', 'preload.cjs') } as any);
  const { ipcMain } = await import('electron');
  ipcMain.on('input:size', (_e, s: { width: number; height: number }) => { console.log('page says', JSON.stringify(s)); box.resize(s.width, s.height); });
  const w = box.window()!;
  await new Promise<void>(r => w.webContents.once('did-finish-load', () => r()));
  w.setPosition(-4000, 200);
  w.showInactive();
  box.send('input:state', { opened: true });
  await wait(1500);
  const zoom = w.webContents.getZoomFactor();
  console.log(zoom === 1 ? 'PASS  the box draws at 100%' : `FAIL  the box is zoomed to ${zoom}`);
  const frame = await w.webContents.executeJavaScript(`(() => { const f = document.querySelector('.frame') || document.getElementById('frame'); const r = f.getBoundingClientRect(); return { top: r.top, bottom: r.bottom, h: r.height, doc: document.documentElement.scrollHeight, inner: innerHeight }; })()`);
  console.log('window', JSON.stringify(w.getBounds()), 'content', JSON.stringify(w.getContentBounds()), 'frame', JSON.stringify(frame));
  const img = await w.webContents.capturePage();
  writeFileSync(path.join(OUT, 'input-box.png'), img.toPNG());
  console.log(frame.bottom <= frame.inner ? 'PASS  the whole box fits in its window' : `FAIL  the box is ${Math.ceil(frame.bottom - frame.inner)} px taller than its window`);
  w.destroy(); pages.close();
  app.exit(frame.bottom <= frame.inner ? 0 : 1);
});
