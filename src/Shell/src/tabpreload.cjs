// 6.22: the only script a browser tab gets, and it exposes NOTHING to the page: no doors. It sends one fixed
// message of its own, "painted", when the page first draws (2026-10-12, the soft fade between pages); the page
// cannot reach it or put anything in it.
//
// Its one job is passkeys. In Electron on Windows a site sees passkey support, shows its passkey button,
// and the call then never settles: no Windows Security dialog, no error, the page just hangs (research,
// "Aang browser daily driver/passwords_and_passkeys.md"). Telling the page there are no passkeys makes a
// well-built site fall back to a password and a code instead. Plain CommonJS, like preload.cjs.
const { contextBridge, ipcRenderer } = require('electron');

// Dark mode's own world (2026-10-14): given its own rules, the way a browser extension's is, so a site whose rules
// forbid added styles cannot block Dark Reader's. Nothing the PAGE runs gains anything: the page's rules still bind it.
try {
  require('electron').webFrame.setIsolatedWorldInfo(1002, { securityOrigin: location.origin === 'null' ? 'aang-dark://' : location.origin, csp: "style-src 'unsafe-inline' * data: blob:; img-src * data: blob:", name: 'Aang dark mode' });
} catch { /* dark mode then follows the page's own rules */ }
// ...and dark mode from the first moment (his report, 2026-10-20: Gmail and LinkedIn stayed white for a long while,
// because it waited for the page to be built). Asked without waiting; the Shell answers only for the top frame of a page
// he wants dark. The page cannot see or stop it: it runs in that same world of its own.
try {
  if (window === window.top) {
    ipcRenderer.invoke('tab:dark').then((a) => {
      if (!a || typeof a.src !== 'string') return;
      // Only once the page has a body to read (its own background decides whether it is already dark), at most 1.5 s.
      const run = () => require('electron').webFrame.executeJavaScriptInIsolatedWorld(1002, [{ code: `if(!globalThis.DarkReader){${a.src}\n};${a.test || ''}if(!DarkReader.isEnabled()&&!(typeof __aangAlreadyDark==='function'&&__aangAlreadyDark())){DarkReader.enable(${a.theme});if(typeof __aangWatchDark==='function')__aangWatchDark();}true` }]).catch(() => {});
      if (document.body) run();
      else {
        let done = false;
        const go = () => { if (done) return; done = true; mo.disconnect(); run(); };
        const mo = new MutationObserver(() => { if (document.body) go(); });
        mo.observe(document, { childList: true, subtree: true });
        setTimeout(go, 1500);
      }
    }, () => {});
  }
} catch { /* the Shell paints it when the page is ready, as before */ }

try {
  let said = false;
  const po = new PerformanceObserver((list) => {
    if (said) return;
    if (list.getEntries().some((e) => e.name === 'first-contentful-paint' || e.name === 'first-paint')) { said = true; po.disconnect(); ipcRenderer.send('tab:painted'); }
  });
  po.observe({ type: 'paint', buffered: true });
} catch { /* no paint timing here: the Shell falls back to the page finishing */ }

