// 6.25a: Aang (and later Claude sessions) driving the browser (his decisions, 2026-10-12, decision 42).
//
// Each page he drives lives in its own hidden window that is never shown. It renders off screen, which is the only
// reliable way to take a picture of a page nobody is looking at, and it is how he works with the browser closed,
// in the background, with nothing ever popping up or taking focus over a game. The pages use the browser's own
// session, so he is signed in where Joshua is, and they are muted.
//
// The rules (decision 42), enforced here, not asked of the model:
//   free:        read, open pages, scroll, click links, type into search boxes;
//   held lever:  send, post, apply, submit a form, sign in, delete, anything that changes something for him;
//   never:       typing a password or card details, and buying.
// Page text is data, never instructions: it goes back marked as the page's words.
import { BrowserWindow, type Session, type WebContents } from 'electron';
import { challengeLevel, challengeOf, cleanName, diffRead, paceFor, sweepPlan, uploadable, weigh, whatChanged, type PageState, type ReadItem, type Weight } from './driverrules.ts';
import { existsSync, statSync } from 'node:fs';
import os from 'node:os';
export { cleanName, weigh, type Weight };

export type DriverKind = 'aang' | 'claude';
export interface Job { id: number; kind: DriverKind; name: string; working: boolean; stopped: boolean; at: number; pages: number[] }
export interface DPage { id: number; job: number; win: BrowserWindow; title: string; url: string; favicon: string; at: number; blocked: string | null }

export interface DriverDeps {
  ses: Session;
  preload: string;
  /** Lists of fake and harmful sites: a page on one is not opened. */
  listed(url: string): string[];
  /** Something changed that the drawer shows. */
  changed(): void;
  /** He pressed STOP on a job. */
  stopped(job: Job): void;
}

const MAX_PAGES_PER_JOB = 12, MAX_PAGES = 20, KEEP_MS = 24 * 3_600_000;
const W = 1280, H = 900;
const WORLD = 1061;   // an isolated script world of our own: the page cannot see or change what runs here

const isWeb = (u: string) => /^https?:\/\//i.test(u);

// Driver v2 (2026-10-14, research_notes/driver-upgrades): every script finds controls inside open shadow roots too, and a
// control keeps its number for as long as it is on the page, so "#42" still means the same thing after a scroll.
const DEEP = `const __deep = (sel) => { const out = []; const walk = (root) => { for (const e of root.querySelectorAll(sel)) out.push(e); const tw = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT); let h; while ((h = tw.nextNode())) if (h.shadowRoot) walk(h.shadowRoot); }; walk(document); return out; };
const __byN = (n) => __deep('[data-aang-n="' + n + '"]')[0] || null;
const __vis = (e) => { const r = e.getBoundingClientRect(); if (r.width < 2 || r.height < 2) return false; const s = getComputedStyle(e); return s.visibility !== 'hidden' && s.display !== 'none' && Number(s.opacity) > 0.05; };
const __lines = (root) => String(root ? root.innerText : '').split('\\n').map((l) => l.replace(/\\s+/g, ' ').trim()).filter(Boolean);`;

/** Marks the page's controls with lasting numbers and reads it: roles, states, values, where each sits. Isolated world. */
const READ_JS = (o: { within: number | null; maxText: number }) => `(() => {
  ${DEEP}
  const O = ${JSON.stringify(o)};
  const fileLabel = (e) => { const l = (e.id && document.querySelector('label[for="' + CSS.escape(e.id) + '"]')) || e.closest('label'); const box = e.closest('div, section, fieldset'); return ((l && l.innerText) || e.getAttribute('aria-label') || (box && box.innerText) || 'file').replace(/\\s+/g, ' ').trim().slice(0, 60); };
  const text = (e) => (e.type === 'file' ? 'Upload: ' + fileLabel(e) : '') || (e.getAttribute('aria-label') || e.innerText || e.value || e.getAttribute('placeholder') || e.getAttribute('title') || e.getAttribute('alt') || '').replace(/\\s+/g, ' ').trim().slice(0, 80);
  const kindOf = (e) => {
    const t = e.tagName.toLowerCase(), ty = (e.getAttribute('type') || '').toLowerCase(), ac = (e.getAttribute('autocomplete') || '').toLowerCase(), role = (e.getAttribute('role') || '').toLowerCase();
    if (t === 'a' || role === 'link') return 'link';
    if (t === 'select' || role === 'combobox' || role === 'listbox') return 'select';
    if (t === 'textarea' || e.isContentEditable) return 'text';
    if (t === 'input') {
      if (ty === 'password' || /password/.test(ac)) return 'password';
      if (ty === 'file') return 'file';
      if (/^cc-|card|cvc|cvv/.test(ac) || /card.?number|cvc|cvv|expir/i.test(e.name || '')) return 'payment';
      if (ty === 'submit' || ty === 'image') return 'submit';
      if (ty === 'button' || ty === 'reset' || ty === 'checkbox' || ty === 'radio') return 'button';
      if (ty === 'search' || role === 'searchbox' || /^(q|query|search|s|k|keywords?)$/i.test(e.name || '')) return 'search';
      return 'text';
    }
    if (role === 'searchbox') return 'search';
    if (t === 'button') return (e.getAttribute('type') || 'submit').toLowerCase() === 'submit' && e.form ? 'submit' : 'button';
    return 'button';
  };
  const stateOf = (e) => {
    const s = [];
    if (e.disabled || e.getAttribute('aria-disabled') === 'true') s.push('disabled');
    const ty = (e.getAttribute('type') || '').toLowerCase();
    if (ty === 'checkbox' || ty === 'radio') s.push(e.checked ? 'checked' : 'unchecked');
    else if (e.getAttribute('aria-checked') !== null) s.push(e.getAttribute('aria-checked') === 'true' ? 'checked' : 'unchecked');
    const ex = e.getAttribute('aria-expanded'); if (ex !== null) s.push(ex === 'true' ? 'expanded' : 'collapsed');
    if (e.getAttribute('aria-selected') === 'true' || e.getAttribute('aria-pressed') === 'true' || (e.getAttribute('aria-current') && e.getAttribute('aria-current') !== 'false')) s.push('selected');
    if (e.required || e.getAttribute('aria-required') === 'true') s.push('required');
    return s.join(' ');
  };
  const valueOf = (e, kind) => {
    if (kind === 'password' || kind === 'payment') return '';
    if (e.tagName === 'SELECT') return ((e.selectedOptions && e.selectedOptions[0] && e.selectedOptions[0].textContent) || '').trim().slice(0, 60);
    if (e.tagName === 'INPUT' || e.tagName === 'TEXTAREA') { const ty = (e.getAttribute('type') || '').toLowerCase(); return ty === 'checkbox' || ty === 'radio' || ty === 'submit' || ty === 'button' ? '' : String(e.value || '').slice(0, 80); }
    return '';
  };
  const ctxOf = (e) => { const box = e.closest('section, article, li, [role=dialog], dialog, form, [role=listitem]'); const h = box && box.querySelector('h1, h2, h3, h4, [role=heading]'); return h ? String(h.innerText || '').replace(/\\s+/g, ' ').trim().slice(0, 50) : ''; };
  window.__aangN = window.__aangN || 0;
  const scope = O.within ? __byN(O.within) : null;
  const base = scope ? (scope.closest('section, article, form, [role=dialog], dialog, ul, ol, main, [role=list]') || scope) : null;
  const sel = 'a[href], button, input:not([type=hidden]), select, textarea, [role=button], [role=link], [role=tab], [role=menuitem], [role=searchbox], [role=checkbox], [role=radio], [role=combobox], [role=option], [role=switch], summary, [contenteditable=true]';
  const items = [];
  for (const e of __deep(sel)) {
    if (items.length >= 200) break;
    if (base && !base.contains(e)) continue;
    const isFile = e.tagName === 'INPUT' && (e.getAttribute('type') || '').toLowerCase() === 'file';
    if (!isFile && (!__vis(e) || e.closest('[aria-hidden=true]'))) continue;
    let n = Number(e.getAttribute('data-aang-n'));
    if (!n) { n = ++window.__aangN; e.setAttribute('data-aang-n', String(n)); }
    const kind = kindOf(e);
    const form = e.form || e.closest('form');
    const formSearch = Boolean(form && (form.getAttribute('role') === 'search' || form.querySelector('input[type=search], [role=searchbox], input[name=q], input[name=query], input[name=search]')) && !form.querySelector('input[type=password]'));
    const r = e.getBoundingClientRect();
    items.push({ n, kind, role: (e.getAttribute('role') || e.tagName.toLowerCase()), label: text(e), href: kind === 'link' ? String(e.href || '').slice(0, 300) : '', formSearch, state: stateOf(e), value: valueOf(e, kind), ctx: ctxOf(e), view: r.bottom > 0 && r.top < innerHeight });
  }
  const lines = __lines(base || document.body);
  const body = lines.join('\\n');
  return { title: document.title.slice(0, 200), url: location.href, text: body.slice(0, O.maxText), more: body.length > O.maxText, lines: lines.slice(0, 500).map((l) => l.slice(0, 160)), items };
})()`;

