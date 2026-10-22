// Sheet 59, the Spotify mini player (2026-10-22): a MiniPlayer off screen, never focused, no real mouse or keys (every
// press is an event made inside the page). Checks: safe and SOLID (never see-through), never takes the keyboard, a family
// member; the song, the cover and a time that moves on its own between updates; the keys go out as checked media.cmd only;
// the VIS key cycles BARS -> SCENE -> OFF with its label, SCENE cross-fades the scene into the picture spot, a click gives
// the next scene and the four dots follow; the seek bead sends a seek; a double-click folds it to the shade strip on the
// spring and back; it remembers its mode and scene. Pictures (at most four): full, scene, shade, the skater at 4x.
//
// Run: npx electron test/electron/player-check.ts [folder for the pictures]
import { app, BrowserWindow, nativeImage } from 'electron';
import { mkdtempSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import os from 'node:os'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
import { servePages } from '../../src/pageserver.ts';
import { MiniPlayer, FULL_H, SHADE_H } from '../../src/miniplayer.ts';
import type { PlayerCmd } from '../../src/playercmd.ts';
import { FamilyHost } from '../../src/familywin.ts';

process.on('uncaughtException', (e) => { console.log('HARNESS ERROR ' + String((e as Error)?.stack ?? e).split('\n').slice(0, 3).join(' | ')); app.exit(2); });
process.on('unhandledRejection', (e) => { console.log('HARNESS REJECTION ' + String((e as Error)?.stack ?? e)); app.exit(2); });
setTimeout(() => { console.log('HARNESS TIMEOUT'); app.exit(3); }, 90_000).unref();
app.on('window-all-closed', () => {});
const tmp = mkdtempSync(path.join(os.tmpdir(), 'player-check-'));
app.setPath('userData', tmp);
const HERE = path.dirname(fileURLToPath(import.meta.url));
BrowserWindow.prototype.focus = function () {};
BrowserWindow.prototype.moveTop = function () {};
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
let bad = 0;
const check = (what: string, ok: boolean, d: unknown = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${what}${d !== '' ? '  -- ' + String(typeof d === 'string' ? d : JSON.stringify(d)).slice(0, 260) : ''}`); if (!ok) bad++; };
const until = async (fn: () => boolean | Promise<boolean>, ms = 6000) => { const end = Date.now() + ms; while (Date.now() < end) { if (await fn()) return true; await wait(60); } return fn(); };
const OUT = (() => { const a = process.argv.at(-1); try { return a && statSync(a).isDirectory() ? a : tmp; } catch { return tmp; } })();

/** A made-up 64 x 64 cover: a warm sunset gradient with a dark sea (nothing real). */
function fakeCover(): string {
  const n = 64, buf = Buffer.alloc(n * n * 4);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const i = (y * n + x) * 4, sea = y > 40;
    const r = sea ? 30 : 255 - y * 2, g = sea ? 40 + (x % 7) : 120 + y, b = sea ? 90 : 80 + y;
    buf[i] = b; buf[i + 1] = g; buf[i + 2] = r; buf[i + 3] = 255;           // BGRA
  }
  return nativeImage.createFromBitmap(buf, { width: n, height: n }).toDataURL();
}

app.whenReady().then(async () => {
  const pages = await servePages(path.join(HERE, '..', '..', 'pages'));
  const prefsFile = path.join(tmp, 'player.json');
  writeFileSync(prefsFile, JSON.stringify({ vis: 'bars', scene: 'campfire', shade: false, x: -6000, y: 200 }));
  const cmds: PlayerCmd[] = [];
  const mp = new MiniPlayer({ origin: pages.origin, preloadPath: path.join(HERE, '..', '..', 'src', 'playerpreload.cjs'), iconPath: path.join(HERE, '..', '..', 'assets', 'aang.ico'), prefsFile, onCmd: (c) => cmds.push(c), clampToScreen: false });
  const host = new FamilyHost({ origin: pages.origin });
  mp.family = host;
  const w = mp.open();
  const js = (s: string) => w.webContents.executeJavaScript(s, true);
  check('page loads and draws', await until(async () => (await js(`window.__ready ? window.__ready.then(() => !!document.querySelector('.full .time')) : false`).catch(() => false)) === true, 12000));
  await wait(300);
  const prefs = (w.webContents as any).getLastWebPreferences?.() ?? {};
  check('safe settings (sandbox, isolation, no node)', prefs.sandbox === true && prefs.contextIsolation === true && prefs.nodeIntegration === false, prefs);
  check('solid, never see-through; never takes the keyboard; not on top until pinned', w.getBackgroundColor().toUpperCase() === '#2C1C10' && !w.isFocusable() && !w.isAlwaysOnTop(), [w.getBackgroundColor(), w.isFocusable(), w.isAlwaysOnTop()]);
  check('the page cannot reach the machine', await js(`typeof require === 'undefined' && typeof process === 'undefined' && typeof window.player === 'object' && typeof window.aang === 'undefined'`) === true);
  check('a member of the window family', host.members().includes('player'), host.members());
  check('full size: 424 x 208', w.getContentSize()[0] === 424 && w.getContentSize()[1] === FULL_H, w.getContentSize());

  // 1. A song: title, artist, album, the cover, the time moving on its own.
  const t0 = Date.now();
  mp.media({ t: 'media.now', v: 1, app: 'spotify', spotify: true, title: 'Maria También', artist: 'Khruangbin', album: 'Con Todo El Mundo', status: 'playing', position: 101.2, duration: 241, at: t0, canSeek: true, volume: 0.7, thumb: fakeCover() });
  await wait(700);
  const a = await js(`({ time: document.querySelector('.full .time').textContent, scroll: document.querySelector('.full .scroll').textContent, sub: document.querySelector('.full .sub').textContent,
    len: [...document.querySelectorAll('.full .tm')].map((e) => e.textContent), lab: document.querySelector('.full .lab').textContent, mark: getComputedStyle(document.querySelector('.full canvas.at')).display,
    cover: (() => { const c = document.querySelector('.pic .cov'); const d = c.getContext('2d').getImageData(34, 10, 1, 1).data; return [d[0], d[1], d[2], d[3]]; })(),
    corner: document.querySelector('.pic .cov').getContext('2d').getImageData(0, 0, 1, 1).data[3], playHeld: document.querySelector('[title="Play / pause"]').classList.contains('held') })`);
  check('song, artist, album and times', /MARIA TAMBIÉN\s+·\s+KHRUANGBIN/.test(a.scroll) && a.sub === 'Con Todo El Mundo' && a.len[1] === '4:01' && /^1:4\d$/.test(a.time), a);
  check('Spotify named with its mark', a.lab.startsWith('SPOTIFY') && a.mark !== 'none', a);
  check('the cover is drawn, its corners cut round', a.cover[3] === 255 && a.cover[0] > 150 && a.corner === 0, a);
  check('the play key sits down while playing', a.playHeld === true);
  const tA = await js(`document.querySelector('.full .time').textContent`);
  await wait(1300);
  const tB = await js(`document.querySelector('.full .time').textContent`);
  check('the time moves between updates', tA !== tB, { tA, tB });
  const scrollX = async () => js(`getComputedStyle(document.querySelector('.full .scroll')).transform`);
  const s1 = await scrollX(); await wait(900); const s2 = await scrollX();
  check('the long title scrolls (whole pixels)', s1 !== s2 && /matrix\(1, 0, 0, 1, -\d+, 0\)/.test(String(s2)), { s1, s2 });
  const pic = async (name: string) => { await wait(150); const img = await w.webContents.capturePage(); const f = path.join(OUT, name); writeFileSync(f, img.toPNG()); console.log('PICTURE ' + f + ' ' + JSON.stringify(img.getSize())); };
  await pic('player-full.png');

  // 2. The keys: a press in the page becomes a checked media.cmd, nothing else.
  const press = (sel: string) => js(`(() => { const t = document.querySelector(${JSON.stringify(sel)}); const r = t.getBoundingClientRect(); const o = { bubbles: true, button: 0, pointerId: 3, clientX: r.left + 5, clientY: r.top + 5, screenX: 100, screenY: 100 };
    t.dispatchEvent(new PointerEvent('pointerdown', o)); const down = t.classList.contains('down'); t.dispatchEvent(new PointerEvent('pointerup', o)); t.dispatchEvent(new MouseEvent('click', o)); return down; })()`);
  check('a key sinks while pressed', await press('[title="Previous"]') === true);
  await press('[title="Play / pause"]'); await press('[title="Next"]');
  await wait(150);
  check('prev, toggle, next went out as media.cmd', JSON.stringify(cmds) === JSON.stringify([{ t: 'media.cmd', op: 'prev' }, { t: 'media.cmd', op: 'toggle' }, { t: 'media.cmd', op: 'next' }]), cmds);
  // the seek: grab the bar at 3/4 and let go
  await js(`(() => { const g = document.querySelector('.full .grab[title^="Grab and drag"]'); const r = g.getBoundingClientRect(); const o = { bubbles: true, button: 0, pointerId: 4, clientX: r.left + 8 + (r.width - 16) * 0.75, clientY: r.top + 6 };
    g.setPointerCapture = () => {}; g.hasPointerCapture = () => true; g.dispatchEvent(new PointerEvent('pointerdown', o)); g.dispatchEvent(new PointerEvent('pointerup', o)); return 1; })()`);
  await wait(150);
  const sk = cmds.at(-1) as { op: string; position?: number };
  check('the seek bead sends a seek to where he let go', sk?.op === 'seek' && Math.abs((sk.position ?? 0) - 180.75) < 0.5, sk);
  check('and the time shows it at once', /^3:0\d$/.test(await js(`document.querySelector('.full .time').textContent`)));

  // 3. VIS: BARS -> SCENE (the scene cross-fades into the picture spot) -> click the picture -> OFF -> BARS
  const vis = () => js(`({ lab: document.querySelector('.key.vis .up .klab').textContent, scene: document.querySelector('.pic').classList.contains('scene'), op: getComputedStyle(document.querySelector('.pic .scn')).opacity,
    pager: !document.querySelector('.pager').hidden, on: document.querySelector('.pager i.on')?.title, picTitle: document.querySelector('.pic').title, cursor: getComputedStyle(document.querySelector('.key.vis')).cursor })`);
  const v0 = await vis();
  check('VIS key reads BARS, pointer on hover', v0.lab === 'BARS' && !v0.scene && !v0.pager && v0.cursor === 'pointer', v0);
  await press('.key.vis');
  await wait(500);
  const v1 = await vis();
  check('SCENE: the scene cross-fades into the picture, four dots say which', v1.lab === 'SCENE' && v1.scene && Number(v1.op) > 0.95 && v1.pager && v1.on === 'Campfire in Waymark’s forest', v1);
  const fr = async () => js(`(() => { const c = document.querySelector('.pic .scn'); return Array.from(c.getContext('2d').getImageData(0, 0, 34, 34).data).join(','); })()`);
  const fA = await fr(); await wait(350); const fB = await fr();
  check('the scene moves (10 fps)', fA !== fB);
  await pic('player-scene.png');
  await js(`document.querySelector('.pic').click(); 1`);
  await wait(200);
  const v2 = await vis();
  check('a click on the picture: the next scene (the skater)', v2.on === 'Skating the boulevard' && /Skating/.test(v2.picTitle), v2);
  check('it remembers the mode and scene', (() => { try { const p = JSON.parse(readFileSync(prefsFile, 'utf8')); return p.vis === 'scene' && p.scene === 'skate'; } catch { return false; } })(), readFileSync(prefsFile, 'utf8'));
  // the skater at 4x, so his outfit and the rim on his legs can be looked at
  await js(`(() => { const s = document.querySelector('.pic .scn'); const big = document.createElement('canvas'); big.id = 'big'; big.width = 34; big.height = 34; big.style.cssText = 'position:fixed;left:0;top:0;width:136px;height:136px;z-index:99;image-rendering:pixelated';
    big.getContext('2d').drawImage(s, 0, 0); document.body.append(big); return 1; })()`);
  await wait(100);
  { const img = (await w.webContents.capturePage({ x: 0, y: 0, width: 136, height: 136 })); const f = path.join(OUT, 'player-skater.png'); writeFileSync(f, img.toPNG()); console.log('PICTURE ' + f); }
  await js(`document.getElementById('big').remove(); 1`);
  await press('.key.vis'); await wait(450);
  const v3 = await vis();
  check('OFF: the cover is back, no dots', v3.lab === 'OFF' && !v3.scene && Number(v3.op) < 0.05 && !v3.pager, v3);
  await press('.key.vis'); await wait(100);
  check('and round again to BARS', (await vis()).lab === 'BARS');

  // 4. Shade: a double-click folds it on the spring, and back.
  const heights: number[] = [];
  await js(`document.querySelector('.full .lcd').dispatchEvent(new MouseEvent('dblclick', { bubbles: true })); 1`);
  const s0 = Date.now();
  while (Date.now() - s0 < 900) { heights.push(w.getContentSize()[1]!); await wait(30); }
  check('folds to the shade strip (52 px), stepping through the heights', w.getContentSize()[1] === SHADE_H && heights.some((h) => h > SHADE_H + 20 && h < FULL_H - 20), heights.slice(0, 12));
  check('the shade layout shows', await js(`!document.querySelector('.shade').hidden && document.querySelector('.full').hidden && /MARIA/.test(document.querySelector('.shade .scroll').textContent)`) === true);
  await pic('player-shade.png');
  await js(`document.querySelector('.shade .lcd').dispatchEvent(new MouseEvent('dblclick', { bubbles: true })); 1`);
  await until(() => w.getContentSize()[1] === FULL_H && !mp.folding, 2000);
  check('and back to full', w.getContentSize()[1] === FULL_H && await js(`!document.querySelector('.full').hidden`) === true);

  // 5. Hidden: the clock stops (nothing ticks while he cannot see it).
  w.hide(); await wait(200);
  check('hidden: it leaves the family and stops', !host.joined('player'));
  mp.close();
  check('closed', !mp.window);
  console.log(bad ? `${bad} FAILED` : 'ALL PASS');
  host.dispose();
  app.exit(bad ? 1 : 0);
});
