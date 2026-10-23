import { pixIcon } from './pixicons.js';
import { startRune } from './rune.js';
import { openRail, railTabs } from './sitenotes.js';
// 6.20: the browser's frame. Draws the rail and the address slot from the tab list the Shell sends, and
// tells the Shell where the page area is (6.19). Everything is built with textContent: titles and
// addresses are the websites' own words.
// "Send to" names the OTHER machine: the MacBook from the PC, the PC from the Mac (M6, his report 2026-10-13).
const OTHER = window.aang?.platform === 'darwin'
  ? { label: 'Send to PC', title: 'Send to your PC. It stops playing here.', open: 'Open on PC' }
  : { label: 'Send to Mac', title: 'Send to the MacBook. It stops playing here.', open: 'Open on Mac' };
const el = (id) => document.getElementById(id);
// The tab list floats in its own see-through layer above the live page (his ask, 2026-10-13: Twitch froze under the
// old drawer, which showed a picture of the page). This same page, opened with ?tray, is that layer: only the list.
const SOLO = new URLSearchParams(location.search).has('tray');
if (SOLO) document.documentElement.classList.add('solo');
const tabsBox = el('tabs'), urlEl = el('url'), lock = el('lock'), edit = el('edit'), loading = el('loading');
let state = { active: null, tabs: [], canBack: false, canForward: false };
/** His rule (2026-10-22): a name carries its icon. The last row added to a menu (Send to Aang) gets Aang's face in front. */
function aangFaceOn(m) {
  const b = m.lastElementChild; if (!b) return;
  b.classList.add('toaang');
  b.prepend(Object.assign(document.createElement('img'), { src: 'art/aang-face.png', alt: '', className: 'aface' }));
}

// ---- 6.19: where the page area is. Measured, then the Shell keeps it in place on every resize itself.
const page = el('page');
function report() {
  if (SOLO) return;                         // the tray layer has no page area of its own
  const r = page.getBoundingClientRect();
  // A page is a native view drawn ON TOP of this frame, so anything hanging below the band (a site's ask,
  // the ads panel, a download note) would sit hidden behind it. While one shows, the page moves down past it.
  let top = r.top;
  for (const id of ['askchip', 'sharechip', 'devchip', 'vaultchip', 'toast']) { const x = el(id); if (x && !x.hidden) top = Math.max(top, x.getBoundingClientRect().bottom + 6); }
  // All four sides now: the page sits inside the carved recess, with wood on every side of it.
  const ins = { left: r.left, top, right: window.innerWidth - r.right, bottom: window.innerHeight - r.bottom };
  // Only when the page area really moved (measured 2026-10-20): every toggle anywhere used to move the page's view,
  // 2 moves for every link he pointed at.
  const key = [ins.left, ins.top, ins.right, ins.bottom].map((v) => Math.round(v)).join(',');
  if (key === lastInsets) return;
  lastInsets = key;
  window.aang?.browserInsets?.(ins);
}
let lastInsets = '', reportQueued = false;
const reportSoon = () => { if (reportQueued) return; reportQueued = true; requestAnimationFrame(() => { reportQueued = false; report(); }); };
new ResizeObserver(report).observe(page);
// The link preview floats over the page and never moves it.
new MutationObserver((recs) => { if (recs.every((m) => m.target.id === 'linkpeek')) return; reportSoon(); })
  .observe(document.body, { subtree: true, attributes: true, attributeFilter: ['hidden'] });
window.addEventListener('load', report);

// ---- the band
el('back').addEventListener('click', () => window.aang?.browserAct?.('back'));
el('fwd').addEventListener('click', () => window.aang?.browserAct?.('forward'));
const RELOADGLYPH = el('reload').innerHTML;
const STOPGLYPH = '<svg viewBox="0 0 7 7" width="14" height="14" shape-rendering="crispEdges" aria-hidden="true"><path d="M0 0h2v1H0zM5 0h2v1H5zM1 1h2v1H1zM4 1h2v1H4zM2 2h3v1H2zM3 3h1v1H3zM2 4h3v1H2zM1 5h2v1H1zM4 5h2v1H4zM0 6h2v1H0zM5 6h2v1H5z" fill="#e8e0f5"/></svg>';
el('reload').addEventListener('click', () => window.aang?.browserAct?.(el('reload').dataset.mode === 'stop' ? 'stop' : 'reload'));
el('zoomhint').addEventListener('click', (e) => { e.stopPropagation(); window.aang?.browserAct?.('zoomreset'); });
// ---- link preview: shows the real address while he points at a link
window.aang?.onBrowserHover?.((u) => {
  const p = el('linkpeek');
  if (!u) { p.hidden = true; return; }
  p.textContent = String(u);
  p.hidden = false;
});
el('newtab').addEventListener('click', () => { tap(); window.aang?.browserAct?.('newtab'); });

// ---- the tab drawer (2026-10-11): click the wood tab and sheet 3's rail slides out OVER the page. The live page
// cannot be covered by anything in this frame, so while the drawer is open it is shown as a still picture of
// itself; the picture arrives first, then the drawer slides, so nothing ever slides under the real page.
const frozen = el('frozen');
let drawerOpen = false, drawerWait = 0;
// The drawer and the ⋯ menu both lie over the page, so the page is pictured while EITHER is open.
const over = new Set();
function freeze(who) { const was = over.size; over.add(who); if (!was) window.aang?.browserAct?.('drawer-open'); }
function unfreeze(who, after = 0) { over.delete(who); setTimeout(() => { if (!over.size) window.aang?.browserAct?.('drawer-close'); }, after); }
// The list itself is drawn by the tray layer; here the handle only asks for it, and says where it goes.
function trayRect() {
  const k = el('drawerkey').getBoundingClientRect(), b = document.querySelector('.body3').getBoundingClientRect();
  // From the handle's own left edge: the rail slides out from under it, carrying it (his ask, 2026-10-20).
  return { x: Math.round(k.left), y: Math.round(b.top), hy: Math.round(k.top - b.top), h: Math.round(window.innerHeight - b.top) };
}
function openDrawer() {
  if (drawerOpen || SOLO) return;
  closeMenu(); closeDl();
  breathe(false);
  drawerOpen = true;
  el('drawerkey').setAttribute('aria-expanded', 'true');
  document.body.classList.add('tray-open');
  window.aang?.browserTray?.({ open: true, ...trayRect() });
}
// His rule (2026-10-14): "the left tray should never close ever unless I move my mouse out of it - no clicks or
// anything". So every other call is a no-op; only the tray's own mouse-out passes `byMouseOut`.
function closeDrawer(byMouseOut = false) {
  if (!byMouseOut) return;
  if (SOLO) { window.aang?.browserTray?.({ open: false }); return; }
  if (!drawerOpen) return;
  trayShut();
  window.aang?.browserTray?.({ open: false });
}
function trayShut() {
  drawerOpen = false;
  el('drawerkey').setAttribute('aria-expanded', 'false');
  document.body.classList.remove('tray-open');
}
// The tray closed by itself (Esc in it, a click on the page, a tab picked): the handle follows.
window.aang?.onBrowserTray?.((s) => {
  if (!s) return;
  if (SOLO) {
    // Drawn once out of sight before the first real open (the Shell shows this layer for a moment): out, at almost no
    // opacity and with no slide, then folded away again without a slide.
    if (s.warm === true) {
      const html = document.documentElement;
      html.classList.add('warm'); document.body.classList.add('out');
      // Folded back while still see-through; see-through ends only after the Shell has hidden the layer (300 ms).
      setTimeout(() => { document.body.classList.remove('out'); }, 240);
      setTimeout(() => { html.classList.remove('warm'); }, 500);
      return;
    }
    // Shown folded, then slid out on the next frames; told to close, it slides back and the Shell hides it after.
    if (s.open === true) {
      if (Number.isFinite(s.hy)) document.querySelector('.railhandle').style.top = s.hy + 'px';
      document.body.classList.remove('out');
      // Next frame; a short timer too, so a window that is not drawing right now still ends up with the rail out.
      let gone = false;
      const go = () => { if (gone) return; gone = true; void document.body.offsetWidth; document.body.classList.add('out'); };
      requestAnimationFrame(() => requestAnimationFrame(go));
      setTimeout(go, 40);
    } else document.body.classList.remove('out');
    return;
  }
  // The + key in the floating list: the star's own box opens here, on the band, where he can see it.
  if (s.mark) setTimeout(() => el('star').click(), 60);
  document.body.classList.toggle('rail-out', s.open === true);
  if (s.open === false && drawerOpen) trayShut();
});
if (SOLO) {
  // The list goes a moment after the mouse leaves it (not while a menu of its own or a rename is open).
  let leaveT = 0;
  document.documentElement.addEventListener('mouseleave', () => { clearTimeout(leaveT); leaveT = setTimeout(() => { if (!dragging && !document.querySelector('.th input, .bm-key input') && !document.getElementById('tabmenu')) closeDrawer(true); }, 350); });
  document.documentElement.addEventListener('mouseenter', () => clearTimeout(leaveT));
  drawerOpen = true;
  document.body.classList.add('drawer-open');
  el('rail').setAttribute('aria-hidden', 'false');
}

// ---- the ⋯ menu: the browser's settings, grouped. Its switches are real: ads, popups, sounds.
const menu = el('menu'), menukey = el('menukey');
let menuOpen = false;
function openMenu() {
  if (menuOpen) return;
  closeDrawer();
  menuOpen = true;
  closeDl();
  menukey.setAttribute('aria-expanded', 'true');
  paintMenu();
  menu.hidden = false;
  freeze('menu');
}
function closeMenu() {
  if (!menuOpen) return;
  menuOpen = false;
  menukey.setAttribute('aria-expanded', 'false');
  menu.hidden = true;
  unfreeze('menu');
}
function paintMenu() {
  el('zpct').textContent = (state.zoomPct ?? 100) + '%';
}
menukey.addEventListener('click', (e) => { e.stopPropagation(); menuOpen ? closeMenu() : openMenu(); });
menu.addEventListener('click', (e) => e.stopPropagation());

el('zin').addEventListener('click', () => window.aang?.browserAct?.('zoomin'));
el('zout').addEventListener('click', () => window.aang?.browserAct?.('zoomout'));
el('zreset').addEventListener('click', () => window.aang?.browserAct?.('zoomreset'));
el('m-newtab').addEventListener('click', () => { closeMenu(); tap(); window.aang?.browserAct?.('newtab'); });
el('m-reopen').addEventListener('click', () => { closeMenu(); window.aang?.browserAct?.('reopen'); });
el('m-find').addEventListener('click', () => { closeMenu(); setTimeout(openFind, 0); });
// Sheet 60 section 4: this site's notes, in the rail on the right (sitenotes.js).
el('m-sitenotes').addEventListener('click', () => { closeMenu(); openRail(); });
el('m-print').addEventListener('click', () => { closeMenu(); window.aang?.browserAct?.('print'); });
el('m-tidy').addEventListener('click', () => { closeMenu(); openDrawer(); window.aang?.browserAct?.('tidy'); });
el('m-marks').addEventListener('click', () => { closeMenu(); window.aang?.browserAct?.('bookmarks'); });
el('m-settings').addEventListener('click', () => { closeMenu(); window.aang?.browserAct?.('settings'); });
el('m-history').addEventListener('click', () => { closeMenu(); window.aang?.browserAct?.('history'); });
// Sheet 47: the MOCKUPS trail comes back with its history open, even after he closed it.
el('m-mockups').addEventListener('click', () => { closeMenu(); openDrawer(); window.aang?.browserAct?.('mockups'); });
el('m-downloads').addEventListener('click', () => { closeMenu(); window.aang?.browserAct?.('downloads'); });
// ---- Trail clean up: the broom at the bottom of the drawer, the panel just above it
el('broom').addEventListener('click', () => window.aang?.browserAct?.('tidy'));
el('tidykeep').addEventListener('click', () => window.aang?.browserAct?.('tidykeep'));
el('tidyundo').addEventListener('click', () => window.aang?.browserAct?.('tidyundo'));
el('tidypanel').addEventListener('click', (e) => { if (state.tidy?.phase === 'working' && !e.target.closest('button')) window.aang?.browserAct?.('tidyundo'); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && state.tidy?.phase === 'working') window.aang?.browserAct?.('tidyundo'); });
let tidyTick = null;
function paintTidy() {
  const td = state.tidy;
  el('tidypanel').hidden = !td;
  el('broom').disabled = Boolean(td);
  const live = state.tabs.filter((t) => !t.done && !String(t.url).startsWith('aang:')).length;
  el('tabcount').textContent = `${live} TAB${live === 1 ? '' : 'S'}`;
  document.getElementById('tabs').classList.toggle('tidying', td?.phase === 'working');
  clearInterval(tidyTick);
  if (!td) return;
  const working = td.phase === 'working';
  el('tidytitle').textContent = working ? 'AANG IS TIDYING' : 'TIDIED';
  el('tidyprog').hidden = !working;
  el('tidykeys').hidden = working;
  if (working) {
    el('tidyline').textContent = (td.text || 'Sorting your tabs.') + ' Keep browsing: nothing closes until you keep it.';
    el('tidydim').textContent = td.waiting ? 'WAITING FOR WOW TO CLOSE' : 'ESC OR CLICK HERE TO STOP';
  } else {
    const parts = [];
    if (td.created) parts.push(`${td.created} trail${td.created === 1 ? '' : 's'} made`);
    if (td.doubles) parts.push(`${td.doubles} double${td.doubles === 1 ? '' : 's'} closing`);
    if (td.stashed) parts.push(`${td.stashed} old trail${td.stashed === 1 ? '' : 's'} put in the Stash`);
    el('tidyline').textContent = (parts.length ? parts.join(', ') + '.' : 'Already tidy: nothing to change.') + (td.text ? ' ' + td.text : '');
    const tick = () => { const s = Math.max(0, Math.ceil((td.keepAt - Date.now()) / 1000)); el('tidydim').textContent = `KEEPS ITSELF IN ${s} SECOND${s === 1 ? '' : 'S'}`; };
    tick(); tidyTick = setInterval(tick, 500);
  }
}
// ---- the Stash: the chest at the bottom of the list; click it to see the trails put away
el('chest').addEventListener('click', () => { el('stashlist').hidden = !el('stashlist').hidden; paintStash(); });
function paintStash() {
  const st = Array.isArray(state.stash) ? state.stash : [];
  el('stash').hidden = !st.length;
  el('stashn').textContent = `${st.length} trail${st.length === 1 ? '' : 's'} put away. Click to bring one back.`;
  if (!st.length) el('stashlist').hidden = true;
  if (el('stashlist').hidden) return;
  el('stashlist').replaceChildren(...st.map((s) => {
    const row = document.createElement('div'); row.className = 'srow';
    const b = Object.assign(document.createElement('button'), { type: 'button', className: 'sback', textContent: `${s.name} (${s.count} tab${s.count === 1 ? '' : 's'})`, title: 'Bring it back' });
    b.addEventListener('click', () => window.aang?.browserTrail?.({ act: 'stash', id: s.id, what: 'restore' }));
    const x = Object.assign(document.createElement('button'), { type: 'button', className: 'sx', textContent: 'x', title: 'Let it go for good' });
    x.addEventListener('click', () => window.aang?.browserTrail?.({ act: 'stash', id: s.id, what: 'forget' }));
    row.append(b, x);
    return row;
  }));
}
// His own window buttons. Double-clicking the band still maximises (Windows does that for the drag area).
el('wmin').addEventListener('click', () => window.aang?.browserAct?.('winmin'));
el('wmax').addEventListener('click', () => window.aang?.browserAct?.('winmax'));
el('wclose').addEventListener('click', () => window.aang?.browserAct?.('winclose'));
el('vkey').addEventListener('click', (e) => { e.stopPropagation(); window.aang?.browserAct?.('vault'); });
// The vault's chip: the master password box (unlock) or the account list (pick). The password goes to the Shell
// and the box is emptied at once; nothing here keeps it.
const vaultpw = el('vaultpw');
window.aang?.onBrowserVault?.((v) => {
  const chip = el('vaultchip');
  vaultpw.value = '';
  if (!v) { chip.hidden = true; return; }
  const unlock = v.mode === 'unlock';
  el('vaultq').textContent = unlock ? (v.wrong ? 'That password did not open it' : 'Unlock Bitwarden') : 'Which login?';
  el('vaultm').textContent = unlock ? `Your Bitwarden master password, to fill a login on ${v.host}. It stays open 30 minutes.` : `You have more than one login for ${v.host}.`;
  el('vaultform').hidden = !unlock;
  const list = el('vaultlist');
  list.hidden = unlock;
  list.replaceChildren();
  if (!unlock && Array.isArray(v.logins)) for (const l of v.logins) {
    const b = document.createElement('button'); b.type = 'button'; b.className = 'vrow';
    b.append(Object.assign(document.createElement('b'), { textContent: l.username || '(no username)' }), Object.assign(document.createElement('small'), { textContent: l.name }));
    b.addEventListener('click', () => window.aang?.browserVaultPick?.(l.id));
    list.append(b);
  }
  if (!unlock) { const c = document.createElement('button'); c.type = 'button'; c.className = 'key sm'; c.textContent = 'Cancel'; c.addEventListener('click', () => window.aang?.browserAct?.('vaultcancel')); list.append(c); }
  chip.hidden = false;
  if (unlock) setTimeout(() => vaultpw.focus(), 0);
});
el('vaultform').addEventListener('submit', (e) => {
  e.preventDefault();
  const pw = vaultpw.value;
  vaultpw.value = '';
  if (pw) window.aang?.browserVaultUnlock?.(pw);
});
el('vaultno').addEventListener('click', () => { vaultpw.value = ''; window.aang?.browserAct?.('vaultcancel'); });
vaultpw.addEventListener('keydown', (e) => { if (e.key === 'Escape') { vaultpw.value = ''; window.aang?.browserAct?.('vaultcancel'); } });
// The star (his ask, 2026-10-14: "edit the name it saves as"): saves the page, and its panel opens with the name ready to
// type over. On a saved page it opens the same panel to rename or remove it.
el('star').addEventListener('click', (e) => {
  e.stopPropagation(); tap(1.2);
  const fresh = !state.starred;
  if (fresh) window.aang?.browserAct?.('star');
  const t = state.tabs.find((x) => x.id === state.active);
  el('markhead').textContent = fresh ? 'Bookmark saved' : 'Bookmark';
  el('markname').value = (fresh ? t?.title : state.markTitle) || t?.title || '';
  const band = el('band').getBoundingClientRect(), r = el('star').getBoundingClientRect();
  el('markpanel').style.left = Math.max(8, Math.round(r.left + r.width / 2 - band.left - 33)) + 'px';
  el('markpanel').hidden = false;
  el('markname').focus(); el('markname').select();
});
const markClose = (save) => { if (el('markpanel').hidden) return; if (save) window.aang?.browserMark?.('rename', el('markname').value); el('markpanel').hidden = true; };
el('markdone').addEventListener('click', () => markClose(true));
el('markremove').addEventListener('click', () => { window.aang?.browserMark?.('remove'); el('markpanel').hidden = true; });
el('markname').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); markClose(true); } else if (e.key === 'Escape') { e.preventDefault(); markClose(true); } });
// Clicking anywhere else keeps the name as typed, the way Chrome does.
document.addEventListener('mousedown', (e) => { if (!el('markpanel').hidden && !el('markpanel').contains(e.target) && !el('star').contains(e.target)) markClose(true); });
let markOver = false;
new MutationObserver(() => { const open = !el('markpanel').hidden; if (open === markOver) return; markOver = open; if (open) freeze('mark'); else unfreeze('mark'); }).observe(el('markpanel'), { attributes: true, attributeFilter: ['hidden'] });
document.addEventListener('click', () => closeMenu());
window.aang?.onBrowserFrozen?.((src) => {
  if (typeof src === 'string' && src.startsWith('data:image/')) {
    // Tell the Shell only once the picture is really on screen, so the live page never vanishes into a gap.
    frozen.src = src; frozen.hidden = false;
    frozen.decode().catch(() => {}).then(() => requestAnimationFrame(() => requestAnimationFrame(() => window.aang?.browserAct?.('frozen-ready'))));
  }
  else if (src === null) { frozen.hidden = true; frozen.removeAttribute('src'); }
  if (drawerOpen) { clearTimeout(drawerWait); document.body.classList.add('drawer-open'); }
  if (over.size === 0) { frozen.hidden = true; }
});
el('drawerkey').addEventListener('click', () => (drawerOpen ? closeDrawer() : openDrawer()));

