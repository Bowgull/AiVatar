// Engines as sealed GitHub releases (his plan, 2026-10-30). Every day GitHub looks for a new castLabs engine
// (.github/workflows/engine-release.yml), checks each download against the fingerprint castLabs' release carries,
// and publishes it as its own release, tagged engine-vX.Y.Z, sealed with his release key: only when the engine
// changes. Both machines read it here and take an engine ONLY when the seal checks out. Its own file so it is tested
// without Electron. Also here: how far behind Chrome's security fixes an engine is, for the key's one line.
import { createHash, createPublicKey, verify } from 'node:crypto';
import { createWriteStream, renameSync, rmSync } from 'node:fs';
import { RELEASE_KEY, RELEASE_REPO } from './ghrelease.ts';
import { isVersion, newer } from './updateengine.ts';

export const ENGINE_RELEASES = `https://github.com/${RELEASE_REPO}/releases/download/`;
/** The repo's releases, newest first (engine releases are never "latest": that stays Samara's). */
export const RELEASES_API = `https://api.github.com/repos/${RELEASE_REPO}/releases?per_page=30`;
/** Chrome's own list of stable releases (Google's Chromium Dash), for "weeks behind". */
export const CHROME_STABLE = 'https://chromiumdash.appspot.com/fetch_releases?channel=Stable&platform=Mac&num=60';
/** The biggest engine a machine will download (castLabs' are about 135 MB). */
export const ENGINE_MAX = 600 * 1024 * 1024;

export type EnginePlatform = 'darwin-x64' | 'darwin-arm64' | 'win32-x64';
export interface EngineAsset { platform: EnginePlatform; file: string; sha256: string; bytes: number }
export interface EngineManifest {
  v: 1; app: 'engine'; version: string;
  /** castLabs' tag ("v44.9.3+wvcus"), the Chromium inside it, and when castLabs published it. */
  castlabs: string; chrome: string; published: string; at: string;
  assets: EngineAsset[];
}
/** The platform this machine's engine is for. */
export const enginePlatform = (platform = process.platform, arch = process.arch): EnginePlatform | null =>
  platform === 'win32' && arch === 'x64' ? 'win32-x64' : platform === 'darwin' ? (arch === 'arm64' ? 'darwin-arm64' : 'darwin-x64') : null;

const PLATFORMS: EnginePlatform[] = ['darwin-x64', 'darwin-arm64', 'win32-x64'];
/** The engine release's manifest, only when his seal is on exactly this text and it says what an engine release says. */
export function checkEngineManifest(text: string, sigB64: string, pub: string = RELEASE_KEY): EngineManifest | null {
  if (typeof text !== 'string' || text.length > 64_000 || typeof sigB64 !== 'string') return null;
  let ok = false;
  try { ok = verify(null, Buffer.from(text), createPublicKey(pub), Buffer.from(sigB64.trim(), 'base64')); } catch { ok = false; }
  if (!ok) return null;
  let m: Partial<EngineManifest>;
  try { m = JSON.parse(text); } catch { return null; }
  if (m.v !== 1 || m.app !== 'engine' || !isVersion(m.version) || m.castlabs !== `v${m.version}+wvcus` || !/^\d{2,4}\.\d+\.\d+\.\d+$/.test(String(m.chrome))) return null;
  const assets = (Array.isArray(m.assets) ? m.assets : []).filter((a) => a && PLATFORMS.includes(a.platform)
    && a.file === `castlabs-${m.version}-${a.platform}.zip` && /^[0-9a-f]{64}$/.test(String(a.sha256)) && Number.isInteger(a.bytes) && a.bytes > 0 && a.bytes <= ENGINE_MAX);
  if (!assets.length) return null;
  return { v: 1, app: 'engine', version: m.version!, castlabs: m.castlabs!, chrome: m.chrome!, published: String(m.published ?? ''), at: String(m.at ?? ''), assets };
}

type Fetch = (url: string, init?: { signal?: AbortSignal; headers?: Record<string, string> }) => Promise<{ ok: boolean; status: number; text(): Promise<string>; body?: ReadableStream<Uint8Array> | null }>;

