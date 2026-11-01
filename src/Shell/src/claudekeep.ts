// The tab engine (sheet 115, his picks 2026-10-31): Claude's work survives a restart. Before, a Claude session lived
// only in memory: an update restarted Samara mid-application, the typed form was lost, and the chat was locked out.
// Now every Claude job (its plan, its tabs, the chat it belongs to) and the typing in its forms are kept on disk, here,
// and come back when Samara starts again, with the same job and page numbers, so the same chat carries on.
//   - His typing is put back by Samara itself ("Samara does it"); Claude checks it before anything is sent.
//   - The typed copy lives until the form is sent, a day at most ("Until sent, 1 day max"). Never passwords, card
//     numbers, one-time codes or files. On this computer only, in Samara's own folder.
//   - A new chat that carries on an old chat's job takes its tabs ("It just takes them"): only when that chat is gone.
import { chmodSync, readFileSync } from 'node:fs';
import { writeFileAtomic } from './atomic.ts';

/** One field's value as it was: text (inputs, text boxes), a tick (tick boxes, radios) or a pick (drop-downs). */
export interface KeptField { k: string; kind: 'text' | 'check' | 'select'; v: string | boolean; label?: string }
export interface KeptForm { at: number; url: string; fields: KeptField[] }
export interface KeptPage { id: number; url: string; title: string; form?: KeptForm }
export interface KeptPlan { login: string[]; denied: string[]; allowed: string[]; steps: string[]; planned: boolean; step: number }
/** A Claude job: `token` is the chat's own (made by its connector, kept for the chat's life; '' for an old connector). */
export interface KeptJob { id: number; token: string; name: string; at: number; seen: number; working: boolean; stopped?: boolean; plan: KeptPlan | null; pages: KeptPage[] }
export interface KeptFile { v: 1; version: string; at: number; jobs: KeptJob[] }

/** A day: typing and jobs older than this are not kept (his pick). */
export const KEEP_MS = 24 * 3_600_000;
/** A chat that has not been heard from in this long is gone (its connector calls in every minute while it is open). */
export const GONE_MS = 3 * 60_000;
/** How often the typing in Claude's forms is looked at. */
export const FORM_EVERY_MS = 15_000;

const str = (x: unknown, n: number) => String(x ?? '').slice(0, n);
const strs = (x: unknown) => Array.isArray(x) ? x.map((s) => str(s, 200)).slice(0, 40) : [];

function cleanField(f: Partial<KeptField> | null): KeptField | null {
  if (!f || typeof f.k !== 'string' || !f.k) return null;
  const kind = f.kind === 'check' || f.kind === 'select' ? f.kind : 'text';
  const v = kind === 'check' ? f.v === true : str(f.v, 5000);
  return { k: str(f.k, 300), kind, v, ...(f.label ? { label: str(f.label, 80) } : {}) };
}
export function cleanForm(f: Partial<KeptForm> | null | undefined, now: number): KeptForm | undefined {
  if (!f || !Array.isArray(f.fields) || typeof f.url !== 'string') return undefined;
  const at = Number(f.at) || 0;
  if (now - at > KEEP_MS) return undefined;
  const fields = f.fields.map((x) => cleanField(x)).filter((x): x is KeptField => !!x).slice(0, 200);
  return fields.length ? { at, url: str(f.url, 2000), fields } : undefined;
}
/** The kept file as read, with anything a day old, broken or empty left out. */
export function cleanKept(raw: unknown, now: number): KeptFile {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Partial<KeptFile>;
  const jobs: KeptJob[] = [];
  for (const j of Array.isArray(r.jobs) ? r.jobs : []) {
    if (!j || !Number.isInteger(j.id) || j.id <= 0) continue;
    const pages = (Array.isArray(j.pages) ? j.pages : []).filter((p) => p && Number.isInteger(p.id) && p.id > 0 && /^https?:\/\//i.test(String(p.url)))
      .map((p) => { const form = cleanForm(p.form, now); return { id: p.id, url: str(p.url, 2000), title: str(p.title, 200), ...(form ? { form } : {}) }; }).slice(0, 12);
    const seen = Number(j.seen) || Number(j.at) || 0;
    if (!pages.length || now - seen > KEEP_MS) continue;
    const pl = j.plan && typeof j.plan === 'object' ? j.plan : null;
    jobs.push({ id: j.id, token: /^[0-9a-f]{32}$/.test(String(j.token)) ? String(j.token) : '', name: str(j.name, 40) || 'Claude', at: Number(j.at) || seen, seen,
      working: j.working === true, stopped: j.stopped === true, plan: pl ? { login: strs(pl.login), denied: strs(pl.denied), allowed: strs(pl.allowed), steps: strs(pl.steps).slice(0, 12), planned: pl.planned === true, step: Number(pl.step) || 0 } : null, pages });
  }
  return { v: 1, version: str(r.version, 40), at: Number(r.at) || 0, jobs };
}
export function readKept(file: string, now: number): KeptFile {
  try { return cleanKept(JSON.parse(readFileSync(file, 'utf8')), now); } catch { return { v: 1, version: '', at: 0, jobs: [] }; }
}
/** Written whole each time; only he can read it (it holds what he typed into forms). */
export function writeKept(file: string, k: KeptFile): void {
  writeFileAtomic(file, JSON.stringify(k));
  try { chmodSync(file, 0o600); } catch { /* Windows: his profile folder is his */ }
}

/** A short name for where a page is, from its title ("Contoso - Account Manager" -> Contoso; "... at ZayZoon" -> ZayZoon). */
export function placeName(title: string, url: string): string {
  const t = String(title || '').trim();
  const at = /\bat\s+([^|·\-–]{2,40})$/i.exec(t);
  const first = at ? at[1]!.trim() : t.split(/\s+[-|·–]\s+/)[0]!.trim();
  if (first && first.length <= 40) return first;
  try { return new URL(url).hostname.replace(/^(www|jobs|careers|apply)\./, ''); } catch { return 'a page'; }
}

/** Does this group name answer what the new chat asked to carry on ("carry on the job hunt" -> "Job hunt")? */
export function sameName(group: string, asked: string): boolean {
  const n = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\b(the|my|a)\b/g, ' ').trim().replace(/\s+/g, ' ');
  const g = n(group), a = n(asked);
  return !!g && !!a && (g === a || a.includes(g) || g.includes(a));
}

