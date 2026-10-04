# Hover the bubble with real mouse movement and screenshot it. Needs a reply on screen, so it sends one
# short message first (tools\repro-send.ps1). One message per run.
param([string]$OutDir = "$env:TEMP\aang-hover")
New-Item -ItemType Directory -Force $OutDir | Out-Null
Add-Type -AssemblyName System.Windows.Forms, System.Drawing
Add-Type @'
using System; using System.Runtime.InteropServices;
public static class H {
  [DllImport("user32.dll")] public static extern void mouse_event(uint f, int x, int y, uint d, UIntPtr e);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern IntPtr FindWindowW(string c, string t);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out R r);
  [StructLayout(LayoutKind.Sequential)] public struct R { public int L, T, Rt, B; }
}
'@
function MoveTo($x, $y) {
  $sw = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds.Width; $sh = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds.Height
  $from = [System.Windows.Forms.Cursor]::Position
  for ($i = 1; $i -le 15; $i++) {
    $px = $from.X + ($x - $from.X) * $i / 15; $py = $from.Y + ($y - $from.Y) * $i / 15
    [H]::mouse_event(0x8001, [int]($px * 65535 / $sw), [int]($py * 65535 / $sh), 0, [UIntPtr]::Zero)
    Start-Sleep -Milliseconds 20
  }
}
function Shot($name) {
  $all = [System.Windows.Forms.SystemInformation]::VirtualScreen
  $bmp = New-Object System.Drawing.Bitmap $all.Width, $all.Height
  $g = [System.Drawing.Graphics]::FromImage($bmp); $g.CopyFromScreen($all.Left, $all.Top, 0, 0, $bmp.Size); $g.Dispose()
  $bmp.Save((Join-Path $OutDir "$name.png"), [System.Drawing.Imaging.ImageFormat]::Png); $bmp.Dispose()
}

& powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot 'repro-send.ps1') -OutDir (Join-Path $OutDir 'send') -Text 'two short sentences about rain please' | Select-Object -Last 2
Start-Sleep -Seconds 3
$h = [H]::FindWindowW([NullString]::Value, 'Aang')
$r = New-Object H+R; [void][H]::GetWindowRect($h, [ref]$r)
"bubble window: $($r.L),$($r.T) $($r.Rt-$r.L)x$($r.B-$r.T)"
MoveTo ($r.Rt - 80) ($r.B - 50)
# Keep the pointer alive the way a hand does: tiny real moves, not a frozen cursor.
for ($i = 0; $i -lt 8; $i++) { [H]::mouse_event(1, ($i % 2) * 2 - 1, 0, 0, [UIntPtr]::Zero); Start-Sleep -Milliseconds 120 }
Shot 'hover'
MoveTo 900 500
"shot: $(Join-Path $OutDir 'hover.png')"
