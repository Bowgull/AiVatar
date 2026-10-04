# Type the way he does: press Ctrl+Plus and start typing IMMEDIATELY, without waiting for the box.
#
# The first repro (repro-typing.ps1) waited until Aang's box was in front before typing, and that is
# exactly why it could not see the bug: the bug is what happens to keys typed in the 600 ms before the
# box exists. This one does not wait.
#
# SAFE: a small throwaway window of its own is put in front first, so if the box fails to take the
# keyboard, the keys land in that window and nowhere he cares about. It closes itself. Clean-up is a
# Backspace per character typed, never select-all, so a draft he already had is left alone (the first
# repro wiped one - that is why).
param([string]$OutDir = "$env:TEMP\aang-repro-fast", [string]$Text = 'aang test')

New-Item -ItemType Directory -Force $OutDir | Out-Null
Add-Type -AssemblyName System.Windows.Forms
Add-Type @'
using System; using System.Runtime.InteropServices; using System.Text;
public static class K {
  [DllImport("user32.dll")] public static extern void keybd_event(byte vk, byte scan, uint flags, UIntPtr extra);
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern int GetWindowTextW(IntPtr h, StringBuilder s, int n);
  public static string Title(IntPtr h) { var s = new StringBuilder(256); GetWindowTextW(h, s, 256); return s.ToString(); }
}
'@

# The decoy: another process, so it is a real foreground app the way his game or Discord would be.
$decoyText = Join-Path $OutDir 'decoy.txt'
Remove-Item $decoyText -ErrorAction SilentlyContinue
$decoy = Start-Process powershell -PassThru -WindowStyle Hidden -ArgumentList @('-NoProfile','-Command', @"
Add-Type -AssemblyName System.Windows.Forms
`$f = New-Object Windows.Forms.Form; `$f.Text = 'Aang typing test (decoy)'; `$f.Width = 360; `$f.Height = 120
`$f.StartPosition = 'Manual'; `$f.Left = 60; `$f.Top = 60; `$f.TopMost = `$true
`$t = New-Object Windows.Forms.TextBox; `$t.Dock = 'Fill'; `$t.Multiline = `$true; `$f.Controls.Add(`$t)
`$timer = New-Object Windows.Forms.Timer; `$timer.Interval = 16000
`$timer.Add_Tick({ [IO.File]::WriteAllText('$decoyText', `$t.Text); `$f.Close() }); `$timer.Start()
`$f.Add_Shown({ `$f.Activate(); `$t.Focus() })
[Windows.Forms.Application]::Run(`$f)
"@)
for ($i = 0; $i -lt 40 -and [K]::Title([K]::GetForegroundWindow()) -ne 'Aang typing test (decoy)'; $i++) { Start-Sleep -Milliseconds 100 }
$before = [K]::Title([K]::GetForegroundWindow())

$video = Join-Path $OutDir 'fast.mkv'
$ff = Start-Process -FilePath ffmpeg -PassThru -NoNewWindow -RedirectStandardError (Join-Path $OutDir 'ff.txt') -ArgumentList @(
  '-y','-f','gdigrab','-framerate','30','-i','desktop','-t','9','-c:v','libx264','-preset','veryfast','-pix_fmt','yuv420p', $video)
$t0 = Get-Date
Start-Sleep -Milliseconds 1200
$log = New-Object System.Collections.ArrayList
function Mark($w) { [void]$log.Add(('{0,6:N2}s  {1}  [front: {2}]' -f ((Get-Date) - $t0).TotalSeconds, $w, [K]::Title([K]::GetForegroundWindow()))) }

Mark 'Ctrl+Plus'
[K]::keybd_event(0x11,0,0,[UIntPtr]::Zero); [K]::keybd_event(0xBB,0,0,[UIntPtr]::Zero)
[K]::keybd_event(0xBB,0,2,[UIntPtr]::Zero); [K]::keybd_event(0x11,0,2,[UIntPtr]::Zero)
Start-Sleep -Milliseconds 60                 # a person's reaction time, roughly: no waiting for the box
foreach ($c in $Text.ToCharArray()) {
  [System.Windows.Forms.SendKeys]::SendWait([string]$c)
  Mark "typed '$c'"
  Start-Sleep -Milliseconds 110
}
Start-Sleep -Milliseconds 2000
$after = [K]::Title([K]::GetForegroundWindow())
Mark 'two seconds later'

# Clean up only what was typed, wherever it went.
if ($after -eq 'Aang Input') {
  for ($i = 0; $i -lt $Text.Length; $i++) { [System.Windows.Forms.SendKeys]::SendWait('{BACKSPACE}') }
  [System.Windows.Forms.SendKeys]::SendWait('{ESC}')
}
$ff.WaitForExit()
$decoy.WaitForExit(20000) | Out-Null
$landedInDecoy = if (Test-Path $decoyText) { (Get-Content $decoyText -Raw) } else { '' }

"in front before:  $before"
"in front after:   $after"
"typed into decoy: '$landedInDecoy'   (anything here is keys the box FAILED to catch)"
"video:            $video"
$log
