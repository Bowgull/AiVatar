// Sheet 119 B: the mini player ON SCREEN for a real look at its cut corners (capturePage cannot show a window region).
// Opens it at (300, 300) on the primary screen over a plain light window, full size, then folds it to the shade strip
// after HOLD/2, and quits after HOLD. Look at it with a screen capture while it is up.
//
// Run: npx electron test/electron/player-corner-shot.ts
import { app, BrowserWindow } from 'electron';
import { mkdtempSync, writeFileSync } from 'node:fs';
import os from 'node:os'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
import { servePages } from '../../src/pageserver.ts';
import { MiniPlayer } from '../../src/miniplayer.ts';
import { FamilyHost } from '../../src/familywin.ts';

const HOLD = 60_000;
app.on('window-all-closed', () => {});
const tmp = mkdtempSync(path.join(os.tmpdir(), 'player-corner-'));
app.setPath('userData', tmp);
const HERE = path.dirname(fileURLToPath(import.meta.url));
BrowserWindow.prototype.focus = function () {};

app.whenReady().then(async () => {
  // a light backdrop behind it, so the cut corners show against something bright
  const back = new BrowserWindow({ x: 260, y: 260, width: 520, height: 320, frame: false, show: false, backgroundColor: '#e8e2d4', focusable: false, skipTaskbar: true });
  back.showInactive();
  const pages = await servePages(path.join(HERE, '..', '..', 'pages'));
  const prefsFile = path.join(tmp, 'player.json');
  writeFileSync(prefsFile, JSON.stringify({ picture: 'cover', bars: true, shade: false, x: 308, y: 316 }));
  const mp = new MiniPlayer({ origin: pages.origin, preloadPath: path.join(HERE, '..', '..', 'src', 'playerpreload.cjs'), iconPath: path.join(HERE, '..', '..', 'assets', 'aang.ico'), prefsFile, onCmd: () => {}, clampToScreen: false, lyrics: async () => ({ lines: [], instrumental: false, timed: false }) });
  mp.family = new FamilyHost({ origin: pages.origin });
  const w = mp.open();
  mp.media({ t: 'media.now', v: 1, app: 'spotify', spotify: true, title: 'Corner test', artist: 'Sheet 119', album: 'B', status: 'paused', position: 61, duration: 200, at: Date.now(), canSeek: true, volume: 0.7 });
  setTimeout(() => { if (!w.isVisible()) w.showInactive(); w.moveTop(); console.log('READY full ' + JSON.stringify(w.getBounds())); }, 2500);
  setTimeout(() => { mp.hearShade(); }, HOLD / 2);
  setTimeout(() => console.log('READY shade ' + JSON.stringify(w.getBounds())), HOLD / 2 + 1500);
  setTimeout(() => app.exit(0), HOLD);
});
