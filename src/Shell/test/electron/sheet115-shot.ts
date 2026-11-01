// Sheet 115 (2026-10-31, the tab engine; his round 1 picks): Claude's work survives a restart.
//   - After a restart Samara puts his typing back itself ("Samara does it"), Claude checks the form before anything is sent.
//   - The typed copy lives until the form is sent, 1 day at most ("Until sent, 1 day max").
//   - An update waits while Claude works or a form has unsent typing; after 2 hours the key asks him ("After 2 hours, ask me").
//   - A new chat that carries on an old chat's job just takes its tabs ("It just takes them").
// Real Samara: the real update tray (its own `upwhy` line, as a call uses today), the real notice and ask (sheet 106),
// the real tab list and band with one real Claude job driving three real tabs on made-up sites. Only the words in the
// tray and the notices are new. Nothing is built.
// Run (from src/Shell): perl -e 'alarm 150; exec @ARGV' node_modules/electron/dist/Electron.app/Contents/MacOS/Electron test/electron/sheet115-shot.ts <out-prefix>
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
const PORT = 47115;
const HOSTS = ['jobs.northwind.example', 'jobs.contoso.example', 'jobs.fabrikam.example'];
app.setPath('userData', mkdtempSync(path.join(os.tmpdir(), 's115-ud-')));
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

