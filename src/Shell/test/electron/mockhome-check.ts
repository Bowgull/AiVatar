// 2026-10-31 (his pick): every mockup kept in ONE private repo, the mockups home (mockhome.ts). Throwaway folders stand in
// for everything (the home, its GitHub as a bare repo, Samara's own repo, Waymark with no git at all); nothing of his is
// read or written.
//   1. a Samara sheet shown from Samara's repo is copied into the home under samara/ with its helper folder, NOT Samara's
//      art; committed with its filing lines, sent to the "GitHub" remote; Samara's repo is left exactly as it was;
//   2. it opens from the home, and its art comes from Samara's repo as it was when it was shown (not as it is now);
//   3. a page in a folder with no git (Waymark) is kept under waymark/ with the picture it links; dot files stay out;
//   4. the same page shown again unchanged is the same version (no new commit); changed, it is v2;
//   5. his fallback rule: a page Claude committed into the home itself (Samara off) is filed when Samara wakes, once;
//   6. mockup_mark finds a home sheet by its path in its project.
//
// Run: perl -e 'alarm shift; exec @ARGV' 200 node_modules/electron/dist/Electron.app/Contents/MacOS/Electron test/electron/mockhome-check.ts
import { app, BrowserWindow, screen } from 'electron';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import os from 'node:os'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
import { servePages } from '../../src/pageserver.ts'; import { AangBrowser } from '../../src/browser.ts'; import { wireBrowser } from '../../src/browseripc.ts';
import { linksIn, readTrailers, trailers } from '../../src/mockhome.ts';

