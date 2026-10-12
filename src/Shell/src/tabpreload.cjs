// 6.22: the only script a browser tab gets, and it exposes NOTHING to the page: no doors. It sends one fixed
// message of its own, "painted", when the page first draws (2026-10-12, the soft fade between pages); the page
// cannot reach it or put anything in it.
//
// Its one job is passkeys. In Electron on Windows a site sees passkey support, shows its passkey button,
// and the call then never settles: no Windows Security dialog, no error, the page just hangs (research,
// "Aang browser daily driver/passwords_and_passkeys.md"). Telling the page there are no passkeys makes a
// well-built site fall back to a password and a code instead. Plain CommonJS, like preload.cjs.
const { contextBridge, ipcRenderer } = require('electron');

try {
  let said = false;
  const po = new PerformanceObserver((list) => {
    if (said) return;
    if (list.getEntries().some((e) => e.name === 'first-contentful-paint' || e.name === 'first-paint')) { said = true; po.disconnect(); ipcRenderer.send('tab:painted'); }
  });
  po.observe({ type: 'paint', buffered: true });
} catch { /* no paint timing here: the Shell falls back to the page finishing */ }

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
