// The browser's Settings page. Draws what the Shell sends (all text by textContent) and sends back only: a setting
// key and value, an entry to take off one of his lists, or one of three actions. Nothing else is possible here.
const $ = (s, r = document) => r.querySelector(s);
const S = window.settings;
let data = null;

// ---- sections: the left list; the glove points at the open one
function show(sec) {
  const name = ['general', 'bookmarks', 'passwords', 'privacy', 'sound', 'about'].includes(sec) ? sec : 'general';
  for (const el of document.querySelectorAll('section[data-sec]')) el.hidden = el.dataset.sec !== name;
  for (const a of document.querySelectorAll('.side a')) a.classList.toggle('on', a.dataset.sec === name);
}
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
  chips('popupOk', d.popupOk ?? [], 'popupOk');
  chips('trusted', d.trusted ?? [], 'trusted');
  chips('httpOk', d.httpOk ?? [], 'httpOk');
  $('#versions').textContent = `Chromium ${d.versions?.chrome ?? ''} (Electron ${d.versions?.electron ?? ''}).`;
}
S?.onData?.(paint);
S?.get?.().then(paint).catch(() => {});
