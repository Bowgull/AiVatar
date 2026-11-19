// Write this machine's off-limits list (2026-11-19 scrub). The names of the people whose files Aang must never open
// are not in the repo, not even as fingerprints: each machine keeps offlimits.json in Aang's settings folder, with its
// own random salt. This tool reads a names file he keeps OUTSIDE the repo and writes that list. It prints counts only.
//
//   node --no-warnings src/Core/tools/offlimits-setup.ts <names.json> [--state <Aang settings folder>]
//
// names.json: { "folders": ["<her> Job Hunt"], "people": ["first last"], "handles": ["handle"] }
// Each run picks a fresh salt and replaces the whole list, so the names file must be complete.
// On the PC, run it from a real terminal, not from inside the Claude desktop app: the app's sandbox has its own
// %APPDATA%, and a list written there is one Aang never reads. Restart Aang afterwards.
import { readFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';

const args = process.argv.slice(2);
const at = args.indexOf('--state');
if (at >= 0) { process.env.AANG_STATE_DIR = args[at + 1]; args.splice(at, 2); }
const namesFile = args[0];
if (!namesFile) { console.error('usage: offlimits-setup.ts <names.json> [--state <dir>]'); process.exit(1); }

const { OFFLIMITS_FILE, offLimitsEntries } = await import('../src/files.ts');
const { writeFileAtomic } = await import('../src/atomic.ts');
const { mkdirSync } = await import('node:fs');
const path = await import('node:path');

const names = JSON.parse(readFileSync(namesFile, 'utf8')) as { folders?: string[]; people?: string[]; handles?: string[] };
const salt = randomBytes(16).toString('hex');
const list = { salt, ...offLimitsEntries(salt, names) };
mkdirSync(path.dirname(OFFLIMITS_FILE), { recursive: true });
writeFileAtomic(OFFLIMITS_FILE, JSON.stringify(list, null, 1));
console.log(`Wrote ${OFFLIMITS_FILE}: ${list.folders.length} folders, ${list.people.length} people, ${list.handles.length} handles. Restart Aang to use it.`);
