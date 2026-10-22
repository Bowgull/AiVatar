// 2026-10-22, his ask: "All Claude sessions should be sending mockups to Samara and when a mockup arrives the tab has a
// little very small breathing notification". Throwaway git repos stand in for AangApp and for another session's repo
// (Waymark), and a test server for a live page on this computer; nothing of his is read or written.
//   1. the .mockup file's new kinds (another repo, a live page) and the page server's /r/ door, dot folders refused;
//   2. both open in the MOCKUPS trail, kept in mockups.json with the repo's folder;
//   3. the drawer's arrow breathes when one arrives with the drawer shut, a few times, and stops when he opens it; the
//      new row glows once in the drawer; reduced motion is a still gold dot (pictures: a short strip of the breath);
//   4. a show-only plan (pages on this computer, only looked at) starts with no card and shows its page in the trail.
//
// Run: npx electron test/electron/mockups-anywhere-check.ts   (pictures go to the folder in AANG_SHOTS, if set)
import { app, BrowserWindow, nativeImage, screen } from 'electron';
import http from 'node:http';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
import { servePages } from '../../src/pageserver.ts'; import { AangBrowser } from '../../src/browser.ts'; import { wireBrowser } from '../../src/browseripc.ts';
import { MockServer, MockStore, parseVersioned, takeMockupFile } from '../../src/mockups.ts';
import { PlanMemory, cleanPlan, runPlan, showOnlyPlan } from '../../src/claudeplan.ts';
import { localUrlsIn, showToHim } from '../../src/claudedoor.ts';

