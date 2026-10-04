# Record the screen, and measure whether it is actually keeping up.
#
# Written 2026-10-04. A still picture cannot show a freeze: a freeze is frames NOT changing, and a
# stutter is frames arriving late. Both need a recording and a clock.
#
# Two things come out of this:
#   1. an mp4 to watch
#   2. ffmpeg's own report of how many frames it got and how many it dropped, which is the number that
#      says whether the desktop was keeping up. A dropped frame here means the screen itself did not
#      update in time, not that the recorder was slow.
#
# Alongside it, the CPU of every Aang process, sampled while recording, so a stutter can be laid at the
# door of the right program instead of guessed at.
#
# LET IT RUN OUT. Do not kill it.
#
# Killing ffmpeg loses whatever is still in its write buffer, and on 2026-10-04 that turned a real
# 35-second recording of the problem being diagnosed into an unreadable file, and then a second
# 6-second test into a 0 KB one. Matroska helps with truncation but not with a lost buffer.
#
# So: choose a length and let it finish. Forty-five seconds is long enough to catch a freeze, and if
# more is needed, record again. A recording that completes is worth more than one that can be stopped.
#
#   powershell -NoProfile -ExecutionPolicy Bypass -File tools\record-screen.ps1 -Seconds 12 -Out run.mkv
param(
  [int]$Seconds = 10,
  # MATROSKA, NOT MP4, and that is not a preference.
  #
  # An mp4 only becomes playable when ffmpeg writes its index at the very end. Stop the recording part
  # way through - which is exactly what happens when the person watching says "stop now" - and the file
  # is rubble. That lost a real 35-second recording of the very thing being diagnosed, on 2026-10-04.
  # Matroska writes as it goes, so a half-finished recording is still a working recording.
  [string]$Out = "$env:TEMP\aang-screen.mkv",
  [int]$Fps = 30
)

$ffmpeg = (Get-Command ffmpeg -ErrorAction SilentlyContinue).Source
if (-not $ffmpeg) { "ffmpeg is not installed; nothing recorded"; exit 1 }

# gdigrab reads what Windows actually put on screen, so it sees layered and always-on-top windows the
# way he sees them. It does NOT see hardware-protected video, which comes out black on purpose.
$log = "$env:TEMP\aang-ffmpeg.log"
$args = @(
  '-y', '-f', 'gdigrab', '-framerate', "$Fps", '-i', 'desktop',
  '-t', "$Seconds",
  # Fast and plain: this is evidence, not a film. veryfast keeps the recorder itself from being the
  # thing that steals the CPU we are trying to measure.
  '-c:v', 'libx264', '-preset', 'veryfast', '-pix_fmt', 'yuv420p',
  $Out
)
$p = Start-Process -FilePath $ffmpeg -ArgumentList $args -NoNewWindow -PassThru -RedirectStandardError $log

# --- what each of Aang's processes is doing while it records -----------------------------------------
$names = 'Aang', 'electron', 'node'
$first = @{}
foreach ($pr in Get-Process -Name $names -ErrorAction SilentlyContinue) {
  $first[$pr.Id] = @{ Name = $pr.ProcessName; Cpu = $pr.TotalProcessorTime.TotalSeconds; Mem = $pr.WorkingSet64 }
}
$started = Get-Date
$p.WaitForExit()
$elapsed = ((Get-Date) - $started).TotalSeconds

$rows = New-Object System.Collections.ArrayList
foreach ($pr in Get-Process -Name $names -ErrorAction SilentlyContinue) {
  if (-not $first.ContainsKey($pr.Id)) { continue }
  $used = $pr.TotalProcessorTime.TotalSeconds - $first[$pr.Id].Cpu
  [void]$rows.Add([pscustomobject]@{
    Process = $first[$pr.Id].Name
    Pid     = $pr.Id
    CpuPct  = [math]::Round(100 * $used / [math]::Max($elapsed, 0.001) / [Environment]::ProcessorCount, 1)
    MemMB   = [math]::Round($pr.WorkingSet64 / 1MB)
  })
}

"recorded $Out  ($Seconds s at $Fps fps)"
$rows | Sort-Object CpuPct -Descending | Format-Table -AutoSize

# --- did the SCREEN keep up? --------------------------------------------------------------------------
# ffmpeg prints "frame= N" and counts drops. Dropped frames mean the desktop did not update in time,
# which is exactly what a freeze or a stutter looks like from here.
# The whole log, not the tail: ffmpeg prints its encoder statistics AFTER the frame summary, so the
# last three lines never contain it. That cost a confusing "no summary" on the first run.
$summary = (Select-String -Path $log -Pattern 'frame=' -ErrorAction SilentlyContinue |
            Select-Object -Last 1 | ForEach-Object { $_.Line })
if ($summary) {
  $got = if ($summary -match 'frame=\s*(\d+)') { [int]$Matches[1] } else { 0 }
  $want = $Seconds * $Fps
  $drop = if ($summary -match 'drop=\s*(\d+)') { [int]$Matches[1] } else { 0 }
  "frames: $got of about $want expected, $drop dropped"
  if ($want -gt 0) {
    $pct = [math]::Round(100 * $got / $want)
    # Only a judgement if it actually ran its full length. Stopped early, a low count means it was
    # stopped early, and saying "the screen did not keep up" would be a lie dressed as a measurement.
    $ran = if ($summary -match 'time=(\d+):(\d+):([\d.]+)') { [double]$Matches[1]*3600 + [double]$Matches[2]*60 + [double]$Matches[3] } else { 0 }
    if ($ran -lt $Seconds * 0.9) {
      "stopped early after $([math]::Round($ran,1))s, so there is no verdict on frame rate; $got frames recorded"
    } elseif ($pct -lt 90) {
      "THE SCREEN DID NOT KEEP UP: only $pct% of the expected frames ever changed."
    } else {
      "the screen kept up ($pct% of expected frames)"
    }
  }
} else {
  "ffmpeg wrote no summary; see $log"
}

# --- reading the result -------------------------------------------------------------------------------
# To find stretches where the picture stopped changing:
#
#   ffmpeg -hide_banner -nostats -i run.mkv -vf "freezedetect=n=0.003:d=0.5" -map 0:v -f null -
#
# (In PowerShell 5.1, send its output to a file with -RedirectStandardError rather than 2>&1: redirecting
# a native program's stderr inline turns every line into an error record and sets $? to false.)
#
# IMPORTANT, or this will mislead: freezedetect reports a still desktop as frozen, because a still
# desktop IS a still picture. On an idle machine it will say freeze_start: 0 and mean nothing at all.
# The signal worth having is a freeze DURING something - while a window opens, while the pet slides,
# while a reply is being revealed. Record while that is happening and read the times against it.
