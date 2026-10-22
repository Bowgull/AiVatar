// The window family, part 1 (2026-10-22), with three real windows: the video pop-out's page, a Claude job pop-out
// (JobPops) and a sticky note (NoteWindows). All off his screen (x around -5000), never focused, never raised, no real
// mouse, keys or clipboard: drags go in as the pages' own drag messages, the right-click and Esc as events made inside
// the pages. Checks: a job dragged near the video's right edge sticks flush and joins; a note below joins too; dragging
// ANY member moves the whole group; the joined sides go square (the pages are told); right-click opens the one family
// menu; Pull apart spreads them 14 px with the wiggle; the job dragged 40+ px out is free and keeps its own size; the note
// dragged to the video's right side goes there while the others slide; Esc joins the rest back flush.
// Pictures (<= 4): joined, the menu, pulled apart, joined back.
//
// Run: npx electron test/electron/family-check.ts [folder for the pictures]
import { app, BrowserWindow, screen, nativeImage } from 'electron';
import { mkdtempSync, statSync, writeFileSync } from 'node:fs';
import os from 'node:os'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
import { servePages } from '../../src/pageserver.ts';
import { JobPops } from '../../src/jobpop.ts';
import { NoteWindows } from '../../src/notewin.ts';
import { FamilyHost } from '../../src/familywin.ts';
import * as F from '../../src/family.ts';

process.on('uncaughtException', (e) => { console.log('HARNESS ERROR ' + String((e as Error)?.stack ?? e).split('\n').slice(0, 4).join(' | ')); app.exit(2); });
process.on('unhandledRejection', (e) => { console.log('HARNESS REJECTION ' + String((e as Error)?.stack ?? e)); app.exit(2); });
setTimeout(() => { console.log('HARNESS TIMEOUT'); app.exit(3); }, 90_000).unref();
app.on('window-all-closed', () => {});
app.setPath('userData', mkdtempSync(path.join(os.tmpdir(), 'family-check-')));
const HERE = path.dirname(fileURLToPath(import.meta.url));
// Off his screen, never in front of his game. The menu/catcher window (it covers a work area) is moved off too.
BrowserWindow.prototype.show = function (this: BrowserWindow) { if (this.webContents.getURL().includes('familymenu')) this.setPosition(-9000, 100); this.showInactive(); };
BrowserWindow.prototype.focus = function () {};
BrowserWindow.prototype.moveTop = function () {};
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
let bad = 0;
const check = (what: string, ok: boolean, d: unknown = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${what}${d !== '' ? '  -- ' + String(typeof d === 'string' ? d : JSON.stringify(d)).slice(0, 300) : ''}`); if (!ok) bad++; };
const until = async (fn: () => boolean | Promise<boolean>, ms = 6000) => { const end = Date.now() + ms; while (Date.now() < end) { if (await fn()) return true; await wait(60); } return fn(); };
const OUT = (() => { const a = process.argv.at(-1); try { return a && statSync(a).isDirectory() ? a : os.tmpdir(); } catch { return os.tmpdir(); } })();

const S1 = '0b6c2a8e-1111-4c3d-9e2f-aaaaaaaaaaaa';
const job = { id: S1, machine: 'pc', cwd: 'C:\\x', project: 'waymark', title: 'Waymark', model: 'opus', phase: 'working', startedAt: Date.now() - 20 * 60_000, lastActivity: 1, prompt: 'go',
  tasks: [{ text: 'Fold the route list', status: 'in_progress', active: 'Folding the route list' }, { text: 'Test it', status: 'pending' }], current: '', percent: null, etaMs: null, usage: null,
  open: `claude://claude.ai/epitaxy/local_${S1}`, held: 0, progress: { done: 1, total: 2, cur: 1, elapsedMs: 0, at: Date.now(), paceMs: 600000, rev: 1, rewroteAt: null },
  activity: { now: 'Folding the route list', since: Date.now() - 5000, agents: [] } };

