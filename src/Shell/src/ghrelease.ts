// Samara's update engine (his picks, 2026-10-29): both machines take Samara from one release on GitHub. Claude ships a
// version (a samara-vX.Y.Z tag on main) when a piece of work is done; GitHub tests it on a Mac and on Windows, packs it,
// seals it with his release key and publishes it. Each Samara checks on start, every hour, and the moment the release
// nudge arrives, and takes a release ONLY when its seal checks out against the public half below. Its own file so it
// is tested without Electron.
import { createHash, createPublicKey, verify } from 'node:crypto';
import { createWriteStream, renameSync, rmSync } from 'node:fs';

/** The public half of his release key (src/Shell/release-key.pub; the private half is GitHub's secret SAMARA_RELEASE_KEY). */
export const RELEASE_KEY = `-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEAVMZz/VO98/9eX9+eUALUiaxNyxiXuNL/KPWaOdMZQ2E=
-----END PUBLIC KEY-----
`;
export const RELEASES = 'https://github.com/Bowgull/AiVatar/releases/latest/download/';
/** The release nudge (ntfy): a one-word "check now". It carries nothing, so anyone sending it can only make a Samara check. */
export const NUDGE = 'https://ntfy.sh/samara-bowgull-7c1e9a52/json';
/** The biggest bundle a Samara will download (today's is about 6 MB). */
export const BUNDLE_MAX = 200 * 1024 * 1024;

export interface Manifest {
  v: 1; app: 'samara'; version: string; commit: string; at: string; notes: string[];
  bundle: { file: string; sha256: string; bytes: number };
}

/** The release's manifest, only when his seal is on exactly this text and it says what a Samara release says. */
export function checkManifest(text: string, sigB64: string, pub: string = RELEASE_KEY): Manifest | null {
  if (typeof text !== 'string' || text.length > 64_000 || typeof sigB64 !== 'string') return null;
  let ok = false;
  try { ok = verify(null, Buffer.from(text), createPublicKey(pub), Buffer.from(sigB64.trim(), 'base64')); } catch { ok = false; }
  if (!ok) return null;
  let m: Partial<Manifest>;
  try { m = JSON.parse(text); } catch { return null; }
  const b = m.bundle;
  if (m.v !== 1 || m.app !== 'samara' || !isVersion(m.version) || !/^[0-9a-f]{40}$/.test(String(m.commit))) return null;
  if (!b || b.file !== 'samara-bundle.tgz' || !/^[0-9a-f]{64}$/.test(String(b.sha256)) || !Number.isInteger(b.bytes) || b.bytes <= 0 || b.bytes > BUNDLE_MAX) return null;
  const notes = (Array.isArray(m.notes) ? m.notes : []).map((x) => String(x).slice(0, 160)).filter(Boolean).slice(0, 30);
  return { v: 1, app: 'samara', version: m.version!, commit: m.commit!, at: String(m.at ?? ''), notes, bundle: { file: b.file, sha256: b.sha256, bytes: b.bytes } };
}

export const isVersion = (v: unknown): v is string => typeof v === 'string' && /^\d{1,4}\.\d{1,4}\.\d{1,4}$/.test(v);
/** Is a newer than b? A version that is not x.y.z (a hand install, the PC's old fingerprints) is older than any release. */
export function newer(a: string, b: string): boolean {
  if (!isVersion(a)) return false;
  if (!isVersion(b)) return true;
  const x = a.split('.').map(Number), y = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i]! > y[i]!;
  return false;
}

type Fetch = (url: string, init?: { signal?: AbortSignal }) => Promise<{ ok: boolean; status: number; text(): Promise<string>; arrayBuffer(): Promise<ArrayBuffer>; body?: ReadableStream<Uint8Array> | null }>;

/** The latest release, sealed, or null (no release yet, offline, or a seal that does not check out: never used). */
export async function latest(fetchFn: Fetch, base = RELEASES, pub = RELEASE_KEY): Promise<Manifest | null> {
  try {
    const get = async (f: string) => { const r = await fetchFn(base + f, { signal: AbortSignal.timeout(20_000) }); return r.ok ? r.text() : null; };
    const [text, sig] = await Promise.all([get('manifest.json'), get('manifest.sig')]);
    return text && sig ? checkManifest(text, sig, pub) : null;
  } catch { return null; }
}

/** The release's bundle, saved at dest only when it is exactly the size and fingerprint the sealed manifest says. */
export async function download(fetchFn: Fetch, m: Manifest, dest: string, base = RELEASES): Promise<boolean> {
  const part = dest + '.part';
  try {
    const r = await fetchFn(base + m.bundle.file, { signal: AbortSignal.timeout(10 * 60_000) });
    if (!r.ok || !r.body) return false;
    const hash = createHash('sha256'), out = createWriteStream(part);
    let n = 0;
    const reader = r.body.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      n += value.length;
      if (n > m.bundle.bytes) { await reader.cancel(); throw new Error('too big'); }
      hash.update(value);
      if (!out.write(value)) await new Promise<void>((res) => out.once('drain', () => res()));
    }
    await new Promise<void>((res, rej) => out.end((e?: Error | null) => (e ? rej(e) : res())));
    if (n !== m.bundle.bytes || hash.digest('hex') !== m.bundle.sha256) throw new Error('fingerprint');
    renameSync(part, dest);
    return true;
  } catch { try { rmSync(part, { force: true }); } catch { /* gone */ } return false; }
}

/**
 * The nudge: listens for "check now" while the computer is online, and reconnects after a drop. Calls back at most once
 * every two minutes (a flood of fake nudges is one check). Returns a stop function.
 */
export function listen(fetchFn: Fetch, onNudge: () => void, url = NUDGE): () => void {
  let stopped = false, last = 0, ctl: AbortController | null = null;
  const run = async () => {
    while (!stopped) {
      ctl = new AbortController();
      try {
        const r = await fetchFn(url, { signal: ctl.signal });
        if (r.ok && r.body) {
          const reader = r.body.getReader(), dec = new TextDecoder();
          let buf = '';
          for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            buf += dec.decode(value, { stream: true });
            let i;
            while ((i = buf.indexOf('\n')) >= 0) {
              const line = buf.slice(0, i); buf = buf.slice(i + 1);
              if (/"event"\s*:\s*"message"/.test(line) && Date.now() - last > 120_000) { last = Date.now(); onNudge(); }
            }
          }
        }
      } catch { /* offline, or stopped */ }
      if (!stopped) await new Promise((res) => setTimeout(res, 30_000));
    }
  };
  void run();
  return () => { stopped = true; ctl?.abort(); };
}
