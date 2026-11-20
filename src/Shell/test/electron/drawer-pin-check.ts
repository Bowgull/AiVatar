// The tab drawer must not change (his rule, 2026-11-20: "i dont want to change any behaviour of the side drawer or its
// looks"). This opens the real tab list layer with tabs, bookmarks and the folded handle, reads every computed style of
// every element in the drawer, its handle and the band's folded handle, and compares them with the fingerprint taken
// from the code before the look work (test/fixtures/drawer-pin.json). Any difference fails and is listed.
// Run: npx electron test/electron/drawer-pin-check.ts           (check)
//      PIN_WRITE=1 npx electron test/electron/drawer-pin-check.ts (write the fingerprint; only on unchanged code)
import { app, BrowserWindow } from 'electron';
import http from 'node:http';
import { mkdtempSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import os from 'node:os';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
process.on('uncaughtException', (e) => console.log('HARNESS NOTE ' + (e as Error).message));
setTimeout(() => { console.log('HARNESS TIMEOUT'); app.exit(3); }, 120_000).unref();
const HERE = path.dirname(fileURLToPath(import.meta.url));
const PIN = path.join(HERE, '..', 'fixtures', 'drawer-pin.json');
app.setPath('userData', mkdtempSync(path.join(os.tmpdir(), 'dpin-ud-')));
app.commandLine.appendSwitch('disable-backgrounding-occluded-windows');
app.on('window-all-closed', () => {});
BrowserWindow.prototype.show = function (this: BrowserWindow) { this.setOpacity(0); this.showInactive(); };
BrowserWindow.prototype.focus = function () {};
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
/** Every element under the roots, with its computed style (and ::before/::after), keyed by its place in the tree. */
const DUMP = `(() => {
  const out = {};
  // Custom properties (--name) are left out: one the drawer does not use changes nothing it draws, and one it does use
  // shows up in the real property it feeds.
  const props = (cs) => { const o = []; for (let i = 0; i < cs.length; i++) { const k = cs[i]; if (k.startsWith('--')) continue; o.push(k + ':' + cs.getPropertyValue(k)); } return o.sort().join(';'); };
  const name = (e) => { const p = []; for (let x = e; x && x !== document.documentElement; x = x.parentElement) { let i = 0; for (let s = x.previousElementSibling; s; s = s.previousElementSibling) i++; p.unshift(x.tagName.toLowerCase() + (x.id ? '#' + x.id : '') + '[' + i + ']'); } return p.join('>'); };
  for (const sel of ROOTS) for (const root of document.querySelectorAll(sel)) for (const e of [root, ...root.querySelectorAll('*')]) {
    if (e.closest('.sndmark')) continue;   // the sound mark is new on the handle and has its own check
    out[name(e)] = props(getComputedStyle(e)) + '|B|' + props(getComputedStyle(e, '::before')) + '|A|' + props(getComputedStyle(e, '::after')) + '|T|' + (e.children.length ? '' : e.textContent) + '|C|' + e.className + '|R|' + [...e.attributes].filter((a) => a.name !== 'class' && a.name !== 'style').map((a) => a.name + '=' + a.value).sort().join(',');
  }
  return out;
})()`;
app.whenReady().then(async () => {
  http.createServer((q, r) => r.writeHead(200, { 'Content-Type': 'text/html' }).end(`<!doctype html><title>Page ${q.url}</title><p>${q.url}`)).listen(47997, '127.0.0.1');
  const { servePages } = await import('../../src/pageserver.ts');
  const { AangBrowser } = await import('../../src/browser.ts');
  const { wireBrowser } = await import('../../src/browseripc.ts');
  const pages = await servePages(path.join(HERE, '..', '..', 'pages'));
  const stateDir = mkdtempSync(path.join(os.tmpdir(), 'dpin-state-'));
  writeFileSync(path.join(stateDir, 'browser-tabs.json'), JSON.stringify({ v: 1, active: 1, fronts: [1], tabs: [0, 1, 2, 3].map((i) => ({ url: `http://127.0.0.1:47997/p/${i}`, title: `Page ${i + 1}`, scrollY: 0, zoom: 0, win: 0, trail: null })), trails: [], closed: [] }));
  const b: any = new AangBrowser({ origin: pages.origin, stateDir, preloadPath: path.join(HERE, '..', '..', 'src', 'samarapreload.cjs'),
    tabPreloadPath: path.join(HERE, '..', '..', 'src', 'tabpreload.cjs'), settingsPreloadPath: path.join(HERE, '..', '..', 'src', 'settingspreload.cjs'), thingsPreloadPath: path.join(HERE, '..', '..', 'src', 'thingspreload.cjs') } as any);
  wireBrowser(() => b);
  b.open();
  await wait(5000);
  b.tray(true, { x: 42, y: 62, hy: 80 });
  // Out and still: the slide over, the fonts in, the favicons settled.
  for (let i = 0; i < 40; i++) {
    await wait(250);
    const still = await b.trayV.webContents.executeJavaScript(`document.fonts.ready.then(() => document.body.classList.contains('out') && getComputedStyle(document.querySelector('.drawer')).transform === 'none')`, true).catch(() => false);
    if (still) break;
  }
  await wait(800);
  const read = async () => [
    await b.trayV.webContents.executeJavaScript(DUMP.replace('ROOTS', JSON.stringify(['.drawer', '.railhandle'])), true) as Record<string, string>,
    await b.win.webContents.executeJavaScript(DUMP.replace('ROOTS', JSON.stringify(['.hnd', '.railhandle'])), true) as Record<string, string>,
  ] as const;
  let [tray, frame] = await read();
  const norm = (o: Record<string, string>) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, v.replace(/http:\/\/127\.0\.0\.1:\d+/g, 'ORIGIN')]));
  // Kept as short fingerprints (the full styles are 11 MB); a difference names the element, and the same element's
  // styles on main and here show what moved.
  const hash = (o: Record<string, string>) => Object.fromEntries(Object.entries(norm(o)).map(([k, v]) => [k, createHash('sha256').update(v, 'utf8').digest('hex').slice(0, 20)]));
  const now = { tray: hash(tray), frame: hash(frame) };
  const n = Object.keys(tray).length + Object.keys(frame).length;
  if (process.env.PIN_WRITE) { writeFileSync(PIN, JSON.stringify(now, null, 0)); console.log(`PIN WRITTEN ${n} elements`); app.exit(0); return; }
  if (!existsSync(PIN)) { console.log('FAIL no fingerprint at ' + PIN); app.exit(1); return; }
  const was = JSON.parse(readFileSync(PIN, 'utf8'));
  const differs = (n: { tray: Record<string, string>; frame: Record<string, string> }) => (['tray', 'frame'] as const).some((k) => JSON.stringify(Object.entries(was[k]).sort()) !== JSON.stringify(Object.entries(n[k]).sort()));
  // Read once more before failing: a slide or a favicon still settling is not a change.
  if (differs(now)) { await wait(1500); [tray, frame] = await read(); now.tray = hash(tray); now.frame = hash(frame); }
  const bad: string[] = [];
  for (const part of ['tray', 'frame'] as const) {
    const a = was[part] as Record<string, string>, z = (now as any)[part] as Record<string, string>;
    for (const k of new Set([...Object.keys(a), ...Object.keys(z)])) {
      if (a[k] === z[k]) continue;
      if (!(k in z)) { bad.push(`${part} gone: ${k}`); continue; }
      if (!(k in a)) { bad.push(`${part} new: ${k}`); continue; }
      bad.push(`${part} changed: ${k}`);
    }
  }
  console.log(`${bad.length ? 'FAIL' : 'PASS'} drawer unchanged: ${n} elements compared, ${bad.length} differ`);
  for (const x of bad.slice(0, 40)) console.log('  ' + x);
  app.exit(bad.length ? 1 : 0);
});