// ---- A mockup arrived (his ask, 2026-10-22: "when a mockup arrives the tab has a little very small breathing
// notification letting me know, maybe just the arrow breathes a bit"). With the drawer shut, only the handle's arrow
// breathes, four soft breaths of 1.6 s (browser.css .breathe), then rests; opening the drawer stops it at once. With
// reduced motion it is a still gold dot on the handle until he opens the drawer. In the drawer (the tray layer) the new
// mockup's row glows gold twice when he opens it. Each arrival is told once (mockNew.n); one from before this page
// opened only counts while it is fresh.
let mockSeen = null;
function mockArrived(m) {
  if (!m || !Number.isFinite(m.n) || m.n === mockSeen) return;
  const first = mockSeen === null;
  mockSeen = m.n;
  if (SOLO) { if (Date.now() - Number(m.at) < 10 * 60_000) glowRow(String(m.sheet ?? '')); return; }
  if ((first && Date.now() - Number(m.at) > 15_000) || drawerOpen) return;
  breathe(true);
}
function breathe(on) {
  const k = el('drawerkey');
  if (!on) { k.classList.remove('breathe'); return; }
  k.classList.remove('breathe'); void k.offsetWidth; k.classList.add('breathe');
}
// The breaths end by themselves (the reduced-motion dot stays until the drawer opens).
el('drawerkey').addEventListener('animationend', (e) => { if (e.animationName === 'hbreathe') breathe(false); });
// (Timers, not animation frames: the list may be drawn while its layer is still out of sight.)
function glowRow(sheet, tries = 0) {
  const r = sheet && document.querySelector(`#tabs .tp[data-mock="${CSS.escape(sheet)}"]`);
  if (!r) { if (sheet && tries < 10) setTimeout(() => glowRow(sheet, tries + 1), 80); return; }
  r.classList.remove('mfresh'); void r.offsetWidth; r.classList.add('mfresh');
  setTimeout(() => r.classList.remove('mfresh'), 3400);
}
// His ask (2026-10-12): resting the mouse on the handle opens the drawer, as other apps do. A short wait, so
// passing over it on the way somewhere does nothing; dragging a tab onto it opens it too.
let hoverOpen = 0;
const handle = el('drawerkey');
handle.addEventListener('pointerenter', () => { window.aang?.browserAct?.('peek'); clearTimeout(hoverOpen); if (!drawerOpen) hoverOpen = setTimeout(openDrawer, 250); });   // 0.25 s (his pick, 2026-10-20; was 0.4)
handle.addEventListener('pointerleave', () => clearTimeout(hoverOpen));
handle.addEventListener('pointerdown', () => clearTimeout(hoverOpen));
handle.addEventListener('dragenter', () => { if (!drawerOpen) openDrawer(); });
// Anything that will cover the page: take its picture while the mouse is on the way, so the click is instant.
// Not the address slot (measured 2026-10-20): the mouse crosses it all the time, and each pass took a picture of the
// page for nothing. A click on it takes the picture then.
for (const id of ['menukey', 'dlkey']) el(id)?.addEventListener('pointerenter', () => window.aang?.browserAct?.('peek'));
// A click on the page (its picture) puts the drawer away, as clicking outside any drawer does.
page.addEventListener('pointerdown', () => { closeDrawer(); closeMenu(); });
// A new tab from the list keeps the list open (his ask, 2026-10-13); it goes when the mouse leaves it.
el('newtab').addEventListener('click', () => { if (!SOLO) closeDrawer(); });

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
function editSlot(keepList = false) {
  // The menu hides the page under it; typing an address means he wants the page, so it goes. The tab list floats over a
  // LIVE page now, so a new tab (or Ctrl+L) leaves it open: it closes when his mouse leaves it (his ask, 2026-10-13).
  if (!keepList) closeDrawer();
  closeMenu();
  const t = state.tabs.find((x) => x.id === state.active);
  urlEl.hidden = true; edit.hidden = false;
  edit.value = t?.url ?? '';
  edit.focus(); edit.select();
}
function closeSlot() { edit.hidden = true; urlEl.hidden = false; }
el('slot').addEventListener('click', (e) => { if (finding || lock.contains(e.target)) return; if (edit.hidden) editSlot(); });
// ---- address suggestions (6.22b item 6): tabs first ("switch to it"), then bookmarks, then recently closed.
// The first row is always what he typed, so Enter does what he typed unless he arrows to something else.
let sugg = [], pick = 0, suggSeq = 0;
const sbox = el('suggest');
function hideSuggest() { if (!sbox.hidden) { sbox.hidden = true; el('slot').classList.remove('open'); unfreeze('suggest'); } sugg = []; }
// Sheet 19 A: one small glyph per kind, on the band's own 7 by 7 grid (the bookmark is the star's own shape).
const SUG_GLYPH = {
  search: ['0 0 7 7', 'M1 0h3v1H1zM0 1h1v3H0zM4 1h1v3H4zM1 4h3v1H1zM4 5h2v1H4zM5 6h2v1H5z'],
  go: ['0 0 7 7', 'M1 0h1v1H1zM2 0h1v1H2zM2 1h1v1H2zM3 1h1v1H3zM3 2h1v1H3zM4 2h1v1H4zM4 3h1v1H4zM5 3h1v1H5zM3 4h1v1H3zM4 4h1v1H4zM2 5h1v1H2zM3 5h1v1H3zM1 6h1v1H1zM2 6h1v1H2z'],
  tab: ['0 0 7 7', 'M1 0h3v1H1zM0 1h7v1H0zM0 2h1v4H0zM6 2h1v4H6zM0 6h7v1H0z'],
  mark: ['0 0 9 8', 'M1 0h2v1H1zM6 0h2v1H6zM0 1h4v4H0zM5 1h4v4H5zM0 5h1v1H0zM8 5h1v1H8zM0 6h4v1H0zM5 6h4v1H5zM3 7h3v1H3z'],
  history: ['0 0 7 7', 'M1 0h5v1H1zM0 1h1v5H0zM6 1h1v5H6zM3 1h1v3H3zM4 3h1v1H4zM1 6h5v1H1z'],
  closed: ['0 0 7 7', 'M2 0h1v1H2zM1 1h2v1H1zM0 2h7v1H0zM1 3h2v1H1zM6 3h1v3H6zM2 4h1v1H2zM2 6h4v1H2z'],
};
const SUG_ACT = { search: 'Search', go: 'Go', tab: 'Switch to tab', mark: 'Open', history: 'Open', closed: 'Reopen' };
const SVGNS = 'http://www.w3.org/2000/svg';
/** The title with what he has NOT typed in bold (Chrome's rule), built from text nodes only. */
function boldRest(span, text, typed) {
  const at = typed ? text.toLowerCase().indexOf(typed.toLowerCase()) : -1;
  const b = (t) => { if (t) span.append(Object.assign(document.createElement('b'), { textContent: t })); };
  if (at < 0) { b(text); return; }
  b(text.slice(0, at));
  span.append(document.createTextNode(text.slice(at, at + typed.length)));
  b(text.slice(at + typed.length));
}
/** The list hangs exactly under the slot, exactly as wide, so it reads as the field's own. */
function placeSuggest() {
  const band = el('band').getBoundingClientRect(), s = el('slot').getBoundingClientRect();
  sbox.style.left = Math.round(s.left - band.left) + 'px';
  sbox.style.width = Math.round(s.width) + 'px';
  sbox.style.top = Math.round(s.bottom - band.top) + 'px';
}
function paintSuggest() {
  if (!sugg.length) { hideSuggest(); return; }
  const typed = edit.value.trim();
  sbox.replaceChildren(...sugg.map((s, i) => {
    const row = document.createElement('div');
    row.className = 'srow' + (i === pick ? ' on' : '');
    row.setAttribute('role', 'option');
    row.setAttribute('aria-selected', String(i === pick));
    const [vb, d] = SUG_GLYPH[s.kind] ?? SUG_GLYPH.go;
    const wide = vb === '0 0 9 8';
    const svg = document.createElementNS(SVGNS, 'svg');
    svg.setAttribute('viewBox', vb); svg.setAttribute('width', wide ? '18' : '14'); svg.setAttribute('height', wide ? '16' : '14');
    svg.setAttribute('shape-rendering', 'crispEdges'); svg.setAttribute('aria-hidden', 'true');
    const path = document.createElementNS(SVGNS, 'path'); path.setAttribute('d', d); svg.append(path);
    row.append(Object.assign(document.createElement('span'), { className: 'sg' }));
    row.lastChild.append(svg);
    const st = Object.assign(document.createElement('span'), { className: 'st' });
    const bare = String(s.url ?? '').replace(/^https?:\/\/(www\.)?/, '');
    const onlyUrl = !s.title || s.title === s.url;      // a closed tab has no title: say the address once
    if (s.kind === 'search' || s.kind === 'go') st.textContent = typed; else boldRest(st, onlyUrl ? bare : String(s.title), typed);
    row.append(st);
    const where = s.kind === 'search' ? 'Search the web' : s.kind === 'go' || onlyUrl ? '' : bare;
    if (where) row.append(Object.assign(document.createElement('span'), { className: 'su', textContent: where }));
    row.append(Object.assign(document.createElement('span'), { className: 'sa', textContent: SUG_ACT[s.kind] ?? 'Open' }));
    row.addEventListener('mousedown', (e) => { e.preventDefault(); choose(i); });
    row.addEventListener('mouseenter', () => { if (pick !== i) { pick = i; sbox.querySelectorAll('.srow').forEach((r, j) => { r.classList.toggle('on', j === i); r.setAttribute('aria-selected', String(j === i)); }); } });
    return row;
  }));
  placeSuggest();
  if (sbox.hidden) { sbox.hidden = false; el('slot').classList.add('open'); freeze('suggest'); }
}
function choose(i) {
  const s = sugg[i];
  if (!s) return;
  if (s.kind === 'tab' && Number.isInteger(s.id)) window.aang?.browserTab?.({ id: s.id, act: 'show' });
  else if (s.kind === 'search' || s.kind === 'go') window.aang?.browserGo?.(edit.value.trim());
  else window.aang?.browserGo?.(s.url);
  hideSuggest(); closeSlot();
}
edit.addEventListener('input', () => {
  const seq = ++suggSeq;
  const text = edit.value;
  if (!text.trim()) { hideSuggest(); return; }
  window.aang?.browserSuggest?.(text).then((list) => { if (seq !== suggSeq || edit.hidden) return; sugg = Array.isArray(list) ? list : []; pick = 0; paintSuggest(); });
});
edit.addEventListener('keydown', (e) => {
  if (e.key === 'ArrowDown' && sugg.length) { pick = (pick + 1) % sugg.length; paintSuggest(); e.preventDefault(); return; }
  if (e.key === 'ArrowUp' && sugg.length) { pick = (pick - 1 + sugg.length) % sugg.length; paintSuggest(); e.preventDefault(); return; }
  if (e.key === 'Enter' && edit.value.trim()) { if (sugg.length && pick > 0) choose(pick); else { window.aang?.browserGo?.(edit.value.trim()); hideSuggest(); closeSlot(); } }
  if (e.key === 'Escape') { hideSuggest(); closeSlot(); }
});
edit.addEventListener('blur', () => setTimeout(hideSuggest, 120));
edit.addEventListener('blur', () => setTimeout(closeSlot, 120));
window.aang?.onBrowserFocusSlot?.(() => editSlot(true));

// ---- find on page (Ctrl+F). Typing searches as he types; Enter is the next match, Shift+Enter the one before;
// Esc, or clicking away, puts the slot back as it was.
const findBox = el('find'), findTag = el('findtag'), findN = el('findn');
let finding = false;
function openFind() {
  closeSlot(); closeMenu(); closeDrawer();
  finding = true;
  urlEl.hidden = true; lock.hidden = true; delete lock.dataset.u;
  findTag.hidden = false; findBox.hidden = false; findN.hidden = false;
  findN.textContent = ''; findN.classList.remove('none');
  findBox.focus(); findBox.select();
  if (findBox.value) window.aang?.browserFind?.({ text: findBox.value });
}
function closeFind() {
  if (!finding) return;
  finding = false;
  findTag.hidden = true; findBox.hidden = true; findN.hidden = true;
  urlEl.hidden = false;
  window.aang?.browserFindStop?.();
  const t = state.tabs.find((x) => x.id === state.active);
  paintUrl(t?.url ?? '');
}
findBox.addEventListener('input', () => window.aang?.browserFind?.({ text: findBox.value }));
findBox.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') { e.preventDefault(); window.aang?.browserFind?.({ text: findBox.value, next: true, back: e.shiftKey }); }
  if (e.key === 'Escape') { e.preventDefault(); closeFind(); }
});
findBox.addEventListener('blur', () => setTimeout(() => { if (document.activeElement !== findBox) closeFind(); }, 150));
window.aang?.onBrowserFindOpen?.(() => openFind());
window.aang?.onBrowserFound?.((r) => {
  if (!finding || !r) return;
  const none = findBox.value && r.of === 0;
  findN.classList.toggle('none', Boolean(none));
  findN.textContent = !findBox.value ? '' : none ? 'NONE' : `${r.at} OF ${r.of}`;
});

// The browser's keys work here too, when the frame has the keyboard.
window.addEventListener('keydown', (e) => {
  const c = e.ctrlKey || e.metaKey, k = e.key.toLowerCase();
  const send = (a) => { e.preventDefault(); window.aang?.browserAct?.(a); };
  if (k === 'escape' && dlOpen) { e.preventDefault(); closeDl(); return; }
  // Esc only stops WATCHING; stopping a job is the STOP key, confirmed (2026-10-14: a job was stopped he never meant to).
  if (k === 'escape' && state.watching) { e.preventDefault(); window.aang?.browserDriver?.({ act: 'unwatch', id: 0 }); return; }
  if (k === 'escape' && menuOpen) { e.preventDefault(); closeMenu(); return; }
  if (k === 'escape' && drawerOpen) { e.preventDefault(); closeDrawer(); return; }
  if (c && e.shiftKey && k === 't') send('reopen');
  else if (c && k === 't') { tap(); send('newtab'); }
  else if (c && k === 'w') { tap(0.7); send('close'); }
  else if (c && k === 'l') { e.preventDefault(); editSlot(); }
  else if (c && k === 'f') { e.preventDefault(); openFind(); }
  else if ((c && k === 'r') || k === 'f5') send('reload');
  else if (c && !e.shiftKey && k === 'h') send('history');
  else if (c && !e.shiftKey && k === 'j') send('downloads');
});

