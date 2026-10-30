// Sheet 106 v7, built (his yes, 2026-10-30): every scene's notice raised in a real Samara window, off screen and never
// focused, through the same calls Samara's own code makes (real downloads from a local site, the TV's ask, Claude's ask,
// Bitwarden's lines). Checks where each drops from, the count, the drain and its pause, the one sound, the buttons, and
// that a download's rows are the tray's own rows (draggable, the drag reaching startDrag). Writes a picture per scene
// (the frame, the page and the notice layer laid together) into the folder given, and prints PASS/FAIL lines.
// Run (from src/Shell):  perl -e 'alarm 150; exec @ARGV' node_modules/electron/dist/Electron.app/Contents/MacOS/Electron test/electron/notices-check.ts <out dir>
import { app, BrowserWindow, WebContentsView, screen } from 'electron';
import http from 'node:http';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = process.argv.at(-1)!.endsWith('.ts') ? path.join(os.tmpdir(), 'notices-shots') : process.argv.at(-1)!;
mkdirSync(OUT, { recursive: true });
const PORT = 47931;
setTimeout(() => { console.log('HARNESS TIMEOUT'); app.exit(3); }, 140_000).unref();
app.setPath('userData', mkdtempSync(path.join(os.tmpdir(), 'samara-notice-ud-')));
// Never his own Downloads folder.
app.setPath('downloads', mkdtempSync(path.join(os.tmpdir(), 'samara-notice-dl-')));
app.on('window-all-closed', () => { /* the harness decides */ });
process.on('uncaughtException', (e) => { console.log('HARNESS NOTE ' + String((e as Error).message).split('\n')[0]); });
BrowserWindow.prototype.show = function (this: BrowserWindow) { this.setPosition(-6000, 100); this.showInactive(); };
BrowserWindow.prototype.focus = function () { /* never in a test */ };
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
let bad = 0;
const check = (what: string, ok: boolean, d = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${what}${d ? '  -- ' + d.slice(0, 260) : ''}`); if (!ok) bad++; };

const FILES: Record<string, [string, number]> = { 'tax-form.pdf': ['application/pdf', 212_000], 'report.docx': ['application/vnd.openxmlformats-officedocument.wordprocessingml.document', 41_000], 'photo.png': ['image/png', 88_000] };

app.whenReady().then(async () => {
  (screen as any).getCursorScreenPoint = () => ({ x: -20000, y: 500 });
  const site = http.createServer((q, r) => {
    const f = decodeURIComponent((q.url ?? '/').replace(/^\/files\//, ''));
    if (FILES[f]) { r.writeHead(200, { 'Content-Type': FILES[f][0], 'Content-Disposition': `attachment; filename="${f}"`, 'Content-Length': String(FILES[f][1]) }).end(Buffer.alloc(FILES[f][1], 7)); return; }
    r.writeHead(200, { 'Content-Type': 'text/html' }).end('<!doctype html><title>Taxes</title><body style="font:16px sans-serif;padding:30px"><h1>Your tax forms</h1><p>Lorem ipsum.</p>');
  });
  await new Promise<void>((r) => site.listen(PORT, '127.0.0.1', () => r()));
  const { servePages } = await import('../../src/pageserver.ts');
  const { AangBrowser } = await import('../../src/browser.ts');
  const { wireBrowser } = await import('../../src/browseripc.ts');
  const pages = await servePages(path.join(HERE, '..', '..', 'pages'));
  const stateDir = mkdtempSync(path.join(os.tmpdir(), 'samara-notice-state-'));
  const b = new AangBrowser({ origin: pages.origin, stateDir, preloadPath: path.join(HERE, '..', '..', 'src', 'preload.cjs'),
    tabPreloadPath: path.join(HERE, '..', '..', 'src', 'tabpreload.cjs'), settingsPreloadPath: path.join(HERE, '..', '..', 'src', 'settingspreload.cjs'),
    thingsPreloadPath: path.join(HERE, '..', '..', 'src', 'thingspreload.cjs'), testLocal: true } as any) as any;
  wireBrowser(() => b);
  b.open(`http://127.0.0.1:${PORT}/`);
  for (let i = 0; i < 100 && !(b.win && !b.win.webContents.isLoading() && await b.win.webContents.executeJavaScript(`!!window.aang && !!document.getElementById('dlkey')`).catch(() => false)); i++) await wait(200);
  const w = b.win as BrowserWindow;
  w.setContentSize(1100, 720);
  await wait(3500);                                   // the helper layers are made 3 s after the window is ready
  const frame = w.webContents;
  const layer = (): WebContentsView => b.pane.noticeV;
  const lj = (s: string) => layer().webContents.executeJavaScript(s);
  // Count the one sound in the layer (every chime makes two notes).
  const spySound = () => lj(`window.__notes = 0; if (!window.__spied) { window.__spied = 1; const O = window.AudioContext; window.AudioContext = class extends O { createOscillator() { window.__notes++; return super.createOscillator(); } }; } true`);
  const until = async (f: () => Promise<boolean> | boolean, ms = 6000) => { for (let i = 0; i < ms / 100; i++) { if (await f()) return true; await wait(100); } return false; };
  const shownTitle = () => lj(`document.querySelector('.nt:not(.rise) .uphd b')?.textContent ?? ''`).catch(() => '');
  const settled = (title: string) => until(async () => layer()?.getVisible() && (await shownTitle()) === title);

  // The frame, the page and every visible layer, laid together as he sees the window.
  const comp = new BrowserWindow({ show: false, width: 400, height: 300, webPreferences: { offscreen: true } });
  await comp.loadURL('about:blank');
  async function shot(name: string): Promise<void> {
    const base = await frame.capturePage();
    const [cw] = w.getContentSize(), k = base.getSize().width / cw;
    const parts: { url: string; x: number; y: number; w: number; h: number }[] = [{ url: base.toDataURL(), x: 0, y: 0, w: base.getSize().width, h: base.getSize().height }];
    for (const v of w.contentView.children as WebContentsView[]) {
      if (!(v instanceof WebContentsView) || v.webContents === frame || !v.getVisible()) continue;
      const bb = v.getBounds();
      if (bb.width < 2 || bb.height < 2) continue;
      const img = await v.webContents.capturePage().catch(() => null);
      if (!img || img.isEmpty()) continue;
      parts.push({ url: img.toDataURL(), x: bb.x * k, y: bb.y * k, w: bb.width * k, h: bb.height * k });
    }
    const png: string = await comp.webContents.executeJavaScript(`(async () => { const parts = ${JSON.stringify(parts)};
      const c = document.createElement('canvas'); c.width = parts[0].w; c.height = parts[0].h; const g = c.getContext('2d');
      for (const p of parts) { const i = new Image(); i.src = p.url; await i.decode(); g.drawImage(i, p.x, p.y, p.w, p.h); }
      return c.toDataURL('image/png'); })()`);
    writeFileSync(path.join(OUT, name + '.png'), Buffer.from(png.split(',')[1], 'base64'));
  }
  const keyRect = (id: string) => frame.executeJavaScript(`(() => { const r = document.getElementById('${id}').getBoundingClientRect(); return { left: r.left, right: r.right, bottom: r.bottom }; })()`);
  const press = (label: string) => lj(`(() => { const b = [...document.querySelectorAll('.nt:not(.rise) .key')].find((x) => x.textContent === ${JSON.stringify(label)}); b?.click(); return !!b; })()`);
  const gone = () => until(() => !layer().getVisible(), 3000);
  await spySound();

  // ---- 1 · a download, the big one: a real file from a real page
  const tab = b.cur();
  await tab.view.webContents.executeJavaScript(`location.href = '/files/tax-form.pdf'; true`);
  check('a finished download drops a notice', await settled('Ready'), await shownTitle());
  await wait(700);
  const n1 = await lj(`(() => { const n = document.querySelector('.nt'); const rows = [...n.querySelectorAll('.files .drow')];
    return { kick: n.querySelector('.uphd small').textContent, kind: n.className, rows: rows.map((r) => ({ name: r.querySelector('.dt b').textContent, meta: r.querySelector('.dt small').textContent, badge: r.querySelector('.fb b').textContent, drag: r.draggable })),
      keys: [...n.querySelectorAll('.upfoot .key')].map((k) => k.textContent + (k.classList.contains('primary') ? '*' : '')), caps: !!n.querySelector('.caps'), gem: getComputedStyle(n.querySelector('.sock')).borderRadius }; })()`);
  check('...teal, DOWNLOADED, its row is the tray\'s row (badge, name, size · site · time), draggable', /kind-done/.test(n1.kind) && n1.kick === 'DOWNLOADED' && n1.rows.length === 1 && n1.rows[0].name === 'tax-form.pdf' && n1.rows[0].badge === 'PDF' && /KB · 127\.0\.0\.1 · now/.test(n1.rows[0].meta) && n1.rows[0].drag, JSON.stringify(n1));
  check('...the plan card\'s pieces: gold caps, a round gem, Show in Finder (gold) and Got it', n1.caps && n1.gem === '50%' && n1.keys.join() === `${process.platform === 'darwin' ? 'Show in Finder' : 'Show in folder'}*,Got it`, JSON.stringify(n1.keys));
  const L = layer().getBounds(), dk = await keyRect('dlkey'), band = await keyRect('band');
  check('...it hangs from the download key: right edge under it, top at the band', Math.abs((L.x + L.width - 16) - (dk.right + 12)) <= 6 && Math.abs(L.y - (band.bottom - 6)) <= 2, JSON.stringify({ L, dk, band }));
  check('...no sound for done', (await lj('window.__notes')) === 0);
  await shot('1-download');
  // the drag: the row asks Samara, which starts the system drag with the file
  let dragged = '';
  const sd = layer().webContents.startDrag.bind(layer().webContents);
  (layer().webContents as any).startDrag = (o: { file: string }) => { dragged = o.file; };
  await lj(`(() => { const r = document.querySelector('.files .drow'); r.dispatchEvent(new DragEvent('dragstart', { bubbles: true, cancelable: true })); })()`);
  await until(() => Boolean(dragged), 2000);
  (layer().webContents as any).startDrag = sd;
  check('...dragging the row hands the real file to the system drag', /tax-form\.pdf$/.test(dragged), dragged);
  await press('Got it');
  check('...Got it and it goes back up', await gone());

  // ---- 2 · needs you, with the one sound (Bitwarden wants the master password again)
  await spySound();
  b.note('', { kind: 'need', from: 'shield', icon: 'key', kick: 'Bitwarden', title: 'Master password again', rows: [{ g: 'Do this', v: 'Type it in the Bitwarden box that opens.' }] });
  check('a "needs you" drops', await settled('Master password again'));
  await wait(700);
  const L2 = layer().getBounds(), sh = await keyRect('lock');
  check('...from the shield: its left edge by the shield', Math.abs((L2.x + 16) - (sh.left - 20)) <= 2 || L2.x === 0, JSON.stringify({ L2, sh }));
  check('...and it plays the one sound', (await lj('window.__notes')) === 2, String(await lj('window.__notes')));
  check('...blue', /kind-need/.test(await lj(`document.querySelector('.nt').className`)));
  await shot('2-needs-you');
  await press('Got it'); await gone();

  // ---- 3 · went wrong: the TV didn't wake up
  await spySound();
  let retried = false;
  const tvAct = b.tvAct.bind(b);
  b.tvAct = async (a: string) => { if (a === 'retry') { retried = true; b.tvAsk = null; b.sendTabs(); return; } return tvAct(a); };
  b.tvName = 'Living room TV'; b.tvAsk = 'asleep'; b.sendTabs();
  check('went wrong: the TV that did not wake drops, red', await settled('Didn’t wake up') && /kind-bad/.test(await lj(`document.querySelector('.nt').className`)));
  await wait(700);
  check('...no sound', (await lj('window.__notes')) === 0);
  const L3 = layer().getBounds(), mk = await keyRect('menukey');
  check('...from the menu', Math.abs((L3.x + L3.width - 16) - (mk.right + 12)) <= 2, JSON.stringify({ L3, mk }));
  await shot('3-went-wrong');
  await press('Try again');
  check('...Try again does it straight from the notice', await until(() => retried, 2000) && await gone());
  b.tvAct = tvAct;

  // ---- 4 · small news drains in 4 s
  b.note('', { from: 'tabs', small: true, icon: 'scroll', kick: 'Added to', title: 'Tax season' });
  check('small news: the header strip only', await settled('Tax season') && (await lj(`(() => { const n = document.querySelector('.nt'); return n.classList.contains('small') && !n.querySelector('.uplist') && !!n.querySelector('.drain'); })()`)));
  await wait(1200);
  await shot('4-small');
  const t0 = Date.now();
  await until(() => !layer().getVisible(), 6000);
  check('...it slides back by itself after about 4 s', Date.now() - t0 > 2000 && Date.now() - t0 < 4200, `${Date.now() - t0 + 1200} ms`);

  // ---- 5 · a small one waits while the mouse is on it
  b.note('', { from: 'menu', small: true, icon: 'yes', kick: 'Saved', title: 'Your home page' });
  await settled('Your home page');
  await wait(500);
  const nb = await lj(`(() => { const r = document.querySelector('.nt').getBoundingClientRect(); return { x: r.left + 40, y: r.top + 20 }; })()`);
  layer().webContents.sendInputEvent({ type: 'mouseMove', x: Math.round(nb.x), y: Math.round(nb.y) });
  await wait(5500);
  check('...with the mouse on it, it is still there after 5.5 s', layer().getVisible() && (await shownTitle()) === 'Your home page');
  check('...and its gold line stopped draining', (await lj(`getComputedStyle(document.querySelector('.drain')).animationPlayState`)) === 'paused');
  layer().webContents.sendInputEvent({ type: 'mouseMove', x: 2, y: 2 });
  await lj(`document.querySelector('.nt').dispatchEvent(new MouseEvent('mouseleave'))`);
  check('...mouse off: it carries on and goes', await until(() => !layer().getVisible(), 5000));

  // ---- 6 · three at once, one at a time with a count
  await spySound();
  b.note('', { from: 'dl', kick: 'Downloaded', title: 'Ready', files: [{ id: 99999, kind: 'pdf', name: 'tax-form.pdf', meta: '212 KB · cra.gc.ca · now' }] });
  b.note('', { kind: 'need', from: 'shield', icon: 'key', kick: 'Bitwarden', title: 'Save this login?', rows: [{ g: 'For', v: 'github.com' }], keys: [{ label: 'Save', act: 'ok' }, { label: 'Not now', act: 'no', plain: true }] });
  b.note('', { kind: 'bad', from: 'menu', icon: 'tv', kick: 'The TV', title: 'Didn’t answer', rows: [{ g: 'Try', v: 'Check it’s on, then try again.' }] });
  await settled('Ready'); await wait(600);
  check('three at once: the first shows "1 of 3"', (await lj(`document.querySelector('.nt .count')?.textContent`)) === '1 of 3');
  await shot('6-three-1');
  await press('Got it');
  check('...the next drops from its own place, "2 of 3", with its sound', await settled('Save this login?') && (await lj(`document.querySelector('.nt:not(.rise) .count')?.textContent`)) === '2 of 3');
  await wait(600);
  check('...the sound once, for the blue one', (await lj('window.__notes')) === 2);
  await shot('6-three-2');
  await press('Not now');
  check('...then the last, "3 of 3"', await settled('Didn’t answer') && (await lj(`document.querySelector('.nt:not(.rise) .count')?.textContent`)) === '3 of 3');
  await press('Close'); await gone();

  // ---- 6b · several downloads at once: one notice, a row each
  for (const f of ['tax-form.pdf', 'report.docx', 'photo.png']) await tab.view.webContents.executeJavaScript(`(() => { const a = document.createElement('a'); a.href = '/files/${f}'; a.download = ''; document.body.append(a); a.click(); return true; })()`);
  await until(async () => (await lj(`document.querySelectorAll('.nt:not(.rise) .files .drow').length`).catch(() => 0)) === 3, 8000);
  await wait(800);
  const n6 = await lj(`(() => { const n = document.querySelector('.nt:not(.rise)'); return { kick: n.querySelector('.uphd small').textContent, title: n.querySelector('.uphd b').textContent, rows: [...n.querySelectorAll('.files .drow .dt b')].map((x) => x.textContent), all: document.querySelectorAll('.nt').length }; })()`);
  check('several downloads: one notice, a row for each file', n6.rows.length === 3 && n6.kick === '3 DOWNLOADS' && n6.title === 'All ready' && b.notices.all.length === 1, JSON.stringify(n6));
    // his mouse on the second row: it shows the hand, as in the tray
  const r1 = await lj(`(() => { const r = document.querySelectorAll('.files .drow')[1].getBoundingClientRect(); return { x: r.left + 60, y: r.top + r.height / 2 }; })()`);
  layer().webContents.sendInputEvent({ type: 'mouseMove', x: Math.round(r1.x), y: Math.round(r1.y) });
  await wait(300);
  await shot('6b-several-downloads');
  dragged = '';
  (layer().webContents as any).startDrag = (o: { file: string }) => { dragged = o.file; };
  await lj(`document.querySelectorAll('.files .drow')[1].dispatchEvent(new DragEvent('dragstart', { bubbles: true, cancelable: true }))`);
  await until(() => Boolean(dragged), 2000);
  (layer().webContents as any).startDrag = sd;
  check('...exactly the one he grabs: report.docx, by its row', /report\.docx$/.test(dragged), dragged);
  await press('Got it'); await gone();

  // ---- 7 · Claude asks: from the rune, Claude's spark on a white gem, the sound, Allow once
  await spySound();
  const asked = b.askForClaude('open the checkout');
  check('Claude asks, as a "needs you"', await settled('Open the checkout?'));
  await wait(700);
  const n7 = await lj(`(() => { const n = document.querySelector('.nt'); const s = n.querySelector('.sock'); return { cls: n.className, claude: s.classList.contains('claude'), bg: getComputedStyle(s).backgroundColor, kick: n.querySelector('.uphd small').textContent, keys: [...n.querySelectorAll('.upfoot .key')].map((k) => k.textContent) }; })()`);
  check('...Claude\'s spark on a white gem, Allow once and No', n7.claude && n7.bg === 'rgb(246, 242, 234)' && /kind-need/.test(n7.cls) && n7.keys.join() === 'Allow once,No', JSON.stringify(n7));
  check('...with the sound', (await lj('window.__notes')) === 2);
  await shot('7-claude-asks');
  await press('Allow once');
  check('...Allow once says yes to Claude', (await asked) === true);
  await gone();

  // ---- a site's ask: the camera (the shield), and the TV's code (the menu), wrong code shakes and stays
  let said: boolean | null = null;
  b.ask({ host: 'meet.google.com', what: 'Your camera?', text: 'meet.google.com wants it for what you are doing now. It stops when you leave the site.', icon: 'camera' }, (a: boolean) => { said = a; });
  await settled('Your camera?'); await wait(700);
  await shot('ask-camera');
  await press('No');
  check('a site\'s camera ask: No says no', await until(() => said === false, 2000));
  await gone();
  const tvA = b.tvAct.bind(b);
  let code = '';
  b.tvAct = async (a: string) => { if (a.startsWith('code:')) { code = a.slice(5); b.tvLinkErr = 'That is not the code. Look at the TV again.'; b.sendTabs(); return; } return tvA(a); };
  b.tvAsk = 'link'; b.tvLinkErr = ''; b.sendTabs();
  await settled('Link Samara to it'); await wait(600);
  await lj(`(() => { const xs = [...document.querySelectorAll('.tvcode input')]; 'A1B2C3'.split('').forEach((c, i) => { xs[i].value = c; }); xs[5].dispatchEvent(new Event('input')); })()`);
  await until(() => Boolean(code), 2000); await wait(200);
  const n8 = await lj(`({ err: document.querySelector('.nt .err')?.textContent, shake: document.querySelector('.nt .tvcode').classList.contains('wrong'), still: document.querySelectorAll('.nt').length })`);
  check('the TV code: typed in the notice, a wrong one stays and shakes', code === 'A1B2C3' && n8.shake && /not the code/.test(n8.err ?? '') && layer().getVisible(), JSON.stringify(n8));
  await wait(500);
  await shot('ask-tv-code');
  b.tvAct = tvA;
  await press('Not now'); await gone();

  // ---- a device a site asks for (sheet 69): picked on the parchment
  const dev = b.notices.push(b.devNotice('usevia.app', [{ deviceId: 'k1', name: 'TH99 PRO', vendorId: 1, productId: 2 }, { deviceId: 'k2', name: '2.4G Receiver', vendorId: 1, productId: 3 }], 'k1'));
  await settled('One of your devices'); await wait(600);
  check('a device ask lists the devices, the known one picked', (await lj(`[...document.querySelectorAll('.nt .dev')].map((d) => d.getAttribute('aria-pressed')).join()`)) === 'true,false');
  await shot('ask-device');
  b.notices.drop(dev); await gone();

  // ---- the frame has no old toast or ask chip left
  check('the old toast and ask chips are gone from the frame', await frame.executeJavaScript(`!document.getElementById('toast') && !document.getElementById('askchip') && !document.getElementById('devchip')`));
  console.log(bad ? `FAILED ${bad}` : 'ALL PASS');
  app.exit(bad ? 1 : 0);
});
