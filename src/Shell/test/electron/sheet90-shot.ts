// Sheet 90 (2026-10-25): Samara's real Settings > Autofill > Bitwarden page with his logins laid in under it (sample
// logins, not his), and the real bookmarks shelf mid-drag. Not built: rows and the drag are laid on for the picture.
// Run: npx electron test/electron/sheet90-shot.ts <out-prefix>
import { app, BrowserWindow } from 'electron';
import { mkdtempSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
process.on('unhandledRejection', (e) => { console.log('HARNESS REJECTION ' + String((e as Error)?.message ?? e)); app.exit(2); });
setTimeout(() => { console.log('HARNESS TIMEOUT'); app.exit(3); }, 150_000).unref();
const HERE = path.dirname(fileURLToPath(import.meta.url));
app.setPath('userData', mkdtempSync(path.join(os.tmpdir(), 's90-ud-')));
app.commandLine.appendSwitch('disable-backgrounding-occluded-windows');
app.on('window-all-closed', () => {});
BrowserWindow.prototype.show = function (this: BrowserWindow) { this.setOpacity(0); this.showInactive(); };
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const LOGINS = [['web.stremio.com', 'sam.rivers@mail.com'], ['reddit.com', 'samrivers'], ['twitch.tv', 'samrivers'], ['github.com', 'sam-rivers'], ['shadow.tech', 'sam.rivers@mail.com']];
app.whenReady().then(async () => {
  const out = process.argv[process.argv.length - 1];
  const { servePages } = await import('../../src/pageserver.ts');
  const { AangBrowser } = await import('../../src/browser.ts');
  const { wireBrowser } = await import('../../src/browseripc.ts');
  const pages = await servePages(path.join(HERE, '..', '..', 'pages'));
  const P = (f: string) => path.join(HERE, '..', '..', 'src', f);
  const b: any = new AangBrowser({ origin: pages.origin, preloadPath: P('preload.cjs'), tabPreloadPath: P('tabpreload.cjs'), settingsPreloadPath: P('settingspreload.cjs'), thingsPreloadPath: P('thingspreload.cjs'), stateDir: mkdtempSync(path.join(os.tmpdir(), 's90-s-')) });
  wireBrowser(() => b);
  for (const [t, u] of [['YouTube', 'https://www.youtube.com/'], ['Reddit', 'https://www.reddit.com/'], ['Twitch', 'https://www.twitch.tv/'], ['GitHub', 'https://github.com/']]) b.marks.push({ title: t, url: u, folder: '' });
  b.open();
  for (let i = 0; i < 100 && !b.win; i++) await wait(150);
  b.win.setContentSize(1100, 800);
  await wait(4000);
  await b.fillMarkIcons().catch(() => {});
  // 1 Settings > Autofill > Bitwarden, his logins under it
  b.openSettings('bw');
  await wait(2500);
  const sv = b.tabs.find((x: any) => x.internal === 'settings').view;
  await sv.webContents.executeJavaScript(`(() => {
    const sec = document.querySelector('section[data-sec="bw"]'); if (!sec) return 'no section';
    const card = document.createElement('div'); card.className = 'card yoursites'; card.innerHTML = '<i class="caps"></i>';
    const head = document.createElement('div'); head.style.cssText = 'display:flex;gap:10px;align-items:center';
    const find = Object.assign(document.createElement('input'), { className: 'find', type: 'search', placeholder: 'Find a login' }); find.style.flex = '1';
    const add = Object.assign(document.createElement('button'), { className: 'act', type: 'button', textContent: '+ Add a login' });
    head.append(find, add); card.append(head);
    const L = ${JSON.stringify(LOGINS)};
    L.forEach(([site, user], i) => {
      const r = document.createElement('div'); r.className = 'r'; r.innerHTML = '<b></b><span class="v"></span><i class="go"></i>';
      r.querySelector('b').textContent = site; r.querySelector('.v').textContent = user; card.append(r);
      if (i === 0) {
        const a = document.createElement('div'); a.className = 'acts';
        for (const t of ['Copy name', 'Copy password', 'Show', 'Edit', 'Delete']) a.append(Object.assign(document.createElement('button'), { className: 'act', type: 'button', textContent: t }));
        a.lastChild.style.color = '#ff9a8a';
        const pw = document.createElement('div'); pw.className = 'r'; pw.innerHTML = '<b>Password</b><span class="v">••••••••••  · your PIN shows it</span>';
        card.append(pw, a);
      }
    });
    sec.append(card); return 'ok'; })()`).then((x: string) => console.log('LOGINS ' + x));
  await wait(800);
  writeFileSync(`${out}-logins.png`, (await sv.webContents.capturePage()).toPNG());
  // 2 the shelf, one bookmark mid-drag
  b.activate(b.tabs.find((x: any) => !x.internal).id); await wait(800);
  await b.win.webContents.executeJavaScript(`document.getElementById('drawerkey').click(); 1`); await wait(3500);
  const tw = b.trayV.webContents;
  console.log('SHELF ' + await tw.executeJavaScript(`(() => {
    const keys = [...document.querySelectorAll('.shelf-bk .bm-key')]; if (keys.length < 3) return 'keys ' + keys.length;
    const lift = keys[1];
    Object.assign(lift.style, { transform: 'translate(24px,-16px) rotate(-7deg) scale(1.08)', zIndex: 5, boxShadow: '0 10px 0 rgba(0,0,0,.35),0 16px 22px rgba(0,0,0,.5)', transition: 'none' });
    keys[2].style.transform = 'translateX(14px)'; keys[3] && (keys[3].style.transform = 'translateX(14px)');
    const mark = document.createElement('i'); const k2 = keys[0].getBoundingClientRect(), box = keys[0].parentElement.getBoundingClientRect();
    Object.assign(mark.style, { position: 'absolute', left: (k2.right - box.left + 3) + 'px', top: (k2.top - box.top) + 'px', width: '4px', height: k2.height + 'px', borderRadius: '2px', background: '#FFC43C', boxShadow: '0 0 6px rgba(255,196,60,.9)' });
    keys[2].parentElement.style.position = 'relative'; keys[2].parentElement.append(mark);
    return 'ok ' + keys.length; })()`));
  await wait(500);
  writeFileSync(`${out}-shelf.png`, (await tw.capturePage({ x: 0, y: 0, width: 340, height: 230 })).toPNG());
  app.exit(0);
});