// Nothing plays until he asks (his rule, 2026-10-20: "nothing should play until I click"). A page may start sound
// by itself only when he asked for it a moment ago (an address, a bookmark, a link he clicked: the Shell knows).
// Anything else waits for his click on the page itself, silent videos too (previews, muted ads, a tab Samara
// reopened). A tab he is not looking at never starts playing; one he opened behind starts when he goes to it.
// This only pauses: the page's own play button is untouched, and a click a moment ago always wins.
try {
  // Asked without waiting (2026-10-20): a page must never stall on the answer (a waiting question held pages up for
  // seconds). Until it comes, nothing starts by itself; what the answer allows then starts at once.
  // hold (2026-10-23, filmed): a tab woken from sleep. Nothing plays, sound or not, until he clicks in the page itself.
  let ok = false, known = false, shown = true, hold = false;
  const held = new Set(), early = new Set();
  const playAll = (set) => { for (const m of set) { try { m.play().catch(() => {}); } catch { /* gone */ } } set.clear(); };
  ipcRenderer.invoke('tab:mayplay').then((a) => {
    ok = !a || a.ok !== false; shown = !a || a.shown !== false; hold = Boolean(a && a.hold); known = true;
    if (hold) { early.clear(); return; }
    if (ok && shown) playAll(early); else if (ok) { for (const m of early) held.add(m); early.clear(); } else early.clear();
  }, () => { ok = true; known = true; playAll(early); });   // no Shell to ask (a test): the page plays as anywhere
  ipcRenderer.on('tab:shown', (_e, v) => {
    shown = v !== false;
    if (!shown) { held.clear(); return; }
    playAll(held);
  });
  window.addEventListener('play', (e) => {
    const m = e.target;
    if (!(m instanceof HTMLMediaElement)) return;
    const ua = navigator.userActivation;
    if (ua && ua.isActive) { hold = false; return; }                // he just clicked or pressed a key: his
    if (hold) { try { m.pause(); } catch { /* gone */ } return; }
    if (!known) { if (!m.muted) early.add(m); try { m.pause(); } catch { /* gone */ } return; }
    const his = !m.muted && (ok || (ua && ua.hasBeenActive));       // sound he asked for on this page
    if (his && shown) return;
    if (his) held.add(m);                                           // opened behind: plays when he goes to it
    try { m.pause(); } catch { /* gone */ }
  }, true);
} catch { /* no Shell to ask: the page plays as it would anywhere */ }

