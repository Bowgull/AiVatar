// Samara's engine watch (security plan, 2026-10-14). Samara runs on castLabs' Electron (paid video), which ships about
// once a month, so every day without the newest one is Chrome security fixes missing. Once a day this looks at
// castLabs' public release list and, the first time a newer one is out, Aang tells him. Installing it stays a
// deliberate step with him (his call: the new engine, the login lock and his video re-sign go in together, once).
const VER = /^v?(\d+)\.(\d+)\.(\d+)\+wvcus$/;

/** The newest stable castLabs release newer than `current` (e.g. "44.5.1"), or null. */
export function newerCastlabs(tags: { tag: string; prerelease: boolean }[], current: string): string | null {
  const cur = /^(\d+)\.(\d+)\.(\d+)$/.exec(current);
  if (!cur) return null;
  const num = (m: RegExpExecArray) => [Number(m[1]), Number(m[2]), Number(m[3])];
  const gt = (a: number[], b: number[]) => { for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i]! > b[i]!; return false; };
  let best: number[] | null = null;
  for (const t of tags) {
    const m = VER.exec(t.tag);
    if (!m || t.prerelease) continue;
    const v = num(m);
    if (gt(v, num(cur)) && (!best || gt(v, best))) best = v;
  }
  return best ? best.join('.') : null;
}

export async function castlabsReleases(get: typeof fetch = fetch): Promise<{ tag: string; prerelease: boolean; published: string }[]> {
  const r = await get('https://api.github.com/repos/castlabs/electron-releases/releases?per_page=30', { headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'Aang (Samara engine watch)' }, signal: AbortSignal.timeout(20_000) });
  if (!r.ok) throw new Error(`GitHub said ${r.status}`);
  return ((await r.json()) as any[]).map((x) => ({ tag: String(x.tag_name ?? ''), prerelease: x.prerelease === true || x.draft === true, published: String(x.published_at ?? '') }));
}
