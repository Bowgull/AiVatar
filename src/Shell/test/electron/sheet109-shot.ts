// Sheet 109 (2026-10-30, his decisions): Claude in his own tabs. He talks to Claude in the Claude app; Samara adds
// pointing (right-click Ask Claude) and handover (Take over, Your turn, Hand back). The band in every frame is Samara's
// REAL band with a made-up job posting in his own tab (Northwind, a neutral example); Claude really borrows the tab
// (driver.borrow, drive on), so CLAUDE IS DRIVING and STOP are Samara's own. The new pieces (Take over, YOU HAVE IT,
// the hand-back card, what Claude is told) are laid on with Samara's own classes: the plan card's tray (upx), its note
// box (plannote) and keys. Nothing is built.
// Run (from src/Shell): perl -e 'alarm 150; exec @ARGV' node_modules/electron/dist/Electron.app/Contents/MacOS/Electron test/electron/sheet109-shot.ts <out-prefix>
import { app, BrowserWindow, screen } from 'electron';
import https from 'node:https';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
process.on('uncaughtException', (e) => console.log('HARNESS NOTE ' + String((e as Error)?.message ?? e).split('\n')[0]));
process.on('unhandledRejection', (e) => { console.log('HARNESS REJECTION ' + String((e as Error)?.stack ?? e)); app.exit(2); });
setTimeout(() => { console.log('HARNESS TIMEOUT'); app.exit(3); }, 140_000).unref();
const HERE = path.dirname(fileURLToPath(import.meta.url));
const PORT = 47109;
app.setPath('userData', mkdtempSync(path.join(os.tmpdir(), 's109-ud-')));
app.commandLine.appendSwitch('disable-backgrounding-occluded-windows');
// The made-up site has a real-looking name in the address bar; it is served from this computer.
app.commandLine.appendSwitch('host-resolver-rules', `MAP careers.northwind.example:443 127.0.0.1:${PORT}`);
// Samara only opens his tabs on https, so the made-up site has a throwaway certificate, made here and trusted only here.
app.commandLine.appendSwitch('ignore-certificate-errors');
app.on('window-all-closed', () => {});
// His rule (2026-10-29): test windows never touch his main monitor or take his keyboard.
const away = () => { const d = screen.getAllDisplays().find((x) => x.id !== screen.getPrimaryDisplay().id); return d ? d.bounds : null; };
BrowserWindow.prototype.show = function (this: BrowserWindow) { const b = away(); if (b) this.setPosition(b.x + 20, b.y + 20); this.setOpacity(0); this.setFocusable(false); this.showInactive(); };
BrowserWindow.prototype.focus = function () {};
BrowserWindow.prototype.moveTop = function () {};
BrowserWindow.prototype.setAlwaysOnTop = function () {};
app.focus = () => {};
app.dock?.hide();
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

const SHELL = (title: string, body: string) => `<!doctype html><title>${title}</title><body style="margin:0;font:16px/1.55 -apple-system,Segoe UI,Helvetica,Arial,sans-serif;background:#fff;color:#1d2433">
  <div style="height:64px;display:flex;align-items:center;gap:12px;padding:0 64px;border-bottom:1px solid #e4e7ee">
    <div style="width:28px;height:28px;border-radius:6px;background:#2f6f62"></div><b style="font-size:19px;letter-spacing:.2px">Northwind</b>
    <span style="margin-left:auto;color:#5b6475;font-size:14px">Careers</span></div>
  <div style="padding:36px 64px;max-width:760px">${body}</div></body>`;
const POSTING = SHELL('Customer Success Lead · Northwind', `
  <div style="color:#2f6f62;font-weight:600;font-size:14px">Customer Success · Remote</div>
  <h1 style="margin:6px 0 18px;font-size:34px">Customer Success Lead</h1>
  <h3 style="margin:0 0 6px">About the role</h3>
  <p id="sel" style="margin:0 0 18px;color:#3a4252">You will own a group of our biggest customers from the first call to renewal, keep them happy, and turn what they tell us into better products.</p>
  <h3 style="margin:0 0 6px">What you will do</h3>
  <ul style="margin:0 0 18px;color:#3a4252;padding-left:20px"><li>Run onboarding for new teams</li><li>Check in every month and spot trouble early</li><li>Work with sales and support on renewals</li></ul>
  <button style="font:600 16px inherit;background:#2f6f62;color:#fff;border:0;border-radius:8px;padding:12px 26px">Apply now</button>`);
