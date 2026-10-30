// His data, kept his (2026-10-26, his picks after three research rounds: reports/Privacy tools that keep browsing normal):
// Samara does what Brave does by default, with nothing for him to do and nothing that logs him out.
//  - Cookies from one site hidden inside another (third-party cookies) are dropped, the way Safari has done for
//    everyone since 2020. A site's own cookies, which keep him signed in, are never touched. Cookies a hidden site
//    keeps only for the page it sits in (Partitioned, CHIPS) still work: they cannot follow him anywhere.
//  - Sign-in, payment and "are you human" services that live inside other sites are let through, and so is any pair
//    of sites Samara has let through since (each one written in the privacy log).
//  - Every request says "do not sell or share my data" (Global Privacy Control), which California and other states
//    make binding.
//  - The tracking tags on links (fbclid, gclid and the like, Brave's and PrivacyTests' list) are taken off.
// Chromium's own switch (test-third-party-cookie-phaseout) blocks these cookies too, measured here 2026-10-26, but
// nothing can be let through with it (a granted requestStorageAccess still sent no cookie), so a sign-in it broke would
// stay broken. This way a sign-in can always be let through.
import path from 'node:path';
import type { Session } from 'electron';
import { getDomain } from 'tldts-experimental';
import { writeFileAtomic } from './atomic.ts';
import { readJson } from './store.ts';
import { openLog, type Log } from './log.ts';

/** A host's site (eTLD+1, the public suffix list's, the same Chromium uses), or the host itself (an IP, localhost). */
export function siteOfHost(host: string): string {
  const h = host.toLowerCase().replace(/\.$/, '');
  return getDomain(h, { allowPrivateDomains: true }) ?? h;
}
const siteOfUrl = (u: string): string | null => {
  try { const x = new URL(u); return /^https?:$/.test(x.protocol) ? siteOfHost(x.hostname) : null; } catch { return null; }
};

/**
 * Sites whose cookies work inside any page: signing in (Microsoft's own advice for Outlook and Teams, Apple), paying
 * (PayPal, Stripe's card checks) and the "are you human" boxes (Cloudflare, hCaptcha, reCAPTCHA below), which ask
 * him more questions without them. Google's sign-in is left out on purpose: its button opens its own window, where
 * Google is the page itself.
 */
const LET_THROUGH = new Set([
  'microsoftonline.com', 'live.com', 'microsoft.com', 'office.com', 'office365.com', 'office.net', 'sharepoint.com', 'msauth.net', 'msftauth.net',
  'microsoftazuread-sso.com', 'msidentity.com', 'skype.com', 'apple.com', 'icloud.com', 'paypal.com', 'paypalobjects.com', 'stripe.com', 'stripe.network',
  'cloudflare.com', 'hcaptcha.com', 'recaptcha.net',
]);
/**
 * One company's own sites inside each other (Edge's "organisation" rule, Chrome's related sites): Yandex's search
 * checks its own cookies across yandex.com, ya.ru and yastatic.net, and showed its robot check without them (measured
 * 2026-10-26, secret-search-check). Never another company's site inside these.
 */
const SAME_OWNER: string[][] = [
  ['yandex.com', 'yandex.ru', 'yandex.net', 'ya.ru', 'yastatic.net', 'yandex.by', 'yandex.kz', 'yandex.com.tr'],
  ['google.com', 'youtube.com', 'gstatic.com', 'googleapis.com', 'googleusercontent.com', 'ytimg.com', 'ggpht.com', 'googlevideo.com', 'youtube-nocookie.com'],
  ['netflix.com', 'nflxvideo.net', 'nflxext.com', 'nflxso.net', 'nflximg.net'],
  ['amazon.com', 'media-amazon.com', 'ssl-images-amazon.com'],              // never its ad network (amazon-adsystem.com)
  ['reddit.com', 'redd.it', 'redditstatic.com', 'redditmedia.com'],
  ['discord.com', 'discordapp.com', 'discord.gg', 'discordapp.net'],
  ['stremio.com', 'strem.io', 'strem.fun'],
  ['shadow.tech', 'shadow.com'],
  ['paypal.com', 'paypalobjects.com', 'venmo.com'],
];
const owner = new Map<string, number>();
SAME_OWNER.forEach((g, i) => { for (const site of g) owner.set(site, i); });
const sameOwner = (a: string, b: string) => owner.has(a) && owner.get(a) === owner.get(b);
/** reCAPTCHA on google.com: only its own path, not the rest of Google. */
const RECAPTCHA = /^https:\/\/www\.google\.com\/recaptcha\//;

