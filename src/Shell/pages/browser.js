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
  for (const id of ['askchip', 'vaultchip', 'sitepanel', 'toast']) { const x = el(id); if (x && !x.hidden) top = Math.max(top, x.getBoundingClientRect().bottom + 6); }
  // All four sides now: the page sits inside the carved recess, with wood on every side of it.
  window.aang?.browserInsets?.({ left: r.left, top, right: window.innerWidth - r.right, bottom: window.innerHeight - r.bottom });
}
new ResizeObserver(report).observe(page);
new MutationObserver(() => requestAnimationFrame(report)).observe(document.body, { subtree: true, attributes: true, attributeFilter: ['hidden'] });
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
function openDrawer() {
  if (drawerOpen) return;
  closeMenu(); closeDl();
  drawerOpen = true;
  el('drawerkey').setAttribute('aria-expanded', 'true');
  el('rail').setAttribute('aria-hidden', 'false');
  freeze('drawer');
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
  unfreeze('drawer', 150);
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
el('m-print').addEventListener('click', () => { closeMenu(); window.aang?.browserAct?.('print'); });
el('m-tidy').addEventListener('click', () => { closeMenu(); openDrawer(); window.aang?.browserAct?.('tidy'); });
el('m-marks').addEventListener('click', () => { closeMenu(); window.aang?.browserAct?.('bookmarks'); });
el('m-settings').addEventListener('click', () => { closeMenu(); window.aang?.browserAct?.('settings'); });
el('m-history').addEventListener('click', () => { closeMenu(); window.aang?.browserAct?.('history'); });
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
el('star').addEventListener('click', (e) => { e.stopPropagation(); tap(1.2); window.aang?.browserAct?.('star'); });
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
// His ask (2026-10-12): resting the mouse on the handle opens the drawer, as other apps do. A short wait, so
// passing over it on the way somewhere does nothing; dragging a tab onto it opens it too.
let hoverOpen = 0;
const handle = el('drawerkey');
handle.addEventListener('pointerenter', () => { window.aang?.browserAct?.('peek'); clearTimeout(hoverOpen); if (!drawerOpen) hoverOpen = setTimeout(openDrawer, 400); });
handle.addEventListener('pointerleave', () => clearTimeout(hoverOpen));
handle.addEventListener('pointerdown', () => clearTimeout(hoverOpen));
handle.addEventListener('dragenter', () => { if (!drawerOpen) openDrawer(); });
// Anything that will cover the page: take its picture while the mouse is on the way, so the click is instant.
for (const id of ['menukey', 'dlkey', 'slot']) el(id)?.addEventListener('pointerenter', () => window.aang?.browserAct?.('peek'));
// A click on the page (its picture) puts the drawer away, as clicking outside any drawer does.
page.addEventListener('pointerdown', () => { closeDrawer(); closeMenu(); });
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
  // The drawer or the menu hides the page under them; typing an address means he wants the page, so they go
  // (found 2026-10-12: a search loaded under the open drawer and he had to click the tab to see it).
  closeDrawer(); closeMenu();
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
function hideSuggest() { if (!sbox.hidden) { sbox.hidden = true; unfreeze('suggest'); } sugg = []; }
function paintSuggest() {
  if (!sugg.length) { hideSuggest(); return; }
  const LABEL = { search: 'SEARCH', go: 'GO', tab: 'SWITCH TO TAB', mark: 'BOOKMARK', history: 'HISTORY', closed: 'CLOSED' };
  sbox.replaceChildren(...sugg.map((s, i) => {
    const row = document.createElement('div');
    row.className = 'srow' + (i === pick ? ' on' : '');
    row.setAttribute('role', 'option');
    if (s.favicon) { const im = document.createElement('img'); im.src = s.favicon; im.alt = ''; row.append(im); }
    row.append(Object.assign(document.createElement('span'), { className: 'st', textContent: s.title || s.url }));
    if (s.kind !== 'search' && s.kind !== 'go') row.append(Object.assign(document.createElement('span'), { className: 'su', textContent: String(s.url).replace(/^https?:\/\/(www\.)?/, '') }));
    row.append(Object.assign(document.createElement('i'), { textContent: LABEL[s.kind] ?? '' }));
    row.addEventListener('mousedown', (e) => { e.preventDefault(); choose(i); });
    return row;
  }));
  if (sbox.hidden) { sbox.hidden = false; freeze('suggest'); }
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
window.aang?.onBrowserFocusSlot?.(() => editSlot());

// ---- find on page (Ctrl+F). Typing searches as he types; Enter is the next match, Shift+Enter the one before;
// Esc, or clicking away, puts the slot back as it was.
const findBox = el('find'), findTag = el('findtag'), findN = el('findn');
let finding = false;
function openFind() {
  closeSlot(); closeMenu(); closeDrawer();
  finding = true;
  urlEl.hidden = true; lock.hidden = true;
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
  urlEl.replaceChildren();
  // The browser's own pages (Settings) say their name, with no shield: they are not websites.
  if (String(u).startsWith('aang:')) { urlEl.append(Object.assign(document.createElement('b'), { textContent: String(u) === 'aang:things' ? 'Your things' : 'Settings' })); lock.hidden = true; return; }
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

const VIDEO_SITE = /(^|\.)(youtube\.com|youtu\.be|twitch\.tv|crunchyroll\.com|netflix\.com|primevideo\.com|amazon\.(com|ca)|disneyplus\.com|vimeo\.com|kick\.com|max\.com|crave\.ca)$/i;
const hostOf = (u) => { try { return new URL(u).hostname; } catch { return ''; } };
// The site shield (his pick, 2026-10-12): hand-built pixel art, mirror-perfect, Aang's arrow on a gold-rimmed shield.
// Shown at its exact pixel size, never scaled. tools/pixelart/shield/bar_arrow.py makes it.
// Option C (his pick, 2026-10-12, from how every browser does it): one quiet colour at rest; the full-colour shield
// while he points at it or its panel is open; solid blue when it caught a popup; red when something is wrong.
const SHIELD = '<span class="shieldbox"><img class="s-rest" src="art/browser/shield_rest.png" width="20" height="23" alt="">'
  + '<img class="s-hover" src="art/browser/shield_hover.png" width="20" height="23" alt="">'
  + '<img class="s-popup" src="art/browser/shield_popup.png" width="20" height="23" alt=""></span>';
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
  const open = new Set(state.tabs.map((t) => t.id));
  const trails = Array.isArray(state.trails) ? state.trails : [];
  const live = state.tabs.filter((t) => !t.done);
  const groups = [{ id: null, tabs: live.filter((t) => t.trail == null) }];
  for (const tr of trails) { const tabs = live.filter((t) => t.trail === tr.id); if (tabs.length) groups.push({ id: tr.id, trail: tr, tabs }); }
  const done = state.tabs.filter((t) => t.done);
  const rowFor = (t, kid) => {
    const dup = Boolean(state.tidy?.dup?.includes(t.id));
    const sig = JSON.stringify([t.id === state.active, t.crashed, t.asleep, t.loading, t.phase, t.favicon, t.title, t.url, t.audible, t.muted, kid, t.done, t.lent, dup]);
    let r = rows.get(t.id);
    if (!r || r.sig !== sig) {
      const fresh = buildRow(t, kid);
      if (dup) { fresh.classList.add('dup'); fresh.append(Object.assign(document.createElement('span'), { className: 'dupchip', textContent: 'X2 CLOSING' })); }
      fresh.draggable = true; fresh.dataset.tab = String(t.id); fresh.dataset.trail = t.trail == null ? '' : String(t.trail);
      if (r) r.el.replaceWith(fresh); r = { sig, el: fresh }; rows.set(t.id, r);
    }
    return r.el;
  };
  const want = [];
  for (const g of groups) {
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
  want.forEach((node, i) => { if (tabsBox.children[i] !== node) tabsBox.insertBefore(node, tabsBox.children[i] ?? null); });
  while (tabsBox.children.length > want.length) tabsBox.lastElementChild.remove();
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
  h.draggable = true;
  h.dataset.trail = String(tr.id);
  h.replaceChildren(grip, nm, Object.assign(document.createElement('span'), { className: 'n', textContent: `${n} TAB${n === 1 ? '' : 'S'}` }), more);
  return h;
}

// ---- the tab's own menu (right-click), sheet 3 section 7
function closeTabMenu() { document.getElementById('tabmenu')?.remove(); }
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
  const trails = Array.isArray(state.trails) ? state.trails : [];
  for (const tr of trails) if (tr.id !== t.trail) item('Move to ' + tr.name.toLowerCase().replace(/^./, (c) => c.toUpperCase()), () => window.aang?.browserTrail?.({ act: 'move', tab: t.id, to: tr.id }), { sub: true });
  item('Move to a new trail', () => window.aang?.browserTrail?.({ act: 'move', tab: t.id, to: 'new' }), { sub: true });
  if (t.trail != null) item('Take out of the trail', () => window.aang?.browserTrail?.({ act: 'move', tab: t.id, to: null }), { sub: true });
  sep();
  item('Open in Chrome', () => {}, { soon: true });
  item('Popout', () => window.aang?.browserPopout?.(t.id));
  item('Send to Mac', () => window.aang?.browserToMac?.(t.id));
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
    else if (t.favicon) { const i = document.createElement('img'); i.className = 'fi'; i.alt = ''; i.src = t.favicon; i.referrerPolicy = 'no-referrer'; i.onerror = () => i.remove(); row.append(i); }
    const title = document.createElement('span'); title.className = 't'; title.textContent = t.title || t.url;
    row.append(title);
    if (t.crashed) { const c = document.createElement('span'); c.className = 'cr'; c.textContent = 'CRASHED'; row.append(c); }
    // Sheet 3: asleep is sunk flush into the wood, colour drained. Click and it wakes where it was.
    if (asleep && !t.lent) { const z = document.createElement('span'); z.className = 'zz'; z.textContent = 'ASLEEP'; row.append(z); }
    if (t.lent) { const z = document.createElement('span'); z.className = 'zz lent'; z.textContent = 'IN POPOUT'; row.append(z); }
    // The pop-out keycap, only on video tabs: a video site, or anything playing sound right now.
    if (!t.done && !t.lent && (t.audible || VIDEO_SITE.test(hostOf(t.url)))) {
      const p = document.createElement('button'); p.type = 'button'; p.className = 'pip';
      p.title = 'Pops this page into its own window'; p.setAttribute('aria-label', 'Popout');
      p.addEventListener('click', (e) => { e.stopPropagation(); window.aang?.browserPopout?.(t.id); });
      // Send to the MacBook, beside it: the same keycap, on hover only (his ask, 2026-10-12). It stops here.
      const m = document.createElement('button'); m.type = 'button'; m.className = 'pip tomac';
      m.title = 'Send to the MacBook. It stops playing here.'; m.setAttribute('aria-label', 'Send to Mac');
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
    const x = document.createElement('button'); x.type = 'button'; x.className = 'x'; x.textContent = '×'; x.setAttribute('aria-label', 'Close tab');
    x.addEventListener('click', (e) => { e.stopPropagation(); tap(0.7); window.aang?.browserTab?.({ id: t.id, act: 'close' }); });
    row.append(x);
    // A tab switches on the press, not the release, the way Chrome does; its buttons keep their own clicks.
    row.addEventListener('pointerdown', (e) => { if (e.button === 0 && !e.target.closest('button')) { window.aang?.browserTab?.({ id: t.id, act: 'show' }); closeDrawer(); } });
    row.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); window.aang?.browserTab?.({ id: t.id, act: 'show' }); } });
    row.addEventListener('auxclick', (e) => { if (e.button === 1) { tap(0.7); window.aang?.browserTab?.({ id: t.id, act: 'close' }); } });
    row.addEventListener('contextmenu', (e) => { e.preventDefault(); tabMenu(t, e.clientX, e.clientY); });
    return row;
  }
}

