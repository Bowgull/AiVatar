// Working out what to skip in whatever is playing, and handing it to the page.
//
// This lives in the main process because it is the one that can reach the network; the page only acts
// on what it is given. Nothing here ever stops playback: every source is allowed to fail, and a video
// with no segments simply has none.
import type { Embed } from '../embed.ts';
import { SkipTimes } from './aniskip.ts';
import { Sponsor, nameOf } from './sponsor.ts';
import type { SkipSettings } from './settings.ts';

/** What the page needs: when to jump, where to, and what to say on the plaque. */
export interface Segment { from: number; to: number; says: string }

export class FindSkips {
  private anime: SkipTimes;
  private sponsor: Sponsor;

  constructor(stateDir: string, fetchImpl: typeof globalThis.fetch = globalThis.fetch) {
    this.anime = new SkipTimes(stateDir, fetchImpl);
    this.sponsor = new Sponsor(fetchImpl);
  }

  /** The YouTube video id inside an embed address, which is all SponsorBlock needs. */
  private static youtubeId(url: string): string | null {
    const m = /youtube(?:-nocookie)?\.com\/embed\/([^/?#]+)/.exec(url);
    return m ? m[1]! : null;
  }

  /**
   * What to skip in this video.
   *
   * `title` and `episode` are only known for anime, and only when something told Aang what is playing
   * (step 6.7 and the watching work in 6.8). Without them the anime lookup is skipped entirely rather
   * than guessed at: a wrong opening time is worse than none.
   */
  async forEmbed(embed: Embed, settings: SkipSettings, about?: { title?: string; episode?: number }): Promise<Segment[]> {
    const out: Segment[] = [];

    if (settings.sponsor && embed.source === 'youtube') {
      const id = FindSkips.youtubeId(embed.url);
      if (id) {
        for (const s of await this.sponsor.forVideo(id)) {
          out.push({ from: s.from, to: s.to, says: nameOf(s.kind) });
        }
      }
    }

    if (settings.animeOpening && about?.title && typeof about.episode === 'number') {
      const mal = await this.anime.malId(about.title);
      if (mal) {
        for (const s of await this.anime.forEpisode(mal, about.episode)) {
          out.push({ from: s.from, to: s.to, says: s.kind === 'op' ? 'opening' : 'ending' });
        }
      }
    }

    out.sort((a, b) => a.from - b.from);
    return out;
  }
}
