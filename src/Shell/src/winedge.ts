// The window's own edge, softened (his ask, 2026-10-12: "nice round soft edges like it was a mac app").
//
// Windows 11 rounds a window with a title bar (hidden or not) and draws its shadow; it also draws a thin grey or
// accent-coloured line round the edge, which on dark wood looks stuck on. Two DWM settings fix both, asked for
// explicitly: round corners (DWMWA_WINDOW_CORNER_PREFERENCE = 33, DWMWCP_ROUND = 2) and the edge line in dark
// wood (DWMWA_BORDER_COLOR = 34). Electron has no API for them, so a short PowerShell does the one call. It gets
// only a number (the window handle) and fixed values; nothing from a page ever reaches it.
import { spawn } from 'node:child_process';
import type { BaseWindow } from 'electron';

/** Dark wood, as Windows wants it: 0x00BBGGRR. #24160D. */
const EDGE = 0x000d1624;

const SCRIPT = (hwnd: string) => `
Add-Type -Namespace Aang -Name Dwm -MemberDefinition '[DllImport("dwmapi.dll")] public static extern int DwmSetWindowAttribute(System.IntPtr h, int a, ref int v, int s);'
$h = [System.IntPtr]::new([Int64]${hwnd})
$round = 2; [void][Aang.Dwm]::DwmSetWindowAttribute($h, 33, [ref]$round, 4)
$edge = ${EDGE}; [void][Aang.Dwm]::DwmSetWindowAttribute($h, 34, [ref]$edge, 4)
`;

/** Round, soft-edged, dark-wood outline. Windows 11 only; anywhere else it quietly does nothing. */
export function softEdge(w: BaseWindow): void {
  if (process.platform !== 'win32') return;
  try {
    const buf = w.getNativeWindowHandle();
    const hwnd = (buf.length >= 8 ? buf.readBigUInt64LE(0) : BigInt(buf.readUInt32LE(0))).toString();
    if (!/^\d+$/.test(hwnd)) return;
    const p = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', SCRIPT(hwnd)], { windowsHide: true, stdio: 'ignore' });
    p.on('error', () => { /* no PowerShell: Windows' own edge stays */ });
  } catch { /* the window is gone */ }
}