// ---- bookmarks on the velvet shelf: logo and name, a click opens it. Empty until the import (6.23).
function paintMarks(list) {
  const box = el('marks');
  box.replaceChildren();
  if (!Array.isArray(list) || !list.length) {
    box.append(Object.assign(document.createElement('p'), { className: 'empty', textContent: 'Your bookmarks land here. Press the book in the address bar, or bring them from Chrome in Settings.' }));
    return;
  }
  for (const b of list.slice(0, 24)) {
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
  el('askm').textContent = a.text || `${a.host || 'This site'} wants it for what you are doing now. You are asked again next time.`;
  el('askyes').firstChild.textContent = a.yes || 'Allow for this call';
  el('askno').firstChild.textContent = a.no || 'No';
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
  lock.classList.toggle('open', !el('sitepanel').hidden);
});
function paintAdSwitch() {
  const on = state.adsOn && !state.adsPaused;
  el('adsw').classList.toggle('on', on);
  el('adsw').setAttribute('aria-checked', String(on));
  el('adnote').textContent = !state.adsOn ? 'The block lists are still loading.' : state.adsPaused ? 'Paused here. Ads show on this site.' : 'On. Ads and trackers are stopped here.';
}
el('adsw').addEventListener('click', (e) => { e.preventDefault(); if (state.adsOn) window.aang?.browserAdPause?.(!state.adsPaused); });
document.addEventListener('click', (e) => { if (!el('sitepanel').contains(e.target) && !lock.contains(e.target)) { el('sitepanel').hidden = true; lock.classList.remove('open'); } });
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
el('reclaim').addEventListener('click', () => window.aang?.browserAct?.('reclaim'));
el('phishreal').addEventListener('click', () => window.aang?.browserAct?.('phishreal'));
el('failgo').addEventListener('click', () => window.aang?.browserAct?.('httpok'));
el('failretry').addEventListener('click', () => window.aang?.browserAct?.('failretry'));
el('failback').addEventListener('click', () => window.aang?.browserAct?.('failback'));

