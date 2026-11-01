// Sheet 115 (his picks, 2026-10-31): Claude's work survives a restart, checked in real Samara, in two runs on one state
// folder. Run A: a Claude job opens two real tabs, typing goes into an application form, then Samara is killed outright
// (a crash, the hardest case: nothing gets to save on the way out). Run B: Samara starts again on the same folder.
//   - the job and its tabs come back with the same numbers, in Claude's group, and the typing is back in the form;
//   - Claude is told with its next step, through the real door, under its chat's token; another chat's token is refused;
//   - a new chat cannot take the group while the first chat is going, and takes it once that chat is gone (carry_on);
//   - he closes one of Claude's tabs: Claude is told;
//   - a chat's "update Aang now" while Claude is filling the form: he is asked first, and Not now keeps the update waiting.
// Made-up sites and answers. Run (from src/Shell), A then B on the same folder:
//   perl -e 'alarm 120; exec @ARGV' node_modules/electron/dist/Electron.app/Contents/MacOS/Electron test/electron/tabengine-check.ts a <dir>
//   perl -e 'alarm 120; exec @ARGV' node_modules/electron/dist/Electron.app/Contents/MacOS/Electron test/electron/tabengine-check.ts b <dir>
import { app, BrowserWindow, screen } from 'electron';
import https from 'node:https';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
process.on('uncaughtException', (e) => console.log('HARNESS NOTE ' + String((e as Error)?.message ?? e).split('\n')[0]));
process.on('unhandledRejection', (e) => { console.log('HARNESS REJECTION ' + String((e as Error)?.stack ?? e)); app.exit(2); });
setTimeout(() => { console.log('HARNESS TIMEOUT'); app.exit(3); }, 110_000).unref();
const HERE = path.dirname(fileURLToPath(import.meta.url));
const RUN = process.argv.at(-2)!, DIR = process.argv.at(-1)!;
const PORT = 47116, DOOR = 47117;
const HOSTS = ['jobs.northwind.example', 'jobs.contoso.example'];
const TOK = 'c'.repeat(32), OTHER = 'd'.repeat(32);
mkdirSync(path.join(DIR, 'ud'), { recursive: true }); mkdirSync(path.join(DIR, 'st'), { recursive: true });
app.setPath('userData', path.join(DIR, 'ud'));
app.commandLine.appendSwitch('disable-backgrounding-occluded-windows');
app.commandLine.appendSwitch('host-resolver-rules', HOSTS.map((h) => `MAP ${h}:443 127.0.0.1:${PORT}`).join(','));
app.commandLine.appendSwitch('ignore-certificate-errors');
app.on('window-all-closed', () => {});
// His rule (2026-10-29): test windows never touch his main monitor or take his keyboard.
const away = () => { const d = screen.getAllDisplays().find((x) => x.id !== screen.getPrimaryDisplay().id); return d ? d.bounds : null; };
BrowserWindow.prototype.show = function (this: BrowserWindow) { const b = away(); if (b) this.setPosition(b.x + 20, b.y + 20); else this.setPosition(-6000, 100); this.setOpacity(0); this.setFocusable(false); this.showInactive(); };
BrowserWindow.prototype.focus = function () {};
BrowserWindow.prototype.moveTop = function () {};
BrowserWindow.prototype.setAlwaysOnTop = function () {};
app.focus = () => {};
app.dock?.hide();
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
let bad = 0;
const check = (what: string, ok: boolean, d = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${what}${d && !ok ? '  -- ' + d : ''}`); if (!ok) bad++; };

const FORM = `<!doctype html><title>Contoso - Account Manager</title><body><h1>Your application</h1>
  <label>Full name <input id="n"></label><label>Email <input name="email"></label>
  <label>Why Contoso? <textarea id="w"></textarea></label><label><input type="checkbox" id="remote"> Remote is fine</label>
  <label>Password <input type="password" id="pw"></label><button>Submit application</button></body>`;
const POSTING = `<!doctype html><title>Northwind - Client Account Manager</title><body><h1>Client Account Manager</h1><a href="#">Apply now</a></body>`;

async function post(op: string, a: Record<string, unknown>, s: string): Promise<any> {
  const d = JSON.parse(readFileSync(path.join(DIR, 'st', 'claude-door.json'), 'utf8'));
  const r = await fetch(`http://127.0.0.1:${d.port}/drive`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-aang-key': d.key }, body: JSON.stringify({ op, a, s }) });
  return r.json();
}

