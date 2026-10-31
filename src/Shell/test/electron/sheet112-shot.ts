// Sheet 112 (2026-10-31, his ask): in Mockups, NEW, OPEN and APPROVED all look the same, "I can't tell which is which at
// a glance". OPEN and APPROVED share one gold chip (mocklog.js OPEN = ['OPEN', 'ok']) and NEW is gold too. Samara's real
// Mockups page (mocklog.html) with a made-up tree (sheet112-preload.cjs); VARIANT puts each fix on it. Nothing is built.
// Run (from src/Shell): VARIANT=now|a|b npx electron test/electron/sheet112-shot.ts <out.png>
import { app, BrowserWindow, screen } from 'electron';
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
process.on('uncaughtException', (e) => console.log('HARNESS NOTE ' + (e as Error).message));
setTimeout(() => { console.log('HARNESS TIMEOUT'); app.exit(3); }, 60_000).unref();
const HERE = path.dirname(fileURLToPath(import.meta.url));
app.on('window-all-closed', () => {});
app.dock?.hide();
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
// 7 x 7 pixel glyphs, drawn at 2 px: a gem, a star, a tick, a bang, a moon.
const px = (rows: string[], c: string) => `url("data:image/svg+xml,${encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 7 7' shape-rendering='crispEdges'>${rows.flatMap((r, y) => [...r].map((ch, x) => ch === '#' ? `<rect x='${x}' y='${y}' width='1' height='1' fill='${c}'/>` : '')).join('')}</svg>`)}")`;
const G = {
  gem: px(['..###..', '.#####.', '#######', '.#####.', '..###..', '...#...', '.......'], '#08203a'),
  star: px(['...#...', '...#...', '#######', '.#####.', '..###..', '.##.##.', '.#...#.'], '#2a1c00'),
  tick: px(['.......', '......#', '.....##', '#...##.', '##.##..', '.###...', '..#....'], '#e9ffe9'),
  bang: px(['..##...', '..##...', '..##...', '..##...', '.......', '..##...', '..##...'], '#fff1e8'),
  moon: px(['..###..', '.##....', '##.....', '##.....', '##.....', '.##....', '..###..'], '#b9a684'),
};
const COLOURS = `
  .sh .new{background:#4aa8ff;color:#08203a;box-shadow:inset 0 2px 0 #a8d6ff,inset 0 -2px 0 #2f78c4}
  .mk.open{background:none;color:#cdb894;box-shadow:inset 0 0 0 2px #6e5a3e}
  .mk.ok{box-shadow:inset 0 2px 0 #ffe28c,inset 0 -2px 0 #c9922a}
  .mk.chg{background:#c8402e;color:#fff1e8;box-shadow:inset 0 2px 0 #e9775f,inset 0 -2px 0 #8a2418}
  .sh.on{box-shadow:none;background:rgba(255,224,150,.14);outline:2px solid rgba(255,224,150,.35);outline-offset:-2px}`;
const GLYPHS = `
  .sh .new,.mk.ok,.mk.built,.mk.chg,.mk.park{display:inline-flex;align-items:center;gap:4px}
  .sh .new::before,.mk.ok::before,.mk.built::before,.mk.chg::before,.mk.park::before{content:"";width:14px;height:14px;image-rendering:pixelated;background-size:14px 14px}
  .mk.built{box-shadow:none}
  .sh .new::before{background-image:${G.gem}} .mk.ok::before{background-image:${G.star}} .mk.built::before{background-image:${G.tick}}
  .mk.chg::before{background-image:${G.bang}} .mk.park::before{background-image:${G.moon}}`;
const VARIANTS: Record<string, string> = { now: '', a: COLOURS, b: COLOURS + GLYPHS };
app.whenReady().then(async () => {
  const { servePages } = await import('../../src/pageserver.ts');
  const pages = await servePages(path.join(HERE, '..', '..', 'pages'));
  const d = screen.getAllDisplays().find((x) => x.id !== screen.getPrimaryDisplay().id);
  const w = new BrowserWindow({ width: 1100, height: 760, show: false, x: d ? d.bounds.x + 20 : -6000, y: 100, focusable: false,
    webPreferences: { preload: path.join(HERE, 'sheet112-preload.cjs'), contextIsolation: false, sandbox: false } });
  await w.loadURL(`${pages.origin}/mocklog.html`);
  await wait(1200);
  const v = process.env.VARIANT ?? 'now';
  // OPEN gets its own class in A and B (in the page it borrows APPROVED's).
  if (v !== 'now') await w.webContents.executeJavaScript(`for (const m of document.querySelectorAll('.mk.ok')) if (m.textContent === 'OPEN') m.className = 'mk open'; 1`);
  await w.webContents.executeJavaScript(`document.querySelectorAll('.sh')[3]?.classList.add('on'); 1`);
  if (VARIANTS[v]) await w.webContents.insertCSS(VARIANTS[v]!);
  await wait(500);
  const r = await w.webContents.executeJavaScript(`(() => { const l = document.getElementById('list').getBoundingClientRect(), a = [...document.querySelectorAll('#list > *')].pop().getBoundingClientRect(); return { x: Math.round(l.left), y: Math.round(l.top), w: Math.round(l.width), h: Math.round(a.bottom - l.top + 10) }; })()`);
  const img = await w.webContents.capturePage({ x: r.x, y: r.y, width: r.w, height: r.h });
  writeFileSync(process.argv.find((a) => a.endsWith('.png'))!, img.toPNG());
  console.log('SHOT ' + JSON.stringify(img.getSize()));
  app.exit(0);
});
