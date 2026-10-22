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
// a write to a pipe, nothing more. The family also uses it to square a window's corners while it is snapped flush to
// another (DWMWCP_DONOTROUND = 1) and round them again when it leaves.
//
// It gets only numbers (a window handle and a corner value) from here; nothing from a page ever reaches it.
import { spawn, type ChildProcess } from 'node:child_process';
import type { BaseWindow } from 'electron';

/** Dark wood, as Windows wants it: 0x00BBGGRR. #24160D. */
const EDGE = 0x000d1624;
/** DWMWCP_*: what Windows does with the window's corners. */
export const CORNER = { square: 1, round: 2 } as const;

const SCRIPT = `
Add-Type -Namespace Aang -Name Dwm -MemberDefinition '[DllImport("dwmapi.dll")] public static extern int DwmSetWindowAttribute(System.IntPtr h, int a, ref int v, int s);'
while ($true) {
  $l = [Console]::In.ReadLine()
  if ($l -eq $null) { break }
  $p = $l.Split(' ')
  if ($p.Length -ne 2) { continue }
  $n = [Int64]0; $c = 0
  if (-not [Int64]::TryParse($p[0], [ref]$n) -or -not [Int32]::TryParse($p[1], [ref]$c)) { continue }
  if ($c -lt 0 -or $c -gt 3) { continue }
  $h = [System.IntPtr]::new($n)
  [void][Aang.Dwm]::DwmSetWindowAttribute($h, 33, [ref]$c, 4)
  $edge = ${EDGE}; [void][Aang.Dwm]::DwmSetWindowAttribute($h, 34, [ref]$edge, 4)
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
export function softEdge(w: BaseWindow): void { setCorners(w, true); }

/**
 * Round or square corners (the dark-wood edge either way). Square while it sits flush against another member of the
 * window family: two rounded windows touching leave little notches at the seam. Windows can only round all four corners
 * or none, so a joined window is square all round (the outer corners included).
 */
export function setCorners(w: BaseWindow, round: boolean): void {
  if (process.platform !== 'win32') return;
  const h = hwndOf(w);
  if (h) send(`${h} ${round ? CORNER.round : CORNER.square}`);
}

/** Stop the helper (the Shell quitting). */
export function stopEdgeHelper(): void { try { helper?.stdin?.end(); helper?.kill(); } catch { /* gone */ } helper = null; }
