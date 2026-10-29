// Claude ships a Samara version (his picks, 2026-10-29: when a piece of work is finished and tested, from main).
// The number and name come from his rule (version.mjs), never by hand: the new lines in whats-new.json decide. This
// writes the version into releases.json, commits it, and tags it samara-vX.Y.Z with what it brings; pushing main and
// the tag starts GitHub's release (tests on a Mac and on Windows first).
// Run: node tools/release/ship.mjs [--dry]
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { REPO, checkNewest, linesSince, next, read } from './version.mjs';

const dry = process.argv.includes('--dry');
const git = (...a) => execFileSync('git', ['-C', REPO, ...a], { encoding: 'utf8' }).trim();
if (git('rev-parse', '--abbrev-ref', 'HEAD') !== 'main') { console.error('Ship from main.'); process.exit(2); }
if (git('status', '--porcelain', '--untracked-files=no')) { console.error('Commit the work first: nothing half-done ships.'); process.exit(2); }
const rec = read('src/Shell/releases.json'), items = read('src/Shell/whats-new.json').items;
const last = rec.versions.at(-1), lines = linesSince(items, last?.at);
const ahead = items.filter((i) => Date.parse(i.at) > Date.now() + 60_000);
if (ahead.length) { console.error('A line in whats-new.json is dated in the future (check its time zone): ' + ahead[0].text); process.exit(2); }
if (!lines.length) { console.error('Nothing new in whats-new.json since ' + last.semver + ': write what this version brings first.'); process.exit(2); }
const v = { ...next(last, lines), at: new Date(Math.max(Date.now(), ...lines.map((l) => Date.parse(l.at)) ) ).toISOString() };
const tag = `samara-v${v.semver}`;
console.log(`Version ${v.semver}: ${v.name}`);
for (const l of lines) console.log(`  ${l.kind === 'major' ? 'Big change' : l.kind === 'feature' ? 'New' : 'Fix'}: ${l.text}`);
rec.versions.push(v);
const why = checkNewest(rec.versions, items);
if (why) { console.error(why); process.exit(1); }
if (dry) process.exit(0);
writeFileSync(path.join(REPO, 'src/Shell/releases.json'), JSON.stringify(rec, null, 1) + '\n');
git('add', 'src/Shell/releases.json');
git('commit', '-q', '-m', `Samara ${v.semver}: ${v.name}\n\n${lines.map((l) => '- ' + l.text).join('\n')}`);
git('tag', '-a', tag, '-m', lines.map((l) => l.text).join('\n'));
console.log(`Tagged ${tag}. Push: git push origin main ${tag}`);
