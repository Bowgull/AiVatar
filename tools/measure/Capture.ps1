# Capture.ps1 - screen capture that actually sees what the user sees.
#
# WHY THIS EXISTS: Graphics.CopyFromScreen (and raw BitBlt, even with
# CAPTUREBLT) does NOT capture topmost layered windows. Aang is exactly that -
# WS_EX_TOPMOST | WS_EX_LAYERED - so every naive screenshot silently omitted
# the companion itself, and any overlay sitting above a game. Verified on
# 2026-09-20: Aang.ini reported vis=True topmost=True at 1417,882 470x310
# while three separate BitBlt captures showed nothing there.
#
# Strategy: BitBlt the desktop for the base image, then PrintWindow each
# visible topmost layered window (with PW_RENDERFULLCONTENT) and composite it
# at its own screen rect. No DXGI, no extra dependencies.
#
#   .\Capture.ps1 -Out shot.png                 one frame
#   .\Capture.ps1 -Out clip -Frames 30 -Fps 4   a burst, numbered frames
#   .\Capture.ps1 -Out win.png -Window Aang     one window only
param(
  [string]$Out = "$env:TEMP\capture.png",
  [int]$Frames = 1,
  [int]$Fps = 4,
  [string]$Window = '',
  [int]$MaxDim = 1400,
  [switch]$Serve,
  [string]$CropTitle = ''
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Windows.Forms, System.Drawing

if (-not ([System.Management.Automation.PSTypeName]'AangCap').Type) {
  Add-Type -ReferencedAssemblies System.Drawing -TypeDefinition @'
using System;
using System.Text;
using System.Drawing;
using System.Collections.Generic;
using System.Runtime.InteropServices;

public class AangCap {
  [DllImport("user32.dll")] static extern bool EnumWindows(EnumWindowsProc f, IntPtr p);
  delegate bool EnumWindowsProc(IntPtr h, IntPtr p);
  [DllImport("user32.dll")] static extern int  GetWindowText(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr h);
  [DllImport("user32.dll")] static extern bool GetWindowRect(IntPtr h, out RECT r);
  [DllImport("user32.dll")] static extern int  GetWindowLong(IntPtr h, int i);
  [DllImport("user32.dll")] static extern bool PrintWindow(IntPtr h, IntPtr hdc, uint flags);
  [DllImport("user32.dll")] static extern IntPtr GetDesktopWindow();
  [DllImport("user32.dll")] static extern IntPtr GetWindowDC(IntPtr h);
  [DllImport("user32.dll")] static extern int  ReleaseDC(IntPtr h, IntPtr dc);
  [DllImport("gdi32.dll")]  static extern bool BitBlt(IntPtr d,int dx,int dy,int w,int h,IntPtr s,int sx,int sy,int rop);

  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int Left,Top,Right,Bottom; }

  const int GWL_EXSTYLE = -20;
  const int WS_EX_TOPMOST = 0x8, WS_EX_LAYERED = 0x80000, WS_EX_TRANSPARENT = 0x20;
  const int SRCCOPY = 0x00CC0020, CAPTUREBLT = 0x40000000;
  const uint PW_RENDERFULLCONTENT = 0x2;

  public class Overlay { public IntPtr H; public RECT R; public string Title; }

  // Visible, topmost, layered windows with a real size - the ones BitBlt misses.
  public static List<Overlay> Overlays(string titleFilter) {
    var list = new List<Overlay>();
    EnumWindows((h, l) => {
      if (!IsWindowVisible(h)) return true;
      int ex = GetWindowLong(h, GWL_EXSTYLE);
      bool topmost = (ex & WS_EX_TOPMOST) != 0;
      bool layered = (ex & WS_EX_LAYERED) != 0;
      if (!(topmost && layered)) return true;
      RECT r; if (!GetWindowRect(h, out r)) return true;
      if (r.Right - r.Left < 4 || r.Bottom - r.Top < 4) return true;
      var t = new StringBuilder(512); GetWindowText(h, t, 512);
      string title = t.ToString();
      if (!string.IsNullOrEmpty(titleFilter) &&
          title.IndexOf(titleFilter, StringComparison.OrdinalIgnoreCase) < 0) return true;
      list.Add(new Overlay { H = h, R = r, Title = title });
      return true;
    }, IntPtr.Zero);
    return list;
  }

  public static Bitmap Window(IntPtr h) {
    RECT r; GetWindowRect(h, out r);
    int w = r.Right - r.Left, ht = r.Bottom - r.Top;
    if (w < 1 || ht < 1) return null;
    var b = new Bitmap(w, ht, System.Drawing.Imaging.PixelFormat.Format32bppArgb);
    using (var g = Graphics.FromImage(b)) {
      IntPtr hdc = g.GetHdc();
      PrintWindow(h, hdc, PW_RENDERFULLCONTENT);
      g.ReleaseHdc(hdc);
    }
    return b;
  }

  // Base desktop + every overlay composited back on top at its own rect.
  public static Bitmap Screen(int x, int y, int w, int h) {
    var b = new Bitmap(w, h, System.Drawing.Imaging.PixelFormat.Format32bppArgb);
    using (var g = Graphics.FromImage(b)) {
      IntPtr hdcDest = g.GetHdc();
      IntPtr desk = GetDesktopWindow();
      IntPtr hdcSrc = GetWindowDC(desk);
      BitBlt(hdcDest, 0, 0, w, h, hdcSrc, x, y, SRCCOPY | CAPTUREBLT);
      ReleaseDC(desk, hdcSrc);
      g.ReleaseHdc(hdcDest);
    }
    // PrintWindow discards the alpha channel: it returns A=255 for every pixel
    // and renders the transparent region as pure black. Measured on Aang's own
    // window - empty space came back (0,0,0,255) while his darkest outline
    // pixel was (26,20,17), so keying out only near-pure black restores the
    // transparency without eating the sprite's outline.
    using (var g = Graphics.FromImage(b))
    using (var attr = new System.Drawing.Imaging.ImageAttributes()) {
      attr.SetColorKey(Color.FromArgb(0, 0, 0), Color.FromArgb(10, 10, 10));
      foreach (var o in Overlays(null)) {
        using (var wb = Window(o.H)) {
          if (wb == null) continue;
          var dest = new Rectangle(o.R.Left - x, o.R.Top - y, wb.Width, wb.Height);
          g.DrawImage(wb, dest, 0, 0, wb.Width, wb.Height, GraphicsUnit.Pixel, attr);
        }
      }
    }
    return b;
  }
}
'@
}

