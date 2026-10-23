import { pixIcon } from './pixicons.js';
// The browser's Settings page, sheet 83 v2 (2026-10-23). Draws what the Shell sends (all text by textContent) and sends
// back only: a setting key and value, an entry to take off one of his lists, an address to look up, or a few actions.
const $ = (s, r = document) => r.querySelector(s);
const S = window.settings;
let data = null;

// Pixel pieces, drawn here (static strings only, never page data).
const svg = (vb, d) => { const n = new DOMParser().parseFromString(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb}" shape-rendering="crispEdges"><path d="${d}"/></svg>`, 'image/svg+xml').documentElement; return document.importNode(n, true); };
const LEFT = () => svg('0 0 5 7', 'M3 0h2v1H4v1H3v1H2v1h1v1h1v1h1v1H3V6H2V5H1V4H0V3h1V2h1V1h1z');
const RIGHT = () => svg('0 0 5 7', 'M0 0h2v1h1v1h1v1h1v1H4v1H3v1H2v1H0V6h1V5h1V4h1V3H2V2H1V1H0z');
const TICK = () => svg('0 0 8 7', 'M7 0h1v2H7v1H6v1H5v1H4v1H3v1H2V6H1V5H0V3h1v1h1v1h1V4h1V3h1V2h1V1h1z');
const EYE = () => svg('0 0 11 7', 'M3 0h5v1h2v1h1v3h-1v1H8v1H3V6H1V5H0V2h1V1h2zM4 2v3h3V2zM5 3h1v1H5z');
for (const g of document.querySelectorAll('.go')) g.append(RIGHT());
for (const a of document.querySelectorAll('.ar')) a.append(a.classList.contains('l') ? LEFT() : RIGHT());
for (const o of document.querySelectorAll('.ok')) o.append(TICK());
$('#eye').append(EYE());

// ---- chapters and one level in; the glove points at the open chapter
const ALIAS = { general: 'start', passwords: 'autofill', sound: 'sounds' };
const ALL = [...document.querySelectorAll('section[data-sec]')].map((s) => s.dataset.sec);
let current = 'start';
function show(sec) {
  const name = ALL.includes(ALIAS[sec] ?? sec) ? (ALIAS[sec] ?? sec) : 'start';
  const el = document.querySelector(`section[data-sec="${name}"]`);
  const chapter = el.dataset.up ?? name;
  for (const s of document.querySelectorAll('section[data-sec]')) s.hidden = s !== el;
  for (const a of document.querySelectorAll('.side a')) a.classList.toggle('on', a.dataset.sec === chapter);
  if (current === 'start' && name !== 'start') homeDone(false);
  current = name;
  helpNow('');
  if (name === 'details') fillDetails();
  if (name === 'pin') pinReset();
}
for (const a of document.querySelectorAll('.side a')) a.addEventListener('click', (e) => { e.preventDefault(); show(a.dataset.sec); });
for (const b of document.querySelectorAll('[data-back]')) b.addEventListener('click', () => show(b.closest('section').dataset.up));
S?.onSection?.((s) => show(String(s)));

// ---- the help line: the row the glove has rested on for half a second (his ask: sweeping past rows shows nothing)
let helpFor = null, helpWait = 0;
const helpNow = (t) => { $('#help').textContent = t; };
document.addEventListener('mouseover', (e) => {
  const r = e.target.closest('[data-help]');
  if (r === helpFor) return;
  helpFor = r; clearTimeout(helpWait); helpNow('');
  if (r?.dataset.help) helpWait = setTimeout(() => { if (helpFor === r) helpNow(r.dataset.help); }, 500);
});

// ---- ‹ value ›: the word is what it is set to; either arrow moves it, and so does a click on the row
const ONOFF = [[true, 'On'], [false, 'Off']];
const CYCLE = {
  startup: [['tabs', 'My tabs'], ['home', 'Home page']], dark: ONOFF, tabSize: [['s', 'Small'], ['m', 'Medium'], ['l', 'Large']],
  search: [['brave', 'Brave'], ['ddg', 'DuckDuckGo'], ['google', 'Google'], ['yandex', 'Yandex']], aiBox: ONOFF, ads: ONOFF, popups: ONOFF, sounds: ONOFF, afSounds: ONOFF,
  lockAfter: [['5m', '5 min'], ['30m', '30 min'], ['2h', '2 hours'], ['quit', 'Until I quit']],
};
for (const r of document.querySelectorAll('[data-cyc]')) {
  const key = r.dataset.cyc;
  const c = Object.assign(document.createElement('div'), { className: 'cyc' });
  const mk = (d) => { const b = Object.assign(document.createElement('button'), { type: 'button', className: 'ar' }); b.setAttribute('aria-label', d < 0 ? 'Back' : 'Next'); b.append(d < 0 ? LEFT() : RIGHT()); b.addEventListener('click', (e) => { e.stopPropagation(); step(key, d); }); return b; };
  c.append(mk(-1), Object.assign(document.createElement('span'), { className: 'v' }), mk(1));
  r.append(c);
  r.addEventListener('click', () => step(key, 1));
}
function step(key, d) {
  const l = CYCLE[key], now = l.findIndex(([v]) => v === data?.[key]);
  const [v] = l[((now < 0 ? 0 : now) + d + l.length) % l.length];
  if (data) { data[key] = v; paintCycles(); }
  S?.set(key, v);
}
function paintCycles() {
  for (const r of document.querySelectorAll('[data-cyc]')) {
    const hit = CYCLE[r.dataset.cyc].find(([v]) => v === data?.[r.dataset.cyc]);
    r.querySelector('.v').textContent = hit ? hit[1] : '';
  }
}
for (const b of document.querySelectorAll('[data-act]')) b.addEventListener('click', () => S?.act(b.dataset.act));

// ---- one-level rows (›)
for (const r of document.querySelectorAll('[data-go]')) r.addEventListener('click', () => { if (r.dataset.go === 'home') homeEdit(); else show(r.dataset.go); });

// ---- the home page: the row shows what is really saved; a click turns it into the box, Enter or leaving it saves
const bare = (u) => String(u ?? '').replace(/^https:\/\//, '').replace(/\/$/, '');
function homeEdit() {
  $('#homerow').hidden = true; $('#homeedit').hidden = false;
  const i = $('#homein'); i.value = bare(data?.homeNow); i.focus(); i.select();
}
function homeDone(save) {
  if ($('#homeedit').hidden) return;
  $('#homeedit').hidden = true; $('#homerow').hidden = false;
  const v = $('#homein').value.trim();
  if (save && v !== bare(data?.homeNow)) S?.set('home', v);
}
$('#homein').addEventListener('keydown', (e) => { if (e.key === 'Enter') homeDone(true); if (e.key === 'Escape') homeDone(false); });
$('#homein').addEventListener('blur', () => homeDone(true));

// ---- your details: kept the moment a box is left; the address box looks his address up (OpenStreetMap)
const AF = ['given', 'family', 'phone', 'street', 'city', 'region', 'postal', 'country'];
const picked = {};   // what the lookup filled in this time (those boxes get the tick while they are unchanged)
function fillDetails() {
  const d = data?.autofill?.details ?? {};
  for (const k of AF) $('#af-' + k).value = d[k] ?? '';
  $('#af-emails').value = (d.emails ?? []).join(', ');
  ticks();
}
function saveDetails() {
  const v = { emails: $('#af-emails').value.split(/[,\s]+/).filter(Boolean) };
  for (const k of AF) v[k] = $('#af-' + k).value;
  S?.set('afDetails', v);
}
// A postal code that has the shape of one (Canada A1A 1A1, US 12345 or 12345-6789) gets its tick, typed or found.
const POSTAL = /^([A-Za-z]\d[A-Za-z] ?\d[A-Za-z]\d|\d{5}(-\d{4})?)$/;
function ticks() {
  for (const t of document.querySelectorAll('[data-ok]')) {
    const k = t.dataset.ok, v = $('#af-' + k).value.trim();
    t.hidden = !v || !(picked[k] === v || (k === 'postal' && POSTAL.test(v)));
  }
}
for (const k of ['emails', ...AF]) {
  const i = $('#af-' + k);
  if (!i) continue;
  i.addEventListener('change', () => { if (k === 'postal' && POSTAL.test(i.value.trim())) i.value = i.value.trim().toUpperCase().replace(/^([A-Z]\d[A-Z]) ?(\d[A-Z]\d)$/, '$1 $2'); saveDetails(); ticks(); });
  i.addEventListener('input', ticks);
}
let lookWait = 0, lookSeq = 0, found = [], hi = 0;
const sug = $('#sug');
function sugDraw() {
  sug.replaceChildren();
  if (!found.length) { sug.hidden = true; return; }
  found.forEach((a, i) => {
    const d = Object.assign(document.createElement('div'), { textContent: a.line, className: i === hi ? 'hi' : '' });
    d.addEventListener('mousedown', (e) => { e.preventDefault(); pick(i); });
    sug.append(d);
  });
  sug.append(Object.assign(document.createElement('small'), { textContent: 'OPENSTREETMAP' }));
  sug.hidden = false;
}
function pick(i) {
  const a = found[i]; if (!a) return;
  for (const k of ['street', 'city', 'region', 'postal', 'country']) { if (a[k]) { $('#af-' + k).value = a[k]; picked[k] = a[k]; } }
  found = []; sugDraw(); saveDetails(); ticks();
}
$('#af-street').addEventListener('input', () => {
  clearTimeout(lookWait);
  const q = $('#af-street').value.trim();
  if (q.length < 4) { found = []; sugDraw(); return; }
  const seq = ++lookSeq;
  lookWait = setTimeout(async () => {
    const r = await S?.lookup?.(q).catch(() => null);
    if (seq !== lookSeq) return;
    found = Array.isArray(r) ? r.slice(0, 5) : []; hi = 0; sugDraw();
  }, 350);
});
$('#af-street').addEventListener('keydown', (e) => {
  if (sug.hidden) return;
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); hi = (hi + (e.key === 'ArrowDown' ? 1 : -1) + found.length) % found.length; sugDraw(); }
  if (e.key === 'Enter') { e.preventDefault(); pick(hi); }
  if (e.key === 'Escape') { found = []; sugDraw(); }
});
$('#af-street').addEventListener('blur', () => setTimeout(() => { found = []; sugDraw(); }, 120));

