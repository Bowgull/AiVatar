// Dragging, smoother (his ask, 2026-10-21): the tab drawer's drag and drop, driven with pointer events made inside the
// page (never real mouse or keys). Onto a row makes a child; sliding right or left in a gap changes the depth; loops and bad
// ids are refused; several picked tabs move together in order; a folded trail opens while hovered; Esc puts it back; a
// plain click still only switches; a trail moves by its heading; a mockup dropped on a mockup becomes its child (history
// kept) and slides back out; a plain tab never goes into MOCKUPS; mockup rows wear Claude's icon. One picture mid-drag.
//
// Run: npx electron test/electron/drag-check.ts [picture.png]
import { app, BrowserWindow, screen } from 'electron';
import http from 'node:http';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
import { servePages } from '../../src/pageserver.ts'; import { AangBrowser } from '../../src/browser.ts'; import { wireBrowser } from '../../src/browseripc.ts';
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
const check = (what: string, ok: boolean, d = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${what}${d ? '  -- ' + String(d).slice(0, 260) : ''}`); if (!ok) bad++; };
const until = async (fn: () => boolean, ms = 6000) => { const end = Date.now() + ms; while (Date.now() < end) { if (fn()) return true; await wait(80); } return fn(); };
const PIC = process.argv.find((a) => a.endsWith('.png')) ?? path.join(os.tmpdir(), 'drag-mid.png');

// A stand-in repo for the mockups part (nothing of his is read or written).
const repo = mkdtempSync(path.join(os.tmpdir(), 'drag-repo-'));
const g = (...a: string[]) => execFileSync('git', ['-C', repo, '-c', 'user.name=t', '-c', 'user.email=t@t', '-c', 'commit.gpgsign=false', ...a], { encoding: 'utf8' }).trim();
const put = (p: string, s: string) => { mkdirSync(path.dirname(path.join(repo, p)), { recursive: true }); writeFileSync(path.join(repo, p), s); };
const S45 = 'docs/cockpit/sheet-45-both-ways.html', S46 = 'docs/cockpit/sheet-46-one-cockpit.html';
g('init', '-q');
put(S45, '<!doctype html><title>Sheet 45 - Both ways</title><body>45</body>');
put(S46, '<!doctype html><title>Sheet 46 - One cockpit</title><body>46</body>');
g('add', '-A'); g('commit', '-q', '-m', 'one');

// In the page: pointer events made by the page itself, at a row's own spot.
const HELP = `(() => {
  const tabs = document.getElementById('tabs');
  window.__ev = (type, x, y, o = {}) => {
    const t = (type === 'pointerdown' ? document.elementFromPoint(x, y) : null) || tabs;
    t.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, composed: true, clientX: x, clientY: y, pointerId: 7, pointerType: 'mouse', isPrimary: true,
      button: type === 'pointermove' ? -1 : 0, buttons: type === 'pointerup' ? 0 : 1, ...o }));
    return true;
  };
  window.__at = (sel, fx = 0.3, fy = 0.5) => { const n = document.querySelector(sel); if (!n) return null; const r = n.getBoundingClientRect(); return { x: r.left + r.width * fx, y: r.top + r.height * fy, top: r.top, bottom: r.bottom, left: r.left }; };
  // Room for every row without scrolling: the bookmarks shelf is put away for the test.
  const sh = document.querySelector('.shelf-bk'); if (sh) sh.style.display = 'none';
  return true;
})()`;

app.whenReady().then(async () => {
  (screen as any).getCursorScreenPoint = () => ({ x: -20000, y: 500 });
  const site = http.createServer((_q, r) => r.writeHead(200, { 'Content-Type': 'text/html' }).end('<!doctype html><title>Page</title><body>page</body>'));
  await new Promise<void>((r) => site.listen(0, '127.0.0.1', () => r()));
  const port = (site.address() as { port: number }).port;
  const st = mkdtempSync(path.join(os.tmpdir(), 'drag-state-'));
  mkdirSync(path.join(st, 'open-urls'));
  const pages = await servePages(path.join(HERE, '..', '..', 'pages'));
  const b = new AangBrowser({ origin: pages.origin, stateDir: st, repoDir: repo, preloadPath: path.join(HERE, '..', '..', 'src', 'preload.cjs'), tabPreloadPath: path.join(HERE, '..', '..', 'src', 'tabpreload.cjs'), settingsPreloadPath: path.join(HERE, '..', '..', 'src', 'settingspreload.cjs'), thingsPreloadPath: path.join(HERE, '..', '..', 'src', 'thingspreload.cjs'), testLocal: true } as any) as any;
  wireBrowser(() => b);
  const u = (q: string) => `http://127.0.0.1:${port}/?${q}`;
  b.open(u('a'));
  await until(() => b.tabs.length === 1 && !!b.win);
  const A = b.tabs[0].id;
  const B = b.newTab(u('b'), null, false), C = b.newTab(u('c'), null, false), D = b.newTab(u('d'), null, false), E = b.newTab(u('e'), null, false);
  b.moveTab(A, 'new'); const T1 = b.tabs.find((t: any) => t.id === A).trail; b.moveTab(B, T1);
  b.moveTab(C, 'new'); const T2 = b.tabs.find((t: any) => t.id === C).trail;
  const w: BrowserWindow = b.win; w.setSize(1280, 1100);
  const frame = w.webContents;
  await until(() => !frame.isLoading()); await wait(600);
  await frame.executeJavaScript("document.body.classList.add('drawer-open'); true");
  await frame.executeJavaScript(HELP);
  await wait(500);
  const tab = (id: number) => b.tabs.find((t: any) => t.id === id);
  const js = (s: string) => frame.executeJavaScript(s);
  const at = async (sel: string, fx = 0.3, fy = 0.5) => js(`window.__at(${JSON.stringify(sel)}, ${fx}, ${fy})`) as Promise<{ x: number; y: number; top: number; bottom: number; left: number } | null>;
  const ev = (type: string, x: number, y: number, o: object = {}) => js(`window.__ev(${JSON.stringify(type)}, ${x}, ${y}, ${JSON.stringify(o)})`);
  /**
   * Press on one spot, glide to another in small steps, hold, and (unless told not to) let go. The rows slide apart as it
   * moves, so a target given as a function is read again once the gap has opened, the way his eye follows the rows.
   */
  type P = { x: number; y: number };
  const drag = async (from: P, to: P | (() => Promise<P>), o: { hold?: number; up?: boolean; mods?: object } = {}) => {
    const spot = async () => (typeof to === 'function' ? await to() : to);
    await ev('pointerdown', from.x, from.y, o.mods ?? {});
    let p = await spot(), last = from;
    for (let pass = 0; pass < (typeof to === 'function' ? 3 : 1); pass++) {
      for (let i = 1; i <= 8; i++) { await ev('pointermove', last.x + (p.x - last.x) * i / 8, last.y + (p.y - last.y) * i / 8); await wait(25); }
      last = p; await wait(220); p = await spot();
    }
    await wait(o.hold ?? 120);
    if (o.up !== false) { await ev('pointerup', last.x, last.y); await wait(450); }
    return last;
  };
  const row = (id: number) => `#tabs .tp[data-tab="${id}"]`;
  const head = (id: number) => `#tabs .th[data-trail="${id}"]`;
  const order = () => b.tabs.map((t: any) => t.id);

  // ---- 1. onto the middle of a row: a child of it
  {
    const from = await at(row(B)), to = await at(row(A));
    await drag(from!, to!);
    check('dropped onto A, B becomes its child (in its trail)', tab(B).opener === A && tab(B).trail === T1, JSON.stringify({ o: tab(B).opener, t: tab(B).trail }));
    check('the drawer draws B under A', await js(`document.querySelector('${row(B)}').classList.contains('kid')`) === true);
  }
  // ---- 2. sliding right in a gap tucks it under the row above; a picture of the gap and the line
  {
    const from = await at(row(D));
    // Just above T2's heading, where it shows now, one indent step to the right.
    const end = await drag(from!, async () => ({ x: from!.x + 24, y: (await at(head(T2)))!.top - 7 }), { up: false, hold: 400 });
    const mid = JSON.parse(await js(`JSON.stringify({ line: !!document.querySelector('#tabs .dropmark.d1'), ghost: !!document.querySelector('#tabs .dragghost'),
      shifted: getComputedStyle(document.querySelector('${head(T2)}')).transform, lifted: document.querySelector('${row(D)}').classList.contains('lifted') })`));
    check('mid-drag: the ghost, the lifted row, a gold line one step in, and the rows below slid apart', mid.line && mid.ghost && mid.lifted && mid.shifted !== 'none', JSON.stringify(mid));
    const img = await w.webContents.capturePage();
    writeFileSync(PIC, img.toPNG());
    console.log('picture: ' + PIC);
    await ev('pointerup', end.x, end.y); await wait(450);
    check('slid right: D goes under A, at the end of the trail', tab(D).trail === T1 && tab(D).opener === A && order().indexOf(D) === order().indexOf(B) + 1, JSON.stringify({ o: tab(D).opener, t: tab(D).trail, order: order() }));
  }
  // ---- 3. sliding left pulls it back out
  {
    const from = await at(row(D));
    await drag(from!, async () => ({ x: from!.x - 24, y: (await at(head(T2)))!.top - 7 }));
    check('slid left: D is out from under A, still in the trail', tab(D).trail === T1 && tab(D).opener === null, JSON.stringify({ o: tab(D).opener, t: tab(D).trail }));
  }
  // ---- 4. refused: loops, itself, a child as parent, bad ids
  {
    const snap = () => JSON.stringify(b.tabs.map((t: any) => [t.id, t.trail, t.opener]));
    const was = snap();
    tab(C).opener = A;   // C (top of T2) came from A: A under C would be A under its own child
    const sends = [
      { act: 'place', tabs: [A], trail: T2, before: null, parent: C },
      { act: 'place', tabs: [A], trail: T1, before: null, parent: A },
      { act: 'place', tabs: [D], trail: T1, before: null, parent: B },
      { act: 'place', tabs: 'x', trail: T1 }, { act: 'place', tabs: [], trail: T1 }, { act: 'place', tabs: [1.5], trail: T1 }, { act: 'place', tabs: [A, A], trail: T1 },
      { act: 'place', tabs: [99999], trail: T1 }, { act: 'place', tabs: [D], trail: '1' }, { act: 'place', tabs: [D], trail: 99999 }, { act: 'place', tabs: [D], trail: T1, parent: 'x' },
      { act: 'place', tabs: [D], trail: T1, before: D }, { act: 'place', tabs: [D], trail: null, parent: A }, { act: 'place', tabs: [D], trail: T1, parent: 99999 },
      { act: 'place', tabs: new Array(61).fill(D) },
    ];
    await js(`(${JSON.stringify(sends)}).forEach((a) => window.aang.browserTrail(a)); true`); await wait(500);
    const now = JSON.parse(snap()).map((x: any) => (x[0] === C ? [x[0], x[1], null] : x));
    check('loops, itself, a child as parent and bad fields are all refused', JSON.stringify(now) === JSON.stringify(JSON.parse(was)) && tab(A).opener === null, snap());
    tab(C).opener = null;
  }
  // ---- 5. a plain click only switches
  {
    const was = JSON.stringify(order());
    const p = await at(row(C));
    await ev('pointerdown', p!.x, p!.y); await ev('pointerup', p!.x, p!.y); await wait(400);
    check('a plain click switches to the tab and moves nothing', b.active === C && JSON.stringify(order()) === was && !(await js(`!!document.querySelector('#tabs .dragghost')`)));
  }
  // ---- 6. several: Ctrl-click picks, dragging one moves them all, in order
  {
    const F = b.newTab(u('f'), null, false), G = b.newTab(u('g'), null, false); await wait(400);
    const pf = await at(row(F)); await ev('pointerdown', pf!.x, pf!.y); await ev('pointerup', pf!.x, pf!.y);
    await until(() => b.active === F); await wait(300);
    const pg = await at(row(G)); await ev('pointerdown', pg!.x, pg!.y, { ctrlKey: true }); await ev('pointerup', pg!.x, pg!.y, { ctrlKey: true }); await wait(200);
    const pickedNow = await js(`[...document.querySelectorAll('#tabs .tp.picked')].map((n) => +n.dataset.tab).join()`);
    check('Ctrl-click picks it, with the tab he is on; both wear the gold ring', pickedNow === `${F},${G}`, pickedNow);
    check('Ctrl-click does not switch', b.active === F);
    const from = await at(row(G));
    await drag(from!, async () => ({ x: from!.x, y: (await at(row(C)))!.bottom + 6 }));
    const o = order();
    check('both go into the trail together, keeping their order', tab(F).trail === T2 && tab(G).trail === T2 && o.indexOf(G) === o.indexOf(F) + 1 && o.indexOf(F) > o.indexOf(C), JSON.stringify({ o, f: tab(F).trail, g: tab(G).trail }));
    check('the picks clear after the drop', (await js(`document.querySelectorAll('#tabs .tp.picked').length`)) === 0);
  }
  // ---- 7. a folded trail opens while he hovers it; Esc puts everything back
  {
    b.trailAct(T1, 'collapse'); await wait(400);
    check('T1 is folded', b.trails.find((x: any) => x.id === T1).collapsed === true);
    const was = JSON.stringify(b.tabs.map((t: any) => [t.id, t.trail, t.opener]));
    const from = await at(row(E));
    const h1 = await drag(from!, async () => (await at(head(T1), 0.5, 0.5))!, { up: false, hold: 900 });
    check('hovered for 600 ms, T1 opened', b.trails.find((x: any) => x.id === T1).collapsed !== true);
    await frame.executeJavaScript(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); true`); await wait(300);
    await ev('pointerup', h1.x, h1.y); await wait(300);
    const gone = await js(`!document.querySelector('#tabs .dragghost, #tabs .dropmark, #tabs .lifted')`);
    check('Esc cancels: nothing moved, ghost and line gone', gone && JSON.stringify(b.tabs.map((t: any) => [t.id, t.trail, t.opener])) === was);
  }
  // ---- 8. a whole trail by its heading
  {
    const from = await at(head(T2), 0.5, 0.5), to = await at(head(T1), 0.5, 0.2);
    await drag(from!, to!);
    const ids = b.trails.map((x: any) => x.id);
    check('dragging T2 by its heading puts it before T1', ids.indexOf(T2) < ids.indexOf(T1), JSON.stringify(ids));
  }
  // ---- 9. the MOCKUPS trail
  {
    await b.openMockup(S45, '45 · Both ways'); await b.openMockup(S46, '46 · One cockpit');
    await until(() => b.tabs.filter((t: any) => t.mock).length === 2); await wait(600);
    const M45 = b.tabs.find((t: any) => t.mock?.sheet === S45).id, M46 = b.tabs.find((t: any) => t.mock?.sheet === S46).id;
    check('both mockups are top level to start', b.mockStore.placeOf(S46).parent === null && b.mockStore.placeOf(S45).parent === null);
    const icons = JSON.parse(await js(`JSON.stringify([...document.querySelectorAll('#tabs .tp[data-mock]')].map((r) => r.querySelector('img.fi')?.getAttribute('src')))`));
    check('every mockup row wears Claude\'s icon', icons.length === 2 && icons.every((s: string) => s === 'art/claude-icon.png'), JSON.stringify(icons));
    const versions = b.mockStore.list.length;
    await drag((await at(row(M46)))!, (await at(row(M45)))!);
    check('a mockup dropped on another becomes its child', b.mockStore.placeOf(S46).parent === S45, JSON.stringify(b.mockStore.placeOf(S46)));
    const saved = JSON.parse(readFileSync(path.join(st, 'mockups.json'), 'utf8'));
    check('the history is kept, and the tree is saved', b.mockStore.list.length === versions && saved.versions.length === versions && JSON.stringify(saved.places).includes(S46), JSON.stringify(saved.places));
    check('the drawer draws it as a child', await js(`document.querySelector('${row(M46)}').classList.contains('kid')`) === true);
    // Slide it back out: just under 45, one step to the left.
    const p46 = await at(row(M46)), p45 = await at(row(M45));
    await drag(p46!, { x: p46!.x - 26, y: p45!.bottom + 4 });
    check('slid left out from under 45: top level again, history kept', b.mockStore.placeOf(S46).parent === null && b.mockStore.list.length === versions, JSON.stringify(b.mockStore.placeOf(S46)));
    // The old rules: a plain tab never goes in; a mockup never comes out.
    await drag((await at(row(C)))!, (await at(row(M45)))!);
    { const pc = await at(row(C)), pm = await at(row(M45)); await drag(pc!, { x: pc!.x, y: pm!.bottom + 4 }); }
    check('a plain tab is never taken into MOCKUPS', tab(C).trail !== -1 && b.mockStore.placeOf(S45).parent === null);
    await drag((await at(row(M45)))!, (await at(head(T2), 0.5, 0.5))!);
    check('a mockup is never taken out of MOCKUPS', tab(M45).trail === -1);
  }

  console.log(bad ? `${bad} FAILED` : 'ALL PASS'); app.exit(bad ? 1 : 0);
});
