// His report (2026-10-13): right-clicking a message in the bubble opened a menu whose rows did nothing; copy never
// copied. The real bubble page, off screen and never focused, driven with REAL mouse events (not .click()), because
// the bug was in the order of real events: the menu closed on mouse-down, before the click could land.
//
// Run: npx electron test/electron/bubble-menu-check.ts
import { app, BrowserWindow } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { servePages } from '../../src/pageserver.ts';

process.on('uncaughtException', (e) => { console.log('HARNESS ERROR ' + String((e as Error)?.stack ?? e)); app.exit(2); });
process.on('unhandledRejection', (e) => { console.log('HARNESS REJECTION ' + String((e as Error)?.stack ?? e)); app.exit(2); });
setTimeout(() => { console.log('HARNESS TIMEOUT'); app.exit(3); }, 60_000).unref();
app.on('window-all-closed', () => { /* the test decides */ });
const HERE = path.dirname(fileURLToPath(import.meta.url));
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
let bad = 0;
const check = (what: string, ok: boolean, d = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${what}${d ? '  -- ' + d : ''}`); if (!ok) bad++; };

app.whenReady().then(async () => {
  const pages = await servePages(path.join(HERE, '..', '..', 'pages'));
  const w = new BrowserWindow({ width: 520, height: 700, show: false, frame: false, webPreferences: { preload: path.join(HERE, 'bubble-stub.cjs'), contextIsolation: false, sandbox: false, offscreen: true } });
  w.setPosition(-6000, 100);
  w.showInactive();
  await w.loadURL(`${pages.origin}/bubble.html`);
  await wait(800);
  const js = (s: string) => w.webContents.executeJavaScript(s, true);
  const mouse = async (x: number, y: number, button: 'left' | 'right') => {
    w.webContents.sendInputEvent({ type: 'mouseMove', x, y });
    await wait(60);
    w.webContents.sendInputEvent({ type: 'mouseDown', x, y, button, clickCount: 1 });
    await wait(40);
    w.webContents.sendInputEvent({ type: 'mouseUp', x, y, button, clickCount: 1 });
    if (button === 'right') w.webContents.sendInputEvent({ type: 'contextMenu', x, y, button: 'right', clickCount: 1 } as never);
    await wait(200);
  };
  const center = async (sel: string) => js(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e) return null; const r = e.getBoundingClientRect(); return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + Math.min(r.height / 2, 10)) }; })()`) as Promise<{ x: number; y: number } | null>;

  // A reply, fully shown.
  await js(`window.__deliver({ t: 'bubble', id: 'r1', text: 'Your demo is Friday at 2 pm.', stream: false, turn: 41 })`);
  await wait(3500);
  const said = await center('#said');
  check('a reply is showing', Boolean(said));
  await mouse(said!.x, said!.y, 'right');
  const rows = await js(`[...document.querySelectorAll('#turnmenu .mrow')].map(b => b.textContent)`) as string[];
  check('right-click on the reply opens the menu', rows.includes('Copy text'), rows.join(', '));
  const copy = await center('#turnmenu .mrow:nth-of-type(1)');
  await mouse(copy!.x, copy!.y, 'left');
  const copied = await js('window.__copied') as string[];
  check('Copy text copies the reply (real mouse clicks)', copied.at(-1) === 'Your demo is Friday at 2 pm.', JSON.stringify(copied));
  check('the menu closes after the pick', (await js(`!document.getElementById('turnmenu')`)) === true);

  // His history (the scroll-back): an old message, right-clicked, copied, replied to.
  // Sheet 41: the scroll-back opens on a wheel up over the bubble, then its rows arrive.
  await js(`document.getElementById('bubble').dispatchEvent(new WheelEvent('wheel', { deltaY: -120, bubbles: true }))`);
  await wait(300);
  await js(`window.__deliver({ t: 'history.reply', items: [] })`);
  await wait(200);
  await js(`window.__deliver({ t: 'history.reply', items: [{ id: 7, ts: '2026-10-12T10:00:00Z', who: 'Aang', text: 'Your dentist moved to Thursday.' }, { id: 6, ts: '2026-10-12T09:59:00Z', who: 'you', text: 'when is my dentist' }] })`);
  await wait(400);
  const old = await center('#back [data-id="7"]');
  check('an old message is in the scroll-back, knowing its id', Boolean(old));
  if (old) {
    await mouse(old.x, old.y, 'right');
    const rows2 = await js(`[...document.querySelectorAll('#turnmenu .mrow')].map(b => b.textContent)`) as string[];
    check('right-click on an old message opens its menu', rows2.includes('Copy text') && rows2.includes('Reply to this'), rows2.join(', '));
    const c2 = await js(`(() => { const b = [...document.querySelectorAll('#turnmenu .mrow')].find(x => x.textContent === 'Copy text'); const r = b.getBoundingClientRect(); return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) }; })()`) as { x: number; y: number };
    await mouse(c2.x, c2.y, 'left');
    check('Copy text copies THAT old message', (await js('window.__copied') as string[]).at(-1) === 'Your dentist moved to Thursday.');
    await mouse(old.x, old.y, 'right');
    const r3 = await js(`(() => { const b = [...document.querySelectorAll('#turnmenu .mrow')].find(x => x.textContent === 'Reply to this'); const r = b.getBoundingClientRect(); return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) }; })()`) as { x: number; y: number };
    await mouse(r3.x, r3.y, 'left');
    const sent = await js(`window.__sent.filter(s => s[0] === 'replyToTurn')`) as [string, unknown[]][];
    check('Reply to this binds to that old message', JSON.stringify(sent.at(-1)?.[1]) === JSON.stringify([7, 'Your dentist moved to Thursday.']), JSON.stringify(sent));
  }

  pages.close();
  console.log(bad ? `${bad} failed` : 'all passed');
  setTimeout(() => app.exit(bad ? 1 : 0), 300);
});
