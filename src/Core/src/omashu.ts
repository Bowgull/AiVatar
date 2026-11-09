// The phone fire remote for Omashu (his couch laptop), the parts with no network in them: so they are tested for free.
// The service around them is omashuremote.ts; the page is assets/omashu/remote.html. The laptop side (Couch Mode) is
// described in the omashu repo, reports/phone-remote-contract.md, and faked in test/fakes/omashulaptop.ts.

// ------------------------------------------------------------------ waking the laptop

/** "AA:BB:CC:DD:EE:FF", "aa-bb-..." or "aabbccddeeff" -> 6 bytes, or null when it is not a MAC address. */
export function macBytes(mac: string): Buffer | null {
  const hex = String(mac ?? '').replace(/[:\-.\s]/g, '');
  return /^[0-9a-fA-F]{12}$/.test(hex) ? Buffer.from(hex, 'hex') : null;
}

/** The Wake-on-LAN magic packet: six 0xFF, then the MAC address sixteen times (102 bytes). */
export function magicPacket(mac: string): Buffer {
  const m = macBytes(mac);
  if (!m) throw new Error('not a MAC address');
  return Buffer.concat([Buffer.alloc(6, 0xff), ...Array.from({ length: 16 }, () => m)]);
}

// ------------------------------------------------------------------ who may use it

/** Home Wi-Fi only: loopback and the private LAN ranges. Tailscale (100.64/10) and anything public are refused. */
export function isHomeAddress(raw: string): boolean {
  const ip = String(raw ?? '').replace(/^::ffff:/i, '');
  if (ip === '::1') return true;
  const v4 = ip.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (v4) {
    const [a, b] = [Number(v4[1]), Number(v4[2])];
    return a === 127 || a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
  }
  return /^fe[89ab][0-9a-f]:/i.test(ip) || /^f[cd][0-9a-f]{2}:/i.test(ip);   // link-local, unique local
}

// ------------------------------------------------------------------ reading WoW's chat log

export type LinkKind = 'item' | 'quest' | 'spell' | 'unknown';
export type Seg = { s: string } | { link: LinkKind; name: string; id?: number; q?: number };
export type ChatKind = 'say' | 'yell' | 'whisper' | 'whisper-out' | 'guild' | 'officer' | 'party' | 'raid' | 'channel' | 'system';
export interface ChatLine {
  seq: number;
  /** "7:41", as the mockup shows it. */
  t: string;
  kind: ChatKind;
  /** Numbered channels: the number and the name ("General", "Trade", "LookingForGroup"). */
  chan?: { num: number; name: string };
  /** The full name as WoW wrote it (may carry "-Realm"), for whispers and the name menu. */
  who?: string;
  text: Seg[];
}

const QUALITY: Record<string, number> = { '9d9d9d': 0, 'ffffff': 1, '1eff00': 2, '0070dd': 3, 'a335ee': 4, 'ff8000': 5, 'e6cc80': 6, '00ccff': 7 };

/** A message's text: link codes become links, bare [Names] become links to look up by name, other codes are dropped. */
export function segments(text: string): Seg[] {
  // player links become plain names; textures, atlas icons and colours that wrap no link go away
  let s = text.replace(/\|Hplayer:[^|]*\|h\[?([^\]|]*)\]?\|h/g, '$1').replace(/\|T[^|]*\|t/g, '').replace(/\|A[^|]*\|a/g, '');
  const out: Seg[] = [];
  const re = /(?:\|c[fF]{2}([0-9a-fA-F]{6}))?\|H(item|quest|spell|enchant|trade|talent|achievement):(\d+)[^|]*\|h\[([^\]]{1,120})\]\|h(?:\|r)?|\[([^\][|]{2,80})\]/g;
  let last = 0;
  const push = (t: string) => {
    const clean = t.replace(/\|c[0-9a-fA-F]{8}/g, '').replace(/\|r/g, '');
    if (!clean) return;
    const prev = out[out.length - 1];
    if (prev && 's' in prev) prev.s += clean; else out.push({ s: clean });
  };
  for (const m of s.matchAll(re)) {
    push(s.slice(last, m.index));
    last = m.index! + m[0].length;
    if (m[2]) {
      const k = m[2] === 'item' || m[2] === 'quest' ? m[2] : m[2] === 'achievement' ? 'unknown' : 'spell';
      const q = m[1] ? QUALITY[m[1].toLowerCase()] : undefined;
      out.push({ link: k as LinkKind, name: m[4], id: Number(m[3]), ...(q !== undefined && k === 'item' ? { q } : {}) });
    } else out.push({ link: 'unknown', name: m[5] });
  }
  push(s.slice(last));
  return out;
}

