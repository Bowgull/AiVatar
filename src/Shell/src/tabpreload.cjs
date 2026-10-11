// 6.22: the only script a browser tab gets, and it exposes NOTHING to the page: no doors, no ipc.
//
// Its one job is passkeys. In Electron on Windows a site sees passkey support, shows its passkey button,
// and the call then never settles: no Windows Security dialog, no error, the page just hangs (research,
// "Aang browser daily driver/passwords_and_passkeys.md"). Telling the page there are no passkeys makes a
// well-built site fall back to a password and a code instead. Plain CommonJS, like preload.cjs.
const { contextBridge } = require('electron');

try {
  contextBridge.executeInMainWorld({
    func: () => {
      try { Object.defineProperty(window, 'PublicKeyCredential', { value: undefined, configurable: false, writable: false }); } catch { /* already gone */ }
      const creds = navigator.credentials;
      if (creds) {
        const refuse = (orig) => function (opts) {
          if (opts && opts.publicKey) return Promise.reject(new DOMException('Passkeys are not available in this browser.', 'NotSupportedError'));
          return orig.apply(this, arguments);
        };
        try { creds.create = refuse(creds.create.bind(creds)); creds.get = refuse(creds.get.bind(creds)); } catch { /* read-only here */ }
      }
    },
  });
} catch { /* an older runtime: the page keeps its own credentials API */ }
