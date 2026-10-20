// Nothing plays until he asks (his rule, 2026-10-20: "nothing should play until I click or activate some sort of
// manual trigger"). A page he opened himself may play; silent autoplay, tabs Samara reopened by itself and tabs he
// is not looking at stay quiet; leaving a tab pauses it; a link he opened behind plays when he goes to it.
//
// Run: npx electron test/electron/autoplay-check.ts
import { app, BrowserWindow, screen } from 'electron';
import http from 'node:http';
import { mkdtempSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { servePages } from '../../src/pageserver.ts';
import { AangBrowser } from '../../src/browser.ts';
import { wireBrowser } from '../../src/browseripc.ts';

const PORT = 47918;
process.on('uncaughtException', (e) => { console.log('HARNESS NOTE ' + String((e as Error).message).split('\n')[0]); });
process.on('unhandledRejection', (e) => { console.log('HARNESS REJECTION ' + String((e as Error)?.stack ?? e)); app.exit(2); });
setTimeout(() => { console.log('HARNESS TIMEOUT'); app.exit(3); }, 90_000).unref();
app.on('window-all-closed', () => { /* the test decides */ });
const HERE = path.dirname(fileURLToPath(import.meta.url));
BrowserWindow.prototype.show = function (this: BrowserWindow) { this.setPosition(-6000, 100); this.showInactive(); };
BrowserWindow.prototype.focus = function () { /* not in a test */ };
let bad = 0;
const check = (what: string, ok: boolean, d = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${what}${d ? '  -- ' + d.slice(0, 200) : ''}`); if (!ok) bad++; };
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

// One second of a quiet tone, looped by the page: something real to play without the internet.
function tone(): Buffer {
  const rate = 8000, n = rate, data = Buffer.alloc(n * 2);
  for (let i = 0; i < n; i++) data.writeInt16LE(Math.round(Math.sin(i / rate * 2 * Math.PI * 440) * 2000), i * 2);
  const h = Buffer.alloc(44);
  h.write('RIFF', 0); h.writeUInt32LE(36 + data.length, 4); h.write('WAVE', 8); h.write('fmt ', 12); h.writeUInt32LE(16, 16);
  h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22); h.writeUInt32LE(rate, 24); h.writeUInt32LE(rate * 2, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34);
  h.write('data', 36); h.writeUInt32LE(data.length, 40);
  return Buffer.concat([h, data]);
}

app.whenReady().then(async () => {
  (screen as any).getCursorScreenPoint = () => ({ x: -20000, y: 500 });
  const wav = tone();
  const site = http.createServer((q, r) => {
    if (q.url?.startsWith('/tone.wav')) { r.writeHead(200, { 'Content-Type': 'audio/wav', 'Content-Length': wav.length }).end(wav); return; }
    const muted = q.url?.includes('muted') ? ' muted' : '';
    r.writeHead(200, { 'Content-Type': 'text/html' }).end(`<!doctype html><title>play</title><audio src="/tone.wav" autoplay loop${muted}></audio>`);
  });
  await new Promise<void>((r) => site.listen(PORT, '127.0.0.1', () => r()));
  const pages = await servePages(path.join(HERE, '..', '..', 'pages'));
  const b = new AangBrowser({ origin: pages.origin, stateDir: mkdtempSync(path.join(os.tmpdir(), 'play-')), preloadPath: path.join(HERE, '..', '..', 'src', 'preload.cjs'),
    tabPreloadPath: path.join(HERE, '..', '..', 'src', 'tabpreload.cjs'), settingsPreloadPath: path.join(HERE, '..', '..', 'src', 'settingspreload.cjs'), thingsPreloadPath: path.join(HERE, '..', '..', 'src', 'thingspreload.cjs') }) as any;
  wireBrowser(() => b);
  const url = (p: string) => `http://127.0.0.1:${PORT}/${p}`;
  const tab = (p: string) => b.tabs.find((x: any) => x.url === url(p));
  const playing = async (t: any) => await t.view.webContents.executeJavaScript("!document.querySelector('audio').paused");

  b.open(url('a')); await wait(4000);
  const a = tab('a');
  check('a page he opened himself plays', await playing(a));

  b.newTab(url('b?muted')); await wait(2500);
  const m = tab('b?muted');
  check('silent autoplay waits for his click', !(await playing(m)));
  check('leaving a tab pauses it', !(await playing(a)));

  b.activate(a.id); await wait(1500);
  check('coming back to it, it waits for his click', !(await playing(a)));

  await a.view.webContents.executeJavaScript("document.querySelector('audio').play()", true); await wait(800);
  check('his click on the page plays it', await playing(a));

  a.playOkAt = 0; b.lastGesture.delete(a.id); a.view.webContents.reload(); await wait(2500);
  check('a page Samara loads by itself (a reopened tab) stays quiet', !(await playing(a)));

  b.lastGesture.set(a.id, Date.now());
  b.newTab(url('c'), a.id, false); await wait(2500);
  const c = tab('c');
  check('a link he opened behind stays quiet while he cannot see it', !(await playing(c)));
  b.activate(c.id); await wait(1500);
  check('...and plays when he goes to it', await playing(c));
  check('the tab he left is paused', !(await playing(a)));

  console.log(bad ? `${bad} FAILED` : 'ALL PASS'); app.exit(bad ? 1 : 0);
});
