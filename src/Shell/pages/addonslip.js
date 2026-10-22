// Sheet 65 (his picks, 2026-10-22): addon updates in the morning brief, and Aang's lines while he updates them.
//
// The Addons slip is built from the brief's own pieces (lt-slip, lt-item, lt-head, lt-txt, the plan card's pixel tick
// .tq, the bubble's keys), exactly as the sheet drew it: tick, the addon's own icon, name, old -> new, one short line,
// a warning tag. Safe ones start ticked; a BIG JUMP or NOT FOR THIS PATCH one starts unticked; ERRORS stays ticked.
// "Update ticked (n)" sends only the CurseForge ids still ticked; the Core uses only ids from the list it sent.
// Everything is textContent: addon names and notes are other people's words. Icons are data: pictures the Core read
// from CurseForge's own cache, or the two program icons shipped here.
const T = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; };
const APP = { wow: 'art/addons/app-wow.png', curseforge: 'art/addons/app-curseforge.png' };
const pic = (src) => (typeof src === 'string' && (/^data:image\/(png|jpeg|webp|gif);base64,/.test(src) ? src : APP[src])) || '';
const img = (src, cls) => { const s = pic(src); if (!s) return null; const i = document.createElement('img'); i.src = s; i.alt = ''; if (cls) i.className = cls; return i; };
const TAG = { 'ERRORS': ['err', 'Errors'], 'BIG JUMP': ['jump', 'Big jump'], 'NOT FOR THIS PATCH': ['patch', 'Not for this patch'] };

/** The slip, or null when there is nothing in it. `hooks.update(ids)` and `hooks.later()` are the two keys. */
export function addonsSlip(a, hooks = {}) {
  if (!a || typeof a !== 'object') return null;
  const rows = Array.isArray(a.rows) ? a.rows.filter((r) => r && Number.isInteger(r.id)) : [];
  const errs = Array.isArray(a.errorsOnly) ? a.errorsOnly.filter((e) => e && typeof e.name === 'string') : [];
  if (!rows.length && !errs.length) return null;
  const s = T('div', 'lt-slip addons samaraplan');
  const h = T('h3', '', 'ADDONS');
  const hs = T('small', ''); const gi = img('wow'); if (gi) hs.append(gi); hs.append(String(a.game || 'WoW')); h.append(hs); s.append(h);
  const on = new Set(rows.filter((r) => r.safe !== false).map((r) => r.id));
  let k1 = null;
  const count = () => { if (k1) { k1.firstChild.textContent = `Update ticked (${on.size})`; k1.disabled = on.size === 0; } };
  for (const r of rows.slice(0, 12)) {
    const it = T('div', 'lt-item' + (on.has(r.id) ? '' : ' off'));
    const hd = T('div', 'lt-head');
    const tq = T('button', 'tq' + (on.has(r.id) ? '' : ' off')); tq.type = 'button';
    tq.setAttribute('aria-label', `Update ${r.name}`);
    tq.addEventListener('click', (e) => {
      e.stopPropagation();
      if (on.has(r.id)) on.delete(r.id); else on.add(r.id);
      const yes = on.has(r.id); tq.classList.toggle('off', !yes); it.classList.toggle('off', !yes); count();
    });
    const tx = T('div', 'lt-txt');
    const b = T('b', '', String(r.name)); const em = T('em', '', `${r.from} → `); em.append(T('i', '', String(r.to))); b.append(em);
    tx.append(b); if (r.what) tx.append(T('span', '', String(r.what)));
    hd.append(tq);
    const ai = img(r.icon, 'aico'); if (ai) hd.append(ai); else hd.append(T('span', 'aico blank'));
    hd.append(tx);
    const tags = (Array.isArray(r.tags) ? r.tags : []).filter((t) => TAG[t]);
    if (tags.length) { const tg = T('div', 'atags'); for (const t of tags) tg.append(T('span', 'atag ' + TAG[t][0], TAG[t][1])); hd.append(tg); }
    it.append(hd); s.append(it);
  }
  if (errs.length) {
    const note = T('p', 'anote');
    errs.slice(0, 4).forEach((e, i) => {
      if (i) note.append(i === Math.min(errs.length, 4) - 1 ? ' and ' : ', ');
      const ei = img(e.icon); if (ei) note.append(ei); note.append(T('b', '', e.name));
    });
    note.append(rows.length ? ' also threw errors. No fix out yet.' : ' threw errors. No fix out yet.');
    s.append(note);
  }
  if (rows.length) {
    const keys = T('div', 'lt-keys');
    k1 = T('button', 'key sm primary'); k1.type = 'button'; k1.append(document.createTextNode(''), T('span', 'k', 'A'));
    const k2 = T('button', 'key sm', 'Not now'); k2.type = 'button'; k2.append(T('span', 'k', 'Z'));
    k1.addEventListener('click', (e) => { e.stopPropagation(); if (!on.size) return; k1.disabled = k2.disabled = true; s.querySelectorAll('.tq').forEach((x) => { x.disabled = true; }); hooks.update?.([...on]); });
    k2.addEventListener('click', (e) => { e.stopPropagation(); s.remove(); hooks.later?.(); });
    keys.append(k1, k2); s.append(keys);
    count();
  }
  return s;
}

