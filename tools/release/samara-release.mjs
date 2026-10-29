// Samara's shared updater, step 2 (his plan, 2026-10-23): one release on GitHub that every machine checks by itself.
// Packs exactly what the PC sends the Mac today (macBrowserBundle: the Shell's src, pages and drm, the aang-link mod's
// manifest and hooks, the Mac app's package files), and writes a manifest stamped with his release key (Ed25519). A
// Samara installs a release only when the stamp checks out against the public half it already carries.
// Run: SAMARA_RELEASE_KEY=<pem> node tools/release/samara-release.mjs <version> <out dir> [notes file]
import { execFileSync } from 'node:child_process';
import { createHash, createPrivateKey, sign } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { checkNewest, read } from './version.mjs';

const [version, out, notesFile] = process.argv.slice(2);
if (!/^\d+\.\d+\.\d+$/.test(version ?? '') || !out) { console.error('usage: samara-release.mjs <x.y.z> <out dir> [notes file]'); process.exit(2); }
// His version rule (version.mjs): only the newest version in releases.json can be released, and only if its number and
// its name are what the lines it adds make them.
const rec = read('src/Shell/releases.json'), items = read('src/Shell/whats-new.json').items;
const v = rec.versions.at(-1), before = rec.versions.at(-2);
if (v?.semver !== version) { console.error(`releases.json's newest version is ${v?.semver}, not ${version}: ship with tools/release/ship.mjs`); process.exit(2); }
const why = checkNewest(rec.versions, items);
if (why) { console.error(why); process.exit(2); }
const lines = items.filter((i) => Date.parse(i.at) > (before ? Date.parse(before.at) : -Infinity) && Date.parse(i.at) <= Date.parse(v.at));
const pem = process.env.SAMARA_RELEASE_KEY;
if (!pem) { console.error('SAMARA_RELEASE_KEY is not set: a release is never published unstamped'); process.exit(2); }
const repo = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', '..');
const shell = path.join(repo, 'src', 'Shell');
mkdirSync(out, { recursive: true });

// Same files and order as macBrowserBundle, plus the Shell's assets (the PC's window icon; 2026-10-29, the PC installs
// releases too). On GitHub (GNU tar) owner and times are fixed too, so the same code always
// makes the same package; a Mac's own tar (for a trial run here) has no such switches.
const bundle = path.join(out, 'samara-bundle.tgz');
const gnu = /GNU tar/.test(execFileSync('tar', ['--version'], { encoding: 'utf8' }));
execFileSync('tar', [...(gnu ? ['--sort=name', '--owner=0', '--group=0', '--numeric-owner', '--mtime=@0'] : []), '-czf', bundle,
  '-C', shell, 'src', 'pages', 'drm', 'assets', '-C', repo, 'claude-link/.claude-plugin', 'claude-link/hooks',
  '-C', path.join(shell, 'mac-pkg'), 'package.json', 'package-lock.json'], { stdio: 'inherit', env: { ...process.env, GZIP: '-n' } });
const bytes = readFileSync(bundle);

const commit = execFileSync('git', ['-C', repo, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
void notesFile;   // what it brings comes from whats-new.json now, the same lines the rule counted
const notes = lines.map((l) => String(l.text)).slice(0, 30);
const manifest = {
  v: 1, app: 'samara', version, name: v.name, commit, at: new Date().toISOString(), notes,
  items: lines.slice(0, 30).map((l) => ({ text: String(l.text), kind: l.kind === 'major' || l.kind === 'feature' ? l.kind : 'fix' })),
  bundle: { file: 'samara-bundle.tgz', sha256: createHash('sha256').update(bytes).digest('hex'), bytes: bytes.length },
};
const text = JSON.stringify(manifest, null, 1);
writeFileSync(path.join(out, 'manifest.json'), text);
writeFileSync(path.join(out, 'manifest.sig'), sign(null, Buffer.from(text), createPrivateKey(pem)).toString('base64'));
console.log(`samara ${version} ${v.name} (${commit.slice(0, 7)}): bundle ${(bytes.length / 1e6).toFixed(1)} MB, stamped`);