/**
 * Tracking tags taken off a link before the page opens: every one PrivacyTests.org checks (2026-10-22 run) and
 * Brave's own list (brave-core query_filter). Only tags that never carry anything a page needs: utm_ tags stay
 * (Brave and Firefox keep them too; some sites read them for their own counting).
 */
export const TRACKING_TAGS = new Set([
  'fbclid', 'gclid', 'gclsrc', 'dclid', 'gbraid', 'wbraid', 'msclkid', 'mc_eid', 'mc_cid', 'yclid', 'ysclid', 'twclid', 'ttclid', 'igshid', 'igsh',
  'li_fat_id', 'epik', 'srsltid', '_hsenc', '_hsmi', '__hssc', '__hstc', '__hsfp', 'hsctatracking', 'mkt_tok', 'oly_anon_id', 'oly_enc_id', '_openstat',
  'vero_id', 'vero_conv', 'wickedid', '__s', 'rb_clickid', 's_cid', 'ml_subscriber', 'ml_subscriber_hash', 'ss_email_id', 'bsft_uid', 'bsft_clkid',
  'irclickid', 'sc_cid', 'oprtrack', 'trk_contact', 'trk_msg', 'trk_module', 'trk_sid', 'gdfms', 'gdftrk', 'gdffi', 'nr_email_referer', 'cvid', 'ef_id',
]);
/** A link without its tracking tags, or null when it has none. */
export function cleanLink(url: string): string | null {
  let u: URL;
  try { u = new URL(url); } catch { return null; }
  if (!/^https?:$/.test(u.protocol) || !u.search) return null;
  const drop = [...u.searchParams.keys()].filter((k) => TRACKING_TAGS.has(k.toLowerCase()));
  if (!drop.length) return null;
  for (const k of drop) u.searchParams.delete(k);
  return u.href;
}

/** One thing in the privacy log: what Samara did on its own, or what he reported from the shield. */
export interface PrivacyNote { at: string; kind: string; site: string; inside?: string; note?: string }

/**
 * The pairs of sites let through since (his rule: when a sign-in breaks, Samara lets it through by itself and writes it
 * down), and the privacy log Claude reads when he says "check the log" (privacy-log.jsonl, his ask 2026-10-26).
 */
