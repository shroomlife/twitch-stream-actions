$ErrorActionPreference = 'Stop'
$bun = (Get-Command bun.exe -ErrorAction SilentlyContinue).Source
if (-not $bun) { $bun = Join-Path $env:USERPROFILE '.bun\bin\bun.exe' }
if (-not (Test-Path -LiteralPath $bun)) { throw 'Bun wurde nicht gefunden.' }
Write-Host 'shroomlive Stream Actions'
Write-Host 'Twitch Developer Console > Extensions > shroomlive Stream Actions > Settings > Secret Keys'
Write-Host 'Kopiere aus der aktiven Zeile das Feld Key. Leere Eingabe beendet das Fenster.'
$store = @'
const value = (await Bun.stdin.text()).trim().replace(/^(['\x22])(.*)\1$/, '$2').trim();
function retry(message) {
    console.error(message);
    process.exit(2);
}
if (value === 'rzayw76j3drs9vzexj712achlc6bfi') retry('Das ist die Client-ID. Oeffne Secret Keys und kopiere dort das Feld Key.');
if (/^[*\u2022\u25cf]+$/.test(value)) retry('Du hast die verdeckte Anzeige kopiert. Verwende die Kopierfunktion am Feld Key.');
const bytes = Buffer.from(value, 'base64');
const encoded = bytes.toString('base64');
if (bytes.length < 16 || (value !== encoded && value !== encoded.replace(/=+$/, ''))) {
    retry('Das Format passt nicht. Kopiere den gesamten Wert aus dem Feld Key, einschliesslich etwaiger Gleichheitszeichen am Ende.');
}
try {
    await Bun.secrets.set({service: 'stream-control', name: 'twitch-extension-secret', value: encoded});
} catch {
    console.error('Windows konnte den Schluessel nicht in der Anmeldeinformationsverwaltung speichern.');
    process.exit(1);
}
console.log('Extension Secret in der Windows-Anmeldeinformationsverwaltung gespeichert.');
'@
do {
    $secret = Read-Host 'Twitch Extension Secret (verdeckte Eingabe)' -AsSecureString
    try {
        if ($secret.Length -eq 0) { exit 1 }
        $credential = [pscredential]::new('stream-control', $secret)
        $credential.GetNetworkCredential().Password | & $bun -e $store
        $result = $LASTEXITCODE
    } finally {
        $secret.Dispose()
    }
} while ($result -eq 2)
exit $result