/** Where a numbered control is, in the page's own pixels, scrolled into view first. Null if it is gone. */
const SPOT_JS = (n: number) => `(() => {
  ${DEEP}
  const e = __byN(${Number(n)});
  if (!e) return null;
  e.scrollIntoView({ block: 'center', inline: 'center' });
  const r = e.getBoundingClientRect();
  return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2), w: Math.round(r.width), h: Math.round(r.height), left: Math.round(r.left), top: Math.round(r.top) };
})()`;

/** The page's state, before and after an action: where it is, what has the cursor, open boxes, the words, one control. */
const STATE_JS = (n: number | null) => `(() => {
  ${DEEP}
  let a = document.activeElement; while (a && a.shadowRoot && a.shadowRoot.activeElement) a = a.shadowRoot.activeElement;
  const focus = a && a !== document.body && a.getAttribute ? Number(a.getAttribute('data-aang-n')) || null : null;
  const dialogs = __deep('[role=dialog], [role=alertdialog], dialog[open], [aria-modal=true]').filter(__vis).map((d) => (d.getAttribute('aria-label') || (d.querySelector('h1, h2, h3, [role=heading]') || {}).innerText || 'a box').replace(/\\s+/g, ' ').trim().slice(0, 60));
  const lines = __lines(document.body);
  let el;
  if (${n === null ? 'false' : 'true'}) {
    const e = __byN(${Number(n)});
    if (!e) el = { n: ${Number(n)}, gone: true };
    else {
      const s = []; if (e.disabled) s.push('disabled'); if (e.type === 'checkbox' || e.type === 'radio') s.push(e.checked ? 'checked' : 'unchecked');
      const ex = e.getAttribute('aria-expanded'); if (ex !== null) s.push(ex === 'true' ? 'expanded' : 'collapsed');
      if (e.getAttribute('aria-checked') !== null) s.push(e.getAttribute('aria-checked') === 'true' ? 'checked' : 'unchecked');
      const v = e.tagName === 'SELECT' ? ((e.selectedOptions[0] || {}).textContent || '').trim() : e.type === 'password' ? '' : e.type === 'file' ? [...(e.files || [])].map((f) => f.name).join(', ') : ('value' in e ? String(e.value || '') : '');
      el = { n: ${Number(n)}, value: v.slice(0, 80), state: s.join(' ') };
    }
  }
  return { url: location.href, title: document.title.slice(0, 200), focus, dialogs, textLen: lines.join(' ').length, lines: lines.slice(0, 400).map((l) => l.slice(0, 160)), el };
})()`;

/** Resolves once the page has stopped changing: no changes to it for 350 ms and no new downloads, at most 3.5 s. */
const QUIET_JS = `new Promise((done) => {
  let last = Date.now(), res = performance.getEntriesByType('resource').length;
  const mo = new MutationObserver(() => { last = Date.now(); });
  mo.observe(document.documentElement, { subtree: true, childList: true, attributes: true, characterData: true });
  const start = Date.now();
  const tick = () => {
    const r = performance.getEntriesByType('resource').length;
    if (r !== res) { res = r; last = Date.now(); }
    if (Date.now() - last >= 350 || Date.now() - start > 3500) { mo.disconnect(); done(true); } else setTimeout(tick, 100);
  };
  setTimeout(tick, 100);
})`;

/** A native dropdown: pick the option whose words match. Null when the control is not a native select. */
const SELECT_JS = (n: number, want: string) => `(() => {
  ${DEEP}
  const e = __byN(${Number(n)});
  if (!e) return { gone: true };
  if (e.tagName !== 'SELECT') return { native: false };
  const w = ${JSON.stringify(String(want).toLowerCase().trim())};
  const opts = [...e.options];
  const o = opts.find((x) => x.textContent.trim().toLowerCase() === w) || opts.find((x) => x.textContent.trim().toLowerCase().includes(w)) || opts.find((x) => String(x.value).toLowerCase() === w);
  if (!o) return { native: true, found: false, options: opts.map((x) => x.textContent.trim()).slice(0, 40) };
  e.value = o.value; e.dispatchEvent(new Event('input', { bubbles: true })); e.dispatchEvent(new Event('change', { bubbles: true }));
  return { native: true, found: true, picked: o.textContent.trim() };
})()`;


/**
 * Driver v2 part 2: job cards as clean data (title, company, location, posted, salary, link), from LinkedIn's and Indeed's
 * own card markup, or, on any other site, from links that look like job postings. Read-only. The words are the site's.
 */
