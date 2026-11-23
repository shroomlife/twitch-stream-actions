// Reads the extension secret from stdin (piped by store-extension-secret.ps1), stores only the derived desktop key.
import { credentialService, deriveDesktopKey, desktopKeyName, legacySecretName, parseExtensionSecret } from './desktop-credential'

const value = (await Bun.stdin.text()).trim()
function retry(message: string): never {
  console.error(message)
  process.exit(2)
}
if (value.replace(/^(['"])(.*)\1$/, '$2') === 'rzayw76j3drs9vzexj712achlc6bfi') retry('Das ist die Client-ID. Öffne Secret Keys und kopiere dort das Feld Key.')
if (/^[*•●]+$/.test(value)) retry('Du hast die verdeckte Anzeige kopiert. Verwende die Kopierfunktion am Feld Key.')
const secret = parseExtensionSecret(value)
if (!secret) retry('Das Format passt nicht. Kopiere den gesamten Wert aus dem Feld Key, einschließlich etwaiger Gleichheitszeichen am Ende.')
try {
  await Bun.secrets.set({ service: credentialService, name: desktopKeyName, value: deriveDesktopKey(secret) })
  await Bun.secrets.delete({ service: credentialService, name: legacySecretName })
} catch {
  console.error('Windows konnte den Schlüssel nicht in der Anmeldeinformationsverwaltung speichern.')
  process.exit(1)
}
console.log('Desktop-Schlüssel gespeichert. Das Extension Secret selbst bleibt nicht auf diesem PC.')
