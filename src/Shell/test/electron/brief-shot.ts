// A picture of the morning brief as the real bubble draws it, with a realistic morning (made-up names).
// Run: SHOT=<png> npx electron test/electron/brief-shot.ts
import { app, BrowserWindow } from 'electron';
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { servePages } from '../../src/pageserver.ts';

process.on('uncaughtException', (e) => { console.log('HARNESS ERROR ' + String((e as Error)?.stack ?? e)); app.exit(2); });
process.on('unhandledRejection', (e) => { console.log('HARNESS REJECTION ' + String((e as Error)?.stack ?? e)); app.exit(2); });
setTimeout(() => { console.log('HARNESS TIMEOUT'); app.exit(3); }, 60_000).unref();
app.on('window-all-closed', () => { /* the test decides */ });
const HERE = path.dirname(fileURLToPath(import.meta.url));
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

app.whenReady().then(async () => {
  const pages = await servePages(path.join(HERE, '..', '..', 'pages'));
  const w = new BrowserWindow({ width: 760, height: 620, show: false, frame: false, webPreferences: { preload: path.join(HERE, 'bubble-stub.cjs'), contextIsolation: false, sandbox: false, offscreen: true } });
  w.setPosition(-6000, 100);
  w.showInactive();
  await w.loadURL(`${pages.origin}/bubble.html`);
  await wait(800);
  const day = new Date();
  const at = (h: number, m = 0) => { const d = new Date(day); d.setHours(h, m, 0, 0); return d.toISOString(); };
  const brief = {
    day: day.toLocaleDateString('en-CA', { weekday: 'long', month: 'long', day: 'numeric' }),
    events: [{ title: 'Interview, Northwind', start: at(14), end: at(15), allDay: false, where: '' }],
    unread: [
      { from: "Pop's Cannabis", subject: 'Surprise! A Birthday Gift Inside', at: Date.now() },
      { from: 'Nokia API Hub', subject: 'You have used 85% of your quota', at: Date.now() },
      { from: 'Rhea Patel', subject: 'Next steps and the demo', at: Date.now(), job: true },
      { from: 'Google', subject: 'Security alert', at: Date.now() },
    ],
    jobsNew: 3, weather: { now: 9, high: 14, low: 8, words: 'cloudy, rain after 4', rain: 60 }, week: 0.4, weekResetsAt: Math.floor(Date.now() / 1000) + 3 * 86400,
  };
  await w.webContents.executeJavaScript(`window.__deliver(${JSON.stringify({ t: 'bubble', text: 'Morning brief', stream: false, proactive: true, brief })})`, true);
  await wait(3000);
  if (process.env.SHOT) writeFileSync(process.env.SHOT, (await w.webContents.capturePage()).toPNG());
  pages.close();
  console.log('shot');
  setTimeout(() => app.exit(0), 300);
});
