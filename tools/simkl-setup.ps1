# Connect Aang to Simkl, so "put the next episode on" works. Double-click simkl-setup.cmd to run it.
#
# Before this, once: sign in at simkl.com, then at simkl.com/settings/developer/new/ create an app (any name, e.g.
# Aang; for the redirect URL use urn:ietf:wg:oauth:2.0:oob). Copy its Client ID.
# Optional second argument: where episodes are opened, as a link with {q} for the search, for example
#   https://www.crunchyroll.com/search?q={q}      (the default)
#
# 1. Asks for the Client ID.
# 2. Shows a code and opens simkl.com/pin with it filled in. Allow Aang there.
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

# Simkl's OAuth 2.0 device sign-in (apps made in its AUTH V2 wizard; the old /oauth/pin is refused for them).
$dev = Invoke-RestMethod -Method Post -Uri 'https://api.simkl.com/oauth2/device' -Body @{ client_id = $clientId }
Write-Host ''
Write-Host "  Your code:  $($dev.user_code)" -ForegroundColor Yellow
Write-Host '  Opening simkl.com/pin with the code filled in. Allow Aang there.'
$verify = if ($dev.verification_uri_complete) { $dev.verification_uri_complete } else { 'https://simkl.com/pin/' }
Start-Process $verify
$token = $null
$expires = if ($dev.expires_in) { [int]$dev.expires_in } else { 900 }
$wait = if ($dev.interval) { [int]$dev.interval } else { 5 }
$until = (Get-Date).AddSeconds($expires)
while ((Get-Date) -lt $until -and -not $token) {
    Start-Sleep -Seconds $wait
    try {
        $r = Invoke-RestMethod -Method Post -Uri 'https://api.simkl.com/oauth2/token' -Body @{
            grant_type = 'urn:ietf:params:oauth:grant-type:device_code'; device_code = $dev.device_code; client_id = $clientId }
        if ($r.access_token) { $token = $r.access_token }
    } catch { <# authorization_pending until he allows it #> }
}
if (-not $token) { Write-Host '  The code was not used in time. Run this again.' -ForegroundColor Red; Read-Host '  Press Enter to close'; exit 1 }
@{ clientId = $clientId; accessToken = $token; site = $site } | ConvertTo-Json | Set-Content -Path $store -Encoding ascii
icacls $store /inheritance:r /grant:r "$($env:USERNAME):(R,W)" | Out-Null
Write-Host '  Saved, readable by your Windows account only. Say "put the next episode on" to Aang.' -ForegroundColor Green
Read-Host '  Press Enter to close'
