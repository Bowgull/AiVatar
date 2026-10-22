// The window's own edge, softened (his ask, 2026-10-12: "nice round soft edges like it was a mac app").
//
// Windows 11 rounds a window with a title bar (hidden or not) and draws its shadow; it also draws a thin grey or
// accent-coloured line round the edge, which on dark wood looks stuck on. Two DWM settings fix both, asked for
// explicitly: round corners (DWMWA_WINDOW_CORNER_PREFERENCE = 33, DWMWCP_ROUND = 2) and the edge line in dark
// wood (DWMWA_BORDER_COLOR = 34). Electron has no API for them.
//
// F0 of the window family (docs/WINDOW-FAMILY-RESEARCH.md section 3): this used to start a PowerShell for EVERY window,
// which blocked the main process 14-17 ms each time (measured in the pop-out baseline). There is no FFI library in the
// Shell's dependencies (koffi is not installed), so instead ONE small helper starts the first time it is needed, compiles
// the DwmSetWindowAttribute call once, and then takes one line per request on its stdin: "<hwnd> <corner>". A request is
// a write to a pipe, nothing more. The family also uses it while a window is snapped flush to another: Windows' rounding
// off (DWMWCP_DONOTROUND = 1) and a stepped region round only the outer corners (1b, 2026-10-22); back to round on leaving.
//
// It gets only numbers (a window handle, a corner value, a corner mask and steps) from here; nothing from a page ever reaches it.
import { spawn, type ChildProcess } from 'node:child_process';
import { screen, type BaseWindow } from 'electron';
import { ALL_ROUND, CORNER_RADIUS, cornerSteps } from './family.ts';

/** Dark wood, as Windows wants it: 0x00BBGGRR. #24160D. */
const EDGE = 0x000d1624;
/** DWMWCP_*: what Windows does with the window's corners. */
export const CORNER = { square: 1, round: 2 } as const;

// One C# class, compiled once when the helper starts. Region(): the window's shape as a stair-stepped polygon over the
// VISIBLE window (sent in screen pixels; Windows wants window coordinates, so the window's own corner is taken off), the same rows as
// family.ts regionRuns(). SetWindowRgn owns the region afterwards. There is no "clear": ANY SetWindowRgn call, even
// with no region, makes Chromium let the page grow by the resize borders (measured), so a window never gets one until it
// is joined, and keeps one after.
export const EDGE_HELPER_CS = `
using System; using System.Collections.Generic; using System.Runtime.InteropServices;
namespace Aang { public static class Win {
  [StructLayout(LayoutKind.Sequential)] public struct P { public int x; public int y; }
  [StructLayout(LayoutKind.Sequential)] public struct R { public int l; public int t; public int r; public int b; }
  [DllImport("dwmapi.dll")] static extern int DwmSetWindowAttribute(IntPtr h, int a, ref int v, int s);
  [DllImport("user32.dll")] static extern int SetWindowRgn(IntPtr h, IntPtr r, bool redraw);
  [DllImport("gdi32.dll")] static extern IntPtr CreatePolygonRgn(P[] p, int n, int mode);
  [DllImport("gdi32.dll")] static extern bool DeleteObject(IntPtr o);
  [DllImport("user32.dll")] static extern bool GetClientRect(IntPtr h, out R r);
  [DllImport("user32.dll")] static extern bool GetWindowRect(IntPtr h, out R r);
  [DllImport("user32.dll")] static extern bool ClientToScreen(IntPtr h, ref P p);
  [DllImport("user32.dll")] static extern bool IsWindow(IntPtr h);
  public static void Corner(IntPtr h, int c, int edge) { if (!IsWindow(h)) return; DwmSetWindowAttribute(h, 33, ref c, 4); DwmSetWindowAttribute(h, 34, ref edge, 4); }
  public static void Region(IntPtr h, int mask, int[] s, int sx, int sy, int sw, int sh) {
    if (!IsWindow(h)) return;
    R w; GetWindowRect(h, out w);
    // The visible window, in screen pixels (Electron's own bounds): its invisible resize borders are cut away too.
    int ox = sx - w.l, oy = sy - w.t, W = sw, H = sh;
    if (W <= 0 || H <= 0) return;
    int k = Math.Min(s.Length, Math.Min(W, H) / 2);
    var runs = new List<int[]>();
    var rows = new List<int>();
    for (int i = 0; i < k; i++) rows.Add(i);
    if (H - 2 * k > 0) rows.Add(k);
    for (int i = 0; i < k; i++) rows.Add(H - k + i);
    foreach (int y in rows) {
      int t = y < k ? s[y] : 0, b = H - 1 - y < k ? s[H - 1 - y] : 0;
      int l = Math.Max((mask & 1) != 0 ? t : 0, (mask & 8) != 0 ? b : 0), r = Math.Max((mask & 2) != 0 ? t : 0, (mask & 4) != 0 ? b : 0);
      int y1 = (y == k && H - 2 * k > 0) ? H - k : y + 1;
      if (runs.Count > 0) { var last = runs[runs.Count - 1]; if (last[2] == l && last[3] == r && last[1] == y) { last[1] = y1; continue; } }
      runs.Add(new int[] { y, y1, l, r });
    }
    var pts = new List<P>();
    foreach (var u in runs) { pts.Add(new P { x = ox + W - u[3], y = oy + u[0] }); pts.Add(new P { x = ox + W - u[3], y = oy + u[1] }); }
    for (int i = runs.Count - 1; i >= 0; i--) { var u = runs[i]; pts.Add(new P { x = ox + u[2], y = oy + u[1] }); pts.Add(new P { x = ox + u[2], y = oy + u[0] }); }
    IntPtr rg = CreatePolygonRgn(pts.ToArray(), pts.Count, 1);
    if (rg == IntPtr.Zero) return;
    if (SetWindowRgn(h, rg, true) == 0) DeleteObject(rg);
  }
} }
`;

