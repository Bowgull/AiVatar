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
  mkdirSync(OUT, { recursive: true });
  const png = (name: string) => Buffer.from(urls[name]!.split(',')[1]!, 'base64');
  for (const name of Object.keys(urls)) writeFileSync(path.join(OUT, `samara-${name}.png`), png(name));
  writeFileSync(path.join(OUT, 'samara.ico'), ico(['16', '24', '32', '48', '64', '256'].map((n) => ({ size: Number(n), data: png(n) }))));
  console.log('wrote ' + Object.keys(urls).length + ' PNGs and samara.ico to ' + OUT);
  app.exit(0);
});
