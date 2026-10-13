// 6.24 calls, spellcheck and screen sharing, checked with nothing on his screen (2026-10-13, his ask: "ensure the
// browser can use things like zoom and teams").
//
// Part 1 asks Electron itself the questions the browser's new code depends on, in a hidden window with a throwaway
// session: does a site's screen-share request reach our picker, do pictures and sound come back, does "may I use the
// camera?" answer yes only after he said yes, what does a site see when it asks which browser this is, and does
// spellcheck give suggestions. Part 2 drives the REAL browser frame (browser.html + preload) in an off-screen
// window: the share panel shows the screens and windows, Share is off until he picks, and his pick goes back.
//
// Run: npx electron test/electron/calls-check.ts <folder for pictures>
import { app, BrowserWindow, desktopCapturer, ipcMain, nativeImage, session } from 'electron';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { servePages } from '../../src/pageserver.ts';

process.on('uncaughtException', (e) => { console.log('HARNESS ERROR ' + (e as Error).stack); app.exit(2); });
process.on('unhandledRejection', (e) => { console.log('HARNESS REJECTION ' + String((e as Error)?.stack ?? e)); app.exit(2); });
setTimeout(() => { console.log('HARNESS TIMEOUT'); app.exit(3); }, 90_000).unref();

// Its own profile folder, so nothing here touches the running Aang's cookies or cache.
app.setPath('userData', mkdtempSync(path.join(os.tmpdir(), 'calls-check-')));
const HERE = path.dirname(fileURLToPath(import.meta.url));
const SHELL = path.resolve(HERE, '..', '..');
const OUT = path.resolve(process.argv[process.argv.length - 1] ?? os.tmpdir());
mkdirSync(OUT, { recursive: true });
const results: { step: string; ok: boolean }[] = [];
const check = (step: string, ok: boolean, detail = '') => { results.push({ step, ok }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${step}${detail ? '  -- ' + detail : ''}`); };
const info = (step: string, detail: string) => console.log(`INFO  ${step}  -- ${detail}`);
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const pageErrors: string[] = [];
// A plain 16:9 picture for the fake sources, so none of his real screen is ever written anywhere.
const THUMB = () => nativeImage.createFromBitmap(Buffer.alloc(16 * 9 * 4, 0x80), { width: 16, height: 9 }).toDataURL();

app.whenReady().then(async () => {
  const pages = await servePages(path.join(SHELL, 'pages'));

  // ================================================================== part 1: Electron's own behaviour
  const ses = session.fromPartition('calls-check-' + Date.now());
  ses.setUserAgent(`Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${process.versions.chrome} Safari/537.36`);
  let camOk = false;
  const asked: string[] = [];
  ses.setPermissionRequestHandler((_wc, p, done, d) => { asked.push(p + JSON.stringify(d)); done(p === 'display-capture' || (p === 'media' && (camOk || !(d as any).mediaTypes?.length))); });
  const checked: string[] = [];
  ses.setPermissionCheckHandler((_wc, p) => { checked.push(p); return (p === 'media' && camOk) || (process.env.CC_DC === '1' && p === 'display-capture'); });
  ses.on('spellcheck-dictionary-download-begin', (_e, l) => info('dictionary', 'download begin ' + l));
  ses.on('spellcheck-dictionary-download-success', (_e, l) => info('dictionary', 'download ok ' + l));
  ses.on('spellcheck-dictionary-download-failure', (_e, l) => info('dictionary', 'download FAILED ' + l));
  ses.on('spellcheck-dictionary-initialized', (_e, l) => info('dictionary', 'ready ' + l));
  let reached: { video: boolean; audio: boolean; gesture: boolean } | null = null;
  ses.setDisplayMediaRequestHandler((req, done) => {
    reached = { video: req.videoRequested, audio: req.audioRequested, gesture: req.userGesture };
    void desktopCapturer.getSources({ types: ['screen'] }).then((s) => done(s[0] ? { video: s[0], audio: 'loopback' } : null));
  });
  const w = new BrowserWindow({ width: 600, height: 400, show: false, webPreferences: { session: ses, sandbox: true, contextIsolation: true } });
  await w.loadURL(`${pages.origin}/hello.html`);
  const js = <T = any>(code: string): Promise<T> => w.webContents.executeJavaScript(code, true);

  const got = await js<string>(`navigator.mediaDevices.getDisplayMedia({ video: true, audio: true })
    .then((s) => { const k = s.getTracks().map((t) => t.kind).sort().join('+'); s.getTracks().forEach((t) => t.stop()); return k; })
    .catch((e) => 'ERROR ' + e.name + ': ' + e.message)`);
  info('permissions asked / checked', asked.join(',') + ' / ' + checked.join(','));
  check('a site asking to share the screen reaches our picker', reached !== null, JSON.stringify(reached));
  check('the picked screen comes back to the site as video', got.includes('video'), got);
  check('his computer sound comes back too when he ticks it', got.includes('audio'), got);
  const deniedShare = await (async () => {
    ses.setDisplayMediaRequestHandler((_r, done) => done(null));
    return js<string>(`navigator.mediaDevices.getDisplayMedia({ video: true }).then(() => 'shared').catch((e) => e.name)`);
  })();
  check('Cancel in the picker means nothing is shared', deniedShare !== 'shared', deniedShare);

  const q = () => js<string>(`navigator.permissions.query({ name: 'camera' }).then((r) => r.state).catch((e) => 'ERROR ' + e.message)`);
  const before = await q();
  camOk = true;
  const after = await q();
  info('a call asking "may I use the camera?" before he said yes', before);
  check('after he said yes on that site, the call is told yes', after === 'granted', after);
  const cam = await js<string>(`navigator.mediaDevices.enumerateDevices().then((d) => d.length + ' devices, labels ' + (d.some((x) => x.label) ? 'shown' : 'hidden'))`);
  info('devices the call can list after the yes', cam);

  const who = await js<any>(`({ ua: navigator.userAgent, brands: navigator.userAgentData ? navigator.userAgentData.brands.map((b) => b.brand + ' ' + b.version) : null, mobile: navigator.userAgentData?.mobile })`);
  info('what a site sees: user agent', who.ua);
  info('what a site sees: browser brands', JSON.stringify(who.brands));
  check('sites see a Chrome user agent', /Chrome\/\d+/.test(who.ua) && !/Electron|aang/i.test(who.ua), who.ua);

  // Spellcheck: Canadian English, a wrong word, and the right-click suggestions.
  const langs = ses.availableSpellCheckerLanguages;
  check('Canadian English spellcheck is available', langs.includes('en-CA'), langs.filter((l) => l.startsWith('en')).join(' '));
  ses.setSpellCheckerLanguages(['en-CA', 'en-US']);
  ses.setSpellCheckerEnabled(true);
  await w.loadURL('data:text/html,<body style="margin:0"><textarea id="t" style="position:fixed;left:10px;top:10px;width:400px;height:80px;font:16px sans-serif" spellcheck="true"></textarea></body>');
  await js(`document.getElementById('t').focus(); true`);
  w.webContents.insertText('I recieve the colour ');
  await wait(6000); // the first time, Chromium fetches the word list
  const menu = new Promise<Electron.ContextMenuParams | null>((res) => { w.webContents.once('context-menu', (_e, p) => res(p)); setTimeout(() => res(null), 4000); });
  w.webContents.sendInputEvent({ type: 'mouseDown', x: 40, y: 22, button: 'right', clickCount: 1 });
  w.webContents.sendInputEvent({ type: 'mouseUp', x: 40, y: 22, button: 'right', clickCount: 1 });
  const p = await menu;
  info('menu', p ? JSON.stringify({ editable: p.isEditable, sel: p.selectionText, x: p.x, y: p.y }) : 'none');
  check('right-clicking a misspelled word knows it is wrong', !!p?.misspelledWord, p ? `word "${p.misspelledWord}"` : 'no menu');
  check('and offers the right spelling', !!p?.dictionarySuggestions.includes('receive'), p ? p.dictionarySuggestions.join(', ') : '');
  w.hide(); // (destroying a window here made the next page fail to load; it closes with the run)

  // ================================================================== part 2: the real share panel
  const said: { ch: string; a: any }[] = [];
  ipcMain.on('browser:sharereply', (_e, a) => said.push({ ch: 'sharereply', a }));
  const b = new BrowserWindow({ width: 1100, height: 700, show: false, frame: false,
    webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false, offscreen: true, preload: path.join(SHELL, 'src', 'preload.cjs') } });
  b.webContents.on('console-message', (_e, level, message) => { if (level >= 3) pageErrors.push(message); });
  b.webContents.on('did-fail-load', (_e, code, desc, url) => info('browser.html load', `${code} ${desc} ${url}`));
  b.webContents.on('did-navigate', (_e, url) => info('browser.html navigated', url));
  await b.loadURL(`${pages.origin}/browser.html`).catch((e) => info('browser.html loadURL', String(e)));
  await wait(400);
  const bjs = <T = any>(code: string): Promise<T> => b.webContents.executeJavaScript(code, true);
  const sources = [
    { id: 'screen:0:0', name: 'Screen 1', kind: 'screen', thumb: THUMB() },
    { id: 'window:111:0', name: 'Microsoft Teams - Weekly sync', kind: 'window', thumb: THUMB() },
    { id: 'window:222:0', name: 'Notepad', kind: 'window', thumb: THUMB() },
    { id: 'window:333:0', name: 'A window with a very long name that has to be cut off neatly at the end', kind: 'window', thumb: THUMB() },
  ];
  b.webContents.send('browser:share', { id: 7, host: 'teams.microsoft.com', audio: true, sources });
  await wait(300);
  const shown = await bjs<any>(`({ hidden: document.getElementById('sharechip').hidden, q: document.getElementById('shareq').textContent,
    screens: document.querySelectorAll('#sharescreens .stile').length, wins: document.querySelectorAll('#sharewins .stile').length,
    sound: !document.getElementById('sharesoundrow').hidden, off: document.getElementById('shareyes').disabled,
    wide: Math.round(document.getElementById('sharechip').getBoundingClientRect().width), right: Math.round(document.getElementById('sharechip').getBoundingClientRect().right) })`);
  check('the share panel hangs from the band', shown.hidden === false, shown.q);
  check('it shows the screens and the windows apart', shown.screens === 1 && shown.wins === 3, `${shown.screens} screen, ${shown.wins} windows`);
  check('the sound choice shows because the call asked for sound', shown.sound === true);
  check('Share is off until he picks one', shown.off === true);
  check('the panel fits inside the window', shown.right <= 1100, `${shown.wide} wide, ends at ${shown.right}`);
  writeFileSync(path.join(OUT, 'share-panel.png'), (await b.webContents.capturePage()).toPNG());
  await bjs(`document.querySelectorAll('#sharewins .stile')[0].click(); document.getElementById('sharesound').click(); true`);
  const picked = await bjs<any>(`({ on: !document.getElementById('shareyes').disabled, pressed: document.querySelectorAll('.stile[aria-pressed="true"]').length })`);
  check('picking a window turns Share on and marks only that one', picked.on && picked.pressed === 1);
  writeFileSync(path.join(OUT, 'share-picked.png'), (await b.webContents.capturePage()).toPNG());
  await bjs(`document.getElementById('shareyes').click(); true`);
  await wait(200);
  const r = said.at(-1)?.a;
  check('Share sends back exactly his pick and his sound choice', r?.id === 7 && r?.source === 'window:111:0' && r?.sound === true, JSON.stringify(r));
  check('the panel closes after Share', await bjs<boolean>(`document.getElementById('sharechip').hidden`));
  b.webContents.send('browser:share', { id: 8, host: 'zoom.us', audio: false, sources });
  await wait(200);
  const noSound = await bjs<boolean>(`document.getElementById('sharesoundrow').hidden`);
  check('no sound choice when the call did not ask for sound', noSound === true);
  b.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Escape' });
  b.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Escape' });
  await wait(200);
  const esc = said.at(-1)?.a;
  check('Esc cancels and shares nothing', esc?.id === 8 && esc?.source === null, JSON.stringify(esc));

  check('no page errors', pageErrors.length === 0, pageErrors.slice(0, 3).join(' | '));
  const failed = results.filter((x) => !x.ok);
  console.log(`\n${results.length - failed.length}/${results.length} passed`);
  pages.close?.();
  app.exit(failed.length ? 1 : 0);
});