/** The address as sheet 3 draws it: the real domain bright, the rest dimmed. */
function paintUrl(u) {
  // Only when the address really changed (measured 2026-10-20): repainting it, and resetting the shield's three
  // pictures, on every tab-list message was a large part of the band's work during a page load. Anything else that
  // writes the shield clears lock.dataset.u, so the next call paints for real.
  if (lock.dataset.u === String(u)) return;
  lock.dataset.u = String(u);
  urlEl.replaceChildren();
  // The browser's own pages (Settings) say their name, with no shield: they are not websites.
  if (String(u).startsWith('aang:')) { urlEl.append(Object.assign(document.createElement('b'), { textContent: String(u) === 'aang:things' ? 'Your things' : 'Settings' })); lock.hidden = true; return; }
  let parsed = null;
  try { parsed = new URL(u); } catch { /* not a URL */ }
  if (!parsed) { urlEl.textContent = u; lock.hidden = true; return; }
  lock.hidden = false;
  // This PC's own pages (mockups, Aang's pages) never leave the machine, so nothing can read them on the way:
  // "NOT SECURE" there was a false alarm (his catch, 2026-10-21). Only the loopback names count.
  const ownPc = parsed.protocol === 'http:' && ['127.0.0.1', 'localhost', '[::1]'].includes(parsed.hostname);
  const secure = parsed.protocol === 'https:' || ownPc;
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

const VIDEO_SITE = /(^|\.)(youtube\.com|youtu\.be|twitch\.tv|crunchyroll\.com|netflix\.com|primevideo\.com|amazon\.(com|ca)|disneyplus\.com|vimeo\.com|kick\.com|max\.com|crave\.ca)$/i;
const hostOf = (u) => { try { return new URL(u).hostname; } catch { return ''; } };
// The site shield (his pick, 2026-10-12): hand-built pixel art, mirror-perfect, Aang's arrow on a gold-rimmed shield.
// Shown at its exact pixel size, never scaled. tools/pixelart/shield/bar_arrow.py makes it.
// Option C (his pick, 2026-10-12, from how every browser does it): one quiet colour at rest; the full-colour shield
// while he points at it or its panel is open; solid blue when it caught a popup; red when something is wrong.
const SHIELD = '<span class="shieldbox"><img class="s-rest" src="art/browser/shield_rest.png" width="20" height="24" alt="">'
  + '<img class="s-hover" src="art/browser/shield_hover.png" width="20" height="24" alt="">'
  + '<img class="s-popup" src="art/browser/shield_popup.png" width="20" height="24" alt=""></span>';
const SPEAKER = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2 6h3l4-3v10l-4-3H2z" fill="#2a1c00"/><path d="M11 5c1.5 1.5 1.5 4.5 0 6" stroke="#2a1c00" stroke-width="1.8" fill="none"/></svg>';
// Rows are kept and only redrawn when something about that tab changed, so a title or a spinner on one
// tab never rebuilds the whole rail (that rebuild was the flicker, and it dropped the hover under the mouse).
const rows = new Map();
const heads = new Map();
/**
 * The drawer's list, sheet 3 section 3: loose tabs first, then each trail under its carved heading, then the
 * DONE shelf. Rows are kept and only rebuilt when something about that tab changed (the flicker fix).
 */
function paintTabs() {
  // Just after a drop, where every row was, so the rows can glide to their new places (dragging, 2026-10-21).
  const flipWas = performance.now() < flipUntil ? rowSpots() : null;
  const open = new Set(state.tabs.map((t) => t.id));
  const trails = Array.isArray(state.trails) ? state.trails : [];
  const live = state.tabs.filter((t) => !t.done);
  const groups = [{ id: null, tabs: live.filter((t) => t.trail == null) }];
  for (const tr of trails) { const tabs = live.filter((t) => t.trail === tr.id); if (tabs.length) groups.push({ id: tr.id, trail: tr, tabs }); }
  const done = state.tabs.filter((t) => t.done);
  const rowFor = (t, kid) => {
    const dup = Boolean(state.tidy?.dup?.includes(t.id));
    const sig = JSON.stringify([t.id === state.active, t.crashed, t.asleep, t.loading, t.phase, t.favicon, t.title, t.url, t.audible, t.muted, kid, t.done, t.lent, dup, t.mock?.v ?? null]);
    let r = rows.get(t.id);
    if (!r || r.sig !== sig) {
      const fresh = buildRow(t, kid);
      if (dup) { fresh.classList.add('dup'); fresh.append(Object.assign(document.createElement('span'), { className: 'dupchip', textContent: 'X2 CLOSING' })); }
      fresh.dataset.tab = String(t.id);
      if (r) r.el.replaceWith(fresh); r = { sig, el: fresh }; rows.set(t.id, r);
    }
    // Where it sits, for dragging (2026-10-21): written every time, since a move changes these without a rebuild.
    r.el.dataset.trail = t.trail == null ? '' : String(t.trail);
    r.el.dataset.depth = kid ? '1' : '0';
    r.el.dataset.parent = kid && !t.mock && t.opener != null ? String(t.opener) : '';
    return r.el;
  };
  const want = [];
  for (const g of groups) {
    // Sheet 47: the MOCKUPS trail draws its own family tree and its history.
    if (g.trail?.mock) { want.push(...mockNodes(g, rowFor)); continue; }
    if (g.id !== null) want.push(headFor(g.trail, g.tabs.length));
    const inGroup = new Set(g.tabs.map((t) => t.id));
    // Only inside a trail does a tab sit under the one it came from; loose tabs are a flat list.
    if (g.trail?.collapsed) continue;
    for (const t of g.tabs) want.push(rowFor(t, g.id !== null && Boolean(t.opener && inGroup.has(t.opener))));
  }
  let shelf = document.getElementById('doneshelf');
  if (done.length) {
    if (!shelf) { shelf = document.createElement('div'); shelf.id = 'doneshelf'; shelf.className = 'shelf'; }
    const lab = document.createElement('div'); lab.className = 'lab';
    lab.append(Object.assign(document.createElement('span'), { textContent: 'DONE' }), Object.assign(document.createElement('span'), { textContent: String(done.length) }));
    shelf.replaceChildren(lab, ...done.map((t) => rowFor(t, false)));
    want.push(shelf);
  }
  for (const [id, r] of rows) if (!open.has(id)) { r.el.remove(); rows.delete(id); }
  for (const [id, h] of heads) if (!groups.some((g) => g.id === id)) { h.remove(); heads.delete(id); }
  if (!done.length && shelf) shelf.remove();
  want.push(...driverNodes());
  want.forEach((node, i) => { if (tabsBox.children[i] !== node) tabsBox.insertBefore(node, tabsBox.children[i] ?? null); });
  while (tabsBox.children.length > want.length) tabsBox.lastElementChild.remove();
  afterPaint(flipWas);
}
/** A trail's carved heading. Click the name to rename it; his name is kept for good (Qwen never renames it). */
function headFor(tr, n) {
  let h = heads.get(tr.id);
  if (!h) { h = document.createElement('div'); h.className = 'th'; heads.set(tr.id, h); }
  if (h.querySelector('input')) return h;               // he is typing its name: leave it be
  const nm = Object.assign(document.createElement('span'), { className: 'nm', textContent: tr.name, title: 'Click to rename' });
  nm.addEventListener('click', (e) => {
    e.stopPropagation();
    const box = Object.assign(document.createElement('input'), { value: tr.name, maxLength: 24, spellcheck: false });
    box.setAttribute('aria-label', 'Trail name');
    const done = (save) => { if (save && box.value.trim()) window.aang?.browserTrail?.({ act: 'rename', id: tr.id, name: box.value }); box.replaceWith(nm); };
    box.addEventListener('keydown', (k) => { if (k.key === 'Enter') done(true); if (k.key === 'Escape') { k.stopPropagation(); done(false); } });
    box.addEventListener('blur', () => done(true));
    nm.replaceWith(box); box.focus(); box.select();
  });
  const grip = Object.assign(document.createElement('i'), { className: 'grip', title: 'Drag to move this trail' });
  const more = Object.assign(document.createElement('button'), { type: 'button', className: 'thm', textContent: '\u00b7\u00b7\u00b7', title: 'Trail options' });
  more.addEventListener('click', (e) => { e.stopPropagation(); trailMenu(tr, e.clientX, e.clientY); });
  h.classList.toggle('fresh', tr.fresh === true);
  h.classList.toggle('shut', tr.collapsed === true);
  h.dataset.trail = String(tr.id);
  h.replaceChildren(grip, nm, Object.assign(document.createElement('span'), { className: 'n', textContent: `${n} TAB${n === 1 ? '' : 'S'}` }), more);
  return h;
}

// ---- the tab's own menu (right-click), sheet 3 section 7
function closeTabMenu() { document.getElementById('tabmenu')?.remove(); }
/** A bookmark's own menu (his ask, 2026-10-20): the same wood menu as a tab's. */
function markMenu(b, name, key, x, y, i, n) {
  closeTabMenu();
  const m = document.createElement('div'); m.id = 'tabmenu'; m.className = 'tabmenu'; m.setAttribute('role', 'menu');
  const op = (act, title) => window.aang?.browserMarkOp?.({ act, url: b.url, ...(title !== undefined ? { title } : {}) });
  const item = (label, go, off = false) => {
    const btn = document.createElement('button'); btn.type = 'button'; btn.setAttribute('role', 'menuitem'); btn.append(label); btn.disabled = off;
    btn.addEventListener('click', () => { closeTabMenu(); go(); });
    m.append(btn);
  };
  const sep = () => m.append(Object.assign(document.createElement('div'), { className: 'sep' }));
  item('Open in new tab', () => op('newtab'));
  if (VIDEO_SITE.test(hostOf(b.url))) item('Play in the pop-out', () => op('pop'));
  item('Copy link', () => op('copy'));
  sep();
  item('Rename', () => renameMark(b, name, key));
  item('Move left', () => op('left'), i === 0);
  item('Move right', () => op('right'), i >= n - 1);
  sep();
  item('Remove', () => { tap(0.7); op('remove'); });
  document.body.append(m);
  const r = m.getBoundingClientRect();
  m.style.left = Math.max(4, Math.min(x, innerWidth - r.width - 4)) + 'px';
  m.style.top = Math.max(4, Math.min(y, innerHeight - r.height - 4)) + 'px';
  setTimeout(() => document.addEventListener('pointerdown', (e) => { if (!m.contains(e.target)) closeTabMenu(); }, { once: true }), 0);
}
/** Rename right on the key's banner: type, Enter keeps it, Esc leaves it as it was. */
function renameMark(b, name, key) {
  const banner = key.querySelector('.bm-banner');
  if (!banner) return;
  const box = Object.assign(document.createElement('input'), { value: name, maxLength: 60, spellcheck: false });
  box.className = 'bm-rename'; box.setAttribute('aria-label', 'Bookmark name');
  key.classList.add('naming');
  const done = (save) => {
    key.classList.remove('naming');
    if (save && box.value.trim() && box.value.trim() !== name) window.aang?.browserMarkOp?.({ act: 'rename', url: b.url, title: box.value });
    box.remove(); banner.hidden = false;
  };
  box.addEventListener('keydown', (k) => { k.stopPropagation(); if (k.key === 'Enter') done(true); if (k.key === 'Escape') done(false); });
  box.addEventListener('blur', () => done(true));
  banner.hidden = true; key.append(box); box.focus(); box.select();
}

function tabMenu(t, x, y) {
  closeTabMenu();
  const m = document.createElement('div'); m.id = 'tabmenu'; m.className = 'tabmenu'; m.setAttribute('role', 'menu');
  const item = (label, go, opts = {}) => {
    const b = document.createElement('button'); b.type = 'button'; b.setAttribute('role', 'menuitem');
    if (opts.sub) b.className = 'sub';
    b.append(label);
    if (opts.soon) { b.disabled = true; b.append(Object.assign(document.createElement('i'), { textContent: 'SOON' })); }
    else b.addEventListener('click', () => { closeTabMenu(); go(); });
    m.append(b);
  };
  const sep = () => m.append(Object.assign(document.createElement('div'), { className: 'sep' }));
  item('Reload', () => window.aang?.browserTab?.({ id: t.id, act: 'reload' }));
  item(t.muted ? 'Unmute' : 'Mute', () => window.aang?.browserTab?.({ id: t.id, act: 'mute' }));
  sep();
  const trails = (Array.isArray(state.trails) ? state.trails : []).filter((tr) => !tr.mock);
  if (t.mock) {
    // Sheet 47: a mockup stays in MOCKUPS. Its versions, and where it sits in the tree (his ask, 2026-10-21).
    const vs = expander(m, 'Versions');
    for (const v of t.mock.versions ?? []) vs(versionLabel(v), () => window.aang?.browserMockup?.({ act: 'show', id: v.id }), v.now ? 'NOW' : '');
    const bs = expander(m, 'Move to branch');
    for (const b of state.mockups?.branches ?? []) if (b.id !== t.mock.branch || t.mock.parent) bs(b.name, () => window.aang?.browserMockup?.({ act: 'branch', sheet: t.mock.sheet, to: b.id }));
    bs('New branch...', () => window.aang?.browserMockup?.({ act: 'branchnew', sheet: t.mock.sheet }));
    if (t.mock.branch != null || t.mock.parent) item('Make it top level', () => window.aang?.browserMockup?.({ act: 'top', sheet: t.mock.sheet }));
    // Send to Aang (his pick, 2026-10-21): only while Aang is running, like the words item on a page.
    if (state.mockups?.toAang) { item('Send to Aang', () => window.aang?.browserMockup?.({ act: 'sendtab', id: t.id })); aangFaceOn(m); }
  } else {
  for (const tr of trails) if (tr.id !== t.trail) item('Move to ' + tr.name.toLowerCase().replace(/^./, (c) => c.toUpperCase()), () => window.aang?.browserTrail?.({ act: 'move', tab: t.id, to: tr.id }), { sub: true });
  item('Move to a new trail', () => window.aang?.browserTrail?.({ act: 'move', tab: t.id, to: 'new' }), { sub: true });
  if (t.trail != null) item('Take out of the trail', () => window.aang?.browserTrail?.({ act: 'move', tab: t.id, to: null }), { sub: true });
  }
  sep();
  item('Open in Chrome', () => {}, { soon: true });
  item('Popout', () => window.aang?.browserPopout?.(t.id));
  // The same as dragging it out of the window (his ask, 2026-10-13).
  item('Open in new window', () => window.aang?.browserTab?.({ id: t.id, act: 'newwindow' }));
  item(OTHER.label, () => window.aang?.browserToMac?.(t.id));
  // His ask (2026-10-13): the page as a full tab in Aang's browser on the other machine, brought to the front there.
  item(OTHER.open, () => window.aang?.browserOpenOther?.(t.id));
  sep();
  item('Close', () => { tap(0.7); window.aang?.browserTab?.({ id: t.id, act: 'close' }); });
  document.body.append(m);
  const r = m.getBoundingClientRect();
  m.style.left = Math.max(4, Math.min(x, innerWidth - r.width - 4)) + 'px';
  m.style.top = Math.max(4, Math.min(y, innerHeight - r.height - 4)) + 'px';
  setTimeout(() => document.addEventListener('pointerdown', (e) => { if (!m.contains(e.target)) closeTabMenu(); }, { once: true }), 0);
}
/** "QUEST COMPLETE" over the tab for a moment, then it drops to the DONE shelf with a quiet tick (sheet 3). */
function turnIn(id) {
  const r = rows.get(id)?.el;
  if (r) r.append(Object.assign(document.createElement('span'), { className: 'quest', textContent: 'QUEST COMPLETE' }));
  setTimeout(() => { tap(1.25); window.aang?.browserTab?.({ id, act: 'done' }); }, 850);
}


/** A tab's icon slot when the site has no icon: its first letter. */
function tileFor(t) {
  const s = document.createElement('span'); s.className = 'fi letter';
  s.textContent = (String(t.title || hostOf(t.url) || '?').match(/[a-z0-9]/i)?.[0] ?? '?').toUpperCase();
  return s;
}

function buildRow(t, kid) {
  {
    const row = document.createElement('div');
    const asleep = t.asleep && t.id !== state.active;
    row.className = 'tp' + (t.id === state.active ? ' on' : '') + (t.crashed ? ' crash' : '') + (asleep ? ' sleep' : '') + (kid ? ' kid' : '') + (t.done ? ' done' : '');
    row.title = t.url;
    row.tabIndex = 0;
    const ph = t.phase ?? (t.loading ? 'loading' : 'idle');
    if (ph !== 'idle' && !t.crashed) row.append(Object.assign(document.createElement('i'), { className: 'arc' + (ph === 'waiting' ? ' wait' : '') }));
    else if (ringWas.get(t.id) && ringWas.get(t.id) !== 'idle' && !t.crashed) { const b = Object.assign(document.createElement('i'), { className: 'arc burst' }); row.append(b); setTimeout(() => b.remove(), 400); }
    // His pick (2026-10-21): every mockup comes from Claude, so it wears Claude's icon, the same one as the trail's head.
    else if (t.mock) row.append(Object.assign(document.createElement('img'), { className: 'fi claude', alt: '', src: 'art/claude-icon.png' }));
    else if (t.favicon) { const i = document.createElement('img'); i.className = 'fi'; i.alt = ''; i.src = t.favicon; i.referrerPolicy = 'no-referrer'; i.onerror = () => i.replaceWith(tileFor(t)); row.append(i); }
    // Sheet 43d: every tab has its icon slot; a site with no icon gets its first letter, carved, never an empty gap.
    else row.append(tileFor(t));
    const title = document.createElement('span'); title.className = 't'; title.textContent = t.title || t.url;
    row.append(title);
    if (t.crashed) { const c = document.createElement('span'); c.className = 'cr'; c.textContent = 'CRASHED'; row.append(c); }
    // Sheet 3: asleep is sunk flush into the wood, colour drained. Click and it wakes where it was.
    // Sheet 43d (2026-10-20): a small pixel moon instead of the word, which was too small to read.
    if (asleep && !t.lent) { const z = document.createElement('span'); z.className = 'zz moon'; z.title = 'Asleep: click to wake it'; z.setAttribute('aria-label', 'Asleep'); const m = pixIcon('moon', 1); if (m) z.append(m); else z.textContent = 'ASLEEP'; row.append(z); }
    if (t.lent) { const z = document.createElement('span'); z.className = 'zz lent'; z.textContent = 'IN POPOUT'; row.append(z); }
    // The pop-out keycap, only on video tabs: a video site, or anything playing sound right now.
    if (!t.done && !t.lent && (t.audible || VIDEO_SITE.test(hostOf(t.url)))) {
      const p = document.createElement('button'); p.type = 'button'; p.className = 'pip';
      p.title = 'Pops this page into its own window'; p.setAttribute('aria-label', 'Popout');
      p.addEventListener('click', (e) => { e.stopPropagation(); window.aang?.browserPopout?.(t.id); });
      // Send to the MacBook, beside it: the same keycap, on hover only (his ask, 2026-10-12). It stops here.
      const m = document.createElement('button'); m.type = 'button'; m.className = 'pip tomac';
      m.title = OTHER.title; m.setAttribute('aria-label', OTHER.label);
      m.innerHTML = '<svg viewBox="0 0 7 7" width="12" height="12" shape-rendering="crispEdges" aria-hidden="true"><path d="M0 0h7v1H0zM0 1h1v2H0zM6 1h1v2H6zM0 3h7v1H0zM0 5h7v1H0z" fill="#2a1c00"/></svg>';
      m.addEventListener('click', (e) => { e.stopPropagation(); window.aang?.browserToMac?.(t.id); });
      row.append(p, m);
    }
    if (t.audible || t.muted) {
      // Sheet 3: a real button. Press it to mute; pressed in, with a red slash, when muted.
      const s = document.createElement('button'); s.type = 'button'; s.className = 'spk' + (t.muted ? ' muted' : '');
      s.setAttribute('aria-label', t.muted ? 'Unmute this tab' : 'Mute this tab');
      s.innerHTML = SPEAKER;
      s.addEventListener('click', (e) => { e.stopPropagation(); window.aang?.browserTab?.({ id: t.id, act: 'mute' }); });
      row.append(s);
    }
    // Sheet 47: a mockup wears its version (V3); a click lists the sheet's other versions.
    if (t.mock && t.mock.v) {
      const v = Object.assign(document.createElement('button'), { type: 'button', className: 'ver', textContent: 'V' + t.mock.v, title: 'Versions of this mockup' });
      v.addEventListener('click', (e) => { e.stopPropagation(); versionsMenu(t, e.clientX, e.clientY); });
      row.append(v);
    }
    const x = document.createElement('button'); x.type = 'button'; x.className = 'x'; x.textContent = '×'; x.setAttribute('aria-label', 'Close tab');
    x.addEventListener('click', (e) => { e.stopPropagation(); tap(0.7); window.aang?.browserTab?.({ id: t.id, act: 'close' }); });
    row.append(x);
    // A tab switches on the press, not the release, the way Chrome does; its buttons keep their own clicks.
    // His ask (2026-10-13): picking a tab shows it and the list stays, so he can look through tabs; it goes when the mouse leaves it.
    row.addEventListener('pointerdown', (e) => { if (e.button === 0 && !e.target.closest('button')) window.aang?.browserTab?.({ id: t.id, act: 'show' }); });
    row.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); window.aang?.browserTab?.({ id: t.id, act: 'show' }); } });
    row.addEventListener('auxclick', (e) => { if (e.button === 1) { tap(0.7); window.aang?.browserTab?.({ id: t.id, act: 'close' }); } });
    row.addEventListener('contextmenu', (e) => { e.preventDefault(); tabMenu(t, e.clientX, e.clientY); });
    return row;
  }
}

// ---- bookmarks on the velvet shelf: logo and name, a click opens it. Empty until the import (6.23).
/**
 * A bookmark's short name (sheet 43, 2026-10-20): page titles are often "Feed | LinkedIn" or "Inbox (3) - Gmail". When the
 * title names the site and the rest is a generic page word, the site's name is the bookmark's name; otherwise the
 * title's first part. His own rename (the star's panel) is a title like any other and is kept as he typed it.
 */
const GENERIC = /^(home|feed|inbox|browse|watch|start|welcome|dashboard|log ?in|sign ?in|main|new tab|\(\d+\)|inbox \(\d+\))$/i;
function shortName(title, url) {
  const t = String(title || '').replace(/\s+/g, ' ').trim();
  let site = '';
  try { site = new URL(url).hostname.replace(/^(www|m|mail|web)\./, '').split('.').slice(-2, -1)[0] || ''; } catch { /* none */ }
  const parts = t.split(/\s+[|–—\-·:]\s+/).map((x) => x.trim()).filter(Boolean);
  if (parts.length > 1) {
    const named = parts.find((x) => site && x.toLowerCase().replace(/[^a-z0-9]/g, '').includes(site.toLowerCase()));
    const rest = parts.filter((x) => x !== named);
    if (named && rest.every((x) => GENERIC.test(x) || /@/.test(x))) return named;
    return parts[0];
  }
  return t || site || url;
}

