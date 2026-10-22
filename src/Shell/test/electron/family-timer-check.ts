// The timer as a window-family member (2026-10-22, docs/TASKBAR-POPOUTS-RESEARCH.md). Real windows, off his screen
// (x around -5000), never focused or raised, no real mouse or keys. The video pop-out's page and a real timer
// (TimerWindows), members of one FamilyHost, plus a note, a job and the mini player only so their renderers can be weighed.
// Checks: the timer dropped on the video's right sticks FLUSH and reshapes to its STACKED column (140 wide, as tall as
// the video, hourglass over time); dropped below it becomes a strip as wide as the video; pull apart takes the timer
// into the wiggle with a gap; dragged out it leaves with its OWN shape and size. Also prints each pop-out renderer's
// memory (app.getAppMetrics, by webContents.getOSProcessId).
//
// Run: npx electron test/electron/family-timer-check.ts [folder for the pictures]
import { app, BrowserWindow, nativeImage } from 'electron';
import { mkdirSync, mkdtempSync, statSync, writeFileSync } from 'node:fs';
import os from 'node:os'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
import { servePages } from '../../src/pageserver.ts';
import { TimerWindows } from '../../src/timerwin.ts';
import { NoteWindows } from '../../src/notewin.ts';
import { JobPops } from '../../src/jobpop.ts';
import { MiniPlayer } from '../../src/miniplayer.ts';
import { FamilyHost } from '../../src/familywin.ts';

