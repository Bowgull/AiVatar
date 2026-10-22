// The window family, part 2 (2026-10-22): F4 reshape on snap + F5 save and restore, with real windows, off his screen
// (x around -5000), never focused or raised, no real mouse or keys. The video pop-out's page, a real Claude job pop-out
// (JobPops) and a real sticky note (NoteWindows), all members of one FamilyHost.
// Checks: the job dropped on the video's right becomes a COLUMN as tall as the video (its page redraws as sheet 59's
// column inside a view transition, the window resized a couple of times at most, never per frame); the note dropped below
// becomes a STRIP as wide as the video; pulled out of the family the job goes back to its own strip and size; the layout
// is saved per screen arrangement; the video hidden and shown again pulls the note back to its side; after a "restart"
// (a new FamilyHost reading the same file) with one monitor missing, a note reopening goes back under the video.
// Pictures (3): joined, the job taken out, restored after the restart.
//
// Run: npx electron test/electron/family3-check.ts [folder for the pictures]
import { dialog, app, BrowserWindow, nativeImage } from 'electron';
import { mkdirSync, mkdtempSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import os from 'node:os'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
import { servePages } from '../../src/pageserver.ts';
import { NoteWindows } from '../../src/notewin.ts';
import { JobPops } from '../../src/jobpop.ts';
import { FamilyHost } from '../../src/familywin.ts';
import * as FS from '../../src/familysave.ts';

dialog.showErrorBox = () => {};   // never a dialog on his screen, whatever breaks
process.on('uncaughtException', (e) => { console.log('HARNESS ERROR ' + String((e as Error)?.stack ?? e).split('\n').slice(0, 4).join(' | ')); app.exit(2); });
process.on('unhandledRejection', (e) => { console.log('HARNESS REJECTION ' + String((e as Error)?.stack ?? e)); app.exit(2); });
setTimeout(() => { console.log('HARNESS TIMEOUT'); app.exit(3); }, 150_000).unref();
app.on('window-all-closed', () => {});
const TMP = mkdtempSync(path.join(os.tmpdir(), 'family3-check-'));
app.setPath('userData', TMP);
const HERE = path.dirname(fileURLToPath(import.meta.url));
BrowserWindow.prototype.show = function (this: BrowserWindow) { if (this.webContents.getURL().includes('familymenu')) this.setPosition(-9000, 100); this.showInactive(); };
BrowserWindow.prototype.focus = function () {};
BrowserWindow.prototype.moveTop = function () {};
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
let bad = 0;
const check = (what: string, ok: boolean, d: unknown = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${what}${d !== '' ? '  -- ' + String(typeof d === 'string' ? d : JSON.stringify(d)).slice(0, 400) : ''}`); if (!ok) bad++; };
const until = async (fn: () => boolean | Promise<boolean>, ms = 6000) => { const end = Date.now() + ms; while (Date.now() < end) { if (await fn()) return true; await wait(80); } return fn(); };
const OUT = (() => { const a = process.argv.at(-1); try { if (a && !a.endsWith('.ts')) { mkdirSync(a, { recursive: true }); if (statSync(a).isDirectory()) return a; } } catch { /* below */ } return os.tmpdir(); })();

const S1 = '0b6c2a8e-1111-4c3d-9e2f-aaaaaaaaaaaa';
const W1 = ['Replay harness', 'Athlete model', 'Rules-only brain', 'Folding the route list', 'Readiness meter', 'Test week'];
const tasks = (done: number) => W1.map((text, i) => ({ text, status: i < done ? 'completed' : i === done ? 'in_progress' : 'pending', ...(i === done ? { active: text } : {}) }));
const JOB = { id: S1, machine: 'pc', cwd: 'C:\\x', project: 'Waymark', title: 'Waymark', model: 'opus', phase: 'working', startedAt: Date.now() - 30 * 60_000, lastActivity: 1, prompt: 'go',
  tasks: tasks(3), current: '', percent: null, etaMs: null, usage: null, open: `claude://claude.ai/epitaxy/local_${S1}`, held: 0,
  progress: { done: 3, total: 6, cur: 3, elapsedMs: 0, at: Date.now(), paceMs: 600_000, rev: 1, rewroteAt: null },
  activity: { now: 'Folding the route list to one line', since: Date.now() - 12_000, agents: [] } };
// Two monitors while it runs (a made-up arrangement; positions far off his real screen are what the windows use).
const TWO: FS.Display[] = [{ id: 11, scaleFactor: 1, bounds: { x: -6000, y: 0, width: 3000, height: 1600 } }, { id: 12, scaleFactor: 1.5, bounds: { x: -3000, y: 0, width: 2560, height: 1440 } }];
const AREA = [{ x: -6000, y: 0, width: 3500, height: 1600 }];

/** The windows' own pictures laid on a dark desk where they stand (each capture is the window's page, alpha kept). */
async function picture(ws: BrowserWindow[], name: string): Promise<void> {
  const caps = await Promise.all(ws.map(async (w) => ({ w, img: await w.webContents.capturePage(), b: w.getContentBounds() })));
  const k = caps[0]!.img.getSize().width / caps[0]!.b.width;
  const L = Math.min(...caps.map((c) => c.b.x)) - 20, T = Math.min(...caps.map((c) => c.b.y)) - 20;
  const R = Math.max(...caps.map((c) => c.b.x + c.b.width)) + 20, B = Math.max(...caps.map((c) => c.b.y + c.b.height)) + 20;
  const Wd = Math.round((R - L) * k), Hd = Math.round((B - T) * k), out = Buffer.alloc(Wd * Hd * 4);
  for (let y = 0; y < Hd; y++) for (let x = 0; x < Wd; x++) { const i = (y * Wd + x) * 4, g = 30 + Math.round(10 * y / Hd); out[i] = g + 6; out[i + 1] = g + 2; out[i + 2] = g; out[i + 3] = 255; }
  for (const c of caps) {
    const s = c.img.getSize(), bits = c.img.toBitmap(), ox = Math.round((c.b.x - L) * k), oy = Math.round((c.b.y - T) * k);
    for (let y = 0; y < s.height; y++) for (let x = 0; x < s.width; x++) {
      const si = (y * s.width + x) * 4, d = ((y + oy) * Wd + x + ox) * 4, a = bits[si + 3]! / 255;
      if (!a || d < 0 || d + 3 >= out.length || x + ox >= Wd) continue;
      for (let ch = 0; ch < 3; ch++) out[d + ch] = Math.round(bits[si + ch]! + out[d + ch]! * (1 - a));
    }
  }
  const pic = nativeImage.createFromBitmap(out, { width: Wd, height: Hd });
  const f = path.join(OUT, name);
  writeFileSync(f, (Wd > 1000 ? pic.resize({ width: 1000 }) : pic).toPNG());
  console.log('PICTURE ' + f);
}

app.whenReady().then(async () => {
  const pages = await servePages(path.join(HERE, '..', '..', 'pages'));
  const saveFile = path.join(TMP, 'family-layout.json');
  const host = new FamilyHost({ origin: pages.origin, saveFile });
  host.displays = () => TWO;
  host.areas = () => AREA;
  const preload = path.join(HERE, '..', '..', 'src', 'preload.cjs');

  const makeVideo = (h: FamilyHost) => {
    const v = new BrowserWindow({ x: -5200, y: 200, width: 640, height: 394, frame: false, transparent: false, backgroundColor: '#24160D', show: false,
      webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false, preload } });
    void v.loadURL(`${pages.origin}/popout.html`);
    v.once('ready-to-show', () => v.showInactive());
    h.add({ id: 'video', kind: 'video', win: () => (v.isDestroyed() ? null : v), card: '.frame', setOpacity: (n) => v.setOpacity(n), setPinned: () => {} });
    return v;
  };
  const video = makeVideo(host);

  const jp = new JobPops({ origin: pages.origin, preloadPath: path.join(HERE, '..', '..', 'src', 'jobpoppreload.cjs'), clampToScreen: false, aangRects: () => [] });
  jp.family = host;
  jp.update([JOB], []);
  const jw = jp.open(S1, { x: -4300, y: 260 })!;
  // Every size the job's window is given from here on (to show it is resized once or twice, never per frame).
  const sizes: string[] = [];
  const sb = jw.setBounds.bind(jw);
  jw.setBounds = (b: Partial<Electron.Rectangle>, an?: boolean) => { const [w0, h0] = jw.getSize(); sb(b, an); const [w1, h1] = jw.getSize(); if (w0 !== w1 || h0 !== h1) sizes.push(`${w1}x${h1}`); };

  const notes = new NoteWindows({ origin: pages.origin, preloadPath: preload, save: () => {}, overAang: () => false });
  notes.family = host;
  const nw = notes.show({ id: 'n1', title: 'Raid night', html: 'Bring flasks<br>Repair first<br>Pull at 8', font: 'hand', size: 'm', out: { x: -4300, y: 900, w: 260, h: 170, opacity: 1, pinned: false }, updated: 1 })!;

  const JID = 'job:' + S1;
  const ok = await until(() => host.members().length === 3 && [video, jw, nw].every((w) => !w.webContents.isLoading()), 12000);
  check('three members registered and loaded', ok, host.members());
  await wait(2000);   // pages measured, first-open restore passes run (nothing saved yet)
  const B = () => host.boxes();
  const vb = B().get('video')!, jb0 = B().get(JID)!, nb0 = B().get('note:n1')!;
  console.log('video ' + JSON.stringify(vb) + ' job ' + JSON.stringify(jb0) + ' note ' + JSON.stringify(nb0));
  check('the job starts as its own strip', host.shapeOf(JID) === 'free' && jb0.width === 372, jb0);

  // Watch the job page for a view transition (its pseudo-elements animate while one runs).
  await jw.webContents.executeJavaScript(`window.__vt = 0; setInterval(() => { if (document.getAnimations().some((a) => String(a.effect && a.effect.pseudoElement || '').startsWith('::view-transition'))) window.__vt++; }, 8); 1`, true);

  // 1. The job dropped on the video's right edge, a little low: it sticks, joins, and becomes a column.
  const drop = async (id: string, dx: number, dy: number) => {
    // Slow at the end, like a hand settling it (a fling never catches, AquaSnap's rule).
    host.drag(id, 'start'); host.drag(id, 'move', dx / 2, dy / 2); await wait(60); host.drag(id, 'move', dx - 3, dy); await wait(60);
    host.drag(id, 'move', dx, dy); await wait(60); host.drag(id, 'end', dx, dy);
  };
  sizes.length = 0;
  await drop(JID, vb.x + vb.width + 6 - jb0.x, vb.y + 40 - jb0.y);
  await until(() => host.shapeOf(JID) === 'tall', 3000);
  await wait(1200);
  const jb1 = B().get(JID)!;
  check('job on the right is a COLUMN as tall as the video, flush, tops lined up', host.shapeOf(JID) === 'tall' && jb1.x === vb.x + vb.width && jb1.y === vb.y && jb1.width === 152 && jb1.height === vb.height, { jb1, vb });
  const page = await jw.webContents.executeJavaScript(`(() => { const c = document.querySelector('.pj'); const p = c.querySelector('.pct'); const cs = getComputedStyle(p);
    return { shape: document.documentElement.dataset.famShape, col: c.classList.contains('col'), pct: p.textContent, font: cs.fontFamily + ' ' + cs.fontWeight + ' ' + cs.fontSize,
      title: c.querySelector('.pr')?.textContent, now: c.querySelector('.cnow')?.textContent, tf: getComputedStyle(c).transform, vt: window.__vt }; })()`, true);
  check('the job page redrew as the column (title / % / bar / live line), nothing rotated', page.shape === 'tall' && page.col && /%$/.test(page.pct) && page.title === 'Waymark' && /Figtree/.test(page.font) && /700/.test(page.font) && page.tf === 'none' && !!page.now, page);
  check('the re-flow ran as a view transition', page.vt > 0, page.vt);
  check('the window was resized once or twice, never per frame', sizes.length >= 1 && sizes.length <= 3, sizes);

  // 2. The note dropped under the video: a strip as wide as the video, its own height.
  await drop('note:n1', vb.x + 30 - nb0.x, vb.y + vb.height + 5 - nb0.y);
  await until(() => host.shapeOf('note:n1') === 'wide', 3000);
  await wait(1200);
  const nb1 = B().get('note:n1')!;
  check('note below is a STRIP as wide as the video, its own height', host.shapeOf('note:n1') === 'wide' && nb1.x === vb.x && nb1.y === vb.y + vb.height && nb1.width === vb.width && nb1.height === nb0.height, { nb1, nb0 });
  check('one group of three', host.groupOf('video').length === 3, host.groupOf('video'));
  await picture([video, jw, nw], 'family3-joined.png');

  // 3. Saved per screen arrangement (anchors + its own size).
  host.saveNow();
  const saved = FS.readSaved(JSON.parse(readFileSync(saveFile, 'utf8')));
  const lay = FS.layoutFor(saved, FS.screenKey(TWO))!;
  check('saved: the job right of the video, the note below, the job\'s own size kept', lay?.members[JID]?.anchor?.side === 'right' && lay?.members['note:n1']?.anchor?.side === 'below' && lay.members[JID]!.own.width === 372, lay?.members);

  // 4. Pull apart, drag the job well away: it is free and back to its own strip and size.
  host.pullApart('video');
  await wait(700);
  const jsp = B().get(JID)!;
  await drop(JID, 260, 0);
  await wait(1500);
  host.endWiggle();
  await wait(1500);
  const jb2 = B().get(JID)!;
  const p2 = await jw.webContents.executeJavaScript(`({ shape: document.documentElement.dataset.famShape || 'free', sized: 'famSized' in document.documentElement.dataset, col: !!document.querySelector('.pj.col'), w: Math.round(document.querySelector('.pj').getBoundingClientRect().width) })`, true);
  check('taken out, the job is its own strip again, at its own size', host.shapeOf(JID) === 'free' && !host.joined(JID) && jb2.width === 372 && p2.shape === 'free' && !p2.col && !p2.sized && p2.w === 372, { jb2, p2, jsp });
  check('the video and the note joined back flush', host.groupOf('video').length === 2 && B().get('note:n1')!.y === B().get('video')!.y + B().get('video')!.height, [...B()]);
  await picture([video, jw, nw], 'family3-left.png');

  // 5. The video put away and shown again: the note waited, and goes back under it.
  video.hide();
  await wait(1200);
  check('video hidden: the note is on its own, back to its own size', !host.joined('note:n1') && B().get('note:n1')!.width === nb0.width, B().get('note:n1'));
  video.showInactive();
  await until(() => host.joined('note:n1') && host.shapeOf('note:n1') === 'wide', 4000);
  await wait(1200);
  check('video shown again: the note is back in its slot, a strip under it', host.joined('note:n1') && host.shapeOf('note:n1') === 'wide' && B().get('note:n1')!.width === vb.width, B().get('note:n1'));

  // 6. A "restart" with one monitor missing: a new family reads the file; the video opens, then the note, far away.
  host.saveNow();
  jp.dispose();
  for (const w of [nw, video]) w.destroy();
  await wait(300);
  host.dispose();
  const host2 = new FamilyHost({ origin: pages.origin, saveFile });
  host2.displays = () => [TWO[0]!];     // monitor 12 is gone
  host2.areas = () => AREA;
  const video2 = makeVideo(host2);
  const notes2 = new NoteWindows({ origin: pages.origin, preloadPath: preload, save: () => {}, overAang: () => false });
  notes2.family = host2;
  await until(() => !video2.webContents.isLoading(), 8000);
  await wait(800);
  const nw2 = notes2.show({ id: 'n1', title: 'Raid night', html: 'Bring flasks<br>Repair first<br>Pull at 8', font: 'hand', size: 'm', out: { x: -3200, y: 1100, w: 260, h: 170, opacity: 1, pinned: false }, updated: 1 })!;
  await until(() => host2.joined('note:n1') && host2.shapeOf('note:n1') === 'wide', 8000);
  await wait(1500);
  const v2 = host2.boxes().get('video')!, n2 = host2.boxes().get('note:n1')!;
  check('after a restart (one monitor missing): the note reopens into its slot under the video', host2.joined('note:n1') && n2.y === v2.y + v2.height && n2.x === v2.x && n2.width === v2.width, { v2, n2 });
  await picture([video2, nw2], 'family3-restored.png');

  console.log(bad ? `FAILED ${bad}` : 'ALL PASS');
  host2.dispose();
  app.exit(bad ? 1 : 0);
}).catch((e) => { console.log('HARNESS ERROR ' + String((e as Error)?.stack ?? e)); app.exit(2); });