app.whenReady().then(async () => {
  (screen as any).getCursorScreenPoint = () => ({ x: -20000, y: 500 });
  const tls = path.join(DIR, 'tls');
  if (!existsSync(path.join(tls, 'c.pem'))) { mkdirSync(tls, { recursive: true }); execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', path.join(tls, 'k.pem'), '-out', path.join(tls, 'c.pem'), '-days', '2', '-subj', '/CN=jobs.example', '-addext', `subjectAltName=${HOSTS.map((h) => 'DNS:' + h).join(',')}`], { stdio: 'ignore' }); }
  const site = https.createServer({ key: readFileSync(path.join(tls, 'k.pem')), cert: readFileSync(path.join(tls, 'c.pem')) }, (q, r) => {
    r.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }).end(String(q.headers.host).startsWith('jobs.contoso') ? FORM : POSTING);
  });
  await new Promise<void>((r) => site.listen(PORT, '127.0.0.1', () => r()));
  const { servePages } = await import('../../src/pageserver.ts');
  const { AangBrowser } = await import('../../src/browser.ts');
  const { wireBrowser } = await import('../../src/browseripc.ts');
  const { startClaudeDoor } = await import('../../src/claudedoor.ts');
  const pages = await servePages(path.join(HERE, '..', '..', 'pages'));
  const P = (f: string) => path.join(HERE, '..', '..', 'src', f);
  const b: any = new AangBrowser({ origin: pages.origin, preloadPath: P('preload.cjs'), tabPreloadPath: P('tabpreload.cjs'), settingsPreloadPath: P('settingspreload.cjs'), thingsPreloadPath: P('thingspreload.cjs'), stateDir: path.join(DIR, 'st'), testLocal: true });
  wireBrowser(() => b);
  const updates = { goes: 0, ready: () => '1.29.9', go: async () => { updates.goes++; return { ok: true }; } };
  startClaudeDoor(() => b, path.join(DIR, 'st'), DOOR, { updates });
  // Every notice shown, by title (the small "tabs are back" one drains by itself after 4 s).
  const seenTitles: string[] = [];
  const push = b.notices.push.bind(b.notices);
  b.notices.push = (n: any, on: any) => { seenTitles.push(String(n?.title ?? '')); return push(n, on); };
  b.open();
  for (let i = 0; i < 100 && !b.win; i++) await wait(150);
  b.win.setContentSize(1280, 760);
  await wait(4500);
  const kept = path.join(DIR, 'st', 'claude-kept.json');

  if (RUN === 'a') {
    const job = (await b.drive('start', { kind: 'claude', name: 'Job hunt', plan: { login: [], denied: [], steps: ['Fill the form'], allowed: [] } })).job;
    b.claudeBind(job, TOK);
    const p1 = (await b.drive('open', { job, url: 'https://jobs.northwind.example/jobs/1' })).page;
    const p2 = (await b.drive('open', { job, url: 'https://jobs.contoso.example/jobs/2/apply' })).page;
    check('run A: two real Claude tabs', Number.isInteger(p1) && Number.isInteger(p2), JSON.stringify([p1, p2]));
    // Typing goes into the form (as Claude's keys would), password too: the password must never be kept.
    await b.driver.page(p2).wc.executeJavaScript(`(() => { const s = (el, v) => { el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); };
      s(document.getElementById('n'), 'Sam Rivera'); s(document.querySelector('[name=email]'), 'sam.rivera@example.com');
      s(document.getElementById('w'), 'I have looked after partner accounts for six years and I like helping them grow.');
      document.getElementById('remote').click(); s(document.getElementById('pw'), 'hunter2-secret'); return 1; })()`);
    await b.grabForm(p2); await wait(1500);
    const w = b.claudeWork();
    check('run A: the update would wait: Claude is filling an application in Contoso', w?.doing === 'filling an application' && w?.where === 'Contoso', JSON.stringify(w));
    const k = JSON.parse(readFileSync(kept, 'utf8'));
    const kj = k.jobs.find((x: any) => x.id === job);
    check('run A: the job, its token and both tabs are on disk', kj?.token === TOK && kj?.pages.length === 2, JSON.stringify(kj));
    const form = kj?.pages.find((x: any) => x.id === p2)?.form;
    check('run A: the typing is on disk (4 answers)', form?.fields.length === 4, JSON.stringify(form));
    check('run A: the password is never kept', !readFileSync(kept, 'utf8').includes('hunter2'));
    writeFileSync(path.join(DIR, 'ids.json'), JSON.stringify({ job, p1, p2 }));
    console.log(bad ? `${bad} FAILED` : 'ALL PASS');
    // A crash: nothing gets to save on the way out.
    process.kill(process.pid, 'SIGKILL');
    return;
  }

  // ---- run B: Samara starts again on the same folder.
  const ids = JSON.parse(readFileSync(path.join(DIR, 'ids.json'), 'utf8'));
  for (let i = 0; i < 60 && !(b.driver.page(ids.p2) && !b.refilling.size); i++) await wait(500);
  await wait(1500);
  const j = b.driver.job(ids.job);
  check('run B: the job came back under its own number', !!j && /job hunt/i.test(j.name), JSON.stringify(b.driver.view()));
  check('run B: both tabs came back under their own numbers', !!b.driver.page(ids.p1) && !!b.driver.page(ids.p2));
  check('run B: they are real tabs in Claude\'s group', b.tabs.filter((t: any) => t.claude).length === 2 && b.driver.view().some((v: any) => v.id === ids.job && v.pages.length === 2));
  const vals = await b.driver.page(ids.p2).wc.executeJavaScript(`[document.getElementById('n').value, document.querySelector('[name=email]').value, document.getElementById('w').value, document.getElementById('remote').checked, document.getElementById('pw').value]`);
  check('run B: Samara put the typing back', vals[0] === 'Sam Rivera' && vals[1] === 'sam.rivera@example.com' && /six years/.test(vals[2]) && vals[3] === true, JSON.stringify(vals));
  check('run B: the password was not put back', vals[4] === '');

  // The chat's next step, through the real door, under its token.
  check('run B: another chat\'s token cannot use the job', /not a page this Claude session opened/.test((await post('read', { page: ids.p2 }, OTHER)).error ?? ''));
  const res = await post('resume', { job: ids.job }, TOK);
  check('run B: the chat\'s connector re-attaches (resume)', res.ok === true && res.job === ids.job, JSON.stringify(res));
  const rd = await post('read', { page: ids.p2 }, TOK);
  const news = (rd.news ?? []).join(' ');
  check('run B: the chat reads its page with the same number', rd.ok === true && /Your application/.test(rd.text ?? ''), JSON.stringify(rd).slice(0, 300));
  check('run B: Claude is told: restarted, both tabs back, typing put back', /Samara restarted at/.test(news) && new RegExp(`page ${ids.p1} Northwind, page ${ids.p2} Contoso`).test(news) && /had typing, and Samara put it back/.test(news), news);

  // A new chat: refused while the first chat is going, takes the group once it is gone.
  const live = await post('plan', { carry_on: 'carry on the job hunt' }, OTHER);
  check('run B: a chat that is still going keeps its group', live.ok === false && /still going/.test(live.error ?? ''), JSON.stringify(live));
  b.keepSeen.set(ids.job, Date.now() - 4 * 60_000);
  const took = await post('plan', { carry_on: 'carry on the job hunt' }, OTHER);
  check('run B: once that chat is gone, the new chat just takes the group', took.ok === true && took.job === ids.job && /took over "job hunt"/i.test(took.note ?? ''), JSON.stringify(took));
  check('run B: the new chat works in it', (await post('read', { page: ids.p1 }, OTHER)).ok === true);
  check('run B: the old chat no longer can', (await post('read', { page: ids.p1 }, TOK)).ok === false);

  // A chat's "update Aang now" while Claude is filling the form: asked first; Not now keeps it waiting.
  const asked = post('updatenow', {}, OTHER);
  await wait(1500);
  const n = b.notices.list?.find?.((x: any) => /Restart Samara for 1\.29\.9/.test(x.n?.title ?? '')) ?? (b.notices as any).list?.find((x: any) => /Restart Samara/.test(x.n?.title ?? ''));
  check('run B: he is asked first, in Samara, naming the form', !!n && /filling an application in Contoso/.test(JSON.stringify(n.n.rows)), JSON.stringify((b.notices as any).list?.map((x: any) => x.n?.title)));
  if (n) b.notices.answer(n.n.id, 'no');
  const un = await asked;
  check('run B: Not now: the update waits', un.said === 'no' && updates.goes === 0, JSON.stringify(un));

  // He closes one of Claude's tabs himself: Claude is told.
  const tab = b.driver.page(ids.p1).borrowed.tab;
  b.close(tab);
  await wait(800);
  const nx = await post('read', { page: ids.p2 }, OTHER);
  check('run B: he closed a tab: Claude is told', (nx.news ?? []).some((x: string) => new RegExp(`Joshua closed page ${ids.p1}`).test(x)), JSON.stringify(nx.news));
  await wait(1500);
  const k2 = JSON.parse(readFileSync(kept, 'utf8'));
  check('run B: the kept file follows: one tab left, the new chat\'s token', k2.jobs[0]?.pages.length === 1 && k2.jobs[0]?.token === OTHER, JSON.stringify(k2.jobs[0]).slice(0, 300));
  // The update key's tray, from the real card: why it waits, then after two hours the ask with Keep waiting.
  const fw = b.win.webContents, js = (x: string) => fw.executeJavaScript(x);
  const card = { version: '1.29.9', since: Date.now(), title: 'Version 1.29.9: Gojo', groups: [{ name: 'SAMARA', items: [{ text: 'A' }] }] };
  b.setUpdate({ ...card, wait: { b: 'Claude is filling an application', t: " in Contoso. The update waits until it's done.", anyway: false } }); await wait(900);
  await js(`(() => { if (document.getElementById('uptray').hidden) document.getElementById('upkey').click(); return 1; })()`); await wait(900);
  check('tray: the waits line', await js(`document.getElementById('upwhy').hidden === false && document.getElementById('upwhy').textContent`) === "Claude is filling an application in Contoso. The update waits until it's done.");
  check('tray: Restart now still there, Later as before', await js(`document.getElementById('upgo').textContent + '|' + document.getElementById('upgo').disabled + '|' + document.getElementById('uplater').textContent`) === 'Restart now|false|Later');
  b.setUpdate({ ...card, wait: { b: 'Claude has been working for 2 hours.', t: ' Restart anyway? Its tabs and your typing come back.', anyway: true } }); await wait(900);
  check('tray: after 2 hours it asks, with Keep waiting', await js(`document.getElementById('upwhy').textContent + '|' + document.getElementById('uplater').textContent`) === 'Claude has been working for 2 hours. Restart anyway? Its tabs and your typing come back.|Keep waiting');
  b.setUpdate(card); await wait(900);
  check('tray: no work, no line', await js(`document.getElementById('upwhy').hidden`) === true);
  check('the "Claude\'s tabs are back" notice was shown', seenTitles.some((t) => t === "Claude's tabs are back"), JSON.stringify(seenTitles));
  site.close();
  console.log(bad ? `${bad} FAILED` : 'ALL PASS');
  app.exit(bad ? 1 : 0);
});