function Save-Scaled([System.Drawing.Bitmap]$bmp, [string]$path, [int]$maxDim) {
  $big = [Math]::Max($bmp.Width, $bmp.Height)
  $img = $bmp
  if ($maxDim -gt 0 -and $big -gt $maxDim) {
    $f = $maxDim / [double]$big
    $w = [int][Math]::Round($bmp.Width * $f); $h = [int][Math]::Round($bmp.Height * $f)
    $s = New-Object System.Drawing.Bitmap $w, $h
    $g = [System.Drawing.Graphics]::FromImage($s)
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.DrawImage($bmp, 0, 0, $w, $h); $g.Dispose()
    $img = $s
  }
  $img.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
  if (-not [object]::ReferenceEquals($img, $bmp)) { $img.Dispose() }
}

$vb = [System.Windows.Forms.SystemInformation]::VirtualScreen

# Capture the composited desktop and crop to a window (plus a margin) so the result shows the window
# exactly as it looks over the game. Full resolution, no scaling.
function Snap([string]$path, [string]$title, [int]$margin = 24) {
  $b = [AangCap]::Screen($vb.X, $vb.Y, $vb.Width, $vb.Height)
  try {
    $img = $b
    if ($title) {
      $ov = [AangCap]::Overlays($title)
      if ($ov.Count -gt 0) {
        $r = $ov[0].R
        $x = [Math]::Max(0, $r.Left - $vb.X - $margin); $y = [Math]::Max(0, $r.Top - $vb.Y - $margin)
        $w = [Math]::Min($b.Width - $x, ($r.Right - $r.Left) + 2 * $margin); $h = [Math]::Min($b.Height - $y, ($r.Bottom - $r.Top) + 2 * $margin)
        $img = $b.Clone((New-Object System.Drawing.Rectangle $x, $y, $w, $h), $b.PixelFormat)
      } else { return "no-window" }
    }
    $img.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
    if (-not [object]::ReferenceEquals($img, $b)) { $img.Dispose() }
    return "ok"
  } finally { $b.Dispose() }
}

# Long-lived mode: a test driver keeps this process open and sends one line per shot
# ("snap <out.png> [window title]"), so a screenshot costs ~200 ms instead of a PowerShell start-up.
if ($Serve) {
  [Console]::Out.WriteLine("ready"); [Console]::Out.Flush()
  while ($null -ne ($line = [Console]::In.ReadLine())) {
    if ($line -eq 'quit') { break }
    if ($line -match '^snap\s+(\S+)(?:\s+(.+))?$') {
      $res = Snap $Matches[1] ($Matches[2]) 24
      [Console]::Out.WriteLine("$res $($Matches[1])"); [Console]::Out.Flush()
    } else { [Console]::Out.WriteLine("bad-command"); [Console]::Out.Flush() }
  }
  exit 0
}

if ($CropTitle) { $res = Snap $Out $CropTitle 24; Write-Output "$res $Out"; exit 0 }

if ($Window) {
  $ov = [AangCap]::Overlays($Window)
  if ($ov.Count -eq 0) { Write-Output "no visible topmost layered window matching '$Window'"; exit 1 }
  $b = [AangCap]::Window($ov[0].H)
  Save-Scaled $b $Out 0
  $b.Dispose()
  Write-Output "saved window '$($ov[0].Title)' -> $Out"
  exit 0
}

if ($Frames -le 1) {
  $b = [AangCap]::Screen($vb.X, $vb.Y, $vb.Width, $vb.Height)
  Save-Scaled $b $Out $MaxDim
  $b.Dispose()
  Write-Output "saved -> $Out"
  exit 0
}

# burst capture: numbered frames, for seeing motion and state changes
$dir = [IO.Path]::GetDirectoryName($Out); if (-not $dir) { $dir = $env:TEMP }
$base = [IO.Path]::GetFileNameWithoutExtension($Out)
New-Item -ItemType Directory -Force $dir | Out-Null
$delay = [int](1000 / [Math]::Max(1, $Fps))
$made = @()
for ($i = 0; $i -lt $Frames; $i++) {
  $b = [AangCap]::Screen($vb.X, $vb.Y, $vb.Width, $vb.Height)
  $p = Join-Path $dir ("{0}_{1:d3}.png" -f $base, $i)
  Save-Scaled $b $p $MaxDim
  $b.Dispose()
  $made += $p
  Start-Sleep -Milliseconds $delay
}
Write-Output ("captured {0} frames at ~{1} fps -> {2}" -f $made.Count, $Fps, $dir)