/**
 * Aang's line while he works (sheet 65 b, c, d): the progress row under the line (the bar, the percent in big
 * readable numbers, each addon with its icon), and each name in the line wearing its icon once the words are down.
 * Called for every bubble message: anything without `addons` clears the last one's progress.
 */
let iconTimer = 0;
export function addonsLine(m, { scroller, said, fit } = {}) {
  document.querySelectorAll('.aprog').forEach((p) => p.remove());
  clearInterval(iconTimer); iconTimer = 0;
  const a = m && m.addons;
  if (!a || typeof a !== 'object' || !scroller) return;
  const pr = a.progress;
  if (pr && Array.isArray(pr.rows)) {
    const p = T('div', 'aprog');
    const pct = Math.max(0, Math.min(100, Math.round(Number(pr.pct) || 0)));
    const bar = T('div', 'bar'); const segs = T('div', 'segs');
    for (let i = 0; i < 10; i++) segs.append(T('u', i < Math.round(pct / 10) ? 'on' : ''));
    bar.append(segs, T('span', 'pct', `${pct}%`)); p.append(bar);
    const ul = T('ul');
    for (const r of pr.rows.slice(0, 12)) {
      const st = ['done', 'now', 'wait', 'fail'].includes(r.state) ? r.state : 'wait';
      const li = T('li', st); li.append(T('i', 'dot'));
      const ri = img(r.icon); if (ri) li.append(ri);
      li.append(String(r.name ?? ''), T('small', '', String(r.note ?? '')));
      ul.append(li);
    }
    p.append(ul);
    scroller.after(p);
  }
  // The names get their icons when the line is fully on the paper (the reveal writes it word by word).
  const icons = a.icons && typeof a.icons === 'object' ? a.icons : {};
  const names = Object.keys(icons).filter((n) => pic(icons[n])).sort((x, y) => y.length - x.length);
  if (!said || !names.length) { fit?.(); return; }
  const text = String(m.text ?? '').trim();
  let tries = 0;
  iconTimer = setInterval(() => {
    if (++tries > 80) { clearInterval(iconTimer); iconTimer = 0; return; }
    if (said.textContent.replace(/\s+/g, ' ').trim() !== text.replace(/\s+/g, ' ')) return;
    clearInterval(iconTimer); iconTimer = 0;
    for (const n of names) {
      const w = document.createTreeWalker(said, NodeFilter.SHOW_TEXT); let t;
      while ((t = w.nextNode())) {
        if (t.parentElement?.closest('.swk')) continue;
        const i = t.data.indexOf(n); if (i < 0) continue;
        const rest = t.splitText(i); rest.splitText(n.length);
        const keep = T('span', 'swk'); const im = img(icons[n], 'sw');
        rest.before(keep); if (im) keep.append(im); keep.append(rest);
        break;
      }
    }
    fit?.();
  }, 100);
}

