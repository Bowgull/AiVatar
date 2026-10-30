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
export const RELEASES = 'https://github.com/Bowgull/AiVatar/releases/download/';
/** Which release is current: GitHub's own answer (never a release marked not used), its tag only. */
export const LATEST_API = 'https://api.github.com/repos/Bowgull/AiVatar/releases/latest';
/** The release nudge (ntfy): a one-word "check now". It carries nothing, so anyone sending it can only make a Samara check. */
export const NUDGE = 'https://ntfy.sh/samara-bowgull-7c1e9a52/json';
/** The biggest bundle a Samara will download (today's is about 6 MB). */
export const BUNDLE_MAX = 200 * 1024 * 1024;

export interface Manifest {
  v: 1; app: 'samara'; version: string; commit: string; at: string; notes: string[];
  /** His version's name (his anime picks, tools/release/version.mjs: Gojo, Edward, Naruto...), and each line's kind. */
  name: string; items: { text: string; kind: 'major' | 'feature' | 'fix' }[];
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
  const name = typeof m.name === 'string' && /^[A-Za-z][A-Za-z0-9 .'-]{0,39}$/.test(m.name) ? m.name : '';
  const items = (Array.isArray(m.items) ? m.items : []).slice(0, 30).map((x) => ({ text: String(x?.text ?? '').slice(0, 160), kind: x?.kind === 'major' || x?.kind === 'feature' ? x.kind : 'fix' as const })).filter((x) => x.text);
  return { v: 1, app: 'samara', version: m.version!, commit: m.commit!, at: String(m.at ?? ''), notes, name, items, bundle: { file: b.file, sha256: b.sha256, bytes: b.bytes } };
}

// One comparison for every source (updateengine.ts).
import { isVersion, newer } from './updateengine.ts';
import { longDate } from './clock.ts';
export { isVersion, newer };

type Fetch = (url: string, init?: { signal?: AbortSignal }) => Promise<{ ok: boolean; status: number; text(): Promise<string>; arrayBuffer(): Promise<ArrayBuffer>; body?: ReadableStream<Uint8Array> | null }>;

/** The latest release, sealed, or null (no release yet, offline, or a seal that does not check out: never used). */
export async function latest(fetchFn: Fetch, base = RELEASES, pub = RELEASE_KEY, api = LATEST_API): Promise<Manifest | null> {
  try {
    const r0 = await fetchFn(api, { signal: AbortSignal.timeout(20_000) });
    if (!r0.ok) return null;
    const tag = String((JSON.parse(await r0.text()) as { tag_name?: unknown }).tag_name ?? '');
    if (!/^samara-v\d{1,4}\.\d{1,4}\.\d{1,4}$/.test(tag)) return null;
    const get = async (f: string) => { const r = await fetchFn(`${base}${tag}/${f}`, { signal: AbortSignal.timeout(20_000) }); return r.ok ? r.text() : null; };
    const [text, sig] = await Promise.all([get('manifest.json'), get('manifest.sig')]);
    const m = text && sig ? checkManifest(text, sig, pub) : null;
    return m && `samara-v${m.version}` === tag ? m : null;
  } catch { return null; }
}

/** The release's bundle, saved at dest only when it is exactly the size and fingerprint the sealed manifest says. */
export async function download(fetchFn: Fetch, m: Manifest, dest: string, base = RELEASES): Promise<boolean> {
  const part = dest + '.part';
  try {
    const r = await fetchFn(`${base}samara-v${m.version}/${m.bundle.file}`, { signal: AbortSignal.timeout(10 * 60_000) });
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
/**
 * Hears the release nudge. Three holes closed (2026-10-30, his "no update button, again"): a stream that went quiet
 * (the Mac slept, the Wi-Fi changed) used to hang for good, so it is dropped when nothing, not even ntfy's keepalive,
 * has come for `quietMs`; a nudge sent while it was reconnecting was lost, so it reconnects asking for what came since
 * the last thing it heard (ntfy keeps them 12 h); and it tries again after 10 s, not 30.
 */
export function listen(fetchFn: Fetch, onNudge: () => void, url = NUDGE, o: { quietMs?: number; retryMs?: number } = {}): () => void {
  const quietMs = o.quietMs ?? 100_000, retryMs = o.retryMs ?? 10_000;
  let stopped = false, last = 0, heard = 0, since = 0, ctl: AbortController | null = null;
  const dog = setInterval(() => { if (ctl && heard && Date.now() - heard > quietMs) ctl.abort(); }, Math.min(15_000, quietMs / 2));
  dog.unref?.();
  const run = async () => {
    while (!stopped) {
      ctl = new AbortController();
      heard = Date.now();
      try {
        const r = await fetchFn(since ? `${url}?since=${since}` : url, { signal: ctl.signal });
        if (r.ok && r.body) {
          const reader = r.body.getReader(), dec = new TextDecoder();
          let buf = '';
          for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            heard = Date.now();
            buf += dec.decode(value, { stream: true });
            let i;
            while ((i = buf.indexOf('\n')) >= 0) {
              const line = buf.slice(0, i); buf = buf.slice(i + 1);
              const t = /"time"\s*:\s*(\d+)/.exec(line);
              if (t) since = Math.max(since, Number(t[1]));
              if (/"event"\s*:\s*"message"/.test(line) && Date.now() - last > 120_000) { last = Date.now(); onNudge(); }
            }
          }
        }
      } catch { /* offline, dropped as quiet, or stopped */ }
      if (!stopped) await new Promise((res) => setTimeout(res, retryMs));
    }
  };
  void run();
  return () => { stopped = true; clearInterval(dog); ctl?.abort(); };
}

/** "Version 1.22.0: Gojo" (his rule's name), as the key's title says it. */
export const titleOf = (m: { version: string; name?: string }): string => (m.name ? `Version ${m.version}: ${m.name}` : `Version ${m.version}`);
/** A version's section in "Every version" (Samara Changelog.md), the same shape the PC has always written. */
export function changelogSection(m: Manifest): string {
  const day = longDate(Date.parse(m.at) || Date.now());
  const tag = (k: string) => (k === 'major' ? 'Big change' : k === 'feature' ? 'New' : 'Fix');
  const lines = m.items.length ? m.items.map((i) => `- ${tag(i.kind)}: ${i.text}`) : m.notes.length ? m.notes.map((n) => `- ${n}`) : ['- Small fixes to keep things running smoothly.'];
  return `## ${titleOf(m)}\n*${day}*\n\n${lines.join('\n')}\n\n`;
}
/** "Every version" with this version's section in, right under the heading (never twice). */
export function withSection(changelog: string, m: Manifest): string {
  if (changelog.includes(`## ${titleOf(m)}\n`)) return changelog;
  const head = '# Samara Changelog\n\nEvery version of Samara, Aang\'s browser, and what it brought. Newest first. Versions go MAJOR.MINOR.PATCH: a big change starts a new number and a new character\'s name, a new feature bumps the middle number, a fix the last.\n\n';
  const body = changelog.startsWith('# Samara Changelog') ? changelog.slice(changelog.indexOf('\n## ') + 1 || changelog.length) : changelog;
  return head + changelogSection(m) + body;
}
