// Copies one release from Bowgull/AiVatar to Bowgull/samara-releases, where every Samara from 1.28.1 on looks (his
// pick, 2026-10-31: the code repo can go private, the sealed update files stay public). The release workflows do this
// themselves once the RELEASES_TOKEN secret exists; until then, or when that step failed, run it here with your gh.
// The files are copied as they are: the seal inside them is what a Samara checks, not where they came from.
// Run: node tools/release/mirror.mjs samara-v1.28.1   (or engine-v44.9.3)
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tag = process.argv[2];
if (!/^(samara|engine)-v\d+\.\d+\.\d+$/.test(tag ?? '')) { console.error('usage: mirror.mjs samara-vX.Y.Z | engine-vX.Y.Z'); process.exit(2); }
const gh = (...a) => execFileSync('gh', a, { encoding: 'utf8' }).trim();
const FROM = 'Bowgull/AiVatar', TO = 'Bowgull/samara-releases';
try { gh('release', 'view', tag, '-R', TO); console.log(`${tag} is already in ${TO}`); process.exit(0); } catch { /* not there yet */ }
const r = JSON.parse(gh('release', 'view', tag, '-R', FROM, '--json', 'name,body'));
const dir = mkdtempSync(path.join(os.tmpdir(), 'mirror-'));
try {
  gh('release', 'download', tag, '-R', FROM, '-D', dir);
  writeFileSync(path.join(dir, '.notes.md'), r.body ?? '');
  const files = readdirSync(dir).filter((f) => f !== '.notes.md').map((f) => path.join(dir, f));
  gh('release', 'create', tag, '-R', TO, ...files, '--title', r.name, '--notes-file', path.join(dir, '.notes.md'), tag.startsWith('samara-') ? '--latest' : '--latest=false');
  console.log(`Copied ${tag} to ${TO} (${files.length} files).`);
} finally { rmSync(dir, { recursive: true, force: true }); }
