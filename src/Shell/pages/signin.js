// Phase 1: the old-style sign-in box. Samara says which site asks; his answer goes back once, then the window closes.
const $ = (id) => document.getElementById(id);
window.aangSignin.on((m) => {
  $('kick').textContent = m.proxy ? 'Your proxy asks you to sign in' : 'This site asks you to sign in';
  $('host').textContent = m.host || 'Unknown site';
  const why = [];
  if (m.realm) why.push(`It calls this “${m.realm}”.`);
  if (!m.secure) why.push('Not secure: the password is sent without encryption.');
  if (m.again) why.push('That name and password did not work. Try again.');
  $('why').textContent = why.join(' ');
  $('why').classList.toggle('bad', !m.secure || Boolean(m.again));
  $('user').focus();
});
$('f').addEventListener('submit', (e) => { e.preventDefault(); window.aangSignin.answer($('user').value, $('pass').value); });
$('no').addEventListener('click', () => window.aangSignin.cancel());
addEventListener('keydown', (e) => { if (e.key === 'Escape') window.aangSignin.cancel(); });
