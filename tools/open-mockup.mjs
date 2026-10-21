// Sheet 47 (his picks, 2026-10-21): open a mockup in Samara's MOCKUPS trail, instead of Firefox.
//
//   node tools/open-mockup.mjs docs/cockpit/sheet-47-mockups-trail.html "47 · Mockups trail"
//   node tools/open-mockup.mjs docs/cockpit/sheet-47-mockups-trail.html "47 · Mockups trail" --branch "Claude link"
//   node tools/open-mockup.mjs docs/cockpit/sheet-47-mockups-trail.html --dir \\localhost\c$\Users\Shadow\AppData\Roaming\Aang\open-urls
//
// It leaves a small .mockup file in Aang's open-urls folder; the Shell checks it, writes the version into the mockups
// history and opens (or updates) that sheet's tab. The sheet is shown as it is in the last commit, so commit it first.
// --branch: the branch to file it in (matched by name, any case, or made). A child sheet stays with its parent.
// --dir: where open-urls is, for a session whose own %APPDATA% is not Aang's (a sandboxed shell sees a private copy).
import { mkdirSync, renameSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const args = process.argv.slice(2);
let dir = path.join(process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'), 'Aang', 'open-urls');
const rest = [];
let branchArg;
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--dir') dir = args[++i] ?? '';
  else if (args[i] === '--branch') branchArg = args[++i] ?? '';
  else rest.push(args[i]);
}
const [sheet, title] = rest;
// The same rules the Shell checks (src/Shell/src/mockups.ts cleanPath): a plain repo path under the mockup folders.
const p = String(sheet ?? '').replace(/\\/g, '/');
const ok = p && p.length <= 400 && !p.startsWith('/') && !/^[a-z]:/i.test(p) && !p.split('/').some((s) => !s || s === '.' || s === '..')
  && /\.html?$/i.test(p) && ['docs/', 'src/Shell/pages/', 'assets/'].some((d) => p.startsWith(d));
if (!ok || !dir) {
  console.error('Usage: node tools/open-mockup.mjs docs/cockpit/sheet-NN-name.html ["NN · Title"] [--branch "<name>"] [--dir <open-urls folder>]');
  process.exit(2);
}
if (title !== undefined && title.length > 80) { console.error('The title can be at most 80 characters.'); process.exit(2); }
// The same rules as the Shell's cleanBranch (src/Shell/src/mockups.ts): control characters out, whitespace collapsed, 1-40.
let branch;
if (branchArg !== undefined) {
  // eslint-disable-next-line no-control-regex
  branch = branchArg.length <= 1000 ? branchArg.replace(/[\x00-\x1f\x7f-\x9f]/g, '').replace(/\s+/g, ' ').trim() : '';
  if (!branch || branch.length > 40) { console.error('The branch must be 1 to 40 characters.'); process.exit(2); }
}
mkdirSync(dir, { recursive: true });
const name = `${Date.now()}-${process.pid}.mockup`;
// Written under another name first, then renamed: the Shell never reads half a file.
const tmp = path.join(dir, name + '.tmp');
writeFileSync(tmp, JSON.stringify({ path: p, ...(title ? { title } : {}), ...(branch ? { branch } : {}) }));
renameSync(tmp, path.join(dir, name));
console.log(`Opening ${p} in Samara's Mockups${branch ? ` (branch ${branch})` : ''}.`);
