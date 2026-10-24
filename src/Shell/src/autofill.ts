// Autofill, sheet 77 (his interview, 2026-10-23): the light that brings what fits a box, the address bar key that is the
// lock, a 4-digit PIN, and saving a new login after a look at it.
//
// SAFETY, the whole design:
//  - Nothing is put into the page until he says so (a click on the light, or Tab while it shows). The light is Samara's
//    own layer over the page, never part of it, so a site cannot read what it offers.
//  - The PIN is typed while the address bar asks for it, and Samara takes those keys before the page gets them.
//  - The PIN opens Bitwarden's session key, which is kept sealed twice: with a key made from the PIN (scrypt, slow on
//    purpose) and then with the Mac's own Keychain (the Windows equivalent on the PC), which only opens while he is
//    logged into his computer. Five wrong PINs and the seal is gone: the master password again, as on a new computer.
//  - His details (name, emails, phone, address) are kept sealed with the Keychain too, and travel only to his other
//    machine over his own link, never anywhere else.
import { createCipheriv, createDecipheriv, randomBytes, scrypt as scryptCb, timingSafeEqual } from 'node:crypto';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { writeFileAtomic } from './atomic.ts';

/** His PIN is 4 to 8 numbers, his pick (sheet 83, 2026-10-23); PINs set before then are 4. */
export const PIN_MIN = 4;
export const PIN_MAX = 8;
export const PIN_TRIES = 5;

/** `name` is his whole name, made from `given` and `family` (two boxes since sheet 83 v3; an old single name is split once). */
export interface Details { name: string; given: string; family: string; emails: string[]; phone: string; street: string; city: string; region: string; postal: string; country: string }
export const NO_DETAILS: Details = { name: '', given: '', family: '', emails: [], phone: '', street: '', city: '', region: '', postal: '', country: '' };

/** What a box is for, as the page's own hints tell it (autocomplete, type, name, id, label). */
export type FieldKind = 'email' | 'username' | 'password' | 'newpassword' | 'name' | 'given' | 'family' | 'tel' | 'street' | 'city' | 'region' | 'postal' | 'country';
export const DETAIL_KINDS: FieldKind[] = ['email', 'name', 'given', 'family', 'tel', 'street', 'city', 'region', 'postal', 'country'];

