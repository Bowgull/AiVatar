// 2026-10-22, his report: "I was having trouble clicking Settings in theater mode on Twitch." Samara built the way the
// app builds it, off his screen; a live Twitch channel (no login, no chat, no follow) and a YouTube video, each put in
// theater mode; then for every player control: its centre, what the page itself has there (elementFromPoint), whether any
// other Samara layer (tray, rune, curtain, another tab) covers it, and what WINDOWS says the window is there
// (WM_NCHITTEST on this test window's own handle: 1 = the page gets the click, 2 = a title-bar drag eats it).
//
// Run: npx electron test/electron/theater-check.ts   (THEATER_OFFLINE=1: stand-in page only; THEATER_SIZE=1920x1040; THEATER_SCALE=1.25)
// Finding, 2026-10-22: nothing of Samara's covers the page in theater mode (Twitch, YouTube, at 100/125/150%, after the tab
// list and the rune panel); Twitch's Settings opens and stays open. What can sit over the control bar is outside Samara.
import { app, BrowserWindow, dialog, screen } from 'electron';
import http from 'node:http';
import { execFile } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import os from 'node:os'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
import { servePages } from '../../src/pageserver.ts'; import { AangBrowser } from '../../src/browser.ts'; import { wireBrowser } from '../../src/browseripc.ts';
dialog.showErrorBox = () => {};
process.on('uncaughtException', (e) => { const t = String((e as Error)?.stack ?? e); console.log('HARNESS ERROR ' + t.split('\n').slice(0, 3).join(' | ')); if (!t.includes('assert(!this.paused)')) app.exit(2); });   // that one is Node's stream noise in Electron (rune-check notes it too)
process.on('unhandledRejection', (e) => { console.log('HARNESS REJECTION ' + String((e as Error)?.stack ?? e).split('\n')[0]); });
setTimeout(() => { console.log('HARNESS TIMEOUT'); app.exit(3); }, 150_000).unref();
app.on('window-all-closed', () => {});
app.setPath('userData', mkdtempSync(path.join(os.tmpdir(), 'theater-ud-')));
app.commandLine.appendSwitch('disable-features', 'CalculateNativeWinOcclusion');
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');
if (process.env.THEATER_SCALE) app.commandLine.appendSwitch('force-device-scale-factor', process.env.THEATER_SCALE);   // his screen's scaling, tried
const HERE = path.dirname(fileURLToPath(import.meta.url));
// Off his screen, never in front of his game.
BrowserWindow.prototype.show = function (this: BrowserWindow) { this.setPosition(-6000, 100); this.showInactive(); };
BrowserWindow.prototype.focus = function () {};
BrowserWindow.prototype.moveTop = function () {};
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
let bad = 0;
const check = (what: string, ok: boolean, d = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${what}${d ? '  -- ' + String(d).slice(0, 300) : ''}`); if (!ok) bad++; };
const until = async (fn: () => boolean | Promise<boolean>, ms = 6000) => { const end = Date.now() + ms; while (Date.now() < end) { try { if (await fn()) return true; } catch { /* not yet */ } await wait(150); } return false; };
const OFFLINE = process.env.THEATER_OFFLINE === '1';

// Windows' own answer for each point of this test window (no input is sent anywhere: a question, not a click). Points
// are window-content DIPs; Windows turns them into its own screen pixels (ClientToScreen), so scaling is honest.
// Asked from another process while this one keeps running (the window answers on this process's own thread).
async function hitTest(hwnd: bigint, pts: { x: number; y: number }[], scale: number): Promise<number[]> {
  if (!pts.length) return [];
  const ps = `Add-Type -TypeDefinition 'using System;using System.Runtime.InteropServices;public static class H{public struct P{public int X,Y;}[DllImport("user32.dll")]public static extern IntPtr SendMessageW(IntPtr h,uint m,IntPtr w,IntPtr l);[DllImport("user32.dll")]public static extern bool ClientToScreen(IntPtr h,ref P p);}';
$h=[IntPtr]::new(${hwnd}); $o=@(); foreach($p in @(${pts.map((p) => `@(${Math.floor(p.x * scale)},${Math.floor(p.y * scale)})`).join(',')})){ $q=New-Object H+P; $q.X=$p[0]; $q.Y=$p[1]; [void][H]::ClientToScreen($h,[ref]$q); $l=(([int]$q.Y -band 0xFFFF) -shl 16) -bor ([int]$q.X -band 0xFFFF); $o+=[int][H]::SendMessageW($h,0x84,[IntPtr]::Zero,[IntPtr]::new($l)) }; $o -join ','`;
  // The script goes in on stdin (hundreds of points do not fit on a command line).
  const out = await new Promise<string>((res) => { const c = execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', '-'], { encoding: 'utf8', timeout: 60000, maxBuffer: 1 << 22 }, (_e, o) => res(String(o ?? '').trim().split(/\r?\n/).pop() ?? '')); c.stdin?.end(ps.replace(/\n/g, ' ') + '\n'); });
  return out.split(',').map(Number);
}

// A stand-in player: its control bar flush with the bottom of the page and the right edge, the way theater mode puts it.
const STAND_IN = `<!doctype html><title>Player</title><style>html,body{margin:0;height:100%;background:#000}
.bar{position:fixed;left:0;right:0;bottom:0;height:40px;display:flex;justify-content:space-between;align-items:center;padding:0 6px}
button{width:30px;height:30px}</style><div class="bar"><span><button id="play">p</button><button id="vol">v</button></span>
<span><button id="clip">c</button><button id="settings">s</button><button id="theatre">t</button><button id="full">f</button></span></div>`;

const TWITCH = [
  ['settings', '[data-a-target="player-settings-button"]'], ['volume', '[data-a-target="player-mute-unmute-button"]'],
  ['play/pause', '[data-a-target="player-play-pause-button"]'], ['fullscreen', '[data-a-target="player-fullscreen-button"]'],
  ['theatre', 'button[aria-label*="Theatre Mode"]'], ['clip', '[data-a-target="player-clip-button"]'],
  ['chat collapse', '[data-a-target="right-column__toggle-collapse-btn"]'],
] as const;
const YOUTUBE = [
  ['settings', '.ytp-settings-button'], ['volume', '.ytp-mute-button'], ['play/pause', '.ytp-play-button'],
  ['fullscreen', '.ytp-fullscreen-button'], ['theatre', '.ytp-size-button'], ['captions', '.ytp-subtitles-button'],
] as const;
const LOCAL = [['play', '#play'], ['volume', '#vol'], ['clip', '#clip'], ['settings', '#settings'], ['theatre', '#theatre'], ['fullscreen', '#full']] as const;

app.whenReady().then(async () => {
  (screen as any).getCursorScreenPoint = () => ({ x: -20000, y: 500 });
  const site = http.createServer((_q, r) => r.writeHead(200, { 'Content-Type': 'text/html' }).end(STAND_IN));
  await new Promise<void>((r) => site.listen(0, '127.0.0.1', () => r()));
  const port = (site.address() as { port: number }).port;
  const st = mkdtempSync(path.join(os.tmpdir(), 'theater-state-'));
  mkdirSync(path.join(st, 'open-urls'));
  const pages = await servePages(path.join(HERE, '..', '..', 'pages'));
  const src = (f: string) => path.join(HERE, '..', '..', 'src', f);
  const b = new AangBrowser({ origin: pages.origin, stateDir: st, preloadPath: src('preload.cjs'), tabPreloadPath: src('tabpreload.cjs'), settingsPreloadPath: src('settingspreload.cjs'), thingsPreloadPath: src('thingspreload.cjs'), testLocal: true } as any) as any;
  wireBrowser(() => b);
  b.open(`http://127.0.0.1:${port}/`);
  await until(() => !!b.win, 8000);
  const w: BrowserWindow = b.win;
  const [SW, SH] = (process.env.THEATER_SIZE || '1440x900').split('x').map(Number);
  w.setSize(SW!, SH!);
  const SCALE = Number(process.env.THEATER_SCALE) || screen.getPrimaryDisplay().scaleFactor;
  const hwnd = (() => { const h = w.getNativeWindowHandle(); return h.length >= 8 ? h.readBigUInt64LE(0) : BigInt(h.readUInt32LE(0)); })();
  const js = (s: string) => w.webContents.executeJavaScript(s, true);
  await until(async () => (await js(`document.readyState === 'complete' && !!document.getElementById('page')`)) === true, 10000);
  await wait(1200);
  const tabView = () => b.cur()?.view;

  // The page-frame (under every view): what is drawn at a window point, and is it a title-bar drag there.
  const frameAt = (x: number, y: number) => js(`(() => { const e = document.elementFromPoint(${x}, ${y}); if (!e) return null;
    let d = 'none'; for (let n = e; n && n.nodeType === 1; n = n.parentElement) { const r = getComputedStyle(n).webkitAppRegion || getComputedStyle(n).getPropertyValue('-webkit-app-region'); if (r === 'drag' || r === 'no-drag') { d = r; break; } }
    return { tag: e.tagName.toLowerCase() + (e.id ? '#' + e.id : '') + (e.className && typeof e.className === 'string' ? '.' + e.className.split(' ')[0] : ''), drag: d }; })()`);

  async function probe(site: string, list: readonly (readonly [string, string])[], required: string[]) {
    const v = tabView();
    if (!v) { check(`${site}: a page view`, false); return; }
    const wc = v.webContents;
    const vb = v.getBounds();
    const zoom = wc.getZoomFactor();
    // Wake the controls: the mouse resting over the player.
    wc.sendInputEvent({ type: 'mouseMove', x: Math.round(vb.width / 3), y: Math.round(vb.height * 0.6) });
    await wait(300);
    wc.sendInputEvent({ type: 'mouseMove', x: Math.round(vb.width / 3) + 4, y: Math.round(vb.height * 0.6) + 4 });
    await wait(300);
    const rects = await wc.executeJavaScript(`(${JSON.stringify(list)}).map(([n, s]) => { const e = [...document.querySelectorAll(s)].find((x) => x.getBoundingClientRect().width > 0); if (!e) return { n, none: true };
      const r = e.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2, hit = document.elementFromPoint(cx, cy);
      return { n, cx, cy, top: r.top, bottom: r.bottom, right: r.right, own: !!hit && (hit === e || e.contains(hit) || hit.contains(e)), hit: hit ? hit.tagName + '.' + String(hit.className).slice(0, 40) : null, vw: innerWidth, vh: innerHeight }; })`, true) as any[];
    const cb = w.getContentBounds();
    const pts: { x: number; y: number }[] = [], rows: any[] = [];
    for (const r of rects) {
      if (r.none) { console.log(`  ${site} ${r.n}: not on the page`); if (required.includes(r.n)) check(`${site}: ${r.n} found`, false); continue; }
      const wx = vb.x + r.cx * zoom, wy = vb.y + r.cy * zoom;
      // Any other Samara layer shown over that window point.
      const over = w.contentView.children.filter((c: any) => c !== v && c.getVisible?.() !== false).filter((c: any) => { const k = c.getBounds(); return k.width > 0 && k.height > 0 && wx >= k.x && wx < k.x + k.width && wy >= k.y && wy < k.y + k.height; });
      const under = await frameAt(wx, wy);
      pts.push({ x: wx, y: wy });
      rows.push({ ...r, wx: Math.round(wx), wy: Math.round(wy), over: over.length, under });
    }
    const ht = process.platform === 'win32' ? await hitTest(hwnd, pts, SCALE) : rows.map(() => 1);
    rows.forEach((r, i) => {
      console.log(`  ${site} ${r.n}: page ${Math.round(r.cx)},${Math.round(r.cy)} (bottom ${Math.round(r.bottom)}/${r.vh}) window ${r.wx},${r.wy} page-hit=${r.own ? 'self' : r.hit} layers-over=${r.over} frame-under=${r.under?.tag}/${r.under?.drag} NCHITTEST=${ht[i]}`);
      check(`${site}: ${r.n} gets the click`, r.over === 0 && ht[i] === 1, `NCHITTEST ${ht[i]}, layers over ${r.over}, frame under ${r.under?.tag} (${r.under?.drag})`);
    });
  }

  console.log(`window ${JSON.stringify(w.getContentBounds())} page view ${JSON.stringify(tabView()?.getBounds())} insets ${JSON.stringify(b.inset)} scale ${screen.getPrimaryDisplay().scaleFactor}`);
  // The whole page area, every 24 px plus its last pixels: Windows must call every point "page" (1), never a drag (2) or
  // a resize edge, whatever layers have come and gone (theater mode puts the controls on the bottom and right edges).
  async function grid(when: string) {
    const vb = tabView()!.getBounds();
    const xs: number[] = [], ys: number[] = [];
    for (let x = vb.x + 1; x < vb.x + vb.width; x += 24) xs.push(x);
    for (let y = vb.y + 1; y < vb.y + vb.height; y += 24) ys.push(y);
    xs.push(vb.x + vb.width - 2); ys.push(vb.y + vb.height - 2);
    const pts = ys.flatMap((y) => xs.map((x) => ({ x, y })));
    const ht = await hitTest(hwnd, pts, SCALE);
    const off = pts.map((p, i) => ({ ...p, h: ht[i] })).filter((p) => p.h !== 1);
    const rows = [...new Set(off.map((p) => p.y))];
    console.log(`  grid ${when}: ${pts.length} points, ${off.length} not page` + (off.length ? ` (codes ${[...new Set(off.map((p) => p.h))].join(',')}; rows ${rows[0]}..${rows.at(-1)}, x ${Math.min(...off.map((p) => p.x))}..${Math.max(...off.map((p) => p.x))})` : ''));
    check(`every point of the page area is page (${when})`, off.length === 0 && ht.length === pts.length, off.slice(0, 6).map((p) => `${p.x},${p.y}=${p.h}`).join(' '));
  }
  await grid('at rest');
  // The tab list and the rune's panel, opened and put away again: their layers must leave nothing behind.
  b.tray(true, { x: 42, y: 62, hy: 80 });
  await wait(900);
  b.tray(false);
  await wait(900);
  await grid('after the tab list');
  b.rune(true, { x: 1000, y: 60, left: 300, right: 1300 });
  await wait(900);
  b.rune(false);
  await wait(700);
  await grid('after the rune panel');
  await probe('stand-in', LOCAL, ['settings']);

  if (!OFFLINE) {
    // Twitch: a live channel from the front page's directory (no login; nothing is clicked but the theater toggle).
    const tw = tabView()!.webContents;
    await tw.loadURL('https://www.twitch.tv/directory/all').catch(() => {});
    let chan = '';
    await until(async () => { chan = await tw.executeJavaScript(`(() => { const a = document.querySelector('a[data-a-target="preview-card-image-link"]'); return a ? a.href : ''; })()`, true); return !!chan; }, 20000);
    console.log('twitch channel: ' + (chan || 'none found'));
    if (chan) {
      await tw.loadURL(chan).catch(() => {});
      const has = await until(async () => (await tw.executeJavaScript(`!!document.querySelector('button[aria-label*="Theatre Mode"]')`, true)) === true, 25000);
      check('twitch: player loaded', has);
      if (process.env.THEATER_DEBUG) console.log('DEBUG ' + await tw.executeJavaScript(`[...document.querySelectorAll('button')].map(b=>(b.getAttribute('data-a-target')||'-')+'|'+(b.getAttribute('aria-label')||'')).filter(x=>/player|theat|setting|chat|collapse/i.test(x)).join('  ')`, true));
      await wait(2500);
      // Mature-content / "start watching" gates: press the page's own accept if it shows (no sign-in).
      await tw.executeJavaScript(`document.querySelector('[data-a-target="content-classification-gate-overlay-start-watching-button"],[data-a-target="player-overlay-mature-accept"]')?.click(); true`, true).catch(() => {});
      await tw.executeJavaScript(`document.querySelector('button[aria-label^="Theatre Mode"]')?.click(); true`, true);
      const theater = await until(async () => (await tw.executeJavaScript(`!!document.querySelector('button[aria-label^="Exit Theatre Mode"]')`, true)) === true, 6000);
      check('twitch: in theater mode', theater);
      await wait(1500);
      await probe('twitch', TWITCH, ['settings', 'volume', 'fullscreen', 'theatre']);
      // A real press on Settings, sent to this hidden page only: its menu must open, stay open and fit in the page.
      const g = await tw.executeJavaScript(`(() => { const e = document.querySelector('[data-a-target="player-settings-button"]'); const r = e.getBoundingClientRect(); return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) }; })()`, true);
      tw.sendInputEvent({ type: 'mouseMove', x: g.x, y: g.y });
      await wait(150);
      tw.sendInputEvent({ type: 'mouseDown', x: g.x, y: g.y, button: 'left', clickCount: 1 });
      tw.sendInputEvent({ type: 'mouseUp', x: g.x, y: g.y, button: 'left', clickCount: 1 });
      await wait(900);
      const menu = await tw.executeJavaScript(`(() => { const m = document.querySelector('[data-a-target="player-settings-menu"]'); if (!m) return null; const r = m.getBoundingClientRect(); return { top: r.top, bottom: r.bottom, left: r.left, right: r.right, vw: innerWidth, vh: innerHeight }; })()`, true);
      console.log('  twitch settings menu: ' + JSON.stringify(menu));
      check('twitch: Settings opens its menu on a press and it stays open', !!menu);
      check('twitch: the Settings menu fits inside the page', !!menu && menu.top >= 0 && menu.bottom <= menu.vh && menu.left >= 0 && menu.right <= menu.vw, JSON.stringify(menu));
    }
    // YouTube for comparison (consent page declined if it shows: nothing is accepted).
    await tw.loadURL('https://www.youtube.com/watch?v=jNQXAC9IVRw').catch(() => {});
    const yt = await until(async () => (await tw.executeJavaScript(`!!document.querySelector('.ytp-size-button')`, true)) === true, 25000);
    check('youtube: player loaded', yt);
    if (yt) {
      await wait(1500);
      await tw.executeJavaScript(`document.querySelector('.ytp-size-button')?.click(); true`, true);
      await wait(1500);
      await probe('youtube', YOUTUBE, ['settings', 'volume', 'fullscreen', 'theatre']);
    }
  }

  console.log(bad ? `FAILED ${bad}` : 'ALL PASS');
  for (const x of BrowserWindow.getAllWindows()) { try { x.destroy(); } catch { /* gone */ } }
  site.close(); pages.close?.();
  app.exit(bad ? 1 : 0);
});
