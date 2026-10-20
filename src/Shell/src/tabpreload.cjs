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
  const asked = ipcRenderer.sendSync('tab:mayplay') || {};
  const ok = asked.ok !== false;
  let shown = asked.shown !== false;
  const held = new Set();
  ipcRenderer.on('tab:shown', (_e, v) => {
    shown = v !== false;
    if (!shown) { held.clear(); return; }
    for (const m of held) { try { m.play().catch(() => {}); } catch { /* gone */ } }
    held.clear();
  });
  window.addEventListener('play', (e) => {
    const m = e.target;
    if (!(m instanceof HTMLMediaElement)) return;
    const ua = navigator.userActivation;
    if (ua && ua.isActive) return;                                  // he just clicked or pressed a key: his
    const his = !m.muted && (ok || (ua && ua.hasBeenActive));       // sound he asked for on this page
    if (his && shown) return;
    if (his) held.add(m);                                           // opened behind: plays when he goes to it
    try { m.pause(); } catch { /* gone */ }
  }, true);
} catch { /* no Shell to ask: the page plays as it would anywhere */ }

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