const LOGIN = SHELL('Sign in · Northwind', `
  <h1 style="margin:0 0 6px;font-size:28px">Sign in to apply</h1>
  <p style="margin:0 0 22px;color:#5b6475">Customer Success Lead</p>
  <label style="display:block;font-weight:600;font-size:14px;margin:0 0 6px">Email</label>
  <input style="display:block;width:360px;font:16px inherit;padding:10px 12px;border:1px solid #c9cfda;border-radius:8px;margin:0 0 16px">
  <label style="display:block;font-weight:600;font-size:14px;margin:0 0 6px">Password</label>
  <input type="password" style="display:block;width:360px;font:16px inherit;padding:10px 12px;border:1px solid #c9cfda;border-radius:8px;margin:0 0 22px">
  <button style="font:600 16px inherit;background:#2f6f62;color:#fff;border:0;border-radius:8px;padding:12px 26px">Sign in</button>`);
const F = (l: string, v: string) => `<label style="display:block;font-weight:600;font-size:14px;margin:0 0 6px">${l}</label><input value="${v}" style="display:block;width:360px;font:16px inherit;padding:10px 12px;border:1px solid #c9cfda;border-radius:8px;margin:0 0 16px">`;
const APPLY = SHELL('Apply · Northwind', `
  <div style="color:#2f6f62;font-weight:600;font-size:14px">Step 2 of 4</div>
  <h1 style="margin:6px 0 20px;font-size:28px">Your details</h1>${F('Name', 'Alex')}${F('Email', 'alex@example.com')}${F('Phone', '555-0142')}
  <button style="font:600 16px inherit;background:#2f6f62;color:#fff;border:0;border-radius:8px;padding:12px 26px">Continue</button>`);
const PAGES: Record<string, string> = { '/jobs/customer-success-lead': POSTING, '/signin': LOGIN, '/apply/2': APPLY };

// The new pieces, in Samara's own classes. Claude's mark is the white gem with its orange spark (sheet 106).
const GEM = `<svg viewBox="0 0 11 11" width="22" height="22" shape-rendering="crispEdges" aria-hidden="true"><path d="M3 0h5v1H3zM1 1h2v1H1zM8 1h2v1H8zM0 3h1v5H0zM10 3h1v5H10zM1 2h1v1H1zM9 2h1v1H9zM1 8h1v1H1zM9 8h1v1H9zM1 9h2v1H1zM8 9h2v1H8zM3 10h5v1H3z" fill="#120A05"/><path d="M3 1h5v1H3zM2 2h7v1H2zM1 3h9v5H1zM2 8h7v1H2zM3 9h5v1H3z" fill="#F6F2EA"/><path d="M3 1h3v1H3zM2 2h2v1H2zM1 3h1v2H1z" fill="#ffffff"/><path d="M8 8h1v1H8zM6 9h2v1H6zM9 6h1v2H9z" fill="#cfc6b6"/><path d="M5 2h1v2H5zM5 7h1v2H5zM2 5h2v1H2zM7 5h2v1H7zM3 3h1v1H3zM7 3h1v1H7zM3 7h1v1H3zM7 7h1v1H7zM4 4h3v3H4z" fill="#D97757"/></svg>`;
const NEW_CSS = `
  .slot .who .gem109{display:grid;place-items:center;width:22px;height:22px;margin:-2px 0}
  .slot .who .gem109 svg{image-rendering:pixelated}
  .tk109{order:3;height:24px;margin-left:4px;padding:0 9px;border-radius:6px;border:2.5px solid var(--outline);cursor:pointer;position:relative;top:-1px;
    font:700 12px Figtree,system-ui,sans-serif;letter-spacing:.2px;color:#2a1c00;background:var(--gold);
    box-shadow:0 3px 0 var(--outline),inset 0 2px 0 var(--gold-light);display:inline-flex;align-items:center}
  .slot .who.you109{color:#cfe7ff}
  .img109{position:fixed;z-index:1;image-rendering:auto;pointer-events:none}
  .t109.dltray.uptray.upx{position:fixed;right:auto;z-index:50;animation:none;width:330px}
  .t109 .uphd .gem109{flex:none;width:44px;height:44px;display:grid;place-items:center}
  .t109 .uphd .gem109 svg{width:44px;height:44px;image-rendering:pixelated}
  .t109 .plannote{display:block;height:auto;min-height:0;font:500 13px var(--body);color:#2a1c0c;background:#f6e9cc}
  .t109 .plannote::placeholder{color:#8c7556}
  .t109 .uplist .v{font:600 13px/1.35 var(--body);color:#2a1c0c;margin:0 0 4px}
  .t109 .uplist .grp:first-child{margin-top:0}`;