/** Is a form worth keeping, and does it count as typing he has not sent? Two filled fields, or one long answer. */
export function hasTyping(f: KeptForm | undefined): boolean {
  if (!f) return false;
  const text = f.fields.filter((x) => x.kind === 'text' && String(x.v).trim());
  return text.length >= 2 || text.some((x) => String(x.v).length >= 40) || f.fields.length >= 3;
}

/**
 * Run in the page: every filled field, by a key that finds it again after a reload. Never a password, a card, a
 * one-time code, a file, a hidden field or a search box. Text fields only when something is in them; ticks only when
 * ticked; drop-downs only when not on their first choice.
 */
export const FORM_GRAB_JS = `(() => {
  const BAD = /pass|card|cc-?num|cvv|cvc|csc|ssn|social.?sec|iban|routing|account.?num|one.?time|otp|pin\\b|security.?code/i;
  const out = [];
  const keyOf = (el, i) => {
    if (el.id && document.querySelectorAll('#' + CSS.escape(el.id)).length === 1) return '#' + el.id;
    if (el.name) { const same = [...document.getElementsByName(el.name)]; return 'n:' + el.name + (same.length > 1 ? ':' + same.indexOf(el) : ''); }
    return 'i:' + i;
  };
  const labelOf = (el) => { const l = (el.labels && el.labels[0]) ? el.labels[0].innerText : (el.getAttribute('aria-label') || el.placeholder || el.name || ''); return String(l).trim().slice(0, 80); };
  const all = [...document.querySelectorAll('input, textarea, select')];
  all.forEach((el, i) => {
    const t = (el.type || '').toLowerCase(), ac = (el.autocomplete || '').toLowerCase();
    if (['password', 'file', 'hidden', 'submit', 'button', 'reset', 'image', 'search'].includes(t)) return;
    if (/^cc-|one-time-code|current-password|new-password/.test(ac)) return;
    if (BAD.test((el.name || '') + ' ' + (el.id || '') + ' ' + ac + ' ' + labelOf(el))) return;
    if (el.closest('[role=search], form[role=search]')) return;
    if (el.disabled) return;
    if (t === 'checkbox' || t === 'radio') { if (el.checked) out.push({ k: keyOf(el, i), kind: 'check', v: true, label: labelOf(el) }); return; }
    if (el.tagName === 'SELECT') { if (el.selectedIndex > 0) out.push({ k: keyOf(el, i), kind: 'select', v: el.value, label: labelOf(el) }); return; }
    if (el.readOnly) return;
    const v = String(el.value || '');
    if (v.trim()) out.push({ k: keyOf(el, i), kind: 'text', v: v.slice(0, 5000), label: labelOf(el) });
  });
  return { url: location.href, fields: out.slice(0, 200) };
})()`;

/**
 * Run in the page after a restart: each kept field put back as if typed (the page's own setter and its input and
 * change events, so sites built on React see it). A field already holding something else is left alone. Returns how
 * many went back and how many were not found (yet).
 */
export function formFillJs(fields: KeptField[]): string {
  return `((fields) => {
  const all = [...document.querySelectorAll('input, textarea, select')];
  const find = (k) => {
    if (k.startsWith('#')) return document.getElementById(k.slice(1));
    if (k.startsWith('n:')) { const p = k.slice(2).split(':'); const at = p.length > 1 && /^\\d+$/.test(p[p.length - 1]) ? Number(p.pop()) : 0; return document.getElementsByName(p.join(':'))[at] || null; }
    if (k.startsWith('i:')) return all[Number(k.slice(2))] || null;
    return null;
  };
  const set = (el, v) => {
    const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : el.tagName === 'SELECT' ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
    const d = Object.getOwnPropertyDescriptor(proto, 'value');
    if (d && d.set) d.set.call(el, v); else el.value = v;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  };
  let put = 0, missing = 0;
  for (const f of fields) {
    const el = find(f.k);
    if (!el) { missing++; continue; }
    if (f.kind === 'check') { if (!el.checked) el.click(); put++; continue; }
    const now = String(el.value || '');
    if (now === f.v) { put++; continue; }
    if (now.trim() && f.kind === 'text') { missing++; continue; }
    set(el, String(f.v)); put++;
  }
  return { put, missing };
})(${JSON.stringify(fields)})`;
}