// One line per request: "<hwnd> 2" round (and no region), "<hwnd> 1" square, or "<hwnd> 1 <mask> <s,s,s> <x,y,w,h>"
// Windows' rounding off and the stepped region instead (mask = which corners stay round, s = the steps in real pixels,
// x,y,w,h = the visible window on the screen in real pixels).
const SCRIPT = `
Add-Type -TypeDefinition @'
${EDGE_HELPER_CS}
'@
while ($true) {
  $l = [Console]::In.ReadLine()
  if ($l -eq $null) { break }
  $p = $l.Split(' ')
  if ($p.Length -ne 2 -and $p.Length -ne 5) { continue }
  $n = [Int64]0; $c = 0
  if (-not [Int64]::TryParse($p[0], [ref]$n) -or -not [Int32]::TryParse($p[1], [ref]$c)) { continue }
  if ($c -lt 0 -or $c -gt 3) { continue }
  $h = [System.IntPtr]::new($n)
  if ($p.Length -eq 5) {
    $m = 0
    if (-not [Int32]::TryParse($p[2], [ref]$m) -or $m -lt 0 -or $m -gt 15) { continue }
    $s = @(); $ok = $true
    foreach ($x in $p[3].Split(',')) { $v = 0; if ([Int32]::TryParse($x, [ref]$v) -and $v -ge 0 -and $v -le 64) { $s += $v } else { $ok = $false } }
    if (-not $ok -or $s.Count -gt 48) { continue }
    $r = @(); foreach ($x in $p[4].Split(',')) { $v = 0; if ([Int32]::TryParse($x, [ref]$v) -and [Math]::Abs($v) -le 100000) { $r += $v } else { $ok = $false } }
    if (-not $ok -or $r.Count -ne 4) { continue }
    [Aang.Win]::Corner($h, $c, ${EDGE})
    [Aang.Win]::Region($h, $m, [int[]]$s, $r[0], $r[1], $r[2], $r[3])
  } else {
    [Aang.Win]::Corner($h, $c, ${EDGE})
  }
}
`;

let helper: ChildProcess | null = null;
let broken = false;

function send(line: string): void {
  if (broken) return;
  if (!helper || helper.exitCode !== null || helper.killed) {
    try {
      helper = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', SCRIPT],
        { windowsHide: true, stdio: ['pipe', 'ignore', 'ignore'] });
      helper.on('error', () => { broken = true; helper = null; });   // no PowerShell: Windows' own edge stays
      helper.on('exit', () => { helper = null; });
      helper.stdin?.on('error', () => { /* it went away; the next request starts a new one */ });
      helper.unref();
      (helper.stdin as unknown as { unref?: () => void } | null)?.unref?.();
    } catch { broken = true; return; }
  }
  try { helper?.stdin?.write(line + '\n'); } catch { /* gone */ }
}

function hwndOf(w: BaseWindow): string | null {
  try {
    const buf = w.getNativeWindowHandle();
    const hwnd = (buf.length >= 8 ? buf.readBigUInt64LE(0) : BigInt(buf.readUInt32LE(0))).toString();
    return /^\d+$/.test(hwnd) ? hwnd : null;
  } catch { return null; }   // the window is gone
}

/** Round, soft-edged, dark-wood outline. Windows 11 only; anywhere else it quietly does nothing. */
export function softEdge(w: BaseWindow): void { setCorners(w, ALL_ROUND); }

/**
 * Which corners are round (bits: 1 top-left, 2 top-right, 4 bottom-right, 8 bottom-left; 15 = all, family.ts roundMask).
 * All four: Windows' own rounding and shadow, no region. Fewer (a window joined flush in the family, his call 2026-10-22:
 * "only the joined sides may be square"): Windows can only round all four or none, so its rounding goes off and the window
 * gets a REGION instead, round only on its outer corners, pixel-stepped (family.ts cornerSteps), radius 10 px at its
 * screen's scale. A region window loses Windows' shadow and edge line.
 * Call again after the window changes size: the region is cut to the size it had.
 *
 * Measured 2026-10-22 (test/electron/family2-check.ts): the moment a region is set, Chromium stops keeping the window's
 * invisible 8 px resize borders out of the page (the page grows by them, left, right and bottom) and never takes them back,
 * not even with the region cleared. So the region is cut to the VISIBLE window (Electron's own bounds, unchanged), the
 * family pads the page by the borders it gained (familywin.ts), and once a window has had a region it keeps one:
 * `region` = true with all four corners round, stepped, when it is free again.
 */
export function setCorners(w: BaseWindow, mask: number, region = false): void {
  if (process.platform !== 'win32') return;
  const h = hwndOf(w);
  if (!h) return;
  const m = Math.max(0, Math.min(ALL_ROUND, Math.round(mask) | 0));
  if (m === ALL_ROUND && !region) { send(`${h} ${CORNER.round}`); return; }
  let scale = 1, vis: Electron.Rectangle;
  try {
    scale = screen.getDisplayMatching(w.getBounds()).scaleFactor || 1;
    vis = screen.dipToScreenRect(w as Electron.BrowserWindow, w.getBounds());
  } catch { return; }
  const steps = cornerSteps(CORNER_RADIUS * scale);
  if (!steps.length) { send(`${h} ${CORNER.square}`); return; }
  send(`${h} ${CORNER.square} ${m} ${steps.join(',')} ${[vis.x, vis.y, vis.width, vis.height].map(Math.round).join(',')}`);
}

/** Stop the helper (the Shell quitting). */
export function stopEdgeHelper(): void { try { helper?.stdin?.end(); helper?.kill(); } catch { /* gone */ } helper = null; }
