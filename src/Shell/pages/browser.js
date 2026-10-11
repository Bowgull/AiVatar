// 6.20: the browser's frame. Draws the rail and the address slot from the tab list the Shell sends, and
// tells the Shell where the page area is (6.19). Everything is built with textContent: titles and
// addresses are the websites' own words.
const el = (id) => document.getElementById(id);
const tabsBox = el('tabs'), urlEl = el('url'), lock = el('lock'), edit = el('edit'), loading = el('loading');
let state = { active: null, tabs: [], canBack: false, canForward: false };

// ---- 6.19: where the page area is. Measured, then the Shell keeps it in place on every resize itself.
const page = el('page');
function report() {
  const r = page.getBoundingClientRect();
  // A page is a native view drawn ON TOP of this frame, so anything hanging below the band (a site's ask,
  // the ads panel, a download note) would sit hidden behind it. While one shows, the page moves down past it.
  let top = r.top;
  for (const id of ['askchip', 'sitepanel', 'toast']) { const x = el(id); if (x && !x.hidden) top = Math.max(top, x.getBoundingClientRect().bottom + 6); }
  // All four sides now: the page sits inside the carved recess, with wood on every side of it.
  window.aang?.browserInsets?.({ left: r.left, top, right: window.innerWidth - r.right, bottom: window.innerHeight - r.bottom });
}
new ResizeObserver(report).observe(page);
new MutationObserver(() => requestAnimationFrame(report)).observe(document.body, { subtree: true, attributes: true, attributeFilter: ['hidden'] });
window.addEventListener('load', report);

// ---- the band
el('back').addEventListener('click', () => window.aang?.browserAct?.('back'));
el('fwd').addEventListener('click', () => window.aang?.browserAct?.('forward'));
el('reload').addEventListener('click', () => window.aang?.browserAct?.('reload'));
el('newtab').addEventListener('click', () => { tap(); window.aang?.browserAct?.('newtab'); });

// ---- the tab drawer (2026-10-11): click the wood tab and sheet 3's rail slides out OVER the page. The live page
// cannot be covered by anything in this frame, so while the drawer is open it is shown as a still picture of
// itself; the picture arrives first, then the drawer slides, so nothing ever slides under the real page.
const frozen = el('frozen');
let drawerOpen = false, drawerWait = 0;
function openDrawer() {
  if (drawerOpen) return;
  drawerOpen = true;
  el('drawerkey').setAttribute('aria-expanded', 'true');
  el('rail').setAttribute('aria-hidden', 'false');
  window.aang?.browserAct?.('drawer-open');
  // If the picture is slow (a heavy page), slide anyway after a moment: the drawer is what he asked for.
  drawerWait = setTimeout(() => document.body.classList.add('drawer-open'), 400);
}
function closeDrawer() {
  if (!drawerOpen) return;
  drawerOpen = false;
  clearTimeout(drawerWait);
  el('drawerkey').setAttribute('aria-expanded', 'false');
  el('rail').setAttribute('aria-hidden', 'true');
  document.body.classList.remove('drawer-open');
  // The live page comes back once the drawer has slid away (its 150 ms), never under it.
  setTimeout(() => { if (!drawerOpen) window.aang?.browserAct?.('drawer-close'); }, 150);
}
window.aang?.onBrowserFrozen?.((src) => {
  if (typeof src === 'string' && src.startsWith('data:image/')) { frozen.src = src; frozen.hidden = false; }
  else if (src === null) { frozen.hidden = true; frozen.removeAttribute('src'); }
  if (drawerOpen) { clearTimeout(drawerWait); document.body.classList.add('drawer-open'); }
});
el('drawerkey').addEventListener('click', () => (drawerOpen ? closeDrawer() : openDrawer()));
// A click on the page (its picture) puts the drawer away, as clicking outside any drawer does.
page.addEventListener('pointerdown', () => closeDrawer());
el('newtab').addEventListener('click', () => closeDrawer());

// ---- the little wood sounds: off until he turns them on in Settings. Made here, no sound files.
let audio = null;
function tap(pitch = 1) {
  if (!state.sounds) return;
  try {
    audio ??= new AudioContext();
    const now = audio.currentTime, len = Math.floor(audio.sampleRate * 0.05);
    const buf = audio.createBuffer(1, len, audio.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 6);
    const src = audio.createBufferSource(); src.buffer = buf;
    const f = audio.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 900 * pitch; f.Q.value = 6;
    const g = audio.createGain(); g.gain.setValueAtTime(0.35, now);
    src.connect(f).connect(g).connect(audio.destination);
    src.start(now);
  } catch { /* no sound, no harm */ }
}
el('crashreload').addEventListener('click', () => window.aang?.browserAct?.('reload'));
el('crashclose').addEventListener('click', () => window.aang?.browserAct?.('close'));

