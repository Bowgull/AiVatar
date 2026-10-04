// What Aang skips, with an on/off switch each and an honest word about how well it works.
//
// Every one of these is something he asked for, and every reliability word below came from testing the
// source live, not from its own marketing. The tags are shown to him in the settings panel exactly as
// they read here: a switch that quietly works three weeks in four is worse than one that says so.
export type SkipKind = 'animeOpening' | 'intro' | 'sponsor' | 'youtubeAds' | 'twitchAds';

export interface SkipRule {
  id: SkipKind;
  label: string;
  /** What he sees under the switch. */
  says: string;
  /** How well it actually works, from testing it. */
  reliability: 'solid' | 'mostly' | 'shaky';
  reliabilitySays: string;
  on: boolean;
}

export const SKIP_RULES: SkipRule[] = [
  {
    id: 'animeOpening',
    label: 'Skip anime openings and endings',
    says: 'Knows where they are, episode by episode, for most anime',
    reliability: 'solid',
    reliabilitySays: 'Solid',
    on: true,
  },
  {
    id: 'intro',
    label: 'Skip intros and recaps',
    says: "Presses the service's own Skip button for you",
    reliability: 'mostly',
    reliabilitySays: 'Solid on Prime. Netflix changes its player more often',
    on: true,
  },
  {
    id: 'sponsor',
    label: 'Skip YouTube sponsor bits',
    says: '"This video is sponsored by" and the like, using times other viewers marked',
    reliability: 'solid',
    reliabilitySays: 'Solid',
    on: true,
  },
  {
    id: 'youtubeAds',
    label: 'Block YouTube ads',
    says: 'Aang refreshes the block lists by himself',
    reliability: 'mostly',
    reliabilitySays: 'Works, breaks for a day or two every few weeks',
    on: true,
  },
  {
    id: 'twitchAds',
    label: 'Block Twitch ads',
    says: 'Instead of an ad you get a blurrier picture for the length of the ad break',
    reliability: 'shaky',
    reliabilitySays: 'Twitch fights this constantly',
    // OFF until he decides. The plan lists this as blocked on him, and its own notes admit the result
    // is a 360p picture for the ad break, which may be worse than the ad.
    on: false,
  },
];

export type SkipSettings = Record<SkipKind, boolean>;

export const DEFAULT_SKIPS: SkipSettings = Object.fromEntries(
  SKIP_RULES.map(r => [r.id, r.on]),
) as SkipSettings;

/** Fill in anything missing from a saved file with the default, so an old file never disables a rule. */
export function withDefaults(saved: unknown): SkipSettings {
  const out = { ...DEFAULT_SKIPS };
  if (saved && typeof saved === 'object') {
    for (const r of SKIP_RULES) {
      const v = (saved as Record<string, unknown>)[r.id];
      if (typeof v === 'boolean') out[r.id] = v;
    }
  }
  return out;
}
