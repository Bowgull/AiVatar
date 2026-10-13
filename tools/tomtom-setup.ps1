# Give Aang your TomTom key, for drive times with traffic (E7, his pick 2026-10-13). Double-click tomtom-setup.cmd.
#
# 1. You paste the key from developer.tomtom.com (your free account, no card). It is not shown while you paste.
# 2. It is checked once against TomTom (a single address lookup), then saved in %APPDATA%\Aang\tomtom.json, readable by
#    this Windows user only. It is never shown again and never sent anywhere but TomTom.
$ErrorActionPreference = 'Stop'
$dir = Join-Path $env:APPDATA 'Aang'
$store = Join-Path $dir 'tomtom.json'
New-Item -ItemType Directory -Force $dir | Out-Null

Write-Host ''
Write-Host '  Aang: TomTom key for drive times' -ForegroundColor Yellow
Write-Host '  --------------------------------'
Write-Host '  At developer.tomtom.com > Dashboard > Keys, copy your key, then paste it here and press Enter.'
$secure = Read-Host '  Key' -AsSecureString
$key = [Runtime.InteropServices.Marshal]::PtrToStringBSTR([Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)).Trim()
if ($key.Length -lt 20 -or $key -notmatch '^[A-Za-z0-9]+$') {
    Write-Host '  That does not look like a TomTom key (letters and numbers, 32 long). Nothing was saved.' -ForegroundColor Red
    Read-Host '  Press Enter to close'; exit 1
}
try {
    $r = Invoke-RestMethod -Uri ("https://api.tomtom.com/search/2/geocode/" + [Uri]::EscapeDataString('Toronto City Hall') + ".json?key=$key&limit=1&countrySet=CA")
    if (-not $r.results) { throw 'no answer' }
} catch {
    Write-Host '  TomTom did not accept that key. Check it on the TomTom dashboard. Nothing was saved.' -ForegroundColor Red
    Read-Host '  Press Enter to close'; exit 1
}
@{ key = $key; savedAt = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds() } | ConvertTo-Json | Set-Content -Path $store -Encoding ascii
icacls $store /inheritance:r /grant:r "$($env:USERNAME):(R,W)" | Out-Null
Write-Host '  Saved, readable by your Windows account only. TomTom answered, so the key works.' -ForegroundColor Green
Write-Host '  Tell Claude "tomtom done".'
Read-Host '  Press Enter to close'
