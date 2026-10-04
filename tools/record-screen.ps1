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
#   powershell -NoProfile -ExecutionPolicy Bypass -File tools\record-screen.ps1 -Seconds 12 -Out run.mp4
param(
  [int]$Seconds = 10,
  [string]$Out = "$env:TEMP\aang-screen.mp4",
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
    if ($pct -lt 90) { "THE SCREEN DID NOT KEEP UP: only $pct% of the expected frames ever changed." }
    else { "the screen kept up ($pct% of expected frames)" }
  }
} else {
  "ffmpeg wrote no summary; see $log"
}