// Autofill (sheet 77, 2026-10-23): which box he is in, and where, so Samara can show its light beside it. Only the kind of
// box and its place go to Samara; nothing comes back into the page from here. Top page, secure pages only.
// The SAME fieldKind as src/autofill.ts FIELD_KIND_JS (test/autofill.test.ts keeps them equal).
try {
  if (window === window.top && location.protocol === 'https:') {
    function fieldKind(el) {
      if (!el || (el.tagName !== 'INPUT' && el.tagName !== 'SELECT') || el.disabled || el.readOnly) return null;
      const t = (el.type || 'text').toLowerCase();
      if (['hidden', 'submit', 'button', 'checkbox', 'radio', 'file', 'image', 'reset', 'range', 'color', 'date', 'number', 'search', 'month', 'week', 'time', 'datetime-local'].includes(t)) return null;
      const ac = (el.getAttribute('autocomplete') || '').toLowerCase().split(/\s+/);
      const has = (w) => ac.includes(w);
      if (has('off') && t !== 'password' && t !== 'email') return null;
      if (t === 'password') return has('new-password') ? 'newpassword' : 'password';
      if (has('one-time-code') || has('cc-number') || has('cc-csc')) return null;
      if (has('username')) return 'username';
      if (t === 'email' || has('email')) return 'email';
      if (has('name')) return 'name';
      if (has('given-name')) return 'given';
      if (has('family-name')) return 'family';
      if (t === 'tel' || has('tel')) return 'tel';
      if (has('street-address') || has('address-line1')) return 'street';
      if (has('address-level2')) return 'city';
      if (has('address-level1')) return 'region';
      if (has('postal-code')) return 'postal';
      if (has('country') || has('country-name')) return 'country';
      const lab = el.labels && el.labels[0] ? el.labels[0].textContent : '';
      const s = [el.name, el.id, el.getAttribute('placeholder'), el.getAttribute('aria-label'), lab].join(' ').toLowerCase();
      if (/e-?mail/.test(s)) return 'email';
      if (/user ?name|login|account id|sign.?in/.test(s)) return 'username';
      if (/first.?name|given/.test(s)) return 'given';
      if (/last.?name|surname|family/.test(s)) return 'family';
      if (/full.?name|your name|^\s*name\s*$/.test(s)) return 'name';
      if (/phone|mobile|\btel\b/.test(s)) return 'tel';
      if (/street|address.?(line)?.?1|^\s*address\s*$/.test(s)) return 'street';
      if (/\bcity\b|town/.test(s)) return 'city';
      if (/province|\bstate\b|region/.test(s)) return 'region';
      if (/\bzip\b|postal|post ?code/.test(s)) return 'postal';
      if (/country/.test(s)) return 'country';
      return null;
    }
    let here = null;
    const say = (box) => {
      if (!box) { ipcRenderer.send('tab:field', null); return; }
      const k = fieldKind(box), r = box.getBoundingClientRect();
      if (!k || r.width < 30 || r.height < 12) { ipcRenderer.send('tab:field', null); return; }
      const kinds = [...new Set([...(box.form || document).querySelectorAll('input, select')].map(fieldKind).filter(Boolean))].slice(0, 12);
      ipcRenderer.send('tab:field', { kind: k, kinds, empty: box.value === '', rect: { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) } });
    };
    document.addEventListener('focusin', (e) => { here = e.target instanceof HTMLInputElement && fieldKind(e.target) ? e.target : null; say(here); }, true);
    document.addEventListener('focusout', (e) => { if (e.target === here) { here = null; setTimeout(() => { if (!here) say(null); }, 60); } }, true);
    // Typing makes the light go; scrolling or resizing moves the box, so the light goes and comes back when he clicks.
    document.addEventListener('input', (e) => { if (e.target === here && here.value !== '') ipcRenderer.send('tab:field', { typing: true }); }, true);
    window.addEventListener('scroll', () => { if (here) say(null); }, { capture: true, passive: true });
    window.addEventListener('resize', () => { if (here) say(null); }, { passive: true });
    // A login sent: the name and password he typed, so Samara can offer to keep it (it shows him first, he decides).
    const sent = (form) => {
      const boxes = [...(form || document).querySelectorAll('input')];
      const pw = boxes.find((b) => b.type === 'password' && b.value);
      if (!pw) return;
      const user = boxes.filter((b) => ['username', 'email'].includes(fieldKind(b)) && b.value).pop();
      ipcRenderer.send('tab:cred', { user: user ? user.value.slice(0, 200) : '', pass: pw.value.slice(0, 500) });
    };
    // Only his own press or click (security check 2026-10-24, finding 4): events a page's script makes are ignored, so a
    // page cannot fake "a login was sent". A submit counts when he has just clicked or typed on the page.
    const his = (e) => e.isTrusted && (!navigator.userActivation || navigator.userActivation.isActive);
    document.addEventListener('submit', (e) => { if (his(e)) sent(e.target); }, true);
    document.addEventListener('keydown', (e) => { if (e.isTrusted && e.key === 'Enter' && e.target instanceof HTMLInputElement && e.target.type === 'password') sent(e.target.form); }, true);
    document.addEventListener('click', (e) => { if (!e.isTrusted) return; const b = e.target instanceof Element ? e.target.closest('button, input[type=submit], [role=button]') : null; if (b) sent(b.form || b.closest('form')); }, true);
  }
} catch { /* no autofill on this page */ }

try {
  contextBridge.executeInMainWorld({
    func: () => {
      // Google's sign-in pages are left exactly as the browser is: hiding things there looks like a disguise, and
      // Google refuses disguised browsers (research, 2026-10-12). Its page handles passkeys itself.
      if (/^accounts\.(google|youtube)\.com$/i.test(location.hostname)) return;
      try { Object.defineProperty(window, 'PublicKeyCredential', { value: undefined, configurable: false, writable: false }); } catch { /* already gone */ }
      // FedCM (Chrome's built-in "Sign in with Google" prompt) has no screen in Electron and hangs like passkeys did.
      // Without it, Google's button falls back to its normal popup, which works (2026-10-12).
      try { Object.defineProperty(window, 'IdentityCredential', { value: undefined, configurable: false, writable: false }); } catch { /* already gone */ }
      const creds = navigator.credentials;
      if (creds) {
        const refuse = (orig) => function (opts) {
          if (opts && (opts.publicKey || opts.identity)) return Promise.reject(new DOMException('Passkeys are not available in this browser.', 'NotSupportedError'));
          return orig.apply(this, arguments);
        };
        try { creds.create = refuse(creds.create.bind(creds)); creds.get = refuse(creds.get.bind(creds)); } catch { /* read-only here */ }
      }
    },
  });
} catch { /* an older runtime: the page keeps its own credentials API */ }