// ---- the address slot: shows the address; click it and it becomes a field. Enter searches or goes.
function editSlot() {
  const t = state.tabs.find((x) => x.id === state.active);
  urlEl.hidden = true; edit.hidden = false;
  edit.value = t?.url ?? '';
  edit.focus(); edit.select();
}
function closeSlot() { edit.hidden = true; urlEl.hidden = false; }
el('slot').addEventListener('click', () => { if (edit.hidden) editSlot(); });
edit.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && edit.value.trim()) { window.aang?.browserGo?.(edit.value.trim()); closeSlot(); }
  if (e.key === 'Escape') closeSlot();
});
edit.addEventListener('blur', () => setTimeout(closeSlot, 120));
window.aang?.onBrowserFocusSlot?.(() => editSlot());

// The browser's keys work here too, when the frame has the keyboard.
window.addEventListener('keydown', (e) => {
  const c = e.ctrlKey || e.metaKey, k = e.key.toLowerCase();
  const send = (a) => { e.preventDefault(); window.aang?.browserAct?.(a); };
  if (k === 'escape' && drawerOpen) { e.preventDefault(); closeDrawer(); return; }
  if (c && e.shiftKey && k === 't') send('reopen');
  else if (c && k === 't') { tap(); send('newtab'); }
  else if (c && k === 'w') { tap(0.7); send('close'); }
  else if (c && k === 'l') { e.preventDefault(); editSlot(); }
  else if ((c && k === 'r') || k === 'f5') send('reload');
});

/** The address as sheet 3 draws it: the real domain bright, the rest dimmed. */
function paintUrl(u) {
  urlEl.replaceChildren();
  let parsed = null;
  try { parsed = new URL(u); } catch { /* not a URL */ }
  if (!parsed) { urlEl.textContent = u; lock.hidden = true; return; }
  lock.hidden = false;
  const secure = parsed.protocol === 'https:';
  // Quiet when all is well (the research: praising the normal case teaches nothing, and fake sites have
  // padlocks too); red words only when something is wrong.
  if (secure) { lock.innerHTML = SHIELD; lock.setAttribute('aria-label', 'This site: ad blocking and permissions'); }
  else { lock.textContent = 'NOT SECURE'; lock.removeAttribute('aria-label'); }
  lock.classList.toggle('bad', !secure);
  const host = parsed.hostname;
  const parts = host.split('.');
  const domain = parts.slice(-2).join('.');
  const sub = host.slice(0, host.length - domain.length);
  const b = document.createElement('b'); b.textContent = domain;
  urlEl.append(`${parsed.protocol}//${sub}`, b, `${parsed.pathname === '/' ? '' : parsed.pathname}${parsed.search}`);
}

