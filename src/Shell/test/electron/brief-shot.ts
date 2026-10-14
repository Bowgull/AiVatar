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
  const w = new BrowserWindow({ width: 760, height: 820, show: false, frame: false, webPreferences: { preload: path.join(HERE, 'bubble-stub.cjs'), contextIsolation: false, sandbox: false, offscreen: true } });
  w.setPosition(-6000, 100);
  w.showInactive();
  await w.loadURL(`${pages.origin}/bubble.html`);
  await wait(800);
  const day = new Date();
  const at = (h: number, m = 0) => { const d = new Date(day); d.setHours(h, m, 0, 0); return d.toISOString(); };
  const brief = {
    day: day.toLocaleDateString('en-CA', { weekday: 'long', month: 'long', day: 'numeric' }),
    events: [{ title: 'Interview, Northwind', start: at(14), end: at(15), allDay: false, where: '' }, { title: 'Dentist', start: at(10, 30), end: at(11, 30), allDay: false, where: 'Queen St W' }],
    unread: [
      { from: 'Rhea Patel', subject: 'Next steps and the demo', at: Date.now() - 3 * 3600_000, job: true, id: '18f2a9c0d1e2', why: 'Asks if Thursday works for the demo' },
      { from: 'Sam', subject: 'Saturday?', at: Date.now() - 5 * 3600_000, id: '18f2a9c0d1e3', why: 'Asks if you are free Saturday' },
    ],
    jobsNew: 3, weather: { now: 9, high: 14, low: 8, words: 'cloudy', rain: 60 }, week: 0.4, weekResetsAt: Math.floor(Date.now() / 1000) + 3 * 86400,
    parts: [{ part: 'morn', temp: 8, sky: 'partly' }, { part: 'aftn', temp: 14, sky: 'cloud' }, { part: 'eve', temp: 11, sky: 'rain' }], rainFrom: '4 pm', rainIsSnow: false,
    waiting: ['Portfolio update: Claude wants your OK to publish'],
  };
  await w.webContents.executeJavaScript(`window.__deliver(${JSON.stringify({ t: 'bubble', text: 'Morning brief', stream: false, proactive: true, brief })})`, true);
  await wait(3000);
  if (process.env.SHOT) writeFileSync(process.env.SHOT, (await w.webContents.capturePage()).toPNG());
  // A click on Rhea's row opens it; its first button asks the brain to go through that email (row 0).
  const js = (x: string) => w.webContents.executeJavaScript(x, true);
  const lantern = await js(`document.getElementById('bubble').classList.contains('lantern')`);
  console.log((lantern ? 'PASS' : 'FAIL') + '  the brief is drawn on the dark wood');
  await js(`[...document.querySelectorAll('.lt-item.can')].find(r => r.textContent.includes('Rhea')).querySelector('.lt-head').click()`);
  await wait(400);
  const opened = await js(`![...document.querySelectorAll('.lt-item.can')].find(r => r.textContent.includes('Rhea')).querySelector('.lt-open').hidden`);
  console.log((opened ? 'PASS' : 'FAIL') + '  a click opens the row');
  if (process.env.SHOT) writeFileSync(process.env.SHOT.replace(/\.png$/, '-open.png'), (await w.webContents.capturePage()).toPNG());
  await js(`[...document.querySelectorAll('.lt-item.can')].find(r => r.textContent.includes('Rhea')).querySelector('.lt-open button').click()`);
  const sent = await js(`JSON.stringify(window.__sent.filter(s => s[0] === 'briefAct').map(s => s[1][0]))`);
  console.log((sent === '[{"item":0,"act":"through"}]' ? 'PASS' : 'FAIL') + '  its button sends only the row and the button  -- ' + sent);
  pages.close();
  console.log('shot');
  setTimeout(() => app.exit(0), 300);
});
