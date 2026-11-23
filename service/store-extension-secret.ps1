$ErrorActionPreference = 'Stop'
$bun = (Get-Command bun.exe -ErrorAction SilentlyContinue).Source
if (-not $bun) { $bun = Join-Path $env:USERPROFILE '.bun\bin\bun.exe' }
if (-not (Test-Path -LiteralPath $bun)) { throw 'Bun wurde nicht gefunden.' }
$store = Join-Path $PSScriptRoot 'store-desktop-key.ts'
Write-Host 'shroomlive Stream Actions'
Write-Host 'Twitch Developer Console > Extensions > shroomlive Stream Actions > Settings > Secret Keys'
Write-Host 'Kopiere aus der aktiven Zeile das Feld Key. Gespeichert wird nur der daraus abgeleitete Desktop-Schlüssel. Leere Eingabe beendet das Fenster.'
do {
    $secret = Read-Host 'Twitch Extension Secret (verdeckte Eingabe)' -AsSecureString
    try {
        if ($secret.Length -eq 0) { exit 1 }
        $credential = [pscredential]::new('stream-control', $secret)
        $credential.GetNetworkCredential().Password | & $bun $store
        $result = $LASTEXITCODE
    } finally {
        $secret.Dispose()
    }
} while ($result -eq 2)
exit $result
