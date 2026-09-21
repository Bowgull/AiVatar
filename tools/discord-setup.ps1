# Connect Aang to Discord. Double-click discord-setup.cmd (next to this file) to run it.
#
# 1. Asks for the bot token with the input hidden, and stores it where only this Windows user can read it
#    (%APPDATA%\Aang\discord.token). It never goes in the repo, a chat, or the clipboard history.
# 2. Restarts Aang so he connects.
# 3. Shows the 6-digit pairing code. Send it to Aang in #aang and he answers only you from then on.
$ErrorActionPreference = 'Stop'
$dir = Join-Path $env:APPDATA 'Aang'
$token = Join-Path $dir 'discord.token'
$pair = Join-Path $dir 'discord-pairing.txt'
New-Item -ItemType Directory -Force $dir | Out-Null

Write-Host ''
Write-Host '  Aang: connect to Discord' -ForegroundColor Yellow
Write-Host '  -------------------------'
Write-Host '  In the Discord Developer Portal, open your Aang app, go to Bot, click Reset Token, then Copy.'
Write-Host '  Paste it below. Nothing will show as you paste. That is on purpose.'
Write-Host ''
$secure = Read-Host '  Token' -AsSecureString
$plain = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure))
$plain = $plain.Trim()
if ($plain.Length -lt 50 -or $plain -notmatch '^[A-Za-z0-9_\-\.]+$') {
    Write-Host '  That does not look like a bot token (they are long, with two dots). Nothing was saved.' -ForegroundColor Red
    Read-Host '  Press Enter to close'; exit 1
}
Set-Content -Path $token -Value $plain -NoNewline -Encoding ascii
# Only this user can read it: remove inherited access, grant the current user alone.
icacls $token /inheritance:r /grant:r "$($env:USERNAME):(R,W)" | Out-Null
$plain = $null
Write-Host '  Saved, readable by your Windows account only.' -ForegroundColor Green

Remove-Item $pair -ErrorAction SilentlyContinue
Write-Host '  Restarting Aang so he connects...'
Get-Process Aang -ErrorAction SilentlyContinue | Stop-Process
Start-Sleep -Seconds 2
$lnk = Join-Path ([Environment]::GetFolderPath('Startup')) 'Aang.lnk'
if (Test-Path $lnk) { Start-Process $lnk } else { Write-Host '  Could not find Aang''s shortcut; start Aang yourself.' -ForegroundColor Red }

Write-Host '  Waiting for Aang to reach Discord (up to a minute)...'
$state = Join-Path $dir 'discord.json'
for ($i = 0; $i -lt 60; $i++) {
    Start-Sleep -Seconds 1
    if (Test-Path $pair) {
        $code = (Get-Content $pair -Raw).Trim()
        Write-Host ''
        Write-Host "  Your pairing code:  $code" -ForegroundColor Yellow
        Write-Host '  In your Aang Discord server, open #aang and send just that number.'
        Write-Host '  It works for 10 minutes. After that, run this again for a new one.'
        Write-Host ''
        Read-Host '  Press Enter to close'; exit 0
    }
    if ((Test-Path $state) -and ((Get-Content $state -Raw) -match '"ownerId":\s*"\d+')) {
        Write-Host '  Aang is connected and already paired to you. Nothing else to do.' -ForegroundColor Green
        Read-Host '  Press Enter to close'; exit 0
    }
}
Write-Host '  Aang did not reach Discord. Check %APPDATA%\Aang\core.log for a line starting "discord:".' -ForegroundColor Red
Read-Host '  Press Enter to close'
