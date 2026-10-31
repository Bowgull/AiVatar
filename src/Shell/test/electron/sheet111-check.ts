// Sheet 111 BUILT (2026-10-31): "Claude's tabs are your tabs", checked for real. A Claude session's pages are real tabs
// in his window (in the background, never focused, out of his list, in Claude's group); a click on a row goes into the
// tab; the band there is sheet 109's (CLAUDE IS DRIVING, Take over, STOP); Take over holds that tab only while Claude
// works on in the others, and Claude is told; Hand back; a link wanting a new tab stays in Claude's tab; dragging a row
// into his tabs makes it his (Claude told, nothing more done there); STOP ALL keeps Claude's tabs, stops the job, and
// closing the group closes them. Pictures of the list and band go to <out-prefix>-*.png.
// Run (from src/Shell): perl -e 'alarm 200; exec @ARGV' node_modules/electron/dist/Electron.app/Contents/MacOS/Electron test/electron/sheet111-check.ts <out-prefix>
import { app, BrowserWindow, screen } from 'electron';
import https from 'node:https';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
process.on('uncaughtException', (e) => console.log('HARNESS NOTE ' + String((e as Error)?.message ?? e).split('\n')[0]));
process.on('unhandledRejection', (e) => { console.log('HARNESS REJECTION ' + String((e as Error)?.stack ?? e)); app.exit(2); });
setTimeout(() => { console.log('HARNESS TIMEOUT'); app.exit(3); }, 180_000).unref();
const HERE = path.dirname(fileURLToPath(import.meta.url));
const PORT = 47131;
const HOSTS = ['jobs.northwind.example', 'jobs.contoso.example', 'jobs.fabrikam.example'];
app.setPath('userData', mkdtempSync(path.join(os.tmpdir(), 's111c-ud-')));
app.commandLine.appendSwitch('disable-backgrounding-occluded-windows');
app.commandLine.appendSwitch('host-resolver-rules', HOSTS.map((h) => `MAP ${h}:443 127.0.0.1:${PORT}`).join(','));
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
const PAGE = (host: string, p: string) => `<!doctype html><title>${host.split('.')[1]} ${p}</title><body style="font:16px sans-serif;padding:40px">
  <h1>${host} ${p}</h1><p id="words">An open role at ${host}.</p><a id="more" href="/more">More</a>
  <button id="pop" onclick="window.open('https://${host}/popped')">Open in new tab</button></body>`;

