// Pop-outs on Samara's taskbar (sheet 66 A, 2026-10-22). Real windows, off his screen (x around -5000), never focused or
// raised, no real mouse or keys. NOTE: the windows do get real taskbar buttons (under Samara's lantern) for the ~30 s
// this runs; everything is closed at the end.
// Checks: every member wears 'Aang.Samara' (read back from Windows through the helper), the windows that never take the
// keyboard got WS_EX_APPWINDOW, loose ones are on the taskbar with their names and buttons; a snapped group (video + job
// + player) takes its members off the taskbar and gets ONE stand-in named "Video + Job + Player" whose picture DWM
// accepts (the helper's HRESULTs), carrying the player's buttons; clicking it raises the group; leaving the group gives
// each member its own picture back; the Claude job's % goes on Samara's window as the bar; Hide all / Show all / Gather.
// Pictures (at most 3): the group's composed thumbnail, its live preview, the button icons.
//
// Run: npx electron test/electron/taskbar-check.ts [folder for the pictures]
import { app, BrowserWindow, dialog, nativeImage } from 'electron';
import { mkdirSync, mkdtempSync, statSync, writeFileSync } from 'node:fs';
import os from 'node:os'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
import { servePages } from '../../src/pageserver.ts';
import { TimerWindows } from '../../src/timerwin.ts';
import { JobPops } from '../../src/jobpop.ts';
import { MiniPlayer } from '../../src/miniplayer.ts';
import { FamilyHost } from '../../src/familywin.ts';
import { wireTaskbar } from '../../src/taskbar.ts';
import { askHelper, stopEdgeHelper } from '../../src/winedge.ts';
import { glyphBitmap, GLYPHS } from '../../src/taskbaricons.ts';
import * as P from '../../src/taskbarplan.ts';

