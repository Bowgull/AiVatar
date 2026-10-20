// Sheet 41 (his picks, 2026-10-20): the scroll-back keeps everything Aang showed him. Drives the real bubble page with a
// stand-in brain: a video message opens into its picture and play key on a click; a link in his words opens in Samara;
// a wheel up opens looking back; every kind of row draws; Undo asks once and then says what happened; Reply and Take it
// back reach the doors. Saves a picture of the scroll-back for a look.
//
// Run: npx electron test/electron/lookback-check.ts [out.png]
import { app, BrowserWindow } from 'electron';
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { servePages } from '../../src/pageserver.ts';

process.on('uncaughtException', (e) => { console.log('HARNESS ERROR ' + String((e as Error)?.stack ?? e)); app.exit(2); });
process.on('unhandledRejection', (e) => { console.log('HARNESS REJECTION ' + String((e as Error)?.stack ?? e)); app.exit(2); });
setTimeout(() => { console.log('HARNESS TIMEOUT'); app.exit(3); }, 90_000).unref();
app.on('window-all-closed', () => { /* the test decides */ });
const HERE = path.dirname(fileURLToPath(import.meta.url));
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
let bad = 0;
const check = (what: string, ok: boolean, d = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${what}${d ? '  -- ' + String(d).slice(0, 200) : ''}`); if (!ok) bad++; };

// A 2x2 picture, so a thumbnail and a face are real data URLs.
const PIC = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFklEQVR42mP8z8DwnwEIGBmgAEYAAF0lAf/0z6rCAAAAAElFTkSuQmCC';
const ts = (h: number, m = 0, daysAgo = 0) => { const d = new Date(); d.setDate(d.getDate() - daysAgo); d.setHours(h, m, 0, 0); return d.toISOString().replace('T', ' ').slice(0, 19); };
const VIDEO = 'https://www.youtube.com/watch?v=abc123';
const ITEMS = [
  { id: 101, ts: ts(21, 40, 1), who: 'Aang', text: 'This week’s research', kind: 'say', extra: { research: { week: 'w', swept: 9, repeats: [], finds: [{ source: 'gh', title: 'Qwen fits your card', url: 'https://github.com/x/y', blurb: '', score: 1 }] } } },
  { id: 102, ts: ts(21, 41, 1), who: 'you', text: 'nice, set it up tomorrow' },
  { id: 103, ts: ts(21, 42, 1), who: 'Aang', text: "Will do. It's on tomorrow's list." },
  { id: 104, ts: ts(7, 30), who: 'Aang', text: 'Your brief', kind: 'say', extra: { brief: { day: 'Tuesday, October 20', events: [{ title: 'Standup', start: '9:00', end: null, allDay: false, where: '' }], unread: [], jobsNew: 4, week: null, weekResetsAt: null } } },
  { id: 105, ts: ts(9, 12), who: 'Aang', text: 'HisWattson just posted: Wattson ranked guide', kind: 'say', extra: { about: { url: VIDEO, title: "HisWattson's new video", thumb: PIC }, face: { img: PIC, name: 'HisWattson' }, away: true } },
  { id: 106, ts: ts(14, 5), who: 'Aang', text: "Claude's plan: WoW talent build", kind: 'plan', extra: { plan: { title: 'WoW talent build', sites: ['wowhead.com'], steps: ['Read the guide', 'Write the build'], done: true }, remembered: true } },
  { id: 107, ts: ts(14, 14), who: 'Aang', text: 'You said yes: moved 3 screenshots', kind: 'yes', extra: { yes: { question: 'move 3 screenshots to Archive', choice: 'once', did: 'moved 3 screenshots to Archive', ok: true, note: '', at: new Date().toISOString(), undo: 7 } } },
  { id: 108, ts: ts(14, 40), who: 'Aang', text: 'You said yes: sent an email', kind: 'yes', extra: { yes: { question: 'send this email', choice: 'once', did: 'sent the reply to Greenhouse', ok: true, note: '', at: new Date().toISOString(), cant: "A sent email can't be taken back." } } },
  { id: 109, ts: ts(15, 2), who: 'Aang', text: 'You said yes: open pages', kind: 'yes', extra: { yes: { question: 'open web pages', choice: 'always', did: 'opened wowhead.com', ok: true, note: '', at: new Date().toISOString(), kindKey: 'open web pages' } } },
  { id: 110, ts: ts(15, 55), who: 'Aang', text: 'Your call "Standup" starts at 4:00. Join: meet.google.com/abc-defg', kind: 'say', extra: { links: [{ label: 'Join call', url: 'https://meet.google.com/abc-defg' }] } },
];

app.whenReady().then(async () => {
  const pages = await servePages(path.join(HERE, '..', '..', 'pages'));
  const w = new BrowserWindow({ width: 760, height: 900, show: false, frame: false, transparent: true, webPreferences: { preload: path.join(HERE, 'bubble-stub.cjs'), contextIsolation: false, sandbox: false, offscreen: true } });
  w.setPosition(-6000, 100); w.showInactive();
  await w.loadURL(`${pages.origin}/bubble.html`); await wait(800);
  const js = (s: string) => w.webContents.executeJavaScript(s, true);
  const sent = async (name: string) => (await js(`JSON.stringify(window.__sent.filter((x) => x[0] === ${JSON.stringify(name)}))`)) as string;

  // 1. the one-line door: a video message, then a click opens the picture and the play key
  await js(`window.__deliver({ t: 'bubble', text: 'HisWattson just posted: Wattson ranked guide', stream: false, proactive: true, about: { url: '${VIDEO}', title: 'new video', thumb: '${PIC}' }, face: { img: '${PIC}', name: 'HisWattson' } })`);
  await wait(2500);
  check('the video message is one line, nothing open yet', (await js(`!document.querySelector('#aboutbox') || document.querySelector('#aboutbox').hidden`)) === true);
  await js(`document.getElementById('said').click(); true`); await wait(300);
  check('a click opens the video: its picture and the big play key', (await js(`!!document.querySelector('#aboutbox:not([hidden]) .vshot .bigplay .face')`)) === true);
  await js(`document.querySelector('#aboutbox .vshot').click(); true`); await wait(100);
  check('the play key opens it in Samara', (await sent('openThing')).includes(VIDEO), await sent('openThing'));

  // 2. a link in his words
  await js(`window.__sent.length = 0; window.__deliver({ t: 'bubble', text: 'Your call starts at 4:00. Join: meet.google.com/abc-defg', stream: false, proactive: true })`);
  await wait(3000);
  const href = await js(`document.querySelector('#said .lnk')?.dataset.url ?? ''`);
  check('a bare meeting address becomes a link', href === 'https://meet.google.com/abc-defg', String(href));
  await js(`document.querySelector('#said .lnk').click(); true`); await wait(100);
  check('clicking it opens it in Samara (not the cockpit)', (await sent('openThing')).includes('meet.google.com') && !(await sent('dockBox')).includes('right'), await sent('openThing'));
  check('no duplicate link chip under it', (await js(`[...document.querySelectorAll('#chips .chip')].length`)) === 0);

  // 3. a wheel up opens looking back, from a short message
  await js(`window.__sent.length = 0; document.getElementById('bubble').dispatchEvent(new WheelEvent('wheel', { deltaY: -120, bubbles: true })); true`);
  await wait(300);
  check('a wheel up on a one-line message opens the scroll-back', (await js(`!document.getElementById('back').hidden && document.getElementById('bubble').classList.contains('lantern')`)) === true);
  check('and asks the brain for the newest page', (await sent('olderTurns')).length > 2, await sent('olderTurns'));
  await js(`window.__deliver({ t: 'history.reply', q: '', before: 0, items: ${JSON.stringify([...ITEMS].reverse())} })`);
  await wait(400);
  const shape = JSON.parse(await js(`JSON.stringify({ rows: document.querySelectorAll('#back .lt-item').length, mine: document.querySelectorAll('#back .lb-mine').length, slips: [...document.querySelectorAll('#back .lt-slip h3')].map((h) => h.textContent), plaques: [...document.querySelectorAll('#back .said-yes')].map((p) => p.textContent), phone: [...document.querySelectorAll('#back .lt-when small')].map((s) => s.textContent) })`) as string);
  check('every row draws (9 of his and Aang’s, 1 of his own)', shape.rows === 9 && shape.mine === 1, JSON.stringify(shape));
  check('one slip per part of a day', shape.slips.includes('YESTERDAY · EVENING') && shape.slips.includes('TODAY · MORNING') && shape.slips.includes('TODAY · AFTERNOON'), shape.slips.join(' | '));
  check('the yes plaques say what each one is', ['YOU SAID YES', 'CAN’T UNDO', 'YOU SAID ALWAYS'].every((p) => shape.plaques.includes(p)), shape.plaques.join(' | '));
  check('what went to his phone says so', shape.phone.includes('TO YOUR PHONE'));
  check('the call link is a link in the history too', (await js(`[...document.querySelectorAll('#back .lnk')].some((a) => a.dataset.url === 'https://meet.google.com/abc-defg')`)) === true);

  // a picture, for a look
  const out = process.argv.find((a) => a.endsWith('.png'));
  if (out) { const img = await w.webContents.capturePage(); writeFileSync(out, img.toPNG()); console.log('picture: ' + out); }

  // 4. a video row opens as it first looked
  await js(`document.querySelector('#back .lt-item[data-id="105"] .lt-head').click(); true`); await wait(200);
  check('the video row opens: picture and play key', (await js(`!!document.querySelector('#back .lt-item[data-id="105"] .lt-open:not([hidden]) .vshot .bigplay')`)) === true);

  // 5. Undo asks once, then the brain's answer lands on the row
  await js(`document.querySelector('#back .lt-item[data-id="107"] .lt-head').click(); true`); await wait(200);
  await js(`[...document.querySelectorAll('#back .lt-item[data-id="107"] .lt-open .key')].find((k) => k.textContent === 'Undo').click(); true`); await wait(100);
  check('Undo asks first', (await js(`document.querySelector('#back .lt-item[data-id="107"] .lb-ask')?.textContent ?? ''`)).startsWith('Undo this'));
  check('and nothing is undone until he means it', (await sent('undoTurn')) === '[]');
  await js(`[...document.querySelectorAll('#back .lt-item[data-id="107"] .lt-open .key')].find((k) => k.textContent === 'Undo').click(); true`); await wait(100);
  check('meaning it sends the row to the brain', (await sent('undoTurn')).includes('107'), await sent('undoTurn'));
  await js(`window.__deliver({ t: 'turn.updated', id: 107, kind: 'yes', said: 'Put the 3 screenshots back.', extra: { yes: { question: 'q', choice: 'once', did: 'moved 3 screenshots to Archive', ok: true, note: '', at: '', undo: 7, undone: { at: new Date().toISOString(), said: 'Put the 3 screenshots back.' } } } })`); await wait(200);
  check('the row now says UNDONE and stays in the history', (await js(`document.querySelector('#back .lt-item[data-id="107"]').classList.contains('undone') && document.querySelector('#back .lt-item[data-id="107"] .said-yes').textContent.startsWith('UNDONE')`)) === true);
  check('a row that cannot be undone has no Undo key', (await js(`(() => { document.querySelector('#back .lt-item[data-id="108"] .lt-head').click(); return ![...document.querySelectorAll('#back .lt-item[data-id="108"] .key')].some((k) => k.textContent === 'Undo'); })()`)) === true);

  // 6. Reply on any row
  await js(`document.querySelector('#back .lt-item[data-id="103"] .lb-rep').click(); true`); await wait(100);
  check('Reply hands the row to the typing box', (await sent('replyToTurn')).includes('103'), await sent('replyToTurn'));
  check('and the row lights up', (await js(`document.querySelector('#back .lt-item[data-id="103"]').classList.contains('replying')`)) === true);

  // 7. Take it back on a remembered Claude plan
  await js(`document.querySelector('#back .lt-item[data-id="106"] .lt-head').click(); true`); await wait(100);
  await js(`[...document.querySelectorAll('#back .lt-item[data-id="106"] .key')].find((k) => k.textContent === 'Take it back').click(); true`); await wait(50);
  await js(`[...document.querySelectorAll('#back .lt-item[data-id="106"] .key')].find((k) => k.textContent === 'Take it back').click(); true`); await wait(50);
  check('Take it back on a plan reaches the door with its task', (await sent('forgetPlan')).includes('WoW talent build'), await sent('forgetPlan'));

  // 8. Open the whole brief: it comes back as it first looked
  await js(`document.querySelector('#back .lt-item[data-id="104"] .lt-head').click(); true`); await wait(100);
  await js(`[...document.querySelectorAll('#back .lt-item[data-id="104"] .key')].find((k) => k.textContent === 'Open the whole brief').click(); true`); await wait(600);
  check('the whole brief comes back, and looking back steps aside', (await js(`document.getElementById('back').hidden && !!document.querySelector('.briefcard:not([hidden])')`)) === true);

  // 9. a new message while looking back takes the bubble back
  await js(`document.getElementById('bubble').dispatchEvent(new WheelEvent('wheel', { deltaY: -120, bubbles: true })); true`); await wait(200);
  await js(`window.__deliver({ t: 'bubble', text: 'Something new.', stream: false, proactive: true })`); await wait(1500);
  check('something new ends looking back', (await js(`document.getElementById('back').hidden && /Something new/.test(document.getElementById('said').textContent)`)) === true);

  console.log(bad ? `${bad} FAILED` : 'ALL PASS'); app.exit(bad ? 1 : 0);
});