/**
 * Bookmarks (sheet 43b, his pick 3 without numbers, 2026-10-20): raised wooden keys on the velvet, four to a row, an icon
 * on each and no words under it. The name rides on a parchment banner over the key he is pointing at (under it on the top
 * row, so the drawer's edge never cuts it). The last slot adds the page he is on, the same as the star.
 */
function paintMarks(list) {
  const box = el('marks');
  // Only when the bookmarks changed (measured 2026-10-20): rebuilding all 24 on every tab-list message was the
  // biggest single piece of the band's work during a page load.
  const sig = JSON.stringify(Array.isArray(list) ? list.slice(0, 24) : null);
  if (box.dataset.sig === sig) return;
  box.dataset.sig = sig;
  box.replaceChildren();
  box.className = 'row bm-slots';
  const marks = (Array.isArray(list) ? list : []).filter((b) => b && typeof b.url === 'string').slice(0, 24);
  marks.forEach((b, i) => {
    const m = document.createElement('button');
    // c0..c3: which column, so the edge columns' banners line up with the shelf instead of running off it (his report).
    m.type = 'button'; m.className = 'bm-key c' + (i % 4) + (i < 4 ? ' low' : '');
    // Never cut mid-word (his report): up to 70 letters, and past that the last whole word with an ellipsis.
    const full = shortName(b.title, b.url), name = full.length <= 70 ? full : full.slice(0, 70).replace(/\s+\S*$/, '') + '…';
    m.setAttribute('aria-label', name); m.title = '';
    if (b.favicon) { const img = document.createElement('img'); img.alt = ''; img.src = b.favicon; img.referrerPolicy = 'no-referrer'; img.onerror = () => { img.remove(); m.prepend(letter(name)); }; m.append(img); }
    else m.append(letter(name));
    const banner = document.createElement('span'); banner.className = 'bm-banner'; banner.textContent = name; m.append(banner);
    m.addEventListener('click', (e) => { if (e.target.closest('input')) return; window.aang?.browserGo?.(b.url); });
    m.addEventListener('contextmenu', (e) => { e.preventDefault(); markMenu(b, name, m, e.clientX, e.clientY, i, marks.length); });
    box.append(m);
  });
  const add = document.createElement('button');
  add.type = 'button'; add.className = 'bm-key bm-add c' + (marks.length % 4) + (marks.length < 4 ? ' low' : ''); add.textContent = '+';
  add.setAttribute('aria-label', 'Bookmark this page');
  const ab = document.createElement('span'); ab.className = 'bm-banner'; ab.textContent = marks.length ? 'Add this page' : 'Bookmark this page'; add.append(ab);
  // In the floating list the star's box would open out of sight (his freeze, 2026-10-20): the Shell asks the band.
  add.addEventListener('click', () => { if (SOLO) window.aang?.browserAct?.('markadd'); else el('star').click(); });
  box.append(add);
}
/** A site with no icon: its first letter, carved, so a key is never blank. */
function letter(name) { const s = document.createElement('i'); s.className = 'bm-letter'; s.textContent = (String(name).match(/[a-z0-9]/i)?.[0] ?? '?').toUpperCase(); return s; }

// ---- 6.22: a website's ask, hanging from the band. For this call only; there is no "always" for these.
let askId = null;
window.aang?.onBrowserAsk?.((a) => {
  if (!a || !Number.isInteger(a.id)) return;
  askId = a.id;
  el('askq').textContent = a.what || 'Allow this?';
  el('askm').textContent = a.text || `${a.host || 'This site'} wants it for what you are doing now. You are asked again next time.`;
  el('askyes').firstChild.textContent = a.yes || 'Allow for this call';
  el('askno').firstChild.textContent = a.no || 'No';
  el('askchip').hidden = false;
});
const answerAsk = (allow) => { if (askId === null) return; window.aang?.browserAskReply?.({ id: askId, allow }); askId = null; el('askchip').hidden = true; };
el('askyes').addEventListener('click', () => answerAsk(true));
el('askno').addEventListener('click', () => answerAsk(false));

// ---- 6.24: the screen-share picker. He picks one screen or one window; nothing is shared until he clicks Share.
let shareId = null, sharePick = null;
window.aang?.onBrowserShare?.((a) => {
  if (!a || !Number.isInteger(a.id)) return;
  if (a.gone) { if (shareId === a.id) { shareId = null; el('sharechip').hidden = true; } return; }
  shareId = a.id; sharePick = null;
  el('shareq').textContent = `Share your screen with ${a.host || 'this site'}?`;
  const fill = (box, kind) => {
    box.replaceChildren();
    for (const s of (Array.isArray(a.sources) ? a.sources : []).filter((x) => x.kind === kind)) {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'stile'; b.setAttribute('aria-pressed', 'false');
      const img = document.createElement('img');
      img.className = 'th'; img.alt = '';
      if (typeof s.thumb === 'string' && s.thumb.startsWith('data:image/')) img.src = s.thumb;
      b.append(img, Object.assign(document.createElement('span'), { textContent: String(s.name ?? ''), title: String(s.name ?? '') }));
      b.addEventListener('click', () => {
        sharePick = String(s.id);
        el('sharechip').querySelectorAll('.stile').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
        el('shareyes').disabled = false;
      });
      b.addEventListener('dblclick', () => { sharePick = String(s.id); answerShare(true); });
      box.append(b);
    }
    return box.childElementCount;
  };
  el('sharescreens-h').hidden = !fill(el('sharescreens'), 'screen');
  el('sharewins-h').hidden = !fill(el('sharewins'), 'window');
  el('sharesound').checked = false;
  el('sharesoundrow').hidden = a.audio !== true;
  el('shareyes').disabled = true;
  el('sharechip').hidden = false;
});
const answerShare = (yes) => {
  if (shareId === null) return;
  window.aang?.browserShareReply?.({ id: shareId, source: yes ? sharePick : null, sound: el('sharesound').checked });
  shareId = null; sharePick = null; el('sharechip').hidden = true;
};
el('shareyes').addEventListener('click', () => answerShare(true));
el('shareno').addEventListener('click', () => answerShare(false));
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && shareId !== null) { answerShare(false); e.preventDefault(); } });

// ---- Sheet 69: a site asks for a keyboard or mouse. He picks one of the devices listed, then Connect; Esc or Cancel = no.
let devId = null, devPick = null;
for (const s of document.querySelectorAll('#devchip [data-pix]')) { const svg = pixIcon(s.dataset.pix, 2); if (svg) s.append(svg); }
window.aang?.onBrowserDevAsk?.((a) => {
  if (!a || !Number.isInteger(a.id)) return;
  if (a.gone) { if (devId === a.id) { devId = null; devPick = null; el('devchip').hidden = true; } return; }
  if (devId !== a.id) devPick = null;
  devId = a.id;
  const list = Array.isArray(a.devices) ? a.devices : [];
  // The one he allowed last time comes up already picked (a new device beside it still needs his click).
  if (!list.some((d) => d.id === devPick)) devPick = list.length === 1 ? String(list[0].id) : (list.some((d) => d.id === a.picked) ? String(a.picked) : null);
  el('devm').textContent = list.length ? `${a.host || 'This site'} wants to talk to one device. Pick it.` : `${a.host || 'This site'} wants a keyboard or mouse. None that it can use is plugged in.`;
  const box = el('devlist');
  box.replaceChildren();
  for (const d of list) {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'dev'; b.setAttribute('aria-pressed', String(String(d.id) === devPick));
    const ic = pixIcon('keyboard', 2);
    const t = document.createElement('span'); t.className = 't';
    t.append(String(d.name ?? ''), Object.assign(document.createElement('small'), { textContent: String(d.how ?? '') }));
    if (ic) b.append(ic);
    b.append(t);
    b.addEventListener('click', () => { devPick = String(d.id); box.querySelectorAll('.dev').forEach((x) => x.setAttribute('aria-pressed', String(x === b))); el('devyes').disabled = false; });
    b.addEventListener('dblclick', () => { devPick = String(d.id); answerDev(true); });
    box.append(b);
  }
  el('devyes').disabled = !devPick;
  el('devchip').hidden = false;
});
const answerDev = (yes) => {
  if (devId === null) return;
  window.aang?.browserDevReply?.({ id: devId, device: yes ? devPick : null });
  devId = null; devPick = null; el('devchip').hidden = true;
};
el('devyes').addEventListener('click', () => answerDev(true));
el('devno').addEventListener('click', () => answerDev(false));
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && devId !== null) { answerDev(false); e.preventDefault(); } });

// ---- the SECURE plaque's panel: let ads through on one site, or block them again
lock.addEventListener('click', (e) => {
  e.stopPropagation();
  const t = state.tabs.find((x) => x.id === state.active);
  let host = '';
  try { host = new URL(t?.url ?? '').hostname.replace(/^www\./, ''); } catch { /* none */ }
  if (!host) return;
  el('sitehost').textContent = host;
  const fav = state.tabs.find((x) => x.id === state.active)?.favicon;
  el('sitefav').hidden = !fav; el('sitefav').onerror = () => { el('sitefav').hidden = true; }; if (fav) el('sitefav').src = fav;
  paintSite();
  el('sitepanel').hidden = !el('sitepanel').hidden;
  lock.classList.toggle('open', !el('sitepanel').hidden);
  // Hung from the shield itself (his report, 2026-10-14: it sat off to the side): its pointer (24px in, 18 wide) under the
  // shield's middle, measured each time, since the address bar moves with the window and the band.
  if (!el('sitepanel').hidden) {
    const band = el('band').getBoundingClientRect(), r = lock.getBoundingClientRect();
    el('sitepanel').style.left = Math.max(8, Math.round(r.left + r.width / 2 - band.left - 33)) + 'px';
  }
});
// Sheet 37: the shield's panel, every rule for this site. The Shell sends them in state.site.
for (const s of document.querySelectorAll('#sitepanel [data-pix]')) { const svg = pixIcon(s.dataset.pix, 2); if (svg) s.append(svg); }
function setSw(id, on, disabled = false) { el(id).classList.toggle('on', on); el(id).setAttribute('aria-checked', String(on)); el(id).disabled = disabled; }
const TRI = { allow: ['Allow', 'primary'], ask: ['Ask', ''], block: ['Block', 'burnt'] };
function setTri(id, v) { const [w, c] = TRI[v] ?? TRI.ask; el(id).textContent = w; el(id).className = 'key sm tri ' + c; el(id).dataset.v = v in TRI ? v : 'ask'; }
function paintSite() {
  const st = state.site;
  setSw('adsw', state.adsOn && !state.adsPaused, !state.adsOn);
  setSw('darksw', state.darkHere === true, state.darkAll === false);
  if (!st) return;
  setSw('popsw', st.popupBlock, state.prefs?.popups === false);
  setSw('aisw', st.ai); setSw('loginsw', st.login && st.ai, !st.ai);
  setTri('camk', st.camera); setTri('mick', st.mic);
  // Sheet 69: each keyboard or mouse this site may use, with Forget.
  const rows = el('devrows');
  rows.replaceChildren();
  for (const d of Array.isArray(st.devices) ? st.devices : []) {
    const r = document.createElement('div'); r.className = 'srow';
    const ic = Object.assign(document.createElement('span'), { className: 'sic' }); const svg = pixIcon('keyboard', 2); if (svg) ic.append(svg);
    const f = Object.assign(document.createElement('button'), { type: 'button', className: 'key sm burnt', textContent: 'Forget' });
    f.addEventListener('click', () => window.aang?.browserDevForget?.(String(d.key)));
    r.append(ic, Object.assign(document.createElement('b'), { textContent: String(d.name ?? '') }), f);
    rows.append(r);
  }
}
function paintAdSwitch() { paintSite(); }
function paintDarkSwitch() { paintSite(); }
const rule = (key, value) => window.aang?.browserSiteRule?.(key, value);
el('adsw').addEventListener('click', (e) => { e.preventDefault(); if (state.adsOn) rule('ads', !!state.adsPaused); });
el('darksw').addEventListener('click', (e) => { e.preventDefault(); if (state.darkAll !== false) rule('dark', !state.darkHere); });
el('popsw').addEventListener('click', (e) => { e.preventDefault(); if (state.site) rule('popups', !state.site.popupBlock); });
el('aisw').addEventListener('click', (e) => { e.preventDefault(); if (state.site) rule('ai', !state.site.ai); });
el('loginsw').addEventListener('click', (e) => { e.preventDefault(); if (state.site?.ai) rule('login', !state.site.login); });
const NEXT = { allow: 'ask', ask: 'block', block: 'allow' };
el('camk').addEventListener('click', () => rule('camera', NEXT[el('camk').dataset.v] ?? 'ask'));
el('mick').addEventListener('click', () => rule('mic', NEXT[el('mick').dataset.v] ?? 'ask'));
document.addEventListener('click', (e) => { if (!el('sitepanel').contains(e.target) && !lock.contains(e.target)) { el('sitepanel').hidden = true; lock.classList.remove('open'); } });
// The shield's panel sits OVER the page, like the ... menu, on a still picture of it (his report, 2026-10-14: pushing the live
// page down to make room left a big white bar above it). However it closes, the live page comes back.
// Only on a real change: every click anywhere sets hidden again, and a stray "unfreeze" put the live page back over the open
// tab list (his screenshot, 2026-10-14).
let siteOver = false;
new MutationObserver(() => { const open = !el('sitepanel').hidden; if (open === siteOver) return; siteOver = open; if (open) freeze('site'); else unfreeze('site'); }).observe(el('sitepanel'), { attributes: true, attributeFilter: ['hidden'] });
el('popopen').addEventListener('click', () => { window.aang?.browserAct?.('popupopen'); el('sitepanel').hidden = true; lock.classList.remove('open'); });
el('popallow').addEventListener('click', () => { window.aang?.browserAct?.('popupallow'); el('sitepanel').hidden = true; lock.classList.remove('open'); });

