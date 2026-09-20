# Drives the real Body with real mouse and keyboard input and checks what it does.
#   drag       : press on the sprite, move, release -> window moves by the same delta and the position is saved
#   remembered : relaunch -> window reappears where it was dropped
#   hotkey     : Ctrl+Alt+A hides then shows the window
# The test moves the real cursor for a couple of seconds. It clicks only on a pixel that Windows reports
# belongs to the Body window, so a click can never land on the game.
param([string]$Exe = "$PSScriptRoot\..\..\src\Body\bin\Release\net10.0-windows\Aang.exe", [ValidateSet('as-is','neutral','wow')][string]$Foreground = 'as-is')
$ErrorActionPreference = 'Stop'

Add-Type -TypeDefinition @'
using System; using System.Text; using System.Runtime.InteropServices;
public class M {
  [DllImport("user32.dll")] public static extern bool SetCursorPos(int x, int y);
  [DllImport("user32.dll")] public static extern void mouse_event(uint f, int dx, int dy, uint d, UIntPtr e);
  [DllImport("user32.dll")] public static extern void keybd_event(byte vk, byte scan, uint flags, UIntPtr e);
  [DllImport("user32.dll")] public static extern bool GetCursorPos(out P p);
  [DllImport("user32.dll")] public static extern IntPtr WindowFromPoint(P p);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
  [DllImport("user32.dll")] static extern bool EnumWindows(EW f, IntPtr p);
  [DllImport("user32.dll")] public static extern int GetWindowText(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out R r);
  [StructLayout(LayoutKind.Sequential)] public struct GTI { public int cbSize, flags; public IntPtr hwndActive, hwndFocus, hwndCapture, hwndMenuOwner, hwndMoveSize, hwndCaret; public R rcCaret; }
  [DllImport("user32.dll")] public static extern bool GetGUIThreadInfo(uint tid, ref GTI info);
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern void SwitchToThisWindow(IntPtr h, bool alt);
  public static string Title(IntPtr h) { var sb = new StringBuilder(256); GetWindowText(h, sb, 256); return sb.ToString(); }
  public static string Who() { IntPtr fg = GetForegroundWindow(); uint pid; uint tid = GetWindowThreadProcessId(fg, out pid); GTI g = new GTI(); g.cbSize = Marshal.SizeOf(g); GetGUIThreadInfo(tid, ref g);
    return "foreground='" + Title(fg) + "' mouse-capture=" + (g.hwndCapture == IntPtr.Zero ? "none" : "HELD by " + Title(g.hwndCapture) + " (" + g.hwndCapture + ")"); }
  delegate bool EW(IntPtr h, IntPtr p);
  [StructLayout(LayoutKind.Sequential)] public struct P { public int X, Y; }
  [StructLayout(LayoutKind.Sequential)] public struct R { public int L, T, Rr, B; }
  public static IntPtr Find(string t, bool visibleOnly) { IntPtr f = IntPtr.Zero;
    EnumWindows((h, l) => { var sb = new StringBuilder(256); GetWindowText(h, sb, 256);
      if (sb.ToString() == t && (!visibleOnly || IsWindowVisible(h))) { f = h; return false; } return true; }, IntPtr.Zero); return f; }
  public static uint Pid(IntPtr h) { uint p; GetWindowThreadProcessId(h, out p); return p; }
  public static IntPtr At(int x, int y) { P p = new P(); p.X = x; p.Y = y; return WindowFromPoint(p); }
}
'@

$cfg = Join-Path $env:APPDATA 'Aang\body.json'; $log = Join-Path $env:APPDATA 'Aang\body.log'
$notepad = $null
if ($Foreground -eq 'neutral') { $notepad = Start-Process notepad -PassThru; Start-Sleep -Seconds 2 }
if ($Foreground -eq 'wow') {
  Get-Process notepad -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
  $w = Get-Process WowB -ErrorAction SilentlyContinue | Select-Object -First 1
  if (-not $w) { 'WoW is not running; cannot test with WoW in front'; exit 3 }
  [M]::SwitchToThisWindow($w.MainWindowHandle, $true); Start-Sleep -Milliseconds 1200
}
if (Test-Path $cfg) { Remove-Item $cfg -Force }
$title = 'Aang Body'
$pass = 0; $fail = 0
function Check($name, $ok, $detail = '') { if ($ok) { $script:pass++ } else { $script:fail++ }; "{0}  {1}  {2}" -f ($(if ($ok) { 'PASS' } else { 'FAIL' })), $name, $detail }
function Wait-Window([bool]$visible = $true) { for ($i = 0; $i -lt 60; $i++) { $h = [M]::Find($title, $visible); if ($h -ne [IntPtr]::Zero) { return $h }; Start-Sleep -Milliseconds 100 }; return [IntPtr]::Zero }
function Rect($h) { $r = New-Object M+R; [void][M]::GetWindowRect($h, [ref]$r); $r }