process.on('uncaughtException', (e) => { console.log('HARNESS NOTE ' + String((e as Error)?.stack ?? e).split('\n').slice(0, 3).join(' | ')); });
process.on('unhandledRejection', (e) => { console.log('HARNESS REJECTION ' + String((e as Error)?.stack ?? e)); app.exit(2); });
setTimeout(() => { console.log('HARNESS TIMEOUT'); app.exit(3); }, 120_000).unref();
app.on('window-all-closed', () => {});
const HERE = path.dirname(fileURLToPath(import.meta.url));
// Off his screen, never in front of his game.
BrowserWindow.prototype.show = function (this: BrowserWindow) { this.setPosition(-6000, 100); this.showInactive(); };
BrowserWindow.prototype.focus = function () {};
BrowserWindow.prototype.moveTop = function () {};
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
let bad = 0;
const check = (what: string, ok: boolean, d = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${what}${d ? '  -- ' + String(d).slice(0, 240) : ''}`); if (!ok) bad++; };
const until = async (fn: () => boolean, ms = 8000) => { const end = Date.now() + ms; while (Date.now() < end) { if (fn()) return true; await wait(100); } return fn(); };
const SHOTS = process.env.AANG_SHOTS ?? '';

const tmp = mkdtempSync(path.join(os.tmpdir(), 'mock-any-'));
const mkRepo = (name: string) => { const d = path.join(tmp, name); mkdirSync(d, { recursive: true }); execFileSync('git', ['-C', d, 'init', '-q']); return d; };
const put = (d: string, p: string, s: string) => { mkdirSync(path.dirname(path.join(d, p)), { recursive: true }); writeFileSync(path.join(d, p), s); };
const commit = (d: string) => { const g = (...a: string[]) => execFileSync('git', ['-C', d, '-c', 'user.name=t', '-c', 'user.email=t@t', '-c', 'commit.gpgsign=false', ...a], { encoding: 'utf8' }).trim(); g('add', '-A'); g('commit', '-q', '-m', 'c'); return g('rev-parse', 'HEAD'); };
const home = mkRepo('AangApp'), way = mkRepo('Waymark');
put(home, 'docs/cockpit/sheet-1-a.html', '<!doctype html><title>Sheet 1 - A</title><p>a</p>'); commit(home);
put(way, 'docs/motion.html', '<!doctype html><title>Waymark motion</title><link rel="stylesheet" href="motion.css"><p>motion</p>');
put(way, 'docs/motion.css', 'p{color:rgb(9, 8, 7)}'); put(way, '.env/secret.html', 'no'); put(way, '.secret.html', 'no');
const cw = commit(way);

app.whenReady().then(async () => {
  try {
    (screen as any).getCursorScreenPoint = () => ({ x: -20000, y: 500 });
    // ---- 1. the file and the server
    const st = path.join(tmp, 'state'); const urls = path.join(st, 'open-urls'); mkdirSync(urls, { recursive: true });
    let k = 0;
    const drop = (o: unknown) => { const f = path.join(urls, `${Date.now()}-${++k}.mockup`); writeFileSync(f, JSON.stringify(o)); return takeMockupFile(f); };
    const fr = drop({ repo: way, path: 'docs/motion.html', title: 'Waymark motion' });
    check('a .mockup from another repo is taken', fr?.repo === path.resolve(way) && fr?.path === 'docs/motion.html' && fr.url === null, JSON.stringify(fr));
    const fl = drop({ url: 'http://127.0.0.1:5173/rec', title: 'Rec' });
    check('a .mockup for a live local page is taken', fl?.url === 'http://127.0.0.1:5173/rec' && fl.repo === null, JSON.stringify(fl));
    const refused = [{ url: 'https://example.com/' }, { url: 'http://u:p@127.0.0.1/' }, { repo: 'relative/x', path: 'a.html' }, { repo: '\\\\server\\share', path: 'a.html' },
      { repo: way, path: '.env/secret.html' }, { repo: way, path: '../x.html' }, { repo: way, path: 'docs/motion.css' }, { repo: way, path: 'C:/x.html' }].map((o) => drop(o));
    check('bad ones are refused (a web site, a user name, a relative or share repo, dot folders, .., not a page, a drive)', refused.every((x) => x === null), JSON.stringify(refused));
    check('the server door parses /r/<name>/<commit>/<path> and refuses dot paths and bad names', parseVersioned(`/r/Waymark/${cw}/docs/motion.html`)?.repo === 'Waymark'
      && parseVersioned(`/r/Waymark/${cw}/.env/secret.html`) === null && parseVersioned(`/r/../${cw}/docs/motion.html`) === null && parseVersioned(`/r/-x/${cw}/a.html`) === null);
    const store = new MockStore(path.join(tmp, 'm.json'));
    const name = store.repoName(way);
    const srv = new MockServer(home, (n) => store.repoPath(n)); const port = await srv.start();
    const get = (p: string) => new Promise<number>((done) => { http.get({ host: '127.0.0.1', port, path: p, headers: { Host: `127.0.0.1:${port}` } }, (r) => { r.resume(); done(r.statusCode ?? 0); }).on('error', () => done(-1)); });
    check("another repo's page and its stylesheet are served at the commit", (await get(`/r/${name}/${cw}/docs/motion.html`)) === 200 && (await get(`/r/${name}/${cw}/docs/motion.css`)) === 200);
    check('not its dot files, nor an unknown repo name', (await get(`/r/${name}/${cw}/.secret.html`)) === 404 && (await get(`/r/Nope/${cw}/docs/motion.html`)) === 404);
    srv.close();

    // ---- 2. both open in the MOCKUPS trail
    const live = http.createServer((_q, r) => r.writeHead(200, { 'Content-Type': 'text/html' }).end('<!doctype html><title>Recording</title><body style="background:#123">rec</body>'));
    await new Promise<void>((r) => live.listen(0, '127.0.0.1', () => r()));
    const lport = (live.address() as { port: number }).port, liveUrl = `http://127.0.0.1:${lport}/rec`;
    const pages = await servePages(path.join(HERE, '..', '..', 'pages'));
    const b = new AangBrowser({ origin: pages.origin, stateDir: st, repoDir: home, preloadPath: path.join(HERE, '..', '..', 'src', 'preload.cjs'), tabPreloadPath: path.join(HERE, '..', '..', 'src', 'tabpreload.cjs'), settingsPreloadPath: path.join(HERE, '..', '..', 'src', 'settingspreload.cjs'), thingsPreloadPath: path.join(HERE, '..', '..', 'src', 'thingspreload.cjs'), testLocal: true }) as any;
    wireBrowser(() => b);
    const v1 = await b.openMockupDrop(fr!);
    await until(() => b.tabs.some((t: any) => t.mock));
    const tw = () => b.tabs.find((t: any) => t.mock?.sheet === v1?.sheet);
    check("another repo's mockup opens in the MOCKUPS trail as @Waymark/...", v1?.sheet === 'docs/motion.html'.replace(/^/, `@${'Waymark'}/`) && tw()?.trail === -1 && tw()?.title === 'Waymark motion', JSON.stringify({ s: v1?.sheet, t: tw()?.title }));
    await until(() => !tw()?.loading && String(tw()?.view?.webContents.getURL()).includes('/r/'), 8000); await wait(300);
    const css = await tw()!.view.webContents.executeJavaScript(`[...document.styleSheets].filter((x) => x.href).map((x) => x.href + ' ' + x.cssRules.length).join()`).catch(() => '');
    check('its page comes from /r/ at the commit, with its own stylesheet', String(tw()!.view.webContents.getURL()).includes(`/r/Waymark/${cw}/docs/motion.html`) && String(css).includes(`/r/Waymark/${cw}/docs/motion.css 1`), `${tw()!.view.webContents.getURL()} ${css}`);
    const saved = JSON.parse(readFileSync(path.join(st, 'mockups.json'), 'utf8'));
    check("the repo's folder is kept in mockups.json, so old versions still open after a restart", path.resolve(saved.repos?.Waymark ?? '') === path.resolve(way), JSON.stringify(saved.repos));

    // ---- 3. the arrival: the arrow breathes with the drawer shut
    const frame = b.win.webContents;
    await wait(500);
    const n0 = b.mockNew?.n ?? 0;
    const v2 = await b.openMockup(liveUrl, 'Waymark recording');
    const tl = () => b.tabs.find((t: any) => t.mock?.sheet === liveUrl);
    await until(() => !!tl());
    check('a live local page opens in the trail as it is (no commit), V1', v2?.commit === '' && v2?.v === 1 && tl()?.trail === -1 && tl()?.url === liveUrl, JSON.stringify({ c: v2?.commit, u: tl()?.url }));
    check('the arrival is counted', b.mockNew?.n === n0 + 1 && b.mockNew?.sheet === liveUrl);
    await until(() => false, 250);
    const breath = JSON.parse(await frame.executeJavaScript(`JSON.stringify((() => { const k = document.getElementById('drawerkey'); const a = getComputedStyle(k, '::after');
      return { on: k.classList.contains('breathe'), name: a.animationName, dur: a.animationDuration, count: a.animationIterationCount, img: a.backgroundImage, origin: a.transformOrigin }; })())`));
    check('the arrow breathes: handle3-arrow over the handle, 1.6 s, four times, round the arrow', breath.on && breath.name === 'hbreathe' && breath.dur === '1.6s' && breath.count === '4' && /handle3-arrow\.png/.test(breath.img) && breath.origin === '17px 64px', JSON.stringify(breath));
    // A strip of the breath: the handle at five moments of one cycle, side by side, 3x, pixels kept crisp.
    const r = JSON.parse(await frame.executeJavaScript(`JSON.stringify((() => { const x = document.getElementById('drawerkey').getBoundingClientRect(); return { x: Math.round(x.left) - 4, y: Math.round(x.top) + 36, width: 40, height: 56 }; })())`));
    const frames: Electron.NativeImage[] = [];
    // Restart the breath so the strip starts at its beginning.
    await frame.executeJavaScript(`(() => { const k = document.getElementById('drawerkey'); k.classList.remove('breathe'); void k.offsetWidth; k.classList.add('breathe'); return true; })()`);
    const t0 = Date.now();
    for (const at of [0, 250, 800, 1200, 1550]) { await wait(Math.max(0, at - (Date.now() - t0))); frames.push(await frame.capturePage(r)); }
    const lum = frames.map((im) => { const bm = im.toBitmap(); let s = 0; for (let i = 0; i < bm.length; i += 4) s += bm[i]! + bm[i + 1]! + bm[i + 2]!; return s; });
    check('it visibly brightens mid-breath and settles back', lum[2]! > lum[0]! * 1.01 && lum[2]! > lum[4]!, lum.join(','));
    if (SHOTS) {
      const sc = 3, fw = frames[0]!.getSize().width, fh = frames[0]!.getSize().height, gap = 6, W = (fw * sc + gap) * frames.length - gap, H = fh * sc;
      const out = Buffer.alloc(W * H * 4, 0x30);
      frames.forEach((im, f) => { const s = im.toBitmap(), w = im.getSize().width; for (let y = 0; y < H; y++) for (let x = 0; x < fw * sc; x++) { const si = (Math.floor(y / sc) * w + Math.floor(x / sc)) * 4, di = (y * W + f * (fw * sc + gap) + x) * 4; s.copy(out, di, si, si + 4); } });
      writeFileSync(path.join(SHOTS, 'arrow-breath-strip.png'), nativeImage.createFromBitmap(out, { width: W, height: H }).toPNG());
    }
    // He opens the drawer (a DOM click, no real input): the breath stops, and the new row glows once in the drawer.
    await frame.executeJavaScript(`document.getElementById('drawerkey').click(); true`);
    await wait(150);
    check('opening the drawer stops the breath', (await frame.executeJavaScript(`document.getElementById('drawerkey').classList.contains('breathe')`)) === false);
    await until(() => !!b.trayV && !b.trayV.webContents.isDestroyed() && !b.trayV.webContents.isLoading(), 6000); await wait(600);
    const glow = await b.trayV.webContents.executeJavaScript(`JSON.stringify([...document.querySelectorAll('#tabs .tp.mfresh')].map((x) => x.dataset.mock))`).catch((e: Error) => 'ERR ' + e.message);
    if (glow === '[]') console.log('DEBUG rows ' + await b.trayV.webContents.executeJavaScript(`JSON.stringify([...document.querySelectorAll('#tabs .tp')].map((x) => [x.dataset.mock, x.className]))`));
    check('the new mockup\'s row glows in the drawer', JSON.parse(glow).length === 1 && JSON.parse(glow)[0] === liveUrl, glow);
    if (SHOTS) { await wait(500); try { writeFileSync(path.join(SHOTS, 'drawer-glow.png'), (await b.trayV.webContents.capturePage()).toPNG()); } catch (e) { console.log('NOTE no drawer picture: ' + (e as Error).message); } }
    b.tray(false); await wait(400);
    // Reduced motion: a still gold dot instead of the breath.
    frame.debugger.attach('1.3');
    await frame.debugger.sendCommand('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
    await b.openMockup(liveUrl + '?v=2', 'Second'); await wait(400);
    const calm = JSON.parse(await frame.executeJavaScript(`JSON.stringify((() => { const k = document.getElementById('drawerkey'); const a = getComputedStyle(k, '::after'), d = getComputedStyle(k, '::before');
      return { on: k.classList.contains('breathe'), anim: a.animationName, dot: d.content !== 'none' && d.content !== '' , bg: d.backgroundColor, w: d.width }; })())`));
    check('reduced motion: no breath, a still gold dot', calm.on && calm.anim === 'none' && calm.dot && calm.bg === 'rgb(255, 196, 60)' && calm.w === '6px', JSON.stringify(calm));
    if (SHOTS) { try { writeFileSync(path.join(SHOTS, 'arrow-dot.png'), (await frame.capturePage({ ...r, y: r.y - 36, height: 128 + 8 })).resize({ width: r.width * 3, quality: 'good' }).toPNG()); } catch (e) { console.log('NOTE no dot picture: ' + (e as Error).message); } }
    frame.debugger.detach();

    // ---- 4. a show-only plan: no card, its page in the trail
    let asked = 0;
    const realAsk = b.askPlan.bind(b); b.askPlan = async (c: unknown) => { asked++; return realAsk(c); };
    const p = cleanPlan({ task: 'Show Waymark motion', sites: ['127.0.0.1', 'localhost:5173'], steps: [`Open the Waymark motion recording page ${liveUrl.replace('/rec', '/motion')}`], from: 'Waymark' })!;
    check('localhost counts as this computer (it used to drop out of the plan)', p.sites.join() === '127.0.0.1' && showOnlyPlan(p), JSON.stringify(p));
    check('a step that clicks or types is not show-only', !showOnlyPlan(cleanPlan({ task: 'Test it', sites: ['127.0.0.1'], steps: ['Open the app', 'Click Save'] })!));
    check('a plan with a real website is not show-only', !showOnlyPlan(cleanPlan({ task: 'Look', sites: ['127.0.0.1', 'example.com'], steps: ['Open it'] })!));
    const out: any = await runPlan(b, new PlanMemory(st), p, { elicit: false, pending: new Map() });
    check('the show-only plan starts at once, no card', out.ok === true && out.local === true && Number.isInteger(out.job) && asked === 0, JSON.stringify(out));
    check('the page its step names is found', localUrlsIn(p.steps).join() === liveUrl.replace('/rec', '/motion'));
    check('and shown to him in the trail', (await showToHim(b, localUrlsIn(p.steps)[0]!, p.task)) && b.tabs.some((t: any) => t.mock?.sheet === liveUrl.replace('/rec', '/motion') && t.title === 'Show Waymark motion'));
    const fileUrl = 'file:///' + path.join(way, 'docs', 'motion.html').replace(/\\/g, '/');
    check('a committed file page in a git repo is shown as that repo\'s mockup', await showToHim(b, fileUrl, 'Motion file'));
    check('a file outside any repo is not', !(await showToHim(b, 'file:///' + path.join(tmp, 'nowhere.html').replace(/\\/g, '/'), 'x')));
    live.close();
  } catch (e) { console.log('HARNESS ERROR ' + String((e as Error)?.stack ?? e)); bad++; }
  try { rmSync(tmp, { recursive: true, force: true }); } catch { /* temp */ }
  console.log(bad ? `${bad} FAILED` : 'ALL PASS'); app.exit(bad ? 1 : 0);
});
