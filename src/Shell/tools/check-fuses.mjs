// Reads the fuses back off a built app and says whether they are what they should be.
//
//   node tools/check-fuses.mjs <path to the built Aang.exe>
//
// Step 6.2 is only done when the fuses are CONFIRMED set on the built app, not when the script that
// sets them exists. Setting and checking are separate on purpose: a packaging step that silently did
// nothing would look exactly like one that worked.
import { FuseV1Options, FuseVersion, getCurrentFuseWire } from '@electron/fuses';
import { existsSync } from 'node:fs';

const target = process.argv[2];
if (!target || !existsSync(target)) {
  console.error('usage: node tools/check-fuses.mjs <path to the built Aang.exe>');
  process.exit(1);
}

const WANT = {
  [FuseV1Options.EnableCookieEncryption]: true,
  [FuseV1Options.RunAsNode]: false,
  [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
  [FuseV1Options.EnableNodeCliInspectArguments]: false,
  [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
  [FuseV1Options.OnlyLoadAppFromAsar]: true,
};

const names = Object.fromEntries(Object.entries(FuseV1Options).map(([k, v]) => [v, k]));
const wire = await getCurrentFuseWire(target);

let bad = 0;
// The wire comes back as an object keyed by fuse number whose values are CHARACTER CODES, not
// characters: 49 is '1' and 48 is '0'. Comparing against the string '1' silently reports every fuse as
// off, which is what this checker did on its first run while the fuses were in fact set correctly.
const isOn = v => v === 49 || v === '1';

for (const [fuse, want] of Object.entries(WANT)) {
  const got = isOn(wire[Number(fuse)]);
  const ok = got === want;
  if (!ok) bad++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${names[fuse] ?? fuse}  want ${want ? 'on' : 'off'}, got ${got ? 'on' : 'off'}`);
}

if (bad) {
  console.error(`\n${bad} fuse${bad === 1 ? '' : 's'} wrong. Run tools/fuses.mjs on the built app.`);
  process.exit(1);
}
console.log(`\nall ${Object.keys(WANT).length} fuses are as they should be, version ${FuseVersion.V1}`);
