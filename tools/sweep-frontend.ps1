# Every interaction with the new bubble and typing box, in one recording, with a screenshot and the
# position of each Aang window at every step. Written 2026-10-04 after "i think its kinda buggy right now".
#
# One message is sent to the brain (step 9), so this is run once per round of fixes, not in a loop.
# SAFE: a throwaway window sits in front first; keys are only typed when Windows says the Aang box is the
# window in front; only text typed here is ever deleted, never select-all; Enter is pressed exactly once.
param([string]$OutDir = "$env:TEMP\aang-sweep")

New-Item -ItemType Directory -Force $OutDir | Out-Null
Remove-Item (Join-Path $OutDir '*.png') -ErrorAction SilentlyContinue
Add-Type -AssemblyName System.Windows.Forms, System.Drawing
Add-Type @'
using System; using System.Runtime.InteropServices; using System.Text;
public static class W {
  [DllImport("user32.dll")] public static extern void keybd_event(byte vk, byte scan, uint flags, UIntPtr extra);
  [DllImport("user32.dll")] public static extern void mouse_event(uint f, int x, int y, uint d, UIntPtr e);
  [DllImport("user32.dll")] public static extern bool SetCursorPos(int x, int y);
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern int GetWindowTextW(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern IntPtr FindWindowW(string c, string t);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out R r);
  [StructLayout(LayoutKind.Sequential)] public struct R { public int L, T, Rt, B; }
  public static string Title(IntPtr h) { var s = new StringBuilder(256); GetWindowTextW(h, s, 256); return s.ToString(); }
  public static string Front() { return Title(GetForegroundWindow()); }
}
'@

$t0 = $null
$log = New-Object System.Collections.ArrayList
function Win($title) {
  # [NullString]::Value, not $null: PowerShell turns $null into "" for a string parameter, and a class
  # name of "" matches nothing - every window read as 'none' on the first run.
  $h = [W]::FindWindowW([NullString]::Value, $title)
  if ($h -eq [IntPtr]::Zero) { return "${title}: none" }
  $r = New-Object W+R; [void][W]::GetWindowRect($h, [ref]$r)
  "${title}: " + $(if ([W]::IsWindowVisible($h)) { 'SHOWN' } else { 'hidden' }) + " $($r.L),$($r.T) $($r.Rt-$r.L)x$($r.B-$r.T)"
}
function Shot($name, $note) {
  $all = [System.Windows.Forms.SystemInformation]::VirtualScreen
  $bmp = New-Object System.Drawing.Bitmap $all.Width, $all.Height
  $g = [System.Drawing.Graphics]::FromImage($bmp); $g.CopyFromScreen($all.Left, $all.Top, 0, 0, $bmp.Size); $g.Dispose()
  $bmp.Save((Join-Path $OutDir "$name.png"), [System.Drawing.Imaging.ImageFormat]::Png); $bmp.Dispose()
  [void]$log.Add(('{0,6:N1}s  {1,-14} {2}' -f ((Get-Date) - $t0).TotalSeconds, $name, $note))
  [void]$log.Add('          front: ' + [W]::Front() + '  |  ' + (Win 'Aang Input') + '  |  ' + (Win 'Aang'))
}
function Hotkey { [W]::keybd_event(0x11,0,0,[UIntPtr]::Zero); [W]::keybd_event(0xBB,0,0,[UIntPtr]::Zero); [W]::keybd_event(0xBB,0,2,[UIntPtr]::Zero); [W]::keybd_event(0x11,0,2,[UIntPtr]::Zero) }
function TypeIfBox($keys) {
  if ([W]::Front() -ne 'Aang Input') { [void]$log.Add("          SKIPPED typing '$keys': the box is not in front"); return $false }
  [System.Windows.Forms.SendKeys]::SendWait($keys); return $true
}
# REAL movement, through the input stream. SetCursorPos teleports the pointer without generating input
# events, so the bubble - which hears the mouse through a hook that only sees real input - never knew it
# was there. The first hover test was testing the teleport, not the bubble.
function MoveTo($x, $y) {
  $sw = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds.Width; $sh = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds.Height
  $from = [System.Windows.Forms.Cursor]::Position
  for ($i = 1; $i -le 12; $i++) {
    $px = $from.X + ($x - $from.X) * $i / 12; $py = $from.Y + ($y - $from.Y) * $i / 12
    [W]::mouse_event(0x8001, [int]($px * 65535 / $sw), [int]($py * 65535 / $sh), 0, [UIntPtr]::Zero)
    Start-Sleep -Milliseconds 25
  }
}
function Click($x, $y) { [void][W]::SetCursorPos($x, $y); Start-Sleep -Milliseconds 80; [W]::mouse_event(2,0,0,0,[UIntPtr]::Zero); [W]::mouse_event(4,0,0,0,[UIntPtr]::Zero) }

