// Probe (2026-10-21): open the cockpit the way a click on Aang with a line showing does (docked), then close it the
// way a click outside does (cockpit:close, then onUndock), and report what is left on screen. Seen on his desktop: an
// empty wood frame stayed.
import { app, BrowserWindow } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { servePages } from '../../src/pageserver.ts';
process.on('uncaughtException', (e) => { console.log('HARNESS ERROR ' + String((e as Error)?.stack ?? e)); app.exit(2); });
process.on('unhandledRejection', (e) => { console.log('HARNESS REJECTION ' + String((e as Error)?.stack ?? e)); app.exit(2); });
setTimeout(() => { console.log('HARNESS TIMEOUT'); app.exit(3); }, 60_000).unref();
app.on('window-all-closed', () => {});
const HERE = path.dirname(fileURLToPath(import.meta.url));
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
app.whenReady().then(async () => {
  const pages = await servePages(path.join(HERE, '..', '..', 'pages'));
  const w = new BrowserWindow({ width: 700, height: 900, show: false, frame: false, webPreferences: { preload: path.join(HERE, 'cockpit-stub.cjs'), contextIsolation: false, sandbox: false, offscreen: true } });
  w.setPosition(-6000, 100); w.showInactive();
  await w.loadURL(`${pages.origin}/bubble.html`); await wait(800);
  const js = (s: string) => w.webContents.executeJavaScript(s, true);
  const state = () => js(`(() => { const b = document.getElementById('bubble'); const vis = [...b.children].filter(c => !c.hidden && getComputedStyle(c).display !== 'none').map(c => c.id || c.className); return { hidden: b.hidden, cls: b.className, vis, workingHidden: document.getElementById('working').hidden, sent: window.__sent.slice(-6).map(s => s[0]) }; })()`);
  for (const variant of ['docked', 'plain']) {
    await js(`window.__deliver({ t: 'bubble', text: 'Hi! Need a hand?', stream: false, turn: 7 })`); await wait(1500);
    await js(`window.__fire('onCockpit', { open: true, state: { maxH: 600, docked: ${variant === 'docked'} } }); window.__fire('onInputState', { opened: true, mode: 'auto' })`);
    await js(`window.__deliver({ t: 'history.reply', items: [{ id: 6, ts: '2026-10-20 15:00:00', who: 'you', text: 'where is his cabin' }, { id: 7, ts: '2026-10-20 15:01:00', who: 'Aang', text: 'Claude Code finished.' }] })`);
    await wait(1200);
    // The mouse was on the bubble when he clicked it open (his desktop: "pointer over" and never "off").
    await js(`window.dispatchEvent(new MouseEvent('mousemove', { clientX: document.getElementById('bubble').getBoundingClientRect().left + 30, clientY: document.getElementById('bubble').getBoundingClientRect().top + 30 }))`);
    await wait(200);
    await js(`window.__fire('onCockpit', { open: false })`);
    if (variant === 'docked') await js(`window.__fire('onUndock', 'click')`);
    await wait(1500);
    console.log(variant + ': ' + JSON.stringify(await state()));
  }
  pages.close(); setTimeout(() => app.exit(0), 200);
});
