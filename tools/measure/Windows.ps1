# Find or close one window by title, for tests that open their own windows.
#   Windows.ps1 -Find <part of title>   prints "<hwnd>`t<title>" of the first visible match, or nothing
#   Windows.ps1 -Close <hwnd>           asks that one window to close (WM_CLOSE: never a kill, never discards)
# Tests close what they opened by handle, so a window of Joshua's with a similar title is never touched.
#   Windows.ps1 -Move <hwnd> -X -Y -W -H   move and size that one window
#   Windows.ps1 -Focus <hwnd>          bring that one window to the front
# By handle, because titles are unreliable to match: Firefox puts an em dash in its titles, which the
# ANSI title reads in Keys.ps1 turn into "?", so matching by exact title silently moved nothing.
param([string]$Find, [long]$Close, [long]$Move, [int]$X, [int]$Y, [int]$W, [int]$H, [long]$Focus)
Add-Type @'
using System; using System.Text; using System.Runtime.InteropServices;
public class TW {
  public delegate bool P(IntPtr h, IntPtr l);
  [DllImport("user32.dll")] public static extern bool EnumWindows(P p, IntPtr l);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern int GetWindowText(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);
  [DllImport("user32.dll")] public static extern bool PostMessage(IntPtr h, uint m, IntPtr w, IntPtr l);
  [DllImport("user32.dll")] public static extern bool MoveWindow(IntPtr h, int x, int y, int w, int ht, bool repaint);
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h, int cmd);
  [DllImport("user32.dll")] public static extern void SwitchToThisWindow(IntPtr h, bool alt);
  public static string First(string part) { string o = "";
    EnumWindows((h, l) => { if (!IsWindowVisible(h)) return true; var sb = new StringBuilder(400); GetWindowText(h, sb, 400);
      var t = sb.ToString(); if (t.IndexOf(part, StringComparison.OrdinalIgnoreCase) >= 0) { o = h.ToInt64() + "\t" + t; return false; } return true; }, IntPtr.Zero);
    return o; }
}
'@
if ($Find) { [TW]::First($Find) }
if ($Close) { [void][TW]::PostMessage([IntPtr]$Close, 0x10, [IntPtr]::Zero, [IntPtr]::Zero); 'ok' }
if ($Move) { [void][TW]::ShowWindow([IntPtr]$Move, 9); [void][TW]::MoveWindow([IntPtr]$Move, $X, $Y, $W, $H, $true); 'ok' }
if ($Focus) { [TW]::SwitchToThisWindow([IntPtr]$Focus, $true); Start-Sleep -Milliseconds 800; 'ok' }
