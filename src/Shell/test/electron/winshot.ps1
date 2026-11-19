param([Int64]$Hwnd, [string]$Out)
# What a window really shows (its composited picture, PrintWindow with PW_RENDERFULLCONTENT), saved as a PNG; prints
# "w h meanLuma darkShare" so a black window is a number, not a guess.
Add-Type -AssemblyName System.Drawing
Add-Type -TypeDefinition @'
using System; using System.Runtime.InteropServices;
public static class WS {
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int L, T, R, B; }
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out RECT r);
  [DllImport("user32.dll")] public static extern bool PrintWindow(IntPtr h, IntPtr hdc, uint flags);
}
'@
$h = [IntPtr]$Hwnd
$r = New-Object WS+RECT
[void][WS]::GetWindowRect($h, [ref]$r)
$w = [Math]::Max(1, $r.R - $r.L); $ht = [Math]::Max(1, $r.B - $r.T)
$bmp = New-Object System.Drawing.Bitmap $w, $ht
$g = [System.Drawing.Graphics]::FromImage($bmp)
$dc = $g.GetHdc(); $ok = [WS]::PrintWindow($h, $dc, 2); $g.ReleaseHdc($dc); $g.Dispose()
$sum = 0.0; $dark = 0; $n = 0
for ($y = 0; $y -lt $ht; $y += 16) { for ($x = 0; $x -lt $w; $x += 16) { $c = $bmp.GetPixel($x, $y); $l = 0.2126 * $c.R + 0.7152 * $c.G + 0.0722 * $c.B; $sum += $l; if ($l -lt 8) { $dark++ }; $n++ } }
if ($Out) { $bmp.Save($Out, [System.Drawing.Imaging.ImageFormat]::Png) }
$bmp.Dispose()
"$ok $w $ht $([Math]::Round($sum / $n, 1)) $([Math]::Round($dark / $n, 2))"
