// Step 6.7: "put X on". (Named puton.ts, not watch.ts: watch.ts is the WoW addon watcher.)
//
// ONE tool, and code reads his words before the model is asked anything. That order is deliberate:
// tool-choice accuracy collapses on a long shelf of tools, and Qwen is cleanest at five or fewer, so
// several watch-ish tools would be worse than one. And most of what he says is unambiguous. "put
// asmongold on" is a Twitch channel by the shape of the sentence; asking a model to work that out is
// slower, costs quota, and can be wrong about something code is certain of.
//
// So: this file answers with certainty where it can, and says plainly when it cannot. When it cannot,
// the brain asks Qwen (thinking off) to name the show, and the answer comes back through here again.
// Nothing here guesses a link it is not sure of. Being wrong means a strange page appearing over his
// game, which is worse than asking.

/** Where a plan should open. A game up means the pop-out; otherwise a tab. Never moved by itself. */
export type Where = 'popout' | 'tab';

export interface WatchPlan {
  /** The address to open. Always a real one; never a guess. */
  url: string;
  /** What he will see, in words he would use. Goes on the plaque. */
  what: string;
  /** The service, as he calls it: Twitch, YouTube, Crunchyroll, Prime Video. */
  service: string;
  /**
   * True when this is the thing itself. False when it is the service's own search results, which is
   * honest but means one click from him. The brain says which it is rather than pretending.
   */
  exact: boolean;
  /** Set when a dub preference was applied, so the plaque can say so and he can correct it. */
  dub?: boolean;
}

/** What code could not settle, for the brain to hand to Qwen. */
export interface WatchUnclear {
  /** His words, trimmed. */
  words: string;
  /** Why code would not answer. Plain enough to show him. */
  because: string;
}

export type WatchResult = WatchPlan | WatchUnclear;
export const isPlan = (r: WatchResult): r is WatchPlan => 'url' in r;

// ---------------------------------------------------------------------------------------------
// Links he pasted

/** Only these. A link to anywhere at all is a browser, not "put X on", and 6.19 is where that lives. */
const KNOWN_HOSTS: Array<{ host: RegExp; service: string }> = [
  { host: /^(www\.)?(youtube\.com|youtu\.be|m\.youtube\.com)$/i, service: 'YouTube' },
  { host: /^(www\.)?twitch\.tv$/i, service: 'Twitch' },
  { host: /^(www\.|beta\.)?crunchyroll\.com$/i, service: 'Crunchyroll' },
  { host: /^(www\.)?(primevideo\.com|amazon\.(com|ca))$/i, service: 'Prime Video' },
  { host: /^(www\.)?netflix\.com$/i, service: 'Netflix' },
];