let bad = 0;
const check = (what: string, ok: boolean, d = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${what}${d ? '  -- ' + String(d).replace(/\s+/g, ' ').slice(0, 220) : ''}`); if (!ok) bad++; };

app.whenReady().then(async () => {
  (screen as any).getCursorScreenPoint = () => ({ x: -20000, y: 500 });
  const out = process.argv[process.argv.length - 1];
  const cd = mkdtempSync(path.join(os.tmpdir(), 's111c-tls-'));
  execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', path.join(cd, 'k.pem'), '-out', path.join(cd, 'c.pem'), '-days', '2', '-subj', '/CN=jobs.example', '-addext', `subjectAltName=${HOSTS.map((h) => 'DNS:' + h).join(',')}`], { stdio: 'ignore' });
  const site = https.createServer({ key: readFileSync(path.join(cd, 'k.pem')), cert: readFileSync(path.join(cd, 'c.pem')) }, (q, r) => {
    r.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }).end(PAGE(String(q.headers.host ?? '').split(':')[0]!, (q.url ?? '/').split('?')[0]!));
  });
  await new Promise<void>((r) => site.listen(PORT, '127.0.0.1', () => r()));
  const { servePages } = await import('../../src/pageserver.ts');
  const { AangBrowser } = await import('../../src/browser.ts');
  const { wireBrowser } = await import('../../src/browseripc.ts');
  const pages = await servePages(path.join(HERE, '..', '..', 'pages'));
  const P = (f: string) => path.join(HERE, '..', '..', 'src', f);
  const b: any = new AangBrowser({ origin: pages.origin, preloadPath: P('preload.cjs'), tabPreloadPath: P('tabpreload.cjs'), settingsPreloadPath: P('settingspreload.cjs'), thingsPreloadPath: P('thingspreload.cjs'), stateDir: mkdtempSync(path.join(os.tmpdir(), 's111c-st-')), testLocal: true });
  wireBrowser(() => b);
  b.open(`https://${HOSTS[0]}/his`);
  for (let i = 0; i < 100 && !b.win; i++) await wait(150);
  b.win.setContentSize(1280, 760);
  for (let i = 0; i < 100 && !b.cur(); i++) await wait(150);
  await wait(2500);
  const fw = b.win.webContents;
  const his = b.cur().id;
  const tabsNow = () => b.tabs.map((t: any) => t.id);

  // ---- a Claude job opens three pages: real tabs, in the background.
  const job = (await b.drive('start', { kind: 'claude', name: 'Job scan' })).job;
  const before = tabsNow().length;
  const opened: any[] = [];
  for (const h of HOSTS) opened.push(await b.drive('open', { job, url: `https://${h}/jobs` }));
  check('open: each page answers with a page number', opened.every((o) => o.ok && Number.isInteger(o.page)), JSON.stringify(opened.map((o) => o.ok ? o.page : o.error)));
  check('open: three real tabs were made in his window', tabsNow().length === before + 3, `${before} -> ${tabsNow().length}`);
  check('open: his tab stays in front (never focused)', b.cur().id === his, String(b.cur().id));
  const tabOf = (page: number) => b.driver.page(page)?.borrowed?.tab;
  const [pA, pB, pC] = opened.map((o) => o.page);
  check('open: each page is a tab Claude owns', [pA, pB, pC].every((p) => b.driver.page(p)?.borrowed?.own === true && b.tabs.some((t: any) => t.id === tabOf(p) && t.claude)));
  const read = await b.drive('read', { page: pB });
  check('read: a background tab reads', read.ok === true && JSON.stringify(read).includes('An open role at jobs.contoso.example'), JSON.stringify(read).slice(0, 160));
  const pic = await b.drive('picture', { page: pC });
  check('picture: a background tab gives a picture', pic.ok === true && typeof pic.png === 'string' && pic.png.length > 1000, pic.error ?? String(pic.png?.length));

  // ---- the list: Claude's group holds them, his list does not.
  b.sendTabs(); await wait(600);
  b.tray(true, { x: 42, y: 62, hy: 80 });
  await wait(2500);
  const tv = b.trayV.webContents;
  const listed = async () => JSON.parse(await tv.executeJavaScript(`JSON.stringify({
    group: [...document.querySelectorAll('.drawer .tp.drv')].map((r) => ({ t: r.querySelector('.t').textContent, tab: r.dataset.tab, cls: r.className })),
    mine: [...document.querySelectorAll('.drawer .tp[data-tab]:not(.drv)')].map((r) => Number(r.dataset.tab)),
    stop: document.querySelector('.drawer .th.driver .stopk')?.textContent ?? null })`));
  let L = await listed();
  check('list: Claude\'s group has the three tabs, by their real names', L.group.length === 3 && L.group.every((g: any) => /jobs/.test(g.t) && g.tab), JSON.stringify(L.group));
  check('list: they are not in his own list', ![pA, pB, pC].some((p) => L.mine.includes(tabOf(p))) && L.mine.includes(his), JSON.stringify(L.mine));
  check('list: the rows breathe (Claude is driving)', L.group.every((g: any) => /by-claude/.test(g.cls) && !/held|idle/.test(g.cls)));
  writeFileSync(`${out}-list.png`, (await tv.capturePage()).toPNG());
  b.tray(false); await wait(800);

  // ---- a click on a row goes into the real tab: sheet 109's band.
  b.driverAct('show', pB); await wait(1500);
  check('show: the row\'s tab is now in front', b.cur().id === tabOf(pB), String(b.cur().id));
  const who = () => fw.executeJavaScript(`document.getElementById('who').hidden ? '(hidden)' : document.getElementById('who').textContent`);
  const w1 = await who();
  check('band: CLAUDE IS DRIVING, Take over, STOP', /CLAUDE IS DRIVING/.test(w1) && /Take over/.test(w1) && await fw.executeJavaScript(`!!document.querySelector('#who .stopk')`), w1);
  writeFileSync(`${out}-band.png`, (await fw.capturePage({ x: 0, y: 0, width: 1280, height: 120 })).toPNG());

  // ---- Take over: that tab only; Claude is told; the others go on.
  await fw.executeJavaScript(`document.querySelector('#who .takek').click(); 1`);
  await wait(1200);
  check('take over: YOU HAVE IT', (await who()).trim() === 'YOU HAVE IT', await who());
  const held = await b.drive('click', { page: pB, n: 1 });
  check('take over: Claude\'s clicks there are refused', held.ok === false && /Joshua has the tab/.test(held.error), held.error);
  const goes = await b.drive('read', { page: pA, job });
  check('take over: Claude reads its other tab', goes.ok === true, goes.error);
  check('take over: Claude is told, once, with its next step', Array.isArray(goes.news) && goes.news.some((n: string) => /took over page/.test(n) && /other pages keep going/.test(n)), JSON.stringify(goes.news));
  const again = await b.drive('read', { page: pA, job });
  check('take over: told only once', !again.news, JSON.stringify(again.news));
  b.sendTabs(); await wait(400);
  b.tray(true, { x: 42, y: 62, hy: 80 }); await wait(2000);
  L = await listed();
  const rowB = L.group.find((g: any) => Number(g.tab) === tabOf(pB));
  check('list: the row he has rests, with YOU HAVE IT', /held/.test(rowB?.cls ?? '') && await tv.executeJavaScript(`[...document.querySelectorAll('.drawer .tp.drv .dupchip.held')].length === 1`), rowB?.cls);
  check('list: STOP ALL? on the first press', await tv.executeJavaScript(`(() => { const s = document.querySelector('.drawer .th.driver .stopk'); s.click(); return s.textContent; })()`) === 'STOP ALL?');
  writeFileSync(`${out}-list-held.png`, (await tv.capturePage()).toPNG());
  b.tray(false); await wait(3500);   // the armed key times out
  check('STOP ALL?: one press stops nothing', b.driver.job(job).working === true);

  // ---- Hand back.
  const back = await b.drive('takeback', { page: pB });
  check('hand back: Claude gets the report', back.ok === true && !!back.report, JSON.stringify(back).slice(0, 160));
  check('hand back: Claude drives it again', (await b.drive('read', { page: pB })).ok === true);

  // ---- a link that wants a new tab stays in Claude's tab.
  const n0 = tabsNow().length;
  const wcA = b.driver.page(pA).wc;
  await wcA.executeJavaScript(`window.open('https://${HOSTS[0]}/popped'); 1`, true);
  await wait(2000);
  check('new tab from Claude\'s tab: no new tab, it opened in the same tab', tabsNow().length === n0 && /popped/.test(wcA.getURL()), `${n0} -> ${tabsNow().length} ${wcA.getURL()}`);

  // ---- drag out: his tab now.
  const tC = tabOf(pC);
  b.placeTabs([tC], null, null, null);
  await wait(500);
  check('drag out: the job let go of it', !b.driver.page(pC) && b.tabs.some((t: any) => t.id === tC && !t.claude), String(b.driver.page(pC)));
  const after = await b.drive('read', { page: pA, job });
  check('drag out: Claude is told it is his', Array.isArray(after.news) && after.news.some((n: string) => /took page \d+ for himself/.test(n)), JSON.stringify(after.news));
  const gone = await b.drive('read', { page: pC });
  check('drag out: nothing more is done there', gone.ok === false, JSON.stringify(gone));
  b.sendTabs(); await wait(400);
  b.tray(true, { x: 42, y: 62, hy: 80 }); await wait(2000);
  L = await listed();
  check('drag out: it is in his list, out of Claude\'s group', L.mine.includes(tC) && !L.group.some((g: any) => Number(g.tab) === tC), JSON.stringify(L));
  writeFileSync(`${out}-list-dropped.png`, (await tv.capturePage()).toPNG());
  b.tray(false); await wait(800);

  // ---- STOP ALL: the job stops; Claude's tabs stay, at rest; Claude's next step says to send a new plan.
  b.driverAct('stop', job); await wait(500);
  const st = await b.drive('open', { job, url: `https://${HOSTS[1]}/again` });
  check('STOP ALL: nothing more is done, and Claude is told to send a new plan', st.ok === false && /STOP ALL/.test(st.error) && /new plan/.test(st.error), st.error);
  check('STOP ALL: Claude\'s tabs stay for him to look at', b.tabs.some((t: any) => t.id === tabOf(pA)) && b.tabs.some((t: any) => t.id === tabOf(pB)));
  const js = await b.drive('jobstate', { job });
  check('jobstate: a stopped job says so (the connector frees the chat)', js.ok === true && js.live === false, JSON.stringify(js));
  b.sendTabs(); await wait(400);
  b.tray(true, { x: 42, y: 62, hy: 80 }); await wait(2000);
  L = await listed();
  check('STOP ALL: the rows rest', L.group.length === 2 && L.group.every((g: any) => /idle/.test(g.cls)), JSON.stringify(L.group));
  b.tray(false); await wait(800);
  const tA = tabOf(pA), tB = tabOf(pB);
  b.driverAct('close', job); await wait(800);
  check('closing the group closes Claude\'s tabs, never his', !b.tabs.some((t: any) => t.id === tA || t.id === tB) && b.tabs.some((t: any) => t.id === his) && b.tabs.some((t: any) => t.id === tC), JSON.stringify(tabsNow()));

  // ---- Aang's jobs keep their own hidden pages.
  const aj = (await b.drive('start', { kind: 'aang', name: 'Aang' })).job;
  const n1 = tabsNow().length;
  const ao = await b.drive('open', { job: aj, url: `https://${HOSTS[0]}/aang` });
  check('Aang: its page is a hidden one, as before', ao.ok === true && tabsNow().length === n1 && !!b.driver.page(ao.page)?.win, JSON.stringify(ao).slice(0, 120));

  console.log(bad ? `${bad} FAILED` : 'ALL PASS');
  site.close(); app.exit(bad ? 1 : 0);
});
