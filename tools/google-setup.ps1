# Connect Aang to your Google account (Gmail read + drafts, Calendar read). Double-click google-setup.cmd to run it.
#
# 1. Finds the client_secret_*.json you downloaded from Google Cloud (Downloads folder), stores it with the sign-in
#    tokens in %APPDATA%\Aang\google.json, readable by this Windows user only, then deletes the downloaded copy.
# 2. Opens the Google sign-in in your browser (PKCE, loopback redirect). You approve once.
# 3. Aang can read mail and calendar and write DRAFTS. He cannot send: the code has no send path without your tap.
$ErrorActionPreference = 'Stop'
$dir = Join-Path $env:APPDATA 'Aang'
$store = Join-Path $dir 'google.json'
New-Item -ItemType Directory -Force $dir | Out-Null

Write-Host ''
Write-Host '  Aang: connect to Google' -ForegroundColor Yellow
Write-Host '  -----------------------'

# Reuse the client already saved, if there is one.
#
# This used to demand a freshly downloaded client_secret*.json every time, which is right the FIRST
# time and pointless afterwards: the id and secret are already in google.json and do not change. Signing
# in again is needed whenever the refresh token dies - which, while the app sat in Testing, was every
# seven days - and making him go and re-download a file he already has is friction for nothing.
$c = $null
$existing = if (Test-Path $store) { Get-Content $store -Raw | ConvertFrom-Json } else { $null }
if ($existing -and $existing.clientId -and $existing.clientSecret) {
    $c = [pscustomobject]@{ client_id = $existing.clientId; client_secret = $existing.clientSecret }
    Write-Host '  Using the Google client already saved. Signing you in again.' -ForegroundColor DarkGray
} else {
    $json = Get-ChildItem (Join-Path $env:USERPROFILE 'Downloads') -Filter 'client_secret*.json' -ErrorAction SilentlyContinue |
        Sort-Object LastWriteTime -Descending | Select-Object -First 1
    if (-not $json) {
        Write-Host '  No client_secret*.json in your Downloads folder.' -ForegroundColor Red
        Write-Host '  In Google Cloud > Auth Platform > Clients > Aang, download the JSON, then run this again.'
        Read-Host '  Press Enter to close'; exit 1
    }
    $c = (Get-Content $json.FullName -Raw | ConvertFrom-Json).installed
    if (-not $c.client_id -or -not $c.client_secret) {
        Write-Host '  That file is not a Desktop-app client (no "installed" section). Nothing was saved.' -ForegroundColor Red
        Read-Host '  Press Enter to close'; exit 1
    }
}

function B64Url([byte[]]$b) { [Convert]::ToBase64String($b).TrimEnd('=').Replace('+', '-').Replace('/', '_') }
$rng = [Security.Cryptography.RandomNumberGenerator]::Create()
function Rand([int]$n) { $b = New-Object byte[] $n; $rng.GetBytes($b); B64Url $b }
$verifier = Rand 48
$challenge = B64Url ([Security.Cryptography.SHA256]::Create().ComputeHash([Text.Encoding]::ASCII.GetBytes($verifier)))
$state = Rand 16

$tcp = New-Object Net.Sockets.TcpListener([Net.IPAddress]::Loopback, 0); $tcp.Start()
$port = $tcp.LocalEndpoint.Port; $tcp.Stop()
$redirect = "http://127.0.0.1:$port/"
$scopes = 'https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/gmail.compose https://www.googleapis.com/auth/calendar.readonly'
$q = @{
    client_id = $c.client_id; redirect_uri = $redirect; response_type = 'code'; scope = $scopes
    code_challenge = $challenge; code_challenge_method = 'S256'; state = $state
    access_type = 'offline'; prompt = 'consent'
}
$url = 'https://accounts.google.com/o/oauth2/v2/auth?' + (($q.GetEnumerator() | ForEach-Object { "$($_.Key)=$([Uri]::EscapeDataString($_.Value))" }) -join '&')

$http = New-Object Net.HttpListener; $http.Prefixes.Add($redirect); $http.Start()
Write-Host '  Opening Google sign-in. Pick bocas.joshua@gmail.com.'
Write-Host '  Google will say the app is not verified: click Advanced, then "Go to Aang (unsafe)". It is your own app.'
Start-Process $url
$ctx = $null
$task = $http.GetContextAsync()
if (-not $task.Wait(300000)) { Write-Host '  Timed out waiting for the sign-in.' -ForegroundColor Red; $http.Stop(); Read-Host '  Press Enter to close'; exit 1 }
$ctx = $task.Result
$code = $ctx.Request.QueryString['code']; $got = $ctx.Request.QueryString['state']; $err = $ctx.Request.QueryString['error']
$msg = if ($code -and $got -eq $state) { 'Aang is connected to Google. You can close this tab.' } else { 'Sign-in did not complete. You can close this tab.' }
$bytes = [Text.Encoding]::UTF8.GetBytes("<html><body style='font-family:sans-serif;background:#1b1b1b;color:#e8c766;padding:3em'>$msg</body></html>")
$ctx.Response.ContentType = 'text/html'; $ctx.Response.OutputStream.Write($bytes, 0, $bytes.Length); $ctx.Response.Close(); $http.Stop()
if (-not $code -or $got -ne $state) { Write-Host "  Sign-in failed ($err). Nothing was saved." -ForegroundColor Red; Read-Host '  Press Enter to close'; exit 1 }

$tok = Invoke-RestMethod -Method Post -Uri 'https://oauth2.googleapis.com/token' -Body @{
    client_id = $c.client_id; client_secret = $c.client_secret; code = $code
    code_verifier = $verifier; grant_type = 'authorization_code'; redirect_uri = $redirect
}
if (-not $tok.refresh_token) { Write-Host '  Google gave no refresh token. Remove Aang at myaccount.google.com/permissions and run this again.' -ForegroundColor Red; Read-Host '  Press Enter to close'; exit 1 }

@{
    clientId = $c.client_id; clientSecret = $c.client_secret; refreshToken = $tok.refresh_token
    accessToken = $tok.access_token; expiresAt = [DateTimeOffset]::UtcNow.AddSeconds([int]$tok.expires_in - 60).ToUnixTimeMilliseconds()
    scope = $tok.scope; account = 'bocas.joshua@gmail.com'
    # When this sign-in happened, so that if Google cuts it off again Aang can say whether it lasted
    # exactly seven days - which means the project is still in Testing - or something else went wrong.
    # Without this the answer takes an afternoon of detective work, which it did on 2026-10-02.
    signedInAt = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
} | ConvertTo-Json | Set-Content -Path $store -Encoding ascii
icacls $store /inheritance:r /grant:r "$($env:USERNAME):(R,W)" | Out-Null
# Only when there WAS a downloaded file. Reusing the saved client leaves $json null, and deleting a
# null path throws right at the end, after everything has already succeeded.
if ($json) { Remove-Item $json.FullName -Force }
Write-Host '  Saved, readable by your Windows account only. The downloaded JSON was deleted.' -ForegroundColor Green
Write-Host '  Tell Claude "google done" and Aang will pick it up.'
Read-Host '  Press Enter to close'