# The decoy, alive for the whole run.
$decoy = Start-Process powershell -PassThru -WindowStyle Hidden -ArgumentList @('-NoProfile','-Command', @"
Add-Type -AssemblyName System.Windows.Forms
`$f = New-Object Windows.Forms.Form; `$f.Text = 'Aang typing test (decoy)'; `$f.Width = 360; `$f.Height = 120
`$f.StartPosition = 'Manual'; `$f.Left = 60; `$f.Top = 60; `$f.TopMost = `$false
`$t = New-Object Windows.Forms.TextBox; `$t.Dock = 'Fill'; `$t.Multiline = `$true; `$f.Controls.Add(`$t)
`$timer = New-Object Windows.Forms.Timer; `$timer.Interval = 95000; `$timer.Add_Tick({ `$f.Close() }); `$timer.Start()
`$f.Add_Shown({ `$f.Activate(); `$t.Focus() })
[Windows.Forms.Application]::Run(`$f)
"@)
for ($i = 0; $i -lt 40 -and [W]::Front() -ne 'Aang typing test (decoy)'; $i++) { Start-Sleep -Milliseconds 100 }

$ff = Start-Process -FilePath ffmpeg -PassThru -NoNewWindow -RedirectStandardError (Join-Path $OutDir 'ff.txt') -ArgumentList @(
  '-y','-f','gdigrab','-framerate','15','-i','desktop','-t','88','-c:v','libx264','-preset','veryfast','-pix_fmt','yuv420p', (Join-Path $OutDir 'sweep.mkv'))
$t0 = Get-Date
Start-Sleep -Milliseconds 1000
Shot '0-start' 'before anything'

Hotkey; Start-Sleep -Milliseconds 900;                                   Shot '1-open'      'Ctrl+Plus: box should be open, beside Aang, caret in it'
[void](TypeIfBox 'hello there'); Start-Sleep -Milliseconds 400;           Shot '2-typed'     'typed "hello there"'
[void](TypeIfBox '+{ENTER}two+{ENTER}three+{ENTER}four+{ENTER}five'); Start-Sleep -Milliseconds 500
                                                                          Shot '3-multiline' 'five lines: should grow UP, scroll past four'
[void](TypeIfBox ('{BACKSPACE}' * 20))   # exactly what step 3 typed: 4 newlines + 16 letters; Start-Sleep -Milliseconds 300
[void](TypeIfBox '{ESC}'); Start-Sleep -Milliseconds 900;                 Shot '4-esc'       'Esc: box closed; draft "hello there" kept'
Hotkey; Start-Sleep -Milliseconds 900;                                   Shot '5-reopen'    'Ctrl+Plus again: draft should still be there'
[void](TypeIfBox '{UP}'); Start-Sleep -Milliseconds 400;                 Shot '6-history'   'Up: previous message recalled'
[void](TypeIfBox '{DOWN}'); Start-Sleep -Milliseconds 300
Click 200 100; Start-Sleep -Milliseconds 900;                            Shot '7-clickaway' 'clicked the decoy: box should close'
Hotkey; Start-Sleep -Milliseconds 700; Hotkey; Start-Sleep -Milliseconds 900
                                                                          Shot '8-toggle'    'Ctrl+Plus twice: open then closed'
Hotkey; Start-Sleep -Milliseconds 800
[void](TypeIfBox ('{BACKSPACE}' * 11))
$sent = TypeIfBox 'in two short sentences, what is tea?'
Start-Sleep -Milliseconds 300
if ($sent) { [void](TypeIfBox '{ENTER}') }
Start-Sleep -Milliseconds 1200;                                          Shot '9a-sent'     'Enter: box closed, dots'
Start-Sleep -Milliseconds 3500;                                          Shot '9b-reply'    'reply revealing'
Start-Sleep -Milliseconds 4000;                                          Shot '9c-reply'    'reply finished'

# Hover the bubble, wherever it ended up.
$h = [W]::FindWindowW([NullString]::Value, 'Aang')
if ($h -ne [IntPtr]::Zero) {
  $r = New-Object W+R; [void][W]::GetWindowRect($h, [ref]$r)
  MoveTo ($r.Rt - 60) ($r.B - 45)
}
Start-Sleep -Milliseconds 900;                                           Shot '10-hover'    'mouse over the bubble: copy and rate keys'
MoveTo 900 500
Start-Sleep -Milliseconds 25000;                                         Shot '11-later'    '25 s later: the bubble should have gone'
Start-Sleep -Milliseconds 18000;                                         Shot '12-much-later' '43 s later'

$ff.WaitForExit()
$log | Set-Content -Encoding utf8 (Join-Path $OutDir 'log.txt')
$log
