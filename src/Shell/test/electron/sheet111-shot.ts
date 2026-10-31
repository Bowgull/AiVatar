// Sheet 111 v3 (2026-10-31, his FIX on v2): one system for every tab Claude touches, "both claude started tabs like a
// job hunt scan OR if i ask claude in the app or right click to have claude look at something". Claude's tabs are his
// normal tabs, not hidden picture-only pages: he clicks into one and uses it. The sheet 109 handover works on all of
// them (Take over, Hand back with a note, Ask Claude). Pause becomes Take over; STOP ALL stays on the group; the rows
// Claude drives keep sheet 110 v3's spark and orange breath.
// Real Samara: three real tabs on made-up sites (Northwind, Contoso, Fabrikam), borrowed by one real Claude job (drivetab),
// so the band, Take over, YOU HAVE IT and the hand card are Samara's own, as built for sheet 109. The list's group is
// the real driverNodes; the extra rows for the same tabs in his loose list are hidden, as the build will do. The
// YOU HAVE IT chip on a row and STOP ALL? are the new pieces, in the list's own chip and the stop key. Nothing is built.
// Run (from src/Shell): perl -e 'alarm 150; exec @ARGV' node_modules/electron/dist/Electron.app/Contents/MacOS/Electron test/electron/sheet111-shot.ts <out-prefix>
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
const PORT = 47111;
const HOSTS = ['jobs.northwind.example', 'jobs.contoso.example', 'jobs.fabrikam.example'];
app.setPath('userData', mkdtempSync(path.join(os.tmpdir(), 's111-ud-')));
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

