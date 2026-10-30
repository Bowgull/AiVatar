// Sheet 106 v7 (his yes, 2026-10-30): the notice layer. Samara sends one notice at a time (the queue is in notices.ts);
// this draws it from the plan card's tray pieces, drops it in, plays the one sound for "needs you", and says which button
// he pressed. Everything is built with textContent: file names and sites are the websites' own words.
import { pixIcon } from './pixicons.js';

const stage = document.getElementById('stage');
const T = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = String(text); return n; };
const EXT = { zip: 'ZIP', pdf: 'PDF', img: 'IMG', exe: 'EXE', doc: 'DOC', av: 'A/V', file: 'FILE' };
// Where the four sparkles start round the gem and how far they drift (sheet 106's own numbers).
const SPARKS = [[-16, -14, 2, -4], [18, -16, 30, -6], [-20, 10, -4, 26], [20, 12, 32, 28]];
const PAD = { x: 16, top: 10, bottom: 22 };
let cur = null, el = null, picked = null;

// ---- the one sound, made here like Samara's wood taps (no sound files): two soft bell notes, rising
let audio = null;
function chime() {
  try {
    audio ??= new AudioContext();
    const now = audio.currentTime;
    for (const [f, at] of [[880, 0], [1318.5, 0.11]]) {
      const o = audio.createOscillator(), g = audio.createGain();
      o.type = 'sine'; o.frequency.value = f;
      g.gain.setValueAtTime(0, now + at);
      g.gain.linearRampToValueAtTime(0.16, now + at + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0008, now + at + 0.55);
      o.connect(g).connect(audio.destination);
      o.start(now + at); o.stop(now + at + 0.6);
    }
  } catch { /* no sound, no harm */ }
}

function badge(kind) {
  const b = T('i', 'fb ' + (EXT[kind] ? kind : 'file'));
  b.append(T('b', '', EXT[kind] ?? 'FILE'));
  return b;
}
function gem(n) {
  const s = T('span', 'sock' + (n.claude ? ' claude' : ''));
  const ic = T('span', 'ic');
  ic.append(pixIcon(n.claude ? 'claude' : n.icon || { done: 'yes', need: 'bell', bad: 'wont' }[n.kind], 2) ?? T('span'));
  s.append(ic);
  if (!n.small) for (const [dx, dy, l, t] of SPARKS) { const i = T('i', 'spark'); i.style.cssText = `left:${l}px;top:${t}px;--dx:${dx}px;--dy:${dy}px`; s.append(i); }
  return s;
}
function key(k, i, n) {
  const b = T('button', 'key sm' + (i === 0 && !k.plain ? ' primary' : ''), k.label);
  b.type = 'button';
  b.addEventListener('click', () => press(k.act, b));
  if (n.picks && k.act === 'allow') b.disabled = !picked;
  return b;
}
function press(act, b) {
  if (!cur) return;
  const n = cur.notice;
  let value;
  if (act === 'code') {
    value = codeOf();
    if (value.length !== 6) { [...el.querySelectorAll('.tvcode input')].find((x) => !x.value)?.focus(); return; }
  }
  if (act === 'allow' && n.picks) { if (!picked) return; value = picked; }
  if (b) b.disabled = true;
  window.aangNotice?.act(n.id, act, value);
}
const codeOf = () => [...(el?.querySelectorAll('.tvcode input') ?? [])].map((x) => x.value).join('').toUpperCase();

