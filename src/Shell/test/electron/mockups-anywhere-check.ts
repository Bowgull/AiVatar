// 2026-10-22, his ask: "All Claude sessions should be sending mockups to Samara and when a mockup arrives the tab has a
// little very small breathing notification". Throwaway git repos stand in for AangApp and for another session's repo
// (Waymark), and a test server for a live page on this computer; nothing of his is read or written.
//   1. the .mockup file's new kinds (another repo, a live page) and the page server's /r/ door, dot folders refused;
//   2. both open in Mockups (sheet 107: right on them, in front, so no breathing arrow is needed any more), kept in
//      mockups.json with the repo's folder;
//   4. a show-only plan (pages on this computer, only looked at) starts with no card and shows its page in Mockups.
//
// Run: npx electron test/electron/mockups-anywhere-check.ts
import { app, BrowserWindow, screen } from 'electron';
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

    // ---- 2. both open in Mockups, right on them (sheet 107)
    const live = http.createServer((_q, r) => r.writeHead(200, { 'Content-Type': 'text/html' }).end('<!doctype html><title>Recording</title><body style="background:#123">rec</body>'));
    await new Promise<void>((r) => live.listen(0, '127.0.0.1', () => r()));
    const lport = (live.address() as { port: number }).port, liveUrl = `http://127.0.0.1:${lport}/rec`;
    const pages = await servePages(path.join(HERE, '..', '..', 'pages'));
    const b = new AangBrowser({ origin: pages.origin, stateDir: st, repoDir: home, preloadPath: path.join(HERE, '..', '..', 'src', 'preload.cjs'), tabPreloadPath: path.join(HERE, '..', '..', 'src', 'tabpreload.cjs'), settingsPreloadPath: path.join(HERE, '..', '..', 'src', 'settingspreload.cjs'), thingsPreloadPath: path.join(HERE, '..', '..', 'src', 'thingspreload.cjs'), testLocal: true }) as any;
    wireBrowser(() => b);
    const v1 = await b.openMockupDrop(fr!);
    const lwc = () => b.tabs.find((t: any) => t.internal === 'mocklog')?.view?.webContents;
    await until(() => Boolean(lwc()) && !lwc().isLoading(), 10000); await wait(900);
    const src = () => lwc().executeJavaScript(`document.querySelector('.frame iframe')?.getAttribute('src') ?? ''`);
    check("another repo's mockup opens in Mockups as @Waymark/..., no tab of its own", v1?.sheet === '@Waymark/docs/motion.html' && !b.tabs.some((t: any) => t.mock) && b.cur()?.internal === 'mocklog', JSON.stringify({ s: v1?.sheet }));
    check('its page comes from /r/ at the commit', String(await src()).includes(`/r/Waymark/${cw}/docs/motion.html`), String(await src()));
    const saved = JSON.parse(readFileSync(path.join(st, 'mockups.json'), 'utf8'));
    check("the repo's folder is kept in mockups.json, so old versions still open after a restart", path.resolve(saved.repos?.Waymark ?? '') === path.resolve(way), JSON.stringify(saved.repos));
    const v2 = await b.openMockup(liveUrl, 'Waymark recording'); await wait(900);
    check('a live local page opens in Mockups as it is (no commit), V1', v2?.commit === '' && v2?.v === 1 && String(await src()) === liveUrl, String(await src()));

    // ---- 4. a show-only plan: no card, its page in Mockups
    let asked = 0;
    const realAsk = b.askPlan.bind(b); b.askPlan = async (c: unknown) => { asked++; return realAsk(c); };
    const p = cleanPlan({ task: 'Show Waymark motion', sites: ['127.0.0.1', 'localhost:5173'], steps: [`Open the Waymark motion recording page ${liveUrl.replace('/rec', '/motion')}`], from: 'Waymark' })!;
    check('localhost counts as this computer (it used to drop out of the plan)', p.sites.join() === '127.0.0.1' && showOnlyPlan(p), JSON.stringify(p));
    check('a step that clicks or types is not show-only', !showOnlyPlan(cleanPlan({ task: 'Test it', sites: ['127.0.0.1'], steps: ['Open the app', 'Click Save'] })!));
    check('a plan with a real website is not show-only', !showOnlyPlan(cleanPlan({ task: 'Look', sites: ['127.0.0.1', 'example.com'], steps: ['Open it'] })!));
    const out: any = await runPlan(b, new PlanMemory(st), p, { elicit: false, pending: new Map() });
    check('the show-only plan starts at once, no card', out.ok === true && out.local === true && Number.isInteger(out.job) && asked === 0, JSON.stringify(out));
    check('the page its step names is found', localUrlsIn(p.steps).join() === liveUrl.replace('/rec', '/motion'));
    check('and shown to him in Mockups', (await showToHim(b, localUrlsIn(p.steps)[0]!, p.task)) && b.mockFocus?.sheet === liveUrl.replace('/rec', '/motion') && b.cur()?.internal === 'mocklog');
    const fileUrl = 'file:///' + path.join(way, 'docs', 'motion.html').replace(/\\/g, '/');
    check('a committed file page in a git repo is shown as that repo\'s mockup', await showToHim(b, fileUrl, 'Motion file'));
    check('a file outside any repo is not', !(await showToHim(b, 'file:///' + path.join(tmp, 'nowhere.html').replace(/\\/g, '/'), 'x')));
    live.close();
  } catch (e) { console.log('HARNESS ERROR ' + String((e as Error)?.stack ?? e)); bad++; }
  try { rmSync(tmp, { recursive: true, force: true }); } catch { /* temp */ }
  console.log(bad ? `${bad} FAILED` : 'ALL PASS'); app.exit(bad ? 1 : 0);
});