const SITE: Record<string, { name: string; color: string; title: string; role: string; line: string }> = {
  'jobs.northwind.example': { name: 'Northwind', color: '#3b4bd8', title: 'Client Account Manager', role: 'Accounts · Remote', line: 'Look after twenty of our biggest clients and keep them growing.' },
  'jobs.contoso.example': { name: 'Contoso', color: '#2f8f7f', title: 'Account Manager, Partners', role: 'Partners · Remote', line: 'Look after a group of partner companies, help them grow, and be their voice inside Contoso.' },
  'jobs.fabrikam.example': { name: 'Fabrikam', color: '#d07a2a', title: 'Onboarding Specialist', role: 'Customer Success · Hybrid', line: 'Get new customers set up and happy in their first ninety days.' },
};
const PAGE = (s: typeof SITE[string]) => `<!doctype html><title>${s.name} - ${s.title}</title>
  <link rel="icon" href="data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><rect width="16" height="16" rx="3" fill="${s.color}"/><text x="8" y="12.5" font-family="Arial" font-weight="700" font-size="12" fill="#fff" text-anchor="middle">${s.name[0]}</text></svg>`)}">
  <body style="margin:0;font:16px/1.55 -apple-system,Segoe UI,Helvetica,Arial,sans-serif;background:#fff;color:#1d2433">
  <div style="height:64px;display:flex;align-items:center;gap:12px;padding:0 64px;border-bottom:1px solid #e4e7ee"><div style="width:28px;height:28px;border-radius:6px;background:${s.color}"></div><b style="font-size:19px">${s.name}</b></div>
  <div style="padding:36px 64px;max-width:760px"><div style="color:${s.color};font-weight:600;font-size:14px">${s.role}</div><h1 style="margin:6px 0 18px;font-size:34px">${s.title}</h1>
  <p style="color:#3a4252">${s.line}</p>
  <button style="font:600 16px inherit;background:${s.color};color:#fff;border:0;border-radius:8px;padding:12px 26px">Apply now</button></div></body>`;

// The list: his loose rows for Claude's tabs give way to the group (one place for each tab). Frame-specific bits on top.
const LIST = (o: { you?: string; armed?: boolean }) => `(() => {
  document.querySelectorAll('.y111').forEach((x) => x.remove());
  const rows = [...document.querySelectorAll('.drawer .tp.drv')];
  for (const r of rows) {
    const you = ${JSON.stringify(o.you ?? '')} && r.textContent.includes(${JSON.stringify(o.you ?? '~')});
    r.classList.toggle('you111', !!you);
    // He is in Contoso: its row is lit like his own front tab.
    r.classList.toggle('on', r.textContent.includes('Contoso'));
    if (you) r.querySelector('.own').before(Object.assign(document.createElement('span'), { className: 'dupchip y111', textContent: 'YOU HAVE IT' }));
  }
  const s = document.querySelector('.drawer .th.driver .stopk');
  if (${o.armed === true} && s) { s.classList.add('armed'); s.textContent = 'STOP ALL?'; }
  return rows.map((r) => r.className + ' ' + r.textContent).join(' | '); })()`;
const LIST_CSS = (ids: number[]) => `${ids.map((i) => `.drawer .tp[data-tab="${i}"]`).join(',')}{display:none !important}
  .drawer .tp.drv.you111{animation:none}
  .drawer .tp.drv.you111 .own{opacity:.55;filter:grayscale(1)}
  .drawer .tp.drv .dupchip{margin-left:auto}
  .drawer .tp.drv .dupchip+.own{margin-left:6px}`;

app.whenReady().then(async () => {
  (screen as any).getCursorScreenPoint = () => ({ x: -20000, y: 500 });
  const out = process.argv[process.argv.length - 1];
  const cd = mkdtempSync(path.join(os.tmpdir(), 's111-tls-'));
  execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', path.join(cd, 'k.pem'), '-out', path.join(cd, 'c.pem'), '-days', '2', '-subj', '/CN=jobs.example', '-addext', `subjectAltName=${HOSTS.map((h) => 'DNS:' + h).join(',')}`], { stdio: 'ignore' });
  const site = https.createServer({ key: readFileSync(path.join(cd, 'k.pem')), cert: readFileSync(path.join(cd, 'c.pem')) }, (q, r) => {
    const s = SITE[String(q.headers.host ?? '').split(':')[0]!] ?? SITE['jobs.contoso.example']!;
    r.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }).end(PAGE(s));
  });
  await new Promise<void>((r) => site.listen(PORT, '127.0.0.1', () => r()));
  const { servePages } = await import('../../src/pageserver.ts');
  const { AangBrowser } = await import('../../src/browser.ts');
  const { wireBrowser } = await import('../../src/browseripc.ts');
  const pages = await servePages(path.join(HERE, '..', '..', 'pages'));
  const P = (f: string) => path.join(HERE, '..', '..', 'src', f);
  const b: any = new AangBrowser({ origin: pages.origin, preloadPath: P('preload.cjs'), tabPreloadPath: P('tabpreload.cjs'), settingsPreloadPath: P('settingspreload.cjs'), thingsPreloadPath: P('thingspreload.cjs'), stateDir: mkdtempSync(path.join(os.tmpdir(), 's111-st-')), testLocal: true });
  wireBrowser(() => b);
  b.open();
  for (let i = 0; i < 100 && !b.win; i++) await wait(150);
  b.win.setContentSize(1280, 760);
  await wait(4000);
  for (const [i, h] of HOSTS.entries()) b.newTab(`https://${h}/jobs/${i + 1}`);
  await wait(4000);
  const fw = b.win.webContents;
  const ids: number[] = b.tabs.filter((t: any) => HOSTS.some((h) => String(t.url).includes(h))).map((t: any) => t.id);
  console.log('TABS ' + JSON.stringify(b.tabs.map((t: any) => [t.id, t.url])));

  // One Claude job (a job scan) drives all three tabs.
  const job = (await b.drive('start', { kind: 'claude', name: 'Job scan' })).job;
  for (const id of ids) console.log('BORROW ' + JSON.stringify(await b.drive('drivetab', { job, tab: id, allowed: true })));
  b.driver.job(job).working = true;
  // The build lists every tab Claude has in its group, his own borrowed ones too (today only its hidden pages are listed).
  const view = b.driver.view.bind(b.driver);
  b.driver.view = () => view().map((j: any) => ({ ...j, pages: b.driver.pagesOf(b.driver.job(j.id)).map((p: any) => { const t = b.tabs.find((x: any) => x.id === p.borrowed?.tab); return { id: p.id, title: t?.title ?? p.title, url: p.url, favicon: t?.favicon ?? '' }; }) }));
  // He clicked into Contoso.
  b.activate(ids[1]);
  b.sendTabs(); await wait(1500);

  const shot = async (name: string, h = 320) => {
    await fw.executeJavaScript(`document.activeElement?.blur(); document.querySelectorAll('.imgc').forEach((x) => x.remove()); 1`);
    const lay: any[] = [b.cur().view];
    const hv = b.pane.handV; if (hv && hv.getVisible()) lay.push(hv);
    for (const [i, v] of lay.entries()) {
      const r = v.getBounds(), pic = (await v.webContents.capturePage()).toDataURL();
      await fw.executeJavaScript(`(() => { const i = document.createElement('img'); i.className = 'imgc'; i.src = ${JSON.stringify(pic)};
        Object.assign(i.style, { position: 'fixed', zIndex: '${50 + i}', pointerEvents: 'none', left: '${r.x}px', top: '${r.y}px', width: '${r.width}px', height: '${r.height}px' }); document.body.append(i); return new Promise((ok) => i.decode().then(() => ok(1))); })()`);
    }
    for (const v of lay) v.setVisible(false);
    await wait(400);
    writeFileSync(`${out}-${name}.png`, (await fw.capturePage({ x: 0, y: 0, width: 1280, height: h })).toPNG());
    for (const v of lay) v.setVisible(true);
    await fw.executeJavaScript(`document.querySelectorAll('.imgc').forEach((x) => x.remove()); 1`);
  };
  const list = async (name: string, o: { you?: string; armed?: boolean }) => {
    b.tray(true, { x: 42, y: 62, hy: 80 });
    await wait(2500);
    const tv = b.trayV.webContents;
    await tv.insertCSS(LIST_CSS(ids));
    await tv.executeJavaScript(LIST(o)); await wait(500);
    console.log('LIST ' + name + ': ' + await tv.executeJavaScript(LIST(o)));
    writeFileSync(`${out}-${name}.png`, (await tv.capturePage()).toPNG());
    b.tray(false); await wait(800);
  };
  const who = () => fw.executeJavaScript(`document.getElementById('who').textContent`);

  // 1: the list, Claude's three tabs in its group, all driven (spark, breath); he is in Contoso.
  await list('list-driving', {});
  // 2: in Contoso: a normal live tab with Samara's real band: CLAUDE IS DRIVING, Take over, STOP.
  console.log('WHO ' + await who());
  await shot('band-driving');
  // 3: Take over (the real key): YOU HAVE IT and the real hand card.
  await fw.executeJavaScript(`document.querySelector('#who .takek').click(); 1`);
  await wait(1800);
  console.log('WHO ' + await who());
  await shot('band-you', 330);
  // 4: the list while he has Contoso: that row rests, the other two keep going.
  await list('list-you', { you: 'Contoso' });
  // 5: first press on the group's red key.
  await list('list-stopall', { you: 'Contoso', armed: true });
  site.close(); app.exit(0);
});
