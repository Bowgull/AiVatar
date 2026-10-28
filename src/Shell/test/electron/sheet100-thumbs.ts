// Sheet 100: real pictures of past mockup versions, for the trail mockup. Each page is loaded as it was at its commit
// (served by a small git-show server on 127.0.0.1:8810) or from its file, captured at 1280x800 and saved small.
// Run: npx electron test/electron/sheet100-thumbs.ts -ApplePersistenceIgnoreState YES <outdir>
import os from 'node:os';
import { app, BrowserWindow } from 'electron';
import { writeFileSync } from 'node:fs';
import path from 'node:path';
const out = process.argv[process.argv.length - 1]!;
const V = 'http://127.0.0.1:8810/a/';
const S = 'docs/cockpit/';
const shots: [string, string][] = [
  ['86-1', V + 'a6efdde/' + S + 'sheet-86-asks.html'], ['86-2', V + '6565e58/' + S + 'sheet-86-asks.html'],
  ['86-3', V + 'bca5537/' + S + 'sheet-86-asks.html'], ['86-4', V + '66e74d5/' + S + 'sheet-86-asks.html'],
  ['87-1', V + '6565e58/' + S + 'sheet-87-private-window.html'], ['87-13', V + 'c1a4633/' + S + 'sheet-87-private-window.html'],
  ['83-1', V + '66cc5f1/' + S + 'sheet-83-settings-game-menu.html'], ['83-4', V + '17ca9b9/' + S + 'sheet-83-settings-game-menu.html'],
  ['88-2', V + 'b30ee5d/' + S + 'sheet-88-address-bar.html'], ['89-3', V + '5901f28/' + S + 'sheet-89-stremio-and-tv.html'],
  ['90-2', V + '6843f43/' + S + 'sheet-90-cat-logins-shelf.html'], ['96-2', V + 'ceae60c/' + S + 'sheet-96-whole-bar.html'],
  ['97-2', V + 'a1570e3/' + S + 'sheet-97-claude-in-samara.html'], ['98-1', V + '581c613/' + S + 'sheet-98-bar-and-notices.html'],
  ['99-1', V + '608f500/' + S + 'sheet-99-send-to-tv.html'], ['99-2', V + '85f446f/' + S + 'sheet-99-send-to-tv.html'], ['99-3', V + 'a30b33f/' + S + 'sheet-99-send-to-tv.html'],
  ['w79', 'file://' + os.homedir() + '/Handoff/waymark/mockups/79-ledger-boards.html'], ['w93', 'file://' + os.homedir() + '/Handoff/waymark/mockups/93-fixes-switch-kick-vs-left-kick.html'],
  ['c06', 'http://127.0.0.1:8810/c/a0197df/mockups/06-campfire-loading.html'], ['c11', 'http://127.0.0.1:8810/c/d005415/mockups/11-dark-forest-fire.html'],
  ['87-11', V + '66bd6c3/' + S + 'sheet-87-private-window.html'], ['87-12', V + '6096c09/' + S + 'sheet-87-private-window.html'],
  ['83-2', V + '76cbb79/' + S + 'sheet-83-settings-game-menu.html'], ['83-3', V + '6b7fa47/' + S + 'sheet-83-settings-game-menu.html'],
  ['88-1', V + '6a993d0/' + S + 'sheet-88-address-bar.html'], ['89-1', V + '7487230/' + S + 'sheet-89-stremio-and-tv.html'], ['89-2', V + '1896cfe/' + S + 'sheet-89-stremio-and-tv.html'],
  ['90-1', V + 'f94935e/' + S + 'sheet-90-cat-logins-shelf.html'], ['96-1', V + '3473df9/' + S + 'sheet-96-whole-bar.html'], ['97-1', V + '268d0a8/' + S + 'sheet-97-claude-in-samara.html'],
  ['s01', 'http://127.0.0.1:8810/s/f6fef44/report.html'],
];
app.whenReady().then(async () => {
  const w = new BrowserWindow({ show: false, width: 1280, height: 800, webPreferences: { offscreen: false, backgroundThrottling: false } });
  for (const [name, url] of shots) {
    try {
      await w.loadURL(url);
      await new Promise((r) => setTimeout(r, 1800));
      // the first big picture on the sheet, not its heading: that is what tells one version from another
      const r = await w.webContents.executeJavaScript(`(() => { const all = [...document.querySelectorAll('img,canvas,svg,.win,figure,iframe,.frame,.shot')];
        const el = all.find((e) => { const b = e.getBoundingClientRect(); return b.width >= 300 && b.height >= 160; });
        if (!el) return null; el.scrollIntoView({ block: 'start' }); window.scrollBy(0, -16); const b = el.getBoundingClientRect();
        const W = Math.min(1280, Math.max(b.width + 32, 640)); return { x: Math.max(0, Math.round(b.left - 16)), y: Math.max(0, Math.round(b.top)), w: Math.round(W), h: Math.round(W * 0.625) }; })()`);
      await new Promise((res) => setTimeout(res, 400));
      const box = r ? { x: r.x, y: r.y, width: Math.min(r.w, 1280 - r.x), height: Math.min(r.h, 800 - r.y) } : { x: 0, y: 0, width: 1280, height: 800 };
      const img = (await w.webContents.capturePage(box)).resize({ width: 320, height: 200, quality: 'best' });
      writeFileSync(path.join(out, name + '.png'), img.toPNG());
      console.log('ok ' + name);
    } catch (e) { console.log('FAIL ' + name + ' ' + (e as Error).message); }
  }
  app.exit(0);
});
