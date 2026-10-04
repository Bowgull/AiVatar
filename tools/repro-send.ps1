# The whole loop he uses, recorded: Ctrl+Plus, type straight away, Enter, and the new bubble answering.
#
# Costs ONE short message to the brain, so it is run once per change, not in a loop (his quota rule).
# Same safety as repro-typing-fast: a decoy window is in front first, and the message is only sent if
# Windows says the Aang box is the window in front - otherwise Enter would land somewhere he cares about.
param([string]$OutDir = "$env:TEMP\aang-repro-send", [string]$Text = 'quick test, just say hi')

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
$decoy = Start-Process powershell -PassThru -WindowStyle Hidden -ArgumentList @('-NoProfile','-Command', @"
Add-Type -AssemblyName System.Windows.Forms
`$f = New-Object Windows.Forms.Form; `$f.Text = 'Aang typing test (decoy)'; `$f.Width = 360; `$f.Height = 120
`$f.StartPosition = 'Manual'; `$f.Left = 60; `$f.Top = 60; `$f.TopMost = `$true
`$t = New-Object Windows.Forms.TextBox; `$t.Dock = 'Fill'; `$t.Multiline = `$true; `$f.Controls.Add(`$t)
`$timer = New-Object Windows.Forms.Timer; `$timer.Interval = 6000; `$timer.Add_Tick({ `$f.Close() }); `$timer.Start()
`$f.Add_Shown({ `$f.Activate(); `$t.Focus() })
[Windows.Forms.Application]::Run(`$f)
"@)
for ($i = 0; $i -lt 40 -and [K]::Title([K]::GetForegroundWindow()) -ne 'Aang typing test (decoy)'; $i++) { Start-Sleep -Milliseconds 100 }

$video = Join-Path $OutDir 'send.mkv'
$ff = Start-Process -FilePath ffmpeg -PassThru -NoNewWindow -RedirectStandardError (Join-Path $OutDir 'ff.txt') -ArgumentList @(
  '-y','-f','gdigrab','-framerate','20','-i','desktop','-t','22','-c:v','libx264','-preset','veryfast','-pix_fmt','yuv420p', $video)
$t0 = Get-Date
$log = New-Object System.Collections.ArrayList
function Mark($w) { [void]$log.Add(('{0,6:N2}s  {1}  [front: {2}]' -f ((Get-Date) - $t0).TotalSeconds, $w, [K]::Title([K]::GetForegroundWindow()))) }
Start-Sleep -Milliseconds 1200

Mark 'Ctrl+Plus'
[K]::keybd_event(0x11,0,0,[UIntPtr]::Zero); [K]::keybd_event(0xBB,0,0,[UIntPtr]::Zero)
[K]::keybd_event(0xBB,0,2,[UIntPtr]::Zero); [K]::keybd_event(0x11,0,2,[UIntPtr]::Zero)
Start-Sleep -Milliseconds 60
[System.Windows.Forms.SendKeys]::SendWait($Text)
Mark 'typed'
Start-Sleep -Milliseconds 500
if ([K]::Title([K]::GetForegroundWindow()) -eq 'Aang Input') {
  [System.Windows.Forms.SendKeys]::SendWait('{ENTER}')
  Mark 'Enter (sent)'
} else {
  Mark 'NOT SENT: the Aang box was not in front'
}
$ff.WaitForExit()
"video: $video"
$log