const SHIELD = '<svg viewBox="0 0 7 7" width="12" height="12" shape-rendering="crispEdges" aria-hidden="true"><path d="M1 0h5v1H1zM0 1h1v3H0zM6 1h1v3H6zM1 4h1v1H1zM5 4h1v1H5zM2 5h1v1H2zM4 5h1v1H4zM3 6h1v1H3zM3 2h1v3H3zM2 3h3v1H2z" fill="currentColor"/></svg>';
const SPEAKER = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2 6h3l4-3v10l-4-3H2z" fill="#2a1c00"/><path d="M11 5c1.5 1.5 1.5 4.5 0 6" stroke="#2a1c00" stroke-width="1.8" fill="none"/></svg>';
// Rows are kept and only redrawn when something about that tab changed, so a title or a spinner on one
// tab never rebuilds the whole rail (that rebuild was the flicker, and it dropped the hover under the mouse).
const rows = new Map();
function paintTabs() {
  const open = new Set(state.tabs.map((t) => t.id));
  const want = [];
  for (const t of state.tabs) {
    const sig = JSON.stringify([t.id === state.active, t.crashed, t.asleep, t.loading, t.favicon, t.title, t.url, t.audible, t.muted, t.opener && open.has(t.opener)]);
    let r = rows.get(t.id);
    if (!r || r.sig !== sig) {
      const fresh = buildRow(t, open);
      if (r) r.el.replaceWith(fresh);
      r = { sig, el: fresh };
      rows.set(t.id, r);
    }
    want.push(r.el);
  }
  for (const [id, r] of rows) if (!open.has(id)) { r.el.remove(); rows.delete(id); }
  want.forEach((node, i) => { if (tabsBox.children[i] !== node) tabsBox.insertBefore(node, tabsBox.children[i] ?? null); });
}
function buildRow(t, open) {
  {
    const row = document.createElement('div');
    const asleep = t.asleep && t.id !== state.active;
    row.className = 'tp' + (t.id === state.active ? ' on' : '') + (t.crashed ? ' crash' : '') + (asleep ? ' sleep' : '') + (t.opener && open.has(t.opener) ? ' kid' : '');
    row.title = t.url;
    row.tabIndex = 0;
    if (t.loading && !t.crashed) row.append(Object.assign(document.createElement('i'), { className: 'arc' }));
    else if (t.favicon) { const i = document.createElement('img'); i.className = 'fi'; i.alt = ''; i.src = t.favicon; i.referrerPolicy = 'no-referrer'; i.onerror = () => i.remove(); row.append(i); }
    const title = document.createElement('span'); title.className = 't'; title.textContent = t.title || t.url;
    row.append(title);
    if (t.crashed) { const c = document.createElement('span'); c.className = 'cr'; c.textContent = 'CRASHED'; row.append(c); }
    // Sheet 3: asleep is sunk flush into the wood, colour drained. Click and it wakes where it was.
    if (asleep) { const z = document.createElement('span'); z.className = 'zz'; z.textContent = 'ASLEEP'; row.append(z); }
    if (t.audible || t.muted) {
      // Sheet 3: a real button. Press it to mute; pressed in, with a red slash, when muted.
      const s = document.createElement('button'); s.type = 'button'; s.className = 'spk' + (t.muted ? ' muted' : '');
      s.setAttribute('aria-label', t.muted ? 'Unmute this tab' : 'Mute this tab');
      s.innerHTML = SPEAKER;
      s.addEventListener('click', (e) => { e.stopPropagation(); window.aang?.browserTab?.({ id: t.id, act: 'mute' }); });
      row.append(s);
    }
    const x = document.createElement('button'); x.type = 'button'; x.className = 'x'; x.textContent = '×'; x.setAttribute('aria-label', 'Close tab');
    x.addEventListener('click', (e) => { e.stopPropagation(); tap(0.7); window.aang?.browserTab?.({ id: t.id, act: 'close' }); });
    row.append(x);
    // A tab switches on the press, not the release, the way Chrome does; its buttons keep their own clicks.
    row.addEventListener('pointerdown', (e) => { if (e.button === 0 && !e.target.closest('button')) { window.aang?.browserTab?.({ id: t.id, act: 'show' }); closeDrawer(); } });
    row.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); window.aang?.browserTab?.({ id: t.id, act: 'show' }); } });
    row.addEventListener('auxclick', (e) => { if (e.button === 1) { tap(0.7); window.aang?.browserTab?.({ id: t.id, act: 'close' }); } });
    return row;
  }
}

// ---- bookmarks on the velvet shelf: logo and name, a click opens it. Empty until the import (6.23).
function paintMarks(list) {
  const box = el('marks');
  box.replaceChildren();
  if (!Array.isArray(list) || !list.length) {
    box.append(Object.assign(document.createElement('p'), { className: 'empty', textContent: 'Your bookmarks land here when they come over from Chrome.' }));
    return;
  }
  for (const b of list.slice(0, 12)) {
    if (!b || typeof b.url !== 'string') continue;
    const m = document.createElement('button');
    m.type = 'button'; m.className = 'mark'; m.title = b.url;
    if (b.favicon) { const i = document.createElement('img'); i.alt = ''; i.src = b.favicon; i.referrerPolicy = 'no-referrer'; i.onerror = () => i.remove(); m.append(i); }
    m.append(String(b.title || b.url).slice(0, 24));
    m.addEventListener('click', () => { window.aang?.browserGo?.(b.url); closeDrawer(); });
    box.append(m);
  }
}

// ---- 6.22: a website's ask, hanging from the band. For this call only; there is no "always" for these.
let askId = null;
window.aang?.onBrowserAsk?.((a) => {
  if (!a || !Number.isInteger(a.id)) return;
  askId = a.id;
  el('askq').textContent = a.what || 'Allow this?';
  el('askm').textContent = `${a.host || 'This site'} wants it for what you are doing now. You are asked again next time.`;
  el('askchip').hidden = false;
});
const answerAsk = (allow) => { if (askId === null) return; window.aang?.browserAskReply?.({ id: askId, allow }); askId = null; el('askchip').hidden = true; };
el('askyes').addEventListener('click', () => answerAsk(true));
el('askno').addEventListener('click', () => answerAsk(false));

