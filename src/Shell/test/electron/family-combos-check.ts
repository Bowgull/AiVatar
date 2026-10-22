// The window family on his REAL screens (2026-10-22, his ask: "test this with different window combos and orientations to
// different corners of the screen/screens? I have two screens"). Real member windows (the video pop-out's page, a Claude
// job, the mini player, a note, a timer, a pinned snip), placed by the real display geometry (screen.getAllDisplays), but
// every window is INVISIBLE to him: opacity 0 from the moment it is made (before it is ever shown), shown inactive,
// never focusable, off the taskbar, never on top, mouse always passes through, never raised or focused, no real mouse or
// keys, no dialogs. Drags go through FamilyHost.drag, the way the member pages hand them over.
//
// The matrix (~49 cases):
//   joins     7 combos {video+job, video+player, video+job+player, note+timer, job+player+note, timer+snip, all six}, each
//             member on each side of its anchor (the pairs on all four sides; the bigger combos two arrangements each);
//   placement each built group dragged into the 4 corners and against the 4 edges of EACH screen (8 px over, or 9 px
//             short: the 20 px screen-edge snap must land it exactly), group moving as one on every step;
//   screens   a group dragged from one screen to the other (sizes kept, flush kept, in physical pixels too);
//   apart     pulled apart in a corner (the spread must not push anyone off the screen), one dragged to the outer side,
//             joined back;
//   leaving   a member pulled out gets its own size and shape back;
//   saved     the layout saved and put back on the same screens, and on a different screen arrangement (one screen).
// Each case asserts: one group, FLUSH (0 px gap, no overlap; also in physical pixels), the right shape (a column beside a
// taller window, a strip above/below a wider one, sizes matched), the joined corners square and the outer ones round (the
// family's own sums, what each page was told, and for the video / player the REAL window region read back from Windows
// in a few cases), every member fully on a screen. A failure draws a small diagram (rectangles of the windows and the
// screens, on an offscreen canvas page, never a picture of his desktop), at most 6.
//
// Run: npx electron test/electron/family-combos-check.ts [folder for the diagrams]
import { app, BrowserWindow, dialog, nativeImage, screen } from 'electron';
import { execFile } from 'node:child_process';
import { mkdirSync, mkdtempSync, statSync, writeFileSync } from 'node:fs';
import os from 'node:os'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
import { servePages } from '../../src/pageserver.ts';
import { NoteWindows } from '../../src/notewin.ts';
import { TimerWindows } from '../../src/timerwin.ts';
import { JobPops } from '../../src/jobpop.ts';
import { MiniPlayer } from '../../src/miniplayer.ts';
import { PinSnips } from '../../src/pinsnip.ts';
import { FamilyHost } from '../../src/familywin.ts';
import { EDGE_HELPER_CS, softEdge, stopEdgeHelper } from '../../src/winedge.ts';
import * as F from '../../src/family.ts';

// ------------------------------------------------------------------------------------------------ never on his screen
dialog.showErrorBox = () => {};
const closeAll = () => { for (const w of BrowserWindow.getAllWindows()) try { w.destroy(); } catch { /* gone */ } try { stopEdgeHelper(); } catch { /* gone */ } };
process.on('uncaughtException', (e) => { console.log('HARNESS ERROR ' + String((e as Error)?.stack ?? e).split('\n').slice(0, 4).join(' | ')); closeAll(); app.exit(1); });
process.on('unhandledRejection', (e) => { console.log('HARNESS REJECTION ' + String((e as Error)?.stack ?? e).split('\n').slice(0, 4).join(' | ')); closeAll(); app.exit(1); });
setTimeout(() => { console.log('HARNESS TIMEOUT (4 min)'); closeAll(); app.exit(3); }, 240_000).unref();
app.on('window-all-closed', () => {});
// Invisible windows behind his game count as covered: Chromium would stop drawing them and their pages would stop
// measuring (a check then reads a stale size). Keep them drawing.
app.commandLine.appendSwitch('disable-features', 'CalculateNativeWinOcclusion');
app.commandLine.appendSwitch('disable-backgrounding-occluded-windows');
app.commandLine.appendSwitch('disable-renderer-backgrounding');
const TMP = mkdtempSync(path.join(os.tmpdir(), 'family-combos-'));
app.setPath('userData', TMP);
const HERE = path.dirname(fileURLToPath(import.meta.url));
const P = BrowserWindow.prototype;
const orig = { setOpacity: P.setOpacity, showInactive: P.showInactive, setAlwaysOnTop: P.setAlwaysOnTop, setIgnoreMouseEvents: P.setIgnoreMouseEvents };
// Every window: invisible from birth, off the taskbar, never on top, mouse passes through. Before its first show.
app.on('browser-window-created', (_e, w) => {
  orig.setOpacity.call(w, 0);
  try { w.setSkipTaskbar(true); } catch { /* fine */ }
  try { w.setFocusable(false); } catch { /* fine */ }
  orig.setAlwaysOnTop.call(w, false);
  orig.setIgnoreMouseEvents.call(w, true);
});
P.setOpacity = function (this: BrowserWindow) { orig.setOpacity.call(this, 0); };
P.showInactive = function (this: BrowserWindow) { orig.setOpacity.call(this, 0); orig.setIgnoreMouseEvents.call(this, true); orig.showInactive.call(this); };
P.show = function (this: BrowserWindow) { if (this.webContents.getURL().includes('familymenu')) this.setPosition(-9000, 100); this.showInactive(); };
P.focus = function () {};
P.moveTop = function () {};
P.setAlwaysOnTop = function () {};
P.setIgnoreMouseEvents = function (this: BrowserWindow) { orig.setIgnoreMouseEvents.call(this, true); };
// A bad position must never reach Windows; if one does, say where it came from (it would be an uncaught error in the Shell).
const setPos0 = P.setPosition;
P.setPosition = function (this: BrowserWindow, x: number, y: number, an?: boolean) { if (!Number.isFinite(x) || !Number.isFinite(y)) console.log('BAD POSITION ' + x + ',' + y + ' ' + String(new Error().stack).split('\n').slice(2, 6).join(' < ')); setPos0.call(this, x, y, an); };

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const until = async (fn: () => boolean | Promise<boolean>, ms = 6000) => { const end = Date.now() + ms; while (Date.now() < end) { if (await fn()) return true; await wait(60); } return fn(); };
const OUT = (() => { const a = process.argv.at(-1); try { if (a && !a.endsWith('.ts')) { mkdirSync(a, { recursive: true }); if (statSync(a).isDirectory()) return a; } } catch { /* below */ } return os.tmpdir(); })();

