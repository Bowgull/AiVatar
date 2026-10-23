// A stand-in for settingspreload.cjs in settings83-check: his real values, and a record of what the page sends.
const { contextBridge } = require('electron');
const sent = [];
let data = { home: '', homeNow: 'https://search.brave.com/', search: 'brave', aiBox: false, startup: 'tabs', ads: true, popups: true, sounds: true, dark: true, tabSize: 'm',
  trusted: [], httpOk: [], sites: [], marks: [], markCount: 0, vault: 'locked', phish: 123456, afSounds: true, lockAfter: '30m',
  autofill: { details: { name: '', emails: [], phone: '', street: '', city: '', region: '', postal: '', country: '' }, pin: false, pinLen: 0, sounds: true },
  versions: { electron: '44.9.3', chrome: '152.0.0.0' }, mac: true };
let onData = null;
contextBridge.exposeInMainWorld('settings', {
  get: async () => data,
  set: (key, value) => { sent.push({ key, value }); },
  remove: () => {}, siteRule: () => {}, siteClear: () => {},
  act: (a) => sent.push({ act: a }),
  lookup: async (q) => (String(q).length >= 4 ? [
    { line: '100 Queen Street West, Toronto, Ontario', street: '100 Queen Street West', city: 'Toronto', region: 'Ontario', postal: 'M5H 2N2', country: 'Canada' },
    { line: '100 Queen Street, Ottawa, Ontario', street: '100 Queen Street', city: 'Ottawa', region: 'Ontario', postal: 'K1P 1J9', country: 'Canada' }] : []),
  onData: (fn) => { onData = fn; }, onAfPin: () => {}, onSection: () => {},
});
contextBridge.exposeInMainWorld('__sent', () => JSON.stringify(sent));
