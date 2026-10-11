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
  window.aang?.browserInsets?.({ left: r.left, top: r.top });
}
new ResizeObserver(report).observe(page);
window.addEventListener('load', report);

// ---- the band
el('back').addEventListener('click', () => window.aang?.browserAct?.('back'));
el('fwd').addEventListener('click', () => window.aang?.browserAct?.('forward'));
el('reload').addEventListener('click', () => window.aang?.browserAct?.('reload'));
el('newtab').addEventListener('click', () => window.aang?.browserAct?.('newtab'));
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
  if (c && e.shiftKey && k === 't') send('reopen');
  else if (c && k === 't') send('newtab');
  else if (c && k === 'w') send('close');
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
  lock.textContent = secure ? 'SECURE' : 'NOT SECURE';
  lock.classList.toggle('bad', !secure);
  const host = parsed.hostname;
  const parts = host.split('.');
  const domain = parts.slice(-2).join('.');
  const sub = host.slice(0, host.length - domain.length);
  const b = document.createElement('b'); b.textContent = domain;
  urlEl.append(`${parsed.protocol}//${sub}`, b, `${parsed.pathname === '/' ? '' : parsed.pathname}${parsed.search}`);
}

const SPEAKER = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2 6h3l4-3v10l-4-3H2z" fill="#2a1c00"/><path d="M11 5c1.5 1.5 1.5 4.5 0 6" stroke="#2a1c00" stroke-width="1.8" fill="none"/></svg>';
function paintTabs() {
  tabsBox.replaceChildren();
  const open = new Set(state.tabs.map((t) => t.id));
  for (const t of state.tabs) {
    const row = document.createElement('div');
    row.className = 'tp' + (t.id === state.active ? ' on' : '') + (t.crashed ? ' crash' : '') + (t.opener && open.has(t.opener) ? ' kid' : '');
    row.title = t.url;
    row.tabIndex = 0;
    if (t.loading && !t.crashed) row.append(Object.assign(document.createElement('i'), { className: 'arc' }));
    else if (t.favicon) { const i = document.createElement('img'); i.className = 'fi'; i.alt = ''; i.src = t.favicon; i.referrerPolicy = 'no-referrer'; i.onerror = () => i.remove(); row.append(i); }
    const title = document.createElement('span'); title.className = 't'; title.textContent = t.title || t.url;
    row.append(title);
    if (t.crashed) { const c = document.createElement('span'); c.className = 'cr'; c.textContent = 'CRASHED'; row.append(c); }
    if (t.audible || t.muted) {
      // Sheet 3: a real button. Press it to mute; pressed in, with a red slash, when muted.
      const s = document.createElement('button'); s.type = 'button'; s.className = 'spk' + (t.muted ? ' muted' : '');
      s.setAttribute('aria-label', t.muted ? 'Unmute this tab' : 'Mute this tab');
      s.innerHTML = SPEAKER;
      s.addEventListener('click', (e) => { e.stopPropagation(); window.aang?.browserTab?.({ id: t.id, act: 'mute' }); });
      row.append(s);
    }
    const x = document.createElement('button'); x.type = 'button'; x.className = 'x'; x.textContent = '×'; x.setAttribute('aria-label', 'Close tab');
    x.addEventListener('click', (e) => { e.stopPropagation(); window.aang?.browserTab?.({ id: t.id, act: 'close' }); });
    row.append(x);
    row.addEventListener('click', () => window.aang?.browserTab?.({ id: t.id, act: 'show' }));
    row.addEventListener('auxclick', (e) => { if (e.button === 1) window.aang?.browserTab?.({ id: t.id, act: 'close' }); });
    tabsBox.append(row);
  }
}

window.aang?.onBrowserTabs?.((s) => {
  if (!s || !Array.isArray(s.tabs)) return;
  state = s;
  const t = s.tabs.find((x) => x.id === s.active);
  paintTabs();
  if (edit.hidden) paintUrl(t?.url ?? '');
  el('back').classList.toggle('dim', !s.canBack);
  el('fwd').classList.toggle('dim', !s.canForward);
  loading.classList.toggle('busy', Boolean(t?.loading));
  const crashed = Boolean(t?.crashed);
  el('crashplate').hidden = !crashed;
  if (crashed) el('crashtitle').textContent = `${(t.title || 'This page').slice(0, 60)} stopped working`;
});