// ---- the PIN: he picks 4 to 8; one slot per number; the eye shows them; typed twice
let pinLen = 6, pin1 = '', pin2 = '', eye = false;
function pinReset() { pin1 = ''; pin2 = ''; eye = false; pinLen = data?.autofill?.pinLen || 6; $('#pinsay').textContent = ''; pinDraw(); setTimeout(() => $('#pin1').focus(), 0); }
function pinDraw() {
  $('#pinlen').textContent = `${pinLen} numbers`;
  for (const [id, v] of [['pin1', pin1], ['pin2', pin2]]) {
    const box = $('#' + id); box.replaceChildren();
    for (let i = 0; i < pinLen; i++) box.append(Object.assign(document.createElement('i'), { className: i < v.length ? 'f' : '', textContent: i < v.length ? (eye ? v[i] : '●') : '' }));
  }
  $('#pinrow1').classList.toggle('lit', pin1.length < pinLen);
  $('#pinrow2').classList.toggle('lit', pin1.length === pinLen);
  $('#eye').classList.toggle('on', eye);
  $('#eye').setAttribute('aria-label', eye ? 'Hide PIN' : 'Show PIN');
}
for (const b of document.querySelectorAll('[data-len]')) b.addEventListener('click', () => { pinLen = Math.min(8, Math.max(4, pinLen + Number(b.dataset.len))); pin1 = pin1.slice(0, pinLen); pin2 = pin2.slice(0, pinLen); pinDraw(); $('#pin1').focus(); });
$('#eye').addEventListener('click', () => { eye = !eye; pinDraw(); $('#pin1').focus(); });
for (const id of ['pin1', 'pin2']) $('#' + id).addEventListener('keydown', (e) => {
  if (/^[0-9]$/.test(e.key)) { e.preventDefault(); if (pin1.length < pinLen) pin1 += e.key; else if (pin2.length < pinLen) pin2 += e.key; pinDraw(); if (pin2.length === pinLen) pinSet(); }
  else if (e.key === 'Backspace') { e.preventDefault(); if (pin2) pin2 = pin2.slice(0, -1); else pin1 = pin1.slice(0, -1); pinDraw(); }
  else if (e.key === 'Enter') { e.preventDefault(); pinSet(); }
});
function pinSet() { if (pin1.length !== pinLen) return; S?.set('afPin', { pin: pin1, again: pin2 }); }
$('#pinset').addEventListener('click', pinSet);
S?.onAfPin?.((r) => { $('#pinsay').textContent = r?.text ?? ''; if (!r?.ok) { pin1 = ''; pin2 = ''; pinDraw(); } });

