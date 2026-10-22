// The mini player, live fixes (2026-10-22, his reports using it). Off screen, never focused, no real mouse or keys;
// Spotify is never called (the brain's messages are made up here).
//   1. Corners: Windows' round corners while free (DWM's corner preference read back through the edge helper), the
//      family's pixel-stepped region while joined (square DWM + a complex region), re-cut to the new size on the fold;
//      the video member the same.
//   2. Volume: the plum knob sits on the end of the cream fill at 0, 50 and 100, and before any volume is known.
//   3. Spotify Connect: the device chip, the plain line, the device menu (asking, then the list, a pick moves the music),
//      the brain told when the player shows and hides.
// Run: npx electron test/electron/player-live-check.ts
import { app, BrowserWindow } from 'electron';
import { mkdtempSync, writeFileSync } from 'node:fs';
import os from 'node:os'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
import { servePages } from '../../src/pageserver.ts';
import { MiniPlayer, SHADE_H } from '../../src/miniplayer.ts';
import { FamilyHost } from '../../src/familywin.ts';
import { askHelper, softEdge, stopEdgeHelper } from '../../src/winedge.ts';

process.on('uncaughtException', (e) => { console.log('HARNESS ERROR ' + String((e as Error)?.stack ?? e).split('\n').slice(0, 4).join(' | ')); app.exit(2); });
process.on('unhandledRejection', (e) => { console.log('HARNESS REJECTION ' + String((e as Error)?.stack ?? e)); app.exit(2); });
setTimeout(() => { console.log('HARNESS TIMEOUT'); app.exit(3); }, 120_000).unref();
app.on('window-all-closed', () => {});
const TMP = mkdtempSync(path.join(os.tmpdir(), 'player-live-check-'));
app.setPath('userData', TMP);
const HERE = path.dirname(fileURLToPath(import.meta.url));
BrowserWindow.prototype.show = function (this: BrowserWindow) { this.showInactive(); };
BrowserWindow.prototype.focus = function () {};
BrowserWindow.prototype.moveTop = function () {};
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
let bad = 0;
const check = (what: string, ok: boolean, d: unknown = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${what}${d !== '' ? '  -- ' + String(typeof d === 'string' ? d : JSON.stringify(d)).slice(0, 300) : ''}`); if (!ok) bad++; };
const until = async (fn: () => boolean | Promise<boolean>, ms = 6000) => { const end = Date.now() + ms; while (Date.now() < end) { if (await fn()) return true; await wait(80); } return fn(); };
/** "corner region l,t,r,b" from the helper: DWM's preference (1 square, 2 round), the region type (0 none, 3 complex). */
const corners = async (w: BrowserWindow) => { const [c, k, box] = (await askHelper('C', w)).split(' '); return { dwm: Number(c), region: Number(k), box: String(box) }; };

app.whenReady().then(async () => {
  const pages = await servePages(path.join(HERE, '..', '..', 'pages'));
  const host = new FamilyHost({ origin: pages.origin, saveFile: null });
  host.displays = () => [{ id: 11, scaleFactor: 1, bounds: { x: -6000, y: 0, width: 3000, height: 1600 } }];
  host.areas = () => [{ x: -6000, y: 0, width: 3000, height: 1600 }];

  // the video member (thick frame, Windows' own corners while free, osCorners like popout.ts)
  const video = new BrowserWindow({ x: -5200, y: 200, width: 640, height: 394, frame: false, transparent: false, backgroundColor: '#24160D', show: false,
    webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false, preload: path.join(HERE, '..', '..', 'src', 'preload.cjs') } });
  softEdge(video);
  void video.loadURL(`${pages.origin}/popout.html`);
  video.once('ready-to-show', () => video.showInactive());
  host.add({ id: 'video', kind: 'video', win: () => (video.isDestroyed() ? null : video), card: '.frame', osCorners: true, setOpacity: (n) => video.setOpacity(n), setPinned: () => {} });

  const prefsFile = path.join(TMP, 'player.json');
  writeFileSync(prefsFile, JSON.stringify({ picture: 'cover', bars: true, shade: false, x: -4200, y: 900 }));
  const watched: boolean[] = [], moved: string[] = [], asked: number[] = [];
  const mp = new MiniPlayer({ origin: pages.origin, preloadPath: path.join(HERE, '..', '..', 'src', 'playerpreload.cjs'), prefsFile, clampToScreen: false,
    onWatch: (v) => watched.push(v), onDevices: () => asked.push(Date.now()), onTransfer: (id) => moved.push(id) });
  mp.family = host;
  const w = mp.open();
  const js = (s: string) => w.webContents.executeJavaScript(s, true);
  const pageErrors: string[] = [];
  w.webContents.on('console-message', (e: any) => { const m = String(e.message ?? ''); if (/Uncaught|Error/.test(m) && !/Transition was skipped/.test(m)) pageErrors.push(m); /* the family's view transition cut short by the next reshape: harmless */ });
  check('page loads and draws', await until(async () => (await js(`window.__ready ? window.__ready.then(() => !!document.querySelector('.full .time')) : false`).catch(() => false)) === true, 12000));
  await until(() => host.members().length === 2 && !video.webContents.isLoading(), 8000);
  check('the brain is told the player shows', await until(() => watched.at(-1) === true, 3000), watched);

  // ---------------------------------------------------------------- 2. volume: knob and fill from one number
  const vol = () => js(`(() => { const g = document.querySelector('.full canvas.volp'), b = document.querySelector('.bead.volb'), gr = g.getBoundingClientRect(), br = b.getBoundingClientRect();
    return { fw: Number(g.dataset.fw), fillEnd: gr.left + (1 + Number(g.dataset.fw)) * 2, knob: br.left + 9, dim: b.classList.contains('dim'), v: b.dataset.v }; })()`);
  const v0 = await vol();
  check('before any volume: an empty groove, the knob at its start (dimmed)', v0.fw === 0 && Math.abs(v0.knob - v0.fillEnd) <= 1 && v0.dim, v0);
  const base = { t: 'media.now', v: 1, app: 'spotify', spotify: true, title: 'Maria También', artist: 'Khruangbin', album: 'Con Todo El Mundo', status: 'playing', position: 101.2, duration: 241, at: Date.now(), canSeek: true, thumb: null };
  for (const v of [0, 0.5, 1]) {
    mp.media({ ...base, volume: v });
    await wait(250);
    const r = await vol();
    check(`volume ${v * 100}: the knob sits on the end of the fill`, Math.abs(r.knob - r.fillEnd) <= 1 && !r.dim && r.v === String(v * 100) && (v === 0 ? r.fw === 0 : v === 1 ? r.fw === 79 : r.fw === 40), r);
  }
  // dragging moves both together
  await js(`(() => { const g = document.querySelector('.full .grab[title$="volume"]'); const r = g.getBoundingClientRect(); const o = { bubbles: true, button: 0, pointerId: 7, clientX: r.left + 8 + (r.width - 16) * 0.25, clientY: r.top + 6 };
    g.setPointerCapture = () => {}; g.hasPointerCapture = () => true; g.dispatchEvent(new PointerEvent('pointerdown', o)); g.dispatchEvent(new PointerEvent('pointermove', o)); return 1; })()`);
  const vd = await vol();
  check('dragging to a quarter: the fill and the knob move together', Math.abs(vd.knob - vd.fillEnd) <= 1 && vd.fw === 20, vd);
  await js(`(() => { const g = document.querySelector('.full .grab[title$="volume"]'); const r = g.getBoundingClientRect(); g.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, button: 0, pointerId: 7, clientX: r.left + 8 + (r.width - 16) * 0.25, clientY: r.top + 6 })); return 1; })()`);

  // ---------------------------------------------------------------- 3. Spotify Connect
  mp.media({ ...base, title: 'Remote Song', volume: 0.4, device: { name: 'Kitchen speaker', kind: 'speaker' }, source: 'remote' });
  await wait(250);
  const chip = await js(`(() => { const d = document.querySelector('.full .tags .dev'); return d ? { text: d.textContent, kind: d.dataset.kind, icon: !!d.querySelector('canvas'), title: document.querySelector('.full .grab[title$="volume"]')?.title } : null; })()`);
  check('a remote device: the chip says where (pixel icon + name), the volume is that device\'s', chip?.text === 'KITCHEN SPEAKER' && chip.kind === 'speaker' && chip.icon && chip.title === 'Kitchen speaker’s volume', chip);
  mp.setNote('Can’t reach Spotify right now');
  await wait(150);
  check('one plain line when Spotify cannot be reached', await js(`(() => { const s = document.querySelector('.full .sub'); return s.classList.contains('note') && s.textContent === 'Can’t reach Spotify right now'; })()`) === true);
  mp.setNote(null);
  await wait(150);
  check('and it goes when all is well', await js(`(() => { const s = document.querySelector('.full .sub'); return !s.classList.contains('note') && s.textContent === 'Con Todo El Mundo'; })()`) === true);
  mp.media({ ...base, volume: 0.4, device: null, source: 'pc' });
  await wait(200);
  check('back on this PC: no chip', await js(`!document.querySelector('.full .tags .dev')`) === true);
  // the device menu
  const MORE = '.full [title="Picture and bars"]';
  await js(`document.querySelector(${JSON.stringify(MORE)}).click(); 1`);
  const mjs = (s: string) => mp.menu.window!.webContents.executeJavaScript(s, true);
  check('··· opens the menu and asks the brain for the devices', await until(async () => mp.menu.visible && (await mjs(`!!document.querySelector('#pm')`).catch(() => false)) === true, 6000) && asked.length === 1);
  check('while asking: "Looking for devices…"', await until(async () => (await mjs(`[...document.querySelectorAll('#pm button.dev')].map((b) => b.innerText.trim()).join('|')`)) === 'Looking for devices…', 2000));
  mp.setDevices({ t: 'media.devices', devices: [{ id: 'pc1', name: 'SHADOW-PC', kind: 'computer', active: false }, { id: 'ip1', name: 'iPhone', kind: 'phone', active: true }, { id: 'bad id', name: 'x', kind: 'phone', active: false }, { id: 'k1', name: 'Kitchen speaker', kind: 'speaker', active: false }] });
  const rows = async () => mjs(`[...document.querySelectorAll('#pm button.dev')].map((b) => b.innerText.trim() + (b.querySelector('[data-tick]') ? '*' : '')).join('|')`);
  check('the list: under PLAY ON, a tick on the one playing, odd ids left out', await until(async () => (await rows()) === 'SHADOW-PC|iPhone*|Kitchen speaker', 2000) && (await mjs(`[...document.querySelectorAll('#pm .mhead')].map((h) => h.textContent).join('|')`)) === 'PICTURE|PLAY ON', await rows());
  await mjs(`document.querySelector('#pm button[data-device="k1"]').click(); 1`);
  check('a pick moves the music there and closes the menu', await until(() => !mp.menu.visible && moved.join() === 'k1', 2000), moved);

  // ---------------------------------------------------------------- 1. corners
  await wait(400);
  const free = await corners(w), vfree = await corners(video);
  check('free: Windows\' round corners on the player (thin frame), no region', free.dwm === 2 && free.region === 0, free);
  check('free: the video round too', vfree.dwm === 2 && vfree.region === 0, vfree);
  // joined: dropped flush under the video
  const B = () => host.boxes();
  const vb = B().get('video')!, pb = B().get('player')!;
  host.drag('player', 'start'); const DX = vb.x + 10 - pb.x, DY = vb.y + vb.height + 5 - pb.y;
  host.drag('player', 'move', DX / 2, DY / 2); await wait(60); host.drag('player', 'move', DX - 3, DY); await wait(60);
  host.drag('player', 'move', DX, DY); await wait(60); host.drag('player', 'end', DX, DY);
  check('joined to the video', await until(() => host.joined('player'), 3000), { vb, pb, after: B().get('player') });
  await wait(1500);
  const j = await corners(w), vj = await corners(video);
  check('joined: Windows\' rounding off, the pixel-stepped region on (player)', j.dwm === 1 && j.region === 3, j);
  check('joined: the same for the video', vj.dwm === 1 && vj.region === 3, vj);
  // taken out again: free, the stepped region round on all four corners (winedge: once cut, always cut)
  host.pullApart('video'); await wait(700); host.endWiggle();
  await until(() => !host.joined('player'), 3000);
  await wait(1200);
  const fr = await corners(w);
  const fb = w.getBounds();
  check('free again: still shaped (stepped, all four round) and cut to its own size, never a square box', fr.region === 3 && fr.box === `0,0,${fb.width},${fb.height}`, { fr, fb });
  // the fold re-cuts it to the strip's height
  mp.setShade(true);
  await until(() => w.getContentSize()[1] === SHADE_H && !mp.folding, 3000);
  await wait(600);
  const fo = await corners(w), bh = Number(fo.box.split(',')[3]);
  check('folded: the region follows the strip\'s height', fo.region === 3 && Math.abs(bh - SHADE_H * (w.getBounds().height ? 1 : 1)) <= 2, { fo, h: w.getBounds().height });

  // hidden: the brain stops asking
  w.hide(); await wait(200);
  check('hidden: the brain is told', watched.at(-1) === false, watched);
  mp.dispose();
  video.destroy();
  check('no errors on the page', pageErrors.length === 0, pageErrors);
  console.log(bad ? `${bad} FAILED` : 'ALL PASS');
  host.dispose();
  stopEdgeHelper();
  app.exit(bad ? 1 : 0);
});