process.on('uncaughtException', (e) => { console.log('HARNESS ERROR ' + String((e as Error)?.stack ?? e).split('\n').slice(0, 4).join(' | ')); app.exit(2); });
process.on('unhandledRejection', (e) => { console.log('HARNESS REJECTION ' + String((e as Error)?.stack ?? e)); app.exit(2); });
setTimeout(() => { console.log('HARNESS TIMEOUT'); app.exit(3); }, 90_000).unref();
app.on('window-all-closed', () => {});
const TMP = mkdtempSync(path.join(os.tmpdir(), 'family-timer-check-'));
app.setPath('userData', TMP);
const HERE = path.dirname(fileURLToPath(import.meta.url));
BrowserWindow.prototype.show = function (this: BrowserWindow) { if (this.webContents.getURL().includes('familymenu')) this.setPosition(-9000, 100); this.showInactive(); };
BrowserWindow.prototype.focus = function () {};
BrowserWindow.prototype.moveTop = function () {};
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
let bad = 0;
const check = (what: string, ok: boolean, d: unknown = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${what}${d !== '' ? '  -- ' + String(typeof d === 'string' ? d : JSON.stringify(d)).slice(0, 400) : ''}`); if (!ok) bad++; };
const until = async (fn: () => boolean | Promise<boolean>, ms = 6000) => { const end = Date.now() + ms; while (Date.now() < end) { if (await fn()) return true; await wait(80); } return fn(); };
const OUT = (() => { const a = process.argv.at(-1); try { if (a && !a.endsWith('.ts')) { mkdirSync(a, { recursive: true }); if (statSync(a).isDirectory()) return a; } } catch { /* below */ } return os.tmpdir(); })();

async function picture(ws: BrowserWindow[], name: string): Promise<void> {
  const caps = await Promise.all(ws.map(async (w) => ({ img: await w.webContents.capturePage(), b: w.getContentBounds() })));
  const k = caps[0]!.img.getSize().width / caps[0]!.b.width;
  const L = Math.min(...caps.map((c) => c.b.x)) - 20, T = Math.min(...caps.map((c) => c.b.y)) - 20;
  const R = Math.max(...caps.map((c) => c.b.x + c.b.width)) + 20, B = Math.max(...caps.map((c) => c.b.y + c.b.height)) + 20;
  const Wd = Math.round((R - L) * k), Hd = Math.round((B - T) * k), out = Buffer.alloc(Wd * Hd * 4);
  for (let i = 0; i < out.length; i += 4) { out[i] = 40; out[i + 1] = 36; out[i + 2] = 34; out[i + 3] = 255; }
  for (const c of caps) {
    const s = c.img.getSize(), bits = c.img.toBitmap(), ox = Math.round((c.b.x - L) * k), oy = Math.round((c.b.y - T) * k);
    for (let y = 0; y < s.height; y++) for (let x = 0; x < s.width; x++) {
      const si = (y * s.width + x) * 4, d = ((y + oy) * Wd + x + ox) * 4, a = bits[si + 3]! / 255;
      if (!a || d < 0 || d + 3 >= out.length || x + ox >= Wd) continue;
      for (let ch = 0; ch < 3; ch++) out[d + ch] = Math.round(bits[si + ch]! + out[d + ch]! * (1 - a));
    }
  }
  const f = path.join(OUT, name);
  writeFileSync(f, nativeImage.createFromBitmap(out, { width: Wd, height: Hd }).toPNG());
  console.log('PICTURE ' + f);
}

function cover(): string {
  const n = 64, buf = Buffer.alloc(n * n * 4);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const i = (y * n + x) * 4, sea = y > 40;
    buf[i] = sea ? 90 : 80 + y; buf[i + 1] = sea ? 40 + (x % 7) : 120 + y; buf[i + 2] = sea ? 30 : 255 - y * 2; buf[i + 3] = 255;
  }
  return nativeImage.createFromBitmap(buf, { width: n, height: n }).toDataURL();
}

app.whenReady().then(async () => {
  const pages = await servePages(path.join(HERE, '..', '..', 'pages'));
  const host = new FamilyHost({ origin: pages.origin, saveFile: null });
  host.displays = () => [{ id: 11, scaleFactor: 1, bounds: { x: -6000, y: 0, width: 3000, height: 1600 } }];
  host.areas = () => [{ x: -6000, y: 0, width: 3000, height: 1600 }];
  const preload = path.join(HERE, '..', '..', 'src', 'preload.cjs');

  const video = new BrowserWindow({ x: -5200, y: 200, width: 640, height: 394, frame: false, transparent: false, backgroundColor: '#24160D', show: false,
    webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false, preload } });
  void video.loadURL(`${pages.origin}/popout.html`);
  video.once('ready-to-show', () => video.showInactive());
  host.add({ id: 'video', kind: 'video', win: () => (video.isDestroyed() ? null : video), card: '.frame', setOpacity: (n) => video.setOpacity(n), setPinned: () => {} });

  // The timer. TimerWindows clamps its first spot to a real screen, so it is moved off his screen before it is ever shown.
  const timers = new TimerWindows({ origin: pages.origin, preloadPath: preload, spotFile: path.join(TMP, 'timer-spot.json'), near: () => null });
  timers.family = host;
  timers.sync([{ id: 't1', label: 'Flask', total: 600_000, end: Date.now() + 420_000, paused: 0 }]);
  const tw = (timers as unknown as { wins: Map<string, { w: BrowserWindow }> }).wins.get('t1')!.w;
  tw.setPosition(-4300, 900);
  const TID = 'timer:t1';

  const ok = await until(() => host.members().length === 2 && !video.webContents.isLoading() && !tw.webContents.isLoading(), 12000);
  check('video + timer registered and loaded', ok, host.members());
  await wait(2000);
  const B = () => host.boxes();
  const vb = B().get('video')!, tb0 = B().get(TID)!;
  console.log('video ' + JSON.stringify(vb) + ' timer ' + JSON.stringify(tb0));
  check('the timer starts free, measured by its plate (not its 220x170 window)', host.shapeOf(TID) === 'free' && tb0.width < 220 && tb0.height < 120, tb0);

  const drop = async (id: string, dx: number, dy: number) => {
    host.drag(id, 'start'); host.drag(id, 'move', dx / 2, dy / 2); await wait(60); host.drag(id, 'move', dx - 3, dy); await wait(60);
    host.drag(id, 'move', dx, dy); await wait(60); host.drag(id, 'end', dx, dy);
  };
  const pageNow = () => tw.webContents.executeJavaScript(`(() => { const t = document.querySelector('.tw'); const r = t.getBoundingClientRect(); const cs = getComputedStyle(t);
    return { shape: document.documentElement.dataset.famShape || 'free', sized: 'famSized' in document.documentElement.dataset, dir: cs.flexDirection, w: Math.round(r.width), h: Math.round(r.height),
      wiggle: document.documentElement.classList.contains('fam-wiggle'), joined: document.documentElement.classList.contains('fam-joined'), sq: document.documentElement.dataset.famSq || '' }; })()`, true);

  // 1. Dropped on the video's right edge, a little low: flush, tops lined up, stacked column as tall as the video.
  await drop(TID, vb.x + vb.width + 5 - tb0.x, vb.y + 30 - tb0.y);
  await until(() => host.shapeOf(TID) === 'tall', 3000);
  await wait(1200);
  const tb1 = B().get(TID)!, p1 = await pageNow();
  // 2026-10-22 (his note: "a ton of empty space"): a compact column, only as tall as its content, at the top of that side
  check('beside the video: FLUSH, tops lined up, 140 wide, a compact column', host.joined(TID) && tb1.x === vb.x + vb.width && tb1.y === vb.y && tb1.width === 140 && tb1.height < vb.height, { tb1, vb });
  check('its page is STACKED (column, hourglass over time), 140 wide', p1.shape === 'tall' && p1.dir === 'column' && p1.sized && p1.w === 140 && p1.joined, p1);
  check('the side against the video is square, outer corners round', /tl/.test(p1.sq) && /bl/.test(p1.sq) && !/tr|br/.test(p1.sq), p1.sq);
  // Diagnosis (older): are the square corners only stale (worked out before the reshape)? Recount them now and look again.
  (host as unknown as { refreshSides(): void }).refreshSides();
  await wait(300);
  console.log('DIAG square corners after a fresh recount: ' + (await pageNow()).sq);
  await picture([video, tw], 'timer-beside.png');

  // 2. Pull apart: the timer wiggles with the video, with a gap.
  host.pullApart('video');
  await wait(800);
  const tsp = B().get(TID)!, vsp = B().get('video')!, p2 = await pageNow();
  check('pull apart: the timer is in the wiggle, a gap opened', host.wiggling && p2.wiggle && tsp.x > vsp.x + vsp.width, { tsp, vsp, p2 });

  // 3. Dragged well away and the wiggle ended: free, its own shape and size back.
  await drop(TID, 300, 260);
  await wait(900);
  host.endWiggle();
  await wait(1600);
  const tb2 = B().get(TID)!, p3 = await pageNow();
  // 1 px of width either way: the plate is as wide as its ticking time, and 7:00 and 6:58 are not the same width.
  check('taken out: free again, back to its OWN plate size and row shape', host.shapeOf(TID) === 'free' && !host.joined(TID) && Math.abs(tb2.width - tb0.width) <= 1 && tb2.height === tb0.height && p3.shape === 'free' && !p3.sized && p3.dir === 'row', { tb2, tb0, p3 });
  await picture([video, tw], 'timer-left.png');

  // 4. Dropped under the video: its own compact plate, flush (no long empty bar).
  const tb3 = B().get(TID)!, vb3 = B().get('video')!;
  await drop(TID, vb3.x + 40 - tb3.x, vb3.y + vb3.height + 5 - tb3.y);
  await until(() => host.joined(TID), 3000);
  await wait(1200);
  const tb4 = B().get(TID)!, p4 = await pageNow();
  check('below the video: its own compact plate, flush', host.joined(TID) && tb4.y === vb3.y + vb3.height && Math.abs(tb4.width - tb0.width) <= 1 && tb4.height === tb0.height && p4.shape === 'free', { tb4, vb3, p4 });
  await picture([video, tw], 'timer-below.png');

  // 5. Weigh each pop-out's renderer (a note, a job and the player opened only for this; off his screen).
  const notes = new NoteWindows({ origin: pages.origin, preloadPath: preload, save: () => {}, overAang: () => false });
  const nw = notes.show({ id: 'n1', title: 'Raid night', html: 'Bring flasks<br>Repair first', font: 'hand', size: 'm', out: { x: -4300, y: 1200, w: 260, h: 170, opacity: 1, pinned: false }, updated: 1 })!;
  const jp = new JobPops({ origin: pages.origin, preloadPath: path.join(HERE, '..', '..', 'src', 'jobpoppreload.cjs'), clampToScreen: false, aangRects: () => [] });
  const S1 = '0b6c2a8e-1111-4c3d-9e2f-aaaaaaaaaaaa';
  jp.update([{ id: S1, machine: 'pc', cwd: 'C:\\x', project: 'Waymark', title: 'Waymark', model: 'opus', phase: 'working', startedAt: Date.now() - 60_000, lastActivity: 1, prompt: 'go',
    tasks: ['Replay harness', 'Athlete model', 'Rules-only brain', 'Folding the route list', 'Readiness meter', 'Test week'].map((text, i) => ({ text, status: i < 3 ? 'completed' : i === 3 ? 'in_progress' : 'pending', ...(i === 3 ? { active: text } : {}) })),
    current: '', percent: null, etaMs: null, usage: null, open: '', held: 0,
    progress: { done: 3, total: 6, cur: 3, elapsedMs: 0, at: Date.now(), paceMs: 600_000, rev: 1, rewroteAt: null }, activity: { now: 'Folding the route list to one line', since: Date.now() - 12_000, agents: [] } }] as never, []);
  const jw = jp.open(S1, { x: -4800, y: 1200 })!;
  const player = new MiniPlayer({ origin: pages.origin, preloadPath: path.join(HERE, '..', '..', 'src', 'playerpreload.cjs'), clampToScreen: false });
  const pw = player.open();
  pw.setPosition(-5600, 1200);
  await until(() => [nw, jw, pw].every((w) => !w.webContents.isLoading()), 10000);
  // Something on them, for the taskbar mockup's thumbnails (sheet 66): a song on the player, a title on the video.
  player.media({ t: 'media.now', v: 1, app: 'spotify', spotify: true, title: 'Maria También', artist: 'Khruangbin', album: 'Con Todo El Mundo', status: 'playing', position: 101.2, duration: 241, at: Date.now(), canSeek: true, volume: 0.7, thumb: cover() });
  video.webContents.send('popout:show', { url: '', source: 'youtube', label: 'YouTube', live: false, title: 'Lofi beats to raid to' });
  await wait(4000);
  for (const [name, w] of [['video', video], ['timer', tw], ['note', nw], ['job', jw], ['player', pw]] as const) {
    writeFileSync(path.join(OUT, `pop-${name}.png`), (await w.webContents.capturePage()).toPNG());
  }
  console.log('PICTURES pop-*.png in ' + OUT);
  const metrics = new Map(app.getAppMetrics().map((m) => [m.pid, m]));
  const weigh: Record<string, string> = {};
  let sum = 0, n = 0;
  for (const [name, w] of [['video page', video], ['timer', tw], ['note', nw], ['job', jw], ['player', pw]] as const) {
    const m = metrics.get(w.webContents.getOSProcessId());
    if (!m) { weigh[name] = 'no metric'; continue; }
    const priv = Math.round((m.memory.privateBytes ?? 0) / 1024), ws = Math.round(m.memory.workingSetSize / 1024);
    weigh[name] = `private ${priv} MB, working set ${ws} MB`;
    sum += priv; n++;
  }
  console.log('RAM ' + JSON.stringify(weigh));
  console.log(`RAM average private per pop-out renderer: ${n ? Math.round(sum / n) : 0} MB over ${n}`);
  const pids = new Set([video, tw, nw, jw, pw].map((w) => w.webContents.getOSProcessId()));
  console.log(`RENDERERS ${pids.size} distinct processes for 5 windows`);

  console.log(bad ? `FAILED ${bad}` : 'ALL PASS');
  jp.dispose(); player.close();
  host.dispose();
  app.exit(bad ? 1 : 0);
}).catch((e) => { console.log('HARNESS ERROR ' + String((e as Error)?.stack ?? e)); app.exit(2); });
