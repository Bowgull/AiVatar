// Copies one release from Bowgull/AiVatar to Bowgull/samara-releases, where every Samara from 1.28.1 on looks (his
// pick, 2026-10-31: the code repo can go private, the sealed update files stay public). The release workflows do this
// themselves once the RELEASES_TOKEN secret exists; until then, or when that step failed, run it here with your gh.
// The files are copied as they are: the seal inside them is what a Samara checks, not where they came from.
// ship.mjs runs it with --wait after pushing (2026-11-01: no token in GitHub, so the shipping machine copies): it waits
// for GitHub's release run to finish, copies, then nudges both Samaras (the run leaves the nudge to it).
// Run: node tools/release/mirror.mjs samara-v1.28.1 [--wait]   (or engine-v44.9.3)
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tag = process.argv[2];
if (!/^(samara|engine)-v\d+\.\d+\.\d+$/.test(tag ?? '')) { console.error('usage: mirror.mjs samara-vX.Y.Z | engine-vX.Y.Z'); process.exit(2); }
const gh = (...a) => execFileSync('gh', a, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const FROM = 'Bowgull/AiVatar', TO = 'Bowgull/samara-releases';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
if (process.argv.includes('--wait')) {
  // GitHub's run tests on a Mac and on Windows first: about 15 minutes. A failed run never makes the release.
  const wf = tag.startsWith('samara-') ? 'samara-release.yml' : 'engine-release.yml', until = Date.now() + 60 * 60_000;
  for (;;) {
    try { gh('release', 'view', tag, '-R', FROM); break; } catch { /* not built yet */ }
    const runs = JSON.parse(gh('run', 'list', '-R', FROM, '--workflow', wf, '--branch', tag, '--json', 'status,conclusion,url', '-L', '1') || '[]');
    if (runs[0]?.status === 'completed' && runs[0].conclusion !== 'success') {
      try { gh('release', 'view', tag, '-R', FROM); break; } catch { /* really failed */ }
      console.error(`GitHub's run for ${tag} did not pass (${runs[0].conclusion}): ${runs[0].url}`); process.exit(1);
    }
    if (Date.now() > until) { console.error(`No ${tag} release after an hour. When it is there: node tools/release/mirror.mjs ${tag}`); process.exit(1); }
    await sleep(30_000);
  }
}
async function nudge() {
  for (let i = 0; i < 5; i++) {
    try { const r = await fetch('https://ntfy.sh/samara-bowgull-7c1e9a52', { method: 'POST', body: 'check', signal: AbortSignal.timeout(20_000) }); if (r.ok) { console.log('Nudged both Samaras.'); return; } } catch { /* try again */ }
    await sleep(30_000);
  }
  console.log('The nudge did not go; Samaras find it within the hour.');
}
try { gh('release', 'view', tag, '-R', TO); console.log(`${tag} is already in ${TO}`); process.exit(0); } catch { /* not there yet */ }
await copy();
await nudge();
async function copy() {
  const r = JSON.parse(gh('release', 'view', tag, '-R', FROM, '--json', 'name,body'));
  const dir = mkdtempSync(path.join(os.tmpdir(), 'mirror-'));
  try {
    gh('release', 'download', tag, '-R', FROM, '-D', dir);
    writeFileSync(path.join(dir, '.notes.md'), r.body ?? '');
    const files = readdirSync(dir).filter((f) => f !== '.notes.md').map((f) => path.join(dir, f));
    gh('release', 'create', tag, '-R', TO, ...files, '--title', r.name, '--notes-file', path.join(dir, '.notes.md'), tag.startsWith('samara-') ? '--latest' : '--latest=false');
    console.log(`Copied ${tag} to ${TO} (${files.length} files).`);
  } finally { rmSync(dir, { recursive: true, force: true }); }
}
