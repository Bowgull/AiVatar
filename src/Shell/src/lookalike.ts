// 6.22, the last piece: an address dressed up as a site he really uses. The phishing lists only know fakes that
// someone has already reported; a brand-new "b1izzard.com" is on no list yet. This catches the shape instead.
//
// Three tricks, each checked against a short list of the sites that matter to him (his game, his work, his money):
//   1. the real name used as a label in front of someone else's domain: www.youtube.com.evil.test
//   2. foreign letters that look like ours: "xn--" addresses whose letters fold back to a real name
//   3. a name one or two keystrokes off, or with 1 for l, 0 for o, rn for m: b1izzard.com, battle-net.com
// Never a guess about anything else: an ordinary site that resembles nothing on the list is left alone.
import { domainToUnicode } from 'node:url';

/** The sites worth protecting: where his logins, his game and his money are. */
export const PROTECTED = [
  'blizzard.com', 'battle.net', 'worldofwarcraft.com', 'wowhead.com', 'curseforge.com', 'warcraftlogs.com',
  'google.com', 'gmail.com', 'youtube.com', 'twitch.tv', 'discord.com', 'github.com', 'anthropic.com', 'claude.ai',
  'linkedin.com', 'indeed.com', 'indeed.ca', 'greenhouse.io', 'lever.co', 'workday.com',
  'paypal.com', 'amazon.com', 'amazon.ca', 'apple.com', 'icloud.com', 'microsoft.com', 'live.com', 'outlook.com',
  'steampowered.com', 'steamcommunity.com', 'ea.com', 'epicgames.com', 'crunchyroll.com', 'netflix.com', 'bitwarden.com',
  'rbc.com', 'rbcroyalbank.com', 'td.com', 'tdbank.com', 'scotiabank.com', 'bmo.com', 'cibc.com', 'tangerine.ca',
  'wealthsimple.com', 'canada.ca', 'interac.ca',
];

/** Two-part endings, so "something.co.uk" counts as one site. Short on purpose: his sites are .com, .ca and .net. */
const TWO_PART = new Set(['co.uk', 'com.au', 'co.jp', 'com.br', 'co.nz', 'org.uk', 'qc.ca', 'on.ca']);

/** The site a host belongs to: the last two labels, or three for a two-part ending. */
export function siteOf(host: string): string {
  const parts = host.toLowerCase().replace(/\.$/, '').split('.');
  if (parts.length <= 2) return parts.join('.');
  const last2 = parts.slice(-2).join('.');
  return TWO_PART.has(last2) ? parts.slice(-3).join('.') : last2;
}

/** Letters from other alphabets that look like ours, folded to the ASCII letter they impersonate. */
const CONFUSABLE: Record<string, string> = {
  'а': 'a', 'е': 'e', 'о': 'o', 'р': 'p', 'с': 'c', 'х': 'x', 'у': 'y', 'і': 'i', 'ј': 'j', 'ѕ': 's', 'ԁ': 'd', 'ӏ': 'l', 'һ': 'h', 'ԛ': 'q', 'ԝ': 'w',
  'α': 'a', 'ο': 'o', 'ρ': 'p', 'ν': 'v', 'τ': 't', 'ι': 'i', 'κ': 'k', 'χ': 'x', 'ɡ': 'g', 'ɩ': 'l', 'ı': 'i', 'ł': 'l', 'ø': 'o', 'ß': 'b',
  'à': 'a', 'á': 'a', 'â': 'a', 'ä': 'a', 'å': 'a', 'è': 'e', 'é': 'e', 'ê': 'e', 'ë': 'e', 'ì': 'i', 'í': 'i', 'î': 'i', 'ï': 'i',
  'ò': 'o', 'ó': 'o', 'ô': 'o', 'ö': 'o', 'ù': 'u', 'ú': 'u', 'û': 'u', 'ü': 'u', 'ñ': 'n', 'ç': 'c', 'ý': 'y',
};

/** The name with the usual disguises taken off: foreign look-alikes, 1→l, 0→o, rn→m, vv→w, hyphens dropped. */
export function skeleton(name: string): string {
  let s = [...name.toLowerCase()].map((ch) => CONFUSABLE[ch] ?? ch).join('');
  s = s.replace(/rn/g, 'm').replace(/vv/g, 'w').replace(/[1|!]/g, 'l').replace(/0/g, 'o').replace(/3/g, 'e').replace(/5/g, 's').replace(/-/g, '');
  return s;
}

/** How many single-letter changes turn a into b (insert, delete, swap one letter). */
export function distance(a: string, b: string): number {
  if (Math.abs(a.length - b.length) > 2) return 3;
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0]![j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++)
      d[i]![j] = Math.min(d[i - 1]![j]! + 1, d[i]![j - 1]! + 1, d[i - 1]![j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length]![b.length]!;
}

const nameOf = (site: string) => site.split('.')[0] ?? site;

/** The real site this address is pretending to be, or null when it is not pretending (or is the real one). */
export function lookalike(url: string, protectedSites: readonly string[] = PROTECTED): string | null {
  let host: string;
  try { host = new URL(url).hostname.toLowerCase(); } catch { return null; }
  if (!host || /^\d+\.\d+\.\d+\.\d+$/.test(host) || host === 'localhost') return null;
  const site = siteOf(host);
  // The real thing, or one of its own subdomains: fine.
  if (protectedSites.includes(site)) return null;

  // 1. The real name worn in front of someone else's domain: youtube.com.evil.test, login-paypal.com.x.io
  const front = host.slice(0, Math.max(0, host.length - site.length - 1));
  for (const real of protectedSites) if (front === real || front.endsWith('.' + real) || front.includes(real + '.') || front.endsWith('-' + real)) return real;

  // 2 and 3. The site's own name in disguise, or a keystroke or two away from a real one.
  const shown = domainToUnicode(site) || site;
  const plain = nameOf(site);
  const ours = skeleton(nameOf(shown));
  // The same brand on another country's ending (google.ca, amazon.co.uk) is the brand, not a fake.
  if (!site.includes('xn--') && protectedSites.some((r) => nameOf(r) === plain)) return null;
  for (const real of protectedSites) {
    const want = nameOf(real);
    if (want.length < 4) continue;                       // "td", "ea", "bmo": too short to judge by spelling
    if (ours === want) return real;                      // a disguise that folds straight back to the real name
    if (ours === real.replace(/\./g, '')) return real;   // the whole address run together: battle-net.com, battlenet.com
    // One keystroke off only for longer names (gmail/email would collide), two only for long ones.
    const far = distance(ours, want);
    if ((far === 1 && want.length >= 6) || (far === 2 && want.length >= 9)) return real;
  }
  // Foreign letters on a site we do not otherwise know: not judged here (many real sites use them).
  return null;
}
