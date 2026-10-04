# Reproduce "Ctrl+Plus, start typing, the box stays blank until I click out and back in", on video.
#
# Written 2026-10-04 after he described it exactly. Records the screen at full rate for a fixed length,
# presses the summon hotkey, types slowly, and logs WHEN each key went in, so the frames can be read
# against the keystrokes rather than guessed at.
#
# SAFE BY CONSTRUCTION: it only types if Windows says the foreground window is Aang's own input box
# ("Aang Input"). If focus went anywhere else, it types nothing - otherwise keystrokes would land in
# whatever he had open. It never presses Enter, and it deletes what it typed before closing the box.
param([string]$OutDir = "$env:TEMP\aang-repro")

New-Item -ItemType Directory -Force $OutDir | Out-Null
Add-Type -AssemblyName System.Windows.Forms
Add-Type @'
using System; using System.Runtime.InteropServices; using System.Text;
public static class K {
  [DllImport("user32.dll")] public static extern void keybd_event(byte vk, byte scan, uint flags, UIntPtr extra);
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern int GetWindowTextW(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out R r);
  [StructLayout(LayoutKind.Sequential)] public struct R { public int L, T, Rt, B; }
  public static string Title(IntPtr h) { var s = new StringBuilder(256); GetWindowTextW(h, s, 256); return s.ToString(); }
}
'@

$video = Join-Path $OutDir 'typing.mkv'
$events = New-Object System.Collections.ArrayList
$t0 = $null
function Mark($what) { [void]$events.Add(('{0,6:N2}s  {1}' -f ((Get-Date) - $script:t0).TotalSeconds, $what)) }

# A fixed length, left to finish on its own: killing ffmpeg loses its buffer (learned the hard way).
$ff = Start-Process -FilePath ffmpeg -PassThru -NoNewWindow -RedirectStandardError (Join-Path $OutDir 'ff.txt') -ArgumentList @(
  '-y','-f','gdigrab','-framerate','30','-i','desktop','-t','14',
  '-c:v','libx264','-preset','veryfast','-pix_fmt','yuv420p', $video)
$t0 = Get-Date
Start-Sleep -Milliseconds 1500

# Ctrl + '=+' (VK_OEM_PLUS, 0xBB): the summon hotkey, as he presses it.
Mark 'press Ctrl+Plus'
[K]::keybd_event(0x11, 0, 0, [UIntPtr]::Zero); [K]::keybd_event(0xBB, 0, 0, [UIntPtr]::Zero)
[K]::keybd_event(0xBB, 0, 2, [UIntPtr]::Zero); [K]::keybd_event(0x11, 0, 2, [UIntPtr]::Zero)

# Wait for the slide out (RevealMs) and the box, but no longer than needed.
$box = [IntPtr]::Zero
for ($i = 0; $i -lt 30; $i++) {
  Start-Sleep -Milliseconds 100
  $fg = [K]::GetForegroundWindow()
  if ([K]::Title($fg) -eq 'Aang Input') { $box = $fg; break }
}
if ($box -eq [IntPtr]::Zero) {
  Mark ('box never became the foreground window; foreground is "' + [K]::Title([K]::GetForegroundWindow()) + '" - typing NOTHING')
} else {
  $r = New-Object K+R; [void][K]::GetWindowRect($box, [ref]$r)
  Mark ("box is foreground at $($r.L),$($r.T) $($r.Rt - $r.L)x$($r.B - $r.T)")
  foreach ($c in 'aang test'.ToCharArray()) {
    if ([K]::Title([K]::GetForegroundWindow()) -ne 'Aang Input') { Mark 'focus left the box - stopped typing'; break }
    [System.Windows.Forms.SendKeys]::SendWait([string]$c)
    Mark "typed '$c'"
    Start-Sleep -Milliseconds 220
  }
  Start-Sleep -Milliseconds 2500     # long enough to see whether the text ever appears on its own
  if ([K]::Title([K]::GetForegroundWindow()) -eq 'Aang Input') {
    [System.Windows.Forms.SendKeys]::SendWait('^a'); [System.Windows.Forms.SendKeys]::SendWait('{BACKSPACE}')
    Mark 'cleared what was typed'
    Start-Sleep -Milliseconds 300
    [System.Windows.Forms.SendKeys]::SendWait('{ESC}')
    Mark 'Esc'
  }
}

$ff.WaitForExit()
$events | Set-Content -Encoding utf8 (Join-Path $OutDir 'events.txt')
"video:  $video"
$events
