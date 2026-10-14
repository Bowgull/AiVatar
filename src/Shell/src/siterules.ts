// Site rules (sheet 37, his picks 2026-10-14): what each site may do, set from the shield or Settings > Your sites.
// Ads, popups and dark mode already have their own lists in browser.ts; this keeps the rest:
//   ai      Claude and Aang may open and read the site (default on; off = never, like a bank)
//   login   they may use his login there (unset = the job's own sites only, as before; on = always; off = never)
//   camera, mic   allow / ask / block (default ask, per call, as before)
// Keyed by address without www (the same keys as the ads, popup and dark-mode lists); an address with no rule of its
// own uses its parent's, so a rule on reddit.com covers old.reddit.com.
import { existsSync, readFileSync } from 'node:fs';
import { writeFileAtomic } from './atomic.ts';
import { cleanHost, siteOf } from './driverrules.ts';

export type Tri = 'allow' | 'ask' | 'block';
export interface SiteRule { ai?: boolean; login?: boolean; camera?: Tri; mic?: Tri }
const TRI = new Set<Tri>(['allow', 'ask', 'block']);

/** The address a rule is kept under (no www), or '' for anything that is not a web address. */
export function siteKey(urlOrHost: string): string {
  let host = String(urlOrHost ?? '');
  try { if (/^[a-z]+:/i.test(host)) { const u = new URL(host); if (u.protocol !== 'http:' && u.protocol !== 'https:') return ''; host = u.hostname; } } catch { return ''; }
  host = cleanHost(host);
  host = host.replace(/^www\./, '');
  return /^[a-z0-9.-]+$/.test(host) && host.includes('.') ? host : '';
}

/** Only real settings survive: defaults are dropped, so the file holds what he changed and nothing else. */
function tidy(r: Record<string, unknown>): SiteRule {
  const out: SiteRule = {};
  if (r.ai === false) out.ai = false;
  if (r.login === true || r.login === false) out.login = r.login;
  if (TRI.has(r.camera as Tri) && r.camera !== 'ask') out.camera = r.camera as Tri;
  if (TRI.has(r.mic as Tri) && r.mic !== 'ask') out.mic = r.mic as Tri;
  return out;
}
/** How strict a value is, for sync: a rule from the other computer may only make this one stricter (his M3 call). */
const STRICT = { ai: (v?: boolean) => (v === false ? 1 : 0), login: (v?: boolean) => (v === false ? 2 : v === true ? 0 : 1), tri: (v?: Tri) => (v === 'block' ? 2 : v === 'allow' ? 0 : 1) };

export class SiteRules {
  private map = new Map<string, SiteRule>();
  private readonly file: string;
  private readonly changed: () => void;
  constructor(file: string, changed: () => void = () => {}) {
    this.file = file; this.changed = changed;
    try {
      if (existsSync(file)) {
        const j = JSON.parse(readFileSync(file, 'utf8')) as Record<string, Record<string, unknown>>;
        for (const [k, v] of Object.entries(j ?? {})) { const s = siteKey(k); const t = tidy(v ?? {}); if (s && Object.keys(t).length) this.map.set(s, t); }
      }
    } catch { /* start empty */ }
  }
  /** The rule that applies: the address's own setting for each key, else its parent's, up to the site itself. */
  private find(urlOrHost: string): SiteRule {
    const k = siteKey(urlOrHost);
    if (!k) return {};
    const top = siteOf(k), out: SiteRule = {};
    for (let h = k; ; h = h.slice(h.indexOf('.') + 1)) {
      const r = this.map.get(h);
      if (r) for (const key of Object.keys(r) as (keyof SiteRule)[]) if (out[key] === undefined) (out as Record<string, unknown>)[key] = r[key];
      if (h === top || !h.includes('.')) break;
    }
    return out;
  }
  get(urlOrHost: string): SiteRule { return this.find(urlOrHost); }
  /** May Claude and Aang open and read it? */
  ai(urlOrHost: string): boolean { return this.find(urlOrHost).ai !== false; }
  /** true = always his login, false = never, undefined = the job decides (its own sites only). */
  login(urlOrHost: string): boolean | undefined { return this.find(urlOrHost).login; }
  media(urlOrHost: string, kind: 'camera' | 'mic'): Tri { return this.find(urlOrHost)[kind] ?? 'ask'; }
  set(urlOrHost: string, patch: Partial<Record<keyof SiteRule, unknown>>): boolean {
    const s = siteKey(urlOrHost);
    if (!s) return false;
    const next = tidy({ ...(this.map.get(s) ?? {}), ...patch });
    if (Object.keys(next).length) this.map.set(s, next); else this.map.delete(s);
    this.save();
    return true;
  }
  /** Forget everything set for one site (the x in Your sites). */
  clear(urlOrHost: string): void { if (this.map.delete(siteKey(urlOrHost))) this.save(); }
  all(): Record<string, SiteRule> { return Object.fromEntries([...this.map.entries()].sort(([a], [b]) => a.localeCompare(b))); }
  /** From the other computer: anything stricter applies here; anything looser is left for him to set here himself. */
  takeFromPeer(v: unknown): void {
    if (!v || typeof v !== 'object') return;
    let any = false;
    for (const [k, raw] of Object.entries(v as Record<string, Record<string, unknown>>)) {
      const s = siteKey(k); if (!s) continue;
      const theirs = tidy(raw ?? {}), mine = this.map.get(s) ?? {};
      const next: SiteRule = { ...mine };
      if (STRICT.ai(theirs.ai) > STRICT.ai(mine.ai)) next.ai = theirs.ai;
      if (STRICT.login(theirs.login) > STRICT.login(mine.login)) next.login = theirs.login;
      for (const kind of ['camera', 'mic'] as const) if (STRICT.tri(theirs[kind]) > STRICT.tri(mine[kind])) next[kind] = theirs[kind];
      const t = tidy(next as Record<string, unknown>);
      if (JSON.stringify(t) !== JSON.stringify(tidy(mine as Record<string, unknown>))) { this.map.set(s, t); any = true; }
    }
    if (any) this.save(false);
  }
  private save(tell = true): void {
    try { writeFileAtomic(this.file, JSON.stringify(this.all(), null, 1)); } catch { /* next change tries again */ }
    if (tell) this.changed();
  }
}
