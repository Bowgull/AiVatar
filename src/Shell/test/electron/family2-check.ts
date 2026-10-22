// The window family, 1b (2026-10-22, his calls): round outer corners on every member, joined or not; Pin on top for all
// with the video's click-through kept; Click through for the group and per member, with ONE way back (Ctrl+Alt+P over it,
// FamilyHost.reachAt). Two real windows, the video pop-out's page made the way popout.ts makes it and a real sticky note,
// off his screen (x around -5000), never focused or raised, no real mouse or keys.
// Checks: a note joined on the video's right, bottoms lined up -> only the video's bottom-right and the note's left corners
// go square; the video's Windows rounding goes off and its REGION (read back from Windows) is exactly the stepped shape,
// round on the other three corners; resizing the video re-cuts it; the note leaving puts Windows' rounding back and the
// region away; the menu's Click through, the locked video, reachAt; the family pin leaves the note clickable.
// Pictures (2): the joined pair as Windows will draw it (the video cut by its real region), and its corners blown up 6x.
//
// Run: npx electron test/electron/family2-check.ts [folder for the pictures]
import { app, BrowserWindow, nativeImage } from 'electron';
import { execFile } from 'node:child_process';
import { mkdtempSync, statSync, writeFileSync } from 'node:fs';
import os from 'node:os'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
import { servePages } from '../../src/pageserver.ts';
import { NoteWindows } from '../../src/notewin.ts';
import { FamilyHost } from '../../src/familywin.ts';
import { EDGE_HELPER_CS, softEdge, stopEdgeHelper } from '../../src/winedge.ts';
import * as F from '../../src/family.ts';

