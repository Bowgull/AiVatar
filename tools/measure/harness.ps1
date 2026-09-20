# Same test for every window-technology candidate, run while WoW is up.
# Pass/fail thresholds were fixed BEFORE measuring:
#   RAM <=150 MB (all processes), CPU <=2% of one core @30fps, startup <=2 s,
#   transparent pixels click-through / solid pixels catch clicks, topmost over WoW, no focus theft.
param(
  [Parameter(Mandatory)][string]$Exe,
  [string]$ArgLine = '',
  [string]$Title = 'AangSpike',
  [string]$Label = 'candidate',
  [int]$X = 1430, [int]$Y = 740,
  [int]$Seconds = 30
)
$ErrorActionPreference = 'Stop'
$outDir = Join-Path $env:TEMP ("harness_" + $Label); New-Item -ItemType Directory -Force $outDir | Out-Null

Add-Type -ReferencedAssemblies System.Drawing -TypeDefinition @'
using System; using System.Text; using System.Runtime.InteropServices;
public class U {
  [DllImport("user32.dll")] public static extern IntPtr WindowFromPoint(POINT p);
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern int GetWindowText(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll")] public static extern int GetWindowLong(IntPtr h, int i);
  [DllImport("user32.dll")] public static extern bool SetCursorPos(int x, int y);
  [DllImport("user32.dll")] public static extern bool GetCursorPos(out POINT p);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
  [DllImport("user32.dll")] static extern bool EnumWindows(EW f, IntPtr p);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out RECT r);
  delegate bool EW(IntPtr h, IntPtr p);
  [StructLayout(LayoutKind.Sequential)] public struct POINT { public int X, Y; }
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int L, T, R, B; }
  public static IntPtr FindTitle(string t) { IntPtr f = IntPtr.Zero;
    EnumWindows((h, l) => { var sb = new StringBuilder(256); GetWindowText(h, sb, 256);
      if (sb.ToString() == t && IsWindowVisible(h)) { f = h; return false; } return true; }, IntPtr.Zero); return f; }
  public static string Title(IntPtr h) { var sb = new StringBuilder(256); GetWindowText(h, sb, 256); return sb.ToString(); }
  public static uint Pid(IntPtr h) { uint p; GetWindowThreadProcessId(h, out p); return p; }
  public static IntPtr At(int x, int y) { POINT p = new POINT(); p.X = x; p.Y = y; return WindowFromPoint(p); }
}
'@

function Get-Tree([int]$root) {
  $all = Get-CimInstance Win32_Process | Select-Object ProcessId, ParentProcessId
  $set = New-Object 'System.Collections.Generic.HashSet[int]'; [void]$set.Add($root)
  do { $n = $set.Count; foreach ($p in $all) { if ($set.Contains([int]$p.ParentProcessId)) { [void]$set.Add([int]$p.ProcessId) } } } while ($set.Count -ne $n)
  return @($set)
}
function Sample([int]$root) {
  $ps = @(Get-Process -Id (Get-Tree $root) -ErrorAction SilentlyContinue)
  $cpu = 0.0; $priv = 0L; $ws = 0L
  foreach ($p in $ps) { $cpu += $p.TotalProcessorTime.TotalSeconds; $priv += $p.PrivateMemorySize64; $ws += $p.WorkingSet64 }
  [pscustomobject]@{ n = $ps.Count; cpu = $cpu; privMB = [math]::Round($priv / 1MB, 0); wsMB = [math]::Round($ws / 1MB, 0) }
}
function Styles($h) {
  $ex = [U]::GetWindowLong($h, -20)
  "topmost={0} layered={1} click-through-style={2} no-activate={3}" -f (($ex -band 0x8) -ne 0), (($ex -band 0x80000) -ne 0), (($ex -band 0x20) -ne 0), (($ex -band 0x08000000) -ne 0)
}

$fg0 = [U]::GetForegroundWindow()
"foreground before launch : '" + [U]::Title($fg0) + "'"
$orig = New-Object U+POINT; [void][U]::GetCursorPos([ref]$orig)

