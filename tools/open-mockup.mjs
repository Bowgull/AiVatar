// Sheet 47 (his picks, 2026-10-21): open a mockup in Samara's MOCKUPS trail, instead of Firefox.
//
//   node tools/open-mockup.mjs docs/cockpit/sheet-47-mockups-trail.html "47 · Mockups trail"
//   node tools/open-mockup.mjs docs/cockpit/sheet-47-mockups-trail.html --dir \\localhost\c$\Users\Shadow\AppData\Roaming\Aang\open-urls
//
// It leaves a small .mockup file in Aang's open-urls folder; the Shell checks it, writes the version into the mockups
// history and opens (or updates) that sheet's tab. The sheet is shown as it is in the last commit, so commit it first.
// --dir: where open-urls is, for a session whose own %APPDATA% is not Aang's (a sandboxed shell sees a private copy).
import { mkdirSync, renameSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const args = process.argv.slice(2);
let dir = path.join(process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'), 'Aang', 'open-urls');
const rest = [];
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--dir') dir = args[++i] ?? '';
  else rest.push(args[i]);
}
const [sheet, title] = rest;
// The same rules the Shell checks (src/Shell/src/mockups.ts cleanPath): a plain repo path under the mockup folders.
const p = String(sheet ?? '').replace(/\\/g, '/');
const ok = p && p.length <= 400 && !p.startsWith('/') && !/^[a-z]:/i.test(p) && !p.split('/').some((s) => !s || s === '.' || s === '..')
  && /\.html?$/i.test(p) && ['docs/', 'src/Shell/pages/', 'assets/'].some((d) => p.startsWith(d));
if (!ok || !dir) {
  console.error('Usage: node tools/open-mockup.mjs docs/cockpit/sheet-NN-name.html ["NN · Title"] [--dir <open-urls folder>]');
  process.exit(2);
}
if (title !== undefined && title.length > 80) { console.error('The title can be at most 80 characters.'); process.exit(2); }
mkdirSync(dir, { recursive: true });
const name = `${Date.now()}-${process.pid}.mockup`;
// Written under another name first, then renamed: the Shell never reads half a file.
const tmp = path.join(dir, name + '.tmp');
writeFileSync(tmp, JSON.stringify(title ? { path: p, title } : { path: p }));
renameSync(tmp, path.join(dir, name));
console.log(`Opening ${p} in Samara's Mockups.`);