/** The newest sealed engine release newer than `have`, with a download for this machine, or null. */
export async function latestEngine(fetchFn: Fetch, have: string, plat: EnginePlatform, base = ENGINE_RELEASES, pub = RELEASE_KEY, api = RELEASES_API): Promise<{ m: EngineManifest; asset: EngineAsset } | null> {
  try {
    const r = await fetchFn(api, { signal: AbortSignal.timeout(20_000), headers: { Accept: 'application/vnd.github+json' } });
    if (!r.ok) return null;
    const tags = ((JSON.parse(await r.text()) as { tag_name?: unknown; draft?: unknown; prerelease?: unknown }[]) ?? [])
      .filter((x) => !x.draft && !x.prerelease).map((x) => String(x.tag_name ?? '')).filter((t) => /^engine-v\d{1,4}\.\d{1,4}\.\d{1,4}$/.test(t));
    const best = tags.map((t) => t.slice('engine-v'.length)).filter((v) => newer(v, have)).sort((a, b) => (newer(a, b) ? -1 : 1))[0];
    if (!best) return null;
    const get = async (f: string) => { const x = await fetchFn(`${base}engine-v${best}/${f}`, { signal: AbortSignal.timeout(20_000) }); return x.ok ? x.text() : null; };
    const [text, sig] = await Promise.all([get('engine.json'), get('engine.sig')]);
    const m = text && sig ? checkEngineManifest(text, sig, pub) : null;
    const asset = m?.version === best ? m.assets.find((a) => a.platform === plat) : undefined;
    return m && asset ? { m, asset } : null;
  } catch { return null; }
}

/** The engine's download, saved at dest only when it is exactly the size and fingerprint the sealed manifest says. */
export async function downloadEngine(fetchFn: Fetch, m: EngineManifest, a: EngineAsset, dest: string, base = ENGINE_RELEASES): Promise<boolean> {
  const part = dest + '.part';
  try {
    const r = await fetchFn(`${base}engine-v${m.version}/${a.file}`, { signal: AbortSignal.timeout(30 * 60_000) });
    if (!r.ok || !r.body) return false;
    const hash = createHash('sha256'), out = createWriteStream(part);
    let n = 0;
    const reader = r.body.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      n += value.length;
      if (n > a.bytes) { await reader.cancel(); throw new Error('too big'); }
      hash.update(value);
      if (!out.write(value)) await new Promise<void>((res) => out.once('drain', () => res()));
    }
    await new Promise<void>((res, rej) => out.end((e?: Error | null) => (e ? rej(e) : res())));
    if (n !== a.bytes || hash.digest('hex') !== a.sha256) throw new Error('fingerprint');
    renameSync(part, dest);
    return true;
  } catch { try { rmSync(part, { force: true }); } catch { /* gone */ } return false; }
}

// ---------------------------------------------------------------- behind Chrome
/** a.b.c.d compared by number. */
function chromeNewer(a: string, b: string): boolean {
  const x = a.split('.').map(Number), y = b.split('.').map(Number);
  for (let i = 0; i < 4; i++) if ((x[i] ?? 0) !== (y[i] ?? 0)) return (x[i] ?? 0) > (y[i] ?? 0);
  return false;
}
/**
 * How long an engine has been missing Chrome's security fixes: since the first Chrome stable release newer than the
 * Chromium it carries. 0 when none is newer. Chrome's list is { version, time } (time in ms).
 */
export function behindMs(chrome: string, stable: { version: string; time: number }[], now = Date.now()): number {
  const later = stable.filter((r) => /^\d+\.\d+\.\d+\.\d+$/.test(r.version) && Number.isFinite(r.time) && chromeNewer(r.version, chrome));
  if (!later.length) return 0;
  return Math.max(0, now - Math.min(...later.map((r) => r.time)));
}
/** "6 weeks", "2 days", "less than a day": the key's words. */
export function behindWords(ms: number): string {
  const days = Math.floor(ms / 86_400_000);
  if (days < 1) return 'less than a day';
  if (days < 14) return `${days} day${days === 1 ? '' : 's'}`;
  return `${Math.floor(days / 7)} weeks`;
}
/** Chrome's stable releases, or [] when Chrome's list cannot be read (then the line is simply not shown). */
export async function chromeStable(fetchFn: Fetch, url = CHROME_STABLE): Promise<{ version: string; time: number }[]> {
  try {
    const r = await fetchFn(url, { signal: AbortSignal.timeout(20_000) });
    if (!r.ok) return [];
    const j = JSON.parse(await r.text()) as { version?: unknown; time?: unknown }[];
    return (Array.isArray(j) ? j : []).map((x) => ({ version: String(x.version ?? ''), time: Number(x.time) })).filter((x) => x.version && Number.isFinite(x.time));
  } catch { return []; }
}
