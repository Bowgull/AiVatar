# Capture the whole desktop to a PNG, and list Aang's own windows with their bounds and whether they
# are visible.
#
# Written 2026-10-04, after a run where Aang's new bubble made the desktop feel broken and every check
# I had done was in a browser tab. A browser tab cannot show an always-on-top transparent window, a
# window in the wrong place, or a window swallowing clicks, so it could not have caught any of it.
#
#   powershell -NoProfile -ExecutionPolicy Bypass -File tools\capture-screen.ps1 -Out shot.png
param([string]$Out = "$env:TEMP\aang-screen.png")

Add-Type -AssemblyName System.Windows.Forms, System.Drawing

# --- the picture -----------------------------------------------------------------------------------
$all = [System.Windows.Forms.SystemInformation]::VirtualScreen
$bmp = New-Object System.Drawing.Bitmap $all.Width, $all.Height
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.CopyFromScreen($all.Left, $all.Top, 0, 0, $bmp.Size)
$g.Dispose()
$bmp.Save($Out, [System.Drawing.Imaging.ImageFormat]::Png)
$bmp.Dispose()
"saved $Out  ($($all.Width)x$($all.Height))"

# --- what Aang has on screen ------------------------------------------------------------------------
# Every top-level window belonging to Aang.exe or electron.exe, with its rectangle, whether Windows
# considers it visible, and whether it is click-through (WS_EX_TRANSPARENT) or always on top.
$sig = @'
using System;
using System.Runtime.InteropServices;
using System.Text;
public class Win {
  [DllImport("user32.dll")] public static extern bool EnumWindows(EnumProc cb, IntPtr p);
  public delegate bool EnumProc(IntPtr h, IntPtr p);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out RECT r);
  [DllImport("user32.dll")] public static extern int GetWindowTextW(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll")] public static extern IntPtr GetWindowLongPtrW(IntPtr h, int i);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int L, T, R, B; }
}
'@
Add-Type -TypeDefinition $sig -ErrorAction SilentlyContinue

$ours = @{}
foreach ($p in Get-Process -Name Aang, electron -ErrorAction SilentlyContinue) { $ours[[uint32]$p.Id] = $p.ProcessName }

$rows = New-Object System.Collections.ArrayList
$cb = [Win+EnumProc]{
  param($h, $p)
  $pid32 = 0
  [void][Win]::GetWindowThreadProcessId($h, [ref]$pid32)
  if ($ours.ContainsKey([uint32]$pid32)) {
    $r = New-Object Win+RECT
    [void][Win]::GetWindowRect($h, [ref]$r)
    $sb = New-Object System.Text.StringBuilder 256
    [void][Win]::GetWindowTextW($h, $sb, 256)
    $ex = [int64][Win]::GetWindowLongPtrW($h, -20)    # GWL_EXSTYLE
    [void]$rows.Add([pscustomobject]@{
      Proc        = $ours[[uint32]$pid32]
      Title       = $sb.ToString()
      Visible     = [Win]::IsWindowVisible($h)
      Rect        = "$($r.L),$($r.T) $($r.R - $r.L)x$($r.B - $r.T)"
      ClickThru   = [bool]($ex -band 0x20)            # WS_EX_TRANSPARENT: clicks pass through
      Layered     = [bool]($ex -band 0x80000)         # WS_EX_LAYERED
      OnTop       = [bool]($ex -band 0x8)             # WS_EX_TOPMOST
    })
  }
  return $true
}
[void][Win]::EnumWindows($cb, [IntPtr]::Zero)
$rows | Format-Table -AutoSize