process.on('uncaughtException', (e) => { console.log('HARNESS NOTE ' + String((e as Error)?.stack ?? e).split('\n').slice(0, 3).join(' | ')); });
process.on('unhandledRejection', (e) => { console.log('HARNESS REJECTION ' + String((e as Error)?.stack ?? e)); app.exit(2); });
setTimeout(() => { console.log('HARNESS TIMEOUT'); app.exit(3); }, 120_000).unref();
app.on('window-all-closed', () => {});
const HERE = path.dirname(fileURLToPath(import.meta.url));
// Off his screen, never in front of his game.
BrowserWindow.prototype.show = function (this: BrowserWindow) { this.setPosition(-6000, 100); this.showInactive(); };
BrowserWindow.prototype.focus = function () {};
BrowserWindow.prototype.moveTop = function () {};
let bad = 0;
const check = (what: string, ok: boolean, d = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${what}${d ? '  -- ' + String(d).slice(0, 240) : ''}`); if (!ok) bad++; };
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

const tmp = realpathSync(mkdtempSync(path.join(os.tmpdir(), 'mock-home-')));
const G = (d: string, ...a: string[]) => execFileSync('git', ['-C', d, '-c', 'user.name=t', '-c', 'user.email=t@t', '-c', 'commit.gpgsign=false', ...a], { encoding: 'utf8' }).trim();
const put = (d: string, p: string, s: string | Buffer) => { mkdirSync(path.dirname(path.join(d, p)), { recursive: true }); writeFileSync(path.join(d, p), s); };
const commit = (d: string, m = 'c') => { G(d, 'add', '-A'); G(d, 'commit', '-q', '-m', m); return G(d, 'rev-parse', 'HEAD'); };

// "GitHub": a bare repo; the home: its clone.
const remote = path.join(tmp, 'remote.git'); execFileSync('git', ['init', '-q', '--bare', '-b', 'main', remote]);
const home = path.join(tmp, 'mockups'); execFileSync('git', ['clone', '-q', remote, home], { stdio: 'ignore' });
G(home, 'config', 'user.name', 't'); G(home, 'config', 'user.email', 't@t'); G(home, 'checkout', '-q', '-b', 'main');
put(home, 'README.md', 'mockups'); commit(home, 'start'); G(home, 'push', '-q', '-u', 'origin', 'main');
// Samara's own repo (named as his is), a sheet with a helper folder and Samara's art.
const sam = path.join(tmp, 'AiVatar'); mkdirSync(sam); G(sam, 'init', '-q');
const S = 'docs/cockpit/sheet-200-home.html';
put(sam, S, '<!doctype html><title>Sheet 200 - Home</title><link rel="stylesheet" href="sheet-200/pic.css"><img src="../../src/Shell/pages/art/cat.png"><img src="sheet-200/a.png" srcset="sheet-200/b.png 2x"><p>v1</p>');
put(sam, 'docs/cockpit/sheet-200/pic.css', 'body{background:url("../../../assets/sky.png")}');
put(sam, 'docs/cockpit/sheet-200/a.png', 'A'); put(sam, 'docs/cockpit/sheet-200/b.png', 'B');
put(sam, 'src/Shell/pages/art/cat.png', 'CAT-OLD'); put(sam, 'assets/sky.png', 'SKY');
const artAt = commit(sam, 'one');
const samStatus = () => G(sam, 'status', '--porcelain') + '|' + G(sam, 'rev-parse', 'HEAD');
// Waymark: no git at all.
const way = path.join(tmp, 'waymark', 'mockups'); mkdirSync(way, { recursive: true });
put(way, '75-ledger.html', '<!doctype html><title>75 · Ledger</title><img src="img/ring.png"><a href=".secret/x.png">x</a><script src="https://cdn.example/x.js"></script>');
put(way, 'img/ring.png', 'RING'); put(way, '.secret/x.png', 'NO');

app.whenReady().then(async () => {
  try {
    (screen as any).getCursorScreenPoint = () => ({ x: -20000, y: 500 });
    // ---- 0. the small parts
    check('links found: src, href, srcset, url(), imports; not web or root addresses', JSON.stringify(linksIn('<img src="a.png"><link href="b.css"><x srcset="c.png 1x, d.png 2x"><s style="background:url(e.png)"><script type=module>import "./f.js"; fetch("g.json")</script><a href="https://x/y"><a href="/z">').sort())
      === JSON.stringify(['./f.js', 'a.png', 'b.css', 'c.png', 'd.png', 'e.png', 'g.json']));
    check('filing lines go out and come back', JSON.stringify(readTrailers('x\n\n' + trailers({ sheet: 'samara/docs/a.html', title: '1 · A', topic: 'Bar', project: 'Samara' })))
      === JSON.stringify({ sheet: 'samara/docs/a.html', title: '1 · A', topic: 'Bar', project: 'Samara', icon: '', art: '' }));
    check('a filing line with .. or no folder is no page', readTrailers('Mockup: ../x.html') === null && readTrailers('Mockup: x.html') === null);

    const st = path.join(tmp, 'state'); mkdirSync(st, { recursive: true });
    const pages = await servePages(path.join(HERE, '..', '..', 'pages'));
    const P = (f: string) => path.join(HERE, '..', '..', 'src', f);
    const b = new AangBrowser({ origin: pages.origin, stateDir: st, repoDir: path.join(tmp, 'no-repo-here'), mockupsAnywhere: true, mockHome: home,
      preloadPath: P('preload.cjs'), tabPreloadPath: P('tabpreload.cjs'), settingsPreloadPath: P('settingspreload.cjs'), thingsPreloadPath: P('thingspreload.cjs'), testLocal: true }) as any;
    wireBrowser(() => b);
    await b.mockReady;

    // ---- 1. a Samara sheet
    const before = samStatus();
    const v1 = await b.openMockupDrop({ repo: sam, path: S, url: null, title: '200 · Home', branch: 'Top bar', project: 'Samara', icon: 'bar' });
    check('a Samara sheet opens from the home', v1?.sheet === `@mockups/samara/${S}`, JSON.stringify(v1));
    const has = (p: string) => existsSync(path.join(home, p));
    check('its page and helper folder are in the home under samara/', has(`samara/${S}`) && has('samara/docs/cockpit/sheet-200/pic.css') && has('samara/docs/cockpit/sheet-200/a.png') && has('samara/docs/cockpit/sheet-200/b.png'));
    check("Samara's art is not copied", !has('samara/src/Shell/pages/art/cat.png') && !has('samara/assets/sky.png'));
    const msg = G(home, 'log', '-1', '--format=%B');
    check('committed with its filing lines and the Samara commit it was shown at', /^Mockup: samara\/docs\/cockpit\/sheet-200-home\.html$/m.test(msg) && /^Topic: Top bar$/m.test(msg) && new RegExp(`^Samara-Art: ${artAt}$`, 'm').test(msg), msg);
    check('its commit is the version', v1?.commit === G(home, 'rev-parse', 'HEAD'));
    let pushed = false; for (let i = 0; i < 50 && !pushed; i++) { await wait(100); pushed = G(remote, 'rev-parse', 'main') === G(home, 'rev-parse', 'HEAD'); }
    check('sent to GitHub (the remote has it)', pushed);
    check("Samara's own repo is untouched", samStatus() === before, samStatus());
    check('filed in its project and topic', b.mockStore.projectOf(v1.sheet) === 'Samara' && b.mockStore.branches.some((x: any) => x.name === 'Top bar' && x.project === 'Samara' && x.icon === 'bar'));

    // ---- 2. served from the home; the art as it was
    put(sam, 'src/Shell/pages/art/cat.png', 'CAT-NEW'); commit(sam, 'newer art');
    const base = b.mockServer.url(v1.commit, v1.sheet);
    const get = async (rel: string) => { const r = await fetch(new URL(rel, base)); return r.ok ? await r.text() : `HTTP ${r.status}`; };
    check('the page opens from the home', (await get('')).includes('<p>v1</p>'));
    check('its helper files open', (await get('sheet-200/pic.css')).includes('sky.png') && (await get('sheet-200/a.png')) === 'A');
    check("Samara's art opens as it was when shown", (await get('../../src/Shell/pages/art/cat.png')) === 'CAT-OLD');
    check("an asset linked from its style sheet opens too", (await get('../../assets/sky.png')) === 'SKY');
    check('anything else outside the home is a 404', (await get('../../src/Shell/src/main.ts')).startsWith('HTTP 404'));

    // ---- 3. a page with no git
    const w = await b.openMockupDrop({ repo: way, path: '75-ledger.html', url: null, title: '75 · Ledger', branch: 'Ledger', project: 'Waymark', icon: null });
    check('a page in no git repo is kept under waymark/ and opens', w?.sheet === '@mockups/waymark/75-ledger.html' && (await fetch(b.mockServer.url(w.commit, w.sheet)).then((r) => r.text())).includes('Ledger'));
    check('with the picture it links, and no dot folder', has('waymark/img/ring.png') && !has('waymark/.secret/x.png'));
    check('in the Waymark project', b.mockStore.projectOf(w.sheet) === 'Waymark');

    // ---- 4. versions
    const n0 = G(home, 'rev-list', '--count', 'HEAD');
    const w2 = await b.openMockupDrop({ repo: way, path: '75-ledger.html', url: null, title: '75 · Ledger', branch: 'Ledger', project: 'Waymark', icon: null });
    check('shown again unchanged: the same version, no new commit', w2?.v === 1 && w2?.commit === w.commit && G(home, 'rev-list', '--count', 'HEAD') === n0);
    put(way, '75-ledger.html', '<!doctype html><title>75 · Ledger</title><p>two</p>');
    const w3 = await b.openMockupDrop({ repo: way, path: '75-ledger.html', url: null, title: '75 · Ledger', branch: 'Ledger', project: 'Waymark', icon: null });
    check('changed: v2 of the same sheet, and v1 still opens as it was', w3?.v === 2 && w3.sheet === w.sheet && (await fetch(b.mockServer.url(w.commit, w.sheet)).then((r) => r.text())).includes('ring.png'));

    // ---- 5. the fallback rule: Claude kept one while Samara was off
    put(home, 'couch-mode/mockups/07-embers.html', '<!doctype html><title>07 · Embers</title><p>embers</p>');
    commit(home, 'Couch Mode: embers\n\nMockup: couch-mode/mockups/07-embers.html\nTitle: 07 · Embers\nTopic: Campfire\nProject: Couch Mode');
    const filed = await b.mockHomeWake();
    const e = b.mockStore.list.find((x: any) => x.sheet === '@mockups/couch-mode/mockups/07-embers.html');
    check('a page Claude committed itself is filed when Samara wakes, NEW, in its project and topic', filed === 1 && !!e && b.mockStore.projectOf(e.sheet) === 'Couch Mode'
      && b.mockStore.meta.get(e.sheet)?.fresh === true && b.mockStore.branches.some((x: any) => x.name === 'Campfire' && x.project === 'Couch Mode'), JSON.stringify({ filed, e }));
    check('and only once', (await b.mockHomeWake()) === 0);
    check("Samara's own shows are not filed twice", b.mockStore.list.filter((x: any) => x.sheet === v1.sheet).length === 1);
    check('the fallback commit is sent to GitHub too', await (async () => { for (let i = 0; i < 50; i++) { if (G(remote, 'rev-parse', 'main') === G(home, 'rev-parse', 'HEAD')) return true; await wait(100); } return false; })());

    // ---- 6. marks
    check('mockup_mark finds a home sheet by its path in its project', b.mockMark({ repo: sam, sheet: S, v: null, stage: 'fix', said: '', note: 'bigger' }) === ''
      && b.mockStore.list.find((x: any) => x.id === v1.id)?.stage === 'fix');
    check('the state file remembers the home by name', JSON.parse(readFileSync(path.join(st, 'mockups.json'), 'utf8')).repos.mockups === home);
  } catch (e) { console.log('FAIL  threw: ' + String((e as Error)?.stack ?? e)); bad++; }
  console.log(bad ? `${bad} FAILED` : 'ALL PASS');
  app.exit(bad ? 1 : 0);
});
