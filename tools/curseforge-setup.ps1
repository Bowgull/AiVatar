# Connect Aang to CurseForge, so he can tell you when your addons have fallen behind.
# Double-click curseforge-setup.cmd to run it.
#
# WHY THIS EXISTS RATHER THAN JUST PASTING THE KEY INTO A CHAT: a transcript is written down and kept.
# A key pasted into one lives there for ever, and in several places you did not choose. This takes it
# straight from you to a file only your Windows user can read, and nothing else ever sees it.
#
# What Aang does with it: looks up the current version for the project ids already written in your
# addons' own .toc files, so he can say "GearQuest is two versions behind". He does NOT download,
# install, update, move or delete anything in your game folder - there is no code in him that can.
$ErrorActionPreference = 'Stop'
$dir = Join-Path $env:APPDATA 'Aang'
$store = Join-Path $dir 'curseforge.json'
New-Item -ItemType Directory -Force $dir | Out-Null

Write-Host ''
Write-Host '  Aang: connect to CurseForge' -ForegroundColor Yellow
Write-Host '  ---------------------------'
Write-Host ''
Write-Host '  Get your key from https://console.curseforge.com  (API Keys)'
Write-Host '  It is a long string of letters, numbers and $ signs.'
Write-Host ''

# Read-Host -AsSecureString so it is not echoed to the screen and not left in the console history.
$secure = Read-Host '  Paste your CurseForge API key' -AsSecureString
$key = [Runtime.InteropServices.Marshal]::PtrToStringAuto(
    [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure))

if ([string]::IsNullOrWhiteSpace($key)) {
    Write-Host ''
    Write-Host '  Nothing pasted. Run it again when you have the key.' -ForegroundColor Red
    Write-Host ''
    Read-Host '  Press Enter to close'
    exit 1
}
$key = $key.Trim()

Write-Host ''
Write-Host '  Checking it works...' -NoNewline
try {
    # Game 1 is World of Warcraft. A 200 here means the key is real and has the access it needs.
    $r = Invoke-WebRequest -Uri 'https://api.curseforge.com/v1/games/1' -Headers @{ 'x-api-key' = $key; 'Accept' = 'application/json' } -UseBasicParsing -TimeoutSec 20
    if ($r.StatusCode -ne 200) { throw "CurseForge replied $($r.StatusCode)" }
} catch {
    Write-Host ''
    Write-Host "  That key did not work: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host '  Check you copied the whole thing, then run this again.'
    Write-Host ''
    Read-Host '  Press Enter to close'
    exit 1
}
Write-Host ' it works.' -ForegroundColor Green

@{ apiKey = $key; gameId = 1; savedAt = (Get-Date).ToString('o') } |
    ConvertTo-Json | Set-Content -Path $store -Encoding utf8

# Readable by this Windows user only - the same treatment google.json and simkl.json get.
$acl = Get-Acl $store
$acl.SetAccessRuleProtection($true, $false)
$acl.SetAccessRule((New-Object System.Security.AccessControl.FileSystemAccessRule(
    "$env:USERDOMAIN\$env:USERNAME", 'FullControl', 'Allow')))
Set-Acl -Path $store -AclObject $acl

Write-Host ''
Write-Host "  Saved to $store (only you can read it)." -ForegroundColor Green
Write-Host '  Restart Aang and he will check your addons when he starts.'
Write-Host ''
Read-Host '  Press Enter to close'