// ---- a finished download, said once in the band
window.aang?.onBrowserDownload?.((d) => {
  if (!d) return;
  const t = el('toast');
  if (d.state === 'completed') tap(1.4);
  if (d.quiet) return;   // the tray says it now
  if (d.undo === 'trailclose') {
    t.replaceChildren(String(d.text ?? ''), Object.assign(document.createElement('button'), { type: 'button', className: 'undo', textContent: 'Undo', onclick: () => { window.aang?.browserAct?.('trailundo'); t.hidden = true; } }));
    t.hidden = false;
    setTimeout(() => { t.hidden = true; }, 8000);
    return;
  }
  t.textContent = d.state === 'note' ? String(d.text ?? '') : d.state === 'completed' ? `Downloaded ${d.name} to your Downloads. Windows checks it before it opens.` : `${d.name} did not finish downloading.`;
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
el('bankchrome').addEventListener('click', () => window.aang?.browserAct?.('bankchrome'));
el('bankback').addEventListener('click', () => window.aang?.browserAct?.('phishback'));
el('reclaim').addEventListener('click', () => window.aang?.browserAct?.('reclaim'));
// Sheet 40 B: the pop-out's own keys. The words follow each press (the pop-out keeps the real state).
el('poppause').addEventListener('click', () => { window.aang?.browserAct?.('poppause'); el('poppause').textContent = el('poppause').textContent === 'Pause' ? 'Play' : 'Pause'; });
el('phishreal').addEventListener('click', () => window.aang?.browserAct?.('phishreal'));
el('failgo').addEventListener('click', () => window.aang?.browserAct?.('httpok'));
el('failretry').addEventListener('click', () => window.aang?.browserAct?.('failretry'));
el('failback').addEventListener('click', () => window.aang?.browserAct?.('failback'));

window.aang?.onBrowserTabs?.((s) => {
  if (!s || !Array.isArray(s.tabs)) return;
  state = s;
  railTabs(s);
  paintMarks(s.marks);
  el('m-mockups').hidden = !s.mockups;
  el('m-sitenotes').hidden = s.notes === false;
  paintTidy();
  paintStash();
  // The key: only where Bitwarden has a login here; gold with one soft pulse when it first shows.
  const vk = el('vkey');
  const showKey = s.hasLogin === true;
  if (showKey && vk.hidden) { vk.classList.remove('pulse'); void vk.offsetWidth; if (s.loginKnown) vk.classList.add('pulse'); }
  vk.hidden = !showKey;
  vk.classList.toggle('known', s.loginKnown === true);
  document.body.classList.toggle('maxed', s.maximized === true);
  el('wmax').setAttribute('aria-label', s.maximized ? 'Restore' : 'Maximise');
  el('star').classList.toggle('on', s.starred === true);
  el('star').setAttribute('aria-pressed', String(s.starred === true));
  el('star').setAttribute('aria-label', s.starred ? 'Take this page off your bookmarks' : 'Bookmark this page');
  el('star').title = s.starred ? 'Bookmarked. Click to take it off.' : 'Bookmark this page';
  if (menuOpen) paintMenu();
  const t = s.tabs.find((x) => x.id === s.active);
  paintTabs();
  mockArrived(s.mockNew);
  // Where he asked to go shows at once, dimmed, until the page arrives (only for his own typed or opened addresses).
  // Watching one of Aang's pages: the slot shows his page's address, and who is driving.
  if (edit.hidden && !finding) paintUrl(s.watching ? s.watching.url : (t?.pending || t?.url || ''));
  paintWho();
  el('slot').classList.toggle('pending', Boolean(t?.pending));
  el('back').classList.toggle('dim', !s.canBack);
  el('fwd').classList.toggle('dim', !s.canForward);
  barFor(t);
  for (const x of s.tabs) ringWas.set(x.id, x.phase ?? (x.loading ? 'loading' : 'idle'));
  // Reload becomes Stop the moment a page starts (6.22b item 9). Two guards, as in Chrome: a double-click cannot
  // stop the load it just started, and Stop waits to turn back while the mouse rests on it.
  const busy = Boolean(t && (t.phase ? t.phase !== 'idle' : t.loading));
  reloadWant(busy);
  // The zoom hint (6.22b item 10): only when the page is not at 100%; a click puts it back.
  const z = Number(s.zoomPct ?? 100);
  el('zoomhint').hidden = z === 100 || !t || String(t.url).startsWith('aang:');
  el('zoomhint').textContent = z + '%';
  const crashed = Boolean(t?.crashed);
  el('crashplate').hidden = !crashed;
  el('lentplate').hidden = !t?.lent;
  // Sheet 40 B: what is playing, its site, and the still taken as it went to the pop-out (sent once).
  if (typeof s.lentShot === 'string') el('lentshot').style.backgroundImage = `url("${s.lentShot}")`;
  if (t?.lent) {
    el('lenttitle').textContent = t.title || '';
    const h = hostOf(t.url).replace(/^www\./, '');
    const NAMES = { 'primevideo.com': 'PRIME VIDEO', 'netflix.com': 'NETFLIX', 'youtube.com': 'YOUTUBE', 'twitch.tv': 'TWITCH', 'crunchyroll.com': 'CRUNCHYROLL', 'disneyplus.com': 'DISNEY+', 'crave.ca': 'CRAVE', 'max.com': 'MAX' };
    el('lentsite').textContent = NAMES[Object.keys(NAMES).find((k) => h === k || h.endsWith('.' + k)) ?? ''] ?? h.toUpperCase();
  } else el('poppause').textContent = 'Pause';
  // A listed site: the red plate where the page would be, and the plaque turns red.
  const b = t?.blocked;
  el('phishplate').hidden = !b || Boolean(b?.bank);
  el('bankplate').hidden = !b?.bank;
  if (b?.bank) {
    let host = b.url;
    try { host = new URL(b.url).hostname.replace(/^www\./, ''); } catch { /* keep the text */ }
    el('banktext').replaceChildren(Object.assign(document.createElement('b'), { textContent: host }), ' is a bank site. Chrome gets safety fixes sooner, so your money is safer there.');
    el('phishlever').replaceChildren();
    delete lock.dataset.u; lock.hidden = false; lock.textContent = 'YOUR BANK'; lock.classList.remove('bad');
  } else if (b) {
    let host = b.url;
    try { host = new URL(b.url).hostname; } catch { /* keep the text */ }
    el('phishreal').hidden = !b.real;
    if (b.real) {
      // A look-alike: on no list yet, but wearing the name of a site he really uses.
      el('phishtitle').textContent = `This is not ${b.real}`;
      el('phishtext').replaceChildren(Object.assign(document.createElement('b'), { textContent: host }), ` is dressed up to look like ${b.real}, a site you use. It was stopped before anything loaded. The real one is one press away.`);
    } else {
      el('phishtitle').textContent = 'This site is on a list of fake or harmful sites';
      el('phishtext').replaceChildren(Object.assign(document.createElement('b'), { textContent: host }), ` is named by ${b.lists.length === 1 ? 'one list' : b.lists.length + ' lists'} of known fake login pages and harmful downloads. It was stopped before anything loaded.`);
    }
    el('phishlists').replaceChildren(...b.lists.map((n) => Object.assign(document.createElement('span'), { textContent: n })));
    if (!el('phishlever').childElementCount) redLever();
    delete lock.dataset.u; lock.hidden = false; lock.textContent = 'BLOCKED'; lock.classList.add('bad');
  } else el('phishlever').replaceChildren();
  // The page did not load: the wood plate, in plain words.
  const f = t?.failed;
  el('failplate').hidden = !f;
  if (f) {
    let host = f.url;
    try { host = new URL(f.url).hostname; } catch { /* keep the text */ }
    const insecure = f.kind === 'insecure';
    el('failplq').textContent = insecure ? 'NOT SECURE' : 'DID NOT LOAD';
    el('failplq').classList.toggle('gold', !insecure);
    el('failtitle').textContent = f.title;
    if (insecure) el('failtext').replaceChildren(Object.assign(document.createElement('b'), { textContent: host }), " has no secure version, so what you send it could be read along the way. Fine for reading. Don't type a password here.");
    else el('failtext').textContent = f.text;
    el('failgo').hidden = !insecure;
    el('failretry').hidden = insecure || !f.retry;
  }
  // A popup this page opened by itself was blocked: the shield glows blue, and its panel says what it was.
  const pop = t?.popup ?? null;
  lock.classList.toggle('popup', Boolean(pop) && !t?.blocked);
  if (pop && !t?.blocked) lock.title = 'A popup was blocked. Click to see it.';
  el('poprow').hidden = !pop;
  if (pop) el('popurl').textContent = pop;
  if (!el('sitepanel').hidden) { paintAdSwitch(); paintDarkSwitch(); }
  if (crashed) el('crashtitle').textContent = `${(t.title || 'This page').slice(0, 60)} stopped working`;
});


// ---- the trail menu (the ··· on a trail's name): wood, like the tab's menu, the glove on what you point at
function trailMenu(tr, x, y) {
  closeTabMenu();
  const m = document.createElement('div'); m.id = 'tabmenu'; m.className = 'tabmenu'; m.setAttribute('role', 'menu');
  const item = (label, go, cls = '') => {
    const b = Object.assign(document.createElement('button'), { type: 'button', className: cls, textContent: label });
    b.setAttribute('role', 'menuitem');
    b.addEventListener('click', () => { closeTabMenu(); go(); });
    m.append(b);
  };
  const sep = () => m.append(Object.assign(document.createElement('div'), { className: 'sep' }));
  const n = state.tabs.filter((t) => t.trail === tr.id).length;
  // Sheet 47: the MOCKUPS trail folds or closes; its history is kept either way.
  if (tr.mock) {
    item(tr.collapsed ? 'Open it up' : 'Collapse', () => window.aang?.browserTrail?.({ act: 'trail', id: tr.id, what: 'collapse' }));
    sep();
    item(`Close the mockups (${n} tab${n === 1 ? '' : 's'})`, () => window.aang?.browserTrail?.({ act: 'trail', id: tr.id, what: 'close' }), 'danger');
    placeMenu(m, x, y);
    return;
  }
  item('Rename', () => heads.get(tr.id)?.querySelector('.nm')?.click());
  item(tr.collapsed ? 'Open it up' : 'Collapse', () => window.aang?.browserTrail?.({ act: 'trail', id: tr.id, what: 'collapse' }));
  item('Move to the Stash', () => window.aang?.browserTrail?.({ act: 'trail', id: tr.id, what: 'stash' }));
  item('Ungroup (keep the tabs)', () => window.aang?.browserTrail?.({ act: 'trail', id: tr.id, what: 'ungroup' }));
  sep();
  item(`Close the trail and its ${n} tab${n === 1 ? '' : 's'}`, () => window.aang?.browserTrail?.({ act: 'trail', id: tr.id, what: 'close' }), 'danger');
  document.body.append(m);
  const r = m.getBoundingClientRect();
  m.style.left = Math.max(4, Math.min(x, innerWidth - r.width - 4)) + 'px';
  m.style.top = Math.max(4, Math.min(y, innerHeight - r.height - 4)) + 'px';
  setTimeout(() => document.addEventListener('pointerdown', (e) => { if (!m.contains(e.target)) closeTabMenu(); }, { once: true }), 0);
}

// ---- Sheet 47 (his picks, 2026-10-21): the MOCKUPS trail. Claude's icon and FROM CLAUDE on its head; each mockup wears
// its version; the family tree (branch > mockup > children, all his to move); HISTORY at the bottom with every version,
// closed ones too, and the broom that clears exact duplicates only when he presses it.
function placeMenu(m, x, y) {
  document.body.append(m);
  const r = m.getBoundingClientRect();
  m.style.left = Math.max(4, Math.min(x, innerWidth - r.width - 4)) + 'px';
  m.style.top = Math.max(4, Math.min(y, innerHeight - r.height - 4)) + 'px';
  setTimeout(() => document.addEventListener('pointerdown', (e) => { if (!m.contains(e.target)) closeTabMenu(); }, { once: true }), 0);
}
/** "12:41" today, "Yesterday 9:02", else "Oct 19 9:02". */
function mockWhen(at) {
  const d = new Date(at), now = new Date();
  const hm = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }).replace(/\s?[AP]M$/i, '');
  const day = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const back = Math.round((day(now) - day(d)) / 86_400_000);
  if (back === 0) return hm;
  if (back === 1) return 'Yesterday ' + hm;
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' }) + ' ' + hm;
}
const versionLabel = (v) => `V${v.v} · ${mockWhen(v.at)}`;
/**
 * A menu item that opens its own list underneath it (the floating list is narrow, so the list opens in place instead of
 * out to the side). Returns a function that adds one line to it.
 */
function expander(m, label) {
  const b = document.createElement('button'); b.type = 'button'; b.setAttribute('role', 'menuitem'); b.className = 'exp';
  b.append(label, Object.assign(document.createElement('i'), { textContent: '▸' }));
  const box = Object.assign(document.createElement('div'), { className: 'expbox', hidden: true });
  b.addEventListener('click', () => { box.hidden = !box.hidden; b.classList.toggle('open', !box.hidden); });
  m.append(b, box);
  return (text, go, tag = '') => {
    const x = document.createElement('button'); x.type = 'button'; x.setAttribute('role', 'menuitem'); x.className = 'sub';
    x.append(text);
    if (tag) x.append(Object.assign(document.createElement('i'), { textContent: tag }));
    x.addEventListener('click', () => { closeTabMenu(); go(); });
    box.append(x);
  };
}
/** The V tag's own list: the sheet's versions; picking one shows it in this tab. */
function versionsMenu(t, x, y) {
  closeTabMenu();
  const m = document.createElement('div'); m.id = 'tabmenu'; m.className = 'tabmenu'; m.setAttribute('role', 'menu');
  for (const v of t.mock?.versions ?? []) {
    const b = document.createElement('button'); b.type = 'button'; b.setAttribute('role', 'menuitem');
    b.append(versionLabel(v));
    if (v.now) b.append(Object.assign(document.createElement('i'), { textContent: 'NOW' }));
    b.addEventListener('click', () => { closeTabMenu(); window.aang?.browserMockup?.({ act: 'show', id: v.id }); });
    m.append(b);
  }
  placeMenu(m, x, y);
}
/** A history line's own menu: open that version, or send exactly that version to Aang. */
function versionMenu(id, x, y) {
  closeTabMenu();
  const m = document.createElement('div'); m.id = 'tabmenu'; m.className = 'tabmenu'; m.setAttribute('role', 'menu');
  const item = (label, go) => {
    const b = Object.assign(document.createElement('button'), { type: 'button', textContent: label });
    b.setAttribute('role', 'menuitem');
    b.addEventListener('click', () => { closeTabMenu(); go(); });
    m.append(b);
  };
  item('Open this version', () => window.aang?.browserMockup?.({ act: 'show', id }));
  if (state.mockups?.toAang) { item('Send to Aang', () => window.aang?.browserMockup?.({ act: 'send', id })); aangFaceOn(m); }
  placeMenu(m, x, y);
}
const mockEls = { head: null, from: null, hist: null, tidy: null, list: null, listSig: '', branches: new Map() };
const freshDone = new Set();
/** Type a new name in place (the trail name's own box): Enter keeps it, Esc leaves it. */
function renameIn(nm, value, max, save) {
  const box = Object.assign(document.createElement('input'), { value, maxLength: max, spellcheck: false });
  box.setAttribute('aria-label', 'Name');
  const done = (keep) => { if (keep && box.value.trim() && box.value.trim() !== value) save(box.value); box.replaceWith(nm); };
  box.addEventListener('keydown', (k) => { k.stopPropagation(); if (k.key === 'Enter') done(true); if (k.key === 'Escape') done(false); });
  box.addEventListener('blur', () => done(true));
  nm.replaceWith(box); box.focus(); box.select();
}
/** A branch's sub-heading: a fold chevron, its name (click to rename), how many, and its menu. */
function branchHead(b, n) {
  let h = mockEls.branches.get(b.id);
  if (!h) { h = document.createElement('div'); mockEls.branches.set(b.id, h); }
  if (h.querySelector('input')) return h;
  h.className = 'bh' + (b.folded ? ' folded' : '');
  h.dataset.branch = String(b.id);
  const chev = Object.assign(document.createElement('button'), { type: 'button', className: 'chev', title: b.folded ? 'Unfold' : 'Fold' });
  chev.setAttribute('aria-label', b.folded ? 'Unfold this branch' : 'Fold this branch');
  chev.addEventListener('click', (e) => { e.stopPropagation(); window.aang?.browserMockup?.({ act: 'bfold', id: b.id }); });
  const nm = Object.assign(document.createElement('span'), { className: 'nm', textContent: b.name, title: 'Click to rename' });
  nm.addEventListener('click', (e) => { e.stopPropagation(); renameIn(nm, b.name, 40, (name) => window.aang?.browserMockup?.({ act: 'brename', id: b.id, name })); });
  const more = Object.assign(document.createElement('button'), { type: 'button', className: 'thm', textContent: '···', title: 'Branch options' });
  more.addEventListener('click', (e) => { e.stopPropagation(); branchMenu(b, e.clientX, e.clientY); });
  h.replaceChildren(chev, nm, Object.assign(document.createElement('span'), { className: 'n', textContent: `${n} TAB${n === 1 ? '' : 'S'}` }), more);
  if (state.mockups?.fresh === b.id && !freshDone.has(b.id)) { freshDone.add(b.id); setTimeout(() => { if (nm.isConnected) nm.click(); }, 0); }
  return h;
}
function branchMenu(b, x, y) {
  closeTabMenu();
  const m = document.createElement('div'); m.id = 'tabmenu'; m.className = 'tabmenu'; m.setAttribute('role', 'menu');
  const item = (label, go, cls = '') => {
    const btn = Object.assign(document.createElement('button'), { type: 'button', className: cls, textContent: label });
    btn.setAttribute('role', 'menuitem');
    btn.addEventListener('click', () => { closeTabMenu(); go(); });
    m.append(btn);
  };
  item('Rename', () => mockEls.branches.get(b.id)?.querySelector('.nm')?.click());
  item(b.folded ? 'Unfold' : 'Fold', () => window.aang?.browserMockup?.({ act: 'bfold', id: b.id }));
  if (state.mockups?.toAang) { item('Send to Aang', () => window.aang?.browserMockup?.({ act: 'sendbranch', id: b.id })); aangFaceOn(m); }
  m.append(Object.assign(document.createElement('div'), { className: 'sep' }));
  item('Delete branch (its mockups stay)', () => window.aang?.browserMockup?.({ act: 'bdelete', id: b.id }), 'danger');
  placeMenu(m, x, y);
}
/** The MOCKUPS trail: its head, its tabs as a tree, then HISTORY. */
function mockNodes(g, rowFor) {
  const tr = g.trail, mk = state.mockups || {}, out = [];
  const h = mockEls.head ?? (mockEls.head = document.createElement('div'));
  h.className = 'th mock' + (tr.collapsed ? ' shut' : '');
  h.dataset.trail = String(tr.id);
  const ic = Object.assign(document.createElement('span'), { className: 'who-ic' });
  ic.append(Object.assign(document.createElement('img'), { src: 'art/claude-icon.png', alt: '' }));
  const more = Object.assign(document.createElement('button'), { type: 'button', className: 'thm', textContent: '···', title: 'Mockups options' });
  more.addEventListener('click', (e) => { e.stopPropagation(); trailMenu(tr, e.clientX, e.clientY); });
  const n = g.tabs.length;
  // No TIDY key of its own here (2026-10-22, his catch): the one broom at the foot of the drawer tidies the mockups too.
  h.replaceChildren(ic, Object.assign(document.createElement('span'), { className: 'nm', textContent: 'MOCKUPS' }), Object.assign(document.createElement('span'), { className: 'n', textContent: `${n} TAB${n === 1 ? '' : 'S'}` }), more);
  out.push(h);
  out.push(mockEls.from ?? (mockEls.from = Object.assign(document.createElement('div'), { className: 'mfrom', textContent: 'FROM CLAUDE' })));
  if (tr.collapsed) return out;
  const tabs = g.tabs, open = new Set(tabs.map((t) => t.mock?.sheet));
  // Its place in the tree rides on the row for dragging (2026-10-21): the parent sheet, the branch, and how many children.
  const row = (t, kid) => {
    const r = rowFor(t, kid); r.dataset.mock = t.mock?.sheet ?? '';
    r.dataset.psheet = kid ? t.mock?.parent ?? '' : '';
    r.dataset.mbranch = t.mock?.branch == null ? '' : String(t.mock.branch);
    r.dataset.kids = String(Number(t.mock?.kids) || 0);
    return r;
  };
  const isTop = (t) => !t.mock?.parent || !open.has(t.mock.parent);
  const group = (branch) => {
    const r = [];
    for (const t of tabs) if (isTop(t) && (t.mock?.branch ?? null) === branch) { r.push(row(t, false)); for (const k of tabs) if (k.mock?.parent && k.mock.parent === t.mock?.sheet) r.push(row(k, true)); }
    return r;
  };
  out.push(...group(null));
  for (const b of mk.branches ?? []) {
    const c = tabs.filter((t) => (t.mock?.branch ?? null) === b.id).length;
    if (!c) continue;
    out.push(branchHead(b, c));
    if (!b.folded) out.push(...group(b.id));
  }
  // HISTORY: the row, and its list when open.
  const hist = mockEls.hist ?? (mockEls.hist = Object.assign(document.createElement('button'), { type: 'button', className: 'mhist' }));
  if (!hist.dataset.wired) { hist.dataset.wired = '1'; hist.addEventListener('click', () => window.aang?.browserMockup?.({ act: 'list', open: !(state.mockups?.open) })); }
  const count = Number(mk.count) || 0;
  hist.classList.toggle('open', mk.open === true);
  const arch = Number(mk.archived) || 0;
  hist.replaceChildren(`HISTORY · ${count} VERSION${count === 1 ? '' : 'S'}` + (arch ? ` · ${arch} ARCHIVED` : ''), Object.assign(document.createElement('i'), { className: 'chev' }));
  out.push(hist);
  if (mk.open && mk.tree) out.push(mockList(mk));
  return out;
}
/**
 * The history list (2026-10-22, organised: his ask "organize the mockups in Samara too, it seems to be getting out of
 * control"). By project, then branch, ONE ROW PER SHEET (its number in a chip, its name, a PICKED mark when decided, how
 * many versions); a click unfolds its versions, newest first, the newest three out and the older ones in their own fold;
 * its lettered children under it. Then the ARCHIVE (folded): every sheet the tidy or he put away, why, and a Restore key.
 * Folding is the page's own (no round trip): a grid row that springs from 0fr to 1fr, so nothing jumps.
 * Rebuilt only when the Shell's data changed; a fold keeps its state across rebuilds.
 */
