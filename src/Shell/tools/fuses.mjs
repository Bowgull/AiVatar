// The fuses: settings burned into Aang's packaged app that cannot be changed afterwards.
//
//   node tools/fuses.mjs <path to the built Aang.exe>
//
// Run as the last step of packaging, and checked by tools/check-fuses.mjs.
//
// WHY THIS EXISTS BEFORE THERE IS ANYTHING TO PACKAGE (step 6.2): EnableCookieEncryption cannot be
// turned on later. Electron stores cookies unencrypted by default; switching encryption on afterwards
// makes every cookie already saved unreadable, so he would be signed out of Netflix, Prime,
// Crunchyroll, LinkedIn, everything, with no way back. It has to be on before his FIRST sign-in.
// The rest can be changed later, but there is no reason to wait.
import { FuseV1Options, FuseVersion, flipFuses } from '@electron/fuses';
import { existsSync } from 'node:fs';

const target = process.argv[2];
if (!target || !existsSync(target)) {
  console.error('usage: node tools/fuses.mjs <path to the built Aang.exe>');
  process.exit(1);
}

/**
 * What each one does, in order of how much it matters here.
 *
 * Several of these exist because an Electron app's own files are editable by anything running as him.
 * They do not stop someone who already has his machine; they stop his own app being turned into a way
 * to run code as him later, which is the shape of CVE-2025-53773 (Copilot) and the Cursor flaws.
 */
const FUSES = {
  // Cookies on disk are encrypted. MUST be set before the first sign-in; cannot be added later.
  [FuseV1Options.EnableCookieEncryption]: true,
  // Without this, Aang.exe doubles as a general Node interpreter: anything could run its own script as
  // a signed, trusted-looking Aang process.
  [FuseV1Options.RunAsNode]: false,
  // Same door by other names: environment variables and a command-line switch that inject code.
  [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
  [FuseV1Options.EnableNodeCliInspectArguments]: false,
  // The app refuses to start if its own bundle has been edited.
  [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
  [FuseV1Options.OnlyLoadAppFromAsar]: true,
};

const names = Object.fromEntries(Object.entries(FuseV1Options).map(([k, v]) => [v, k]));

await flipFuses(target, { version: FuseVersion.V1, resetAdHocDarwinSignature: false, ...FUSES });
for (const [fuse, on] of Object.entries(FUSES)) console.log(`  ${on ? 'on ' : 'off'}  ${names[fuse] ?? fuse}`);
console.log(`fuses set on ${target}`);