process.on('uncaughtException', (e) => { console.log('HARNESS ERROR ' + String((e as Error)?.stack ?? e).split('\n').slice(0, 4).join(' | ')); finish(2); });
process.on('unhandledRejection', (e) => { console.log('HARNESS REJECTION ' + String((e as Error)?.stack ?? e)); finish(2); });
dialog.showErrorBox = (t, c) => { console.log(`DIALOG (stubbed) ${t}: ${c}`); };
setTimeout(() => { console.log('HARNESS TIMEOUT'); finish(3); }, 120_000).unref();
app.on('window-all-closed', () => {});
const TMP = mkdtempSync(path.join(os.tmpdir(), 'taskbar-check-'));
app.setPath('userData', TMP);
const HERE = path.dirname(fileURLToPath(import.meta.url));
BrowserWindow.prototype.show = function (this: BrowserWindow) { if (this.webContents.getURL().includes('familymenu')) this.setPosition(-9000, 100); this.showInactive(); };
BrowserWindow.prototype.focus = function () {};
const raised: number[] = [];
BrowserWindow.prototype.moveTop = function (this: BrowserWindow) { raised.push(this.id); };
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
let bad = 0;
const check = (what: string, ok: boolean, d: unknown = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${what}${d !== '' ? '  -- ' + String(typeof d === 'string' ? d : JSON.stringify(d)).slice(0, 500) : ''}`); if (!ok) bad++; };
const until = async (fn: () => boolean | Promise<boolean>, ms = 8000) => { const end = Date.now() + ms; while (Date.now() < end) { if (await fn()) return true; await wait(100); } return fn(); };
const OUT = (() => { const a = process.argv.at(-1); try { if (a && !a.endsWith('.ts')) { mkdirSync(a, { recursive: true }); if (statSync(a).isDirectory()) return a; } } catch { /* below */ } return os.tmpdir(); })();
let finished = false;
function finish(code: number): void {
  if (finished) return;
  finished = true;
  try { for (const w of BrowserWindow.getAllWindows()) if (!w.isDestroyed()) w.destroy(); } catch { /* gone */ }
  setTimeout(() => { stopEdgeHelper(); app.exit(code); }, 300);
}
/** A premultiplied picture over his dark wood, upscaled k times (whole pixels), as a PNG. */
function png(px: Uint8Array, w: number, h: number, k = 1): Buffer {
  const W = w * k, H = h * k, out = Buffer.alloc(W * H * 4);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const s = (Math.floor(y / k) * w + Math.floor(x / k)) * 4, d = (y * W + x) * 4, a = px[s + 3]! / 255;
    out[d] = Math.round(px[s]! + 0x24 * (1 - a)); out[d + 1] = Math.round(px[s + 1]! + 0x1c * (1 - a)); out[d + 2] = Math.round(px[s + 2]! + 0x20 * (1 - a)); out[d + 3] = 255;
  }
  return nativeImage.createFromBitmap(out, { width: W, height: H }).toPNG();
}

app.whenReady().then(async () => {
  const pages = await servePages(path.join(HERE, '..', '..', 'pages'));
  const host = new FamilyHost({ origin: pages.origin, saveFile: null });
  const AREA = { x: -6000, y: 0, width: 3000, height: 1600 };
  host.displays = () => [{ id: 11, scaleFactor: 1, bounds: AREA }];
  host.areas = () => [AREA];
  const preload = path.join(HERE, '..', '..', 'src', 'preload.cjs');

  // Samara's window (only for the bar): its setProgressBar is watched.
  const samara = new BrowserWindow({ x: -5900, y: 1300, width: 300, height: 200, show: false, backgroundColor: '#24160D' });
  const bars: string[] = [];
  samara.setProgressBar = ((v: number, o?: { mode?: string }) => { bars.push(`${Math.round(v * 100) / 100}:${o?.mode ?? ''}`); }) as typeof samara.setProgressBar;
  const S1 = '0b6c2a8e-1111-4c3d-9e2f-aaaaaaaaaaaa';
  const job = (phase: string, extra: Record<string, unknown> = {}) => ({ id: S1, machine: 'pc', cwd: 'C:\\x', project: 'Waymark', title: 'Waymark', phase, startedAt: Date.now() - 60_000, prompt: 'go',
    tasks: ['Replay harness', 'Athlete model', 'Folding the route list', 'Test week'].map((text, i) => ({ text, status: i < 2 ? 'completed' : i === 2 ? 'in_progress' : 'pending' })),
    current: '', percent: 50, etaMs: null, usage: null, open: '', held: 0, activity: { now: 'Folding the route list', since: Date.now() - 12_000, agents: [] }, ...extra });
  let jobsNow: unknown[] = [job('working')];
  const acts: string[] = [];
  const timersNow: P.Timer[] = [{ id: 't1', label: 'Flask', total: 600_000, end: Date.now() + 412_000, paused: 0 }];
  const tb = wireTaskbar(host, {
    samara: () => samara,
    info: (id, kind) => {
      if (kind === 'job') { const j = P.jobNow(jobsNow.find((x) => (x as { id: string }).id === id.slice(4)) as Record<string, unknown>, Date.now()); return { label: P.memberLabel('job', { job: j }), state: { paused: j.phase === 'paused', active: j.active } }; }
      if (kind === 'timer') return { label: P.memberLabel('timer', { timer: timersNow[0]!, now: Date.now() }), state: {} };
      if (kind === 'player') return { label: P.memberLabel('player', { title: 'Maria También', artist: 'Khruangbin' }), state: { playing: true } };
      if (kind === 'video') return { label: 'Lofi beats to raid to', state: { playing: true } };
      return { label: P.memberLabel(kind, {}), state: {} };
    },
    act: (id, kind, b) => { acts.push(`${id}/${kind}/${b}`); },
    jobs: () => jobsNow,
    aang: () => ({ x: -3300, y: 1300, width: 90, height: 110 }),
    open: { note: () => acts.push('open note'), timer: () => acts.push('open timer'), player: () => acts.push('open player') },
  })!;
  check('wired (Windows)', !!tb);
  tb.areaFor = () => AREA;

  // The members: the video page, a timer, a Claude job, the mini player.
  const video = new BrowserWindow({ x: -5200, y: 200, width: 640, height: 394, frame: false, transparent: false, backgroundColor: '#24160D', show: false,
    webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false, preload } });
  void video.loadURL(`${pages.origin}/popout.html`);
  video.once('ready-to-show', () => video.showInactive());
  host.add({ id: 'video', kind: 'video', win: () => (video.isDestroyed() ? null : video), card: '.frame', setOpacity: (n) => video.setOpacity(n), setPinned: () => {} });
  const timers = new TimerWindows({ origin: pages.origin, preloadPath: preload, spotFile: path.join(TMP, 'timer-spot.json'), near: () => null });
  timers.family = host;
  timers.sync(timersNow);
  const tw = (timers as unknown as { wins: Map<string, { w: BrowserWindow }> }).wins.get('t1')!.w;
  tw.setPosition(-4300, 900);
  const jp = new JobPops({ origin: pages.origin, preloadPath: path.join(HERE, '..', '..', 'src', 'jobpoppreload.cjs'), clampToScreen: false, aangRects: () => [] });
  jp.family = host;
  jp.update(jobsNow, []);
  const jw = jp.open(S1, { x: -4800, y: 1200 })!;
  const player = new MiniPlayer({ origin: pages.origin, preloadPath: path.join(HERE, '..', '..', 'src', 'playerpreload.cjs'), clampToScreen: false });
  player.family = host;
  const pw = player.open();
  pw.setPosition(-5600, 1200);
  const JID = 'job:' + S1, TID = 'timer:t1';
  const all = ['video', TID, JID, 'player'];
  const wins: Record<string, BrowserWindow> = { video, [TID]: tw, [JID]: jw, player: pw };

  check('all four tracked by the taskbar through the family', await until(() => all.every((id) => tb.members.has(id)) && Object.values(wins).every((w) => !w.webContents.isLoading() && w.isVisible()), 15000), [...tb.members.keys()]);
  player.media({ t: 'media.now', v: 1, app: 'spotify', spotify: true, title: 'Maria También', artist: 'Khruangbin', album: 'Con Todo El Mundo', status: 'playing', position: 101.2, duration: 241, at: Date.now(), canSeek: true, volume: 0.7, thumb: null });
  video.webContents.send('popout:show', { url: '', source: 'youtube', label: 'YouTube', live: false, title: 'Lofi beats to raid to' });

  // 1. Loose: every one on the taskbar, Samara's id, app-window style, its name and buttons.
  const loose = () => all.every((id) => tb.members.get(id)?.on === true);
  check('loose: every pop-out is on the taskbar (the helper answered first)', await until(loose, 20000), [...tb.members.values()].map((t) => `${t.id}:${t.styled}:${t.on}`));
  for (const id of all) {
    const q = await askHelper('Q', wins[id]!);
    const [style, appId] = q.split(' ');
    check(`${id}: Windows says app id Aang.Samara and WS_EX_APPWINDOW`, appId === 'Aang.Samara' && (Number(style) & 0x40000) !== 0, q);
  }
  check('the ones that never take the keyboard still never do (WS_EX_NOACTIVATE kept: timer, job, player)', await (async () => {
    for (const id of [TID, JID, 'player']) { const s = Number((await askHelper('Q', wins[id]!)).split(' ')[0]); if (!(s & 0x08000000)) return false; } return true;
  })());
  await until(() => tw.getTitle().startsWith('Flask · ') && jw.getTitle() === 'Waymark · 50%', 4000);
  check('names: "Flask · m:ss", "Waymark · 50%", the song, the video', /^Flask · \d+:\d\d$/.test(tw.getTitle()) && jw.getTitle() === 'Waymark · 50%' && pw.getTitle() === 'Maria También · Khruangbin' && video.getTitle() === 'Lofi beats to raid to',
    [tw.getTitle(), jw.getTitle(), pw.getTitle(), video.getTitle()]);
  const btns = (id: string) => tb.members.get(id)?.btns ?? '';
  check('buttons set (Windows took them): timer pause/+1/stop, job pause/open, player prev/pause/next, video pause/pin',
    await until(() => /Pause.*One more minute.*Stop/.test(btns(TID)) && /Pause.*Open in Claude/.test(btns(JID)) && /Previous.*Pause.*Next/.test(btns('player')) && /pin/.test(btns('video')), 5000),
    all.map((id) => `${id}: ${btns(id).slice(0, 80)}`));

  // 2. The bar: the job's 50% on Samara's window; amber when paused; gone when none.
  check('bar: the running job\'s 50% on Samara\'s window', await until(() => bars.at(-1) === '0.5:normal', 4000), bars);
  jobsNow = [job('paused')]; jp.update(jobsNow, []);
  check('bar: amber (paused) when the job is paused', await until(() => bars.at(-1) === '0.5:paused', 4000), bars);
  jobsNow = [job('working')];
  await until(() => bars.at(-1) === '0.5:normal', 4000);
  jobsNow = [job('working', { activity: { now: 'x', aliveAt: Date.now() - 900_000, stallMs: 300_000 } })];
  check('bar: amber when the job has stalled', await until(() => bars.at(-1) === '0.5:paused', 4000), bars);
  jobsNow = [];
  check('bar: cleared when no job runs', await until(() => bars.at(-1) === '-1:none', 4000), bars);
  jobsNow = [job('working')];

  // 3. Snap the job on the video's right and the player below it: ONE group.
  const drop = async (id: string, dx: number, dy: number) => {
    host.drag(id, 'start'); host.drag(id, 'move', dx / 2, dy / 2); await wait(60); host.drag(id, 'move', dx - 3, dy); await wait(60);
    host.drag(id, 'move', dx, dy); await wait(60); host.drag(id, 'end', dx, dy);
  };
  const B = () => host.boxes();
  await wait(1500);
  let vb = B().get('video')!, jb = B().get(JID)!;
  await drop(JID, vb.x + vb.width + 4 - jb.x, vb.y + 10 - jb.y);
  await wait(1200);
  vb = B().get('video')!; const pb = B().get('player')!;
  await drop('player', vb.x + 10 - pb.x, vb.y + vb.height + 4 - pb.y);
  await wait(1500);
  check('the family joined video + job + player', host.groupOf('video').length === 3, host.groupOf('video'));
  const grouped = () => tb.proxies.size === 1 && [...tb.proxies.values()][0]!.label === 'Video + Job + Player' && ['video', JID, 'player'].every((id) => tb.members.get(id)?.on === false) && tb.members.get(TID)?.on === true;
  check('snapped: members off the taskbar, ONE stand-in "Video + Job + Player", the timer still loose', await until(grouped, 6000),
    { proxies: [...tb.proxies.values()].map((p) => ({ lead: p.lead, label: p.label, ids: p.ids })), on: [...tb.members.values()].map((t) => `${t.id}:${t.on}`) });
  const px = [...tb.proxies.values()][0]!;
  const said = (re: RegExp) => tb.answers.some((a) => re.test(a));
  check('the stand-in was made iconic by Windows (DWMWA_FORCE_ICONIC_REPRESENTATION, HAS_ICONIC_BITMAP: S_OK)', await until(() => said(/proxy \d+ made 0,0$/), 6000), tb.answers.slice(-12));
  check('its name was taken', await until(() => said(/name "Video \+ Job \+ Player" 0$/), 4000), tb.answers.slice(-8));
  check('it carries the PLAYER\'s buttons (the player is in the group)', px.owner === 'player' && /^1\.0\.0\.[^,]+,2\.2\.0\.[^,]+,3\.3\.0\./.test(px.btns) && await until(() => said(/buttons (0|later)$/), 4000), { owner: px.owner, btns: px.btns });

  // 4. DWM asks for the picture (what hovering the lantern does): composed, and DWM takes it.
  const heard = (tb as unknown as { heard(id: number, what: string, n: number[]): void }).heard.bind(tb);
  // DWM's own request carries its size; unasked, it takes up to about 160 x 100 (measured: 185 x 140 is refused).
  heard(px.pid, 'thumb', [160, 100]);
  check('thumbnail: composed and DwmSetIconicThumbnail said S_OK', await until(() => said(/thumb \d+x\d+ 0$/), 8000), tb.answers.filter((a) => /thumb|peek/.test(a)));
  heard(px.pid, 'peek', []);
  check('live preview (peek): DwmSetIconicLivePreviewBitmap said S_OK', await until(() => said(/peek \d+x\d+ 0$/), 8000), tb.answers.filter((a) => /thumb|peek/.test(a)));
  const thumb = await tb.compose(px.ids, 240, 140, false);
  check('the picture shows every member (each panel has opaque pixels) and fits 240x140', !!thumb && thumb.width <= 240 && thumb.height <= 140 && (() => {
    const lay = P.fitLayout(px.ids.map((id) => host.boxOf(id)!), 240, 140, 1);
    return lay.rects.every((r) => { let n = 0; for (let y = r.y; y < r.y + r.height; y++) for (let x = r.x; x < r.x + r.width; x++) if (thumb!.pixels[(y * thumb!.width + x) * 4 + 3]! > 200) n++; return n > r.width * r.height * 0.3; });
  })(), thumb ? `${thumb.width}x${thumb.height}` : 'none');
  if (thumb) writeFileSync(path.join(OUT, 'taskbar-group-thumb.png'), png(thumb.pixels, thumb.width, thumb.height, 2));
  const peek = await tb.compose(px.ids, 0, 0, true);
  if (peek) writeFileSync(path.join(OUT, 'taskbar-group-peek.png'), png(peek.pixels, peek.width, peek.height, 1));

  // 5. Clicking the picture brings the whole group forward (the lead last); its buttons work.
  raised.length = 0;
  heard(px.pid, 'click', []);
  check('click: the whole group raised, the video last', raised.length === 3 && raised.at(-1) === video.id && [jw.id, pw.id].every((i) => raised.includes(i)), raised);
  heard(px.pid, 'btn', [2]);
  check('the group\'s Play/Pause reaches the player', await until(() => acts.includes('player/player/2'), 2000), acts);

  // 6. The job leaves the group: it gets its own picture back; the group is renamed.
  host.pullApart('video');
  await wait(900);
  const jb2 = B().get(JID)!;
  await drop(JID, 400, 300);
  await wait(900);
  host.endWiggle();
  await wait(1600);
  check('the job left the group', !host.groupOf('video').includes(JID), host.groupOf('video'));
  check('left: the job is back on the taskbar with its own picture and buttons; the group is "Video + Player"', await until(() => tb.members.get(JID)?.on === true && /Open in Claude/.test(btns(JID)) && [...tb.proxies.values()][0]?.label === 'Video + Player', 5000),
    { on: tb.members.get(JID)?.on, label: [...tb.proxies.values()].map((p) => p.label), jb2 });

  // 7. Hide all / Show all / Gather them by Aang (the right-click list).
  await tb.runTask('popouts-hide');
  await wait(300);
  check('Hide all: every pop-out hidden, none on the taskbar plan', all.every((id) => !wins[id]!.isVisible()) && tb.plan().loose.length === 0 && tb.plan().groups.length === 0);
  await tb.runTask('popouts-show');
  await wait(300);
  check('Show all: every pop-out back', all.every((id) => wins[id]!.isVisible()));
  await tb.runTask('popouts-gather');
  await wait(1500);
  check('Gather them by Aang: all four in one group, left of Aang', host.groupOf('video').length === 4 && (() => { const b = P.boundsOf(all.map((id) => host.boxOf(id)!)); return b.x + b.width <= -3300; })(),
    { group: host.groupOf('video'), boxes: [...B()].map(([k, b]) => `${k} ${b.x},${b.y} ${b.width}x${b.height}`) });
  check('gathered: ONE stand-in "Video + Job + Player + Timer", nothing loose', await until(() => tb.proxies.size === 1 && [...tb.proxies.values()][0]!.label === 'Video + Job + Player + Timer' && tb.plan().loose.length === 0, 5000),
    [...tb.proxies.values()].map((p) => p.label));
  for (const t of ['new-note', 'timer', 'player'] as const) await tb.runTask(t);
  check('New note / Timer / Music player reach main.ts\'s doors', ['open note', 'open timer', 'open player'].every((a) => acts.includes(a)), acts);

  // 8. The button icons, for a look (each glyph at 32 px, 3x).
  const names = Object.keys(GLYPHS), cell = 32, k = 3, Wd = names.length * (cell + 8), sheet = new Uint8Array(Wd * cell * 4);
  names.forEach((n, i) => P.blit(sheet, Wd, cell, glyphBitmap(n, 2), 32, 32, i * (cell + 8), 0));
  writeFileSync(path.join(OUT, 'taskbar-icons.png'), png(sheet, Wd, cell, k));
  console.log('PICTURES taskbar-*.png in ' + OUT);
  console.log('HELPER ' + tb.answers.join(' | ').slice(0, 1500));

  // 9. Gone: the stand-in goes with the group.
  tb.dispose();
  jp.dispose(); player.close(); host.dispose();
  console.log(bad ? `FAILED ${bad}` : 'ALL PASS');
  finish(bad ? 1 : 0);
}).catch((e) => { console.log('HARNESS ERROR ' + String((e as Error)?.stack ?? e)); finish(2); });