function parchment(n) {
  const out = [];
  if (n.files?.length) {
    const box = T('div', 'uplist files');
    for (const f of n.files) {
      const row = T('div', 'drow');
      const t = T('span', 'dt');
      t.append(T('b', '', f.name), T('small', '', f.meta));
      row.append(badge(f.kind), t);
      row.title = 'Drag it into Claude, Aang, a folder or the desktop. Click to open.';
      row.draggable = true;
      row.addEventListener('dragstart', (e) => { e.preventDefault(); window.aangNotice?.drag(f.id); });
      row.addEventListener('click', () => window.aangNotice?.open(f.id));
      box.append(row);
    }
    out.push(box);
  }
  if (n.rows?.length || n.picks || n.code) {
    const box = T('div', 'uplist');
    for (const r of n.rows ?? []) { if (r.g) box.append(T('div', 'grp', r.g)); box.append(T('div', 'v', r.v)); }
    if (n.picks) {
      const list = T('div', 'picks');
      for (const p of n.picks) {
        const b = T('button', 'dev'); b.type = 'button'; b.setAttribute('aria-pressed', String(p.id === picked));
        const t = T('span', 't'); t.append(p.name, T('small', '', p.how));
        b.append(pixIcon('keyboard', 2) ?? T('span'), t);
        b.addEventListener('click', () => { picked = p.id; list.querySelectorAll('.dev').forEach((x) => x.setAttribute('aria-pressed', String(x === b))); const a = el.querySelector('.upfoot .key.primary'); if (a) a.disabled = false; });
        b.addEventListener('dblclick', () => { picked = p.id; press('allow'); });
        list.append(b);
      }
      box.append(list);
    }
    if (n.code) {
      const code = T('div', 'tvcode');
      for (let i = 0; i < 6; i++) {
        const x = T('input'); x.maxLength = 1; x.setAttribute('aria-label', `Code ${i + 1}`); x.spellcheck = false; x.autocomplete = 'off';
        x.addEventListener('input', () => { x.value = x.value.replace(/[^0-9a-z]/gi, '').slice(-1).toUpperCase(); if (x.value) x.nextElementSibling?.focus(); if (codeOf().length === 6) press('code'); });
        x.addEventListener('keydown', (e) => { if (e.key === 'Backspace' && !x.value && x.previousElementSibling) { x.previousElementSibling.focus(); x.previousElementSibling.value = ''; } if (e.key === 'Enter') press('code'); });
        x.addEventListener('paste', (e) => {
          const t = (e.clipboardData?.getData('text') || '').replace(/[^0-9a-z]/gi, '').toUpperCase().slice(0, 6); if (!t) return;
          e.preventDefault(); [...code.children].forEach((b, j) => { b.value = t[j] ?? ''; }); if (t.length === 6) press('code'); else code.children[t.length]?.focus();
        });
        code.append(x);
      }
      box.append(code);
      if (n.err) box.append(T('p', 'err', n.err));
    }
    out.push(box);
  }
  return out;
}

function draw(s) {
  const n = s.notice, was = el;
  if (s.fresh || !cur || cur.notice.id !== n.id) picked = n.picks?.length === 1 ? n.picks[0].id : (n.picked ?? null);
  const box = T('div', `nt dltray uptray upx kind-${n.kind}${n.small ? ' small' : ''}`);
  box.setAttribute('role', n.kind === 'need' ? 'alertdialog' : 'status');
  const hd = T('div', 'uphd');
  const t = T('div', 't'); t.append(T('small', '', n.kick), T('b', '', n.title));
  hd.append(gem(n), t);
  const count = s.of > 1 ? T('span', 'count', `${s.at} of ${s.of}`) : null;
  box.append(T('div', 'caps'), hd);
  if (n.small) {
    // a small one with Undo carries its key in the header strip
    if (n.keys?.length) hd.append(key(n.keys[0], 1, n));
    if (count) hd.append(count);
    box.append(T('span', 'drain'));
  } else {
    if (count) hd.append(count);
    box.append(...parchment(n));
    if (n.keys?.length) { const f = T('div', 'upfoot'); n.keys.forEach((k, i) => f.append(key(k, i, n))); box.append(f); }
  }
  box.addEventListener('mouseenter', () => { box.classList.add('held'); window.aangNotice?.hover(true); });
  box.addEventListener('mouseleave', () => { box.classList.remove('held'); window.aangNotice?.hover(false); });
  if (s.fresh || !was) {
    was?.remove();
    stage.append(box);
    void box.offsetWidth;
    box.classList.add('drop', 'live');
    if (s.sound) chime();
  } else {
    // the same notice, changed in place (a file joined it, the code was wrong): no second drop, and the drain keeps going
    const left = was.querySelector('.drain');
    if (left && n.small) box.querySelector('.drain')?.replaceWith(left);
    if (was.classList.contains('held')) box.classList.add('held');
    box.classList.add('live');
    was.replaceWith(box);
    if (n.code && n.err) { const c = box.querySelector('.tvcode'); c?.classList.add('wrong'); }
  }
  el = box; cur = s;
  if (n.code) setTimeout(() => { if (el === box) box.querySelector('.tvcode input')?.focus(); }, 380);
  ro.disconnect(); ro.observe(box);
  sizeNow();
}
function leave() {
  const box = el;
  cur = null; el = null; picked = null;
  if (!box) return;
  box.classList.remove('drop'); void box.offsetWidth; box.classList.add('rise');
  setTimeout(() => box.remove(), 320);
}
// The layer is exactly the notice and its margins, so it never covers the page round it.
const ro = new ResizeObserver(() => sizeNow());
function sizeNow() {
  if (!el) return;
  window.aangNotice?.size(Math.ceil(el.offsetWidth + PAD.x * 2), Math.ceil(el.offsetHeight + PAD.top + PAD.bottom));
}
window.aangNotice?.on((m) => { if (!m || m.leave) leave(); else if (m.notice) draw(m); });
// for the harness: draw without Samara
window.noticeDraw = (m) => { if (!m || m.leave) leave(); else draw(m); };