const GROUND = (kind: 'driving' | 'you') => `(() => {
  const who = document.getElementById('who'); window.__o109?.disconnect();
  window.__stop109 = window.__stop109 || document.querySelector('#who .stopk')?.outerHTML || '';
  const html = ${JSON.stringify(`<span class="gem109">${GEM}</span>`)} + (${JSON.stringify(kind)} === 'driving'
    ? 'CLAUDE IS DRIVING<button class="tk109" type="button">Take over</button>' + window.__stop109 : 'YOU HAVE IT');
  const put = () => { o.disconnect(); who.hidden = false; who.classList.toggle('you109', '${kind}' === 'you'); who.innerHTML = html; o.observe(who, { childList: true, attributes: true }); };
  const o = new MutationObserver(put); window.__o109 = o; put(); return 1; })()`;
// The hand-back card: the plan card's own tray, hung under the address bar's end, where the label is.
const CARD = (o: { kick: string; title: string; note?: string; list?: [string, string][]; keys?: string[] }) => `(() => {
  document.getElementById('t109')?.remove();
  const s = document.getElementById('slot').getBoundingClientRect();
  const n = document.createElement('div'); n.id = 't109'; n.className = 'dltray uptray upx t109';
  n.innerHTML = ${JSON.stringify(`<div class="caps"></div><div class="uphd"><span class="gem109">${GEM}</span>`)} + '<div class="t"><small>${o.kick}</small><b>${o.title}</b></div></div>'
    + ${JSON.stringify(o.list ? `<div class="uplist">${o.list.map(([g, v]) => `<div class="grp">${g}</div><div class="v">${v}</div>`).join('')}</div>` : '')}
    + ${JSON.stringify(o.note !== undefined ? `<textarea class="plannote" rows="2" maxlength="300" placeholder="A note for Claude">${o.note}</textarea>` : '')}
    + ${JSON.stringify(o.keys ? `<div class="upfoot">${o.keys.map((k, i) => `<button class="key ${i === 0 ? 'primary ' : ''}sm" type="button">${k}</button>`).join('')}</div>` : '')};
  document.body.append(n);
  const w = n.getBoundingClientRect().width;
  n.style.left = Math.round(s.right - w - 4) + 'px'; n.style.top = Math.round(s.bottom + 18) + 'px';
  return 1; })()`;

