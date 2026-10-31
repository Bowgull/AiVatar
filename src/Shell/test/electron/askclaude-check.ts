// Sheet 109 BUILT (2026-10-30): "Claude in your tabs", checked for real. The right-click Ask Claude with its list of chats
// (the Mac's menu and the PC's, beside Send to Aang), the pick that reaches the chat (fenced, with a pass for the tab),
// Claude driving his own tab with Take over before STOP, YOU HAVE IT and the hand card, nothing acting under him, Your
// turn with Claude's one line, Hand back with his note, what Claude is told (names only), taking it back from the chat,
// and STOP ending a wait. Pictures of each frame go to <out-prefix>-*.png, to lay beside the sheet's.
// Run (from src/Shell): perl -e 'alarm 200; exec @ARGV' node_modules/electron/dist/Electron.app/Contents/MacOS/Electron test/electron/askclaude-check.ts <out-prefix>
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
const PORT = 47119;
app.setPath('userData', mkdtempSync(path.join(os.tmpdir(), 's109c-ud-')));
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

let bad = 0;
const check = (what: string, ok: boolean, d = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${what}${d ? '  -- ' + String(d).replace(/\s+/g, ' ').slice(0, 200) : ''}`); if (!ok) bad++; };
const CHATS = [{ id: 's1', name: 'Northwind posting' }, { id: 's2', name: 'Samara band fixes' }, { id: 's3', name: 'Couch Mode remote' }, { id: 's4', name: 'Weekend plans' }];

app.whenReady().then(async () => {
  (screen as any).getCursorScreenPoint = () => { const b = away(); return b ? { x: b.x + 300, y: b.y + 300 } : { x: -20000, y: 500 }; };
  const out = process.argv[process.argv.length - 1];
  const cd = mkdtempSync(path.join(os.tmpdir(), 's109c-tls-'));
  execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', path.join(cd, 'k.pem'), '-out', path.join(cd, 'c.pem'), '-days', '2', '-subj', '/CN=careers.northwind.example', '-addext', 'subjectAltName=DNS:careers.northwind.example'], { stdio: 'ignore' });
  const site = https.createServer({ key: readFileSync(path.join(cd, 'k.pem')), cert: readFileSync(path.join(cd, 'c.pem')) }, (q, r) => { const body = PAGES[(q.url ?? '/').split('?')[0]] ?? POSTING; r.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }).end(body); });
  await new Promise<void>((r) => site.listen(PORT, '127.0.0.1', () => r()));
  const U = (p: string) => `https://careers.northwind.example${p}`;
  const { servePages } = await import('../../src/pageserver.ts');
  const { AangBrowser } = await import('../../src/browser.ts');
  const { wireBrowser } = await import('../../src/browseripc.ts');
  const pages = await servePages(path.join(HERE, '..', '..', 'pages'));
  const P = (f: string) => path.join(HERE, '..', '..', 'src', f);
  const b: any = new AangBrowser({ origin: pages.origin, preloadPath: P('preload.cjs'), tabPreloadPath: P('tabpreload.cjs'), settingsPreloadPath: P('settingspreload.cjs'), thingsPreloadPath: P('thingspreload.cjs'), stateDir: mkdtempSync(path.join(os.tmpdir(), 's109c-st-')), testLocal: true });
  wireBrowser(() => b);
  let got: any = null;
  b.claudeChats = async () => CHATS;
  b.onAskClaude = async (s: string, t: string) => { got = { s, t }; return null; };
  b.open(U('/jobs/customer-success-lead'));
  for (let i = 0; i < 100 && !b.win; i++) await wait(150);
  b.win.setContentSize(1280, 760);
  await wait(5000);
  const fw = b.win.webContents;
  const tab = () => b.cur();
  const go = async (p: string) => { await tab().view.webContents.loadURL(U(p)); await wait(1500); };
  const pane = () => b.pane;
  // One whole picture: the page and the hand card (each its own layer) laid into the window under the band, then captured.
  const shot = async (name: string, h = 470) => {
    await fw.executeJavaScript(`document.activeElement?.blur(); document.querySelectorAll('.imgc').forEach((x) => x.remove()); 1`);
    const lay: any[] = [tab().view];
    const hv = pane().handV; if (hv && hv.getVisible()) lay.push(hv);
    for (const [i, v] of lay.entries()) {
      const r = v.getBounds(), pic = (await v.webContents.capturePage()).toDataURL();
      await fw.executeJavaScript(`(() => { const i = document.createElement('img'); i.className = 'imgc'; i.src = ${JSON.stringify(pic)};
        Object.assign(i.style, { position: 'fixed', zIndex: '${50 + i}', pointerEvents: 'none', left: '${r.x}px', top: '${r.y}px', width: '${r.width}px', height: '${r.height}px' }); document.body.append(i); return new Promise((ok) => i.decode().then(() => ok(1))); })()`);
    }
    for (const v of lay) v.setVisible(false);
    await wait(400);
    const sz = b.win.getContentSize();
    writeFileSync(`${out}-${name}.png`, (await fw.capturePage({ x: 0, y: 0, width: sz[0], height: Math.min(h, sz[1]) })).toPNG());
    for (const v of lay) v.setVisible(true);
    await fw.executeJavaScript(`document.querySelectorAll('.imgc').forEach((x) => x.remove()); 1`);
  };
  const who = () => fw.executeJavaScript(`document.getElementById('who').hidden ? '(hidden)' : document.getElementById('who').textContent`);
  const card = async () => { const v = pane().handV; if (!v || !v.getVisible()) return '(none)'; return v.webContents.executeJavaScript(`document.getElementById('hand').hidden ? '(hidden)' : document.getElementById('hand').innerText.replace(/\\s+/g, ' ')`); };
  const params = (sel: string) => ({ linkURL: '', srcURL: '', mediaType: 'none', selectionText: sel, isEditable: false, misspelledWord: '', dictionarySuggestions: [], editFlags: { canCut: false, canCopy: true, canPaste: false, canSelectAll: true }, x: 100, y: 100, linkText: '', altText: '', titleText: '' });
  const SEL = 'You will own a group of our biggest customers from the first call to renewal, keep them happy, and turn what they tell us into better products.';

  // ---- A and B: the right-click menu on a selection, the Mac's and the PC's, with Claude's list open beside it.
  for (const [frame, pc] of [['a', false], ['b', true]] as const) {
    b.onSendToAang = pc ? () => {} : null;
    b.pageMenu(tab(), params(SEL));
    await wait(1500);
    const m = b.menu;
    const items = await m.webContents.executeJavaScript(`[...document.querySelectorAll('#pm > *')].map((x) => x.classList.contains('sep') ? '|' : x.textContent).join(',')`);
    // The keys are the machine's own (2026-10-31: the Mac shows ⌘C, ⌥←, ⌘R; Windows CTRL C, ALT ←, CTRL R).
    const keys = process.platform === 'darwin' ? ['⌘C', '⌥←', '⌘R'] : ['CTRL C', 'ALT ←', 'CTRL R'];
    const rest = `Copy${keys[0]},Search for "You will own a group of our…",|,Back${keys[1]},Reload${keys[2]}`;
    check(`${frame.toUpperCase()}: the ${pc ? 'PC' : 'Mac'} menu`, items === (pc ? `Ask Claude,Send to Aang,|,${rest}` : `Ask Claude,|,${rest}`), items);
    await m.webContents.executeJavaScript(`document.querySelector('#pm button').dispatchEvent(new MouseEvent('mouseenter')); 1`);
    await wait(700);
    const sub = await m.webContents.executeJavaScript(`[...document.querySelectorAll('#pmsub > *')].map((x) => x.classList.contains('sep') ? '|' : x.textContent).join(',')`);
    check(`${frame.toUpperCase()}: Claude's list: last chat, three recent, New chat`, sub === 'Northwind posting,|,Samara band fixes,Couch Mode remote,Weekend plans,|,New chat', sub);
    const bnd = m.getBounds();
    check(`${frame.toUpperCase()}: the menu window grew to hold the list beside it`, bnd.width > 380, JSON.stringify(bnd));
    m.setOpacity(1); m.webContents.invalidate(); await wait(500);
    writeFileSync(`${out}-${frame}-menu.png`, (await m.webContents.capturePage()).toPNG());
    b.menuPick('');
    await wait(300);
  }
  b.onSendToAang = null;

  // ---- the pick reaches the chat: only the bit, the tab's name and address, fenced; a pass for that tab.
  b.pageMenu(tab(), params(SEL));
  await wait(1200);
  b.menuPick('ask0');
  await wait(400);
  check('Ask Claude: the pick went to the last chat', got?.s === 's1', String(got?.s));
  const t = got?.t ?? '';
  const pass = /pass: "([^"]+)"/.exec(t)?.[1] ?? '';
  check('Ask Claude: the words, the tab\'s name and address are inside the fence', /<page_words_[0-9a-f]+>[\s\S]*Customer Success Lead · Northwind[\s\S]*careers\.northwind\.example[\s\S]*You will own a group[\s\S]*<\/page_words_/.test(t), t.slice(0, 200));
  check('Ask Claude: nothing else from the page went', !t.includes('Run onboarding'), '');
  check('Ask Claude: the pass is good for that tab, and only that tab', b.passOk(pass, tab().id) && !b.passOk(pass, tab().id + 99) && !b.passOk('made-up', tab().id), pass);

  // ---- the pass: that chat reads the tab without his OK; without the pass he is asked.
  const job0 = (await b.drive('start', { kind: 'claude', name: 'Northwind posting' })).job;
  const look = await b.drive('look', { job: job0, tab: tab().id, pass });
  check('the pass: browser_look_tab reads his tab without asking', look.ok === true && Number.isInteger(look.page), JSON.stringify(look));
  const job1 = (await b.drive('start', { kind: 'claude', name: 'Another chat' })).job;
  const ask = await b.drive('look', { job: job1, tab: tab().id, pass: 'wrong' });
  check('no pass: he is asked', ask.needs === 'lever', JSON.stringify(ask));
  b.driver.finish(job0); b.driver.finish(job1);

  // ---- C: Claude drives his tab; Take over before STOP.
  const job = (await b.drive('start', { kind: 'claude', name: 'Northwind posting' })).job;
  const dt = await b.drive('drivetab', { job, tab: tab().id, allowed: true });
  const page = dt.page;
  b.sendTabs(); await wait(1200);
  const c = await who();
  check('C: CLAUDE IS DRIVING, Take over, STOP', c.includes('CLAUDE IS DRIVING') && c.includes('Take over') && await fw.executeJavaScript(`!!document.querySelector('#who .takek + .stopk, #who .stopk')`), c);
  check('C: Claude\'s gem in the band', await fw.executeJavaScript(`!!document.querySelector('#who .gem svg')`));
  check('C: no card while Claude drives', (await card()) === '(none)', await card());
  await shot('c-driving', 320);

  // ---- D: he presses Take over (the key in the band).
  await fw.executeJavaScript(`document.querySelector('#who .takek').click(); 1`);
  await wait(1500);
  const d = await who();
  check('D: YOU HAVE IT, no Take over or STOP', d.trim() === 'YOU HAVE IT', d);
  const dc = await card();
  check('D: the card hangs: YOU HAVE IT, the job\'s name, the note box and Hand back', /YOU HAVE IT/.test(dc) && /Northwind posting/i.test(dc) && /Hand back/.test(dc) && await pane().handV.webContents.executeJavaScript(`!document.getElementById('note').hidden`), dc);
  const cb = pane().handV.getBounds(), slot = await fw.executeJavaScript(`JSON.stringify(document.getElementById('slot').getBoundingClientRect())`);
  console.log('CARD LAYER ' + JSON.stringify(cb) + ' SLOT ' + slot);
  await shot('d-you', 320);
  // Nothing acts under him; reading still works.
  const clk = await b.drive('click', { page, n: 1 });
  check('held: a click waits for him ("Joshua has the tab")', clk.ok === false && /Joshua has the tab/.test(String(clk.error)), String(clk.error));
  const typ = await b.drive('scroll', { page, down: true });
  check('held: a scroll too', typ.ok === false && /Joshua has the tab/.test(String(typ.error)), String(typ.error));
  const rd = await b.drive('read', { page });
  check('held: reading is still fine', rd.ok === true, String(rd.error ?? ''));

  // He moves on to the form himself, fills a field and clicks Continue (real mouse and keys).
  await go('/apply/2');
  const wc = tab().view.webContents;
  const pos = async (i: number) => JSON.parse(await wc.executeJavaScript(`(() => { const e = document.querySelectorAll('input, button')[${i}]; const r = e.getBoundingClientRect(); return JSON.stringify({ x: Math.round(r.left + 20), y: Math.round(r.top + r.height / 2) }); })()`));
  const click = async (x: number, y: number) => { wc.sendInputEvent({ type: 'mouseDown', x, y, button: 'left', clickCount: 1 }); wc.sendInputEvent({ type: 'mouseUp', x, y, button: 'left', clickCount: 1 }); await wait(250); };
  const name = await pos(0);
  await click(name.x, name.y);
  for (const ch of 'Sam') { wc.sendInputEvent({ type: 'char', keyCode: ch }); await wait(40); }
  const phone = await pos(2);
  await click(phone.x, phone.y);
  for (const ch of '5') { wc.sendInputEvent({ type: 'char', keyCode: ch }); await wait(40); }
  const cont = await pos(3);
  await click(cont.x, cont.y);
  await wait(500);

  // ---- F: Hand back with his note, nobody waiting: the card shows what Claude is told; Claude hears it next step.
  await pane().handV.webContents.executeJavaScript(`document.getElementById('note').value = 'Use the short cover letter'; document.getElementById('back').click(); 1`);
  await wait(1200);
  const f = await who();
  check('F: Claude drives again after Hand back', f.includes('CLAUDE IS DRIVING') && f.includes('Take over'), f);
  const fc = await card();
  check('F: the card shows what Claude is told', /CLAUDE IS TOLD/.test(fc) && /What changed/.test(fc) && /PAGE/.test(fc) && /FILLED IN/.test(fc) && /YOUR NOTE/.test(fc), fc);
  await shot('f-told', 400);
  const nx = await b.drive('read', { page });
  const hb = nx.handback ?? {};
  check('F: Claude hears it with its next step', hb.page === page && /Use the short cover letter/.test(hb.his ?? ''), JSON.stringify(hb));
  check('F: field names, never what he typed', /Fields he filled \(names only\): Name, Phone/.test(hb.seen ?? '') && !/Sam\b|"5"/.test(hb.seen ?? ''), hb.seen);
  check('F: what he clicked, by its label', /What he clicked: Continue/.test(hb.seen ?? ''), hb.seen);
  check('F: told once', !(await b.drive('read', { page })).handback);

  // ---- E: Claude gives him the turn at a sign in, and waits.
  await wait(6000);
  check('F: the told card goes after a few seconds', (await card()) === '(none)', await card());
  await go('/signin');
  const turn = b.drive('yourturn', { page, why: 'Sign in here' });
  await wait(1500);
  const e = await who();
  check('E: YOU HAVE IT', e.trim() === 'YOU HAVE IT', e);
  const ec = await card();
  check('E: YOUR TURN, Claude\'s one line', /YOUR TURN/.test(ec) && /Sign in here/.test(ec) && /Hand back/.test(ec), ec);
  await shot('e-turn');
  await go('/apply/2');
  await pane().handV.webContents.executeJavaScript(`document.getElementById('note').value = 'Use the short cover letter'; 1`);
  await shot('e-note', 400);
  await pane().handV.webContents.executeJavaScript(`document.getElementById('back').click(); 1`);
  const tr = await turn;
  check('E: Hand back answers the wait, with his note', tr.ok === true && /Use the short cover letter/.test(tr.report?.his ?? ''), JSON.stringify(tr).slice(0, 200));

  // ---- Taking it back from the chat (browser_take_back).
  await wait(400);
  await fw.executeJavaScript(`document.querySelector('#who .takek').click(); 1`);
  await wait(800);
  check('take back: he had it', (await who()).trim() === 'YOU HAVE IT');
  const tb = await b.drive('takeback', { page });
  await wait(600);
  check('take back: Claude takes it, and is told what changed', tb.ok === true && typeof tb.report?.seen === 'string' && (await who()).includes('CLAUDE IS DRIVING'), JSON.stringify(tb).slice(0, 160));
  const tb2 = await b.drive('takeback', { page });
  check('take back: when he did not have it, it says so', tb2.none === true);

  // ---- STOP keeps its meaning: it ends Claude's job, and a wait for him ends with it.
  const w2 = b.drive('yourturn', { page, why: 'Stuck: pick a date' });
  await wait(800);
  b.driverAct('stop', job);
  const sr = await Promise.race([w2, wait(4000).then(() => ({ timeout: true }))]);
  check('STOP: the job ends, and the wait with it', (sr as any).ok === false && /STOP/.test(String((sr as any).error)), JSON.stringify(sr));
  await wait(600);
  check('STOP: the band and the card are clear', (await who()) === '(hidden)' && (await card()) === '(none)', `${await who()} / ${await card()}`);
  const yt = await b.drive('yourturn', { page: 9999, why: 'x' });
  check('Your turn only on his tab being driven', yt.ok === false, String(yt.error));

  console.log(bad ? `${bad} FAILED` : 'ALL PASS');
  site.close(); app.exit(bad ? 1 : 0);
});