const SITE: Record<string, { name: string; color: string; title: string; role: string; line: string }> = {
  'jobs.northwind.example': { name: 'Northwind', color: '#3b4bd8', title: 'Client Account Manager', role: 'Accounts · Remote', line: 'Look after twenty of our biggest clients and keep them growing.' },
  'jobs.contoso.example': { name: 'Contoso', color: '#2f8f7f', title: 'Account Manager, Partners', role: 'Partners · Remote', line: 'Look after a group of partner companies, help them grow, and be their voice inside Contoso.' },
  'jobs.fabrikam.example': { name: 'Fabrikam', color: '#d07a2a', title: 'Onboarding Specialist', role: 'Customer Success · Hybrid', line: 'Get new customers set up and happy in their first ninety days.' },
};
const ICON = (s: typeof SITE[string]) => `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><rect width="16" height="16" rx="3" fill="${s.color}"/><text x="8" y="12.5" font-family="Arial" font-weight="700" font-size="12" fill="#fff" text-anchor="middle">${s.name[0]}</text></svg>`)}`;
const HEAD = (s: typeof SITE[string]) => `<!doctype html><title>${s.name} - ${s.title}</title><link rel="icon" href="${ICON(s)}">
  <body style="margin:0;font:16px/1.55 -apple-system,Segoe UI,Helvetica,Arial,sans-serif;background:#fff;color:#1d2433">
  <div style="height:64px;display:flex;align-items:center;gap:12px;padding:0 64px;border-bottom:1px solid #e4e7ee"><div style="width:28px;height:28px;border-radius:6px;background:${s.color}"></div><b style="font-size:19px">${s.name}</b></div>`;
const POSTING = (s: typeof SITE[string]) => `${HEAD(s)}<div style="padding:36px 64px;max-width:760px"><div style="color:${s.color};font-weight:600;font-size:14px">${s.role}</div><h1 style="margin:6px 0 18px;font-size:34px">${s.title}</h1>
  <p style="color:#3a4252">${s.line}</p><button style="font:600 16px inherit;background:${s.color};color:#fff;border:0;border-radius:8px;padding:12px 26px">Apply now</button></div></body>`;
// Contoso is the application Claude was filling when Samara restarted. The answers are made up.
const FIELD = (l: string, id: string, big = false) => `<label style="display:block;margin:0 0 14px;font-weight:600;font-size:14px">${l}<br>${big
  ? `<textarea id="${id}" rows="3" style="width:520px;font:15px inherit;padding:8px;border:1px solid #c9ced8;border-radius:6px;margin-top:4px"></textarea>`
  : `<input id="${id}" style="width:520px;font:15px inherit;padding:8px;border:1px solid #c9ced8;border-radius:6px;margin-top:4px">`}</label>`;
const FORM = (s: typeof SITE[string]) => `${HEAD(s)}<div style="padding:28px 64px;max-width:760px"><div style="color:${s.color};font-weight:600;font-size:14px">Apply · ${s.title}</div>
  <h1 style="margin:4px 0 18px;font-size:28px">Your application</h1>
  ${FIELD('Full name', 'n')}${FIELD('Email', 'e')}${FIELD('Why Contoso?', 'w', true)}
  <button style="font:600 16px inherit;background:${s.color};color:#fff;border:0;border-radius:8px;padding:12px 26px">Submit application</button></div></body>`;

app.whenReady().then(async () => {
  (screen as any).getCursorScreenPoint = () => ({ x: -20000, y: 500 });
  const out = process.argv[process.argv.length - 1];
  const cd = mkdtempSync(path.join(os.tmpdir(), 's115-tls-'));
  execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', path.join(cd, 'k.pem'), '-out', path.join(cd, 'c.pem'), '-days', '2', '-subj', '/CN=jobs.example', '-addext', `subjectAltName=${HOSTS.map((h) => 'DNS:' + h).join(',')}`], { stdio: 'ignore' });
  const site = https.createServer({ key: readFileSync(path.join(cd, 'k.pem')), cert: readFileSync(path.join(cd, 'c.pem')) }, (q, r) => {
    const host = String(q.headers.host ?? '').split(':')[0]!, s = SITE[host] ?? SITE['jobs.contoso.example']!;
    r.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }).end(host === 'jobs.contoso.example' ? FORM(s) : POSTING(s));
  });
  await new Promise<void>((r) => site.listen(PORT, '127.0.0.1', () => r()));
  const { servePages } = await import('../../src/pageserver.ts');
  const { AangBrowser } = await import('../../src/browser.ts');
  const { wireBrowser } = await import('../../src/browseripc.ts');
  const pages = await servePages(path.join(HERE, '..', '..', 'pages'));
  const P = (f: string) => path.join(HERE, '..', '..', 'src', f);
  const b: any = new AangBrowser({ origin: pages.origin, preloadPath: P('preload.cjs'), tabPreloadPath: P('tabpreload.cjs'), settingsPreloadPath: P('settingspreload.cjs'), thingsPreloadPath: P('thingspreload.cjs'), stateDir: mkdtempSync(path.join(os.tmpdir(), 's115-st-')), testLocal: true });
  wireBrowser(() => b);
  b.open();
  for (let i = 0; i < 100 && !b.win; i++) await wait(150);
  b.win.setContentSize(1280, 760);
  await wait(4000);
  for (const [i, h] of HOSTS.entries()) { b.newTab(`https://${h}/jobs/${i + 1}${h.includes('contoso') ? '/apply' : ''}`); await wait(1500); }
  await wait(3000);
  const fw = b.win.webContents;
  const ids: number[] = b.tabs.filter((t: any) => HOSTS.some((h) => String(t.url).includes(h))).map((t: any) => t.id);

  // One Claude job drives all three tabs, as sheet 111 built it.
  const job = (await b.drive('start', { kind: 'claude', name: 'Job hunt' })).job;
  for (const id of ids) await b.drive('drivetab', { job, tab: id, allowed: true });
  b.driver.job(job).working = true;
  const view = b.driver.view.bind(b.driver);
  b.driver.view = () => view().map((j: any) => ({ ...j, pages: b.driver.pagesOf(b.driver.job(j.id)).map((p: any) => { const t = b.tabs.find((x: any) => x.id === p.borrowed?.tab); return { id: p.id, title: t?.title ?? p.title, url: p.url, favicon: t?.favicon ?? '' }; }) }));
  b.activate(ids[1]);
  b.sendTabs(); await wait(1500);
  // Samara put his typing back in Contoso (made-up answers).
  await b.cur().view.webContents.executeJavaScript(`document.getElementById('n').value = 'Sam Rivera'; document.getElementById('e').value = 'sam.rivera@example.com';
    document.getElementById('w').value = 'I have looked after partner accounts for six years and I like helping them grow.'; 1`);

  const js = (s: string) => fw.executeJavaScript(s);
  // The window as he sees it: the frame with every view on it drawn in place.
  const shot = async (name: string, h = 330) => {
    await js(`document.activeElement?.blur(); document.querySelectorAll('.imgc').forEach((x) => x.remove()); 1`);
    const lay = (b.win.contentView.children as any[]).filter((v) => v.getVisible?.() !== false && v.webContents && v.webContents !== fw);
    for (const [i, v] of lay.entries()) {
      const r = v.getBounds(); if (!r.width || !r.height) continue;
      let pic = ''; try { pic = (await v.webContents.capturePage()).toDataURL(); } catch { continue; }
      if (pic.length < 100) continue;
      await js(`(() => { const i = document.createElement('img'); i.className = 'imgc'; i.src = ${JSON.stringify(pic)};
        Object.assign(i.style, { position: 'fixed', zIndex: '${50 + i}', pointerEvents: 'none', left: '${r.x}px', top: '${r.y}px', width: '${r.width}px', height: '${r.height}px' }); document.body.append(i); return new Promise((ok) => i.decode().then(() => ok(1))); })()`);
    }
    for (const v of lay) v.setVisible(false);
    await wait(400);
    writeFileSync(`${out}-${name}.png`, (await fw.capturePage({ x: 0, y: 0, width: 1280, height: h })).toPNG()); console.log('SHOT ' + name);
    for (const v of lay) v.setVisible(true);
    await js(`document.querySelectorAll('.imgc').forEach((x) => x.remove()); 1`);
  };
  const trayShot = async (name: string) => {
    await wait(400);
    const r = await js(`(() => { const x = document.getElementById('uptray').getBoundingClientRect(); return { x: Math.max(0, x.left - 20), y: Math.max(0, x.top - 70), width: x.width + 40, height: x.height + 90 }; })()`);
    writeFileSync(`${out}-${name}.png`, (await fw.capturePage({ x: Math.round(r.x), y: Math.round(r.y), width: Math.round(r.width), height: Math.round(r.height) })).toPNG()); console.log('SHOT ' + name);
  };
  // His loose rows for Claude's tabs give way to the group, as sheet 111 built it.
  const list = async (name: string) => {
    b.tray(true, { x: 42, y: 62, hy: 80 });
    await wait(2500);
    const tv = b.trayV.webContents;
    const key = await tv.insertCSS(`${ids.map((i) => `.drawer .tp[data-tab="${i}"]`).join(',')}{display:none !important}`);
    await tv.executeJavaScript(`[...document.querySelectorAll('.drawer .tp.drv')].forEach((r) => r.classList.toggle('on', r.textContent.includes('Contoso'))); 1`);
    await wait(500);
    writeFileSync(`${out}-${name}.png`, (await tv.capturePage()).toPNG()); console.log('SHOT ' + name);
    await tv.removeInsertedCSS(key);
    b.tray(false); await wait(800);
  };

  // A. The update waits. The real tray, its own `why` line (a call uses it today), new words.
  const card = { version: '1.29.3', since: Date.now() - 20 * 60_000, title: 'Version 1.29.3: Gojo', canBack: true, overnight: true,
    groups: [{ name: 'SAMARA', items: [{ text: "Claude's tabs come back after a restart." }] }] };
  b.setUpdate(card); await wait(1200);
  const tray = async (why: string, later?: string) => {
    await js(`(() => { if (document.getElementById('uptray').hidden) document.getElementById('upkey').click(); return 1; })()`); await wait(1500);
    await js(`(() => { const w = document.getElementById('upwhy'); w.hidden = false; w.innerHTML = ${JSON.stringify(why)};
      document.getElementById('upkc').hidden = true; ${later ? `document.getElementById('uplater').textContent = ${JSON.stringify(later)};` : ''} return 1; })()`);
  };
  await tray('<b>Claude is filling an application</b> in Contoso. The update waits until it\'s done.');
  await trayShot('tray-wait');
  await tray('<b>Claude has been working for 2 hours.</b> Restart anyway? Its tabs and your typing come back.', 'Keep waiting');
  await trayShot('tray-2h');
  await js(`(() => { document.getElementById('uplater').click(); return 1; })()`); await wait(800);

  // B. A chat's "update now" while Claude works: the real ask (sheet 106), new words.
  b.ask({ host: 'Claude', what: 'Restart Samara for 1.29.3?', kick: 'Claude · Aang', from: 'rune', claude: true,
    text: 'Claude is filling an application in Contoso. Its 3 tabs and your typing come back after the restart.', yes: 'Restart now', no: 'Not now' }, () => {});
  await wait(7000);
  await shot('ask-update', 420);
  b.notices.clear();
  const hidNotes = (b.win.contentView.children as any[]).filter((v) => v.getVisible?.() && v.webContents?.getURL?.().includes('notice'));
  for (const v of hidNotes) v.setVisible(false);
  await wait(1200);

  // C. After the restart: the same group, the same tabs, his typing back; a small notice from Claude's rune says so.
  await list('list-back');
  for (const v of hidNotes) v.setVisible(true);
  b.activate(ids[1]); await wait(800);
  b.note('', { title: "Claude's tabs are back", kick: 'Restarted for 1.29.3', from: 'rune', claude: true, small: true,
    rows: [{ g: '', v: 'Your typing in Contoso is back in place. Claude checks it before anything is sent.' }] });
  b.notices.hover(true);
  await wait(6000);
  await shot('band-back', 760);

  // D. A new chat carries on the old chat's job: first the old group resting (that chat is gone), then driving again.
  b.driver.job(job).working = false; b.sendTabs(); await wait(1200);
  await list('list-old');
  b.driver.job(job).working = true; b.sendTabs(); await wait(1200);
  await list('list-taken');
  site.close(); app.exit(0);
});