const PREFIX: Record<string, ChatKind> = {
  guild: 'guild', officer: 'officer', party: 'party', 'party leader': 'party', instance: 'party', 'instance leader': 'party',
  raid: 'raid', 'raid leader': 'raid', 'raid warning': 'raid',
};
// WoW: Forever names are two words ("Gideon Byrne"); one-word names (and "-Realm") still read.
const NAME = String.raw`\[?([^\s:\[\]|]{2,48}(?: [^\s:\[\]|]{2,48})?)\]?`;

/** One line of WoWChatLog.txt -> a chat line, or null for a blank one. Anything not recognised is a system line. */
export function parseChatLine(raw: string, seq: number): ChatLine | null {
  const line = String(raw ?? '').replace(/[\r\n]+$/, '');
  if (!line.trim()) return null;
  const head = line.match(/^(\d{1,2})\/(\d{1,2})(?:\/\d{2,4})?\s+(\d{1,2}):(\d{2}):\d{2}(?:\.\d+)?\s+(.*)$/);
  const body = head ? head[5] : line;
  const t = head ? `${(Number(head[3]) % 12) || 12}:${head[4]}` : '';
  // player links first, so names are plain from here on
  const b = body.replace(/\|Hplayer:([^:|]*)[^|]*\|h\[?[^\]|]*\]?\|h/g, '$1');
  let m: RegExpMatchArray | null;
  if ((m = b.match(new RegExp(String.raw`^\[(\d{1,2})\. ([^\]]+?)(?: - [^\]]*)?\] ${NAME}: (.*)$`))))
    return { seq, t, kind: 'channel', chan: { num: Number(m[1]), name: m[2] }, who: m[3], text: segments(m[4]) };
  if ((m = b.match(new RegExp(String.raw`^\[([A-Za-z ]+)\] ${NAME}: (.*)$`))) && PREFIX[m[1].toLowerCase()])
    return { seq, t, kind: PREFIX[m[1].toLowerCase()], who: m[2], text: segments(m[3]) };
  if ((m = b.match(new RegExp(String.raw`^${NAME} whispers: (.*)$`)))) return { seq, t, kind: 'whisper', who: m[1], text: segments(m[2]) };
  if ((m = b.match(new RegExp(String.raw`^To ${NAME}: (.*)$`)))) return { seq, t, kind: 'whisper-out', who: m[1], text: segments(m[2]) };
  if ((m = b.match(new RegExp(String.raw`^${NAME} (says|yells): (.*)$`)))) return { seq, t, kind: m[2] === 'says' ? 'say' : 'yell', who: m[1], text: segments(m[3]) };
  return { seq, t, kind: 'system', text: segments(b) };
}

// ------------------------------------------------------------------ sending: only what he approved

/** What the phone may ask for. Each becomes exactly one chat command; nothing else can be built. */
export type SendAsk =
  | { to: 'say' | 'guild' | 'party'; text: string }
  | { to: 'channel'; num: number; text: string }
  | { to: 'whisper'; name: string; text: string }
  | { act: 'invite' | 'friend' | 'ignore' | 'who'; name: string }
  | { act: Emote; name?: string }
  | { act: 'roll' };

/**
 * The emotes on the phone (sheet 07): the tray's seven (Roll is its own command), then More's five groups of eight.
 * Each is the tile's name in lower case with no spaces. Couch Mode lists the same ones.
 */
export const EMOTES = [
  'wave', 'hello', 'cheer', 'thank', 'bow', 'dance', 'laugh',
  'hug', 'salute', 'welcome', 'applaud', 'clap', 'congratulate', 'bye', 'kneel',
  'chicken', 'flex', 'train', 'silly', 'roar', 'violin', 'rofl', 'flirt',
  'ready', 'followme', 'charge', 'wait', 'oom', 'healme', 'helpme', 'incoming',
  'cry', 'sigh', 'shrug', 'yawn', 'sleep', 'cower', 'blush', 'sad',
  'rude', 'spit', 'taunt', 'threaten', 'gloat', 'mock', 'moon', 'fart',
] as const;
export type Emote = typeof EMOTES[number];

/** The allow-list, word for word the one in the contract (Couch Mode checks the same lines again before typing). */
const TEXT = String.raw`(?!/)[^|\r\n\x00-\x1f]{1,255}`;
/** One word of a name. WoW: Forever names are two words, and WoW reads the first two words of "/w" as the name. */
const WORD = String.raw`[^\s/|\\]{2,24}`;
const NAME2 = `${WORD} ${WORD}`, NAME12 = `${WORD}( ${WORD})?`;
export const ALLOWED: RegExp[] = [
  new RegExp(String.raw`^/(s|g|p) ${TEXT}$`),
  new RegExp(String.raw`^/[1-9] ${TEXT}$`),
  new RegExp(String.raw`^/w ${NAME2} ${TEXT}$`),
  new RegExp(String.raw`^/(invite|friend|ignore|who) ${NAME12}$`),
  /^\/roll$/,
  new RegExp(String.raw`^/(${EMOTES.join('|')})( ${NAME12})?$`),
];
export const allowed = (line: string) => typeof line === 'string' && line.length <= 255 && ALLOWED.some(r => r.test(line));