window.aang?.onBrowserTabs?.((s) => {
  if (!s || !Array.isArray(s.tabs)) return;
  state = s;
  paintMarks(s.marks);
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
  // Where he asked to go shows at once, dimmed, until the page arrives (only for his own typed or opened addresses).
  if (edit.hidden && !finding) paintUrl(t?.pending || t?.url || '');
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
  // A listed site: the red plate where the page would be, and the plaque turns red.
  const b = t?.blocked;
  el('phishplate').hidden = !b;
  if (b) {
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
    lock.hidden = false; lock.textContent = 'BLOCKED'; lock.classList.add('bad');
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
  if (!el('sitepanel').hidden) paintAdSwitch();
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

// ---- dragging (2026-10-12): a tab into another trail, out to loose, or up and down; a whole trail by its heading.
// A gold line shows where it will land. Nothing moves until the drop.
const dropLine = Object.assign(document.createElement('div'), { className: 'dropline' });
let dragging = null;   // { kind: 'tab' | 'trail', id }
tabsBox.addEventListener('dragstart', (e) => {
  const row = e.target.closest?.('.tp[data-tab]'), head = e.target.closest?.('.th[data-trail]');
  if (row) dragging = { kind: 'tab', id: Number(row.dataset.tab) };
  else if (head) dragging = { kind: 'trail', id: Number(head.dataset.trail) };
  else return;
  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setData('text/plain', '');
  (row || head).classList.add('lifted');
});
tabsBox.addEventListener('dragend', () => { dragging = null; dropLine.remove(); for (const x of tabsBox.querySelectorAll('.lifted')) x.classList.remove('lifted'); });
/** Where a drop at this point lands: the element it goes before, and the trail it joins. */
function landing(y) {
  const items = [...tabsBox.children].filter((n) => n.matches('.tp[data-tab], .th[data-trail]'));
  if (dragging?.kind === 'trail') {
    const heads = items.filter((n) => n.matches('.th'));
    const before = heads.find((h) => y < h.getBoundingClientRect().top + h.offsetHeight / 2) ?? null;
    return { node: before, trail: null, before: before ? Number(before.dataset.trail) : null };
  }
  for (const n of items) {
    const r = n.getBoundingClientRect();
    if (y < r.top + r.height / 2) {
      if (n.matches('.th')) {
        // above a heading: the end of whatever group sits above it
        const prev = items[items.indexOf(n) - 1];
        return { node: n, trail: prev?.matches('.tp') && prev.dataset.trail ? Number(prev.dataset.trail) : null, before: null, atEnd: true };
      }
      return { node: n, trail: n.dataset.trail ? Number(n.dataset.trail) : null, before: Number(n.dataset.tab) };
    }
    // over the lower half of a heading: the start of that trail
    if (n.matches('.th') && y < r.bottom) {
      const first = items[items.indexOf(n) + 1];
      return { node: first ?? null, trail: Number(n.dataset.trail), before: first?.matches('.tp') && first.dataset.trail === n.dataset.trail ? Number(first.dataset.tab) : null };
    }
  }
  const last = items[items.length - 1];
  return { node: null, trail: last?.matches('.tp') && last.dataset.trail ? Number(last.dataset.trail) : null, before: null };
}
tabsBox.addEventListener('dragover', (e) => {
  if (!dragging) return;
  e.preventDefault();
  const l = landing(e.clientY);
  if (l.node) tabsBox.insertBefore(dropLine, l.node); else tabsBox.append(dropLine);
});
tabsBox.addEventListener('drop', (e) => {
  if (!dragging) return;
  e.preventDefault();
  const l = landing(e.clientY);
  if (dragging.kind === 'trail') window.aang?.browserTrail?.({ act: 'movetrail', id: dragging.id, before: l.before });
  else window.aang?.browserTrail?.({ act: 'place', tab: dragging.id, trail: l.trail, before: l.before });
  dropLine.remove();
  dragging = null;
});

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
  barEl.style.transform = `translateX(${((bar.v - 1) * 100).toFixed(2)}%)`;
}
function barHide(now = false) {
  clearInterval(creepT); creepT = null; clearTimeout(doneT);
  bar.on = false; loading.classList.remove('slow');
  if (now) { barEl.style.transition = 'none'; barEl.style.opacity = '0'; barEl.style.transform = 'translateX(-100%)'; bar.v = 0; loading.classList.remove('fail'); return; }
  barEl.style.transition = 'opacity 200ms'; barEl.style.opacity = '0';
  doneT = setTimeout(() => { barEl.style.transition = 'none'; barEl.style.transform = 'translateX(-100%)'; bar.v = 0; loading.classList.remove('fail'); }, 220);
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
