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
import { safeStorage } from 'electron';
import { writeFileAtomic } from './atomic.ts';

export const PIN_LENGTH = 4;
export const PIN_TRIES = 5;

export interface Details { name: string; emails: string[]; phone: string; street: string; city: string; region: string; postal: string; country: string }
export const NO_DETAILS: Details = { name: '', emails: [], phone: '', street: '', city: '', region: '', postal: '', country: '' };

/** What a box is for, as the page's own hints tell it (autocomplete, type, name, id, label). */
export type FieldKind = 'email' | 'username' | 'password' | 'newpassword' | 'name' | 'given' | 'family' | 'tel' | 'street' | 'city' | 'region' | 'postal' | 'country';
export const DETAIL_KINDS: FieldKind[] = ['email', 'name', 'given', 'family', 'tel', 'street', 'city', 'region', 'postal', 'country'];

const clip = (v: unknown, n: number) => String(v ?? '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, n);
/** His details as they may be kept: plain short text only, at most five emails that look like emails. */
export function cleanDetails(d: unknown): Details {
  const o = (d && typeof d === 'object' ? d : {}) as Record<string, unknown>;
  const emails = (Array.isArray(o.emails) ? o.emails : []).map((e) => clip(e, 200)).filter((e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e));
  return { name: clip(o.name, 120), emails: [...new Set(emails)].slice(0, 5), phone: clip(o.phone, 40), street: clip(o.street, 200), city: clip(o.city, 100),
    region: clip(o.region, 100), postal: clip(o.postal, 20), country: clip(o.country, 80) };
}
/** The value his details give a kind of box ('' when none). */
export function detailFor(d: Details, kind: FieldKind, email = 0): string {
  const [given, ...rest] = d.name.split(/\s+/);
  switch (kind) {
    case 'email': return d.emails[email] ?? '';
    case 'name': return d.name;
    case 'given': return given ?? '';
    case 'family': return rest.join(' ');
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
const lockText = (s: string): string | null => { try { return safeStorage.isEncryptionAvailable() ? safeStorage.encryptString(s).toString('base64') : null; } catch { return null; } };
const openText = (b64: string): string | null => { try { return safeStorage.decryptString(Buffer.from(b64, 'base64')); } catch { return null; } };

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
  empty(): boolean { const d = this.d; return !d.emails.length && !d.name && !d.phone && !d.street; }
}

const scrypt = (pin: string, salt: Buffer) => new Promise<Buffer>((res, rej) => scryptCb(pin, salt, 32, { N: 1 << 16, r: 8, p: 1, maxmem: 160 * 1024 * 1024 }, (e, k) => (e ? rej(e) : res(k))));
const pinOk = (pin: string) => new RegExp(`^[0-9]{${PIN_LENGTH}}$`).test(pin);

/** Bitwarden's session key, sealed with his PIN and then the Keychain. */
export class PinSeal {
  private readonly file: string;
  constructor(file: string) { this.file = file; }
  private read(): { salt: string; iv: string; tag: string; ct: string; check: string; tries: number } | null {
    try { const j = JSON.parse(readFileSync(this.file, 'utf8')); const t = typeof j?.sealed === 'string' ? openText(j.sealed) : null; return t ? JSON.parse(t) : null; } catch { return null; }
  }
  private write(o: object): boolean { const s = lockText(JSON.stringify(o)); if (!s) return false; try { writeFileAtomic(this.file, JSON.stringify({ v: 1, sealed: s })); return true; } catch { return false; } }
  has(): boolean { return existsSync(this.file) && this.read() !== null; }
  /** False when this machine cannot keep it safely (no Keychain), or the PIN is not 4 digits. */
  async seal(pin: string, session: string): Promise<boolean> {
    if (!pinOk(pin) || !session) return false;
    const salt = randomBytes(16), iv = randomBytes(12), key = await scrypt(pin, salt);
    const c = createCipheriv('aes-256-gcm', key, iv);
    const ct = Buffer.concat([c.update(session, 'utf8'), c.final()]);
    return this.write({ salt: salt.toString('base64'), iv: iv.toString('base64'), tag: c.getAuthTag().toString('base64'), ct: ct.toString('base64'), check: 'v1', tries: 0 });
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
  wipe(): void { try { rmSync(this.file, { force: true }); } catch { /* gone */ } }
}
/** Two PINs typed the same, without telling anyone how long the match took. */
export const samePin = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

/** What kind of box an input is, from the page's own hints. The SAME function is in tabpreload.cjs (which cannot import
 *  anything); test/autofill.test.ts checks the two never drift apart. */
export const FIELD_KIND_JS = String.raw`function fieldKind(el) {
  if (!el || el.tagName !== 'INPUT' || el.disabled || el.readOnly) return null;
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
  const here = document.activeElement;
  if (!here || here.tagName !== 'INPUT' || typeof kind !== 'function') return 0;
  const boxes = ${whole} ? [...(here.form || document).querySelectorAll('input')] : [here];
  let did = 0;
  for (const b of boxes) { const k = kind(b); if (k && V[k] && !b.value && !b.disabled && !b.readOnly) { set(b, V[k]); did++; } }
  if (here.value === '' && V[kind(here)]) { set(here, V[kind(here)]); did++; }
  return did;
})()`;
}
