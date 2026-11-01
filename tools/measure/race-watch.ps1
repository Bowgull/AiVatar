# race-watch.ps1 - watch the model races live, in neon (2026-11-01, his "make terminal look WAYY cooler, cyberpunk").
# Tails the race log and paints each line: model headers as magenta plates, scores as cyan with bars, step tables green/red.
# Run: powershell -NoProfile -ExecutionPolicy Bypass -File tools\measure\race-watch.ps1 [log]
param([string]$Log = "$env:USERPROFILE\Documents\Aang\reports\scoreboard\race round 2.log")

$e = [char]27
function C($r, $g, $b) { "$e[38;2;$r;$g;${b}m" }
$PINK = C 255 46 196; $CYAN = C 0 240 255; $LIME = C 57 255 20; $RED = C 255 49 86; $GOLD = C 255 214 0; $DIM = C 110 90 160; $WHITE = C 235 235 255
$BOLD = "$e[1m"; $R = "$e[0m"
[Console]::OutputEncoding = [Text.Encoding]::UTF8

function Bar([int]$got, [int]$of) {
  if ($of -le 0) { return '' }
  $w = 20; $f = [math]::Round($w * $got / $of)
  $col = if ($got -eq $of) { $LIME } elseif ($got / $of -ge 0.75) { $CYAN } else { $RED }
  return "$col" + ([string][char]0x2588 * $f) + "$DIM" + ([string][char]0x2591 * ($w - $f)) + "$R"
}

function Paint([string]$l) {
  if ($l -match '^#{5,}\s*(.+)$') {
    $name = $Matches[1]; $line = [string][char]0x2550 * ([math]::Min(74, $name.Length + 8))
    return "`n$PINK$BOLD$([char]0x2554)$line$([char]0x2557)`n$([char]0x2551)  >> $WHITE$name$PINK   $([char]0x2551)`n$([char]0x255A)$line$([char]0x255D)$R"
  }
  if ($l -match '^##\s*(.+)$') { return "`n$GOLD$BOLD// $($Matches[1].ToUpper())$R" }
  if ($l -match '^round') { return "$DIM$l$R" }
  # vision: "model: 30/33 (what ..., read ..., find ...), median 0.45 s"
  if ($l -match '^(\S+): (\d+)/(\d+) \((.+)\), median ([\d.]+) s(.*)$') {
    return "$CYAN$BOLD$($Matches[1])$R  $(Bar $Matches[2] $Matches[3]) $WHITE$BOLD$($Matches[2])/$($Matches[3])$R  $DIM$($Matches[4])$R  $PINK$($Matches[5]) s$R$DIM$($Matches[6])$R"
  }
  # answers: "model: facts 8/9, linter fixes 2, first word 0.19 s, done 0.90 s"
  if ($l -match '^(\S+): facts (\d+)/(\d+), linter fixes (\d+), first word ([\d.]+) s, done ([\d.]+) s') {
    return "$CYAN[ANSWERS]$R facts $(Bar $Matches[2] $Matches[3]) $WHITE$($Matches[2])/$($Matches[3])$R  first word $PINK$BOLD$($Matches[5]) s$R  done $PINK$($Matches[6]) s$R  ${DIM}fixes $($Matches[4])$R"
  }
  # router: "model: exact 61/72, UNSAFE 5, median 229 ms"
  if ($l -match '^(\S+): exact (\d+)/(\d+), UNSAFE (\d+), median (\d+) ms') {
    return "$CYAN[ROUTER] $R right $(Bar $Matches[2] $Matches[3]) $WHITE$($Matches[2])/$($Matches[3])$R  ${RED}risky $($Matches[4])$R  $PINK$($Matches[5]) ms$R"
  }
  if ($l -match '^model\s+1 step') { return "$CYAN[TOOLS]  $DIM$l$R" }
  if ($l -match '^\S+\s+(\d/\d\s+){4}\d/\d') {
    $out = $l -replace '(\d)/\1(?!\d)', "$LIME`$1/`$1$R" -replace '(0/\d)', "$RED`$1$R"
    return "         $out"
  }
  # facts (modelrace): "model   12.1G   45.9     7/8      0    ok    2.9"
  if ($l -match '^\S+\s+([\d.]+)G\s+([\d.]+)\s+(\d)/(\d)\s+(\d+)\s+\S+\s+([\d.]+)\s*$') {
    return "$CYAN[FACTS]$R  found $(Bar $Matches[3] $Matches[4]) $WHITE$($Matches[3])/$($Matches[4])$R  $PINK$BOLD$($Matches[2]) words/s$R  ${GOLD}card $($Matches[1]) GB$R  ${DIM}junk kept $($Matches[5])$R"
  }
  if ($l -match '^\S+:?\s*$') { return $null }                       # the model's name again, above its misses
  if ($l -match '^\s+(missed|\d+ steps|[\w-]+ (what|read|find))\s*:') { return "$DIM   x $($l.Trim())$R" }
  if ($l -match '^card:') { return "$GOLD   $l$R" }
  if ($l -match '^=+$' -or $l -match 'WHERE MULTI-STEP|^The last column|^Anything past|^facts = expected|^\s*$') { return $null }
  return "$DIM$l$R"
}

Clear-Host
$title = @(
  "$PINK$BOLD  _   _   _  _  ___     __  __  ___  ___  ___ _       _   ___ ___ _  _   _ ",
  " /_\ /_\ | \| |/ __|   |  \/  |/ _ \|   \| __| |     /_\ | _ \ __| \| | /_\ ",
  "/ _ \/ _ \| .`` | (_ |   | |\/| | (_) | |) | _|| |__  / _ \|   / _|| .`` |/ _ \",
  "/_/ \_\/ \_\_|\_|\___|   |_|  |_|\___/|___/|___|____|/_/ \_\_|_\___|_|\_/_/ \_\$R",
  "$CYAN  >> local models racing on the RTX 2000 Ada // live feed // Ctrl+C to leave$R",
  "$DIM  ----------------------------------------------------------------------------$R"
)
$title | ForEach-Object { Write-Host $_ }
Get-Content -LiteralPath $Log -Wait -Tail 200 -Encoding UTF8 | ForEach-Object { $p = Paint $_; if ($null -ne $p) { Write-Host $p } }