app.whenReady().then(async () => {
  (screen as any).getCursorScreenPoint = () => ({ x: -20000, y: 500 });
  const out = process.argv[process.argv.length - 1];
  const cd = mkdtempSync(path.join(os.tmpdir(), 's109-tls-'));
  execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', path.join(cd, 'k.pem'), '-out', path.join(cd, 'c.pem'), '-days', '2', '-subj', '/CN=careers.northwind.example', '-addext', 'subjectAltName=DNS:careers.northwind.example'], { stdio: 'ignore' });
  const site = https.createServer({ key: readFileSync(path.join(cd, 'k.pem')), cert: readFileSync(path.join(cd, 'c.pem')) }, (q, r) => { const body = PAGES[(q.url ?? '/').split('?')[0]] ?? POSTING; r.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }).end(body); });
  await new Promise<void>((r) => site.listen(PORT, '127.0.0.1', () => r()));
  const U = (p: string) => `https://careers.northwind.example${p}`;
  const { servePages } = await import('../../src/pageserver.ts');
  const { AangBrowser } = await import('../../src/browser.ts');
  const { wireBrowser } = await import('../../src/browseripc.ts');
  const pages = await servePages(path.join(HERE, '..', '..', 'pages'));
  const P = (f: string) => path.join(HERE, '..', '..', 'src', f);
  const b: any = new AangBrowser({ origin: pages.origin, preloadPath: P('preload.cjs'), tabPreloadPath: P('tabpreload.cjs'), settingsPreloadPath: P('settingspreload.cjs'), thingsPreloadPath: P('thingspreload.cjs'), stateDir: mkdtempSync(path.join(os.tmpdir(), 's109-st-')), testLocal: true });
  wireBrowser(() => b);
  b.open(U('/jobs/customer-success-lead'));
  for (let i = 0; i < 100 && !b.win; i++) await wait(150);
  b.win.setContentSize(1280, 760);
  await wait(5000);
  const fw = b.win.webContents;
  await fw.insertCSS(NEW_CSS);
  const tab = () => b.cur();
  const go = async (p: string) => { await tab().view.webContents.loadURL(U(p)); await wait(1500); };
  // One whole picture: the page's own capture laid into the window under the band, then the window captured.
  const shot = async (name: string, h = 470) => {
    await fw.executeJavaScript(`document.activeElement?.blur(); document.querySelectorAll('.img109').forEach((x) => x.remove()); 1`);
    const v = tab().view, r = v.getBounds();
    const pic = (await v.webContents.capturePage()).toDataURL();
    await fw.executeJavaScript(`(() => { const i = document.createElement('img'); i.className = 'img109'; i.src = ${JSON.stringify(pic)};
      Object.assign(i.style, { left: '${r.x}px', top: '${r.y}px', width: '${r.width}px', height: '${r.height}px' }); document.body.append(i); return new Promise((ok) => i.decode().then(() => ok(1))); })()`);
    v.setVisible(false); await wait(400);
    const sz = b.win.getContentSize();
    writeFileSync(`${out}-${name}.png`, (await fw.capturePage({ x: 0, y: 0, width: sz[0], height: Math.min(h, sz[1]) })).toPNG());
    v.setVisible(true);
    await fw.executeJavaScript(`document.querySelectorAll('.img109').forEach((x) => x.remove()); 1`);
    console.log('SHOT ' + name + ' page at ' + JSON.stringify(r));
  };

  // A and B: his tab at rest, a section of the posting selected (the menus are drawn on the sheet in pagemenu.css).
  await tab().view.webContents.executeJavaScript(`(() => { const r = document.createRange(); r.selectNodeContents(document.getElementById('sel')); const s = getSelection(); s.removeAllRanges(); s.addRange(r); return 1; })()`);
  // A narrower window for A and B, so two menus sit side by side on the sheet with the whole band in each.
  b.win.setContentSize(680, 600); await wait(1800);
  const end = await tab().view.webContents.executeJavaScript(`(() => { const rs = getSelection().getRangeAt(0).getClientRects(); const r = rs[rs.length - 1]; return JSON.stringify({ x: Math.round(r.right), y: Math.round(r.bottom) }); })()`);
  console.log('SELECTION END (page) ' + end + ' view ' + JSON.stringify(tab().view.getBounds()));
  await shot('select', 600);
  b.win.setContentSize(1280, 760); await wait(1800);
  await tab().view.webContents.executeJavaScript(`getSelection().removeAllRanges(); 1`);

  // C: Claude drives his tab (the real borrow), with Take over before STOP.
  const s = await b.drive('start', { kind: 'claude', name: 'Northwind posting' });
  const job = b.driver.job(s.job); job.working = true;
  b.driver.borrow(s.job, tab().view.webContents, tab().id, true);
  b.sendTabs(); await wait(1800);
  console.log('WHO ' + await fw.executeJavaScript(`document.getElementById('who').hidden + ' ' + document.getElementById('who').textContent`));
  await fw.executeJavaScript(GROUND('driving')); await wait(300);
  await shot('c-driving', 320);

  // D: he pressed Take over. YOU HAVE IT; the plan card's tray hangs from it with the note box and Hand back.
  await fw.executeJavaScript(GROUND('you'));
  await fw.executeJavaScript(CARD({ kick: 'YOU HAVE IT', title: 'Northwind posting', note: '', keys: ['Hand back'] })); await wait(300);
  await shot('d-you', 320);

  // E: Claude reached the sign in and gives him the turn, with its one line.
  await fw.executeJavaScript(`document.getElementById('t109')?.remove(); 1`);
  await go('/signin');
  await fw.executeJavaScript(GROUND('you'));
  await fw.executeJavaScript(CARD({ kick: 'YOUR TURN', title: 'Sign in here', note: '', keys: ['Hand back'] })); await wait(300);
  await shot('e-turn');

  // E2: the same card with his short note typed in, just before Hand back.
  await go('/apply/2');
  await fw.executeJavaScript(GROUND('you'));
  await fw.executeJavaScript(CARD({ kick: 'YOUR TURN', title: 'Sign in here', note: 'Use the short cover letter', keys: ['Hand back'] })); await wait(300);
  await shot('e-note', 400);

  // F: handed back. Claude drives again, and the card shows what Claude was told.
  await fw.executeJavaScript(GROUND('driving'));
  await fw.executeJavaScript(CARD({ kick: 'CLAUDE IS TOLD', title: 'What changed', list: [['PAGE', 'Apply, step 2 of 4'], ['FILLED IN', 'Email, Name, Phone'], ['CLICKED', 'Sign in, Continue'], ['YOUR NOTE', 'Use the short cover letter']] })); await wait(300);
  await shot('f-told', 400);

  site.close(); app.exit(0);
});
