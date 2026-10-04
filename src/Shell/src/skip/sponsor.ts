// YouTube sponsor bits: "this video is sponsored by", and the like.
//
// SponsorBlock is a community database of segments other viewers have marked. It is asked by a HASHED
// PREFIX rather than by video id, which matters: Aang sends the first four characters of a hash and
// gets back every video that starts with those, then picks his out locally. SponsorBlock therefore
// never learns which video he is watching. That is their design and it is the right one, so it is used
// as intended rather than through the simpler endpoint that would tell them.
import { createHash } from 'node:crypto';

export interface Segment {
  from: number;
  to: number;
  /** What it is: sponsor, selfpromo, interaction, intro, outro, and so on. */
  kind: string;
}

type Fetch = typeof globalThis.fetch;

/**
 * The categories worth skipping. Deliberately NOT 'music_offtopic' (that is the music in a music
 * video) or 'poi_highlight' (a marker, not a thing to skip), and not 'filler', which is often the
 * part that makes a video worth watching.
 */
const WANTED = new Set(['sponsor', 'selfpromo', 'interaction', 'intro', 'outro', 'preview']);

export class Sponsor {
  private fetch: Fetch;
  private cache = new Map<string, Segment[]>();

  constructor(fetchImpl: Fetch = globalThis.fetch) { this.fetch = fetchImpl; }

  /** The segments for one video, or an empty list if nobody has marked it. */
  async forVideo(videoId: string): Promise<Segment[]> {
    const hit = this.cache.get(videoId);
    if (hit) return hit;

    // The whole point: only the first four characters of the hash leave this machine.
    const hash = createHash('sha256').update(videoId).digest('hex');
    const prefix = hash.slice(0, 4);

    try {
      const url = `https://sponsor.ajay.app/api/skipSegments/${prefix}`
        + `?categories=${encodeURIComponent(JSON.stringify([...WANTED]))}`;
      const r = await this.fetch(url);
      if (!r.ok) { this.cache.set(videoId, []); return []; }
      const all = await r.json() as { videoID?: string; segments?: { segment?: number[]; category?: string }[] }[];
      // The answer covers every video sharing that prefix. His is picked out here, on this machine.
      const mine = all.find(v => v.videoID === videoId);
      const out: Segment[] = [];
      for (const s of mine?.segments ?? []) {
        const from = s.segment?.[0];
        const to = s.segment?.[1];
        if (typeof from !== 'number' || typeof to !== 'number' || to <= from) continue;
        if (!WANTED.has(String(s.category))) continue;
        out.push({ from, to, kind: String(s.category) });
      }
      out.sort((a, b) => a.from - b.from);
      this.cache.set(videoId, out);
      return out;
    } catch {
      // No network, or they are down. Not knowing where a sponsor bit is must never break playback.
      this.cache.set(videoId, []);
      return [];
    }
  }

  forget(videoId: string): void { this.cache.delete(videoId); }
}

/** Plain English for the plaque, so it never says "selfpromo" at him. */
export function nameOf(kind: string): string {
  switch (kind) {
    case 'sponsor': return 'sponsor bit';
    case 'selfpromo': return 'self-promotion';
    case 'interaction': return 'like and subscribe';
    case 'intro': return 'intro';
    case 'outro': return 'outro';
    case 'preview': return 'recap';
    default: return 'bit';
  }
}
