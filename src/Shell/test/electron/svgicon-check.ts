// SVG-only site icons become pictures (2026-10-22, his ask: "no bookmark is ever just a letter when the site has an
// icon"). Two local sites with only an SVG icon and no /favicon.ico: a plain one must get a real (not blank) PNG kept, and
// a hostile one (a script, an outside picture, an onload) must still get a picture while its tricks reach nothing.
// Run: npx electron test/electron/svgicon-check.ts
import { app, BrowserWindow, nativeImage } from 'electron';
import http from 'node:http';
import { mkdtempSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
process.on('uncaughtException', (e) => console.log('HARNESS NOTE ' + (e as Error).message));
setTimeout(() => { console.log('HARNESS TIMEOUT'); app.exit(3); }, 60_000).unref();
const HERE = path.dirname(fileURLToPath(import.meta.url));
const PORT = 47997;
app.setPath('userData', mkdtempSync(path.join(os.tmpdir(), 'svgi-ud-')));
app.commandLine.appendSwitch('host-resolver-rules', 'MAP plain.example 127.0.0.1, MAP tricky.example 127.0.0.1');
app.on('window-all-closed', () => {});
BrowserWindow.prototype.show = function (this: BrowserWindow) { this.setOpacity(0); this.showInactive(); };
BrowserWindow.prototype.focus = function () {};
const PLAIN = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><circle cx="16" cy="16" r="14" fill="#e8443a"/></svg>`;
const TRICKY = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 32 32" onload="fetch('http://127.0.0.1:${PORT}/leak-onload')">
<script>fetch('http://127.0.0.1:${PORT}/leak-script')</script><image href="http://127.0.0.1:${PORT}/leak-image.png" width="32" height="32"/>
<rect width="32" height="32" rx="6" fill="#2b78d0"/></svg>`;
let leaks = 0;
const ok = (name: string, pass: boolean, note = '') => { console.log(`${pass ? 'PASS' : 'FAIL'} ${name}${note ? ' (' + note + ')' : ''}`); return pass; };
app.whenReady().then(async () => {
  http.createServer((q, r) => {
    const u = q.url ?? '/';
    if (u.startsWith('/leak')) { leaks++; r.writeHead(404).end(); return; }
    if (u === '/i.svg') { r.writeHead(200, { 'Content-Type': 'image/svg+xml' }).end(q.headers.host?.startsWith('tricky') ? TRICKY : PLAIN); return; }
    if (u === '/favicon.ico') { r.writeHead(404).end(); return; }
    r.writeHead(200, { 'Content-Type': 'text/html' }).end(`<!doctype html><title>Site</title><link rel="icon" href="/i.svg"><p>${u}`);
  }).listen(PORT, '127.0.0.1');
  const { servePages } = await import('../../src/pageserver.ts');
  const { AangBrowser } = await import('../../src/browser.ts');
  const pages = await servePages(path.join(HERE, '..', '..', 'pages'));
  const b: any = new AangBrowser({ origin: pages.origin, stateDir: mkdtempSync(path.join(os.tmpdir(), 'svgi-state-')), preloadPath: path.join(HERE, '..', '..', 'src', 'preload.cjs'),
    tabPreloadPath: path.join(HERE, '..', '..', 'src', 'tabpreload.cjs'), settingsPreloadPath: path.join(HERE, '..', '..', 'src', 'settingspreload.cjs'), thingsPreloadPath: path.join(HERE, '..', '..', 'src', 'thingspreload.cjs') } as any);
  b.open(`http://plain.example:${PORT}/`);
  const until = async (host: string) => { for (let i = 0; i < 75 && !b.icons.has(host); i++) await new Promise((r) => setTimeout(r, 200)); return b.icons.get(host) as string | undefined; };
  const look = (d?: string) => { if (!d?.startsWith('data:image/png;base64,')) return null; const img = nativeImage.createFromDataURL(d); const px = img.toBitmap(); let n = 0, red = 0, blue = 0; for (let i = 0; i < px.length; i += 4) if (px[i + 3]! > 128) { n++; if (px[i + 2]! > 180 && px[i]! < 100) red++; if (px[i]! > 150 && px[i + 2]! < 100) blue++; } return { size: img.getSize(), opaque: n, red, blue }; };
  const a = look(await until(`plain.example`));
  let all = ok('plain SVG-only site: a PNG is kept', Boolean(a), JSON.stringify(a));
  all = ok('the picture is the icon (mostly the red circle)', Boolean(a && a.red > 300), `red ${a?.red}`) && all;
  b.newTab(`http://tricky.example:${PORT}/`);
  const t = look(await until(`tricky.example`));
  all = ok('hostile SVG: still a picture', Boolean(t && t.blue > 300), JSON.stringify(t)) && all;
  await new Promise((r) => setTimeout(r, 1500));
  all = ok('hostile SVG: its script, onload and outside picture reached nothing', leaks === 0, `${leaks} request(s) to /leak`) && all;
  console.log(all ? 'ALL PASS' : 'FAILED'); app.exit(all ? 0 : 1);
});
