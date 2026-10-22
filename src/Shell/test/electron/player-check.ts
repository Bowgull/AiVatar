// Sheet 59, the Spotify mini player (2026-10-22): a MiniPlayer off screen, never focused, no real mouse or keys (every
// press is an event made inside the page). Checks: safe and SOLID (never see-through), never takes the keyboard, a family
// member; the song, the cover and a time that moves on its own between updates; the keys go out as checked media.cmd only;
// the ··· key opens the player's own menu (his named pictures with moving thumbnails and a tick, "Bars on the screen"):
// a scene cross-fades into the picture spot, Album cover fades back, the bars go off and on, Esc and ··· close it, and
// nothing of the old VIS key, click-the-picture or the dots is left; the seek bead sends a seek; a double-click folds it
// to the shade strip on the spring and back; it remembers the picture and the bars. Family shapes (part 2): as a wide strip the player stretches to its neighbour's width; as a column the picture sits on top,
// then the screen, then the keys. Pictures (two): the menu, and the player showing a scene.
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
  writeFileSync(prefsFile, JSON.stringify({ picture: 'cover', bars: true, shade: false, x: -6000, y: 200 }));
  const cmds: PlayerCmd[] = [];
  const mp = new MiniPlayer({ origin: pages.origin, preloadPath: path.join(HERE, '..', '..', 'src', 'playerpreload.cjs'), iconPath: path.join(HERE, '..', '..', 'assets', 'aang.ico'), prefsFile, onCmd: (c) => cmds.push(c), clampToScreen: false });
  const host = new FamilyHost({ origin: pages.origin });
  mp.family = host;
  const w = mp.open();
  const js = (s: string) => w.webContents.executeJavaScript(s, true);
  const pageErrors: string[] = [];
  w.webContents.on('console-message', (e: any) => { const m = String(e.message ?? ''); if (/Uncaught|Error/.test(m)) pageErrors.push(m); });
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

  // 3. The ··· menu: the picture and the bars, nothing else on the face.
  const MORE = '.full [title="Picture and bars"]';
  const face = () => js(`({ scene: document.querySelector('.pic').classList.contains('scene'), op: Number(getComputedStyle(document.querySelector('.pic .scn')).opacity), title: document.querySelector('.pic').title,
    bars: getComputedStyle(document.querySelector('.full .lcd canvas')).display, big: document.querySelector('.full .time').classList.contains('big'), moreOn: document.querySelector(${JSON.stringify(MORE)}).classList.contains('on') })`);
  const f0 = await face();
  const plain = await js(`!document.querySelector('.key.vis, .pager, .klab') && !/(^|[^A-Z])(VIS|SCENE|BARS)([^A-Z]|$)/.test(document.querySelector('.full').innerText) && getComputedStyle(document.querySelector('.pic')).cursor !== 'pointer'`);
  check('the face: the album cover, the calm bars, no VIS key, no dots, the picture not a button', !f0.scene && f0.op < 0.05 && f0.bars !== 'none' && plain === true, f0);
  const more = await js(`(() => { const r = document.querySelector(${JSON.stringify(MORE)}).getBoundingClientRect(); return [r.width, r.height]; })()`);
  check('the ··· key is a 28 px plum title key', more[0] === 28 && more[1] === 30, more);
  const mjs = (s2: string) => mp.menu.window!.webContents.executeJavaScript(s2, true);
  const openMenu = async () => { await js(`document.querySelector(${JSON.stringify(MORE)}).click(); 1`); return until(async () => mp.menu.visible && (await mjs(`!!document.querySelector('#pm')`).catch(() => false)) === true, 6000); };
  check('··· opens the menu', await openMenu());
  await wait(250);
  const mw = mp.menu.window!;
  const m0 = await mjs(`(() => { const rows = [...document.querySelectorAll('#pm button')]; const th = (id) => { const c = document.querySelector('canvas.th[data-picture="' + id + '"]'); const d = c.getContext('2d').getImageData(c.width >> 1, c.height >> 1, 1, 1).data; return d[3]; };
    return { head: document.querySelector('#pm .mhead').textContent, rows: rows.map((b) => b.innerText.trim()), ticked: rows.filter((b) => b.querySelector('[data-tick]')).map((b) => b.innerText.trim()),
      font: getComputedStyle(rows[0]).fontSize, h: Math.round(rows[1].getBoundingClientRect().height), thumbs: ['cover', 'campfire', 'skate', 'rain', 'fishing'].map(th) }; })()`);
  check('the menu: PICTURE, his five names, a tick on Album cover and on the bars, 16 px words',
    m0.head === 'PICTURE' && JSON.stringify(m0.rows) === JSON.stringify(['Album cover', 'Algonquin', 'Dem Streez', 'Main Character', 'Pigeon Point', 'Bars on the screen']) && JSON.stringify(m0.ticked) === JSON.stringify(['Album cover', 'Bars on the screen']) && m0.font === '16px' && m0.h >= 44, m0);
  check('every thumbnail is drawn', m0.thumbs.every((x: number) => x === 255), m0.thumbs);
  const thumb = () => mjs(`(() => { const c = document.querySelector('canvas.th[data-picture="campfire"]'); return Array.from(c.getContext('2d').getImageData(0, 0, c.width, c.height).data).join(','); })()`);
  const tA2 = await thumb(); await wait(450); const tB2 = await thumb();
  check('the thumbnails move while it is up', tA2 !== tB2);
  check('the ··· key glows while its menu is up', (await face()).moreOn === true);
  const mb = mw.getBounds(), pb = w.getBounds();
  check('the menu sits under the player, its right edge by the ··· key', mb.y >= pb.y + pb.height && mb.x + mb.width <= pb.x + pb.width + 20, { mb, pb });
  { const img = await mw.webContents.capturePage(); const f = path.join(OUT, 'playermenu-menu.png'); writeFileSync(f, img.toPNG()); console.log('PICTURE ' + f + ' ' + JSON.stringify(img.getSize())); }
  // pick a scene: the menu goes, the scene cross-fades in
  await mjs(`document.querySelector('#pm button[data-picture="fishing"]').click(); 1`);
  await until(() => !mp.menu.visible, 2000); await wait(550);
  const f1 = await face();
  check('Pigeon Point: the menu closes, the scene cross-fades into the picture spot', !mp.menu.visible && f1.scene && f1.op > 0.95 && f1.title === 'Pigeon Point' && !f1.moreOn, f1);
  const fr = async () => js(`(() => { const c = document.querySelector('.pic .scn'); return Array.from(c.getContext('2d').getImageData(0, 0, 34, 34).data).join(','); })()`);
  const fA = await fr(); await wait(350); const fB = await fr();
  check('the scene moves (10 fps)', fA !== fB);
  await pic('playermenu-scene.png');
  check('it remembers the picture', JSON.parse(readFileSync(prefsFile, 'utf8')).picture === 'fishing', readFileSync(prefsFile, 'utf8'));
  // the tick follows; another scene; back to the cover
  await wait(350); await openMenu(); await wait(150);
  check('the tick is on Pigeon Point now', await mjs(`[...document.querySelectorAll('#pm button')].filter((b) => b.querySelector('[data-tick]')).map((b) => b.innerText.trim()).join('|')`) === 'Pigeon Point|Bars on the screen');
  await mjs(`document.querySelector('#pm button[data-picture="skate"]').click(); 1`);
  await until(() => !mp.menu.visible, 2000); await wait(200);
  check('Dem Streez', (await face()).title === 'Dem Streez');
  await wait(350); await openMenu(); await wait(100);
  await mjs(`document.querySelector('#pm button[data-picture="cover"]').click(); 1`);
  await until(() => !mp.menu.visible, 2000); await wait(550);
  const f2 = await face();
  check('Album cover: the scene fades back out to the cover', !f2.scene && f2.op < 0.05, f2);
  // the bars off, then on
  await openMenu(); await wait(100);
  await mjs(`document.querySelector('#pm button[data-bars]').click(); 1`);
  await until(() => !mp.menu.visible, 2000); await wait(150);
  const f3 = await face();
  check('bars off: gone from the screen, the time big; remembered', f3.bars === 'none' && f3.big && JSON.parse(readFileSync(prefsFile, 'utf8')).bars === false, f3);
  await wait(350); await openMenu(); await wait(100);
  check('bars unticked in the menu', await mjs(`document.querySelector('#pm button[data-bars]').dataset.bars`) === 'off');
  await mjs(`document.querySelector('#pm button[data-bars]').click(); 1`);
  await until(() => !mp.menu.visible, 2000); await wait(150);
  const f4 = await face();
  check('bars on again', f4.bars !== 'none' && !f4.big && JSON.parse(readFileSync(prefsFile, 'utf8')).bars === true, f4);
  // Esc closes; ··· again closes
  await wait(350); await openMenu(); await wait(100);
  await mjs(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); 1`);
  check('Esc closes it, nothing changed', await until(() => !mp.menu.visible, 2000) && mp.state.picture === 'cover' && mp.state.bars === true);
  await wait(350); await openMenu(); await wait(100);
  await js(`document.querySelector(${JSON.stringify(MORE)}).click(); 1`);
  check('··· again closes it', await until(() => !mp.menu.visible, 2000));
  await wait(350);

  // 4. Shade: a double-click folds it on the spring, and back.
  const heights: number[] = [];
  await js(`document.querySelector('.full .lcd').dispatchEvent(new MouseEvent('dblclick', { bubbles: true })); 1`);
  const s0 = Date.now();
  while (Date.now() - s0 < 900) { heights.push(w.getContentSize()[1]!); await wait(30); }
  check('folds to the shade strip (52 px), stepping through the heights', w.getContentSize()[1] === SHADE_H && heights.some((h) => h > SHADE_H + 20 && h < FULL_H - 20), heights.slice(0, 12));
  check('the shade layout shows: no picture, the title and time', await js(`!document.querySelector('.shade').hidden && document.querySelector('.full').hidden && /MARIA/.test(document.querySelector('.shade .scroll').textContent) && !document.querySelector('.shade .pic')`) === true);
  await js(`document.querySelector('.shade .lcd').dispatchEvent(new MouseEvent('dblclick', { bubbles: true })); 1`);
  await until(() => w.getContentSize()[1] === FULL_H && !mp.folding, 2000);
  check('and back to full', w.getContentSize()[1] === FULL_H && await js(`!document.querySelector('.full').hidden`) === true);

  // 5. The family's shapes (familywin.ts SHAPE API), as the family sets them on the page: wide, then tall, then free.
  check('it registers its wide and tall layouts', JSON.stringify(host.layoutsOf('player')) === JSON.stringify({ tall: { width: 200, minHeight: 300 }, wide: { height: 'auto' } }), host.layoutsOf('player'));
  const shapeTo = async (shape: string | null, wpx: number, hpx: number | null) => {
    const b = w.getBounds(); w.setBounds({ x: b.x, y: b.y, width: wpx, height: hpx ?? b.height });
    await js(`(() => { const h = document.documentElement; if (${JSON.stringify(shape)}) { h.dataset.famShape = ${JSON.stringify(shape)}; h.dataset.famSized = ''; h.style.setProperty('--fam-w', '${wpx}px'); ${hpx ? `h.style.setProperty('--fam-h', '${hpx}px');` : `h.style.removeProperty('--fam-h');`} }
      else { delete h.dataset.famShape; delete h.dataset.famSized; h.style.removeProperty('--fam-w'); h.style.removeProperty('--fam-h'); } dispatchEvent(new Event('famshape')); return 1; })()`);
    await wait(250);
  };
  await shapeTo('wide', 640, null);
  const wide = await js(`(() => { const r = (s) => document.querySelector(s).getBoundingClientRect(); return { mp: [r('.mp').width, r('.mp').height], close: r('.full [title=Close]').right, more: r('.full [title="Picture and bars"]').right, lcd: r('.full .lcd').right }; })()`);
  check('wide: a strip as wide as its neighbour, its own height, the right side follows', wide.mp[0] === 640 && wide.mp[1] === FULL_H && wide.close > 600 && wide.more === wide.close - 96 && wide.lcd > 600, wide);
  await shapeTo('tall', 200, 400);
  const tall = await js(`(() => { const r = (s) => document.querySelector(s).getBoundingClientRect(); const q = (s) => { const b = r(s); return [Math.round(b.left), Math.round(b.top), Math.round(b.right), Math.round(b.bottom)]; };
    return { mp: [r('.mp').width, r('.mp').height], pic: q('.pic'), lcd: q('.full .lcd'), play: q('[title="Play / pause"]'), more: q('.full [title="Picture and bars"]'), vol: q('.full .grab[title^="Spotify"]'), fold: !!document.querySelector('.full [title^="Fold"]'), time: document.querySelector('.full .time').textContent }; })()`);
  const inside = (b: number[]) => b[0]! >= 0 && b[2]! <= 200 && b[3]! <= 400;
  check('tall: a column, the picture on top, then the screen, then the keys, all inside', tall.mp[0] === 200 && tall.mp[1] === 400 && tall.pic[3] <= tall.lcd[1] && tall.lcd[3] <= tall.play[1] && [tall.pic, tall.lcd, tall.play, tall.more].every(inside) && tall.vol[2] <= 216 && !tall.fold && /^\d+:\d\d$/.test(tall.time), tall);
  await shapeTo(null, 424, FULL_H);
  check('free again: its own size and layout', await js(`document.querySelector('.mp').getBoundingClientRect().width === 424 && !!document.querySelector('.full [title^="Fold"]')`) === true);

  // 6. Hidden: the clock stops (nothing ticks while he cannot see it).
  w.hide(); await wait(200);
  check('hidden: it leaves the family and stops', !host.joined('player'));
  mp.close();
  check('closed', !mp.window);
  mp.dispose();
  check('its menu window is gone too', !mp.menu.window);
  check('no errors on the page', pageErrors.length === 0, pageErrors);
  console.log(bad ? `${bad} FAILED` : 'ALL PASS');
  host.dispose();
  app.exit(bad ? 1 : 0);
});