export class CookieWall {
  private readonly file: string;
  private readonly log: Log;
  /** Hidden site → the pages it may keep cookies inside ('*' for every page). */
  private readonly pairs = new Map<string, Set<string>>();
  /** Off for one session (the PC's sync tests, Claude's own tabs never): everything passes as before. */
  on = true;
  /**
   * The names of each hidden site's cookies kept for one page only (Partitioned). A request carries all of a site's
   * cookies in one Cookie line, its kept-for-this-page ones mixed in, so these names are how they stay (measured).
   */
  private readonly kept = new Map<string, Set<string>>();
  private readonly keptFile: string;
  private keptSave: NodeJS.Timeout | null = null;
  constructor(dir: string) {
    this.file = path.join(dir, 'cookie-pass.json');
    this.keptFile = path.join(dir, 'cookie-kept-names.json');
    for (const [k, v] of Object.entries(readJson<Record<string, unknown>>(this.keptFile, {}))) if (Array.isArray(v)) this.kept.set(k, new Set(v.filter((x) => typeof x === 'string').slice(0, 50)));
    const log = path.join(dir, 'privacy-log.jsonl');
    this.log = openLog('privacy', log, { maxBytes: 1_000_000, old: log.replace(/\.jsonl$/, '.old.jsonl') });
    for (const [k, v] of Object.entries(readJson<Record<string, unknown>>(this.file, {}))) if (Array.isArray(v)) this.pairs.set(k, new Set(v.filter((x) => typeof x === 'string')));
  }
  /** May this hidden site keep its cookies inside this page? */
  passes(hiddenSite: string, pageSite: string, url: string): boolean {
    if (!this.on || LET_THROUGH.has(hiddenSite) || RECAPTCHA.test(url) || sameOwner(hiddenSite, pageSite)) return true;
    const p = this.pairs.get(hiddenSite);
    return !!p && (p.has(pageSite) || p.has('*'));
  }
  /** A hidden site set a cookie kept for this page only: its name is remembered so it is sent back. */
  keptName(site: string, name: string): void {
    const s = this.kept.get(site) ?? new Set<string>();
    if (s.has(name) || s.size >= 50) return;
    s.add(name); this.kept.set(site, s);
    if (this.kept.size > 2000) this.kept.delete(this.kept.keys().next().value!);
    if (!this.keptSave) this.keptSave = setTimeout(() => {
      this.keptSave = null;
      try { writeFileAtomic(this.keptFile, JSON.stringify(Object.fromEntries([...this.kept].map(([k, v]) => [k, [...v]])))); } catch { /* next time */ }
    }, 3000);
  }
  /** The part of a Cookie line a hidden site may still have: only its kept-for-this-page cookies. */
  keptOnly(site: string, line: string): string {
    const names = this.kept.get(site);
    if (!names) return '';
    return line.split(/;\s*/).filter((p) => names.has(p.split('=')[0]!.trim())).join('; ');
  }
  /** Let one hidden site through inside one page, written down with why. */
  letThrough(hiddenSite: string, pageSite: string, why: string): void {
    const s = this.pairs.get(hiddenSite) ?? new Set<string>();
    if (s.has(pageSite)) return;
    s.add(pageSite); this.pairs.set(hiddenSite, s);
    try { writeFileAtomic(this.file, JSON.stringify(Object.fromEntries([...this.pairs].map(([k, v]) => [k, [...v]])), null, 1)); } catch { /* kept until the next start */ }
    this.note({ kind: 'cookies-let-through', site: hiddenSite, inside: pageSite, note: why });
  }
  /** Undo one (from the shield or Settings). */
  takeBack(hiddenSite: string, pageSite: string): void {
    const s = this.pairs.get(hiddenSite);
    if (!s?.delete(pageSite)) return;
    if (!s.size) this.pairs.delete(hiddenSite);
    try { writeFileAtomic(this.file, JSON.stringify(Object.fromEntries([...this.pairs].map(([k, v]) => [k, [...v]])), null, 1)); } catch { /* next time */ }
    this.note({ kind: 'cookies-blocked-again', site: hiddenSite, inside: pageSite });
  }
  /** One line in the privacy log, kept to about 1 MB (the older half goes to privacy-log.old.jsonl). */
  note(n: Omit<PrivacyNote, 'at'>): void {
    this.log.json({ at: new Date().toISOString(), ...n });   // the log is a help, never in the way: it never throws
  }
}

/** The page a request is for (its top frame), when it comes from a page at all. */
function pageOf(d: { frame?: Electron.WebFrameMain | null; webContents?: Electron.WebContents }): string | null {
  try { const t = d.frame?.top?.url; if (t) return t; } catch { /* the frame is gone */ }
  try { return d.webContents?.getURL() || null; } catch { return null; }
}
/** Is this request from a hidden site inside the page (third party)? Its site and the page's when it is. */
function hidden(d: { url: string; resourceType?: string; frame?: Electron.WebFrameMain | null; webContents?: Electron.WebContents }): { site: string; page: string } | null {
  if (d.resourceType === 'mainFrame' || !d.webContents) return null;          // the page itself; a service worker's own
  const page = pageOf(d); if (!page) return null;
  const ps = siteOfUrl(page), rs = siteOfUrl(d.url);
  return ps && rs && ps !== rs ? { site: rs, page: ps } : null;
}