// ---- Your sites (sheet 37): one row per site, the same rules as the shield. Four are on/off, camera and mic allow / ask / block.
const YS_COLS = [['ai', 'ai', 2, 'Claude and Aang'], ['login', 'key', 2, 'Use my login'], ['ads', 'ads', 2, 'Ad blocker'], ['popups', 'popup', 2, 'Popup blocker'], ['dark', 'moon', 2, 'Dark mode'], null, ['camera', 'camera', 3, 'Camera'], ['mic', 'mic', 3, 'Microphone']];
const YS_WORD = { on: 'ON', off: 'OFF', allow: 'ALLOW', ask: 'ASK', block: 'BLOCK', never: 'NEVER' };
function siteRows(list) {
  const box = $('#yoursites');
  const q = ($('#sitefind').value || '').trim().toLowerCase();
  box.replaceChildren();
  const shown = list.filter((s) => !q || s.host.includes(q));
  if (!shown.length) { box.append(Object.assign(document.createElement('div'), { className: 'ysempty', textContent: list.length ? 'No site matches.' : 'None yet.' })); return; }
  for (const s of shown) {
    const r = Object.assign(document.createElement('div'), { className: 'ysgrid ysrow' });
    const b = document.createElement('b');
    // The site's own icon, the one Samara keeps; a pixel globe for a site whose icon it has not seen yet.
    const globe = () => { const g = Object.assign(document.createElement('span'), { className: 'globe' }); const p = pixIcon('globe', 2); if (p) g.append(p); return g; };
    let f = globe();
    if (s.favicon) { f = Object.assign(document.createElement('img'), { className: 'fav', alt: '' }); f.onerror = () => f.replaceWith(globe()); f.src = s.favicon; }
    b.append(f, Object.assign(document.createElement('span'), { className: 'nm', textContent: s.host }));
    if (s.bank) b.append(Object.assign(document.createElement('small'), { textContent: 'BANK: CHROME ONLY' }));
    r.append(b);
    for (const c of YS_COLS) {
      if (!c) { r.append(document.createElement('span')); continue; }
      const [key, icon, kind, name] = c;
      const st = s.bank && (key === 'ai' || key === 'login') ? 'never' : kind === 2 ? (s[key] ? 'on' : 'off') : (s[key] === 'allow' ? 'on' : s[key]);
      if (s.bank && key !== 'ai' && key !== 'login') { r.append(document.createElement('span')); continue; }
      const cell = Object.assign(document.createElement('span'), { className: 'yscell ' + (st === 'off' ? '' : st) });
      const slot = Object.assign(document.createElement('button'), { type: 'button', className: 'slot ' + (st === 'off' ? '' : st), title: name });
      slot.setAttribute('aria-label', `${name} on ${s.host}: ${YS_WORD[st === 'on' && kind === 3 ? 'allow' : st]}`);
      if (st !== 'never') { const p = pixIcon(icon, 2.4); if (p) slot.append(p); }
      else slot.disabled = true;
      slot.addEventListener('click', () => {
        if (st === 'never') return;
        if (kind === 2) S?.siteRule(s.host, key, !s[key]);
        else S?.siteRule(s.host, key, ({ allow: 'ask', ask: 'block', block: 'allow' })[s[key]] ?? 'ask');
      });
      cell.append(slot, Object.assign(document.createElement('i'), { textContent: YS_WORD[st === 'on' && kind === 3 ? 'allow' : st] }));
      r.append(cell);
    }
    const x = Object.assign(document.createElement('button'), { className: 'x', type: 'button', textContent: 'x', title: 'Forget every rule for ' + s.host });
    x.addEventListener('click', () => S?.siteClear(s.host));
    r.append(x);
    box.append(r);
  }
}
for (const el of document.querySelectorAll('.yskey [data-pix]')) { const p = pixIcon(el.dataset.pix, 2); if (p) el.append(p); }
$('#sitefind').addEventListener('input', () => siteRows(data?.sites ?? []));

