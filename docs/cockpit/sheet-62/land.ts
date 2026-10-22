// Sheet 62 (2026-10-22): where every "Send to Aang" lands. REAL renders, off screen: the typing box is input.html with
// its own chip row (input.js paintChips, fed through onChips the way the Shell feeds it; the chip is the row's existing
// picture-and-title chip), and the bubble is bubble.html as the product draws it (look B, S2 rim), asking through its
// own ask row (an ask delivered as the Shell does; the keys' words are the new ones). Aang's idle frame and the box sit
// where anchor.ts puts them (sheet 53's stage). Never on his screen. A picture maker.
//
// Run (from src/Shell): npx electron ../../docs/cockpit/sheet-62/land.ts
import { app, BrowserWindow } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync, writeFileSync } from 'node:fs';
import { servePages } from '../../../src/Shell/src/pageserver.ts';

process.on('uncaughtException', (e) => { console.log('HARNESS ERROR ' + String((e as Error)?.stack ?? e)); app.exit(2); });
process.on('unhandledRejection', (e) => { console.log('HARNESS REJECTION ' + String((e as Error)?.stack ?? e)); app.exit(2); });
setTimeout(() => { console.log('HARNESS TIMEOUT'); app.exit(3); }, 180_000).unref();
app.on('window-all-closed', () => { /* the script decides */ });
const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, '..', '..', '..');
const SHELL = path.join(ROOT, 'src', 'Shell');
const STUB = path.join(SHELL, 'test', 'electron', 'cockpit-stub.cjs');
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const SPRITE = 'data:image/png;base64,' + readFileSync(path.join(ROOT, 'assets', 'aang', 'frames', 'idle_0.png')).toString('base64');
const W = 940, H = 640;
// anchor.ts, as sheet 53 measured it: the frame, the box under his head on the left, the bubble's corner above the box
const fx = W - 300, fy = H - 222, boxTop = fy + 74, boxLeft = fx + 72 - 256 - 6 - 22, head = { x: fx + 112, y: fy + 96 };
const BOXH = 170;

// a small picture for a chip (the snip's own picture, a page's favicon-sized look): pixels, drawn on the spot
const THUMB = `(() => { const c = document.createElement('canvas'); c.width = 32; c.height = 20; const g = c.getContext('2d');
  const sky = g.createLinearGradient(0, 0, 0, 20); sky.addColorStop(0, '#1b4a5a'); sky.addColorStop(1, '#9fe0d0'); g.fillStyle = sky; g.fillRect(0, 0, 32, 20);
  g.fillStyle = '#2a1e40'; g.fillRect(0, 13, 32, 7); g.fillStyle = '#ffe0a0'; g.fillRect(22, 9, 6, 4); g.fillStyle = '#f0a64a'; for (let i = 0; i < 5; i++) g.fillRect(20 + i * 2, 18 - i, 1, 1);
  return c.toDataURL('image/png'); })()`;

interface Land { name: string; chip: { label: string; title: string; thumb?: boolean }; line: string; keys: [string, string, boolean?][]; typed?: string; bubble?: boolean }
const LANDS: Land[] = [
  { name: 'land-words', chip: { label: 'WORDS', title: 'forever.warcraft.com · Ragnaros knocks' }, line: 'Got it. Ask about it, or keep it as a note?', keys: [['Ask about it', 'A', true], ['Keep as a note', 'S']] },
  { name: 'land-snip', chip: { label: 'SNIP', title: 'forever.warcraft.com · lava fields map', thumb: true }, line: 'Got your snip. Ask about it, keep it, or pin it?', keys: [['Ask about it', 'A', true], ['Keep as a note', 'S'], ['Pin it', 'D']] },
  { name: 'land-ask', chip: { label: 'WORDS', title: 'forever.warcraft.com · Ragnaros knocks' }, line: '', keys: [], typed: 'Is this still true in Forever?', bubble: false },
];

async function boxPicture(pages: { origin: string }, l: Land): Promise<string> {
  const w = new BrowserWindow({ width: 268, height: BOXH, show: false, frame: false, transparent: true, backgroundColor: '#00000000',
    webPreferences: { preload: STUB, contextIsolation: false, sandbox: false, offscreen: true } });
  await w.loadURL(`${pages.origin}/input.html`);
  await wait(700);
  const js = (s: string) => w.webContents.executeJavaScript(s, true);
  await js(`window.__fire('onInputState', { opened: true, mode: 'auto', week: 0.31, history: [] }); true`);
  await wait(300);
  await js(`(() => { const thumb = ${l.chip.thumb ? THUMB : 'undefined'};
    window.__fire('onChips', { mockups: [{ label: ${JSON.stringify(l.chip.label)}, title: ${JSON.stringify(l.chip.title)}, i: 0, thumb }] });
    ${l.typed ? `const b = document.getElementById('box'); b.value = ${JSON.stringify(l.typed)}; b.dispatchEvent(new Event('input')); b.focus();` : ''}
    // the window grows upward in the product (anchor.ts keeps its bottom); here the frame sits at the bottom of a taller page
    document.body.style.cssText += ';display:flex;flex-direction:column;justify-content:flex-end;height:${BOXH}px';
    return true; })()`);
  await wait(600);
  const png = (await w.webContents.capturePage()).toPNG();
  w.destroy();
  return 'data:image/png;base64,' + png.toString('base64');
}