// ---- the SECURE plaque's panel: let ads through on one site, or block them again
lock.addEventListener('click', (e) => {
  e.stopPropagation();
  const t = state.tabs.find((x) => x.id === state.active);
  let host = '';
  try { host = new URL(t?.url ?? '').hostname.replace(/^www\./, ''); } catch { /* none */ }
  if (!host) return;
  el('sitehost').textContent = host;
  paintAdSwitch();
  el('sitepanel').hidden = !el('sitepanel').hidden;
});
function paintAdSwitch() {
  const on = state.adsOn && !state.adsPaused;
  el('adsw').classList.toggle('on', on);
  el('adsw').setAttribute('aria-checked', String(on));
  el('adnote').textContent = !state.adsOn ? 'The block lists are still loading.' : state.adsPaused ? 'Paused here. Ads show on this site.' : 'On. Ads and trackers are stopped here.';
}
el('adsw').addEventListener('click', (e) => { e.preventDefault(); if (state.adsOn) window.aang?.browserAdPause?.(!state.adsPaused); });
document.addEventListener('click', (e) => { if (!el('sitepanel').contains(e.target) && !lock.contains(e.target)) el('sitepanel').hidden = true; });

// ---- a finished download, said once in the band
window.aang?.onBrowserDownload?.((d) => {
  if (!d) return;
  const t = el('toast');
  if (d.state === 'completed') tap(1.4);
  t.textContent = d.state === 'completed' ? `Downloaded ${d.name} to your Downloads. Windows checks it before it opens.` : `${d.name} did not finish downloading.`;
  t.hidden = false;
  setTimeout(() => { t.hidden = true; }, 6000);
});

// ---- the red plate's lever: held, never one click (sheet 3 section 6)
function redLever() {
  const box = el('phishlever');
  box.replaceChildren();
  const l = document.createElement('div');
  l.className = 'lever red'; l.tabIndex = 0;
  l.append(Object.assign(document.createElement('i'), { className: 'fillbar' }), Object.assign(document.createElement('i'), { className: 'knob' }),
    Object.assign(document.createElement('span'), { className: 'txt', textContent: 'Open it anyway' }), Object.assign(document.createElement('span'), { className: 'hold', textContent: 'HOLD' }));
  let from = 0, raf = 0;
  const stop = () => { cancelAnimationFrame(raf); raf = 0; l.style.setProperty('--fill', '0%'); };
  const paint = () => { const k = Math.min(1, (performance.now() - from) / 800); l.style.setProperty('--fill', (k * 100).toFixed(1) + '%'); if (k >= 1) { stop(); window.aang?.browserAct?.('phishopen'); return; } raf = requestAnimationFrame(paint); };
  l.addEventListener('pointerdown', (e) => { l.setPointerCapture?.(e.pointerId); if (!raf) { from = performance.now(); raf = requestAnimationFrame(paint); } });
  for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) l.addEventListener(ev, stop);
  box.append(l);
}
el('phishback').addEventListener('click', () => window.aang?.browserAct?.('phishback'));

window.aang?.onBrowserTabs?.((s) => {
  if (!s || !Array.isArray(s.tabs)) return;
  state = s;
  paintMarks(s.marks);
  const t = s.tabs.find((x) => x.id === s.active);
  paintTabs();
  if (edit.hidden) paintUrl(t?.url ?? '');
  el('back').classList.toggle('dim', !s.canBack);
  el('fwd').classList.toggle('dim', !s.canForward);
  loading.classList.toggle('busy', Boolean(t?.loading));
  const crashed = Boolean(t?.crashed);
  el('crashplate').hidden = !crashed;
  // A listed site: the red plate where the page would be, and the plaque turns red.
  const b = t?.blocked;
  el('phishplate').hidden = !b;
  if (b) {
    let host = b.url;
    try { host = new URL(b.url).hostname; } catch { /* keep the text */ }
    el('phishtitle').textContent = 'This site is on a list of fake or harmful sites';
    el('phishtext').replaceChildren(Object.assign(document.createElement('b'), { textContent: host }), ` is named by ${b.lists.length === 1 ? 'one list' : b.lists.length + ' lists'} of known fake login pages and harmful downloads. It was stopped before anything loaded.`);
    el('phishlists').replaceChildren(...b.lists.map((n) => Object.assign(document.createElement('span'), { textContent: n })));
    if (!el('phishlever').childElementCount) redLever();
    lock.hidden = false; lock.textContent = 'BLOCKED'; lock.classList.add('bad');
  } else el('phishlever').replaceChildren();
  if (!el('sitepanel').hidden) paintAdSwitch();
  if (crashed) el('crashtitle').textContent = `${(t.title || 'This page').slice(0, 60)} stopped working`;
});
