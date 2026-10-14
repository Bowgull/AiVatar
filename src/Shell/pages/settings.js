import { pixIcon } from './pixicons.js';
// The browser's Settings page. Draws what the Shell sends (all text by textContent) and sends back only: a setting
// key and value, an entry to take off one of his lists, or one of three actions. Nothing else is possible here.
const $ = (s, r = document) => r.querySelector(s);
const S = window.settings;
let data = null;

// ---- sections: the left list; the glove points at the open one
let current = 'general';
function show(sec) {
  if ($('#find').value) { $('#find').value = ''; find(); }
  const name = ['general', 'bookmarks', 'passwords', 'privacy', 'sound', 'about'].includes(sec) ? sec : 'general';
  for (const el of document.querySelectorAll('section[data-sec]')) el.hidden = el.dataset.sec !== name;
  for (const a of document.querySelectorAll('.side a')) a.classList.toggle('on', a.dataset.sec === name);
  current = name;
}

// ---- search settings: every section at once, only the rows whose words match (all of what he typed)
function find() {
  const words = $('#find').value.toLowerCase().split(/\s+/).filter(Boolean);
  const secs = [...document.querySelectorAll('section[data-sec]')];
  for (const el of document.querySelectorAll('.nomatch')) el.classList.remove('nomatch');
  if (!words.length) { $('#nofind').hidden = true; for (const s of secs) s.hidden = s.dataset.sec !== current; for (const a of document.querySelectorAll('.side a')) a.classList.toggle('on', a.dataset.sec === current); return; }
  const hit = (t) => { const s = t.toLowerCase(); return words.every((w) => s.includes(w)); };
  let any = false;
  for (const s of secs) {
    s.hidden = false;
    const head = s.querySelector('h2')?.textContent ?? '';
    let secHit = false;
    for (const card of s.querySelectorAll('.card')) {
      const title = card.querySelector('h3')?.textContent ?? '';
      const rows = [...card.querySelectorAll('.row')].filter((r) => !r.hidden);
      let cardHit = false;
      if (rows.length) for (const r of rows) { const ok = hit(head + ' ' + title + ' ' + r.textContent); r.classList.toggle('nomatch', !ok); cardHit ||= ok; }
      else cardHit = hit(head + ' ' + card.textContent);
      card.classList.toggle('nomatch', !cardHit);
      secHit ||= cardHit;
    }
    s.classList.toggle('nomatch', !secHit);
    for (const p of s.querySelectorAll(':scope > h2, :scope > .lead')) p.classList.toggle('nomatch', !secHit);
    any ||= secHit;
  }
  for (const a of document.querySelectorAll('.side a')) a.classList.remove('on');
  $('#nofind').hidden = any;
}
$('#find').addEventListener('input', find);
$('#find').addEventListener('keydown', (e) => { if (e.key === 'Escape') { $('#find').value = ''; find(); } });
for (const a of document.querySelectorAll('.side a')) a.addEventListener('click', (e) => { e.preventDefault(); show(a.dataset.sec); });
S?.onSection?.((s) => show(String(s)));
show(location.hash.slice(1));

// ---- choices: the glove on the one that is on; a click sets it
for (const c of document.querySelectorAll('.choice[data-key]')) {
  for (const b of c.querySelectorAll('button')) b.addEventListener('click', () => {
    const v = b.dataset.v;
    S?.set(c.dataset.key, v === 'true' ? true : v === 'false' ? false : v);
  });
}
for (const b of document.querySelectorAll('[data-act]')) b.addEventListener('click', () => S?.act(b.dataset.act));
$('#homeform').addEventListener('submit', (e) => { e.preventDefault(); S?.set('home', $('#homein').value); });

const ENGINE_NOTE = {
  brave: 'Brave has its own index and filters the least. Type !g before a search to send it to Google.',
  ddg: 'DuckDuckGo: private, results mostly from Bing.',
  google: 'Google: the biggest index; it tracks you and filters the most.',
  yandex: 'Yandex: its own index. It removes sites Russia bans.',
};

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