const mockFold = { sheets: new Set(), older: new Set(), archive: false };
/** A fold: its body springs open and shut (grid rows 0fr to 1fr). Returns [wrapper, inner box]. */
function foldBox(open) {
  const w = Object.assign(document.createElement('div'), { className: 'mfold' + (open ? ' open' : '') });
  const inner = Object.assign(document.createElement('div'), { className: 'mfi' });
  w.append(inner);
  return [w, inner];
}
function sheetMenu(node, x, y) {
  closeTabMenu();
  const m = document.createElement('div'); m.id = 'tabmenu'; m.className = 'tabmenu'; m.setAttribute('role', 'menu');
  const item = (label, go, cls = '') => {
    const b = Object.assign(document.createElement('button'), { type: 'button', className: cls, textContent: label });
    b.setAttribute('role', 'menuitem');
    b.addEventListener('click', () => { closeTabMenu(); go(); });
    m.append(b);
  };
  const top = node.items[0] ?? node.older[0];
  if (top) item('Open the newest version', () => window.aang?.browserMockup?.({ act: 'show', id: top.id }));
  if (node.archived) item('Restore', () => window.aang?.browserMockup?.({ act: 'restore', sheet: node.sheet }));
  else {
    item(node.picked ? 'Not picked' : 'Mark as picked', () => window.aang?.browserMockup?.({ act: 'pick', sheet: node.sheet, open: !node.picked }));
    m.append(Object.assign(document.createElement('div'), { className: 'sep' }));
    item('Archive (it stays in the Archive)', () => window.aang?.browserMockup?.({ act: 'archive', sheet: node.sheet }));
  }
  placeMenu(m, x, y);
}
function mockList(mk) {
  const sig = JSON.stringify([mk.tree, mk.dups, new Date().toDateString()]);
  if (mockEls.list && mockEls.listSig === sig) return mockEls.list;
  const box = document.createElement('div'); box.className = 'mlist';
  const lh = Object.assign(document.createElement('div'), { className: 'mlh' });
  lh.append(Object.assign(document.createElement('b'), { textContent: 'EVERY MOCKUP, BY SHEET' }));
  if (mk.dups > 0) {
    // His rule (2026-10-21): Samara's own tidy broom for exact duplicates. The daily tidy merges them too; this is the
    // same at once, only when he presses it.
    const br = Object.assign(document.createElement('button'), { type: 'button', className: 'mbroom', title: 'Remove the exact duplicates (struck through)' });
    br.append(Object.assign(document.createElement('img'), { src: 'art/browser/tidy_broom2.png', alt: '' }), `${mk.dups} DUPLICATE${mk.dups === 1 ? '' : 'S'}`);
    br.addEventListener('click', () => window.aang?.browserMockup?.({ act: 'broom' }));
    lh.append(br);
  }
  box.append(lh);
  const tree = mk.tree || {};
  const vline = (it, into, kid) => {
    const v = Object.assign(document.createElement('button'), { type: 'button', className: 'mv' + (kid ? ' kid' : '') + (it.now ? ' now' : '') + (it.same ? ' dup' : '') });
    v.dataset.id = String(it.id);
    v.append(Object.assign(document.createElement('span'), { className: 'vv', textContent: 'V' + it.v }), mockWhen(it.at));
    if (it.now) v.append(Object.assign(document.createElement('i'), { textContent: 'OPEN' }));
    else if (it.same) v.append(Object.assign(document.createElement('i'), { textContent: `SAME AS V${it.same}` }));
    if (it.seen) v.title = `Opened ${it.seen + 1} times with this same picture`;
    v.addEventListener('click', () => window.aang?.browserMockup?.({ act: 'show', id: it.id }));
    v.addEventListener('contextmenu', (e) => { e.preventDefault(); versionMenu(it.id, e.clientX, e.clientY); });
    into.append(v);
  };
  // One sheet's row, and its versions in a fold under it.
  const sheet = (node, into, kid, archived) => {
    const open = mockFold.sheets.has(node.sheet);
    const row = Object.assign(document.createElement('button'), { type: 'button', className: 'msr' + (kid ? ' kid' : '') + (open ? ' open' : '') + (node.closed ? ' closed' : '') + (archived ? ' arch' : '') });
    row.dataset.sheet = node.sheet;
    row.setAttribute('aria-expanded', String(open));
    row.append(Object.assign(document.createElement('i'), { className: 'chev' }));
    if (node.num) row.append(Object.assign(document.createElement('span'), { className: 'num', textContent: node.num }));
    row.append(Object.assign(document.createElement('span'), { className: 'nm', textContent: node.name, title: node.title }));
    if (node.picked) row.append(Object.assign(document.createElement('span'), { className: 'pk', textContent: '✓', title: node.hand ? 'You marked it picked' : 'Decided (the sheet says so)' }));
    if (archived) {
      const why = node.why === 'gone' ? 'gone from the repo' : node.why === 'stale' ? (node.by ? `replaced by ${node.by}` : 'replaced') : 'put away by you';
      row.append(Object.assign(document.createElement('span'), { className: 'why', textContent: why }));
      const rs = Object.assign(document.createElement('span'), { className: 'mrestore', textContent: 'RESTORE', role: 'button', title: 'Back into the list' });
      rs.addEventListener('click', (e) => { e.stopPropagation(); window.aang?.browserMockup?.({ act: 'restore', sheet: node.sheet }); });
      row.append(rs);
    } else row.append(Object.assign(document.createElement('span'), { className: 'cnt', textContent: `${node.n} V` }));
    const [fw, fi] = foldBox(open);
    row.addEventListener('click', () => {
      const now = !mockFold.sheets.has(node.sheet);
      if (now) mockFold.sheets.add(node.sheet); else mockFold.sheets.delete(node.sheet);
      row.classList.toggle('open', now); row.setAttribute('aria-expanded', String(now)); fw.classList.toggle('open', now);
    });
    row.addEventListener('contextmenu', (e) => { e.preventDefault(); sheetMenu(node, e.clientX, e.clientY); });
    into.append(row, fw);
    for (const it of node.items) vline(it, fi, kid);
    if (node.older?.length) {
      const k = node.sheet, oOpen = mockFold.older.has(k);
      const ob = Object.assign(document.createElement('button'), { type: 'button', className: 'mold' + (kid ? ' kid' : '') + (oOpen ? ' open' : '') });
      ob.append(Object.assign(document.createElement('i'), { className: 'chev' }), `${node.older.length} older version${node.older.length === 1 ? '' : 's'}`);
      const [ow, oi] = foldBox(oOpen);
      ob.addEventListener('click', () => {
        const now = !mockFold.older.has(k);
        if (now) mockFold.older.add(k); else mockFold.older.delete(k);
        ob.classList.toggle('open', now); ow.classList.toggle('open', now);
      });
      fi.append(ob, ow);
      for (const it of node.older) vline(it, oi, kid);
    }
    for (const c of node.children ?? []) sheet(c, into, true, archived);
  };
  const projects = tree.projects ?? [];
  const many = projects.length > 1;
  for (const p of projects) {
    // The project's name always shows (the repo they came from); a branch is a sub-heading inside it.
    box.append(Object.assign(document.createElement('div'), { className: 'mproj', textContent: p.name }));
    for (const node of p.loose ?? []) sheet(node, box, false, false);
    for (const b of p.branches ?? []) {
      box.append(Object.assign(document.createElement('div'), { className: 'mbranch', textContent: b.name }));
      for (const node of b.mockups) sheet(node, box, false, false);
    }
    if (many) box.append(Object.assign(document.createElement('div'), { className: 'mgap' }));
  }
  if (!projects.length) box.append(Object.assign(document.createElement('div'), { className: 'msheet', textContent: 'No mockups yet.' }));
  // The Archive: never deleted, one click back.
  const arch = tree.archive ?? [];
  if (arch.length) {
    const ab = Object.assign(document.createElement('button'), { type: 'button', className: 'march' + (mockFold.archive ? ' open' : '') });
    ab.append(Object.assign(document.createElement('i'), { className: 'chev' }), `ARCHIVE · ${arch.length} SHEET${arch.length === 1 ? '' : 'S'}`);
    const [aw, ai] = foldBox(mockFold.archive);
    ab.addEventListener('click', () => { mockFold.archive = !mockFold.archive; ab.classList.toggle('open', mockFold.archive); aw.classList.toggle('open', mockFold.archive); });
    box.append(ab, aw);
    for (const node of arch) sheet(node, ai, false, true);
  }
  mockEls.list = box; mockEls.listSig = sig;
  return box;
}
// ---- dragging, smoother (his ask, 2026-10-21: "make it easier to drag and drop into trails in general and make parent
// child relationships easier with just a mouse move"). The browser's own drag and drop gave no say over each frame, so
// this is pointer events:
//  - a press only becomes a drag after a few pixels, so a click still just picks the tab;
//  - between rows a gold line shows where it lands and how deep: slide right to tuck it under the row above, left to
//    pull it back out, one indent per step, as deep as the trail draws (a tab under a tab, a mockup under a mockup);
//  - on the middle of a row the row lights up: let go and it becomes that row's child; on a heading it joins that trail;
//  - the rows slide apart to open the gap (a transform, never a change of layout) and glide to their places after the drop;
//  - a folded trail or branch opens after hovering it for 600 ms; near the top or bottom edge the list scrolls;
//  - Ctrl-click and Shift-click pick several tabs; dragging one of them moves them all, in their order;
//  - Esc puts it all back. The tab menu's Move to items still make the same moves without a mouse.
// The rules of where things may go are the old ones: a mockup stays in MOCKUPS and nothing else goes in.
const DG_MOCK = -1, DG_INDENT = 28, DG_START = 5, DG_SPRING = 600, DG_EDGE = 44;
const dropMark = Object.assign(document.createElement('div'), { className: 'dropmark' });
const dgShift = new WeakMap();
const dgCalm = matchMedia('(prefers-reduced-motion: reduce)');
let dragging = null, dgPress = null, flipUntil = 0, dgSwallow = false;
const picked = new Set();
let pickFrom = null;
const dgTab = (id) => state.tabs.find((t) => t.id === id);

/** Each row's place on screen, by what it is (a rebuilt row is still the same tab), to glide from. */
function dgKey(n) {
  if (n.dataset.tab) return 't' + n.dataset.tab;
  if (n.matches('.th[data-trail]')) return 'h' + n.dataset.trail;
  if (n.dataset.branch) return 'b' + n.dataset.branch;
  return n.id || (n.classList.contains('mhist') ? 'mh' : n.classList.contains('mfrom') ? 'mf' : '');
}
function rowSpots() {
  const m = new Map();
  for (const n of tabsBox.children) { const k = dgKey(n); if (k) m.set(k, n.getBoundingClientRect().top); }
  return m;
}
/** FLIP: every row starts where it was and glides to where it is now. */
function glide(was) {
  if (!was || dgCalm.matches) return;
  const kids = [...tabsBox.children].filter((n) => n !== dropMark && !n.classList.contains('dragghost'));
  for (const n of kids) { n.style.transition = 'none'; n.style.transform = ''; }
  const moved = [];
  for (const n of kids) {
    const old = was.get(dgKey(n));
    if (old === undefined) continue;
    const d = old - n.getBoundingClientRect().top;
    if (Math.abs(d) < 1) continue;
    n.style.transform = `translateY(${d.toFixed(1)}px)`;
    moved.push(n);
  }
  void tabsBox.offsetHeight;
  for (const n of kids) n.style.transition = '';
  for (const n of moved) {
    n.style.transition = 'transform 180ms cubic-bezier(.2,.8,.2,1)'; n.style.transform = '';
    n.addEventListener('transitionend', () => { n.style.transition = ''; }, { once: true });
  }
}
/** After every redraw: the picked look, and a drag in progress keeps its gap, its ghost and its line. */
function afterPaint(was) {
  for (const id of [...picked]) if (!state.tabs.some((t) => t.id === id)) picked.delete(id);
  paintPicked();
  if (dragging) { dgLift(); tabsBox.append(dragging.ghost); dgAim(); return; }
  if (was) glide(was);
}

// ---- picking several (his pick 5): Ctrl adds or takes one, Shift takes the run from the last one picked.
function paintPicked() { for (const [id, r] of rows) r.el.classList.toggle('picked', picked.has(id)); }
function clearPicked() { if (!picked.size) return; picked.clear(); pickFrom = null; paintPicked(); }
function pickRows(id, range) {
  const order = [...tabsBox.querySelectorAll('.tp[data-tab]')].map((n) => Number(n.dataset.tab));
  // Like Chrome: the tab he is on is one of them.
  if (!picked.size && state.active != null && order.includes(state.active)) { picked.add(state.active); pickFrom ??= state.active; }
  if (range && pickFrom != null && order.includes(pickFrom)) {
    const a = order.indexOf(pickFrom), b = order.indexOf(id);
    for (const x of order.slice(Math.min(a, b), Math.max(a, b) + 1)) picked.add(x);
  } else {
    if (picked.has(id) && id !== state.active) picked.delete(id); else picked.add(id);
    pickFrom = id;
  }
  paintPicked();
}
function pickedInOrder() {
  const out = [...tabsBox.querySelectorAll('.tp[data-tab]')].map((n) => Number(n.dataset.tab)).filter((id) => picked.has(id));
  for (const t of state.tabs) if (picked.has(t.id) && !out.includes(t.id)) out.push(t.id);
  return out;
}

// ---- the press, and the few pixels that make it a drag
tabsBox.addEventListener('dragstart', (e) => e.preventDefault());   // no picture-drag of an icon
tabsBox.addEventListener('pointerdown', (e) => {
  if (e.button !== 0 || dragging) return;
  if (e.target.closest('button, input, select, textarea')) return;
  const row = e.target.closest('.tp[data-tab]'), head = row ? null : e.target.closest('.th[data-trail]');
  if (!row && !head) return;
  const mod = e.ctrlKey || e.metaKey || e.shiftKey;
  if (row && mod) { e.stopPropagation(); pickRows(Number(row.dataset.tab), e.shiftKey); }   // picking, not switching
  else if (row && !picked.has(Number(row.dataset.tab))) clearPicked();
  dgPress = { x: e.clientX, y: e.clientY, kind: row ? 'tab' : 'trail', id: Number(row ? row.dataset.tab : head.dataset.trail), el: row || head, pointerId: e.pointerId, mod };
}, true);
window.addEventListener('pointermove', (e) => {
  if (dragging) { if (e.pointerId === dragging.pointerId) { dragging.cx = e.clientX; dragging.cy = e.clientY; dgAim(); } return; }
  if (!dgPress || e.pointerId !== dgPress.pointerId) return;
  if (!(e.buttons & 1)) { dgPress = null; return; }
  if (Math.hypot(e.clientX - dgPress.x, e.clientY - dgPress.y) < DG_START) return;
  dgStart(e);
});
window.addEventListener('pointerup', (e) => {
  if (dgPress && e.pointerId === dgPress.pointerId) {
    // A plain click on one of the picked tabs: just that tab now, as everywhere else.
    if (!dgPress.mod && dgPress.kind === 'tab') clearPicked();
    dgPress = null;
    return;
  }
  if (!dragging || e.pointerId !== dragging.pointerId) return;
  dragging.cx = e.clientX; dragging.cy = e.clientY;
  dgFinish(true);
});
window.addEventListener('pointercancel', () => { dgPress = null; if (dragging) dgFinish(false); });
window.addEventListener('blur', () => { if (dragging) dgFinish(false); });
// Esc puts it back. Taken first, so nothing else closes on the same press.
window.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  if (dragging) { e.preventDefault(); e.stopImmediatePropagation(); dgFinish(false); return; }
  dgPress = null;
  clearPicked();
}, true);
// A drag is never also a click (a heading's name would open for renaming).
window.addEventListener('click', (e) => { if (dgSwallow) { dgSwallow = false; e.preventDefault(); e.stopImmediatePropagation(); } }, true);
document.addEventListener('scroll', () => { if (dragging) dgAim(); }, true);