app.whenReady().then(async () => {
  const pages = await servePages(path.join(SHELL, 'pages'));
  for (const l of LANDS) {
    const boxPng = await boxPicture(pages, l);
    const w = new BrowserWindow({ width: W, height: H, show: false, frame: false, useContentSize: true,
      webPreferences: { preload: STUB, contextIsolation: false, sandbox: false, offscreen: true } });
    const errors: string[] = [];
    w.webContents.on('console-message', (e) => { const m = e as unknown as { message?: string; level?: string }; if (m.level === 'error') errors.push(String(m.message)); });
    await w.loadURL(`${pages.origin}/bubble.html`);
    await wait(700);
    const js = (s: string) => w.webContents.executeJavaScript(s, true);
    const bubbleBottom = boxTop - (BOXH - 112) - 8, bubbleRight = fx + 96;
    const css = `html,body{background:#191b24 !important}
body{background:radial-gradient(900px 500px at 15% 5%, rgba(80,96,140,.30), transparent 60%),radial-gradient(700px 500px at 95% 100%, rgba(120,70,110,.22), transparent 60%),linear-gradient(180deg,#1c1f2b,#151720) !important}
.wrap{margin:0 ${W - bubbleRight}px ${H - bubbleBottom}px 14px !important}
.stg{position:fixed;pointer-events:none;image-rendering:pixelated}`;
    await js(`(() => { const st = new CSSStyleSheet(); st.replaceSync(${JSON.stringify(css)}); document.adoptedStyleSheets = [st];
      const add = (src, x, y, cls) => { const i = document.createElement('img'); i.src = src; i.className = 'stg ' + cls; i.style.left = x + 'px'; i.style.top = y + 'px'; document.body.append(i); return i; };
      add(${JSON.stringify(SPRITE)}, ${fx}, ${fy}, 'aang');
      add(${JSON.stringify(boxPng)}, ${boxLeft}, ${boxTop - (BOXH - 112)}, 'box');
      window.__fire('onAim', { x: ${head.x}, y: ${head.y}, flip: false }); return true; })()`);
    await wait(150);
    if (l.bubble !== false) {
      await js(`window.__deliver({ t: 'permission', id: 'send-1', question: ${JSON.stringify(l.line)}, remembers: 'x' }); true`);
      await wait(900);
      // the keys come up while his pointer is on the bubble (his rule, 2026-10-11): the pointer goes there, on this page only
      const p = await js(`(() => { const r = document.getElementById('bubble').getBoundingClientRect(); return { x: Math.round(r.left + 30), y: Math.round(r.top + 20) }; })()`) as { x: number; y: number };
      w.webContents.sendInputEvent({ type: 'mouseMove', x: p.x, y: p.y });
      await wait(1200);
      // the new keys, in the ask row's own markup (bubble.js showAsk: button.key.sm[.primary] + span.k)
      await js(`(() => { const asks = document.getElementById('asks'); const bs = [...asks.querySelectorAll('button.key')];
        ${JSON.stringify(l.keys)}.forEach(([label, key, primary], i) => { const b = bs[i]; if (!b) return; b.className = 'key sm' + (primary ? ' primary' : '');
          b.firstChild.textContent = label; b.querySelector('.k').textContent = key; });
        bs.slice(${l.keys.length}).forEach((b) => b.remove());
        document.getElementById('who').textContent = ${JSON.stringify(l.name === 'land-snip' ? 'YOUR SNIP' : 'SENT FROM SAMARA')};
        window.dispatchEvent(new Event('resize')); window.__fire('onAim', { x: ${head.x}, y: ${head.y} + 0.5, flip: false }); return true; })()`);
      await wait(1500);
    }
    const r = await js(`(() => { const b = document.getElementById('bubble'), sk = document.getElementById('skin');
      const rs = [document.querySelector('.stg.aang'), document.querySelector('.stg.box')].map((e) => e.getBoundingClientRect());
      if (!b.hidden) rs.push(sk.getBoundingClientRect());
      const x0 = Math.min(...rs.map((q) => q.left)) - 20, y0 = Math.min(...rs.map((q) => q.top)) - 20, x1 = Math.max(...rs.map((q) => q.right)) - 60, y1 = Math.max(...rs.map((q) => q.bottom)) - 6;
      return { x: Math.max(0, Math.floor(x0)), y: Math.max(0, Math.floor(y0)), width: Math.ceil(x1 - Math.max(0, x0)), height: Math.ceil(y1 - Math.max(0, y0)) }; })()`);
    const img = await w.webContents.capturePage({ x: r.x, y: r.y, width: Math.min(W - r.x, r.width), height: Math.min(H - r.y, r.height) });
    writeFileSync(path.join(HERE, l.name + '.png'), img.toPNG());
    console.log(`${l.name}.png ${JSON.stringify(img.getSize())}${errors.length ? '  page errors: ' + errors.slice(0, 3).join(' | ') : ''}`);
    w.destroy();
  }
  pages.close();
  setTimeout(() => app.exit(0), 200);
});
