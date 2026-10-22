// Sheet 60 (2026-10-22, his decision: Aang DOES read his notes): "Aang notices things in your notes". Qwen reads them
// now and then; Aang says ONE line in his speech bubble only when it matters, and the note's name in it is the door
// (the bubble's own clickable word, as it marks "Claude" today). These are REAL renders of the product's bubble page
// (bubble.html, look B with the S2 wood rim), driven through the test preload exactly as speech-bubble-check.ts does,
// on sheet 53's stage (dark desktop, Aang's idle frame where the Shell puts him). A picture maker, off screen.
//
// Run (from src/Shell): npx electron ../../docs/cockpit/sheet-60/notice-shots.ts
import { app, BrowserWindow } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync, writeFileSync } from 'node:fs';
import { servePages } from '../../../src/Shell/src/pageserver.ts';

process.on('uncaughtException', (e) => { console.log('HARNESS ERROR ' + String((e as Error)?.stack ?? e)); app.exit(2); });
process.on('unhandledRejection', (e) => { console.log('HARNESS REJECTION ' + String((e as Error)?.stack ?? e)); app.exit(2); });
setTimeout(() => { console.log('HARNESS TIMEOUT'); app.exit(3); }, 120_000).unref();
app.on('window-all-closed', () => { /* the script decides */ });
const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, '..', '..', '..');
const SHELL = path.join(ROOT, 'src', 'Shell');
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const SPRITE = 'data:image/png;base64,' + readFileSync(path.join(ROOT, 'assets', 'aang', 'frames', 'idle_0.png')).toString('base64');
const W = 940, H = 560;
// sheet 53's stage: Aang at the bottom right, the bubble's tail aimed at his head
const fx = W - 300, fy = H - 222, head = { x: fx + 112, y: fy + 96 }, bubbleRight = fx + 96, bubbleBottom = fy + 80;
const STAGE_CSS = (g: number) => `
html,body{background:#191b24 !important}
body{background:radial-gradient(900px 500px at 15% 5%, rgba(80,96,140,.30), transparent 60%),radial-gradient(700px 500px at 95% 100%, rgba(120,70,110,.22), transparent 60%),linear-gradient(180deg,#1c1f2b,#151720) !important}
.wrap{margin:0 ${W - bubbleRight + g}px ${H - bubbleBottom + g}px 14px !important}
.stg{position:fixed;pointer-events:none;image-rendering:pixelated}`;

const LINES: [string, string, string][] = [
  ['notice-1', 'You noted to renew the passport Friday. That\'s tomorrow.', 'renew the passport'],
  ['notice-2', '"Call the bank" has been open a week. Want me to move it to today?', 'Call the bank'],
  ['notice-3', 'You\'re on the route screen. Your "Route list idea" note is about this.', 'Route list idea'],
];

app.whenReady().then(async () => {
  const pages = await servePages(path.join(SHELL, 'pages'));
  for (const [name, text, link] of LINES) {
    const w = new BrowserWindow({ width: W, height: H, show: false, frame: false, useContentSize: true,
      webPreferences: { preload: path.join(SHELL, 'test', 'electron', 'cockpit-stub.cjs'), contextIsolation: false, sandbox: false, offscreen: true } });
    const errors: string[] = [];
    w.webContents.on('console-message', (e) => { const m = e as unknown as { message?: string; level?: string }; if (m.level === 'error') errors.push(String(m.message)); });
    await w.loadURL(`${pages.origin}/bubble.html`);
    await wait(700);
    const js = (s: string) => w.webContents.executeJavaScript(s, true);
    const g = Number(await js(`parseFloat(getComputedStyle(document.getElementById('wrap')).marginRight) - 78`)) || 0;
    await js(`(() => { const st = new CSSStyleSheet(); st.replaceSync(${JSON.stringify(STAGE_CSS(g))}); document.adoptedStyleSheets = [st];
      const i = document.createElement('img'); i.src = ${JSON.stringify(SPRITE)}; i.className = 'stg aang'; i.style.left = '${fx}px'; i.style.top = '${fy}px'; document.body.append(i);
      window.__fire('onAim', { x: ${head.x}, y: ${head.y}, flip: false }); return true; })()`);
    await wait(100);
    // a line Aang starts himself (proactive), the note's name the door: the bubble marks it the way it marks "Claude"
    await js(`window.__deliver({ t: 'bubble', text: ${JSON.stringify(text)}, stream: false, turn: 41, proactive: true, hold: 600000 }); true`);
    await wait(3000);
    // the door: the note's name drawn with the bubble's own .link look (what markLink() does for "Claude" today)
    await js(`(() => { const said = document.getElementById('said'), want = ${JSON.stringify(link)}.split(' ');
      const words = [...said.querySelectorAll('*')].filter((e) => !e.children.length && e.textContent.trim());
      const bare = (t) => t.trim().replace(/^["']|["'.,?!]$/g, '');
      for (let i = 0; i + want.length <= words.length; i++) if (want.every((w, k) => bare(words[i + k].textContent) === w)) {
        words.slice(i, i + want.length).forEach((e) => { e.classList.add('link'); }); return true; }
      return false; })()`);
    await wait(400);
    const r = await js(`(() => { const a = document.getElementById('skin').getBoundingClientRect(), b = document.querySelector('.stg.aang').getBoundingClientRect();
      const x0 = Math.min(a.left, b.left + 80) - 24, y0 = Math.min(a.top, b.top + 70) - 24, x1 = Math.max(a.right, b.right - 80) + 24, y1 = Math.max(a.bottom, b.bottom - 14) + 8;
      return { x: Math.max(0, Math.floor(x0)), y: Math.max(0, Math.floor(y0)), width: Math.ceil(x1 - Math.max(0, x0)), height: Math.ceil(y1 - Math.max(0, y0)), link: !!document.querySelector('#said .link, .link') }; })()`);
    const img = await w.webContents.capturePage({ x: r.x, y: r.y, width: Math.min(W - r.x, r.width), height: Math.min(H - r.y, r.height) });
    writeFileSync(path.join(HERE, name + '.png'), img.toPNG());
    console.log(`${name}.png ${JSON.stringify(img.getSize())} door marked: ${r.link}${errors.length ? '  page errors: ' + errors.slice(0, 3).join(' | ') : ''}`);
    w.destroy();
  }
  pages.close();
  setTimeout(() => app.exit(0), 200);
});
