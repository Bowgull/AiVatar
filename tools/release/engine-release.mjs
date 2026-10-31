// Engines as sealed GitHub releases (his plan, 2026-10-30), run every day by .github/workflows/engine-release.yml.
// Finds castLabs' newest stable engine (+wvcus: Widevine, signable for video). When it is not released here yet, it
// downloads the Mac (Intel and Apple) and Windows engines, checks each against the SHA-256 castLabs' own release
// lists, and writes a manifest sealed with his release key. Publishing is the workflow's step, only when this says so.
// It never touches the engine itself: castLabs signs only an engine exactly as they shipped it (proved 2026-10-23).
// Run: SAMARA_RELEASE_KEY=<pem> node tools/release/engine-release.mjs <out dir>
// Prints "engine=<version>" for the workflow when there is a new one, "engine=" when not.
import { createHash, createPrivateKey, sign } from 'node:crypto';
import { createWriteStream, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

const out = process.argv[2];
if (!out) { console.error('usage: engine-release.mjs <out dir>'); process.exit(2); }
const gh = (url) => fetch(url, { headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'Samara engine release', ...(process.env.GH_TOKEN ? { Authorization: `Bearer ${process.env.GH_TOKEN}` } : {}) } });
const num = (v) => v.split('.').map(Number);
const newer = (a, b) => { const x = num(a), y = num(b); for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] > y[i]; return false; };
const say = (k, v) => { console.log(`${k}=${v}`); if (process.env.GITHUB_OUTPUT) writeFileSync(process.env.GITHUB_OUTPUT, `${k}=${v}\n`, { flag: 'a' }); };

// castLabs' newest stable engine, by number (they keep several majors going; the highest is the newest Chromium).
const list = await (await gh('https://api.github.com/repos/castlabs/electron-releases/releases?per_page=40')).json();
let best = null;
for (const r of list) {
  const m = /^v(\d+\.\d+\.\d+)\+wvcus$/.exec(r.tag_name ?? '');
  if (!m || r.prerelease || r.draft) continue;
  if (!best || newer(m[1], best.version)) best = { version: m[1], r };
}
if (!best) { console.error('castLabs has no stable engine listed'); process.exit(1); }
const v = best.version;

// Already in samara-releases (what Samaras read): nothing to do (the big download only happens when the engine changes).
const mine = await gh(`https://api.github.com/repos/Bowgull/samara-releases/releases/tags/engine-v${v}`);
if (mine.ok) { console.log(`engine ${v} is already released`); say('engine', ''); process.exit(0); }

// The Chromium inside it, from Electron's own list (castLabs builds on Electron's releases).
const el = await (await fetch('https://releases.electronjs.org/releases.json')).json();
const chrome = el.find((x) => x.version === v)?.chrome;
if (!/^\d+\.\d+\.\d+\.\d+$/.test(chrome ?? '')) { console.error(`Electron's list has no Chromium for ${v}`); process.exit(1); }

mkdirSync(out, { recursive: true });
const assets = [];
for (const platform of ['darwin-x64', 'darwin-arm64', 'win32-x64']) {
  const name = `electron-v${v}+wvcus-${platform}.zip`;
  const a = best.r.assets.find((x) => x.name === name);
  const want = /^sha256:([0-9a-f]{64})$/.exec(a?.digest ?? '')?.[1];
  if (!a || !want) { console.error(`castLabs ${v} has no ${platform} engine with a published fingerprint`); process.exit(1); }
  const file = `castlabs-${v}-${platform}.zip`, dest = path.join(out, file);
  const got = await fetch(a.browser_download_url);
  if (!got.ok || !got.body) { console.error(`downloading ${name} failed (${got.status})`); process.exit(1); }
  const hash = createHash('sha256');
  let bytes = 0;
  await pipeline(Readable.fromWeb(got.body), async function* (src) { for await (const c of src) { hash.update(c); bytes += c.length; yield c; } }, createWriteStream(dest));
  const sha = hash.digest('hex');
  if (sha !== want) { console.error(`${name} did not match castLabs' fingerprint; not released`); process.exit(1); }
  assets.push({ platform, file, sha256: sha, bytes });
  console.log(`${file}: ${(bytes / 1e6).toFixed(0)} MB, matches castLabs`);
}

const pem = process.env.SAMARA_RELEASE_KEY;
if (!pem) { console.error('SAMARA_RELEASE_KEY is not set: an engine is never published unsealed'); process.exit(2); }
const manifest = { v: 1, app: 'engine', version: v, castlabs: `v${v}+wvcus`, chrome, published: best.r.published_at ?? '', at: new Date().toISOString(), assets };
const text = JSON.stringify(manifest, null, 1);
writeFileSync(path.join(out, 'engine.json'), text);
writeFileSync(path.join(out, 'engine.sig'), sign(null, Buffer.from(text), createPrivateKey(pem)).toString('base64'));
console.log(`engine ${v} (Chromium ${chrome}) sealed`);
say('engine', v);
