// Makes Samara's icon files from sheet 33's L1 (his pick, 2026-10-14: "L1 plum night"): crisp pixel art, each size
// drawn for itself and only ever scaled by whole numbers. Writes pages/art/samara/: PNGs for the Mac's iconset and
// samara.ico for Windows (PNG entries, 16 to 256).
//
// Run (with sheet 33 served on 127.0.0.1:47977): npx electron tools/make-samara-icons.ts
import { app, BrowserWindow } from 'electron';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(HERE, '..', 'pages', 'art', 'samara');
process.on('uncaughtException', (e) => { console.log('NOTE ' + String((e as Error).message).split('\n')[0]); });
setTimeout(() => { console.log('TIMEOUT'); app.exit(3); }, 60_000).unref();
app.on('window-all-closed', () => { /* the script decides */ });

/** An .ico of PNG entries (Windows Vista and later read these at every size). */
function ico(pngs: { size: number; data: Buffer }[]): Buffer {
  const head = Buffer.alloc(6 + 16 * pngs.length);
  head.writeUInt16LE(0, 0); head.writeUInt16LE(1, 2); head.writeUInt16LE(pngs.length, 4);
  let off = head.length;
  pngs.forEach((p, i) => {
    const e = 6 + 16 * i;
    head.writeUInt8(p.size >= 256 ? 0 : p.size, e); head.writeUInt8(p.size >= 256 ? 0 : p.size, e + 1);
    head.writeUInt8(0, e + 2); head.writeUInt8(0, e + 3); head.writeUInt16LE(1, e + 4); head.writeUInt16LE(32, e + 6);
    head.writeUInt32LE(p.data.length, e + 8); head.writeUInt32LE(off, e + 12);
    off += p.data.length;
  });
  return Buffer.concat([head, ...pngs.map((p) => p.data)]);
}

app.whenReady().then(async () => {
  const w = new BrowserWindow({ show: false, width: 400, height: 300 });
  await w.loadURL('http://127.0.0.1:47977/docs/cockpit/sheet-33-samara-lantern.html');
  // [file name, drawn size, whole-number scale]
  const want: [string, number, number][] = [
    ['16', 16, 1], ['24', 24, 1], ['32', 32, 1], ['48', 24, 2], ['64', 64, 1], ['128', 64, 2], ['256', 64, 4], ['512', 64, 8], ['1024', 64, 16],
  ];
  const urls: Record<string, string> = await w.webContents.executeJavaScript(`(() => { const out = {}; for (const [name, n, s] of ${JSON.stringify(want)}) out[name] = paint(ICONS[0].art(n), s).toDataURL('image/png'); return out; })()`);
  // The lantern on its own, no plum tile (his ask, 2026-10-14: for the morning brief's update row).
  const bare: Record<string, string> = await w.webContents.executeJavaScript(`(() => ({ 16: paint(lantern16(), 1).toDataURL('image/png'), 32: paint(lantern(grid(32), 32, { leaf: true }), 1).toDataURL('image/png'), 64: paint(lantern(grid(64), 64, { leaf: true }), 1).toDataURL('image/png') }))()`);
  // His pick (2026-10-14): the app icon is the lantern alone, glowing, nothing behind it; on the Mac it is unlit while
  // Samara is closed (the icon inside the app) and lit while it runs (set by Samara itself). Lit: a soft warm halo in
  // the margin (see-through pixels, still crisp). Unlit: the same lantern, dim paper, no glow.
  const lamp: Record<string, string> = await w.webContents.executeJavaScript(`(() => {
    const UNLIT = { '#FFF0C8': '#B9A483', '#F5C66A': '#9C8664', '#D98A2E': '#7E6747', '#9A4E16': '#4E3B26', '#E07A3A': '#6E4A33', '#B8541E': '#5A3A26', '#7A2E10': '#3E2618', '#FFC43C': '#8C7A4E', '#E0961E': '#6E5C38', '#FFE07A': '#9C8A5A', '#FF8040': '#7A5038', '#C95E28': '#5E3C28', '#8A3A14': '#3E2618' };
    const swap = (g) => g.map((r) => r.map((c) => (c ? UNLIT[c] || c : c)));
    const place = (src, n, off) => { const g = grid(n); src.forEach((r, y) => r.forEach((c, x) => { if (c && g[y + off]) g[y + off][x + off] = c; })); return g; };
    const RINGS = ['rgba(255,196,60,.55)', 'rgba(255,160,50,.30)', 'rgba(255,140,40,.15)', 'rgba(255,130,40,.07)'];
    const halo = (g, k) => { const n = g.length, out = g.map((r) => r.slice());
      for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) { if (g[y][x]) continue; let d = 99;
        for (let yy = y - k; yy <= y + k; yy++) for (let xx = x - k; xx <= x + k; xx++) if (g[yy]?.[xx]) d = Math.min(d, Math.max(Math.abs(xx - x), Math.abs(yy - y)));
        if (d <= k) out[y][x] = RINGS[d - 1]; }
      return out; };
    const base = (n) => n === 16 ? lantern16() : n === 24 ? place(lantern16(), 24, 4) : n === 32 ? place(lantern(grid(28), 28, { leaf: true }), 32, 2) : place(lantern(grid(56), 56, { leaf: true }), 64, 4);
    const out = {};
    for (const [name, n, sc] of [['16', 16, 1], ['24', 24, 1], ['32', 32, 1], ['48', 24, 2], ['64', 64, 1], ['128', 64, 2], ['256', 64, 4], ['512', 64, 8], ['1024', 64, 16]]) {
      const b = base(n), k = n === 16 ? 1 : n === 24 ? 3 : n === 32 ? 2 : 4;
      out['lit-' + name] = paint(halo(b, k), sc).toDataURL('image/png');
      out['unlit-' + name] = paint(swap(b), sc).toDataURL('image/png');
    }
    return out;
  })()`);
  mkdirSync(OUT, { recursive: true });
  const png = (name: string) => Buffer.from(urls[name]!.split(',')[1]!, 'base64');
  for (const name of Object.keys(urls)) writeFileSync(path.join(OUT, `samara-${name}.png`), png(name));
  for (const [n, u] of Object.entries(bare)) writeFileSync(path.join(OUT, `samara-lantern-${n}.png`), Buffer.from(u.split(',')[1]!, 'base64'));
  for (const [k, u] of Object.entries(lamp)) writeFileSync(path.join(OUT, `samara-${k}.png`), Buffer.from(u.split(',')[1]!, 'base64'));
  for (const kind of ['lit', 'unlit']) writeFileSync(path.join(OUT, `samara-${kind}.ico`), ico(['16', '24', '32', '48', '64', '256'].map((n) => ({ size: Number(n), data: Buffer.from(lamp[`${kind}-${n}`]!.split(',')[1]!, 'base64') }))));
  writeFileSync(path.join(OUT, 'samara.ico'), ico(['16', '24', '32', '48', '64', '256'].map((n) => ({ size: Number(n), data: png(n) }))));
  console.log('wrote ' + Object.keys(urls).length + ' PNGs and samara.ico to ' + OUT);
  app.exit(0);
});