function chips(id, list, name) {
  const box = $('#' + id);
  box.replaceChildren();
  if (!list.length) { box.append(Object.assign(document.createElement('span'), { className: 'empty', textContent: 'None yet.' })); return; }
  for (const host of list) {
    const c = Object.assign(document.createElement('span'), { className: 'chip' });
    const x = Object.assign(document.createElement('button'), { className: 'x', type: 'button', textContent: 'x', title: 'Take ' + host + ' off this list' });
    x.setAttribute('aria-label', 'Remove ' + host);
    x.addEventListener('click', () => S?.remove(name, host));
    c.append(host, x);
    box.append(c);
  }
}

const VAULT = { missing: 'NOT INSTALLED', 'signed-out': 'SIGNED OUT', locked: 'LOCKED', unlocked: 'UNLOCKED' };
const n = (k, one, many) => (k ? `${k} ${k === 1 ? one : many}` : '');
function paint(d) {
  if (!d) return;
  data = d;
  paintCycles();
  $('#homev').textContent = bare(d.homeNow);
  // autofill
  const det = d.autofill?.details ?? {};
  const has = det.given || det.family || det.emails?.length || det.phone || det.street;
  $('#detailsv').textContent = has ? 'Set' : 'Not set';
  $('#detailsv').classList.toggle('dim', !has);
  $('#pinv').textContent = d.autofill?.pin ? `${d.autofill.pinLen || 4} numbers` : 'Not set';
  $('#pinv').classList.toggle('dim', !d.autofill?.pin);
  $('#pinforget').hidden = !d.autofill?.pin;
  $('#pinset').textContent = d.autofill?.pin ? 'Change' : 'Set';
  const vw = VAULT[d.vault] ?? '';
  $('#bwv').textContent = vw ? vw[0] + vw.slice(1).toLowerCase() : '';
  $('#bwstate').textContent = vw;
  $('#lockbtn').hidden = d.vault !== 'unlocked';
  $('#signout').hidden = d.vault === 'missing' || d.vault === 'signed-out';
  if (current === 'details' && !document.activeElement?.closest?.('section[data-sec="details"]')) fillDetails();
  // privacy
  const ph = `${Number(d.phish || 0).toLocaleString()} known fake sites and addresses, refreshed every day.`;
  $('#phishsafe').dataset.help = ph;
  $('#sitesv').textContent = n((d.sites ?? []).length, 'site', 'sites');
  $('#excv').textContent = n((d.trusted ?? []).length + (d.httpOk ?? []).length, 'site', 'sites');
  siteRows(d.sites ?? []);
  chips('trusted', d.trusted ?? [], 'trusted');
  chips('httpOk', d.httpOk ?? [], 'httpOk');
  // about
  $('#enginev').textContent = `CHROMIUM ${String(d.versions?.chrome ?? '').split('.')[0]}`;
  $('#enginerow').dataset.help = `Chromium ${d.versions?.chrome ?? ''} (Electron ${d.versions?.electron ?? ''}).`;
  // bookmarks (only from the ⋯ menu)
  const ml = $('#marklist');
  ml.replaceChildren();
  for (const m of d.marks ?? []) {
    const row = Object.assign(document.createElement('div'), { className: 'mark' });
    if (m.favicon) { const i = document.createElement('img'); i.alt = ''; i.src = m.favicon; row.append(i); }
    row.append(Object.assign(document.createElement('span'), { textContent: m.title || m.url }), Object.assign(document.createElement('small'), { textContent: m.url }));
    const x = Object.assign(document.createElement('button'), { className: 'x', type: 'button', textContent: 'x', title: 'Remove this bookmark' });
    x.addEventListener('click', () => S?.remove('marks', m.url));
    row.append(x);
    ml.append(row);
  }
  if (!(d.marks ?? []).length) ml.append(Object.assign(document.createElement('span'), { className: 'empty', textContent: 'None yet.' }));
}
S?.onData?.(paint);
S?.get?.().then((d) => { paint(d); show(location.hash.slice(1) || current); }).catch(() => {});
show(location.hash.slice(1));