$orig = New-Object M+P; [void][M]::GetCursorPos([ref]$orig)
$p1 = Start-Process -FilePath $Exe -ArgumentList '--quiet=never' -PassThru
$h = Wait-Window
Check 'window appears' ($h -ne [IntPtr]::Zero)
Start-Sleep -Milliseconds 800
$r0 = Rect $h
"before drag : " + [M]::Who()
$sx = $r0.L + 360; $sy = $r0.T + 215

# only ever press on a pixel Windows says belongs to the Body
$owner = [M]::Pid([M]::At($sx, $sy))
if ($owner -ne $p1.Id) { Check 'sprite pixel belongs to the Body (safe to click)' $false; [void][M]::SetCursorPos($orig.X, $orig.Y); Stop-Process -Id $p1.Id -Force; exit 2 }
Check 'sprite pixel belongs to the Body (safe to click)' $true

# ---- drag
$dx = -300; $dy = -200
[void][M]::SetCursorPos($sx, $sy); Start-Sleep -Milliseconds 150
[M]::mouse_event(0x0002, 0, 0, 0, [UIntPtr]::Zero)      # left down
for ($i = 1; $i -le 12; $i++) { [void][M]::SetCursorPos($sx + [int]($dx * $i / 12), $sy + [int]($dy * $i / 12)); Start-Sleep -Milliseconds 25 }
[M]::mouse_event(0x0004, 0, 0, 0, [UIntPtr]::Zero)      # left up
Start-Sleep -Milliseconds 400
$r1 = Rect $h
"after drag  : " + [M]::Who()
Check 'drag moves the window by the mouse delta' ((($r1.L - $r0.L) -eq $dx) -and (($r1.T - $r0.T) -eq $dy)) ("moved {0},{1} (asked {2},{3})" -f ($r1.L - $r0.L), ($r1.T - $r0.T), $dx, $dy)
Check 'position saved to body.json' ((Test-Path $cfg) -and ((Get-Content $cfg -Raw) -match [regex]::Escape([string]$r1.L))) $(if (Test-Path $cfg) { (Get-Content $cfg -Raw) -replace '\s+', ' ' })

# ---- hotkey Ctrl+Alt+A
# Which combo did the Body actually register? (it tries a fallback list when another program owns one)
$combo = (Get-Content $log | Where-Object { $_ -match 'hotkey registered: (.+)$' } | Select-Object -Last 1) -replace '^.*hotkey registered: ', ''
"hotkey in use: '$combo'"
function KeyCodes([string]$c) { $codes = @(); foreach ($part in ($c -split '\+')) { switch -Regex ($part.Trim().ToLower()) { '^ctrl$' { $codes += 0x11 } '^alt$' { $codes += 0x12 } '^shift$' { $codes += 0x10 } '^win$' { $codes += 0x5B } '^space$' { $codes += 0x20 } '^home$' { $codes += 0x24 } '^f(\d+)$' { $codes += (0x6F + [int]$Matches[1]) } '^[a-z0-9]$' { $codes += [int][char]$part.Trim().ToUpper() } } }; $codes }
function Hotkey { $k = KeyCodes $combo; foreach ($c in $k) { [M]::keybd_event([byte]$c, 0, 0, [UIntPtr]::Zero) }; Start-Sleep -Milliseconds 60; [array]::Reverse($k); foreach ($c in $k) { [M]::keybd_event([byte]$c, 0, 2, [UIntPtr]::Zero) }; Start-Sleep -Milliseconds 500 }
Hotkey; $hidden = ([M]::Find($title, $true) -eq [IntPtr]::Zero)
Check "hotkey $combo hides Aang" $hidden
Hotkey; $shown = ([M]::Find($title, $true) -ne [IntPtr]::Zero)
Check "hotkey $combo shows Aang again" $shown

# ---- remembered position
Stop-Process -Id $p1.Id -Force; Start-Sleep -Milliseconds 500
$p2 = Start-Process -FilePath $Exe -ArgumentList '--quiet=never' -PassThru
$h2 = Wait-Window; Start-Sleep -Milliseconds 600
$r2 = Rect $h2
Check 'position is remembered after a restart' (($r2.L -eq $r1.L) -and ($r2.T -eq $r1.T)) ("now {0},{1} expected {2},{3}" -f $r2.L, $r2.T, $r1.L, $r1.T)

# ---- single instance
$p3 = Start-Process -FilePath $Exe -PassThru; Start-Sleep -Milliseconds 1500
Check 'a second copy exits instead of stacking' ($p3.HasExited)

Stop-Process -Id $p2.Id -Force -ErrorAction SilentlyContinue
if ($notepad) { Stop-Process -Id $notepad.Id -Force -ErrorAction SilentlyContinue }
if (Test-Path $cfg) { Remove-Item $cfg -Force }
[void][M]::SetCursorPos($orig.X, $orig.Y)
"`n$pass passed, $fail failed"
exit $(if ($fail) { 1 } else { 0 })


