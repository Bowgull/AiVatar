// 2026-10-23, his report: "I can't click on any video buttons in theater mode" (watching Twitch). After a tab wakes from
// sleep, is anything of Samara's (the curtain with the old picture, the autofill light) left over the page, unseen but
// catching every click? Checked on Twitch and YouTube, woken and not. Run: npx electron test/electron/stuck-layer-check.ts
import { app, BrowserWindow, webContents } from 'electron';
import { mkdtempSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
process.on('uncaughtException', (e) => console.log('HARNESS NOTE ' + (e as Error).message));
setTimeout(() => { console.log('HARNESS TIMEOUT'); app.exit(3); }, 240_000).unref();
const HERE = path.dirname(fileURLToPath(import.meta.url));
app.setPath('userData', mkdtempSync(path.join(os.tmpdir(), 'stuck-ud-')));
app.commandLine.appendSwitch('disable-backgrounding-occluded-windows');
app.on('window-all-closed', () => {});
BrowserWindow.prototype.show = function (this: BrowserWindow) { this.setPosition(-6000, 100); this.showInactive(); };
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
let bad = 0;
app.whenReady().then(async () => {
  const { servePages } = await import('../../src/pageserver.ts');
  const { AangBrowser } = await import('../../src/browser.ts');
  const { wireBrowser } = await import('../../src/browseripc.ts');
  const pages = await servePages(path.join(HERE, '..', '..', 'pages'));
  const b: any = new AangBrowser({ origin: pages.origin, stateDir: mkdtempSync(path.join(os.tmpdir(), 'stuck-s-')), preloadPath: path.join(HERE, '..', '..', 'src', 'preload.cjs'),
    tabPreloadPath: path.join(HERE, '..', '..', 'src', 'tabpreload.cjs'), settingsPreloadPath: path.join(HERE, '..', '..', 'src', 'settingspreload.cjs'), thingsPreloadPath: path.join(HERE, '..', '..', 'src', 'thingspreload.cjs') });
  wireBrowser(() => b);
  const over = (t: any) => {
    const w = b.win; const kids = w.contentView.children; const i = kids.indexOf(t.view);
    return kids.slice(i + 1).filter((v: any) => v.getVisible?.() && v.getBounds().width > 0).map((v: any) => {
      const wc = v.webContents; return (wc && !wc.isDestroyed() ? wc.getURL().replace(/^https?:\/\/127\.0\.0\.1:\d+\//, '').slice(0, 40) : '?') + ' ' + JSON.stringify(v.getBounds());
    });
  };
  for (const [name, url] of [['twitch', 'https://www.twitch.tv/directory'], ['youtube', 'https://www.youtube.com/watch?v=jNQXAC9IVRw']]) {
    b.open(url);
    for (let i = 0; i < 100 && !b.cur()?.view; i++) await wait(200);
    const id = b.cur().id; await wait(8000);
    await b.peek();
    console.log(`${name} awake, over the page: ${JSON.stringify(over(b.cur()))}`);
    b.newTab('https://en.wikipedia.org/wiki/Video'); await wait(4000);
    await b.rest(b.tabs.find((t: any) => t.id === id));
    b.activate(id);
    const t = b.tabs.find((x: any) => x.id === id);
    for (const s of [1, 4, 8, 12, 16]) {
      await wait(s === 1 ? 1000 : 4000);
      const o = over(t);
      console.log(`${name} woken +${s}s: waking=${t.waking} veil=${b.veil ? (b.veil.up ? 'up' : 'pending') : 'none'} over the page: ${JSON.stringify(o)}`);
      if (s === 16 && o.length) { console.log(`FAIL ${name}: something still covers the page after waking`); bad++; }
    }
  }
  console.log(bad ? `${bad} FAILED` : 'ALL PASS');
  app.exit(0);
});