const JOBS_JS = `(() => {
  ${DEEP}
  const t = (e) => (e ? String(e.innerText || e.textContent || '').replace(/\\s+/g, ' ').trim() : '');
  const first = (card, sels) => { for (const s of sels) { const e = card.querySelector(s); if (e && t(e)) return t(e); } return ''; };
  const pay = (card) => { const m = /(\\$|CA\\$|C\\$|USD|CAD)\\s?[\\d,.]+\\s?[kK]?(\\s?\\/\\s?(yr|hr|year|hour))?(\\s?(-|–|to)\\s?(\\$|CA\\$|C\\$)?\\s?[\\d,.]+\\s?[kK]?)?(\\s?\\/?\\s?(yr|year|hr|hour|an hour|a year|annually))?/.exec(t(card)); return m ? m[0].trim() : ''; };
  const out = []; const seen = new Set();
  const add = (j) => { const key = j.url || (j.title + '|' + j.company + '|' + j.location); if (!j.title || seen.has(key)) return; seen.add(key); out.push(Object.fromEntries(Object.entries(j).map(([k, v]) => [k, String(v || '').slice(0, 160)]))); };
  const host = location.hostname;
  if (/linkedin\\.com$/.test(host)) {
    for (const c of __deep('[data-occludable-job-id], [data-job-id], .job-card-container, .jobs-search-results__list-item, .base-card')) {
      const a = c.querySelector('a[href*="/jobs/view/"], a[href*="currentJobId="], a.base-card__full-link');
      const id = c.getAttribute('data-occludable-job-id') || c.getAttribute('data-job-id') || (a && (/\\/jobs\\/view\\/(?:[^/?]*-)?(\\d+)/.exec(a.href) || /currentJobId=(\\d+)/.exec(a.href) || [])[1]);
      if (!id) continue;
      add({ title: first(c, ['.job-card-list__title', '.job-card-container__link strong', '.job-card-list__title--link', '.base-search-card__title', 'a[href*="/jobs/view/"] strong', 'a[href*="/jobs/view/"]']).replace(/ with verification$/i, ''),
        company: first(c, ['.artdeco-entity-lockup__subtitle', '.job-card-container__primary-description', '.base-search-card__subtitle', '.job-card-container__company-name']),
        location: first(c, ['.job-card-container__metadata-item', '.artdeco-entity-lockup__caption', '.job-search-card__location']),
        posted: first(c, ['time', '.job-card-container__listed-time', '.job-search-card__listdate']), salary: pay(c), url: 'https://www.linkedin.com/jobs/view/' + id + '/' });
    }
    if (!out.length) {
      // The new LinkedIn layout has no job links in its cards (his skill's li_extract.js): a card is the lines up to
      // "N days ago", then any "Easy Apply". A link is taken only when one carries the card's own title.
      const main = document.querySelector('main') || document.body;
      const L = String(main.innerText || '').split('\\n').map((x) => x.trim()).filter(Boolean);
      const endRe = /^(reposted\\s+)?\\d+\\s+(minute|hour|day|week|month)s?\\s+ago$/i;
      const links = __deep('a[href*="/jobs/view/"], a[href*="currentJobId="]');
      let start = 0;
      L.forEach((l, i) => {
        if (!endRe.test(l)) return;
        const seg = L.slice(start, i + 1); let j = i + 1, ea = false;
        while (j < L.length && (/^[^A-Za-z0-9]{1,3}$/.test(L[j]) || /^Easy Apply$/i.test(L[j]))) { if (/Easy Apply/i.test(L[j])) ea = true; j++; }
        start = j;
        // LinkedIn writes each card's title twice in a row (once for screen readers): that pair is the title, so a
        // heading above the list ("Jobs") is never taken for one.
        const twice = seg.findIndex((x, q) => q + 1 < seg.length && x === seg[q + 1]);
        const t0 = twice >= 0 ? twice : 0;
        const title = (seg[t0] || '').replace(/\\s*\\((Verified job)\\)\\s*$/, '').replace(/ with verification$/i, '');
        let k = t0 + 1; if ((seg[k] || '') === seg[t0]) k++; if ((seg[k] || '').includes('(Verified job)')) k++;
        const a = links.find((x) => String(x.innerText || '').trim().startsWith(title));
        const id = a ? ((/\\/jobs\\/view\\/(?:[^/?]*-)?(\\d+)/.exec(a.href) || /currentJobId=(\\d+)/.exec(a.href) || [])[1]) : '';
        add({ title, company: seg[k] || '', location: seg[k + 1] || '', posted: seg[seg.length - 1], salary: seg.find((x) => /CA?\\$|CAD\\/(yr|hr)/.test(x)) || '', easyApply: ea ? 'yes' : '', url: id ? 'https://www.linkedin.com/jobs/view/' + id + '/' : '' });
      });
    }
  } else if (/indeed\\./.test(host)) {
    for (const c of __deep('.job_seen_beacon, [data-jk], .jobsearch-ResultsList > li')) {
      const inner = c.querySelector('[data-jk]'); const jk = c.getAttribute('data-jk') || (inner && inner.getAttribute('data-jk'));
      if (!jk) continue;
      add({ title: first(c, ['h2.jobTitle span[title]', 'h2.jobTitle', 'h2 a span', '[class*=jobTitle]']),
        company: first(c, ['[data-testid=company-name]', '.companyName', '[class*=companyName]']),
        location: first(c, ['[data-testid=text-location]', '.companyLocation', '[class*=companyLocation]']),
        posted: first(c, ['[data-testid=myJobsStateDate]', '.date', 'span.date']), salary: first(c, ['[data-testid*=salary]', '.salary-snippet-container', '.salaryOnly']) || pay(c), url: location.origin + '/viewjob?jk=' + jk });
    }
  }
  if (!out.length) {
    for (const a of __deep('a[href]')) {
      const h = String(a.href || '');
      if (!/\\/jobs?\\/|\\/careers?\\/|viewjob|greenhouse\\.io|lever\\.co|myworkdayjobs|ashbyhq|smartrecruiters|workable\\.com|\\/positions?\\//i.test(h) || !__vis(a)) continue;
      const title = t(a); if (title.length < 6 || title.length > 140 || /^(see|view|show) (all|more)|^jobs?$|^careers?$|^search/i.test(title)) continue;
      const card = a.closest('li, article, tr, [class*=card], [class*=job], [class*=posting]') || a.parentElement;
      const lines = String(card && card.innerText || '').split('\\n').map((l) => l.trim()).filter((l) => l && l !== title);
      add({ title, company: lines[0] || '', location: lines.find((l) => /remote|hybrid|on-?site|toronto|ontario|canada|, [A-Z]{2}\\b/i.test(l)) || '', posted: lines.find((l) => /ago|posted|today|yesterday|\\d{4}-\\d{2}/i.test(l)) || '', salary: pay(card || a), url: h.split('#')[0] });
    }
  }
  return out.slice(0, 120);
})()`;

/** Scrolls the list the job cards sit in (LinkedIn's left column scrolls on its own), or the page. True if it moved. */
const SCROLL_LIST_JS = `(() => {
  ${DEEP}
  const card = __deep('[data-occludable-job-id], [data-job-id], .job-card-container, .job_seen_beacon, [data-jk]')[0];
  let box = card ? card.parentElement : null;
  while (box && box !== document.body) { const s = getComputedStyle(box); if (/(auto|scroll)/.test(s.overflowY) && box.scrollHeight > box.clientHeight + 4) break; box = box.parentElement; }
  if (box && box !== document.body) { const was = box.scrollTop; box.scrollBy(0, Math.round(box.clientHeight * 0.9)); return box.scrollTop !== was; }
  const was = scrollY; window.scrollBy(0, Math.round(innerHeight * 0.9)); return scrollY !== was;
})()`;


/** Numbers drawn over every control in view, for a picture that shows which number is which. Removed right after. */
const MARKS_JS = (on: boolean) => on ? `(() => {
  ${DEEP}
  const layer = document.createElement('div'); layer.id = '__aang_marks';
  layer.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:2147483647';
  for (const e of __deep('[data-aang-n]')) {
    if (!__vis(e)) continue; const r = e.getBoundingClientRect(); if (r.bottom < 0 || r.top > innerHeight) continue;
    const box = document.createElement('div');
    box.style.cssText = 'position:fixed;border:2px solid #ff3b30;border-radius:3px;left:' + r.left + 'px;top:' + r.top + 'px;width:' + r.width + 'px;height:' + r.height + 'px';
    const tag = document.createElement('div'); tag.textContent = e.getAttribute('data-aang-n');
    tag.style.cssText = 'position:absolute;left:-2px;top:-16px;background:#ff3b30;color:#fff;font:bold 11px/14px Arial;padding:0 3px;border-radius:2px';
    box.append(tag); layer.append(box);
  }
  document.documentElement.append(layer); return true;
})()` : `(() => { const l = document.getElementById('__aang_marks'); if (l) l.remove(); return true; })()`;


/** One search on a board, from inside its own page (his skill's board_loop.js): GET only, cards as text and a link. */
const SEARCH_JS = (path: string, card: string) => `(async () => {
  try {
    const r = await fetch(${JSON.stringify(path)}, { credentials: 'include', method: 'GET' });
    const t = await r.text();
    const head = t.slice(0, 4000);
    if (r.status === 429 || r.status === 403 || /Security Check|Just a moment|are you a (human|robot)|verify (that )?you('| a)re human|cf-chl|hcaptcha-box/i.test(head)) return { status: r.status, blocked: true, cards: [] };
    if (r.status !== 200) return { status: r.status, blocked: false, cards: [] };
    const d = new DOMParser().parseFromString(t, 'text/html');
    const lines = (el) => { const out = []; const w = d.createTreeWalker(el, NodeFilter.SHOW_TEXT); let n; while ((n = w.nextNode())) { const s = n.textContent.replace(/\\s+/g, ' ').trim(); if (s && !out.includes(s)) out.push(s); } return out; };
    const cards = [...d.querySelectorAll(${JSON.stringify(card)})].slice(0, 80).map((c) => { const a = c.querySelector('a[href]'); let u = ''; try { u = a ? new URL(a.getAttribute('href'), location.origin).href : ''; } catch {} return { text: lines(c).slice(0, 10).join(' | ').slice(0, 300), url: u.slice(0, 400) }; });
    return { status: 200, blocked: false, cards };
  } catch (e) { return { status: 0, blocked: false, error: String(e && e.message || e).slice(0, 120), cards: [] }; }
})()`;