/** A box inside the page that is someone's sign-in (Microsoft's in Outlook, a shop's "log in with"): let through by itself. */
const SIGN_IN = /^https:\/\/(login|logon|signin|sign-in|auth|sso|id|account|accounts|secure)\.|\/(login|logon|signin|sign-in|oauth2?|sso|saml|authorize|auth)(\/|\?|$)/i;
/** Hidden sites' cookies, dropped or let through, for one request (true: dropped). */
function drops(wall: CookieWall, d: { url: string; resourceType?: string; frame?: Electron.WebFrameMain | null; webContents?: Electron.WebContents }): boolean {
  const x = hidden(d);
  if (!x || wall.passes(x.site, x.page, d.url)) return false;
  if (d.resourceType === 'subFrame' && SIGN_IN.test(d.url)) { wall.letThrough(x.site, x.page, 'a sign-in box inside the page'); return false; }
  return true;
}

/**
 * The session's one before-send hook (Electron keeps one per session): the honest name for the sites that need it
 * (browser.ts), the privacy signal, and hidden sites' cookies left off.
 */
export function guardPrivacy(ses: Session, wall: CookieWall, name: (url: string) => string | null, brands: () => string | null): void {
  ses.webRequest.onBeforeSendHeaders({ urls: ['<all_urls>'] }, (d, cb) => {
    const h = d.requestHeaders;
    if (/^https?:/.test(d.url)) {
      const ua = name(d.url); if (ua) h['User-Agent'] = ua;
      // Blending in (2026-10-26, measured): Electron never sends the three browser hints Chrome sends with every secure
      // request, while its pages read them all the same (navigator.userAgentData). A browser calling itself Chrome
      // without them stands out. The same words the page reads, sent the way Chromium sends them.
      const b = !ua && d.url.startsWith('https:') ? brands() : null;
      if (b && !Object.keys(h).some((k) => k.toLowerCase() === 'sec-ch-ua')) {
        h['sec-ch-ua'] = b; h['sec-ch-ua-mobile'] = '?0';
        h['sec-ch-ua-platform'] = process.platform === 'darwin' ? '"macOS"' : process.platform === 'win32' ? '"Windows"' : '"Linux"';
      }
      h['Sec-GPC'] = '1';
      if (drops(wall, d)) {
        const site = siteOfUrl(d.url) ?? '';
        for (const k of Object.keys(h)) {
          if (k.toLowerCase() !== 'cookie') continue;
          const left = wall.keptOnly(site, h[k]!);
          if (left) h[k] = left; else delete h[k];
        }
      }
    }
    cb({ requestHeaders: h });
  });
}
/**
 * For the session's one on-headers hook (ads.ts guardRequests, shared with the ad blocker): a hidden site's new cookies
 * dropped, except ones kept for this page only (Partitioned), which cannot follow him. Null: nothing to change.
 */
export function cookieHeaders(wall: CookieWall): (d: Electron.OnHeadersReceivedListenerDetails) => Record<string, string[]> | null {
  return (d) => {
    if (!d.responseHeaders || !drops(wall, d)) return null;
    const out = { ...d.responseHeaders };
    let changed = false;
    for (const k of Object.keys(out)) {
      if (k.toLowerCase() !== 'set-cookie') continue;
      const keep = out[k]!.filter((c) => /;\s*partitioned\b/i.test(c));
      for (const c of keep) wall.keptName(siteOfUrl(d.url) ?? '', c.split('=')[0]!.trim());
      if (keep.length !== out[k]!.length) { changed = true; if (keep.length) out[k] = keep; else delete out[k]; }
    }
    return changed ? out : null;
  };
}
