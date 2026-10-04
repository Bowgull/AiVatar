# Moves and resizes the pop-out the way Windows does when he drags it, then says where it ended up.
#   powershell -File popout-drag.ps1 -X 300 -Y 200 -W 900 -H 700
# NOTE: the window handle below is $win, not $h. PowerShell variable names are case-insensitive,
# so a handle in $h silently overwrote the $H parameter and every height came out as 65535.
param([int]$X, [int]$Y, [int]$W, [int]$H)

Add-Type @"
using System; using System.Text; using System.Runtime.InteropServices;
public class D {
  public delegate bool P(IntPtr h, IntPtr l);
  [DllImport("user32.dll")] public static extern bool EnumWindows(P p, IntPtr l);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);
  [DllImport("user32.dll")] public static extern int GetWindowText(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint p);
  [DllImport("user32.dll")] public static extern bool SetWindowPos(IntPtr h, IntPtr after, int x, int y, int cx, int cy, uint flags);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out R r);
  public struct R { public int L, T, Ri, B; }
  public static IntPtr Find(uint[] pids) {
    IntPtr found = IntPtr.Zero;
    EnumWindows((h, l) => {
      if (!IsWindowVisible(h)) return true;
      uint p; GetWindowThreadProcessId(h, out p);
      if (Array.IndexOf(pids, p) < 0) return true;
      var t = new StringBuilder(256); GetWindowText(h, t, 256);
      if (t.ToString().StartsWith("Aang")) { found = h; return false; }
      return true;
    }, IntPtr.Zero);
    return found;
  }
}
"@

$pids = @(Get-Process electron -ErrorAction SilentlyContinue | ForEach-Object { [uint32]$_.Id })
if ($pids.Count -eq 0) { "NOWINDOW"; exit }
$win = [D]::Find($pids)
if ($win -eq [IntPtr]::Zero) { "NOWINDOW"; exit }

# SWP_NOZORDER, so moving it does not change whether it is on top.
[void][D]::SetWindowPos($win, [IntPtr]::Zero, $X, $Y, $W, $H, 0x0004)
Start-Sleep -Milliseconds 800
$r = New-Object D+R
[void][D]::GetWindowRect($win, [ref]$r)
"$($r.L),$($r.T),$($r.Ri - $r.L),$($r.B - $r.T)"