/** Dictation and typing tidied: one line, no control characters, outer spaces gone. */
export const tidy = (text: string) => String(text ?? '').replace(/[\r\n\t]+/g, ' ').replace(/[\x00-\x1f\x7f]/g, '').replace(/\s{2,}/g, ' ').trim();

/** The chat command for an ask, or null when it is not one he approved (or the text could not be sent as is). */
export function buildLine(a: SendAsk): string | null {
  if (!a || typeof a !== 'object') return null;
  // a whisper name is exactly two words: WoW takes the first two words as the name, so "Bujuju" alone would whisper
  // "Bujuju <first word>" the rest; the other commands take one or two
  const emote = 'act' in a && (EMOTES as readonly string[]).includes(a.act);
  // a name is checked whenever one is needed or given (an emote may go without one)
  const name = 'name' in a ? a.name : undefined;
  const needs = 'to' in a ? a.to === 'whisper' : !emote && a.act !== 'roll';
  if ((needs || name !== undefined) && !new RegExp(`^(${'to' in a ? NAME2 : NAME12})$`).test(String(name ?? ''))) return null;
  let line: string;
  if ('act' in a) {
    if (a.act === 'roll') { if (name !== undefined) return null; line = '/roll'; }
    else if (emote) line = name !== undefined ? `/${a.act} ${name}` : `/${a.act}`;
    else if (['invite', 'friend', 'ignore', 'who'].includes(a.act)) line = `/${a.act} ${name}`;
    else return null;
  } else {
    const text = tidy(a.text);
    if (a.to === 'say' || a.to === 'guild' || a.to === 'party') line = `/${a.to[0]} ${text}`;
    else if (a.to === 'channel' && Number.isInteger(a.num) && a.num >= 1 && a.num <= 9) line = `/${a.num} ${text}`;
    else if (a.to === 'whisper') line = `/w ${a.name} ${text}`;
    else return null;
  }
  return allowed(line) ? line : null;
}

// ------------------------------------------------------------------ tooltips

export interface TipLine { l: string; r?: string; c?: string }

const ENT: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
const decode = (s: string) => s.replace(/&(#\d+|#x[0-9a-f]+|[a-z]+);/gi, (all, e: string) =>
  e[0] === '#' ? String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : Number(e.slice(1))) : ENT[e.toLowerCase()] ?? all);

/**
 * Wowhead's tooltip HTML -> plain lines with a colour each (q0..q7 quality, "q" gold), and a right-hand part where the
 * game shows two columns ("Hands ... Cloth"). Nothing of the HTML reaches the phone: it only ever gets text.
 */
export function tooltipLines(html: string): TipLine[] {
  const s = String(html ?? '').replace(/<!--[\s\S]*?-->/g, '').replace(/<(script|style)[\s\S]*?<\/\1>/gi, '');
  const out: TipLine[] = [];
  const stack: (string | null)[] = [];          // the class of each open span/b/a, innermost last
  let l = '', r: string | null = null, c: string | undefined;
  const flush = () => {
    const ll = decode(l).replace(/\s+/g, ' ').trim(), rr = r === null ? '' : decode(r).replace(/\s+/g, ' ').trim();
    if ((ll || rr) && out.length < 40) out.push({ l: ll, ...(rr ? { r: rr } : {}), ...(c ? { c } : {}) });
    l = ''; r = null; c = undefined;
  };
  for (const m of s.matchAll(/<(\/?)([a-z0-9]+)([^>]*)>|([^<]+)/gi)) {
    if (m[4] !== undefined) {
      if (!m[4].trim() && !(r ?? l)) continue;
      const inner = [...stack].reverse().find(x => x) ?? undefined;
      if (!(l + (r ?? '')).trim() && m[4].trim() && inner?.startsWith('q')) c = inner;
      const coin = { moneygold: 'g', moneysilver: 's', moneycopper: 'c' }[stack[stack.length - 1] ?? ''] ?? '';
      if (r !== null) r += m[4] + coin; else l += m[4] + coin;
      continue;
    }
    const close = m[1] === '/', tag = m[2].toLowerCase();
    if (tag === 'br' || tag === 'tr' && close || tag === 'table' || tag === 'div' && close) { flush(); continue; }
    if (tag === 'th' && !close) { r = ''; continue; }
    if (tag === 'span' || tag === 'b' || tag === 'a') {
      if (close) stack.pop(); else stack.push(/class="(q\d?|money(?:gold|silver|copper))"/i.exec(m[3])?.[1] ?? null);
    }
  }
  flush();
  return out;
}
