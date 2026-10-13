// E7, the email assistant (his interview, 2026-10-13): drive times with traffic from TomTom (his pick; he makes the free
// developer account himself, no card), an "Open in Waze" button (Waze has no traffic service an app may use), from his
// home address, which he sets once and confirms. His rule: never a place or a time wrong. So:
//   - Every address is looked up and what TomTom FOUND is said back (its own full address), with how sure it is; a weak
//     match is a CHECK, never a quiet guess.
//   - Times come back as TomTom computed them (traffic now, or predicted for when he leaves), said with am/pm in Toronto.
// The key lives in %APPDATA%\Aang\tomtom.json (tools\tomtom-setup.cmd), readable by his account only, never shown.
import { existsSync, readFileSync } from 'node:fs';
import { writeFileAtomic } from './atomic.ts';

export interface Place { text: string; lat: number; lon: number; found: string; score: number }
export interface Route { meters: number; seconds: number; delay: number; departAt: string; arriveAt: string }
type Fetch = (url: string, init?: Record<string, unknown>) => Promise<{ ok: boolean; status: number; json(): Promise<any> }>;

/** Below this TomTom match score, the place is a CHECK: he is shown what was found and asked. */
export const SURE = 0.85;

export class Travel {
  private readonly keyFile: string;
  private readonly homeFile: string;
  private readonly fetcher: Fetch;
  constructor(stateDir: string, fetcher?: Fetch) {
    this.keyFile = `${stateDir}/tomtom.json`;
    this.homeFile = `${stateDir}/home-place.json`;
    this.fetcher = fetcher ?? ((u, i) => fetch(u, i as RequestInit) as any);
  }
  private key(): string { try { return String(JSON.parse(readFileSync(this.keyFile, 'utf8'))?.key ?? '').trim(); } catch { return ''; } }
  get ready(): boolean { return this.key().length >= 20; }
  get home(): Place | null {
    try { if (!existsSync(this.homeFile)) return null; const h = JSON.parse(readFileSync(this.homeFile, 'utf8')); return Number.isFinite(h?.lat) && Number.isFinite(h?.lon) ? h as Place : null; } catch { return null; }
  }
  setHome(p: Place): void { writeFileAtomic(this.homeFile, JSON.stringify(p)); }

  private async get(url: string): Promise<any> {
    const r = await this.fetcher(url, { signal: AbortSignal.timeout(10_000) });
    if (!r.ok) throw new Error(r.status === 403 || r.status === 401 ? 'TomTom refused the key' : `TomTom said ${r.status}`);
    return r.json();
  }

  /**
   * Where a place is, and what TomTom understood it to be. Canada and the US first, near his home (else Toronto).
   * A street address ("220 King St W") goes to the address lookup, which says how exact the match is. A place's name
   * ("Toronto City Hall") goes to the place search (2026-10-13: the address lookup sent that one to Windsor, then to
   * the island airport); a named place counts as sure only when its name is what he said.
   */
  async find(text: string): Promise<Place | null> {
    const q = text.replace(/\s+/g, ' ').trim().slice(0, 200);
    if (!q) return null;
    const near = this.home ?? { lat: 43.65, lon: -79.38 };
    const common = `key=${encodeURIComponent(this.key())}&limit=1&countrySet=CA,US&language=en-US&lat=${near.lat}&lon=${near.lon}`;
    if (/^\s*\d+[A-Za-z]?\b/.test(q)) {
      const j = await this.get(`https://api.tomtom.com/search/2/geocode/${encodeURIComponent(q)}.json?${common}`);
      const r = j?.results?.[0];
      if (!r?.position) return null;
      return { text: q, lat: Number(r.position.lat), lon: Number(r.position.lon), found: String(r.address?.freeformAddress ?? ''), score: Number(r.matchConfidence?.score ?? 0) };
    }
    const j = await this.get(`https://api.tomtom.com/search/2/search/${encodeURIComponent(q)}.json?${common}&typeahead=false`);
    const r = j?.results?.[0];
    if (!r?.position) return null;
    const name = String(r.poi?.name ?? '').trim();
    const same = name && name.toLowerCase() === q.toLowerCase().replace(/,.*$/, '').trim();
    return { text: q, lat: Number(r.position.lat), lon: Number(r.position.lon), found: [name, String(r.address?.freeformAddress ?? '')].filter(Boolean).join(', '), score: same ? 1 : 0.5 };
  }

  /** The drive, with traffic: now, leaving at a time, or arriving by a time (then departAt is the leave-by). */
  async route(from: Place, to: Place, when?: { arriveBy?: string; leaveAt?: string }): Promise<Route> {
    const at = when?.arriveBy ? `&arriveAt=${encodeURIComponent(when.arriveBy)}` : when?.leaveAt ? `&departAt=${encodeURIComponent(when.leaveAt)}` : '&departAt=now';
    const j = await this.get(`https://api.tomtom.com/routing/1/calculateRoute/${from.lat},${from.lon}:${to.lat},${to.lon}/json?key=${encodeURIComponent(this.key())}&traffic=true&travelMode=car&routeType=fastest${at}`);
    const s = j?.routes?.[0]?.summary;
    if (!s) throw new Error('TomTom found no route');
    return { meters: Number(s.lengthInMeters), seconds: Number(s.travelTimeInSeconds), delay: Number(s.trafficDelayInSeconds) || 0, departAt: String(s.departureTime), arriveAt: String(s.arrivalTime) };
  }
}

/** Waze opens with the route to there ready (on his phone, the app; on a computer, Waze's site). */
export const wazeLink = (p: { lat: number; lon: number }) => `https://waze.com/ul?ll=${p.lat.toFixed(6)}%2C${p.lon.toFixed(6)}&navigate=yes`;

const at = (iso: string) => new Date(iso).toLocaleTimeString('en-US', { timeZone: 'America/Toronto', hour: 'numeric', minute: '2-digit' }).toLowerCase();
const day = (iso: string) => new Date(iso).toLocaleDateString('en-US', { timeZone: 'America/Toronto', weekday: 'long', month: 'long', day: 'numeric' });
export const mins = (s: number) => { const m = Math.max(1, Math.round(s / 60)); return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${m % 60 ? `${m % 60} min` : ''}`.trim(); };

/** The drive in his words: how long, how far, traffic, and (arriving by a time) when to leave. */
export function sayDrive(r: Route, to: Place, arriveBy?: string): string {
  const parts = [`${mins(r.seconds)} by car (${(r.meters / 1000).toFixed(1)} km)`];
  if (r.delay >= 60) parts.push(`${mins(r.delay)} of that is traffic`);
  if (arriveBy) parts.push(`to be there by ${at(arriveBy)} on ${day(arriveBy)}, leave by ${at(r.departAt)}`);
  else parts.push(`leaving now, you would get there about ${at(r.arriveAt)}`);
  return `${parts.join('; ')}. To: ${to.found || to.text}.`;
}

/** What TomTom found, said back, with a CHECK when it is not a clear match. */
export function sayFound(p: Place): string {
  const sure = p.score >= SURE;
  return `${sure ? '' : 'CHECK: not a clear match. '}You said "${p.text}"; TomTom found: ${p.found || '(no address)'}.`;
}