/** A link in his words, if there is one on a service he watches. */
export function linkIn(words: string): WatchPlan | null {
  const m = /\bhttps?:\/\/[^\s<>"']+/i.exec(words);
  if (!m) return null;
  let u: URL;
  try { u = new URL(m[0]); } catch { return null; }
  const known = KNOWN_HOSTS.find(k => k.host.test(u.hostname));
  if (!known) return null;
  // http is upgraded rather than followed. Every one of these serves https and a plain-text request
  // to a video service is only ever a redirect or a downgrade.
  u.protocol = 'https:';
  return { url: u.toString(), what: `that ${known.service} link`, service: known.service, exact: true };
}

// ---------------------------------------------------------------------------------------------
// Twitch

/**
 * Twitch's own rule for a login name: 4 to 25 characters, letters, digits and underscore. Checked
 * rather than assumed, because a name that fails it is a guaranteed 404 and the search page is a
 * better answer than a dead channel.
 */
export const TWITCH_LOGIN = /^[a-zA-Z0-9_]{4,25}$/;

/** Words that mean "this is a live stream" wherever they sit in the sentence. */
const STREAM_WORDS = /\b(twitch|stream|streaming|live)\b/i;

/** The scaffolding around a name: "put ... on for me", "pull up ...", "'s stream". */
const SCAFFOLD = [
  // Anchored past the leading space this is handed, or "hey aang" survives and becomes the name.
  /^\s*(hey\s+)?aang\b[,\s]*/i,
  /\b(can you|could you|please|for me|right now|real quick)\b/gi,
  /\b(put|pull|bring|throw|open|start|play|watch|show)\b/gi,
  /\b(on|up|me|the|a|an|to|some|my)\b/gi,
  /\b(twitch|stream|streaming|live|channel)\b/gi,
  /['’]s\b/g,
];

/** Strip the sentence down to what is left over, which is usually the name. */
export function nameLeftOver(words: string): string {
  let s = ' ' + words.trim() + ' ';
  for (const re of SCAFFOLD) s = s.replace(re, ' ');
  return s.replace(/[.,!?]+/g, ' ').replace(/\s+/g, ' ').trim();
}

/**
 * A Twitch channel, if his words say stream and leave behind something that can be one.
 *
 * Spaces are closed up, because that is how people say these names out loud: "zack rawrr" is
 * zackrawrr. Everything else is left alone, so a name with a real underscore survives.
 */
export function twitchIn(words: string): WatchResult | null {
  if (!STREAM_WORDS.test(words)) return null;
  const left = nameLeftOver(words);
  if (!left) return { words: words.trim(), because: 'he said stream but did not say whose.' };
  const login = left.replace(/\s+/g, '').replace(/[^a-zA-Z0-9_]/g, '');
  if (!TWITCH_LOGIN.test(login)) {
    // Not a possible channel name, so the search page rather than a certain 404.
    return {
      url: `https://www.twitch.tv/search?term=${encodeURIComponent(left)}`,
      what: `Twitch search for "${left}"`, service: 'Twitch', exact: false,
    };
  }
  return { url: `https://www.twitch.tv/${login.toLowerCase()}`, what: login, service: 'Twitch', exact: true };
}

// ---------------------------------------------------------------------------------------------
// YouTube

/** A YouTube handle he said out loud: "put linus tech tips on youtube", "@ltt on youtube". */
export function youtubeIn(words: string): WatchResult | null {
  if (!/\byoutube\b/i.test(words)) return null;
  const at = /@([A-Za-z0-9._-]{3,30})\b/.exec(words);
  if (at) {
    // A handle is exact and costs nothing to look up, unlike a search, which is 100 quota units of
    // his YouTube allowance against 1 for a handle.
    return { url: `https://www.youtube.com/@${at[1]}`, what: `@${at[1]}`, service: 'YouTube', exact: true };
  }
  const left = nameLeftOver(words.replace(/\byoutube\b/gi, ' '));
  if (!left) return { words: words.trim(), because: 'he said YouTube but did not say what.' };
  return {
    url: `https://www.youtube.com/results?search_query=${encodeURIComponent(left)}`,
    what: `YouTube search for "${left}"`, service: 'YouTube', exact: false,
  };
}

// ---------------------------------------------------------------------------------------------
// The whole answer

/**
 * Channels he has actually put on before, so the second time costs nothing.
 *
 * This is why "put asmongold on", with no service named, works. The first time he says it he has to
 * say "on Twitch", because code genuinely cannot tell a streamer from a show and guessing opens the
 * wrong page over his game. After that the name is written down and it is certain.
 *
 * A table for the same reason the sub-or-dub one is: he can read it, and it does not change on its own.
 */
export type Channels = Record<string, { service: 'Twitch' | 'YouTube'; url: string }>;

/** Fill in anything a hand-edited or older file is missing, rather than throwing on it. */
export function readChannels(raw: unknown): Channels {
  const out: Channels = {};
  for (const [k, v] of Object.entries((raw ?? {}) as Record<string, any>)) {
    if ((v?.service === 'Twitch' || v?.service === 'YouTube') && typeof v?.url === 'string' && /^https:\/\//.test(v.url)) {
      out[foldTitle(k)] = { service: v.service, url: v.url };
    }
  }
  return out;
}

/** Write down a channel he just put on by name, so next time he need not say where. */
export function rememberChannel(channels: Channels, name: string, plan: WatchPlan): Channels {
  if (!plan.exact || (plan.service !== 'Twitch' && plan.service !== 'YouTube')) return channels;
  const key = foldTitle(name);
  if (!key) return channels;
  return { ...channels, [key]: { service: plan.service, url: plan.url } };
}

/**
 * Read his words. Returns a plan when code is certain, or what it could not settle.
 *
 * Order matters: a link he pasted beats everything, then the shape of the sentence, then a name he has
 * put on before. A title that is none of those is NOT answered here, because where a show is streaming
 * in Canada is a lookup, not a guess, and guessing it opens the wrong service over his game.
 */
export function readWords(words: string, channels: Channels = {}): WatchResult {
  const link = linkIn(words);
  if (link) return link;
  const tw = twitchIn(words);
  if (tw) return tw;
  const yt = youtubeIn(words);
  if (yt) return yt;
  const left = nameLeftOver(words);
  const known = channels[foldTitle(left)];
  if (known) return { url: known.url, what: left, service: known.service, exact: true };
  return {
    words: left || words.trim(),
    because: left
      ? `he named "${left}" but not where to watch it, and where it streams in Canada is a lookup.`
      : 'he did not say what to put on.',
  };
}

// ---------------------------------------------------------------------------------------------
// Sub or dub
//
// A TABLE, not something remembered from a conversation. The plan is explicit about this and the
// reason is worth keeping: a preference held in conversation memory is re-derived from whatever is in
// the window, so it changes on its own and he cannot see why. A table he can read and correct.
//
// Looked up most specific first: this show, then this kind of show, then what he usually wants.

export type Dub = 'sub' | 'dub';

export interface DubTable {
  /** What he usually wants when nothing more specific says otherwise. */
  global: Dub;
  /** By kind: anime, cartoons, films. */
  categories: Record<string, Dub>;
  /** By show, which beats both. Keys are folded with `foldTitle`. */
  shows: Record<string, Dub>;
}

export const DEFAULT_DUBS: DubTable = { global: 'sub', categories: {}, shows: {} };

/** One spelling for a title, so "Frieren" and "frieren " are the same row. */
export const foldTitle = (t: string): string => t.trim().toLowerCase().replace(/\s+/g, ' ');

/** Sub or dub for a show, and which row of the table decided, so the plaque can say. */
export function dubFor(table: DubTable, title: string, category?: string): { want: Dub; from: string } {
  const show = table.shows[foldTitle(title)];
  if (show) return { want: show, from: `your setting for ${title.trim()}` };
  if (category) {
    const cat = table.categories[category.toLowerCase()];
    if (cat) return { want: cat, from: `your setting for ${category.toLowerCase()}` };
  }
  return { want: table.global, from: 'what you usually want' };
}

/** Fill in anything a hand-edited or older file is missing, rather than throwing on it. */
export function readDubs(raw: unknown): DubTable {
  const r = (raw ?? {}) as Partial<DubTable>;
  const one = (v: unknown): Dub | null => (v === 'sub' || v === 'dub' ? v : null);
  const rows = (v: unknown): Record<string, Dub> => {
    const out: Record<string, Dub> = {};
    for (const [k, val] of Object.entries((v ?? {}) as Record<string, unknown>)) {
      const d = one(val);
      if (d) out[foldTitle(k)] = d;
    }
    return out;
  };
  return {
    global: one(r.global) ?? DEFAULT_DUBS.global,
    categories: rows(r.categories),
    shows: rows(r.shows),
  };
}

/** Set a row. An empty title sets the global, a category sets that kind, otherwise that show. */
export function setDub(table: DubTable, want: Dub, title?: string, category?: string): DubTable {
  if (title?.trim()) return { ...table, shows: { ...table.shows, [foldTitle(title)]: want } };
  if (category?.trim()) return { ...table, categories: { ...table.categories, [category.trim().toLowerCase()]: want } };
  return { ...table, global: want };
}