$sw = [Diagnostics.Stopwatch]::StartNew()
if ($ArgLine) { $proc = Start-Process -FilePath $Exe -ArgumentList $ArgLine -PassThru } else { $proc = Start-Process -FilePath $Exe -PassThru }
$h = [IntPtr]::Zero
while ($sw.Elapsed.TotalSeconds -lt 25) { $h = [U]::FindTitle($Title); if ($h -ne [IntPtr]::Zero) { break }; Start-Sleep -Milliseconds 100 }
if ($h -eq [IntPtr]::Zero) { "WINDOW NEVER APPEARED (title '$Title')"; Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue; exit 2 }
$startup = [math]::Round($sw.Elapsed.TotalSeconds, 2)
"startup to visible       : $startup s"
Start-Sleep -Seconds 2

$r = New-Object U+RECT; [void][U]::GetWindowRect($h, [ref]$r)
"window rect              : {0},{1} {2}x{3}" -f $r.L, $r.T, ($r.R - $r.L), ($r.B - $r.T)
"styles (initial)         : " + (Styles $h)
"foreground after launch  : '" + [U]::Title([U]::GetForegroundWindow()) + "'  (unchanged=" + ([U]::GetForegroundWindow() -eq $fg0) + ")"

$spr = @(($r.L + 360), ($r.T + 325)); $bub = @(($r.L + 100), ($r.T + 170)); $clr = @(($r.L + 100), ($r.T + 310))
function Ours([int]$x, [int]$y) { $hh = [U]::At($x, $y); $pid2 = [U]::Pid($hh); return ((Get-Tree $proc.Id) -contains [int]$pid2) }

"`n--- hit tests (true = OUR window would receive the click) ---"
"idle, sprite point            : " + (Ours $spr[0] $spr[1]) + "   (expect False: ignoring mouse until hovered)"
[void][U]::SetCursorPos($spr[0], $spr[1]); Start-Sleep -Milliseconds 500
"hovering sprite               : " + (Ours $spr[0] $spr[1]) + "   (expect True)"
"styles while hovering sprite  : " + (Styles $h)
[void][U]::SetCursorPos($bub[0], $bub[1]); Start-Sleep -Milliseconds 500
"hovering bubble               : " + (Ours $bub[0] $bub[1]) + "   (expect True)"
[void][U]::SetCursorPos($clr[0], $clr[1]); Start-Sleep -Milliseconds 500
"hovering transparent area     : " + (Ours $clr[0] $clr[1]) + "  (expect False = click passes to the game)"
"styles after leaving          : " + (Styles $h)
"foreground after hovering     : '" + [U]::Title([U]::GetForegroundWindow()) + "'  (unchanged=" + ([U]::GetForegroundWindow() -eq $fg0) + ")"

$cap = "C:\Users\Shadow\Documents\Rainmeter\Skins\BloodWired\@Resources\Scripts\core\Capture.ps1"
$full = Join-Path $outDir 'full.png'
& powershell.exe -NoProfile -ExecutionPolicy Bypass -File $cap -Out $full -MaxDim 0 | Out-Null
Add-Type -AssemblyName System.Drawing
if (Test-Path $full) {
  $b = New-Object System.Drawing.Bitmap $full
  $rect = New-Object System.Drawing.Rectangle 1300, 680, 620, 400
  $crop = $b.Clone($rect, $b.PixelFormat); $crop.Save((Join-Path $outDir 'region.png')); $crop.Dispose(); $b.Dispose()
  "screenshot region         : " + (Join-Path $outDir 'region.png')
}

"`n--- resource use, {0}s sampling while WoW is running ---" -f $Seconds
$a = Sample $proc.Id; $t0 = Get-Date; $gpu = @()
for ($i = 0; $i -lt [math]::Ceiling($Seconds / 5); $i++) { Start-Sleep -Seconds 5; $gpu += [int](nvidia-smi --query-gpu=utilization.gpu --format=csv,noheader,nounits) }
$b2 = Sample $proc.Id; $dt = ((Get-Date) - $t0).TotalSeconds
"processes in tree         : {0}" -f $b2.n
"private memory (all)      : {0} MB   (working set {1} MB)" -f $b2.privMB, $b2.wsMB
"CPU over {0:N0}s            : {1:N2}% of one core" -f $dt, ((($b2.cpu - $a.cpu) / $dt) * 100)
"GPU util during (WoW up)  : avg {0:N0}%  (noisy: the game dominates)" -f (($gpu | Measure-Object -Average).Average)

[void][U]::SetCursorPos($orig.X, $orig.Y)
& taskkill /PID $proc.Id /T /F 2>&1 | Out-Null
"`nDONE ($Label)"
