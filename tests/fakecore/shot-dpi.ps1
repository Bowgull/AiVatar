# DPI-aware capture of a physical-pixel region via BitBlt with CAPTUREBLT, so layered windows (Aang) are included.
param([int]$X, [int]$Y, [int]$W, [int]$H, [string]$Out)
Add-Type -AssemblyName System.Drawing
Add-Type -TypeDefinition @'
using System; using System.Runtime.InteropServices;
public class P {
  [DllImport("user32.dll")] public static extern bool SetProcessDPIAware();
  [DllImport("user32.dll")] public static extern IntPtr GetDC(IntPtr h);
  [DllImport("user32.dll")] public static extern int ReleaseDC(IntPtr h, IntPtr dc);
  [DllImport("gdi32.dll")] public static extern bool BitBlt(IntPtr d, int x, int y, int w, int h, IntPtr s, int sx, int sy, int rop);
}
'@
[void][P]::SetProcessDPIAware()
$bmp = New-Object System.Drawing.Bitmap $W, $H
$g = [System.Drawing.Graphics]::FromImage($bmp)
$dst = $g.GetHdc(); $src = [P]::GetDC([IntPtr]::Zero)
[void][P]::BitBlt($dst, 0, 0, $W, $H, $src, $X, $Y, 0x40CC0020)   # SRCCOPY | CAPTUREBLT
[void][P]::ReleaseDC([IntPtr]::Zero, $src); $g.ReleaseHdc($dst)
$bmp.Save($Out, [System.Drawing.Imaging.ImageFormat]::Png)
"saved $Out"
