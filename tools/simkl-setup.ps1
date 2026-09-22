# Connect Aang to Simkl, so "put the next episode on" works. Double-click simkl-setup.cmd to run it.
#
# Before this, once: sign in at simkl.com, then at simkl.com/settings/developer/new/ create an app (any name, e.g.
# Aang; for the redirect URL use urn:ietf:wg:oauth:2.0:oob). Copy its Client ID.
# Optional second argument: where episodes are opened, as a link with {q} for the search, for example
#   https://www.crunchyroll.com/search?q={q}      (the default)
#
# 1. Asks for the Client ID.
# 2. Shows a code and opens simkl.com/pin. Type the code there and allow Aang.
# 3. Saves the sign-in to %APPDATA%\Aang\simkl.json, readable by this Windows user only.
$ErrorActionPreference = 'Stop'
$dir = Join-Path $env:APPDATA 'Aang'
$store = Join-Path $dir 'simkl.json'
New-Item -ItemType Directory -Force $dir | Out-Null

Write-Host ''
Write-Host '  Aang: connect to Simkl' -ForegroundColor Yellow
Write-Host '  ----------------------'
$clientId = if ($args.Count -gt 0) { $args[0] } else { (Read-Host '  Client ID from your Simkl app') }
$clientId = "$clientId".Trim()
$site = if ($args.Count -gt 1) { $args[1] } else { 'https://www.crunchyroll.com/search?q={q}' }
if ($clientId.Length -lt 20) { Write-Host '  That does not look like a Simkl Client ID.' -ForegroundColor Red; Read-Host '  Press Enter to close'; exit 1 }

$pin = Invoke-RestMethod -Uri "https://api.simkl.com/oauth/pin?client_id=$clientId&redirect=urn:ietf:wg:oauth:2.0:oob"
Write-Host ''
Write-Host "  Your code:  $($pin.user_code)" -ForegroundColor Yellow
Write-Host '  Opening simkl.com/pin. Type the code there and allow Aang.'
$verify = if ($pin.verification_url) { $pin.verification_url } else { 'https://simkl.com/pin/' }
Start-Process $verify
$token = $null
$expires = if ($pin.expires_in) { [int]$pin.expires_in } else { 900 }
$wait = if ($pin.interval) { [int]$pin.interval } else { 5 }
$until = (Get-Date).AddSeconds($expires)
while ((Get-Date) -lt $until -and -not $token) {
    Start-Sleep -Seconds $wait
    $r = Invoke-RestMethod -Uri "https://api.simkl.com/oauth/pin/$($pin.user_code)?client_id=$clientId"
    if ($r.result -eq 'OK' -and $r.access_token) { $token = $r.access_token }
}
if (-not $token) { Write-Host '  The code was not used in time. Run this again.' -ForegroundColor Red; Read-Host '  Press Enter to close'; exit 1 }
@{ clientId = $clientId; accessToken = $token; site = $site } | ConvertTo-Json | Set-Content -Path $store -Encoding ascii
icacls $store /inheritance:r /grant:r "$($env:USERNAME):(R,W)" | Out-Null
Write-Host '  Saved, readable by your Windows account only. Say "put the next episode on" to Aang.' -ForegroundColor Green
Read-Host '  Press Enter to close'