// Sheet 37, Your sites: one row per site, the same rules as the shield. Four are on/off, camera and mic are allow / ask / block.
const YS_COLS = [['ai', 'ai', 2, 'Claude and Aang'], ['login', 'key', 2, 'Use my login'], ['ads', 'ads', 2, 'Ad blocker'], ['popups', 'popup', 2, 'Popup blocker'], ['dark', 'moon', 2, 'Dark mode'], null, ['camera', 'camera', 3, 'Camera'], ['mic', 'mic', 3, 'Microphone']];
const YS_WORD = { on: 'ON', off: 'OFF', allow: 'ALLOW', ask: 'ASK', block: 'BLOCK', never: 'NEVER' };
function siteRows(list) {
  const box = $('#yoursites');
  const q = ($('#sitefind').value || '').trim().toLowerCase();
  box.replaceChildren();
  const shown = list.filter((s) => !q || s.host.includes(q));
  if (!shown.length) { box.append(Object.assign(document.createElement('div'), { className: 'ysempty', textContent: list.length ? 'No site matches.' : 'None yet. Click the shield next to an address to set a site\'s rules.' })); return; }
  for (const s of shown) {
    const r = Object.assign(document.createElement('div'), { className: 'ysgrid ysrow' });
    const b = document.createElement('b');
    // The site's own icon, the one Samara keeps; a pixel globe for a site whose icon it has not seen yet.
    const globe = () => { const g = Object.assign(document.createElement('span'), { className: 'globe' }); const svg = pixIcon('globe', 2); if (svg) g.append(svg); return g; };
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
      if (st !== 'never') { const svg = pixIcon(icon, 2.4); if (svg) slot.append(svg); }
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
for (const el of document.querySelectorAll('.yskey [data-pix]')) { const svg = pixIcon(el.dataset.pix, 2); if (svg) el.append(svg); }
$('#sitefind').addEventListener('input', () => siteRows(data?.sites ?? []));

function paint(d) {
  if (!d) return;
  data = d;
  for (const c of document.querySelectorAll('.choice[data-key]')) {
    const v = String(d[c.dataset.key]);
    for (const b of c.querySelectorAll('button')) b.classList.toggle('on', b.dataset.v === v);
  }
  if (document.activeElement !== $('#homein')) $('#homein').value = d.home ? String(d.home).replace(/^https:\/\//, '').replace(/\/$/, '') : '';
  $('#homenow').textContent = 'Every new tab opens at ' + String(d.homeNow).replace(/^https:\/\//, '').replace(/\/$/, '') + '.';
  $('#enginenote').textContent = ENGINE_NOTE[d.search] ?? '';
  // bookmarks
  $('#markcount').textContent = d.markCount ? `${d.markCount} bookmark${d.markCount === 1 ? '' : 's'}. Take one off with its x.` : 'No bookmarks yet. Bring them from Chrome, or press the book in the address bar.';
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
  // passwords
  const V = { missing: ['Bitwarden is not on this PC', "Bitwarden's tool needs installing."], 'signed-out': ['Not signed in', 'Sign in once yourself: in PowerShell run the bw login command.'], locked: ['Locked', 'Click the key in the address bar on a login page to unlock it.'], unlocked: ['Unlocked', 'It locks itself 30 minutes after the last fill.'] };
  const v = V[d.vault] ?? ['Bitwarden', ''];
  $('#vaultstate').textContent = 'Bitwarden: ' + v[0];
  $('#vaultnote').textContent = v[1];
  $('#lockbtn').hidden = d.vault !== 'unlocked';
  // privacy
  $('#phishnote').textContent = `${Number(d.phish || 0).toLocaleString()} known fake sites and addresses, refreshed every day.`;
  siteRows(d.sites ?? []);
  chips('trusted', d.trusted ?? [], 'trusted');
  chips('httpOk', d.httpOk ?? [], 'httpOk');
  for (const r of document.querySelectorAll('[data-mac]')) r.hidden = !d.mac;
  $('#versions').textContent = `Chromium ${d.versions?.chrome ?? ''} (Electron ${d.versions?.electron ?? ''}).`;
}
S?.onData?.(paint);
S?.get?.().then(paint).catch(() => {});