/** Every field of a form (or the whole page): label, value (never a password), required, and whether it is wrong. */
const FORM_JS = (within: number | null) => `(() => {
  ${DEEP}
  const scope = ${within === null ? 'null' : `__byN(${Number(within)})`};
  const base = scope ? (scope.closest('form, [role=dialog], dialog, section, main') || scope) : document;
  window.__aangN = window.__aangN || 0;
  const labelOf = (e) => { const t = (x) => String(x || '').replace(/\\s+/g, ' ').trim(); const byFor = e.id && document.querySelector('label[for="' + CSS.escape(e.id) + '"]'); const lb = e.getAttribute('aria-labelledby'); const named = lb ? lb.split(/\\s+/).map((id) => t((document.getElementById(id) || {}).innerText)).join(' ') : '';
    return (t(e.getAttribute('aria-label')) || named || t(byFor && byFor.innerText) || t((e.closest('label') || {}).innerText) || t(e.getAttribute('placeholder')) || t((e.closest('fieldset') || {}).querySelector && (e.closest('fieldset').querySelector('legend') || {}).innerText) || t(e.name)).slice(0, 90); };
  const out = [];
  const els = (base === document ? __deep('input, select, textarea, [contenteditable=true], [role=combobox], [role=radio], [role=checkbox]') : [...base.querySelectorAll('input, select, textarea, [contenteditable=true], [role=combobox], [role=radio], [role=checkbox]')]);
  for (const e of els) {
    const ty = (e.getAttribute('type') || '').toLowerCase();
    if (ty === 'hidden' || ty === 'submit' || ty === 'button' || ty === 'image' || ty === 'reset') continue;
    if (ty !== 'file' && !__vis(e)) continue;
    let n = Number(e.getAttribute('data-aang-n')); if (!n) { n = ++window.__aangN; e.setAttribute('data-aang-n', String(n)); }
    const secret = ty === 'password' || /cc-|card|cvc|cvv/i.test(e.getAttribute('autocomplete') || '');
    let value = '';
    if (e.tagName === 'SELECT') value = ((e.selectedOptions[0] || {}).textContent || '').trim();
    else if (ty === 'checkbox' || ty === 'radio') value = e.checked ? 'checked' : 'unchecked';
    else if (e.getAttribute('role') === 'checkbox' || e.getAttribute('role') === 'radio') value = e.getAttribute('aria-checked') === 'true' ? 'checked' : 'unchecked';
    else if (ty === 'file') value = e.files && e.files.length ? [...e.files].map((f) => f.name).join(', ') : '';
    else value = String(e.value ?? e.innerText ?? '');
    const desc = (e.getAttribute('aria-describedby') || '').split(/\\s+/).map((id) => (document.getElementById(id) || {}).innerText || '').join(' ').trim();
    const bad = e.getAttribute('aria-invalid') === 'true' || (e.validity && e.checkValidity && !e.validity.valid && (e.value || e.required));
    out.push({ n, label: labelOf(e), kind: e.tagName === 'SELECT' ? 'select' : ty || e.getAttribute('role') || e.tagName.toLowerCase(), value: secret ? (value ? '(filled, hidden)' : '') : value.slice(0, 120), required: Boolean(e.required || e.getAttribute('aria-required') === 'true'), wrong: Boolean(bad), message: (desc || (bad && e.validationMessage) || '').slice(0, 120) });
  }
  return out.slice(0, 120);
})()`;

/** The best picture or video on the page, for "get me a map": the biggest one in view. */
const BEST_MEDIA_JS = `(() => {
  const all = [...document.querySelectorAll('img, video, canvas, svg, picture, iframe[src*="youtube"], iframe[src*="twitch"]')];
  let best = null, area = 0;
  for (const e of all) { const r = e.getBoundingClientRect(); const a = r.width * r.height; if (r.width < 120 || r.height < 90) continue; if (a > area) { area = a; best = e; } }
  if (!best) return null;
  best.scrollIntoView({ block: 'center' });
  const r = best.getBoundingClientRect();
  const tag = best.tagName.toLowerCase();
  return { tag, left: Math.max(0, Math.round(r.left)), top: Math.max(0, Math.round(r.top)), w: Math.round(Math.min(r.width, innerWidth)), h: Math.round(Math.min(r.height, innerHeight)),
    src: tag === 'video' ? (best.currentSrc || '') : '', video: tag === 'video' || tag === 'iframe' };
})()`;

export class Driver {
  private readonly d: DriverDeps;
  readonly jobs: Job[] = [];
  readonly pages: DPage[] = [];
  private jobSeq = 0;
  private pageSeq = 0;
  private items = new Map<number, { n: number; kind: string; label: string; href: string; formSearch: boolean }[]>();
  /** The last read of each page, for "only what changed". */
  private lastRead = new Map<number, { lines: string[]; items: ReadItem[] }>();
  /** When each paced site last loaded a page (his person's-pace rule). */
  private lastNav = new Map<string, number>();
  constructor(d: DriverDeps) {
    this.d = d;
    setInterval(() => this.sweep(), 10 * 60_000).unref?.();
  }

  /** A job: one request of his, one trail in the drawer. */
  startJob(kind: DriverKind, name: string): Job {
    const job: Job = { id: ++this.jobSeq, kind, name: cleanName(name), working: true, stopped: false, at: Date.now(), pages: [] };
    this.jobs.push(job);
    this.d.changed();
    return job;
  }
  job(id: number): Job | undefined { return this.jobs.find((j) => j.id === id); }
  /** A job's group in the tab list is named for what it is doing ("JOB SCAN"), his ask 2026-10-14. */
  rename(id: number, name: string): void { const j = this.job(id); if (j && name.trim()) { j.name = cleanName(name); this.d.changed(); } }
  finish(id: number): void { const j = this.job(id); if (j && j.working) { j.working = false; this.d.changed(); } }
  /** STOP: from the drawer, the address bar, or his words. Every page of the job stops loading at once. */
  stop(id: number): void {
    const j = this.job(id);
    if (!j || !j.working) return;
    j.working = false; j.stopped = true;
    for (const p of this.pagesOf(j)) { try { p.win.webContents.stop(); } catch { /* gone */ } }
    this.d.changed();
    this.d.stopped(j);
  }
  pagesOf(j: Job): DPage[] { return this.pages.filter((p) => p.job === j.id); }
  page(id: number): DPage | undefined { return this.pages.find((p) => p.id === id && !p.win.isDestroyed()); }
  owns(wc: WebContents): boolean { return this.pages.some((p) => !p.win.isDestroyed() && p.win.webContents === wc); }

  private live(jobId: number): Job {
    const j = this.job(jobId);
    if (!j) throw new Error('there is no such job');
    if (j.stopped) throw new Error('Joshua pressed STOP on this job, so nothing more is done');
    return j;
  }