process.on('uncaughtException', (e) => { console.log('HARNESS ERROR ' + String((e as Error)?.stack ?? e).split('\n').slice(0, 4).join(' | ')); app.exit(2); });
process.on('unhandledRejection', (e) => { console.log('HARNESS REJECTION ' + String((e as Error)?.stack ?? e)); app.exit(2); });
setTimeout(() => { console.log('HARNESS TIMEOUT'); app.exit(3); }, 120_000).unref();
app.on('window-all-closed', () => {});
app.setPath('userData', mkdtempSync(path.join(os.tmpdir(), 'family2-check-')));
const HERE = path.dirname(fileURLToPath(import.meta.url));
BrowserWindow.prototype.show = function (this: BrowserWindow) { if (this.webContents.getURL().includes('familymenu')) this.setPosition(-9000, 100); this.showInactive(); };
BrowserWindow.prototype.focus = function () {};
BrowserWindow.prototype.moveTop = function () {};
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
let bad = 0;
const check = (what: string, ok: boolean, d: unknown = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${what}${d !== '' ? '  -- ' + String(typeof d === 'string' ? d : JSON.stringify(d)).slice(0, 400) : ''}`); if (!ok) bad++; };
const until = async (fn: () => boolean | Promise<boolean>, ms = 6000) => { const end = Date.now() + ms; while (Date.now() < end) { if (await fn()) return true; await wait(80); } return fn(); };
const OUT = (() => { const a = process.argv.at(-1); try { return a && statSync(a).isDirectory() ? a : os.tmpdir(); } catch { return os.tmpdir(); } })();
const hwnd = (w: BrowserWindow) => { const b = w.getNativeWindowHandle(); return (b.length >= 8 ? b.readBigUInt64LE(0) : BigInt(b.readUInt32LE(0))).toString(); };

/** Windows' own answer: the window's region as rectangles (window coordinates), and where the client area sits. */
const READ = `
namespace Probe { public static class R {
  [DllImport("user32.dll")] static extern int GetWindowRgn(IntPtr h, IntPtr r);
  [DllImport("gdi32.dll")] static extern IntPtr CreateRectRgn(int a, int b, int c, int d);
  [DllImport("gdi32.dll")] static extern int GetRegionData(IntPtr r, int n, byte[] d);
  [DllImport("gdi32.dll")] static extern bool DeleteObject(IntPtr o);
  [DllImport("dwmapi.dll")] static extern int DwmGetWindowAttribute(IntPtr h, int a, out int v, int s);
  [DllImport("user32.dll")] static extern bool GetClientRect(IntPtr h, out Aang.Win.R r);
  [DllImport("user32.dll")] static extern bool GetWindowRect(IntPtr h, out Aang.Win.R r);
  [DllImport("user32.dll")] static extern bool ClientToScreen(IntPtr h, ref Aang.Win.P p);
  public static string Read(IntPtr h) {
    Aang.Win.R c; Aang.Win.R w; GetClientRect(h, out c); GetWindowRect(h, out w); Aang.Win.P o = new Aang.Win.P(); ClientToScreen(h, ref o);
    var sb = new System.Text.StringBuilder();
    sb.Append("{\\"wl\\":" + w.l + ",\\"wt\\":" + w.t + ",\\"ox\\":" + (o.x - w.l) + ",\\"oy\\":" + (o.y - w.t) + ",\\"W\\":" + (c.r - c.l) + ",\\"H\\":" + (c.b - c.t) + ",\\"rects\\":");
    IntPtr r = CreateRectRgn(0, 0, 0, 0);
    int t = GetWindowRgn(h, r);
    if (t == 0) { sb.Append("null}"); DeleteObject(r); return sb.ToString(); }
    int n = GetRegionData(r, 0, null); byte[] d = new byte[n]; GetRegionData(r, n, d); DeleteObject(r);
    int count = BitConverter.ToInt32(d, 8); sb.Append("[");
    for (int i = 0; i < count; i++) { int off = 32 + i * 16; if (i > 0) sb.Append(","); sb.Append("[" + BitConverter.ToInt32(d, off) + "," + BitConverter.ToInt32(d, off + 4) + "," + BitConverter.ToInt32(d, off + 8) + "," + BitConverter.ToInt32(d, off + 12) + "]"); }
    sb.Append("]}"); return sb.ToString();
  }
  public static double Time(IntPtr h, int mask, int[] s, int x, int y, int w, int hh, int n) {
    var sw = System.Diagnostics.Stopwatch.StartNew();
    for (int i = 0; i < n; i++) Aang.Win.Region(h, mask, s, x, y, w, hh);
    return sw.Elapsed.TotalMilliseconds / n;
  }
} }
`;
type Probe = { wl: number; wt: number; ox: number; oy: number; W: number; H: number; rects: number[][] | null; ms?: number };
/** Asked from a separate PowerShell, never blocking this process (a region call sends this window messages). */
function probe(h: string, time?: { mask: number; steps: number[]; vis: Electron.Rectangle }): Promise<Probe> {
  const t = time ? `; $t = [Probe.R]::Time([IntPtr]::new(${h}), ${time.mask}, [int[]]@(${time.steps.join(',')}), ${time.vis.x}, ${time.vis.y}, ${time.vis.width}, ${time.vis.height}, 50); Write-Output ("MS " + $t)` : '';
  const ps = `Add-Type -TypeDefinition @'\n${EDGE_HELPER_CS}\n${READ}\n'@\n` +
    `Write-Output ([Probe.R]::Read([IntPtr]::new(${h})))${t}\n`;
  const file = path.join(app.getPath('userData'), 'probe.ps1');
  writeFileSync(file, ps);
  return new Promise((res, rej) => execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', file], { encoding: 'utf8', windowsHide: true, timeout: 30000 }, (_e, so, se) => {
    const lines = String(so || '').split(/\r?\n/).filter(Boolean);
    const j = lines.find((l) => l.startsWith('{'));
    if (!j) { rej(new Error('probe: ' + String(se || so).slice(0, 400))); return; }
    const out = JSON.parse(j) as Probe;
    const ms = lines.find((l) => l.startsWith('MS '));
    if (ms) out.ms = Number(ms.slice(3));
    res(out);
  }));
}
/** The region as rows of the VISIBLE window (vis, screen pixels): for each pixel row, [first, end) of what is kept. */
function rowsOf(p: Probe, vis: Electron.Rectangle): [number, number][] {
  const vx = vis.x - p.wl, vy = vis.y - p.wt;
  const rows: [number, number][] = Array.from({ length: vis.height }, () => [Infinity, -Infinity] as [number, number]);
  for (const [l, t, r, b] of p.rects ?? []) for (let y = t; y < b; y++) { const row = rows[y - vy]; if (row) { row[0] = Math.min(row[0], l - vx); row[1] = Math.max(row[1], r - vx); } }
  return rows;
}

app.whenReady().then(async () => {
  const pages = await servePages(path.join(HERE, '..', '..', 'pages'));
  const host = new FamilyHost({ origin: pages.origin });

  // The video pop-out's page, in a window made the way popout.ts makes it. Its click-through: pinned or the family's.
  const video = new BrowserWindow({ x: -5200, y: 200, width: 640, height: 394, titleBarStyle: 'hidden', thickFrame: true, transparent: false, backgroundColor: '#24160D', show: false,
    webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false, preload: path.join(HERE, '..', '..', 'src', 'preload.cjs') } });
  void video.loadURL(`${pages.origin}/popout.html`);
  video.once('ready-to-show', () => { video.showInactive(); softEdge(video); });   // as popout.ts does: the helper starts here, not on the first join
  const vstate = { pinned: false, fam: false, setPinned: 0 };
  host.add({ id: 'video', kind: 'video', win: () => (video.isDestroyed() ? null : video), card: '.frame', osCorners: true,
    setOpacity: (n) => video.setOpacity(n), setPinned: (on) => { vstate.setPinned++; vstate.pinned = on; },
    setThrough: (on) => { vstate.fam = on; }, lockedThrough: () => vstate.pinned });

  const notes = new NoteWindows({ origin: pages.origin, preloadPath: path.join(HERE, '..', '..', 'src', 'preload.cjs'), save: () => {}, overAang: () => false });
  notes.family = host;
  const nw = notes.show({ id: 'n1', title: 'Raid night', html: 'Bring flasks<br>Repair first', font: 'hand', size: 'm', out: { x: -4300, y: 700, w: 220, h: 170, opacity: 1, pinned: false }, updated: 1 })!;
  // What the note's window was last told about the mouse.
  let nIgnore: { on: boolean; forward: boolean } = { on: false, forward: false };
  const orig = nw.setIgnoreMouseEvents.bind(nw);
  nw.setIgnoreMouseEvents = (on: boolean, o?: { forward?: boolean }) => { nIgnore = { on, forward: !!o?.forward }; orig(on, o); };

  const ok = await until(() => host.members().length === 2 && [video, nw].every((w) => !w.webContents.isLoading()), 10000);
  check('two members registered and loaded', ok, host.members());
  await wait(900);
  const B = () => host.boxes();
  const vb0 = B().get('video')!, nb0 = B().get('note:n1')!;
  const scale = (await import('electron')).screen.getDisplayMatching(video.getBounds()).scaleFactor;
  console.log('scale ' + scale + ' video ' + JSON.stringify(vb0) + ' note ' + JSON.stringify(nb0));
  const { screen } = await import('electron');
  const vis = () => screen.dipToScreenRect(video, video.getBounds());
  // Free: Windows' own rounding, no region.
  await wait(1500);   // the helper compiles once
  check('free: no region (Windows rounds it)', (await probe(hwnd(video))).rects === null);

  // Join the note on the video's right, bottoms lined up (dropped 4 px off; the line-up catches it).
  const nmove = (phase: string, dx = 0, dy = 0) => notes.move(nw.webContents, 'drag', phase, dx, dy);
  const dx = vb0.x + vb0.width + 7 - nb0.x, dy = vb0.y + vb0.height - nb0.height - 4 - nb0.y;
  nmove('start'); nmove('move', dx / 2, dy / 2); await wait(80); nmove('move', dx - 2, dy); await wait(60); nmove('move', dx, dy);
  const t0 = performance.now(); nmove('end'); const joinMs = performance.now() - t0;
  await wait(200);
  const nb1 = B().get('note:n1')!;
  check('joined on the right, bottoms lined up', host.joined('video') && nb1.x === vb0.x + vb0.width && nb1.y + nb1.height === vb0.y + vb0.height, { nb1, vb0 });
  check('only the corners a neighbour sits against go square', host.squareOf('video').join() === 'br' && host.squareOf('note:n1').join() === 'tl,bl', { v: host.squareOf('video'), n: host.squareOf('note:n1') });
  const nsq = await nw.webContents.executeJavaScript(`document.documentElement.dataset.famSq + '|' + ['TopLeft','TopRight','BottomRight','BottomLeft'].map((c) => getComputedStyle(document.querySelector('.sticky'))['border' + c + 'Radius']).join(',')`, true);
  check('the note page squares its left corners only', /^tl bl\|0px,[1-9][^,]*,[1-9][^,]*,0px$/.test(nsq), nsq);
  check('the video page is told: bottom-right square', (await video.webContents.executeJavaScript(`document.documentElement.dataset.famSq`, true)) === 'br');

  const steps = F.cornerSteps(F.CORNER_RADIUS * scale);
  const match = async (what: string, mask: number) => {
    let p = await probe(hwnd(video));
    if (!p.rects) { await wait(800); p = await probe(hwnd(video)); }
    const v = vis(), got = rowsOf(p, v), want: [number, number][] = [];
    for (const u of F.regionRuns(v.width, v.height, mask, steps)) for (let y = u.y0; y < u.y1; y++) want.push([u.l, v.width - u.r]);
    const diff = got.findIndex((r, y) => r[0] !== want[y]![0] || r[1] !== want[y]![1]);
    check(what, !!p.rects && diff === -1, diff === -1 ? { vis: v, top: got.slice(0, 8) } : { y: diff, got: got[diff], want: want[diff], vis: v, p: { ...p, rects: (p.rects ?? []).slice(0, 4) } });
    return p;
  };
  const joinedMask = F.CORNER_BIT.tl | F.CORNER_BIT.tr | F.CORNER_BIT.bl;
  await match('the video region is the stepped shape on the visible window: round top-left, top-right, bottom-left; square bottom-right', joinedMask);
  check('the steps are whole pixels, 7,5,3,2,2,1,1 at 10 px', scale !== 1 || steps.join() === '7,5,3,2,2,1,1', steps);
  // The page grew by the window's resize borders; it is padded back, so the panel is exactly the visible window.
  await wait(1600);
  const padded = await video.webContents.executeJavaScript(`document.documentElement.style.padding`, true);
  const vbox = B().get('video')!, vbnd = video.getBounds();
  check('the page is padded by what it gained; the video panel is exactly the visible window', vbox.x === vbnd.x && vbox.y === vbnd.y && vbox.width === vbnd.width && vbox.height === vbnd.height, { padded, vbox, vbnd, content: video.getContentBounds() });
  check('the note still sits flush against the visible edge', F.contact(B().get('note:n1')!, vbox) === 'right', { n: B().get('note:n1'), vbox });

  // Resize the video: the region is cut again to its new size.
  video.setSize(720, 444);
  await wait(900);
  await match('after a resize the region is cut again to the new size', joinedMask);

  // Cost: the Shell side is one line down a pipe; the helper's own work, timed 50 times in a row.
  const timed = await probe(hwnd(video), { mask: joinedMask, steps, vis: vis() });
  check(`cost: the drop that joins takes ${joinMs.toFixed(2)} ms in the Shell; the helper cuts a region in ${timed.ms?.toFixed(3)} ms`, joinMs < 20 && (timed.ms ?? 99) < 5, { joinMs, helperMs: timed.ms });

  // Picture 1: the pair as Windows draws them, the video cut by its REAL region (read back from Windows).
  video.setSize(640, 394); await wait(1200);
  const p2 = await probe(hwnd(video));
  const vimg = await video.webContents.capturePage(), nimg = await nw.webContents.capturePage();
  const vb = video.getContentBounds(), vbn = video.getBounds(), nbw = nw.getContentBounds();
  const vs = vimg.getSize(), ns = nimg.getSize();
  const kx = vs.width / vb.width;   // device pixels per DIP in the captures
  const L = vbn.x - 24, T = vbn.y - 24, Wd = Math.round((nbw.x + nbw.width - L + 24) * kx), Hd = Math.round((Math.max(vbn.y + vbn.height, nbw.y + nbw.height) - T + 24) * kx);
  const out = Buffer.alloc(Wd * Hd * 4);
  for (let y = 0; y < Hd; y++) for (let x = 0; x < Wd; x++) { const i = (y * Wd + x) * 4; const g = 30 + Math.round(10 * y / Hd); out[i] = g + 6; out[i + 1] = g + 2; out[i + 2] = g; out[i + 3] = 255; }   // dark desk
  const vbits = vimg.toBitmap(), nbits = nimg.toBitmap();
  const rows = rowsOf(p2, vis());
  // Content pixel (x, y) sits at visible-window pixel (x - px, y - py).
  const px = Math.round((vbn.x - vb.x) * kx), py = Math.round((vbn.y - vb.y) * kx);
  const ox = Math.round((vbn.x - L) * kx), oy = Math.round((vbn.y - T) * kx);
  for (let y = 0; y < vs.height; y++) for (let x = 0; x < vs.width; x++) {
    const keep = rows[y - py];
    if (!keep || x - px < keep[0] || x - px >= keep[1]) continue;   // cut away by the region
    const s = (y * vs.width + x) * 4, d = ((y - py + oy) * Wd + x - px + ox) * 4;
    if (d < 0 || d + 3 >= out.length) continue;
    out[d] = vbits[s]!; out[d + 1] = vbits[s + 1]!; out[d + 2] = vbits[s + 2]!;
  }
  const nx = Math.round((nbw.x - L) * kx), ny = Math.round((nbw.y - T) * kx);
  for (let y = 0; y < ns.height; y++) for (let x = 0; x < ns.width; x++) {
    const s = (y * ns.width + x) * 4, d = ((y + ny) * Wd + x + nx) * 4, a = nbits[s + 3]! / 255;
    if (!a || d < 0 || d + 3 >= out.length) continue;
    for (let c = 0; c < 3; c++) out[d + c] = Math.round(nbits[s + c]! + out[d + c]! * (1 - a));   // premultiplied
  }
  const pic = nativeImage.createFromBitmap(out, { width: Wd, height: Hd });
  const f1 = path.join(OUT, 'family2-joined.png'); writeFileSync(f1, (Wd > 1100 ? pic.resize({ width: 1100 }) : pic).toPNG()); console.log('PICTURE ' + f1);
  // Picture 2: the video's top-right (round, stepped) and bottom-right (square, against the note), 6x, nearest pixel.
  const crop = (x: number, y: number, w: number, h: number) => pic.crop({ x, y, width: w, height: h });
  const z = 6, cw = 40, ch = 30;
  const vw = Math.round(vbn.width * kx), vh = Math.round(vbn.height * kx);
  const a = crop(ox + vw - cw + 10, oy - 6, cw, ch), b = crop(ox + vw - cw + 10, oy + vh - ch + 6, cw, ch);
  const zb = Buffer.alloc(cw * z * (ch * 2 * z + z) * 4, 0x18);
  const put = (img: Electron.NativeImage, top: number) => { const bits = img.toBitmap(); for (let y = 0; y < ch * z; y++) for (let x = 0; x < cw * z; x++) { const s = (Math.floor(y / z) * cw + Math.floor(x / z)) * 4, d = ((y + top) * cw * z + x) * 4; bits.copy(zb, d, s, s + 4); } };
  put(a, 0); put(b, ch * z + z);
  for (let i = 3; i < zb.length; i += 4) zb[i] = 255;
  const f2 = path.join(OUT, 'family2-corners.png'); writeFileSync(f2, nativeImage.createFromBitmap(zb, { width: cw * z, height: ch * 2 * z + z }).toPNG()); console.log('PICTURE ' + f2);

  // Click-through: the family menu's row, the whole group, the locked video, the way back.
  host.context('video', { x: vb.x + 40, y: vb.y + 40 });
  const ov = host.overlay as unknown as { w: BrowserWindow | null };
  await until(() => !!ov.w && !ov.w.webContents.isLoading() && ov.w.isVisible(), 4000);
  await wait(200);
  const rowsTxt = await ov.w!.webContents.executeJavaScript(`[...document.querySelectorAll('.tabmenu button')].map((b) => b.dataset.id + ':' + b.textContent + (b.classList.contains('on') ? ':on' : ''))`, true);
  check('the family menu has Click through (ALL 2), unticked, no icon of its own', rowsTxt.some((r: string) => /^through:Click throughALL 2$/.test(r)), rowsTxt);
  await ov.w!.webContents.executeJavaScript(`document.querySelector('button[data-id="through"]').click(); 1`, true);
  await wait(200);
  check('Click through: the note and the video both let clicks through (the note keeps the mouse moving to it)', host.isThrough('note:n1') && vstate.fam && nIgnore.on && nIgnore.forward, { nIgnore, vstate });
  check('the way-back key is wanted while something is click-through', host.anyThrough);
  // The way back: Ctrl+Alt+P over the NOTE brings the whole group back.
  const nb2 = B().get('note:n1')!;
  check('Ctrl+Alt+P over it: the group takes clicks again', host.reachAt({ x: nb2.x + 20, y: nb2.y + 20 }) && !host.isThrough('note:n1') && !vstate.fam && !nIgnore.on, { nIgnore, vstate });
  // The video pinned (its own click-through): the group toggle leaves it alone, both ways.
  vstate.pinned = true;
  host.throughGroup('video');
  check('video pinned: Click through turns the note on and leaves the video to its own rule', host.isThrough('note:n1') && !vstate.fam && host.isThrough('video'));
  host.throughGroup('video');
  check('again: the note comes back, the pinned video stays click-through', !host.isThrough('note:n1') && host.isThrough('video'));
  vstate.pinned = false;
  // The note's own menu, per member.
  notes.toggleThrough(nw.webContents);
  check('the note\'s own Click through: just the note', host.isThrough('note:n1') && !vstate.fam);
  notes.toggleThrough(nw.webContents);
  // Pin on top for all: the note (always on top) stays clickable; the video gets its own pin, as today.
  host.pick('video', 'pin');
  check('Pin on top: the note stays clickable and on top; the video is pinned its own way', !nIgnore.on && nw.isAlwaysOnTop() && vstate.pinned && vstate.setPinned === 1, { nIgnore, vstate });
  host.pick('video', 'pin');

  // The note leaves: Windows' rounding comes back, the region goes.
  nw.hide();
  await wait(1200);
  check('the note left: nothing square on the video any more', host.squareOf('video').length === 0);
  await match('free again: all four corners round (stepped; it keeps its region, see winedge.ts)', F.ALL_ROUND);

  console.log(bad ? `${bad} FAILED` : 'ALL PASSED');
  host.dispose(); stopEdgeHelper(); for (const w of BrowserWindow.getAllWindows()) if (!w.isDestroyed()) w.destroy(); pages.close();
  app.exit(bad ? 1 : 0);
});