// ------------------------------------------------------------------------------------------------ region probe (family2)
const hwnd = (w: BrowserWindow) => { const b = w.getNativeWindowHandle(); return (b.length >= 8 ? b.readBigUInt64LE(0) : BigInt(b.readUInt32LE(0))).toString(); };
const READ = `
namespace Probe { public static class R {
  [DllImport("user32.dll")] static extern int GetWindowRgn(IntPtr h, IntPtr r);
  [DllImport("gdi32.dll")] static extern IntPtr CreateRectRgn(int a, int b, int c, int d);
  [DllImport("gdi32.dll")] static extern int GetRegionData(IntPtr r, int n, byte[] d);
  [DllImport("gdi32.dll")] static extern bool DeleteObject(IntPtr o);
  [DllImport("user32.dll")] static extern bool GetWindowRect(IntPtr h, out Aang.Win.R r);
  public static string Read(IntPtr h) {
    Aang.Win.R w; GetWindowRect(h, out w);
    var sb = new System.Text.StringBuilder();
    sb.Append("{\\"wl\\":" + w.l + ",\\"wt\\":" + w.t + ",\\"rects\\":");
    IntPtr r = CreateRectRgn(0, 0, 0, 0);
    int t = GetWindowRgn(h, r);
    if (t == 0) { sb.Append("null}"); DeleteObject(r); return sb.ToString(); }
    int n = GetRegionData(r, 0, null); byte[] d = new byte[n]; GetRegionData(r, n, d); DeleteObject(r);
    int count = BitConverter.ToInt32(d, 8); sb.Append("[");
    for (int i = 0; i < count; i++) { int off = 32 + i * 16; if (i > 0) sb.Append(","); sb.Append("[" + BitConverter.ToInt32(d, off) + "," + BitConverter.ToInt32(d, off + 4) + "," + BitConverter.ToInt32(d, off + 8) + "," + BitConverter.ToInt32(d, off + 12) + "]"); }
    sb.Append("]}"); return sb.ToString();
  }
} }
`;
type Probe = { wl: number; wt: number; rects: number[][] | null };
function probe(h: string): Promise<Probe> {
  const file = path.join(TMP, 'probe.ps1');
  writeFileSync(file, `Add-Type -TypeDefinition @'\n${EDGE_HELPER_CS}\n${READ}\n'@\nWrite-Output ([Probe.R]::Read([IntPtr]::new(${h})))\n`);
  return new Promise((res, rej) => execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', file], { encoding: 'utf8', windowsHide: true, timeout: 30000 }, (_e, so, se) => {
    const j = String(so || '').split(/\r?\n/).find((l) => l.startsWith('{'));
    if (!j) { rej(new Error('probe: ' + String(se || so).slice(0, 300))); return; }
    res(JSON.parse(j) as Probe);
  }));
}
function rowsOf(p: Probe, vis: Electron.Rectangle): [number, number][] {
  const vx = vis.x - p.wl, vy = vis.y - p.wt;
  const rows: [number, number][] = Array.from({ length: vis.height }, () => [Infinity, -Infinity] as [number, number]);
  for (const [l, t, r, b] of p.rects ?? []) for (let y = t; y < b; y++) { const row = rows[y - vy]; if (row) { row[0] = Math.min(row[0], l - vx); row[1] = Math.max(row[1], r - vx); } }
  return rows;
}

// ------------------------------------------------------------------------------------------------ the data
const S1 = '0b6c2a8e-1111-4c3d-9e2f-aaaaaaaaaaaa';
const JOB = { id: S1, machine: 'pc', cwd: 'C:\\x', project: 'Waymark', title: 'Waymark', model: 'opus', phase: 'working', startedAt: Date.now() - 30 * 60_000, lastActivity: 1, prompt: 'go',
  tasks: ['Replay harness', 'Athlete model', 'Rules-only brain', 'Folding the route list', 'Readiness meter', 'Test week'].map((text, i) => ({ text, status: i < 3 ? 'completed' : i === 3 ? 'in_progress' : 'pending', ...(i === 3 ? { active: text } : {}) })),
  current: '', percent: null, etaMs: null, usage: null, open: '', held: 0,
  progress: { done: 3, total: 6, cur: 3, elapsedMs: 0, at: Date.now(), paceMs: 600_000, rev: 1, rewroteAt: null },
  activity: { now: 'Folding the route list to one line', since: Date.now() - 12_000, agents: [] } };
const V = 'video', J = 'job:' + S1, PL = 'player', N = 'note:n1', T = 'timer:t1', S = 'snip:1';
const ALL = [V, J, PL, N, T, S];
const SHORT: Record<string, string> = { [V]: 'video', [J]: 'job', [PL]: 'player', [N]: 'note', [T]: 'timer', [S]: 'snip' };

type Box = F.Box;
interface Live { pending: unknown[]; last: unknown; m: { win(): BrowserWindow | null } }
interface HostIn { fam: F.Fam; live: Map<string, Live>; wiggle: { ids: string[]; fam: F.Fam } | null; leave(id: string, relayout?: boolean, byHim?: boolean): void; setPos(id: string, x: number, y: number): void; layoutsOf(id: string): F.Layouts | undefined }

let pass = 0, fail = 0, shots = 0;
const results: string[] = [];