app.whenReady().then(async () => {
  const pages = await servePages(path.join(HERE, '..', '..', 'pages'));
  const host = new FamilyHost({ origin: pages.origin });

  // 1. The video pop-out's own page in a window made the way popout.ts makes it (hidden title bar, opaque wood).
  const video = new BrowserWindow({ x: -5200, y: 200, width: 640, height: 394, titleBarStyle: 'hidden', thickFrame: true, transparent: false, backgroundColor: '#24160D', show: false,
    webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false, preload: path.join(HERE, '..', '..', 'src', 'preload.cjs') } });
  void video.loadURL(`${pages.origin}/popout.html`);
  video.once('ready-to-show', () => video.showInactive());
  host.add({ id: 'video', kind: 'video', win: () => (video.isDestroyed() ? null : video), card: '.frame', osCorners: true, setOpacity: (n) => video.setOpacity(n), setPinned: () => {} });

  // 2. A Claude job pop-out, the real module.
  const jp = new JobPops({ origin: pages.origin, preloadPath: path.join(HERE, '..', '..', 'src', 'jobpoppreload.cjs'), clampToScreen: false, aangRects: () => [] });
  jp.family = host;
  jp.update([job], []);
  const jw = jp.open(S1, { x: -4400, y: 260 })!;
  // 3. A sticky note, the real module.
  const saved: unknown[] = [];
  const notes = new NoteWindows({ origin: pages.origin, preloadPath: path.join(HERE, '..', '..', 'src', 'preload.cjs'), save: (n) => saved.push(n), overAang: () => false });
  notes.family = host;
  const nw = notes.show({ id: 'n1', title: 'Raid night', html: 'Bring flasks<br>Repair first', col: 'gold', font: 'hand', size: 'm', out: { x: -5150, y: 700, w: 220, h: 170, opacity: 1, pinned: false }, updated: 1 })!;

  const ok = await until(() => host.members().length === 3 && [video, jw, nw].every((w) => !w.webContents.isLoading()), 10000);
  check('three members registered and loaded', ok, host.members());
  await wait(900);   // the pages measure their panels
  const B = () => host.boxes();
  const vb0 = B().get('video')!, jb0 = B().get('job:' + S1)!, nb0 = B().get('note:n1')!;
  check('the panels are measured (job card inside its see-through window)', jb0.width === 372 && nb0.width === 220 && vb0.width === 640, { vb0, jb0, nb0 });

  // 4. Drag the job to 9 px right of the video, 6 px low: it sticks flush (instantly, mid-drag), and joins on release.
  const jjs = (s: string) => jw.webContents.executeJavaScript(s, true);
  const jdx = vb0.x + vb0.width + 9 - jb0.x, jdy = vb0.y + 6 - jb0.y;
  // A real hand: quick most of the way, then slow onto the spot (a fast fling never catches, AquaSnap's rule).
  await jjs(`window.jobpop.drag({ phase: 'start' }); window.jobpop.drag({ phase: 'move', dx: ${Math.round(jdx / 2)}, dy: ${Math.round(jdy / 2)} }); 1`);
  await wait(80); await jjs(`window.jobpop.drag({ phase: 'move', dx: ${jdx - 2}, dy: ${jdy} }); 1`);
  await wait(60); await jjs(`window.jobpop.drag({ phase: 'move', dx: ${jdx}, dy: ${jdy} }); 1`);
  await wait(150);
  const jmid = B().get('job:' + S1)!;
  check('mid-drag: stuck flush to the video\'s right edge, tops lined up', jmid.x === vb0.x + vb0.width && jmid.y === vb0.y, { jmid, vb0 });
  await jjs(`window.jobpop.drag({ phase: 'end' }); 1`);
  await wait(150);
  check('on release: joined', host.joined('job:' + S1) && host.groupOf('video').length === 2, host.groupOf('video'));

  // 5. The note to 11 px below the video: joins below.
  const nmove = (phase: string, dx = 0, dy = 0) => notes.move(nw.webContents, 'drag', phase, dx, dy);
  const nslow = async (dx: number, dy: number, end = true) => { nmove('start'); nmove('move', dx / 2, dy / 2); await wait(80); nmove('move', dx - 2, dy); await wait(60); nmove('move', dx, dy); if (end) nmove('end'); };
  await nslow(vb0.x - nb0.x + 3, vb0.y + vb0.height + 11 - nb0.y);
  await wait(150);
  const nb1 = B().get('note:n1')!;
  check('the note stuck under the video and joined (3 in the group)', nb1.y === vb0.y + vb0.height && nb1.x === vb0.x && host.groupOf('job:' + S1).length === 3, { nb1, vb0 });
  check('the note saved where the family put it', saved.length > 0);

  // 6. Dragging ANY member (the note) moves the whole group, flush.
  await nslow(40, -25);
  await wait(150);
  const g = B();
  check('the whole group moved by the same amount', g.get('video')!.x === vb0.x + 40 && g.get('video')!.y === vb0.y - 25 && g.get('job:' + S1)!.x === jmid.x + 40, { v: g.get('video'), j: g.get('job:' + S1) });
  check('still flush', F.contact(g.get('job:' + S1)!, g.get('video')!) === 'right' && F.contact(g.get('note:n1')!, g.get('video')!) === 'below');
  const sides = await Promise.all([video, jw, nw].map((w) => w.webContents.executeJavaScript(`document.documentElement.dataset.famJoin`, true)));
  check('joined sides go square (the pages are told)', sides[0].split(' ').sort().join() === 'below,right' && sides[1] === 'left' && sides[2] === 'above', sides);
  const radius = await jjs(`getComputedStyle(document.querySelector('.pj')).borderTopLeftRadius + '/' + getComputedStyle(document.querySelector('.pj')).borderTopRightRadius`);
  check('the job card\'s left corners are square, its right ones round', /^0px\/1\dpx$/.test(radius), radius);

  // A picture of the group: each window's page, laid out where the windows are.
  const ov = host.overlay as unknown as { w: BrowserWindow | null };
  const composite = async (name: string, extra: { img: Electron.NativeImage; at: { x: number; y: number } }[] = []) => {
    const bs = host.boxes();
    const shots = await Promise.all([['video', video], ['job:' + S1, jw], ['note:n1', nw]].map(async ([id, w]) => {
      const win = w as BrowserWindow, cb = win.getContentBounds(), b = bs.get(id as string)!;
      const img = await win.webContents.capturePage({ x: b.x - cb.x, y: b.y - cb.y, width: b.width, height: b.height });
      return { img, at: { x: b.x, y: b.y } };
    }));
    const all = [...shots, ...extra];
    const L = Math.min(...all.map((s) => s.at.x)) - 30, T = Math.min(...all.map((s) => s.at.y)) - 70;
    const R = Math.max(...all.map((s) => s.at.x + s.img.getSize().width)) + 30, Bm = Math.max(...all.map((s) => s.at.y + s.img.getSize().height)) + 30;
    const c = new BrowserWindow({ width: R - L, height: Bm - T, show: false, frame: false, webPreferences: { offscreen: true, sandbox: true } });
    const html = `<body style="margin:0;background:radial-gradient(80% 90% at 30% 10%,#2e333c 0%,#22262d 55%,#1a1c21 100%);width:${R - L}px;height:${Bm - T}px;position:relative;overflow:hidden">` +
      all.map((s) => `<img src="${s.img.toDataURL()}" style="position:absolute;left:${s.at.x - L}px;top:${s.at.y - T}px;filter:drop-shadow(0 4px 7px rgba(0,0,0,.5))">`).join('') + '</body>';
    await c.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));
    await wait(250);
    const img = await c.webContents.capturePage();
    c.destroy();
    const small = img.getSize().width > 1100 ? img.resize({ width: 1100 }) : img;
    const f = path.join(OUT, name); writeFileSync(f, small.toPNG()); console.log('PICTURE ' + f + ' ' + JSON.stringify(small.getSize()));
  };
  await composite('family-joined.png');

  // 7. Right-click the job: the one family menu.
  await jjs(`document.querySelector('.pj').dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, screenX: ${jmid.x + 80}, screenY: ${jmid.y + 30} })); 1`);
  const menuUp = await until(() => !!ov.w && ov.w.isVisible(), 4000);
  const ojs = (s: string) => ov.w!.webContents.executeJavaScript(s, true);
  const menu = menuUp ? await ojs(`(() => { const m = document.querySelector('.tabmenu'); const r = m.getBoundingClientRect(); return { head: m.querySelector('.mhead').textContent, rows: [...m.querySelectorAll('button')].map((b) => b.textContent), see: !!m.querySelector('.seerow .track'), r: { x: r.left, y: r.top, width: r.width, height: r.height } }; })()`) : null;
  check('right-click a joined window: one family menu (see-through, pin, click through, pull apart)', !!menu && menu.head === '3 WINDOWS JOINED' && menu.see && /Pin on top/.test(menu.rows[0]) && /ALL 3/.test(menu.rows[0]) && /Click through/.test(menu.rows[1]) && /Pull apart/.test(menu.rows[2]), menu);
  if (menu) {
    await ojs(`document.querySelector('.tabmenu').classList.add('on'); document.documentElement.style.setProperty('background', '#22262d', 'important'); document.body.style.setProperty('background', '#22262d', 'important'); 1`);
    await wait(200);
    const r = menu.r, img = await ov.w!.webContents.capturePage({ x: Math.floor(r.x) - 12, y: Math.floor(r.y) - 12, width: Math.ceil(r.width) + 24, height: Math.ceil(r.height) + 24 });
    const f = path.join(OUT, 'family-menu.png'); writeFileSync(f, img.toPNG()); console.log('PICTURE ' + f);
    await ojs(`document.documentElement.style.removeProperty('background'); document.body.style.removeProperty('background'); 1`);
    // The see-through slider: every member follows, never under 30%.
    await ojs(`(() => { const t = document.querySelector('.track'), b = t.getBoundingClientRect(); const o = { bubbles: true, button: 0, pointerId: 3, clientX: b.left + 2, clientY: b.top + 4 }; t.dispatchEvent(new PointerEvent('pointerdown', o)); t.dispatchEvent(new PointerEvent('pointerup', o)); return 1; })()`);
    await wait(250);
    check('see-through from the menu: every member follows, floor 30%', Math.abs(video.getOpacity() - 0.3) < 0.02 && Math.abs(nw.getOpacity() - 0.3) < 0.02 && host.sharedState.opacity === 0.3, { v: video.getOpacity(), n: nw.getOpacity() });
    await ojs(`(() => { const t = document.querySelector('.track'), b = t.getBoundingClientRect(); const o = { bubbles: true, button: 0, pointerId: 3, clientX: b.right, clientY: b.top + 4 }; t.dispatchEvent(new PointerEvent('pointerdown', o)); t.dispatchEvent(new PointerEvent('pointerup', o)); return 1; })()`);
    await wait(150);
    // 8. Pull apart.
    await ojs(`document.querySelector('button[data-id="apart"]').click(); 1`);
  }
  await wait(700);
  const s1 = B();
  const gapR = s1.get('job:' + S1)!.x - (s1.get('video')!.x + s1.get('video')!.width), gapB = s1.get('note:n1')!.y - (s1.get('video')!.y + s1.get('video')!.height);
  check('pull apart: 14 px gaps (give or take the 1 px shimmy), wiggling', host.wiggling && Math.abs(gapR - 14) <= 2 && Math.abs(gapB - 14) <= 2, { gapR, gapB });
  const wig = await jjs(`document.documentElement.classList.contains('fam-wiggle') && getComputedStyle(document.querySelector('.fam-rim')).opacity`);
  check('the gold rim shows on the wiggling job; sides round again', wig === '1' && (await jjs(`document.documentElement.dataset.famJoin`)) === '', wig);
  const hint = ov.w?.isVisible() && await ojs(`document.querySelector('.plate.hint')?.textContent`);
  check('the hint line shows over the desktop catcher', /Drag one out.*ESC.*to join back/.test(String(hint)), hint);
  await composite('family-apart.png', hint ? [] : []);

  // 9. Drag the job 100 px out: free, its own size, no longer wiggling.
  const jb2 = B().get('job:' + S1)!;
  await jjs(`window.jobpop.drag({ phase: 'start' }); window.jobpop.drag({ phase: 'move', dx: 60, dy: 0 }); window.jobpop.drag({ phase: 'move', dx: 120, dy: 10 }); window.jobpop.drag({ phase: 'end' }); 1`);
  await wait(500);
  const jb3 = B().get('job:' + S1)!;
  check('dragged 40+ px out: free, its own size', !host.joined('job:' + S1) && host.groupOf('video').length === 2 && jb3.width === jb2.width && jb3.height === jb2.height, { group: host.groupOf('video'), jb3 });
  check('it stops wiggling', (await jjs(`document.documentElement.classList.contains('fam-wiggle')`)) === false);

  // 10. Drag the note to the video's right side: it goes there; no slot is ever drawn.
  const s2 = B(), v2 = s2.get('video')!, n2 = s2.get('note:n1')!;
  // its middle 20 px past the video's right edge, level with the video: the video's right side is where it goes
  const tx = v2.x + v2.width + 20 - n2.width / 2 - n2.x, ty = v2.y + 10 - n2.y;
  await nslow(tx, ty, false);
  await wait(250);
  const slots = await ojs(`document.querySelectorAll('.slot, [class*="ghost"], [class*="placeholder"]').length`);
  nmove('end');
  await wait(600);
  // 11. Esc on the catcher: the rest join back flush.
  await ojs(`window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); 1`);
  await wait(1000);
  const s3 = B();
  check('rearranged: the note now sits flush on the video\'s right, nothing drawn in its old place', slots === 0 && F.contact(s3.get('note:n1')!, s3.get('video')!) === 'right' && !host.wiggling, { slots, n: s3.get('note:n1'), v: s3.get('video') });
  check('joined back: the video and the note, the job stays free', host.groupOf('video').length === 2 && !host.joined('job:' + S1));
  check("the catcher is gone", !ov.w?.isVisible());
  await composite('family-rejoined.png');

  // 12. F3: the note grows; nothing hangs on it, but the job joined below it would follow. Quick check via the maths path.
  const nsides = await nw.webContents.executeJavaScript(`document.documentElement.dataset.famJoin`, true);
  check('after joining back the note\'s left side is square again', nsides === 'left', nsides);

  console.log(bad ? `${bad} FAILED` : 'ALL PASSED');
  host.dispose(); jp.dispose(); for (const w of BrowserWindow.getAllWindows()) if (!w.isDestroyed()) w.destroy(); pages.close();
  app.exit(bad ? 1 : 0);
});
void screen; void nativeImage;