const clip = (v: unknown, n: number) => String(v ?? '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, n);
/** His phone, tidied (sheet 83 v4): 10 numbers read (416) 555-0142, 11 starting with 1 get +1 in front; anything else
 *  (another country's number) is kept as he typed it. */
export function tidyPhone(v: string): string {
  const d = v.replace(/\D/g, '');
  const n = d.length === 11 && d[0] === '1' ? d.slice(1) : d;
  if (n.length !== 10) return v.trim();
  return `${d.length === 11 ? '+1 ' : ''}(${n.slice(0, 3)}) ${n.slice(3, 6)}-${n.slice(6)}`;
}
/** His details as they may be kept: plain short text only, at most five emails that look like emails. */
export function cleanDetails(d: unknown): Details {
  const o = (d && typeof d === 'object' ? d : {}) as Record<string, unknown>;
  const emails = (Array.isArray(o.emails) ? o.emails : []).map((e) => clip(e, 200)).filter((e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e));
  let given = clip(o.given, 60), family = clip(o.family, 60);
  if (!given && !family) { const [g = '', ...rest] = clip(o.name, 120).split(/\s+/); given = g; family = rest.join(' '); }
  return { name: [given, family].filter(Boolean).join(' '), given, family, emails: [...new Set(emails)].slice(0, 5), phone: tidyPhone(clip(o.phone, 40)), street: clip(o.street, 200), city: clip(o.city, 100),
    region: clip(o.region, 100), postal: clip(o.postal, 20), country: clip(o.country, 80) };
}
/** The value his details give a kind of box ('' when none). */
export function detailFor(d: Details, kind: FieldKind, email = 0): string {
  switch (kind) {
    case 'email': return d.emails[email] ?? '';
    case 'name': return d.name;
    case 'given': return d.given;
    case 'family': return d.family;
    case 'tel': return d.phone;
    case 'street': return d.street;
    case 'city': return d.city;
    case 'region': return d.region;
    case 'postal': return d.postal;
    case 'country': return d.country;
    default: return '';
  }
}

/** Sealed with the Keychain; null when this machine cannot (then nothing is kept). */
// The Keychain, reached only when needed (so the plain parts of this file can be tested without Electron).
const keychain = (): Electron.SafeStorage | null => { try { return (createRequire(import.meta.url)('electron') as typeof Electron).safeStorage ?? null; } catch { return null; } };
const lockText = (s: string): string | null => { try { const k = keychain(); return k?.isEncryptionAvailable() ? k.encryptString(s).toString('base64') : null; } catch { return null; } };
const openText = (b64: string): string | null => { try { return keychain()?.decryptString(Buffer.from(b64, 'base64')) ?? null; } catch { return null; } };

export class DetailsStore {
  private d: Details = { ...NO_DETAILS };
  private readonly file: string;
  constructor(file: string) {
    this.file = file;
    try { const j = JSON.parse(readFileSync(file, 'utf8')); const t = typeof j?.sealed === 'string' ? openText(j.sealed) : null; if (t) this.d = cleanDetails(JSON.parse(t)); } catch { /* none yet */ }
  }
  get(): Details { return { ...this.d, emails: [...this.d.emails] }; }
  set(d: unknown): Details {
    this.d = cleanDetails(d);
    const sealed = lockText(JSON.stringify(this.d));
    if (sealed) { try { writeFileAtomic(this.file, JSON.stringify({ v: 1, sealed })); } catch (e) { console.error('shell: your details were not saved: ' + (e as Error).message); } }
    return this.get();
  }
  empty(): boolean { const d = this.d; return !d.emails.length && !d.given && !d.family && !d.phone && !d.street; }
}

// Modest on purpose: a 4-digit PIN is only ever 10,000 guesses, so the Keychain around it is the real lock; this keeps
// the unlock quick on his slow Mac (~25 ms) instead of half a second.
const scrypt = (pin: string, salt: Buffer) => new Promise<Buffer>((res, rej) => scryptCb(pin, salt, 32, { N: 1 << 12, r: 8, p: 1, maxmem: 32 * 1024 * 1024 }, (e, k) => (e ? rej(e) : res(k))));
export const pinOk = (pin: string) => new RegExp(`^[0-9]{${PIN_MIN},${PIN_MAX}}$`).test(pin);

/** Bitwarden's session key, sealed with his PIN and then the Keychain. */
export class PinSeal {
  private readonly file: string;
  private len: number | null = null;   // how many numbers his PIN has (read once, so typing it never waits on the Keychain)
  constructor(file: string) { this.file = file; }
  private read(): { salt: string; iv: string; tag: string; ct: string; check: string; tries: number; len?: number } | null {
    try { const j = JSON.parse(readFileSync(this.file, 'utf8')); const t = typeof j?.sealed === 'string' ? openText(j.sealed) : null; return t ? JSON.parse(t) : null; } catch { return null; }
  }
  /** How many numbers his PIN has (4 for one set before he could choose). */
  length(): number {
    if (this.len === null) { const n = this.read()?.len; this.len = typeof n === 'number' && n >= PIN_MIN && n <= PIN_MAX ? n : PIN_MIN; }
    return this.len;
  }
  private write(o: object): boolean { const s = lockText(JSON.stringify(o)); if (!s) return false; try { writeFileAtomic(this.file, JSON.stringify({ v: 1, sealed: s })); return true; } catch { return false; } }
  has(): boolean { return existsSync(this.file) && this.read() !== null; }
  /** False when this machine cannot keep it safely (no Keychain), or the PIN is not 4 digits. */
  async seal(pin: string, session: string): Promise<boolean> {
    if (!pinOk(pin) || !session) return false;
    const salt = randomBytes(16), iv = randomBytes(12), key = await scrypt(pin, salt);
    const c = createCipheriv('aes-256-gcm', key, iv);
    const ct = Buffer.concat([c.update(session, 'utf8'), c.final()]);
    this.len = pin.length;
    return this.write({ salt: salt.toString('base64'), iv: iv.toString('base64'), tag: c.getAuthTag().toString('base64'), ct: ct.toString('base64'), check: 'v1', tries: 0, len: pin.length });
  }
  /** The session for the right PIN; 'wrong' with the tries left; 'gone' after the last wrong one (the seal is wiped). */
  async open(pin: string): Promise<{ session: string } | { wrong: number } | 'gone'> {
    const s = this.read();
    if (!s) return 'gone';
    if (pinOk(pin)) {
      try {
        const key = await scrypt(pin, Buffer.from(s.salt, 'base64'));
        const d = createDecipheriv('aes-256-gcm', key, Buffer.from(s.iv, 'base64'));
        d.setAuthTag(Buffer.from(s.tag, 'base64'));
        const session = Buffer.concat([d.update(Buffer.from(s.ct, 'base64')), d.final()]).toString('utf8');
        if (s.tries) this.write({ ...s, tries: 0 });
        return { session };
      } catch { /* wrong PIN: the tag does not match */ }
    }
    const tries = (s.tries | 0) + 1;
    if (tries >= PIN_TRIES) { this.wipe(); return 'gone'; }
    this.write({ ...s, tries });
    return { wrong: PIN_TRIES - tries };
  }
  wipe(): void { this.len = null; try { rmSync(this.file, { force: true }); } catch { /* gone */ } }
}
/** Two PINs typed the same, without telling anyone how long the match took. */
export const samePin = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

/** What kind of box an input is, from the page's own hints. The SAME function is in tabpreload.cjs (which cannot import
 *  anything); test/autofill.test.ts checks the two never drift apart. */
export const FIELD_KIND_JS = String.raw`function fieldKind(el) {
  if (!el || (el.tagName !== 'INPUT' && el.tagName !== 'SELECT') || el.disabled || el.readOnly) return null;
  const t = (el.type || 'text').toLowerCase();
  if (['hidden', 'submit', 'button', 'checkbox', 'radio', 'file', 'image', 'reset', 'range', 'color', 'date', 'number', 'search', 'month', 'week', 'time', 'datetime-local'].includes(t)) return null;
  const ac = (el.getAttribute('autocomplete') || '').toLowerCase().split(/\s+/);
  const has = (w) => ac.includes(w);
  if (has('off') && t !== 'password' && t !== 'email') return null;
  if (t === 'password') return has('new-password') ? 'newpassword' : 'password';
  if (has('one-time-code') || has('cc-number') || has('cc-csc')) return null;
  if (has('username')) return 'username';
  if (t === 'email' || has('email')) return 'email';
  if (has('name')) return 'name';
  if (has('given-name')) return 'given';
  if (has('family-name')) return 'family';
  if (t === 'tel' || has('tel')) return 'tel';
  if (has('street-address') || has('address-line1')) return 'street';
  if (has('address-level2')) return 'city';
  if (has('address-level1')) return 'region';
  if (has('postal-code')) return 'postal';
  if (has('country') || has('country-name')) return 'country';
  const lab = el.labels && el.labels[0] ? el.labels[0].textContent : '';
  const s = [el.name, el.id, el.getAttribute('placeholder'), el.getAttribute('aria-label'), lab].join(' ').toLowerCase();
  if (/e-?mail/.test(s)) return 'email';
  if (/user ?name|login|account id|sign.?in/.test(s)) return 'username';
  if (/first.?name|given/.test(s)) return 'given';
  if (/last.?name|surname|family/.test(s)) return 'family';
  if (/full.?name|your name|^\s*name\s*$/.test(s)) return 'name';
  if (/phone|mobile|\btel\b/.test(s)) return 'tel';
  if (/street|address.?(line)?.?1|^\s*address\s*$/.test(s)) return 'street';
  if (/\bcity\b|town/.test(s)) return 'city';
  if (/province|\bstate\b|region/.test(s)) return 'region';
  if (/\bzip\b|postal|post ?code/.test(s)) return 'postal';
  if (/country/.test(s)) return 'country';
  return null;
}`;

/**
 * Written into the box he is in, or every box of his details in its form, from an isolated world the page cannot see
 * into. `values`: kind -> value. `whole`: every box of the form that has one of these kinds, else only the focused box.
 */
export function fillDetailsScript(values: Partial<Record<FieldKind, string>>, whole: boolean): string {
  return `(() => {
  const V = ${JSON.stringify(values)};
  const set = (el, v) => { const d = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), 'value') || Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
    d.set.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); };
  ${FIELD_KIND_JS}
  const kind = fieldKind;
  // A dropdown (country, province: 2026-10-23, his report that they never filled): the choice whose words or code mean
  // his value (Ontario or ON, Canada or CA), picked only when nothing is chosen yet.
  const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[^a-z0-9]/g, '');
  const ABBR = { AB: 'Alberta', BC: 'British Columbia', MB: 'Manitoba', NB: 'New Brunswick', NL: 'Newfoundland and Labrador', NS: 'Nova Scotia', NT: 'Northwest Territories', NU: 'Nunavut', ON: 'Ontario', PE: 'Prince Edward Island', QC: 'Quebec', SK: 'Saskatchewan', YT: 'Yukon',
    AL: 'Alabama', AK: 'Alaska', AZ: 'Arizona', AR: 'Arkansas', CA: 'California', CO: 'Colorado', CT: 'Connecticut', DE: 'Delaware', FL: 'Florida', GA: 'Georgia', HI: 'Hawaii', ID: 'Idaho', IL: 'Illinois', IN: 'Indiana', IA: 'Iowa', KS: 'Kansas', KY: 'Kentucky', LA: 'Louisiana', ME: 'Maine', MD: 'Maryland', MA: 'Massachusetts', MI: 'Michigan', MN: 'Minnesota', MS: 'Mississippi', MO: 'Missouri', MT: 'Montana', NE: 'Nebraska', NV: 'Nevada', NH: 'New Hampshire', NJ: 'New Jersey', NM: 'New Mexico', NY: 'New York', NC: 'North Carolina', ND: 'North Dakota', OH: 'Ohio', OK: 'Oklahoma', OR: 'Oregon', PA: 'Pennsylvania', RI: 'Rhode Island', SC: 'South Carolina', SD: 'South Dakota', TN: 'Tennessee', TX: 'Texas', UT: 'Utah', VT: 'Vermont', VA: 'Virginia', WA: 'Washington', WV: 'West Virginia', WI: 'Wisconsin', WY: 'Wyoming', DC: 'District of Columbia' };
  const names = (k, v) => {
    const out = new Set([norm(v)]);
    if (k === 'region') for (const [a, n] of Object.entries(ABBR)) if (norm(n) === norm(v) || norm(a) === norm(v)) { out.add(norm(a)); out.add(norm(n)); }
    if (k === 'country') { try { const dn = new Intl.DisplayNames(['en'], { type: 'region' }); for (let i = 0; i < 26; i++) for (let j = 0; j < 26; j++) { const c = String.fromCharCode(65 + i, 65 + j); let n = ''; try { n = dn.of(c); } catch {} if (n && n !== c && (norm(n) === norm(v) || norm(c) === norm(v))) { out.add(norm(c)); out.add(norm(n)); } } } catch {} }
    out.delete('');
    return out;
  };
  const pick = (el, k, v) => {
    // Left alone only when he changed it himself; a page's own preset choice (often United States) is not his.
    const dflt = Math.max(0, [...el.options].findIndex((x) => x.defaultSelected));
    if (el.selectedIndex !== dflt) return false;
    const want = names(k, v);
    const o = [...el.options].find((x) => !x.disabled && (want.has(norm(x.value)) || want.has(norm(x.textContent))));
    if (!o || o.selected && o.value !== '') return false;
    el.value = o.value; el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  };
  // His phone the way each box wants it (sheet 83 v4): numbers only where the box is short or its pattern has no room
  // for dashes or spaces; else as he keeps it, (416) 555-0142.
  const telFor = (el, v) => {
    const d = String(v).replace(/\\D/g, ''), pat = el.getAttribute('pattern') || '';
    const bare = (el.maxLength > 0 && el.maxLength <= 11) || (pat && !/[-\\s().]/.test(pat.replace(/\\\\[ds]/g, '')));
    if (!bare) return v;
    return el.maxLength === 10 && d.length === 11 ? d.slice(1) : d;
  };
  const here = document.activeElement;
  if (!here || here.tagName !== 'INPUT' || typeof kind !== 'function') return 0;
  // Only boxes he can see (security check 2026-10-24, finding 2): a page could hide extra boxes (see-through, tiny, or
  // off the page) next to the one he is in, and one fill would hand it everything.
  const seen = (el) => {
    if (el === here) return true;
    const r = el.getBoundingClientRect();
    if (r.width < 12 || r.height < 10) return false;               // a box too small to see or type in (padding included)
    const w = Math.max(document.documentElement.scrollWidth, innerWidth), h = Math.max(document.documentElement.scrollHeight, innerHeight);
    if (r.right + scrollX <= 0 || r.bottom + scrollY <= 0 || r.left + scrollX >= w || r.top + scrollY >= h) return false;
    for (let n = el; n && n.nodeType === 1; n = n.parentElement) {
      const s = getComputedStyle(n);
      if (s.display === 'none' || s.visibility === 'hidden' || s.visibility === 'collapse' || Number(s.opacity) < 0.1) return false;
    }
    return true;
  };
  const boxes = ${whole} ? [...(here.form || document).querySelectorAll('input, select')].filter(seen) : [here];
  let did = 0;
  for (const b of boxes) {
    const k = kind(b);
    if (!k || !V[k] || b.disabled) continue;
    if (b.tagName === 'SELECT') { if (pick(b, k, V[k])) did++; continue; }
    if (!b.value && !b.readOnly) { set(b, k === 'tel' ? telFor(b, V[k]) : V[k]); did++; }
  }
  if (here.value === '' && V[kind(here)]) { set(here, kind(here) === 'tel' ? telFor(here, V.tel) : V[kind(here)]); did++; }
  return did;
})()`;
}