function dgStart(e) {
  const p = dgPress; dgPress = null;
  // A loading tab's row is redrawn as its page comes in, so the row he pressed may be a new one by now.
  if (!p.el.isConnected) p.el = p.kind === 'tab' ? rows.get(p.id)?.el : tabsBox.querySelector(`:scope > .th[data-trail="${p.id}"]`);
  if (!p.el?.isConnected) return;
  const r = p.el.getBoundingClientRect();
  const d = { kind: p.kind, grab: p.id, pointerId: p.pointerId, x0: p.x, cx: e.clientX, cy: e.clientY, dx: p.x - r.left, dy: p.y - r.top,
    gap: Math.min(Math.round(r.height) + 9, 58), depth0: Number(p.el.dataset.depth) || 0, ids: [], lift: [], mock: false, canKid: true, target: null, springEl: null, springT: 0, raf: 0 };
  if (p.kind === 'tab') {
    d.mock = Boolean(dgTab(p.id)?.mock);
    const ids = (picked.has(p.id) && picked.size > 1 ? pickedInOrder() : [p.id]).filter((id) => dgTab(id) && Boolean(dgTab(id).mock) === d.mock);
    if (!d.mock) {
      // A tab carries the tabs under it, right behind it.
      for (const id of ids) {
        if (d.ids.includes(id)) continue;
        d.ids.push(id);
        const t = dgTab(id);
        if (t.trail != null) for (const k of state.tabs) if (k.opener === id && k.trail === t.trail && !k.done && !d.ids.includes(k.id) && !ids.includes(k.id)) d.ids.push(k.id);
      }
      d.lift = [...d.ids];
    } else {
      // A mockup's children follow it in the mockups' own tree; they are only lifted with it here.
      d.ids = ids; d.lift = [...ids];
      const sheets = new Set(ids.map((id) => dgTab(id).mock.sheet));
      for (const k of state.tabs) if (k.mock?.parent && sheets.has(k.mock.parent) && !d.lift.includes(k.id)) d.lift.push(k.id);
      d.canKid = ids.every((id) => !(Number(dgTab(id).mock.kids) > 0));
    }
  } else {
    d.ids = [p.id];
    d.lift = state.tabs.filter((t) => t.trail === p.id).map((t) => t.id);
  }
  // The ghost: the row itself, lifted off the wood, with how many go when it is several.
  const g = p.el.cloneNode(true);
  for (const k of Object.keys(g.dataset)) delete g.dataset[k];
  g.classList.remove('lifted', 'onto', 'picked', 'spring');
  g.classList.add('dragghost');
  g.removeAttribute('tabindex');
  g.style.width = r.width + 'px';
  if (p.kind === 'tab' && d.ids.length > 1) g.append(Object.assign(document.createElement('b'), { className: 'dgcount', textContent: String(d.ids.length) }));
  d.ghost = g;
  dragging = d;
  closeTabMenu();
  try { tabsBox.setPointerCapture(p.pointerId); } catch { /* a pointer the page did not see go down: the window still sends its moves */ }
  tabsBox.style.setProperty('--dggap', d.gap + 'px');
  tabsBox.classList.add('dragging');
  document.documentElement.classList.add('rowdrag');
  tabsBox.append(g);
  dgLift();
  dgAim();
  const roll = () => { if (dragging !== d) return; dgEdgeScroll(d); d.raf = requestAnimationFrame(roll); };
  d.raf = requestAnimationFrame(roll);
}
function dgLift() {
  const d = dragging;
  if (d.kind === 'trail') { for (const n of tabsBox.children) if (n.dataset.trail === String(d.grab)) n.classList.add('lifted'); return; }
  for (const id of d.lift) rows.get(id)?.el.classList.add('lifted');
}
/** Near the top or bottom edge of the list, it scrolls: faster the closer he is to the edge. */
function dgEdgeScroll(d) {
  const sc = tabsBox.closest('.drawer');
  if (!sc || sc.scrollHeight <= sc.clientHeight) return;
  const r = sc.getBoundingClientRect();
  let v = 0;
  if (d.cy < r.top + DG_EDGE) v = -Math.min(1, (r.top + DG_EDGE - d.cy) / DG_EDGE);
  else if (d.cy > r.bottom - DG_EDGE) v = Math.min(1, (d.cy - (r.bottom - DG_EDGE)) / DG_EDGE);
  if (!v) return;
  const was = sc.scrollTop;
  sc.scrollTop += v * 14;
  if (sc.scrollTop !== was) dgAim();
}
/** The rows and headings as they stand now (with the gap's slide), the moving ones left out: the places to land. */
function dgSlots() {
  const out = [];
  for (const n of tabsBox.children) {
    if (n.classList.contains('lifted') || n.classList.contains('dragghost') || n === dropMark) continue;
    const top = n.offsetTop + (dgShift.get(n) || 0), h = n.offsetHeight;
    if (n.matches('.tp[data-tab]')) out.push({ n, top, h, type: 'tab', id: Number(n.dataset.tab), trail: n.dataset.trail === '' ? null : Number(n.dataset.trail),
      depth: Number(n.dataset.depth) || 0, sheet: n.dataset.mock || '', branch: n.dataset.mbranch ? Number(n.dataset.mbranch) : null });
    else if (n.matches('.th[data-trail]')) out.push({ n, top, h, type: 'head', trail: Number(n.dataset.trail), shut: n.classList.contains('shut') });
    else if (n.matches('.bh[data-branch]')) out.push({ n, top, h, type: 'branch', trail: DG_MOCK, branch: Number(n.dataset.branch), shut: n.classList.contains('folded') });
    else if (n.matches('.mhist')) out.push({ n, top, h, type: 'end' });
    else if (n.matches('#doneshelf, .th.driver')) { out.push({ n, top, h, type: 'stop' }); break; }
  }
  return out;
}
/** Where a tab let go here lands: onto a row or heading, or into a gap at a depth. Null: nowhere. */
function dgAimTab(y) {
  const d = dragging, S = dgSlots();
  const want = d.depth0 + Math.round((d.cx - d.x0) / DG_INDENT);
  for (const s of S) {
    if (y < s.top || y >= s.top + s.h) continue;
    if (s.type === 'head' || s.type === 'branch') {
      // On a heading: into that trail (at its end) or that branch; the MOCKUPS heading makes a mockup top level.
      const mockHead = s.trail === DG_MOCK;
      if (mockHead !== d.mock) return null;
      if (!d.mock) return { kind: 'onto', el: s.n, spring: s.shut ? s : null, act: { act: 'place', tabs: d.ids, trail: s.trail, before: null, parent: null } };
      return { kind: 'onto', el: s.n, spring: s.shut ? s : null, mock: true, parentSheet: null, branch: s.type === 'branch' ? s.branch : null, reorder: false };
    }
    if (s.type === 'tab' && s.depth === 0 && y > s.top + s.h * 0.28 && y < s.top + s.h * 0.72) {
      // The middle of a top row: it becomes that row's child.
      if (d.mock && s.trail === DG_MOCK && s.sheet && d.canKid) return { kind: 'onto', el: s.n, mock: true, parentSheet: s.sheet, branch: s.branch, reorder: false };
      if (!d.mock && s.trail !== null && s.trail !== DG_MOCK) {
        let before = null;
        for (let k = S.indexOf(s) + 1; k < S.length; k++) { const z = S[k]; if (z.type === 'tab' && z.trail === s.trail && z.depth === 1) continue; if (z.type === 'tab' && z.trail === s.trail) before = z.id; break; }
        return { kind: 'onto', el: s.n, act: { act: 'place', tabs: d.ids, trail: s.trail, before, parent: s.id } };
      }
    }
    break;
  }
  // Between rows: the gap before the first row whose middle is below the pointer.
  let g = S.findIndex((s) => y < s.top + s.h / 2);
  if (g < 0) g = S.length;
  if (S[g - 1]?.type === 'stop') g--;
  const prev = S[g - 1], next = S[g];
  const ctx = !prev ? { trail: null, branch: null } : prev.type === 'tab' ? { trail: prev.trail, branch: prev.branch }
    : prev.type === 'head' ? { trail: prev.trail, branch: null } : prev.type === 'branch' ? { trail: DG_MOCK, branch: prev.branch } : null;
  if (!ctx || (ctx.trail === DG_MOCK) !== d.mock) return null;
  const same = (s) => s && s.type === 'tab' && s.trail === ctx.trail;
  let lo = 0, hi = 0;
  if (ctx.trail !== null) { hi = same(prev) && (!d.mock || d.canKid) ? 1 : 0; lo = same(next) && next.depth === 1 ? 1 : 0; }
  if (lo > hi) return null;
  const depth = Math.max(lo, Math.min(hi, want));
  let parent = null;
  if (depth) for (let k = g - 1; k >= 0 && same(S[k]); k--) if (S[k].depth === 0) { parent = S[k]; break; }
  if (depth && !parent) return null;
  const before = same(next) ? next.id : null;
  const top = prev ? prev.n.offsetTop + prev.h : 0;
  const lineY = next ? (top + next.n.offsetTop + d.gap) / 2 : top + 5;
  const t = { kind: 'gap', from: next?.n ?? null, lineY, depth };
  if (d.mock) return { ...t, mock: true, parentSheet: depth ? parent.sheet : null, branch: ctx.branch, before, reorder: true };
  return { ...t, act: { act: 'place', tabs: d.ids, trail: ctx.trail, before, parent: depth ? parent.id : null } };
}
/** Where a trail let go here lands: before the heading below the pointer, or last. */
function dgAimTrail(y) {
  const d = dragging, kids = [...tabsBox.children].filter((n) => n !== dropMark && !n.classList.contains('dragghost'));
  const heads = kids.filter((n) => n.matches('.th[data-trail]') && !n.classList.contains('lifted'));
  const at = heads.find((n) => y < n.offsetTop + (dgShift.get(n) || 0) + n.offsetHeight / 2) ?? null;
  const from = at ?? kids.find((n) => n.matches('#doneshelf, .th.driver')) ?? null;
  const i = from ? kids.indexOf(from) : kids.length;
  const prev = kids[i - 1];
  const top = prev ? prev.offsetTop + prev.offsetHeight : 0;
  return { kind: 'gap', from, lineY: from ? (top + from.offsetTop + d.gap) / 2 : top + 5, depth: 0, before: at ? Number(at.dataset.trail) : null };
}
function dgAim() {
  const d = dragging;
  if (!d) return;
  const box = tabsBox.getBoundingClientRect();
  const x = d.cx - box.left, y = d.cy - box.top;
  d.ghost.style.transform = `translate(${Math.round(x - d.dx)}px,${Math.round(y - d.dy)}px) rotate(-1.2deg)`;
  const inside = d.cx >= 0 && d.cy >= 0 && d.cx <= innerWidth && d.cy <= innerHeight;
  const t = inside ? (d.kind === 'trail' ? dgAimTrail(y) : dgAimTab(y)) : null;
  d.target = t;
  for (const n of tabsBox.querySelectorAll('.onto')) if (n !== t?.el) n.classList.remove('onto');
  dgSpring(t?.spring ?? null);
  if (!t) { dropMark.remove(); dgGap(null); return; }
  if (t.kind === 'onto') { t.el.classList.add('onto'); dropMark.remove(); return; }   // the gap stays where it was: no jumping under him
  dgGap(t.from);
  const left = t.depth * DG_INDENT + 4;
  dropMark.style.transform = `translate(${left}px,${Math.round(t.lineY - 2)}px)`;
  dropMark.style.width = Math.max(40, tabsBox.clientWidth - left - 4) + 'px';
  dropMark.classList.toggle('d1', t.depth > 0);
  if (!dropMark.isConnected) tabsBox.append(dropMark);
}
/** The rows from this one down slide apart by one row's height; the rest slide back. */
function dgGap(from) {
  let on = false;
  for (const n of tabsBox.children) {
    if (n === dropMark || n.classList.contains('dragghost')) continue;
    if (n === from) on = true;
    const want = on && from ? dragging.gap : 0;
    if ((dgShift.get(n) || 0) === want) continue;
    if (want) dgShift.set(n, want); else dgShift.delete(n);
    n.style.transform = want ? `translateY(${want}px)` : '';
  }
}
/** Hovering a folded trail or branch: after 600 ms it opens (a gold line fills under it while he waits). */
function dgSpring(s) {
  const d = dragging;
  if (d.springEl === (s?.n ?? null)) return;
  clearTimeout(d.springT);
  d.springEl?.classList.remove('spring');
  d.springEl = s?.n ?? null;
  if (!s) return;
  s.n.classList.add('spring');
  d.springT = setTimeout(() => {
    if (dragging !== d || d.springEl !== s.n) return;
    s.n.classList.remove('spring');
    if (s.type === 'branch') window.aang?.browserMockup?.({ act: 'bfold', id: s.branch });
    else window.aang?.browserTrail?.({ act: 'trail', id: s.trail, what: 'collapse' });
  }, DG_SPRING);
}
function dgFinish(drop) {
  const d = dragging;
  if (!d) return;
  cancelAnimationFrame(d.raf); clearTimeout(d.springT);
  if (drop) dgAim();
  const t = drop ? d.target : null;
  const outside = drop && (d.cx < 0 || d.cy < 0 || d.cx > innerWidth || d.cy > innerHeight);
  const was = rowSpots();
  dragging = null;
  try { tabsBox.releasePointerCapture(d.pointerId); } catch { /* already gone */ }
  d.ghost.remove(); dropMark.remove();
  for (const n of tabsBox.querySelectorAll('.onto, .lifted, .spring')) n.classList.remove('onto', 'lifted', 'spring');
  tabsBox.classList.remove('dragging');
  document.documentElement.classList.remove('rowdrag');
  for (const n of tabsBox.children) { dgShift.delete(n); n.style.transform = ''; }
  dgSwallow = true; setTimeout(() => { dgSwallow = false; }, 0);
  // Let go outside the window (2026-10-13, his ask): it becomes its own window, like Chrome, or joins the one under it.
  if (outside && d.kind === 'tab') { window.aang?.browserTearOut?.(d.grab); return; }
  if (t) { dgSend(d, t); clearPicked(); }
  flipUntil = performance.now() + 900;
  glide(was);
}
function dgSend(d, t) {
  if (d.kind === 'trail') { window.aang?.browserTrail?.({ act: 'movetrail', id: d.grab, before: t.before }); return; }
  if (!t.mock) { window.aang?.browserTrail?.(t.act); return; }
  // A mockup's place in the tree is the mockups' own (kept in mockups.json with its history); its order is the tab list's.
  const sheets = new Set(d.ids.map((id) => dgTab(id)?.mock?.sheet));
  for (const id of d.ids) {
    const m = dgTab(id)?.mock;
    if (!m || (m.parent && sheets.has(m.parent))) continue;   // it follows its parent
    if (t.parentSheet) { if (m.parent !== t.parentSheet) window.aang?.browserMockup?.({ act: 'parent', sheet: m.sheet, to: t.parentSheet }); }
    else if (t.branch == null) { if (m.parent || m.branch != null) window.aang?.browserMockup?.({ act: 'top', sheet: m.sheet }); }
    else if (m.parent || m.branch !== t.branch) window.aang?.browserMockup?.({ act: 'branch', sheet: m.sheet, to: t.branch });
  }
  if (t.reorder) window.aang?.browserTrail?.({ act: 'place', tabs: d.ids, trail: DG_MOCK, before: t.before, parent: null });
}

// ---- downloads (his design, 2026-10-12): the key pops in only while the tray has something; a finished
// download drops the tray open for a few seconds (it stays while the mouse is on it); a file drags out anywhere.
const dlkey = el('dlkey'), dltray = el('dltray'), dlrows = el('dlrows');
let dls = [], dlOpen = false, dlAuto = null, dlHover = false;
const SVG_FOLDER = '<svg viewBox="0 0 8 7" width="16" height="14" shape-rendering="crispEdges" aria-hidden="true"><path d="M0 0h3v1h5v6H0z"/></svg>';
const SVG_X = '<svg viewBox="0 0 7 7" width="12" height="12" shape-rendering="crispEdges" aria-hidden="true"><path d="M0 0h2v1H0zM5 0h2v1H5zM0 1h3v1H0zM4 1h3v1H4zM1 2h5v1H1zM2 3h3v1H2zM1 4h5v1H1zM0 5h3v1H0zM4 5h3v1H4zM0 6h2v1H0zM5 6h2v1H5z"/></svg>';
const EXT = { zip: 'ZIP', pdf: 'PDF', img: 'IMG', exe: 'EXE', doc: 'DOC', av: 'A/V', file: 'FILE' };
function mb(n) { return n >= 1e9 ? (n / 1e9).toFixed(1) + ' GB' : n >= 1e6 ? (n / 1e6).toFixed(1) + ' MB' : n >= 1e3 ? Math.round(n / 1e3) + ' KB' : (n || 0) + ' B'; }
function ago(t) {
  const s = Math.max(0, (Date.now() - t) / 1000);
  if (s < 50) return 'just now';
  if (s < 3600) return Math.round(s / 60) + ' min ago';
  return Math.round(s / 3600) + ' h ago';
}
function badge(kind) {
  const b = Object.assign(document.createElement('i'), { className: 'fb ' + (EXT[kind] ? kind : 'file') });
  b.append(Object.assign(document.createElement('b'), { textContent: EXT[kind] ?? 'FILE' }));
  return b;
}
function paintDls() {
  dlrows.replaceChildren();
  for (const d of dls) {
    const row = Object.assign(document.createElement('div'), { className: 'drow' + (d.state === 'going' ? ' going' : '') + (d.gone || d.state === 'stopped' || d.state === 'failed' ? ' gone' : '') });
    const t = Object.assign(document.createElement('span'), { className: 'dt' });
    t.append(Object.assign(document.createElement('b'), { textContent: d.name }));
    if (d.state === 'going') {
      const pct = d.total > 0 ? Math.min(100, Math.round((d.got / d.total) * 100)) : 0;
      const bar = Object.assign(document.createElement('span'), { className: 'bar' });
      bar.append(Object.assign(document.createElement('i'), { style: `width:${d.total > 0 ? pct : 30}%` }));
      const left = d.left == null ? '' : d.left < 60 ? ` · ${d.left} s left` : ` · ${Math.ceil(d.left / 60)} min left`;
      t.append(bar, Object.assign(document.createElement('small'), { textContent: d.total > 0 ? `${pct}% · ${mb(d.got)} of ${mb(d.total)}${left}` : `${mb(d.got)} so far` }));
      const x = Object.assign(document.createElement('button'), { type: 'button', className: 'dx', title: 'Stop', innerHTML: SVG_X });
      x.addEventListener('click', (e) => { e.stopPropagation(); window.aang?.browserDl?.({ act: 'stop', id: d.id }); });
      row.append(badge(d.kind), t, x);
    } else {
      const why = d.gone ? 'Moved or deleted' : d.state === 'stopped' ? 'Stopped' : d.state === 'failed' ? 'Did not finish' : `${mb(d.size)}${d.site ? ' · ' + d.site : ''} · ${ago(d.at)}`;
      t.append(Object.assign(document.createElement('small'), { textContent: why }));
      row.append(badge(d.kind), t);
      if (!row.classList.contains('gone')) {
        const f = Object.assign(document.createElement('button'), { type: 'button', className: 'dx', title: 'Show in folder', innerHTML: SVG_FOLDER });
        f.addEventListener('click', (e) => { e.stopPropagation(); closeDl(); window.aang?.browserDl?.({ act: 'show', id: d.id }); });
        row.append(f);
        row.title = 'Click to open. Drag it into Claude, Aang, a folder or the desktop.';
        row.draggable = true;
        row.addEventListener('dragstart', (e) => { e.preventDefault(); window.aang?.browserDlDrag?.(d.id); });
        row.addEventListener('click', () => { closeDl(); window.aang?.browserDl?.({ act: 'open', id: d.id }); });
      }
    }
    dlrows.append(row);
  }
  // The key's ring fills while a download is coming in.
  const going = dls.filter((d) => d.state === 'going' && d.total > 0);
  const ring = el('dlring');
  ring.hidden = !going.length;
  if (going.length) ring.style.setProperty('--p', Math.round(going.reduce((a, d) => a + d.got, 0) / going.reduce((a, d) => a + d.total, 0) * 100) + '%');
}
function openDl(auto = false) {
  if (!dls.length) return;
  if (!dlOpen) {
    if (!auto) { closeMenu(); closeDrawer(); }
    dlOpen = true;
    dlkey.setAttribute('aria-expanded', 'true');
    dltray.hidden = false;
    freeze('dl');
  }
  clearTimeout(dlAuto); dlAuto = null;
  if (auto) dlAuto = setTimeout(function fold() { if (dlHover) { dlAuto = setTimeout(fold, 1500); return; } closeDl(); }, 5000);
}
function closeDl() {
  clearTimeout(dlAuto); dlAuto = null;
  if (!dlOpen) return;
  dlOpen = false;
  dlkey.setAttribute('aria-expanded', 'false');
  dltray.hidden = true;
  unfreeze('dl');
}
dltray.addEventListener('mouseenter', () => { dlHover = true; });
dltray.addEventListener('mouseleave', () => { dlHover = false; });
dltray.addEventListener('click', (e) => e.stopPropagation());
dlkey.addEventListener('click', (e) => { e.stopPropagation(); dlkey.classList.remove('glow'); dlOpen && !dlAuto ? closeDl() : openDl(); });
el('dlfolder').addEventListener('click', () => { closeDl(); window.aang?.browserDl?.({ act: 'folder' }); });
el('dlall').addEventListener('click', () => { closeDl(); window.aang?.browserDl?.({ act: 'page' }); });
el('dlclear').addEventListener('click', () => { closeDl(); window.aang?.browserDl?.({ act: 'clear' }); });
document.addEventListener('click', () => { if (dlOpen && !dlAuto) closeDl(); });
page.addEventListener('pointerdown', () => closeDl());
window.aang?.onBrowserDls?.((d) => {
  dls = Array.isArray(d?.items) ? d.items : [];
  const show = dls.length > 0;
  dlkey.classList.toggle('away', !show);
  dlkey.tabIndex = show ? 0 : -1;
  if (!show) { dlkey.classList.remove('glow'); closeDl(); return; }
  paintDls();
  if (d.pop) { dlkey.classList.add('glow'); openDl(true); }
});
window.aang?.browserDlHello?.();

// ---- the gold bar (2026-10-12, his design from the research): 8% the moment he clicks, real steps as the site
// answers (35%), the page is read (55%) and first draws (70%); a creep between, never past 90% and never stalling;
// done: a quick sweep to full, a moment, a fade. Nothing moving for 5 s: the stripes speed up. A failure dulls it.
const barEl = loading.querySelector('i');
const ringWas = new Map();
let bar = { id: null, on: false, v: 0, real: 0, lastStep: 0 }, creepT = null, doneT = null;
function barTo(v, ms = 250, ease = 'cubic-bezier(.2,0,0,1)') {
  bar.v = Math.min(1, Math.max(bar.v, v));
  barEl.style.transition = `transform ${ms}ms ${ease}, opacity 140ms`;
  barEl.style.opacity = '1';
  loading.classList.add('run');
  barEl.style.transform = `translateX(${((bar.v - 1) * 100).toFixed(2)}%)`;
}
function barHide(now = false) {
  clearInterval(creepT); creepT = null; clearTimeout(doneT);
  bar.on = false; loading.classList.remove('slow');
  if (now) { barEl.style.transition = 'none'; barEl.style.opacity = '0'; barEl.style.transform = 'translateX(-100%)'; bar.v = 0; loading.classList.remove('fail', 'run'); return; }
  barEl.style.transition = 'opacity 200ms'; barEl.style.opacity = '0';
  doneT = setTimeout(() => { barEl.style.transition = 'none'; barEl.style.transform = 'translateX(-100%)'; bar.v = 0; loading.classList.remove('fail', 'run'); }, 220);
}
function barStart(id, v) {
  clearTimeout(doneT); loading.classList.remove('fail', 'slow');
  barEl.style.transition = 'none'; barEl.style.transform = 'translateX(-100%)'; bar.v = 0;
  bar = { id, on: true, v: 0, real: v, lastStep: performance.now() };
  void barEl.offsetWidth;
  barTo(Math.max(0.08, v), 120);
  clearInterval(creepT);
  creepT = setInterval(() => {
    if (!bar.on) return;
    if (bar.v < 0.9) barTo(bar.v + (0.9 - bar.v) * 0.035, 400, 'linear');
    loading.classList.toggle('slow', performance.now() - bar.lastStep > 5000);
  }, 200);
}
function barFor(t) {
  const phase = t ? (t.phase ?? (t.loading ? 'loading' : 'idle')) : 'idle';
  const prog = Number(t?.prog) || 0;
  if (!t || t.id !== bar.id) {                 // another tab is in front: show its own state, no animation from the last
    if (phase === 'idle' || !t) { barHide(true); bar.id = t?.id ?? null; return; }
    barStart(t.id, prog); return;
  }
  if (phase === 'idle') {
    if (!bar.on) return;
    if (t.failed) { loading.classList.add('fail'); clearInterval(creepT); creepT = null; bar.on = false; barEl.style.transition = 'opacity 300ms'; barEl.style.opacity = '0'; doneT = setTimeout(() => barHide(true), 320); return; }
    clearInterval(creepT); creepT = null; bar.on = false;
    barTo(1, 150, 'cubic-bezier(.5,0,1,1)');    // speeds up into the end
    doneT = setTimeout(() => barHide(false), 300);
    return;
  }
  if (!bar.on || prog < bar.real - 0.01) { barStart(t.id, prog); return; }   // a new page started
  if (prog > bar.real) { bar.real = prog; bar.lastStep = performance.now(); loading.classList.remove('slow'); barTo(prog, 250); }
}
// ---- Reload / Stop
let reloadMode = 'reload', reloadAt = 0, reloadHover = false, reloadLater = null;
const reloadBtn = el('reload');
reloadBtn.addEventListener('pointerenter', () => { reloadHover = true; });
reloadBtn.addEventListener('pointerleave', () => { reloadHover = false; if (reloadLater) { const w = reloadLater; reloadLater = null; reloadWant(w); } });
reloadBtn.addEventListener('click', (e) => { if (reloadMode === 'stop' && performance.now() - reloadAt < 500) e.stopImmediatePropagation(); }, true);
function reloadWant(busy) {
  const want = busy ? 'stop' : 'reload';
  if (want === reloadMode) { reloadLater = null; return; }
  // Stop turning back into Reload under a resting mouse would make his next click a reload he did not mean.
  if (!busy && reloadHover && performance.now() - reloadAt < 1350) { reloadLater = false; setTimeout(() => { if (reloadLater === false) { reloadLater = null; reloadWant(false); } }, 1350); return; }
  reloadMode = want; reloadAt = performance.now();
  reloadBtn.dataset.mode = want;
  reloadBtn.innerHTML = busy ? STOPGLYPH : RELOADGLYPH;
  reloadBtn.setAttribute('aria-label', busy ? 'Stop loading' : 'Reload');
}