  /** Open a page for a job. Never shown, never focused, muted. */
  async open(jobId: number, url: string): Promise<{ page: number; title: string; url: string; waited?: number }> {
    const j = this.live(jobId);
    if (!isWeb(url)) throw new Error('only web addresses (http or https) can be opened');
    const l = this.d.listed(url);
    if (l.length) throw new Error(`that site is on a list of fake or harmful sites (${l.join(', ')}), so it was not opened`);
    while (this.pagesOf(j).length >= MAX_PAGES_PER_JOB) this.close(this.pagesOf(j)[0]!.id);
    while (this.pages.length >= MAX_PAGES) this.close(this.pages[0]!.id);
    const win = new BrowserWindow({
      show: false, width: W, height: H, paintWhenInitiallyHidden: true, skipTaskbar: true, focusable: false,
      webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false, webSecurity: true, session: this.d.ses, preload: this.d.preload, offscreen: true, backgroundThrottling: false },
    });
    win.webContents.setFrameRate(10);
    win.webContents.setAudioMuted(true);
    const p: DPage = { id: ++this.pageSeq, job: j.id, win, title: 'Opening', url, favicon: '', at: Date.now(), blocked: null };
    this.pages.push(p);
    j.pages.push(p.id);
    const wc = win.webContents;
    wc.on('will-attach-webview', (e) => e.preventDefault());
    // A link that wants a new window opens in this same page instead: his rule, only its own tabs, nothing pops up.
    wc.setWindowOpenHandler(({ url: u }) => { if (isWeb(u)) setTimeout(() => { if (!wc.isDestroyed()) void wc.loadURL(u).catch(() => {}); }, 0); return { action: 'deny' }; });
    wc.on('will-navigate', (e, u) => { if (!isWeb(u) || this.d.listed(u).length) { e.preventDefault(); p.blocked = u; } });
    wc.on('page-title-updated', (_e, t) => { p.title = t.slice(0, 200); this.d.changed(); });
    wc.on('page-favicon-updated', (_e, icons) => { p.favicon = icons.find((i) => /^https?:|^data:image\//.test(i)) ?? ''; this.d.changed(); });
    wc.on('did-navigate', (_e, u) => { p.url = u; this.items.delete(p.id); this.lastRead.delete(p.id); this.d.changed(); });
    wc.on('did-navigate-in-page', (_e, u) => { p.url = u; });
    this.d.changed();
    const waited = await this.pace(url);
    await this.settle(wc, wc.loadURL(url));
    this.checkChallenge(p, await this.state(wc, null).catch(() => ({ url: p.url, title: p.title, lines: [] } as unknown as PageState)));
    return { page: p.id, title: p.title, url: p.url, ...(waited ? { waited } : {}) };
  }

  /** Wait for a page to be usable: loaded, or 12 seconds, whichever first; then a moment for scripts to draw it. */
  private async settle(wc: WebContents, nav?: Promise<unknown>): Promise<void> {
    if (nav) nav.catch(() => {});
    // v2: only wait for a load if one actually started (a click on a single-page site like LinkedIn never loads),
    // then until the page stops changing, instead of a fixed pause.
    if (!nav) await new Promise((r) => setTimeout(r, 150));
    if (nav || wc.isLoading()) await new Promise<void>((r) => { const t = setTimeout(r, 12_000); wc.once('did-stop-loading', () => { clearTimeout(t); r(); }); });
    if (!wc.isDestroyed()) await wc.executeJavaScriptInIsolatedWorld(WORLD, [{ code: QUIET_JS }]).catch(() => {});
  }

  /** His person's pace on LinkedIn, Indeed and Glassdoor: waits before a page load there if the last was too recent. */
  private async pace(url: string): Promise<number> {
    let host = ''; try { host = new URL(url).hostname.replace(/^www\./, ''); } catch { return 0; }
    const p = paceFor(host);
    if (!p) return 0;
    const key = host.split('.').slice(-2).join('.');
    const want = (this.lastNav.get(key) ?? 0) + (p.least + Math.random() * p.jitter) * 1000;
    const wait = Math.max(0, want - Date.now());
    if (wait) await new Promise((r) => setTimeout(r, wait));
    this.lastNav.set(key, Date.now());
    return Math.round(wait / 1000);
  }

  /** A site asking whether he is a bot: the job stops at once (never solved, never retried). */
  private checkChallenge(p: DPage, r: { title?: string; text?: string; url?: string; lines?: string[] }): void {
    const c = challengeOf({ title: r.title, url: r.url, text: r.text ?? (r.lines ?? []).slice(0, 30).join('\n') });
    if (!c) return;
    let host = ''; try { host = new URL(r.url ?? p.url).hostname.replace(/^www\./, ''); } catch { /* none */ }
    // A box to tick on an application form (BambooHR's "I'm not a robot") is his to click: the session goes on and
    // says so. A whole security page, or any check on LinkedIn, Indeed or Glassdoor, stops everything (2026-10-14).
    if (challengeLevel({ title: r.title, url: r.url, host }) === 'box') return;
    this.stop(p.job);
    throw new Error(`${host || 'the site'} is showing ${c}. This session is stopped: do not retry or try to get past it. Tell Joshua, and leave that site for a day.`);
  }

  /** The frames of a page that hold another site's page (a Greenhouse or Workday form): 1, 2, 3... */
  private frames(wc: WebContents): Electron.WebFrameMain[] {
    try { return wc.mainFrame.framesInSubtree.filter((f) => f !== wc.mainFrame && f.parent === wc.mainFrame && /^https?:/i.test(f.url)).slice(0, 6); } catch { return []; }
  }
  private async state(wc: WebContents, n: number | null): Promise<PageState> {
    return await wc.executeJavaScriptInIsolatedWorld(WORLD, [{ code: STATE_JS(n) }]) as PageState;
  }
  /** What an action did, in words; says plainly when nothing visible changed. The cursor landing on the button just
   *  clicked is not a change (a dead button must never read as done); on a field it is the point, so it stays. */
  private told(before: PageState, after: PageState, clicked?: { n: number; field: boolean }): string[] {
    let c = whatChanged(before, after);
    if (clicked && !clicked.field) c = c.filter((x) => x !== `control ${clicked.n} has the cursor`);
    return c.length ? c : ['nothing visible changed: it may not have worked. Read the page again, or try another control'];
  }

  private wcOf(pageId: number): { p: DPage; wc: WebContents } {
    const p = this.page(pageId);
    if (!p) throw new Error('that page is closed');
    this.live(p.job);
    return { p, wc: p.win.webContents };
  }

  /**
   * Read the page: its words (marked as the page's), and its controls with lasting numbers, roles and states.
   * within: only the part of the page around that control (a dialog, a form, a list). changes: only what changed since
   * the last read of this page.
   */
  async read(pageId: number, o: { within?: number; changes?: boolean } = {}): Promise<{ title: string; url: string; text: string; more: boolean; unchanged?: { lines: number; controls: number }; items: (ReadItem & { weight: Weight; value?: string; view?: boolean })[] }> {
    const { p, wc } = this.wcOf(pageId);
    const r = await wc.executeJavaScriptInIsolatedWorld(WORLD, [{ code: READ_JS({ within: Number.isInteger(o.within) ? o.within! : null, maxText: 7000 }) }]) as { title: string; url: string; text: string; more: boolean; lines: string[]; items: (ReadItem & { formSearch: boolean; value: string; view: boolean })[] };
    this.checkChallenge(p, r);
    // Frames holding another site's page (application forms): their controls numbered 10001+, 20001+, their words after.
    if (!o.within) {
      const fs = this.frames(wc);
      // A frame from another site runs in its own process, which stalls in a hidden window and does not reliably take
      // clicks or typing; so its words come back with its address, and Claude opens that address as its own page to act.
      for (let k = 0; k < fs.length; k++) {
        if (/recaptcha|hcaptcha|challenges\.cloudflare|turnstile/i.test(fs[k]!.url)) {
          r.lines.push('[This page has a CAPTCHA box ("I\'m not a robot"). Joshua ticks it himself: fill everything else, leave the page, and tell him exactly what remains.]');
          r.text += '\n\n[This page has a CAPTCHA box. Joshua ticks it himself: fill everything else and tell him exactly what remains.]';
          continue;
        }
        const words = await Promise.race([fs[k]!.executeJavaScript(`(() => { ${DEEP} return __lines(document.body).slice(0, 120).join('\\n').slice(0, 3000); })()`).catch(() => ''), new Promise((res) => setTimeout(() => res(''), 1500))]) as string;
        if (!words) continue;
        let fh = ''; try { fh = new URL(fs[k]!.url).hostname; } catch { /* none */ }
        const head = `[A frame from ${fh}. To use anything in it, open its own address with browser_open: ${fs[k]!.url.slice(0, 300)}]`;
        r.lines.push(head, ...words.split('\n'));
        r.text += `\n\n${head}\n${words}`;
      }
    }
    // The numbers last as long as the controls do, so the old list is merged, not replaced.
    const known = new Map((this.items.get(p.id) ?? []).map((x) => [x.n, x]));
    for (const it of r.items) known.set(it.n, { n: it.n, kind: it.kind, label: it.label, href: it.href, formSearch: it.formSearch });
    this.items.set(p.id, [...known.values()].slice(-600));
    const items = r.items.map((it) => ({ n: it.n, kind: it.kind, role: it.role, label: it.label, href: it.href, state: it.state, ctx: it.ctx, value: it.value, view: it.view, weight: weigh(it) }));
    const prev = o.within ? undefined : this.lastRead.get(p.id);
    if (!o.within) this.lastRead.set(p.id, { lines: r.lines, items });
    if (o.changes && prev) {
      const d = diffRead(prev, { lines: r.lines, items });
      return { title: r.title, url: r.url, text: d.lines.join('\n').slice(0, 7000), more: false, unchanged: { lines: d.sameLines, controls: d.sameItems }, items: d.items as typeof items };
    }
    return { title: r.title, url: r.url, text: r.text, more: r.more, items };
  }

  /** Job cards on this page as clean data. Read-only. */
  async jobCards(pageId: number): Promise<{ jobs: Record<string, string>[] }> {
    const { p, wc } = this.wcOf(pageId);
    this.checkChallenge(p, await this.state(wc, null));
    return { jobs: await wc.executeJavaScriptInIsolatedWorld(WORLD, [{ code: JOBS_JS }]) as Record<string, string>[] };
  }

  /**
   * Scroll through a list of jobs collecting every card, merged by link, so a list that only draws what is on screen
   * (LinkedIn's) is never half-read. A person's pace between scrolls; stops when nothing new comes twice, or at max.
   */
  async collectJobs(pageId: number, max = 60): Promise<{ jobs: Record<string, string>[]; scrolls: number; end: boolean }> {
    const { p, wc } = this.wcOf(pageId);
    const all = new Map<string, Record<string, string>>();
    let still = 0, scrolls = 0, end = false;
    for (let round = 0; round < 15 && all.size < max; round++) {
      const st = await this.state(wc, null);
      this.checkChallenge(p, st);
      const got = await wc.executeJavaScriptInIsolatedWorld(WORLD, [{ code: JOBS_JS }]) as Record<string, string>[];
      const before = all.size;
      for (const j of got) { const key = j.url || `${j.title}|${j.company}|${j.location}`; if (!all.has(key)) all.set(key, j); }
      still = all.size === before ? still + 1 : 0;
      if (still >= 2) { end = true; break; }
      const moved = await wc.executeJavaScriptInIsolatedWorld(WORLD, [{ code: SCROLL_LIST_JS }]) as boolean;
      if (!moved) { still++; if (still >= 2) { end = true; break; } }
      scrolls++;
      await this.settle(wc);
      await new Promise((r) => setTimeout(r, 1500 + Math.random() * 2500));
    }
    return { jobs: [...all.values()].slice(0, max), scrolls, end };
  }

  // ---- job-hunt parity (2026-10-14): a board sweep, a résumé upload, and a check of every field ----

  private sweeps = new Map<number, { id: number; page: number; host: string; total: number; finished: number; done: boolean; stopped: string; coverage: Record<string, number | string>; cards: Map<string, { text: string; url: string; keyword: string }> }>();
  private sweepSeq = 0;
  /**
   * His skill's board sweep, built in: one search per keyword from inside the board's own page, GET only, at the board's
   * own spacing (Indeed 11 s and up), and when the board pushes back: wait 90 s, try once more, then stop that board.
   * Runs in the background; ask for sweepStatus.
   */
  startSweep(pageId: number, o: { keywords: string[]; path?: string; card?: string; spacing?: number }): { id: number; board: string; spacing: number } {
    const { p, wc } = this.wcOf(pageId);
    let host = ''; try { host = new URL(p.url).hostname.replace(/^www\./, ''); } catch { /* none */ }
    const plan = sweepPlan(host, o);
    if (typeof plan === 'string') throw new Error(plan);
    const words = [...new Set((o.keywords ?? []).map((k) => String(k).trim()).filter(Boolean))].slice(0, 80);
    if (!words.length) throw new Error('give the keywords to search');
    const s = { id: ++this.sweepSeq, page: pageId, host, total: words.length, finished: 0, done: false, stopped: '', coverage: {} as Record<string, number | string>, cards: new Map<string, { text: string; url: string; keyword: string }>() };
    this.sweeps.set(s.id, s);
    void (async () => {
      for (const kw of words) {
        const j = this.job(p.job);
        if (!j || j.stopped || wc.isDestroyed()) { s.stopped = 'stopped (STOP was pressed or the page closed)'; break; }
        const path = plan.path.replace('{q}', encodeURIComponent(kw).replace(/%20/g, '+'));
        let r = await wc.executeJavaScriptInIsolatedWorld(WORLD, [{ code: SEARCH_JS(path, plan.card) }]).catch(() => ({ status: 0, blocked: false, cards: [] })) as { status: number; blocked: boolean; cards: { text: string; url: string }[]; error?: string };
        if (r.blocked) {
          s.coverage[kw] = `pushed back (${r.status || 'check page'}), waiting 90 s`;
          await new Promise((res) => setTimeout(res, 90_000));
          r = await wc.executeJavaScriptInIsolatedWorld(WORLD, [{ code: SEARCH_JS(path, plan.card) }]).catch(() => ({ status: 0, blocked: true, cards: [] })) as typeof r;
          if (r.blocked) { s.coverage[kw] = `blocked (${r.status || 'check page'})`; s.stopped = `${host} pushed back twice, so this board was stopped. Try it again in a later sweep.`; break; }
        }
        s.coverage[kw] = r.status === 200 ? r.cards.length : `error ${r.status || r.error || ''}`.trim();
        for (const c of r.cards) { const key = c.url || c.text.split(' | ').slice(0, 2).join('|'); if (key && !s.cards.has(key)) s.cards.set(key, { ...c, keyword: kw }); }
        s.finished++;
        await new Promise((res) => setTimeout(res, plan.spacing * 1000 * (1 + Math.random() * 0.4)));
      }
      s.done = true;
    })();
    return { id: s.id, board: host, spacing: plan.spacing };
  }
  sweepStatus(id: number): { done: boolean; board: string; finished: number; total: number; stopped: string; coverage: Record<string, number | string>; postings: number; cards?: { text: string; url: string; keyword: string }[] } {
    const s = this.sweeps.get(id);
    if (!s) throw new Error('there is no such sweep');
    return { done: s.done, board: s.host, finished: s.finished, total: s.total, stopped: s.stopped, coverage: s.coverage, postings: s.cards.size, ...(s.done ? { cards: [...s.cards.values()].slice(0, 600) } : {}) };
  }
  sweepPage(id: number): number | null { return this.sweeps.get(id)?.page ?? null; }

  /** A file of his into a file field (his résumé). Asked first by the caller, every time; only his own documents. */
  async upload(pageId: number, n: number, file: string): Promise<{ title: string; url: string; changed: string[] }> {
    const { p, wc } = this.wcOf(pageId);
    let size = 0; try { size = existsSync(file) ? statSync(file).size : 0; } catch { /* none */ }
    const no = uploadable(file, os.homedir(), size);
    if (no) throw new Error(`that file cannot be uploaded: ${no}`);
    const it = this.items.get(p.id)?.find((x) => x.n === n);
    if (it?.kind !== 'file') throw new Error(`control ${n} is not a file field; read the page again`);
    const before = await this.state(wc, n);
    const dbg = wc.debugger;
    let mine = false;
    try {
      if (!dbg.isAttached()) { dbg.attach('1.3'); mine = true; }
      const { result } = await dbg.sendCommand('Runtime.evaluate', { expression: `document.querySelector('[data-aang-n="${Number(n)}"]')` }) as { result: { objectId?: string } };
      if (!result?.objectId) throw new Error(`file field ${n} is not on the page any more`);
      await dbg.sendCommand('DOM.setFileInputFiles', { files: [file], objectId: result.objectId });
    } finally { if (mine) { try { dbg.detach(); } catch { /* gone */ } } }
    await this.settle(wc);
    const after = await this.state(wc, n);
    return { title: p.title, url: p.url, changed: this.told(before, after) };
  }
  describeFile(file: string): string { return String(file ?? '').replace(/\\/g, '/').split('/').pop() ?? 'a file'; }

  /** Every field of a form, to read back before anything is submitted. within: a control in that form. */
  async form(pageId: number, within?: number): Promise<{ fields: { n: number; label: string; kind: string; value: string; required: boolean; wrong: boolean; message: string }[] }> {
    const { wc } = this.wcOf(pageId);
    const fields = await wc.executeJavaScriptInIsolatedWorld(WORLD, [{ code: FORM_JS(Number.isInteger(within) ? within! : null) }]) as { n: number; label: string; kind: string; value: string; required: boolean; wrong: boolean; message: string }[];
    return { fields };
  }

  /** Find words on the page: the lines that have them, and the controls whose names do. */
  async find(pageId: number, q: string): Promise<{ lines: string[]; items: (ReadItem & { weight: Weight })[] }> {
    const w = String(q ?? '').toLowerCase().trim();
    if (!w) throw new Error('say what to look for');
    const { wc } = this.wcOf(pageId);
    const r = await this.read(pageId);
    const st = await this.state(wc, null);
    const hits: string[] = [];
    st.lines.forEach((l, i) => { if (l.toLowerCase().includes(w) && hits.length < 15) hits.push([st.lines[i - 1], l, st.lines[i + 1]].filter(Boolean).join(' / ').slice(0, 300)); });
    return { lines: hits, items: r.items.filter((it) => `${it.label} ${it.ctx ?? ''}`.toLowerCase().includes(w)).slice(0, 20) };
  }

  /** How heavy a click or a typing on this numbered control is. Read the page first. */
  weightOf(pageId: number, n: number, action: 'click' | 'type' | 'enter'): Weight {
    const it = this.items.get(pageId)?.find((x) => x.n === n);
    if (!it) return 'lever';                                   // unknown: never free
    if (action === 'type') return it.kind === 'password' || it.kind === 'payment' ? 'never' : 'free';
    if (action === 'enter') return it.kind === 'search' || it.formSearch ? 'free' : it.kind === 'password' || it.kind === 'payment' ? 'never' : 'lever';
    return weigh(it);
  }
  describe(pageId: number, n: number): string {
    const it = this.items.get(pageId)?.find((x) => x.n === n);
    const p = this.page(pageId);
    let host = '';
    try { host = new URL(p?.url ?? '').hostname.replace(/^www\./, ''); } catch { /* none */ }
    return `${it?.label ? `"${it.label}"` : 'a control'} on ${host || 'the page'}`;
  }

  /** Where a control is on the page, scrolled into view. */
  private async spot(wc: WebContents, n: number): Promise<{ x: number; y: number; w: number; h: number; left: number; top: number } | null> {
    return await wc.executeJavaScriptInIsolatedWorld(WORLD, [{ code: SPOT_JS(n) }]) as { x: number; y: number; w: number; h: number; left: number; top: number } | null;
  }

  /** Click a numbered control, the way a mouse would, inside the page (never on Windows itself). */
  async click(pageId: number, n: number): Promise<{ title: string; url: string; changed: string[]; waited?: number }> {
    const { p, wc } = this.wcOf(pageId);
    const it = this.items.get(p.id)?.find((x) => x.n === n);
    const waited = it?.kind === 'link' && it.href ? await this.pace(it.href) : 0;
    const before = await this.state(wc, n);
    const at = await this.spot(wc, n);
    if (!at) throw new Error(`control ${n} is not on the page any more; read the page again`);
    wc.sendInputEvent({ type: 'mouseMove', x: at.x, y: at.y });
    wc.sendInputEvent({ type: 'mouseDown', x: at.x, y: at.y, button: 'left', clickCount: 1 });
    wc.sendInputEvent({ type: 'mouseUp', x: at.x, y: at.y, button: 'left', clickCount: 1 });
    await this.settle(wc);
    const after = await this.state(wc, n);
    this.checkChallenge(p, after);
    return { title: p.title, url: p.url, changed: this.told(before, after, { n, field: ['text', 'search', 'select'].includes(it?.kind ?? '') }), ...(waited ? { waited } : {}) };
  }

  /** A key on whatever has the cursor: Escape, Tab, Shift+Tab, arrows, Enter, Page Up/Down, Home, End, Space. */
  async key(pageId: number, key: string): Promise<{ title: string; url: string; changed: string[] }> {
    const KEYS: Record<string, { code: string; shift?: boolean }> = { escape: { code: 'Escape' }, tab: { code: 'Tab' }, 'shift+tab': { code: 'Tab', shift: true }, enter: { code: 'Enter' },
      up: { code: 'Up' }, down: { code: 'Down' }, left: { code: 'Left' }, right: { code: 'Right' }, pageup: { code: 'PageUp' }, pagedown: { code: 'PageDown' }, home: { code: 'Home' }, end: { code: 'End' }, space: { code: 'Space' } };
    const k = KEYS[String(key ?? '').toLowerCase().replace(/^arrow/, '').replace(/\s+/g, '')];
    if (!k) throw new Error('that key is not one of: Escape, Tab, Shift+Tab, Enter, Up, Down, Left, Right, Page Up, Page Down, Home, End, Space');
    const { p, wc } = this.wcOf(pageId);
    const before = await this.state(wc, null);
    const mods = k.shift ? ['shift' as const] : [];
    wc.sendInputEvent({ type: 'keyDown', keyCode: k.code, modifiers: mods });
    if (k.code === 'Enter') wc.sendInputEvent({ type: 'char', keyCode: '\r' });
    if (k.code === 'Space') wc.sendInputEvent({ type: 'char', keyCode: ' ' });
    wc.sendInputEvent({ type: 'keyUp', keyCode: k.code, modifiers: mods });
    await this.settle(wc);
    const after = await this.state(wc, null);
    this.checkChallenge(p, after);
    return { title: p.title, url: p.url, changed: this.told(before, after) };
  }
  /** What has the cursor now, for weighing Enter. */
  async focused(pageId: number): Promise<number | null> { const { wc } = this.wcOf(pageId); return (await this.state(wc, null)).focus; }

  /** Pick in a dropdown: a native one directly; a custom one by opening it and clicking the option with those words. */
  async choose(pageId: number, n: number, option: string): Promise<{ title: string; url: string; changed: string[]; options?: string[] }> {
    const { p, wc } = this.wcOf(pageId);
    const before = await this.state(wc, n);
    const r = await wc.executeJavaScriptInIsolatedWorld(WORLD, [{ code: SELECT_JS(n, option) }]) as { gone?: boolean; native?: boolean; found?: boolean; picked?: string; options?: string[] };
    if (r.gone) throw new Error(`control ${n} is not on the page any more; read the page again`);
    if (r.native && !r.found) return { title: p.title, url: p.url, changed: [`no option matches "${option}"`], options: r.options };
    if (!r.native) {
      await this.click(pageId, n);
      const opened = await this.read(pageId);
      const w = String(option).toLowerCase().trim();
      const o = opened.items.find((x) => (x.role === 'option' || x.role === 'menuitem' || x.role === 'li') && x.label.toLowerCase() === w) ?? opened.items.find((x) => (x.role === 'option' || x.role === 'menuitem') && x.label.toLowerCase().includes(w));
      if (!o) return { title: p.title, url: p.url, changed: [`the list opened, but no option says "${option}"`], options: opened.items.filter((x) => x.role === 'option' || x.role === 'menuitem').map((x) => x.label).slice(0, 40) };
      await this.click(pageId, o.n);
    } else await this.settle(wc);
    const after = await this.state(wc, n);
    return { title: p.title, url: p.url, changed: this.told(before, after) };
  }

  /** Back or forward in the page's own history. */
  async history(pageId: number, back: boolean): Promise<{ title: string; url: string; changed: string[] }> {
    const { p, wc } = this.wcOf(pageId);
    const h = wc.navigationHistory;
    if (back ? !h.canGoBack() : !h.canGoForward()) throw new Error(`there is no page to go ${back ? 'back' : 'forward'} to`);
    const before = await this.state(wc, null);
    const waited = await this.pace(p.url);
    if (back) h.goBack(); else h.goForward();
    await this.settle(wc, Promise.resolve());
    const after = await this.state(wc, null);
    this.checkChallenge(p, after);
    return { title: p.title, url: p.url, changed: this.told(before, after), ...(waited ? { waited } : {}) } as { title: string; url: string; changed: string[] };
  }

  /** Type into a numbered field, replacing what is there; Enter after, if asked. */
  async type(pageId: number, n: number, text: string, enter: boolean): Promise<{ title: string; url: string; changed: string[] }> {
    const { p, wc } = this.wcOf(pageId);
    const focusJs = (k: number) => `(() => { ${DEEP} const e = __byN(${Number(k)}); if (!e) return false; e.scrollIntoView({ block: 'center' }); e.focus(); if (e.select) e.select(); return true; })()`;
    const ok = await wc.executeJavaScriptInIsolatedWorld(WORLD, [{ code: focusJs(n) }]);
    if (!ok) throw new Error(`field ${n} is not on the page any more; read the page again`);
    const before = await this.state(wc, n);
    wc.insertText(String(text).slice(0, 500));
    if (enter) {
      wc.sendInputEvent({ type: 'keyDown', keyCode: 'Enter' });
      wc.sendInputEvent({ type: 'char', keyCode: '\r' });
      wc.sendInputEvent({ type: 'keyUp', keyCode: 'Enter' });
      await this.settle(wc);
    } else await new Promise((r) => setTimeout(r, 200));
    const after = await this.state(wc, n);
    this.checkChallenge(p, after);
    return { title: p.title, url: p.url, changed: this.told(before, after) };
  }

  async scroll(pageId: number, down: boolean): Promise<void> {
    const { wc } = this.wcOf(pageId);
    await wc.executeJavaScriptInIsolatedWorld(WORLD, [{ code: `window.scrollBy(0, ${down ? '' : '-'}Math.round(innerHeight * 0.85))` }]);
    await new Promise((r) => setTimeout(r, 400));
  }

  /** A picture: of one numbered control, of the best picture or video on the page ('best'), or of what is in view. */
  async picture(pageId: number, what: number | 'best' | 'view' | 'marks'): Promise<{ png: Buffer; video: boolean; width: number; height: number }> {
    const { wc } = this.wcOf(pageId);
    if (what === 'marks') {
      await this.read(pageId);
      await wc.executeJavaScriptInIsolatedWorld(WORLD, [{ code: MARKS_JS(true) }]);
      try { return await this.picture(pageId, 'view'); } finally { await wc.executeJavaScriptInIsolatedWorld(WORLD, [{ code: MARKS_JS(false) }]).catch(() => {}); }
    }
    let rect: { x: number; y: number; width: number; height: number } | undefined;
    let video = false;
    if (what === 'best') {
      const m = await wc.executeJavaScriptInIsolatedWorld(WORLD, [{ code: BEST_MEDIA_JS }]) as { left: number; top: number; w: number; h: number; video: boolean } | null;
      if (m) { await new Promise((r) => setTimeout(r, 400)); const again = await wc.executeJavaScriptInIsolatedWorld(WORLD, [{ code: BEST_MEDIA_JS }]) as typeof m; const b = again ?? m; rect = { x: b.left, y: b.top, width: b.w, height: b.h }; video = b.video; }
    } else if (typeof what === 'number') {
      const at = await wc.executeJavaScriptInIsolatedWorld(WORLD, [{ code: SPOT_JS(what) }]) as { left: number; top: number; w: number; h: number } | null;
      if (!at) throw new Error(`control ${what} is not on the page any more`);
      await new Promise((r) => setTimeout(r, 300));
      rect = { x: Math.max(0, at.left), y: Math.max(0, at.top), width: Math.min(W, at.w), height: Math.min(H, at.h) };
    }
    wc.invalidate();
    await new Promise((r) => setTimeout(r, 150));
    const img = await wc.capturePage(rect && rect.width > 4 && rect.height > 4 ? rect : undefined);
    if (img.isEmpty()) throw new Error('the page gave no picture');
    const s = img.getSize();
    const fit = s.width > 1600 ? img.resize({ width: 1600, quality: 'good' }) : img;
    const f = fit.getSize();
    return { png: fit.toPNG(), video, width: f.width, height: f.height };
  }

  close(pageId: number): void {
    const i = this.pages.findIndex((p) => p.id === pageId);
    if (i < 0) return;
    const p = this.pages[i]!;
    this.pages.splice(i, 1);
    this.items.delete(p.id);
    this.lastRead.delete(p.id);
    const j = this.job(p.job);
    if (j) j.pages = j.pages.filter((x) => x !== p.id);
    try { p.win.destroy(); } catch { /* gone */ }
    if (j && !j.pages.length && !j.working) this.jobs.splice(this.jobs.indexOf(j), 1);
    this.d.changed();
  }
  closeJob(jobId: number): void { const j = this.job(jobId); if (!j) return; this.stop(jobId); for (const id of [...j.pages]) this.close(id); const i = this.jobs.indexOf(j); if (i >= 0) this.jobs.splice(i, 1); this.d.changed(); }
  /** After a day his pages close themselves (his call). */
  private sweep(): void {
    const now = Date.now();
    for (const p of [...this.pages]) { const j = this.job(p.job); if (!j?.working && now - p.at > KEEP_MS) this.close(p.id); }
  }
  /** For the drawer: plain data only. */
  view(): { id: number; kind: DriverKind; name: string; working: boolean; stopped: boolean; pages: { id: number; title: string; url: string; favicon: string }[] }[] {
    return this.jobs.map((j) => ({ id: j.id, kind: j.kind, name: j.name, working: j.working, stopped: j.stopped,
      pages: this.pagesOf(j).map((p) => ({ id: p.id, title: p.title, url: p.url, favicon: p.favicon })) }));
  }
  /** A quick picture of a page for him to watch it work (the drawer's live view). */
  async glance(pageId: number): Promise<string | null> {
    const p = this.page(pageId);
    if (!p) return null;
    try { const img = await p.win.webContents.capturePage(); if (img.isEmpty()) return null; return 'data:image/jpeg;base64,' + img.resize({ width: 960, quality: 'good' }).toJPEG(75).toString('base64'); } catch { return null; }
  }
  closeAll(): void { for (const p of [...this.pages]) { try { p.win.destroy(); } catch { /* gone */ } } this.pages.length = 0; this.jobs.length = 0; }
}