app.whenReady().then(async () => {
  const displays = screen.getAllDisplays();
  const prim = screen.getPrimaryDisplay();
  // Screen 1 = the primary, screen 2 = the other (his SB220Q).
  const SCR = [prim, ...displays.filter((d) => d.id !== prim.id)];
  console.log('SCREENS ' + JSON.stringify(SCR.map((d) => ({ label: d.label, bounds: d.bounds, workArea: d.workArea, scale: d.scaleFactor }))));
  if (SCR.length < 2) console.log('NOTE only one screen found; screen 2 cases use screen 1');
  const area = (si: number) => (SCR[si] ?? SCR[0]!).workArea;
  const dpiDiffers = SCR.length > 1 && SCR[0]!.scaleFactor !== SCR[1]!.scaleFactor;

  const pages = await servePages(path.join(HERE, '..', '..', 'pages'));
  const host = new FamilyHost({ origin: pages.origin, saveFile: path.join(TMP, 'family-layout.json') });
  const H = host as unknown as HostIn;
  const preload = path.join(HERE, '..', '..', 'src', 'preload.cjs');
  const PARK = (i: number) => ({ x: -1800 + i * 600, y: 3200 });   // off every display

  // The video, made the way popout.ts makes it (Windows' own corners; joined, a stepped region).
  const video = new BrowserWindow({ x: PARK(0).x, y: PARK(0).y, width: 640, height: 394, titleBarStyle: 'hidden', thickFrame: true, transparent: false, backgroundColor: '#24160D', show: false, skipTaskbar: true, focusable: false,
    webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false, preload } });
  void video.loadURL(`${pages.origin}/popout.html`);
  video.once('ready-to-show', () => { video.showInactive(); softEdge(video); });
  host.add({ id: V, kind: 'video', win: () => (video.isDestroyed() ? null : video), card: '.frame', osCorners: true, setOpacity: (n) => video.setOpacity(n), setPinned: () => {} });

  const jp = new JobPops({ origin: pages.origin, preloadPath: path.join(HERE, '..', '..', 'src', 'jobpoppreload.cjs'), clampToScreen: false, aangRects: () => [] });
  jp.family = host;
  jp.update([JOB] as never, []);
  const jw = jp.open(S1, PARK(1))!;

  const player = new MiniPlayer({ origin: pages.origin, preloadPath: path.join(HERE, '..', '..', 'src', 'playerpreload.cjs'), clampToScreen: false });
  player.family = host;
  const pw = player.open();
  pw.setPosition(PARK(2).x, PARK(2).y);

  const notes = new NoteWindows({ origin: pages.origin, preloadPath: preload, save: () => {}, overAang: () => false });
  notes.family = host;
  const nw = notes.show({ id: 'n1', title: 'Raid night', html: 'Bring flasks<br>Repair first<br>Pull at 8', font: 'hand', size: 'm', out: { x: PARK(3).x, y: PARK(3).y, w: 260, h: 170, opacity: 1, pinned: false }, updated: 1 })!;

  const spotFile = path.join(TMP, 'timer-spot.json');
  writeFileSync(spotFile, JSON.stringify({ x: 200, y: 200 }));
  const timers = new TimerWindows({ origin: pages.origin, preloadPath: preload, spotFile, near: () => null });
  timers.family = host;
  timers.sync([{ id: 't1', label: 'Flask', total: 600_000, end: Date.now() + 420_000, paused: 0 }]);
  const tw = (timers as unknown as { wins: Map<string, { w: BrowserWindow }> }).wins.get('t1')!.w;
  tw.setPosition(PARK(4).x, PARK(4).y);

  const snipFile = path.join(TMP, 'snip.png');
  { const w = 300, h = 200, buf = Buffer.alloc(w * h * 4); for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const i = (y * w + x) * 4; buf[i] = 60 + (x % 50); buf[i + 1] = 90 + (y % 40); buf[i + 2] = 140; buf[i + 3] = 255; } writeFileSync(snipFile, nativeImage.createFromBitmap(buf, { width: w, height: h }).toPNG()); }
  const snips = new PinSnips({ origin: pages.origin, preloadPath: path.join(HERE, '..', '..', 'src', 'pinsnippreload.cjs'), clampToScreen: false });
  snips.family = host;
  const sw = snips.open(snipFile, 'Boss timers')!;
  sw.setPosition(PARK(5).x, PARK(5).y);

  const WIN: Record<string, BrowserWindow> = { [V]: video, [J]: jw, [PL]: pw, [N]: nw, [T]: tw, [S]: sw };
  const loaded = await until(() => ALL.every((id) => host.members().includes(id)) && Object.values(WIN).every((w) => !w.webContents.isLoading()), 15000);
  console.log('members ' + host.members().join(', ') + (loaded ? '' : '  (NOT ALL LOADED)'));
  if (!loaded) { closeAll(); app.exit(1); return; }
  await wait(2200);   // pages measured, first-open restore passes done (nothing saved yet)

  // The diagram page: a hidden canvas (invisible like the rest), never a picture of his desktop.
  const canvasWin = new BrowserWindow({ show: false, width: 200, height: 200, skipTaskbar: true, focusable: false, webPreferences: { sandbox: true, contextIsolation: true } });
  await canvasWin.loadURL('data:text/html,<canvas id=c></canvas>');

  // ---------------------------------------------------------------------------------------------- helpers
  const B = () => host.boxes();
  const box = (id: string) => B().get(id)!;
  const own0 = new Map(ALL.map((id) => [id, { ...H.fam.get(id)!.own }]));
  console.log('OWN ' + JSON.stringify(Object.fromEntries([...own0].map(([id, o]) => [SHORT[id], o]))));
  const busy = () => host.busy || [...H.live.values()].some((l) => l.pending.length > 0);
  /** Every joined member's panel is at the size its side asks for (its page has reported it). */
  const fitsMet = (now: Map<string, Box>) => {
    const f = F.clone(H.fam);
    for (const [id, m] of f) m.box = now.get(id)!;
    const fits = F.fitShapes(f, (m) => H.layoutsOf(m.id));
    return ALL.filter((id) => host.joined(id)).filter((id) => { const t = fits.get(id)!, b = now.get(id)!; return t.shape !== 'free' && ((t.width !== undefined && t.width !== b.width) || (t.height !== undefined && t.height !== b.height)); });
  };
  let maxLag = 0, lagWho = '';
  async function settle(max = 5000): Promise<boolean> {
    const t0 = Date.now();
    await wait(100);
    const end = Date.now() + max;
    let prev = '', same = 0;
    while (Date.now() < end) {
      const now = B(), s = JSON.stringify([...now]);
      if (!busy() && s === prev) { if (++same >= 3) { const off = fitsMet(now); if (!off.length) { const lag = Date.now() - t0; if (lag > maxLag) { maxLag = lag; lagWho = n + ''; } return true; } } } else same = 0;
      prev = s;
      await wait(140);
    }
    const off = fitsMet(B());
    console.log('  not settled: off their fit: ' + off.map((x) => SHORT[x]).join(','));
    for (const id of off) {
      const l = H.live.get(id) as unknown as Record<string, unknown>, w = WIN[id]!;
      const pg = await w.webContents.executeJavaScript(`(() => { const d = document.documentElement; const c = document.querySelector(${JSON.stringify(id === PL ? '.mp' : '.frame')}); const r = c && c.getBoundingClientRect();
        return { shape: d.dataset.famShape, sized: d.dataset.famSized, fw: d.style.getPropertyValue('--fam-w'), fh: d.style.getPropertyValue('--fam-h'), pad: d.style.padding, rect: r && [r.x, r.y, r.width, r.height], vw: innerWidth, vh: innerHeight }; })()`, true).catch((e) => String(e));
      console.log('  DEBUG ' + SHORT[id] + ' ' + JSON.stringify({ win: w.getBounds(), content: w.getContentBounds(), card: l.card, sized: l.sized, shape: l.shape, view: l.view, chrome: l.chrome, applied: l.applied, pad: l.pad, regioned: l.regioned, page: pg }));
    }
    return false;
  }
  const outline = (bs: Box[]) => { const L = Math.min(...bs.map((b) => b.x)), Tp = Math.min(...bs.map((b) => b.y)), R = Math.max(...bs.map((b) => b.x + b.width)), Bt = Math.max(...bs.map((b) => b.y + b.height)); return { x: L, y: Tp, width: R - L, height: Bt - Tp }; };
  const inside = (b: Box, a: Box, slack = 0) => b.x >= a.x - slack && b.y >= a.y - slack && b.x + b.width <= a.x + a.width + slack && b.y + b.height <= a.y + a.height + slack;
  const onAScreen = (b: Box, slack = 0) => SCR.some((d) => inside(b, d.workArea, slack));
  const ovl = (a: Box, b: Box) => Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));

  /** Break every group (as if each left), back to own shapes, everyone parked off the screens. */
  async function reset(): Promise<void> {
    if (host.wiggling) host.endWiggle();
    for (let i = 0; i < 8; i++) { const j = ALL.find((id) => host.joined(id)); if (!j) break; H.leave(j, true, true); }
    await settle();
    ALL.forEach((id, i) => { const l = H.live.get(id); if (l) l.last = null; H.setPos(id, PARK(i).x, PARK(i).y); });
    for (const l of H.live.values()) l.last = null;
    await wait(80);
    // Nobody's own size may drift (it is what each goes back to when it leaves).
    // (The timer is left out: its plate's width follows its ticking digits.)
    const drift = ALL.filter((id) => id !== T).filter((id) => { const o = H.fam.get(id)!.own, w = own0.get(id)!; return o.width !== w.width || o.height !== w.height; });
    if (drift.length) { console.log('OWN DRIFT ' + drift.map((id) => `${SHORT[id]} ${JSON.stringify(H.fam.get(id)!.own)} (was ${JSON.stringify(own0.get(id))})`).join('; ')); driftSeen.push(...drift.map((x) => SHORT[x]!)); for (const id of drift) H.fam.get(id)!.own = { ...own0.get(id)! }; }
  }
  const driftSeen: string[] = [];
  /** Put a solo member's panel at x,y (as if he had left it there). */
  const putAt = (id: string, x: number, y: number) => { const l = H.live.get(id); if (l) l.last = null; H.setPos(id, Math.round(x), Math.round(y)); };

  /** His drag of `id` (its whole group comes) by dx,dy: three steps, slow at the end. Checks the group moves as one. */
  async function drag(id: string, dx: number, dy: number, problems: string[]): Promise<void> {
    const g = host.groupOf(id), start = new Map(g.map((x) => [x, box(x)]));
    host.drag(id, 'start');
    const steps: [number, number][] = [[Math.round(dx / 2), Math.round(dy / 2)], [dx - 3, dy], [dx, dy]];
    for (const [sx, sy] of steps) {
      host.drag(id, 'move', sx, sy);
      await wait(60);
      if (g.length > 1) {
        const now = B(), d0 = { x: now.get(g[0]!)!.x - start.get(g[0]!)!.x, y: now.get(g[0]!)!.y - start.get(g[0]!)!.y };
        const off = g.filter((x) => now.get(x)!.x - start.get(x)!.x !== d0.x || now.get(x)!.y - start.get(x)!.y !== d0.y);
        if (off.length) problems.push(`group did not move as one at step ${sx},${sy}: ${off.map((x) => SHORT[x]).join(',')}`);
      }
    }
    host.drag(id, 'end', dx, dy);
  }
  /** Drop a solo member near `side` of target (6 px off, 12 px along): it should stick and join. */
  async function join(id: string, target: string, side: F.Side, problems: string[]): Promise<void> {
    const m = box(id), t = box(target);
    const to = side === 'right' ? { x: t.x + t.width + 6, y: t.y + 12 } : side === 'left' ? { x: t.x - m.width - 6, y: t.y + 12 }
      : side === 'below' ? { x: t.x + 12, y: t.y + t.height + 6 } : { x: t.x + 12, y: t.y - m.height - 6 };
    await drag(id, to.x - m.x, to.y - m.y, problems);
    if (!(await settle())) problems.push(`not settled after ${SHORT[id]} joined ${side} of ${SHORT[target]}`);
    const now = B(), c = F.contact(now.get(id)!, now.get(target)!);
    if (!host.joined(id) || !host.groupOf(id).includes(target)) problems.push(`${SHORT[id]} did not join ${SHORT[target]} (${side})`);
    else if (c !== side) problems.push(`${SHORT[id]} sits ${c ?? 'apart from'} ${SHORT[target]}, not ${side}`);
  }

  /** The checks every case makes on a group. */
  async function checkGroup(ids: string[], problems: string[], o: { area?: Box } = {}): Promise<void> {
    const now = B(), f = F.clone(H.fam);
    for (const [id, m] of f) m.box = now.get(id)!;
    const g = host.groupOf(ids[0]!);
    if (g.length !== ids.length || ids.some((x) => !g.includes(x))) problems.push(`group is [${g.map((x) => SHORT[x])}] not [${ids.map((x) => SHORT[x])}]`);
    // Flush: each one exactly where its anchor puts it, touching; nobody overlapping.
    for (const id of g.slice(1)) {
      const m = f.get(id)!, p = f.get(m.anchor!.to)!, at = F.place(p.box, m.box, m.anchor!);
      if (at.x !== m.box.x || at.y !== m.box.y) problems.push(`${SHORT[id]} not flush on ${m.anchor!.side} of ${SHORT[p.id]}: at ${m.box.x},${m.box.y} want ${at.x},${at.y}`);
      if (F.contact(m.box, p.box) !== m.anchor!.side) problems.push(`${SHORT[id]} does not touch ${SHORT[p.id]} (${m.anchor!.side})`);
      // The same in physical pixels (a DPI change must not open a seam).
      const pm = screen.dipToScreenRect(null, m.box), pp = screen.dipToScreenRect(null, p.box);
      if (F.contact(pm, pp) !== m.anchor!.side) problems.push(`${SHORT[id]} / ${SHORT[p.id]} not flush in physical px ${JSON.stringify([pm, pp])}`);
    }
    for (let i = 0; i < g.length; i++) for (let k = i + 1; k < g.length; k++) { const a = ovl(now.get(g[i]!)!, now.get(g[k]!)!); if (a > 0) problems.push(`${SHORT[g[i]!]} overlaps ${SHORT[g[k]!]} by ${a} px²`); }
    // Shapes: what the family's own rule says for these boxes, and the plain rule (column = as tall, strip = as wide).
    const fits = F.fitShapes(f, (m) => H.layoutsOf(m.id));
    for (const id of g) {
      const ft = fits.get(id)!, b = now.get(id)!, shape = host.shapeOf(id);
      if (shape !== ft.shape) problems.push(`${SHORT[id]} is ${shape}, its side says ${ft.shape}`);
      if (ft.width !== undefined && ft.shape !== 'free' && b.width !== ft.width) problems.push(`${SHORT[id]} ${ft.shape} width ${b.width} want ${ft.width}`);
      if (ft.height !== undefined && ft.shape !== 'free' && b.height !== ft.height) problems.push(`${SHORT[id]} ${ft.shape} height ${b.height} want ${ft.height}`);
      const a = f.get(id)!.anchor, L = H.layoutsOf(id);
      if (a && L && !L.aspect && !L.max) {
        const p = now.get(a.to)!;
        // A fitHeight column (the timer since v2, his "a ton of empty space") is only as tall as its own page, never taller.
        if (shape === 'tall' && L.tall?.fitHeight ? b.height > p.height : shape === 'tall' && b.height !== p.height) problems.push(`${SHORT[id]} column ${b.height} tall beside ${SHORT[a.to]} ${p.height}`);
        if (shape === 'wide' && b.width !== p.width) problems.push(`${SHORT[id]} strip ${b.width} wide on ${SHORT[a.to]} ${p.width}`);
      }
    }
    // Corners: the joined ones square, the outer ones round; what the family holds, and what each page was told.
    const sq = F.squareCorners(f);
    for (const id of g) {
      const want = [...(sq.get(id) ?? [])].sort().join(' '), got = host.squareOf(id).sort().join(' ');
      if (want !== got) problems.push(`${SHORT[id]} square corners [${got}] want [${want}]`);
      const page = String(await WIN[id]!.webContents.executeJavaScript(`document.documentElement.dataset.famSq || ''`, true)).split(' ').filter(Boolean).sort().join(' ');
      if (page !== want) problems.push(`${SHORT[id]} page told [${page}] want [${want}]`);
    }
    // On a screen, whole.
    for (const id of g) { const b = now.get(id)!; if (!onAScreen(b)) problems.push(`${SHORT[id]} not fully on a screen ${JSON.stringify(b)}`); if (o.area && !inside(b, o.area)) problems.push(`${SHORT[id]} not on the target screen ${JSON.stringify(b)}`); }
  }

  /** The real window region of an osCorners member, against the stepped shape its square corners call for. */
  async function checkRegion(id: string, problems: string[]): Promise<void> {
    const w = WIN[id]!;
    let p = await probe(hwnd(w));
    if (!p.rects) { await wait(800); p = await probe(hwnd(w)); }
    const vis = screen.dipToScreenRect(w, w.getBounds()), got = rowsOf(p, vis);
    const scale = screen.getDisplayMatching(w.getBounds()).scaleFactor;
    const mask = F.roundMask(host.squareOf(id)), want: [number, number][] = [];
    for (const u of F.regionRuns(vis.width, vis.height, mask, F.cornerSteps(F.CORNER_RADIUS * scale))) for (let y = u.y0; y < u.y1; y++) want.push([u.l, vis.width - u.r]);
    const diff = got.findIndex((r, y) => r[0] !== want[y]![0] || r[1] !== want[y]![1]);
    if (!p.rects || diff !== -1) problems.push(`${SHORT[id]} window region wrong (mask ${mask}): ${p.rects ? `row ${diff} got ${JSON.stringify(got[diff])} want ${JSON.stringify(want[diff])}` : 'no region'}`);
    else console.log(`  region ${SHORT[id]} ok: mask ${mask}, ${vis.width}x${vis.height} physical, rows ${got.length}`);
  }

  async function diagram(name: string, problems: string[], ids: string[], extra?: Map<string, Box>): Promise<void> {
    if (shots >= 6) return;
    shots++;
    const now = extra ?? B();
    const rects = ids.map((id) => ({ id: SHORT[id], b: now.get(id)!, sq: host.squareOf(id) }));
    const scr = SCR.map((d, i) => ({ name: `screen ${i + 1} ${d.label} x${d.scaleFactor}`, b: d.bounds, wa: d.workArea }));
    const all = [...scr.map((s) => s.b), ...rects.map((r) => r.b)];
    const ext = outline(all);
    const spec = { title: name, problems: problems.slice(0, 6), rects, scr, ext };
    const url = await canvasWin.webContents.executeJavaScript(`(() => { const s = ${JSON.stringify(spec)};
      const W = 1400, k = (W - 40) / s.ext.width, Hh = Math.round(s.ext.height * k) + 40 + 18 * (s.problems.length + 1) + 10;
      const c = document.getElementById('c'); c.width = W; c.height = Hh; const g = c.getContext('2d');
      g.fillStyle = '#1d1a17'; g.fillRect(0, 0, W, Hh);
      const X = (x) => 20 + (x - s.ext.x) * k, Y = (y) => 20 + 18 * (s.problems.length + 1) + (y - s.ext.y) * k;
      g.font = '13px Consolas, monospace'; g.fillStyle = '#ffd27a'; g.fillText(s.title, 20, 16);
      g.fillStyle = '#ff8a7a'; s.problems.forEach((p, i) => g.fillText(p.slice(0, 180), 20, 34 + 18 * i));
      for (const d of s.scr) { g.fillStyle = '#2e2a26'; g.fillRect(X(d.b.x), Y(d.b.y), d.b.width * k, d.b.height * k); g.strokeStyle = '#8a7f70'; g.strokeRect(X(d.wa.x) + .5, Y(d.wa.y) + .5, d.wa.width * k, d.wa.height * k); g.fillStyle = '#8a7f70'; g.fillText(d.name, X(d.b.x) + 6, Y(d.b.y) + 16); }
      const cols = ['#e0a050', '#5fb0e0', '#9be07a', '#e07ab8', '#e0d36a', '#b08cf0'];
      s.rects.forEach((r, i) => { g.fillStyle = cols[i % 6] + '55'; g.fillRect(X(r.b.x), Y(r.b.y), r.b.width * k, r.b.height * k); g.strokeStyle = cols[i % 6]; g.lineWidth = 1; g.strokeRect(X(r.b.x) + .5, Y(r.b.y) + .5, r.b.width * k - 1, r.b.height * k - 1);
        g.fillStyle = '#fff'; g.fillText(r.id + ' ' + r.b.width + 'x' + r.b.height + ' @' + r.b.x + ',' + r.b.y + (r.sq.length ? ' sq:' + r.sq.join('') : ''), X(r.b.x) + 4, Y(r.b.y) + 14); });
      return c.toDataURL('image/png'); })()`, true) as string;
    const f = path.join(OUT, `combos-${String(shots)}-${name.replace(/[^a-z0-9]+/gi, '-').slice(0, 50)}.png`);
    writeFileSync(f, Buffer.from(url.split(',')[1]!, 'base64'));
    console.log('DIAGRAM ' + f);
  }

  async function record(name: string, problems: string[], ids: string[], extra?: Map<string, Box>): Promise<void> {
    if (problems.length) { fail++; console.log(`FAIL  ${name}  -- ${problems.slice(0, 5).join(' | ')}`); results.push('FAIL ' + name); await diagram(name, problems, ids, extra); }
    else { pass++; console.log(`PASS  ${name}`); }
  }

  // ---------------------------------------------------------------------------------------------- the matrix
  type Join = [string, string, F.Side];
  type Place = { kind: 'corner'; c: 'tl' | 'tr' | 'br' | 'bl'; si: number; over: boolean } | { kind: 'edge'; e: 'left' | 'right' | 'top' | 'bottom'; si: number; over: boolean };
  type Follow = Place | { kind: 'cross'; to: number } | { kind: 'apart'; c: 'tl' | 'tr' | 'br' | 'bl'; si: number; outer: boolean };
  interface Case { combo: string; ids: string[]; anchor: string; joins: Join[]; si: number; at?: [number, number]; then: Follow; region?: string }
  const sides: F.Side[] = ['right', 'left', 'below', 'above'];
  const places: Place[] = [];
  for (const si of [0, 1]) for (const c of ['tl', 'tr', 'br', 'bl'] as const) places.push({ kind: 'corner', c, si, over: places.length % 2 === 1 });
  for (const si of [0, 1]) for (const e of ['left', 'right', 'top', 'bottom'] as const) places.push({ kind: 'edge', e, si, over: places.length % 2 === 1 });
  const cases: Case[] = [];
  const pairs: [string, string, string][] = [['video+job', V, J], ['video+player', V, PL], ['note+timer', N, T], ['timer+snip', S, T]];
  let pi = 0;
  for (const [combo, a, m] of pairs) for (const s of sides) { cases.push({ combo, ids: [a, m], anchor: a, joins: [[m, a, s]], si: pi % 2, then: places[pi]!, ...(combo === 'video+player' && s === 'left' ? { region: PL } : {}) }); pi++; }
  cases.push({ combo: 'video+job+player A', ids: [V, J, PL], anchor: V, joins: [[J, V, 'right'], [PL, V, 'below']], si: 0, at: [0.4, 0.2], then: { kind: 'cross', to: 1 }, region: V });
  cases.push({ combo: 'video+job+player B', ids: [V, J, PL], anchor: V, joins: [[J, V, 'left'], [PL, V, 'above']], si: 1, at: [0.5, 0.6], then: { kind: 'apart', c: 'br', si: 1, outer: false } });
  cases.push({ combo: 'job+player+note A', ids: [PL, J, N], anchor: PL, joins: [[J, PL, 'below'], [N, PL, 'right']], si: 0, then: { kind: 'apart', c: 'tl', si: 0, outer: true } });
  cases.push({ combo: 'job+player+note B', ids: [PL, J, N], anchor: PL, joins: [[J, PL, 'right'], [N, PL, 'above']], si: 1, then: { kind: 'apart', c: 'tr', si: 1, outer: true } });
  cases.push({ combo: 'all six A', ids: [V, J, S, N, T, PL], anchor: V, joins: [[J, V, 'right'], [S, J, 'right'], [N, V, 'left'], [T, V, 'above'], [PL, V, 'below']], si: 1, at: [0.2, 0.45], then: { kind: 'cross', to: 0 } });
  cases.push({ combo: 'all six B', ids: [V, J, PL, S, N, T], anchor: V, joins: [[J, V, 'below'], [PL, V, 'right'], [S, PL, 'right'], [N, V, 'above'], [T, V, 'left']], si: 0, at: [0.12, 0.5], then: { kind: 'apart', c: 'bl', si: 0, outer: false } });

  const placeName = (p: Follow) => p.kind === 'corner' ? `${p.c.toUpperCase()} corner of screen ${p.si + 1}${p.over ? ' (8 px over)' : ' (9 px short)'}`
    : p.kind === 'edge' ? `${p.e} edge of screen ${p.si + 1}${p.over ? ' (8 px over)' : ' (9 px short)'}`
    : p.kind === 'cross' ? `dragged to screen ${p.to + 1}` : `pulled apart in the ${p.c.toUpperCase()} corner of screen ${p.si + 1}${p.outer ? ', one moved to the outer side' : ''}, joined back`;

  /** Move a group so its outline lands at the corner / edge (d px inside, or over), grabbing `by`. */
  async function place(by: string, p: Place | { kind: 'corner'; c: string; si: number; over: boolean }, problems: string[]): Promise<Box> {
    const g = host.groupOf(by), o = outline(g.map((x) => box(x))), a = area(p.si), d = p.over ? -8 : 9;
    const c = p.kind === 'corner' ? p.c : (p as { e: string }).e;
    const L = c === 'tl' || c === 'bl' || c === 'left', R = c === 'tr' || c === 'br' || c === 'right';
    const Tp = c === 'tl' || c === 'tr' || c === 'top', Bt = c === 'bl' || c === 'br' || c === 'bottom';
    let x = a.x + Math.round((a.width - o.width) / 2), y = a.y + Math.round((a.height - o.height) / 2);
    if (L) x = a.x + d; if (R) x = a.x + a.width - o.width - d;
    if (Tp) y = a.y + d; if (Bt) y = a.y + a.height - o.height - d;
    await drag(by, x - o.x, y - o.y, problems);
    if (!(await settle())) problems.push('not settled after the move');
    // Where it should have snapped: flush on the edge(s) it was brought to.
    const want = { ...o, x, y };
    if (L) want.x = a.x; if (R) want.x = a.x + a.width - o.width;
    if (Tp) want.y = a.y; if (Bt) want.y = a.y + a.height - o.height;
    const now = outline(host.groupOf(by).map((x) => box(x)));
    if (now.x !== want.x || now.y !== want.y || now.width !== o.width || now.height !== o.height) problems.push(`outline ${JSON.stringify(now)} want ${JSON.stringify(want)} (screen-edge snap)`);
    return a;
  }

  // ---------------------------------------------------------------------------------------------- run it
  let n = 0;
  for (const cs of cases) {
    n++;
    await reset();
    const a = area(cs.si);
    const ab = box(cs.anchor), [fx, fy] = cs.at ?? [0.5, 0.45];
    putAt(cs.anchor, a.x + fx * (a.width - ab.width), a.y + fy * (a.height - ab.height));
    // The others start loose on the same screen, out of the way (bottom-left-ish), then are dropped one by one.
    const name = `${String(n).padStart(2, '0')} ${cs.combo}: ` + cs.joins.map(([m, t, s]) => `${SHORT[m]} ${s} of ${SHORT[t]}`).join(', ');
    const p1: string[] = [];
    for (const [m, t, s] of cs.joins) { putAt(m, a.x + 30, a.y + a.height - box(m).height - 30); await wait(30); await join(m, t, s, p1); }
    await checkGroup(cs.ids, p1, { area: a });
    await record(name, p1, cs.ids);
    // The follow-up with the group it built.
    const by = cs.joins.at(-1)![0];
    const p2: string[] = [];
    const before = new Map(cs.ids.map((x) => [x, box(x)]));
    const shapes = new Map(cs.ids.map((x) => [x, host.shapeOf(x)]));
    const t = cs.then;
    let ex: Map<string, Box> | undefined;
    if (t.kind === 'corner' || t.kind === 'edge') {
      const ta = await place(by, t, p2);
      await checkGroup(cs.ids, p2, { area: ta });
    } else if (t.kind === 'cross') {
      const o = outline(cs.ids.map((x) => box(x))), ta = area(t.to);
      const tx = ta.x + Math.round((ta.width - o.width) / 2), ty = ta.y + Math.round((ta.height - o.height) / 2);
      await drag(by, tx - o.x, ty - o.y, p2);
      if (!(await settle())) p2.push('not settled after the move');
      await checkGroup(cs.ids, p2, { area: ta });
      const after = B();
      for (const x of cs.ids) { const b0 = before.get(x)!, b1 = after.get(x)!; if (b0.width !== b1.width || b0.height !== b1.height) p2.push(`${SHORT[x]} size changed ${b0.width}x${b0.height} -> ${b1.width}x${b1.height}`); if (host.shapeOf(x) !== shapes.get(x)) p2.push(`${SHORT[x]} shape changed ${shapes.get(x)} -> ${host.shapeOf(x)}`); }
      if (dpiDiffers) console.log('  (crossed a DPI change)');
    } else {
      const ta = await place(by, { kind: 'corner', c: t.c, si: t.si, over: false }, p2);
      host.pullApart(cs.anchor);
      await wait(900);
      // Spread: where each one stands (without its 1 px shimmy), all on the screen.
      const wf = H.wiggle?.fam;
      if (!host.wiggling || !wf) p2.push('did not pull apart');
      else {
        ex = new Map(cs.ids.map((x) => [x, { ...wf.get(x)!.box }]));
        for (const x of cs.ids) { const b = wf.get(x)!.box; if (!inside(b, ta)) p2.push(`spread pushed ${SHORT[x]} off the screen: ${JSON.stringify(b)}`); }
        const live = B();
        for (const x of cs.ids) { const b = live.get(x)!; if (!inside(b, ta, 1)) p2.push(`spread: ${SHORT[x]} window off the screen: ${JSON.stringify(b)}`); }
        if (t.outer) {
          // Drag the last-joined one against the side of the head that faces the screen's edge (its middle onto that side).
          const root = host.groupOf(cs.anchor)[0]!;
          const rb = wf.get(root)!.box, mb = box(by);
          const side: F.Side = t.c.includes('l') ? 'left' : 'right';
          const mid = side === 'left' ? { x: rb.x - 7, y: rb.y + rb.height / 2 } : { x: rb.x + rb.width + 7, y: rb.y + rb.height / 2 };
          const want = wf.get(by)!.anchor?.to === root && wf.get(by)!.anchor?.side === side;
          if (!want) {
            host.drag(by, 'start');
            const dx = Math.round(mid.x - (mb.x + mb.width / 2)), dy = Math.round(mid.y - (mb.y + mb.height / 2));
            host.drag(by, 'move', Math.round(dx / 2), Math.round(dy / 2)); await wait(60); host.drag(by, 'move', dx, dy); await wait(80); host.drag(by, 'end', dx, dy);
            await wait(900);
            const wf2 = H.wiggle?.fam;
            if (wf2) for (const x of cs.ids) { const b = wf2.get(x)!.box; if (!inside(b, ta)) p2.push(`moved to the ${side} while apart: ${SHORT[x]} pushed off the screen ${JSON.stringify(b)}`); }
            if (wf2) ex = new Map(cs.ids.map((x) => [x, { ...wf2.get(x)!.box }]));
          }
        }
        host.endWiggle();
        if (!(await settle())) p2.push('not settled after joining back');
        await checkGroup(cs.ids, p2, { area: ta });
      }
    }
    if (cs.region) await checkRegion(cs.region, p2);
    await record(`${String(n).padStart(2, '0')}b ${cs.combo}: ${placeName(t)}`, p2, cs.ids, p2.length && ex ? ex : undefined);
  }

  // Leaving: a member pulled out gets its own size and shape back (job column, player strip, note column).
  for (const [m, s] of [[J, 'right'], [PL, 'below'], [N, 'left']] as [string, F.Side][]) {
    n++;
    await reset();
    const a = area(n % 2), vb = box(V);
    putAt(V, a.x + 260, a.y + 120);
    const pr: string[] = [];
    putAt(m, a.x + 900, a.y + 700); await wait(30);
    const own = { ...own0.get(m)! };
    await join(m, V, s, pr);
    if (host.shapeOf(m) === 'free') pr.push(`${SHORT[m]} never reshaped`);
    host.pullApart(V);
    await wait(800);
    const mb = box(m), to = { x: a.x + a.width - mb.width - 60, y: a.y + a.height - mb.height - 60 };
    host.drag(m, 'start'); host.drag(m, 'move', Math.round((to.x - mb.x) / 2), Math.round((to.y - mb.y) / 2)); await wait(60);
    host.drag(m, 'move', to.x - mb.x, to.y - mb.y); await wait(80); host.drag(m, 'end', to.x - mb.x, to.y - mb.y);
    if (!(await settle())) pr.push('not settled');
    const b = box(m);
    const sized = await WIN[m]!.webContents.executeJavaScript(`'famSized' in document.documentElement.dataset`, true);
    if (host.joined(m) || host.shapeOf(m) !== 'free' || b.width !== own.width || b.height !== own.height || sized) pr.push(`${SHORT[m]} after leaving: ${host.shapeOf(m)} ${b.width}x${b.height} (own ${own.width}x${own.height}) page held=${sized}`);
    if (host.squareOf(m).length || host.squareOf(V).length) pr.push(`square corners left: ${SHORT[m]} [${host.squareOf(m)}] video [${host.squareOf(V)}]`);
    if (!onAScreen(b) || !onAScreen(box(V))) pr.push('left off the screen');
    if (host.wiggling) pr.push('still wiggling');
    void vb;
    await record(`${n} leaving: ${SHORT[m]} (${s} of the video) pulled out gets its own ${own.width}x${own.height} back`, pr, [V, m]);
  }

  // Saved layout, per screen arrangement: video + note below it on screen 2's bottom-left; the note hidden and shown.
  {
    n++;
    await reset();
    const si = SCR.length > 1 ? 1 : 0, a = area(si);
    putAt(V, a.x + 300, a.y + 300);
    const pr: string[] = [];
    putAt(N, a.x + 1000, a.y + 120); await wait(30);
    await join(N, V, 'below', pr);
    await place(N, { kind: 'corner', c: 'bl', si, over: false }, pr);
    host.saveNow();
    nw.hide();
    await settle();
    if (host.joined(N) || box(N).width !== own0.get(N)!.width) pr.push(`hidden note did not go back to its own size: ${JSON.stringify(box(N))}`);
    nw.showInactive();
    await until(() => host.joined(N) && host.shapeOf(N) === 'wide', 4000);
    await settle();
    await checkGroup([V, N], pr, { area: a });
    if (F.contact(box(N), box(V)) !== 'below') pr.push('note not back below the video');
    await record(`${n} saved: note hidden and shown on the same screens goes back under the video (screen ${si + 1} BL corner)`, pr, [V, N]);

    // A different arrangement: only screen 1 left. The group on screen 2 is brought onto screen 1 as a whole.
    n++;
    const pr2: string[] = [];
    host.saveNow();
    const only = SCR[0]!;
    host.displays = () => [{ id: only.id, scaleFactor: only.scaleFactor, bounds: only.bounds }];
    host.areas = () => [only.workArea];
    nw.hide();
    await settle();
    nw.showInactive();
    await until(() => host.joined(N), 4000);
    await settle();
    await checkGroup([V, N], pr2, { area: only.workArea });
    await record(`${n} saved: on a one-screen arrangement the note rejoins and the group is kept on screen 1`, pr2, [V, N]);
    host.displays = () => screen.getAllDisplays().map((d) => ({ id: d.id, scaleFactor: d.scaleFactor, bounds: d.bounds }));
    host.areas = () => screen.getAllDisplays().map((d) => d.workArea);
  }

  // The seam between his screens is x 0 (and both tops are y 0): a spring frame a fraction left of (or above) it rounds to
  // -0, which Electron's setPosition refuses with a TypeError (seen once in the saved case before the fix).
  {
    n++;
    await reset();
    const pr: string[] = [];
    for (const [x, y] of [[-0.3, 300], [300, -0.2], [-0.4, -0.4]] as [number, number][]) {
      try { putAt(V, x, y); const b = box(V); if (b.x !== Math.round(x) + 0 || b.y !== Math.round(y) + 0) pr.push(`video at ${b.x},${b.y} for ${x},${y}`); }
      catch (e) { pr.push(`setPos(${x}, ${y}) threw: ${String(e).slice(0, 90)}`); }
    }
    await record(`${n} seam: a spring frame at -0.3 px left of / above the seam lands on 0 without an error`, pr, [V]);
  }

  console.log(`SLOWEST settle ${maxLag} ms (case ${lagWho})`);
  if (driftSeen.length) { fail++; console.log('FAIL  own sizes drifted between cases: ' + driftSeen.join(', ')); }
  console.log(`\nMATRIX ${pass + fail} cases: ${pass} pass, ${fail} fail; screens ${SCR.map((d) => `${d.label} ${d.bounds.width}x${d.bounds.height}@${d.bounds.x},${d.bounds.y} x${d.scaleFactor}`).join(' + ')}${dpiDiffers ? '' : ' (same DPI: no DPI change to cross)'}`);
  for (const r of results) console.log('  ' + r);
  console.log(fail ? `FAILED ${fail}` : 'ALL PASS');
  jp.dispose(); player.close(); snips.dispose();
  host.dispose();
  closeAll();
  app.exit(fail ? 1 : 0);
}).catch((e) => { console.log('HARNESS ERROR ' + String((e as Error)?.stack ?? e)); closeAll(); app.exit(1); });
