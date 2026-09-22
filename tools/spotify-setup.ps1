# Connect Aang to Spotify, so "play lo-fi girl" works. Double-click spotify-setup.cmd to run it.
#
# Before this, once: at developer.spotify.com/dashboard, Create app (any name, e.g. Aang), Redirect URI
#   http://127.0.0.1:47835/callback
# and tick "Web API". Copy the app's Client ID. (No client secret is needed or stored: this uses PKCE.)
#
# 1. Asks for that Client ID.
# 2. Opens the Spotify sign-in in your browser. You approve once.
# 3. Saves the sign-in to %APPDATA%\Aang\spotify.json, readable by this Windows user only.
$ErrorActionPreference = 'Stop'
$dir = Join-Path $env:APPDATA 'Aang'
$store = Join-Path $dir 'spotify.json'
New-Item -ItemType Directory -Force $dir | Out-Null

Write-Host ''
Write-Host '  Aang: connect to Spotify' -ForegroundColor Yellow
Write-Host '  ------------------------'
$clientId = if ($args.Count -gt 0) { $args[0] } else { (Read-Host '  Client ID from your Spotify developer app') }
$clientId = "$clientId".Trim()
if ($clientId -notmatch '^[0-9a-f]{32}$') { Write-Host '  That does not look like a Spotify Client ID (32 letters and digits).' -ForegroundColor Red; Read-Host '  Press Enter to close'; exit 1 }

function B64Url([byte[]]$b) { [Convert]::ToBase64String($b).TrimEnd('=').Replace('+', '-').Replace('/', '_') }
$rng = [Security.Cryptography.RandomNumberGenerator]::Create()
function Rand([int]$n) { $b = New-Object byte[] $n; $rng.GetBytes($b); B64Url $b }
$verifier = Rand 48
$challenge = B64Url ([Security.Cryptography.SHA256]::Create().ComputeHash([Text.Encoding]::ASCII.GetBytes($verifier)))
$state = Rand 16
$redirect = 'http://127.0.0.1:47835/callback'
$q = @{ client_id = $clientId; response_type = 'code'; redirect_uri = $redirect; code_challenge_method = 'S256'; code_challenge = $challenge; state = $state
        scope = 'user-modify-playback-state user-read-playback-state' }
$url = 'https://accounts.spotify.com/authorize?' + (($q.GetEnumerator() | ForEach-Object { "$($_.Key)=$([Uri]::EscapeDataString($_.Value))" }) -join '&')

$http = New-Object Net.HttpListener; $http.Prefixes.Add('http://127.0.0.1:47835/'); $http.Start()
Write-Host '  Opening the Spotify sign-in. Approve Aang.'
Start-Process $url
$task = $http.GetContextAsync()
if (-not $task.Wait(300000)) { Write-Host '  Timed out waiting for the sign-in.' -ForegroundColor Red; $http.Stop(); Read-Host '  Press Enter to close'; exit 1 }
$ctx = $task.Result
$code = $ctx.Request.QueryString['code']; $got = $ctx.Request.QueryString['state']; $err = $ctx.Request.QueryString['error']
$msg = if ($code -and $got -eq $state) { 'Aang is connected to Spotify. You can close this tab.' } else { 'Sign-in did not complete. You can close this tab.' }
$bytes = [Text.Encoding]::UTF8.GetBytes("<html><body style='font-family:sans-serif;background:#1b1b1b;color:#e8c766;padding:3em'>$msg</body></html>")
$ctx.Response.ContentType = 'text/html'; $ctx.Response.OutputStream.Write($bytes, 0, $bytes.Length); $ctx.Response.Close(); $http.Stop()
if (-not $code -or $got -ne $state) { Write-Host "  Sign-in failed ($err). Nothing was saved." -ForegroundColor Red; Read-Host '  Press Enter to close'; exit 1 }

$tok = Invoke-RestMethod -Method Post -Uri 'https://accounts.spotify.com/api/token' -Body @{
    grant_type = 'authorization_code'; code = $code; redirect_uri = $redirect; client_id = $clientId; code_verifier = $verifier }
@{ clientId = $clientId; refreshToken = $tok.refresh_token; accessToken = $tok.access_token
   expiresAt = [DateTimeOffset]::UtcNow.AddSeconds([int]$tok.expires_in - 60).ToUnixTimeMilliseconds() } | ConvertTo-Json | Set-Content -Path $store -Encoding ascii
icacls $store /inheritance:r /grant:r "$($env:USERNAME):(R,W)" | Out-Null
Write-Host '  Saved, readable by your Windows account only. Say "play something" to Aang.' -ForegroundColor Green
Read-Host '  Press Enter to close'