// ---- 6.25a: Aang's and Claude sessions' own trails: their icon, their pages, and the brick-red STOP while they work.
const CLAUDE_IC = '<svg viewBox="0 0 9 9" width="16" height="16" shape-rendering="crispEdges" aria-hidden="true"><path d="M4 0h1v3H4zM4 6h1v3H4zM0 4h3v1H0zM6 4h3v1H6zM1 1h1v1H1zM2 2h1v1H2zM7 1h1v1H7zM6 2h1v1H6zM1 7h1v1H1zM2 6h1v1H2zM7 7h1v1H7zM6 6h1v1H6zM3 3h3v3H3z" fill="#E07A4F"/></svg>';
const STOP_IC = '<svg viewBox="0 0 7 7" width="12" height="12" shape-rendering="crispEdges" aria-hidden="true"><path d="M1 1h5v5H1z" fill="#ffe4dc"/></svg>';
function driverIcon(kind) {
  const ic = Object.assign(document.createElement('span'), { className: 'who-ic' });
  if (kind === 'claude') ic.innerHTML = CLAUDE_IC;
  else ic.append(Object.assign(document.createElement('img'), { src: 'art/aang-face.png', alt: '' }));
  return ic;
}
const stopArmed = new Map();
function stopKey(jobId, big = false) {
  const b = Object.assign(document.createElement('button'), { type: 'button', className: 'stopk' + (big ? ' big' : ''), title: 'Stop', innerHTML: STOP_IC });
  b.setAttribute('aria-label', 'Stop');
  // Two presses: the first turns it into "Stop?" for 3 seconds, the second stops. A slow redraw once put the key
  // under his pointer and a job stopped that he never meant to (2026-10-14). The armed state outlives a redraw.
  if (stopArmed.get(jobId) > Date.now()) { b.classList.add('armed'); b.textContent = 'STOP?'; }
  b.addEventListener('click', (e) => {
    e.stopPropagation();
    if ((stopArmed.get(jobId) ?? 0) > Date.now()) { stopArmed.delete(jobId); window.aang?.browserDriver?.({ act: 'stop', id: jobId }); return; }
    stopArmed.set(jobId, Date.now() + 3000); b.classList.add('armed'); b.textContent = 'STOP?';
    setTimeout(() => { if (!((stopArmed.get(jobId) ?? 0) > Date.now())) { b.classList.remove('armed'); b.innerHTML = STOP_IC; } }, 3100);
  });
  return b;
}
function driverNodes() {
  const out = [];
  for (const j of Array.isArray(state.drivers) ? state.drivers : []) {
    const h = document.createElement('div'); h.className = 'th driver';
    const nm = Object.assign(document.createElement('span'), { className: 'nm', textContent: j.name });
    const n = Object.assign(document.createElement('span'), { className: 'n', textContent: `${j.pages.length} TAB${j.pages.length === 1 ? '' : 'S'}` });
    const more = Object.assign(document.createElement('button'), { type: 'button', className: 'thm', textContent: '\u00d7', title: 'Close these' });
    more.addEventListener('click', (e) => { e.stopPropagation(); window.aang?.browserDriver?.({ act: 'close', id: j.id }); });
    h.append(driverIcon(j.kind), nm, n);
    if (j.working) h.append(stopKey(j.id)); else h.append(more);
    out.push(h);
    for (const p of j.pages) {
      const row = document.createElement('div');
      row.className = 'tp drv' + (state.watching?.page === p.id ? ' on' : '');
      row.title = p.url; row.tabIndex = 0;
      if (p.favicon) { const i = document.createElement('img'); i.className = 'fi'; i.alt = ''; i.src = p.favicon; i.referrerPolicy = 'no-referrer'; i.onerror = () => i.remove(); row.append(i); }
      row.append(Object.assign(document.createElement('span'), { className: 't', textContent: p.title || p.url }));
      row.addEventListener('click', () => window.aang?.browserDriver?.({ act: 'watch', id: p.id }));
      row.addEventListener('dblclick', () => window.aang?.browserDriver?.({ act: 'open', id: p.id }));
      out.push(row);
    }
  }
  return out;
}
// The live picture while he watches one of Aang's pages; the address bar says who is driving, with STOP.
const watchpic = el('watchpic');
window.aang?.onBrowserWatch?.((src) => {
  if (typeof src === 'string' && src.startsWith('data:image/')) { watchpic.src = src; watchpic.hidden = false; }
  else if (src === null) { watchpic.hidden = true; watchpic.removeAttribute('src'); }
});
function paintWho() {
  const w = state.watching || state.driving, who = el('who');
  if (!w) { who.hidden = true; who.replaceChildren(); return false; }
  who.hidden = false;
  const label = w.kind === 'claude' ? 'CLAUDE IS DRIVING' : 'AANG IS DRIVING';
  who.replaceChildren(driverIcon(w.kind), label, ...(w.working ? [stopKey(w.job, true)] : []));
  return true;
}

// ---- the update key and its tray (sheet 18, then sheet 35, his picks 2026-10-14). The main process sends `update`
// with the tabs once an update is fully ready: its title ("Version 1.1.0: Gojo"), what it does as groups of lines
// (some he can leave out), whether there is a last version to go back to, and his overnight setting.
{
  const key = el('upkey'), tray = el('uptray'), done = el('updone');
  let shownFor = null, cur = null;
  const DAY = 86_400_000;
  const place = (box, anchor) => { const b = el('band').getBoundingClientRect(), k = anchor.getBoundingClientRect(); box.style.right = Math.max(8, Math.round(b.right - k.right)) + 'px'; };
  const view = (name) => { for (const [id, v] of [['upmain', 'main'], ['upskip1', 'skip1'], ['upskip2', 'skip2'], ['upvers', 'vers']]) el(id).hidden = v !== name; el('upmenu').hidden = true; el('upmore').setAttribute('aria-expanded', 'false'); };
  const close = () => { if (tray.hidden) return; tray.hidden = true; key.setAttribute('aria-expanded', 'false'); unfreeze('up'); view('main'); };
  const choices = {};
  const T2 = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };
  // Old messages (a plain engine, or a Mac on yesterday's code) still read: notes and checks become one group.
  const groupsOf = (u) => Array.isArray(u.groups) && u.groups.length ? u.groups
    : [{ name: u.title ? 'SAMARA' : "SAMARA'S ENGINE", items: (Array.isArray(u.checks) && u.checks.length ? u.checks : Array.isArray(u.notes) && u.notes.length ? u.notes : ['A newer engine, with the latest fixes.']).map((t) => ({ text: String(t) })) }];
  const drawList = (box, groups, ticks) => {
    box.replaceChildren();
    for (const g of groups) {
      if (g.name) box.append(T2('div', 'grp', String(g.name)));
      for (const it of g.items ?? []) {
        const row = T2('div', 'it' + (ticks && it.key ? ' opt' : ''));
        const on = ticks && it.key ? choices[it.key] !== false : true;
        const mark = ticks ? T2('span', 'bx' + (on ? '' : ' off')) : T2('span', 'dot');
        const words = T2('span', '', String(it.text ?? ''));
        const note = ticks && it.key ? (on ? 'Click to leave this out.' : 'Left out. Click to put it back in.') : it.note;
        if (note) words.append(T2('small', '', note));
        row.append(mark, words);
        if (ticks && it.key) row.addEventListener('click', (e) => { e.stopPropagation(); choices[it.key] = !(choices[it.key] !== false); drawList(box, groups, true); });
        box.append(row);
      }
    }
  };
  window.aang?.onBrowserTabs?.((s) => {
    const u = s && s.update;
    // Once, after an update put in by itself overnight: what it did, hanging off the ... key.
    const d = s && s.updated;
    if (d && typeof d.title === 'string' && done.hidden && !done.dataset.seen) {
      el('updonename').textContent = d.title;
      drawList(el('updonelist'), [{ name: '', items: (Array.isArray(d.lines) ? d.lines : []).map((t) => ({ text: String(t) })) }], false);
      done.hidden = false; done.dataset.seen = '1'; place(done, el('menukey')); freeze('updone');
    }
    if (!u || typeof u.version !== 'string') { key.classList.add('away'); key.tabIndex = -1; close(); shownFor = null; cur = null; return; }
    cur = u;
    // His escalation (2026-10-14): gold today; the arrow and word glow turquoise after a day; red after three;
    // after four it swells out of the band and shakes now and then (never in a call).
    const days = Math.floor((Date.now() - (Number(u.since) || Date.now())) / DAY);
    key.classList.remove('age0', 'age1', 'age2', 'swell');
    key.classList.add(days >= 3 ? 'age2' : days >= 1 ? 'age1' : 'age0');
    if (days >= 4 && s.inCall !== true) key.classList.add('swell');
    key.title = days >= 1 ? `Update ready, waiting ${days} day${days === 1 ? '' : 's'}` : 'Update ready';
    el('upname').textContent = u.title || 'Engine update';
    el('upsince').textContent = days >= 1 ? `${days} DAY${days === 1 ? '' : 'S'}` : 'TODAY';
    for (const g of groupsOf(u)) for (const it of g.items ?? []) if (it.key && !(it.key in choices)) choices[it.key] = it.on !== false;
    drawList(el('uplist'), groupsOf(u), true);
    el('upback').hidden = u.canBack !== true;
    el('upnight').classList.toggle('on', u.overnight === true);
    const call = s.inCall === true;
    el('upgo').disabled = call;
    el('upwhy').hidden = !call;
    if (call) el('upwhy').textContent = "You're in a call. Restart when it's over.";
    if (shownFor !== u.version) {
      shownFor = u.version;
      key.classList.remove('away'); key.tabIndex = 0;
      key.classList.add('glow'); setTimeout(() => key.classList.remove('glow'), 1600);
    }
  });
  key.addEventListener('click', (e) => { e.stopPropagation(); if (tray.hidden) { closeMenu(); closeDrawer(); closeDl(); view('main'); tray.hidden = false; key.setAttribute('aria-expanded', 'true'); place(tray, key); freeze('up'); } else close(); });
  el('uplater').addEventListener('click', close);
  const go = () => { el('upgo').disabled = true; window.aang?.browserUpdateGo?.({ ...choices }); };
  el('upgo').addEventListener('click', go);
  el('upmore').addEventListener('click', (e) => { e.stopPropagation(); const m = el('upmenu'); m.hidden = !m.hidden; el('upmore').setAttribute('aria-expanded', String(!m.hidden)); el('upsafe').hidden = true; });
  const act = (a, extra = {}) => window.aang?.browserUpdateAct?.({ act: a, ...extra });
  tray.addEventListener('click', (e) => {
    const b = e.target.closest?.('[data-up]');
    if (!b) { if (!el('upmenu').contains(e.target) && e.target !== el('upmore')) el('upmenu').hidden = true; return; }
    e.stopPropagation();
    const a = b.dataset.up;
    if (a === 'safe') { el('upsafe').hidden = !el('upsafe').hidden; return; }
    if (a === 'skip') { view('skip1'); return; }
    if (a === 'take') { view('main'); go(); return; }
    if (a === 'file') { act('file'); close(); return; }
    if (a === 'skip2') { el('upskip2msg').innerHTML = ''; el('upskip2msg').append(document.createTextNode(`${cur?.title || 'This version'} will be `), T2('b', '', 'gone for good'), document.createTextNode(". You'll only get these fixes when a newer version comes out.")); view('skip2'); return; }
    if (a === 'forever') { act('skip'); close(); return; }
    if (a === 'changelog') { act('changelog'); view('vers'); el('uplog').textContent = 'One moment...'; return; }
    if (a === 'home') { view('main'); return; }
    if (a === 'back') { act('back'); close(); return; }
    if (a === 'overnight') { const on = !el('upnight').classList.contains('on'); el('upnight').classList.toggle('on', on); act('overnight', { on }); return; }
  });
  // Every version: the changelog, read here as plain lines (headings stay headings).
  const showLog = (box, text) => {
    box.replaceChildren();
    for (const line of String(text ?? '').split(/\r?\n/)) {
      if (/^# /.test(line) || !line.trim()) continue;
      if (/^## /.test(line)) box.append(T2('div', 'grp', line.slice(3)));
      else if (/^\*.*\*$/.test(line)) box.append(T2('small', 'logday', line.replace(/\*/g, '')));
      else if (/^- /.test(line)) { const r = T2('div', 'it'); r.append(T2('span', 'dot'), T2('span', '', line.slice(2))); box.append(r); }
      else box.append(T2('p', 'logp', line));
    }
    if (!box.children.length) box.append(T2('p', 'logp', 'No versions written down yet.'));
  };
  window.aang?.onBrowserChangelog?.((text) => { showLog(el('uplog'), text); if (!done.hidden) { /* from the overnight drop-down */ } });
  el('updoneok').addEventListener('click', () => { done.hidden = true; unfreeze('updone'); act('seen'); });
  el('updonevers').addEventListener('click', () => { done.hidden = true; unfreeze('updone'); act('seen'); view('vers'); tray.hidden = false; place(tray, el('menukey')); freeze('up'); act('changelog'); el('uplog').textContent = 'One moment...'; });
  window.aang?.onBrowserUpdateWhy?.((why) => { view('main'); el('upwhy').textContent = String(why ?? ''); el('upwhy').hidden = false; el('upgo').disabled = false; });
  el('m-updates').addEventListener('click', () => { closeMenu(); act('check'); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { if (!tray.hidden) close(); if (!done.hidden) { done.hidden = true; unfreeze('updone'); act('seen'); } } });
  document.addEventListener('mousedown', (e) => {
    if (!tray.hidden && !tray.contains(e.target) && !key.contains(e.target)) close();
    if (!done.hidden && !done.contains(e.target)) { done.hidden = true; unfreeze('updone'); act('seen'); }
  });
}

// ---- Sheet 37: a Claude session's plan, from the band (when no Aang bubble shows it). Built with textContent: the task, the
// steps and the sites are Claude's words.
let planCard = null;
const planKeep = new Set();
function paintPlanTray(c) {
  planCard = c;
  el('plantray').hidden = !c;
  // Over the live page, on a still picture of it, like the update tray.
  if (!c) { unfreeze('plan'); return; }
  freeze('plan');
  planKeep.clear(); for (const x of c.sites) planKeep.add(x.site);
  el('plantask').textContent = c.task;
  const sites = el('plansites'); sites.replaceChildren();
  for (const x of c.sites) {
    const r = Object.assign(document.createElement('div'), { className: 'prow' });
    let ic;
    if (x.favicon) { ic = Object.assign(document.createElement('img'), { alt: '' }); ic.onerror = () => ic.replaceWith(pixIcon('globe', 2) ?? document.createElement('span')); ic.src = x.favicon; }
    else ic = pixIcon('globe', 2) ?? document.createElement('span');
    const nm = Object.assign(document.createElement('span'), { className: 'nm', textContent: x.site });
    const tick = Object.assign(document.createElement('button'), { type: 'button', className: 'tq', title: 'Untick to keep Claude off ' + x.site });
    tick.setAttribute('aria-pressed', 'true');
    tick.addEventListener('click', () => { const on = !planKeep.has(x.site); if (on) planKeep.add(x.site); else planKeep.delete(x.site); tick.classList.toggle('off', !on); r.classList.toggle('off', !on); tick.setAttribute('aria-pressed', String(on)); });
    r.append(ic, nm);
    if (x.login) r.append(Object.assign(document.createElement('small'), { textContent: 'with your login' }));
    r.append(Object.assign(document.createElement('span'), { className: 'sp' }), tick);
    sites.append(r);
  }
  const steps = el('plansteps'); steps.replaceChildren();
  c.steps.forEach((t, i) => { const r = Object.assign(document.createElement('div'), { className: 'prow' }); r.append(Object.assign(document.createElement('span'), { className: 'num', textContent: String(i + 1) }), t); steps.append(r); });
  el('planwont').hidden = !c.wont; el('planwonttext').textContent = c.wont ? "Won't " + c.wont.replace(/^won.?t\s+/i, '') : '';
  el('plannote').hidden = true; el('plannote').value = ''; el('plango').textContent = 'Go';
}
const wontIcon = document.querySelector('#planwont [data-pix]'); { const svg = pixIcon('wont', 2); if (svg) wontIcon.append(svg); }
window.aang?.onBrowserPlan?.((c) => paintPlanTray(c && typeof c === 'object' ? c : null));
el('planchange').addEventListener('click', () => { el('plannote').hidden = false; el('plannote').focus(); el('plango').textContent = 'Send changes'; });
el('plango').addEventListener('click', () => {
  if (!planCard) return;
  const note = el('plannote').hidden ? '' : el('plannote').value.trim();
  window.aang?.browserPlanReply?.(planCard.id, { go: !note, change: !!note, keep: [...planKeep], note });
  paintPlanTray(null);
});
el('planno').addEventListener('click', () => { if (planCard) window.aang?.browserPlanReply?.(planCard.id, { go: false, change: false, keep: [], note: '' }); paintPlanTray(null); });

// C7 Claude's rune (2026-10-21, sheet 50): by the ... key only while a Claude job runs, waits on him, or has finished and
// he has not said Nice. Its panel is drawn in its own layer over the live page (see below). The tray layer
// (?tray) has no band, so no rune.
if (!SOLO) {
  // 2026-10-21 (his report: opening it bugged out the browser, worst over a video): its panel no longer freezes the page
  // or pictures it (no freeze, no peek): it opens in its own see-through layer above the live page (browser.ts runeView).
  startRune({ slot: el('runeslot'), band: el('band'), closeOthers: () => { closeMenu(); closeDrawer(); closeDl(); } });
}
