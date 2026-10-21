// The one cockpit (2026-10-21): the real bubble page, off screen and never focused on his desktop, driven as the main
// process drives it. Checks that opening grows the bubble into the Lantern cockpit with the typing area inside it, that
// talking adds to the conversation instead of replacing it, that a waiting question stays pinned, that the size never
// passes the room it was given, that a click away closes an opened row, and that closing goes back to one bubble.
//
// Run: npx electron test/electron/cockpit-check.ts
import { app, BrowserWindow } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { servePages } from '../../src/pageserver.ts';
import { mkdirSync, writeFileSync } from 'node:fs';

process.on('uncaughtException', (e) => { console.log('HARNESS ERROR ' + String((e as Error)?.stack ?? e)); app.exit(2); });
process.on('unhandledRejection', (e) => { console.log('HARNESS REJECTION ' + String((e as Error)?.stack ?? e)); app.exit(2); });
setTimeout(() => { console.log('HARNESS TIMEOUT'); app.exit(3); }, 90_000).unref();
app.on('window-all-closed', () => { /* the test decides */ });
const HERE = path.dirname(fileURLToPath(import.meta.url));
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
let bad = 0;
const check = (what: string, ok: boolean, d = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${what}${d ? '  -- ' + d : ''}`); if (!ok) bad++; };

app.whenReady().then(async () => {
  const pages = await servePages(path.join(HERE, '..', '..', 'pages'));
  const w = new BrowserWindow({ width: 700, height: 900, show: false, frame: false, webPreferences: { preload: path.join(HERE, 'cockpit-stub.cjs'), contextIsolation: false, sandbox: false, offscreen: true } });
  w.setPosition(-6000, 100);
  w.showInactive();
  const errors: string[] = [];
  w.webContents.on('console-message', (e) => { const m = (e as unknown as { message?: string; level?: string }); if (m.level === 'error') errors.push(String(m.message)); });
  await w.loadURL(`${pages.origin}/bubble.html`);
  await wait(800);
  const js = (s: string) => w.webContents.executeJavaScript(s, true);
  const sizes = () => js(`window.__sent.filter(s => s[0] === 'bubbleSize').map(s => s[1][0])`) as Promise<{ width: number; height: number }[]>;

  check('closed: the typing area is not in the bubble', (await js(`document.getElementById('ck').hidden`)) === true);
  await js(`window.__deliver({ t: 'bubble', text: 'Your demo is Friday at 2 pm.', stream: false, turn: 41, proactive: true })`);
  await wait(2500);
  check('Aang speaks in his usual bubble first', (await js(`!document.getElementById('bubble').hidden && !document.getElementById('bubble').classList.contains('cockpit')`)) === true);

  // Opened (the main process sends cockpit:open with the room it may use, then the typing state)
  await js(`window.__fire('onCockpit', { open: true, state: { maxH: 520 } }); window.__fire('onInputState', { opened: true, mode: 'auto', week: 0.3, history: ['earlier'] })`);
  await wait(900);
  check('open: the bubble is the Lantern cockpit', (await js(`(() => { const b = document.getElementById('bubble'); return b.classList.contains('cockpit') && b.classList.contains('lantern'); })()`)) === true);
  check('open: the typing area is inside the bubble', (await js(`!document.getElementById('ck').hidden && document.getElementById('bubble').contains(document.getElementById('ck'))`)) === true);
  check('open: the conversation (scroll-back) is showing', (await js(`Boolean(document.getElementById('lblist'))`)) === true);
  check('open: the caret is in the typing area', (await js(`document.activeElement?.id`)) === 'ckBox');
  check('open: it asked the brain for the conversation', (await js(`window.__sent.some(s => s[0] === 'olderTurns')`)) === true);
  await js(`window.__deliver({ t: 'history.reply', items: [{ id: 41, ts: '2026-10-21 13:00:00', who: 'Aang', text: 'Your demo is Friday at 2 pm.' }, { id: 40, ts: '2026-10-21 12:59:00', who: 'you', text: 'when is the demo', extra: null }, { id: 39, ts: '2026-10-21 12:00:00', who: 'Aang', text: 'HisWattson posted a video', extra: { about: { url: 'https://www.youtube.com/watch?v=abc', title: 'Wattson ranked guide' } } }] })`);
  await wait(500);
  check('the conversation shows his history', (await js(`document.querySelectorAll('#lblist .lt-item, #lblist .lb-mine').length`)) >= 2);

  // He types and presses Enter: it is sent, and his words join the conversation; the cockpit stays open
  await js(`(() => { const b = document.getElementById('ckBox'); b.value = 'move it to Monday'; b.dispatchEvent(new Event('input')); b.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); })()`);
  await wait(200);
  const sub = await js(`window.__sent.filter(s => s[0] === 'submit').map(s => s[1][0])`) as { text: string; mode: string }[];
  check('Enter sends what he typed, with his mode', sub.at(-1)?.text === 'move it to Monday' && sub.at(-1)?.mode === 'auto', JSON.stringify(sub));
  check('the field empties after sending', (await js(`document.getElementById('ckBox').value`)) === '');
  await js(`window.__deliver({ t: 'asked', text: 'move it to Monday' })`);
  await wait(400);
  check('his words join the conversation (plum, on the right)', (await js(`[...document.querySelectorAll('#lblist .lb-mine')].some(m => m.textContent.includes('move it to Monday'))`)) === true);
  await js(`window.__deliver({ t: 'bubble', text: 'Done. The demo is Monday at 2 pm now.', stream: false, turn: 43 })`);
  await wait(2600);
  check('the answer arrives under the conversation, cockpit still open', (await js(`(() => { const b = document.getElementById('bubble'); return b.classList.contains('cockpit') && !document.getElementById('scroller').hidden && document.getElementById('said').textContent.includes('Monday') && Boolean(document.getElementById('lblist')); })()`)) === true);
  check('no question line repeats what he said (it is in the conversation)', (await js(`document.getElementById('who').hidden`)) === true);
  await wait(400);
  check('the cockpit does not fade away while open', (await js(`!document.getElementById('bubble').hidden`)) === true);

  // A question arrives while it is open: pinned under the conversation, not replacing it
  await js(`window.__deliver({ t: 'permission', id: 'p1', tool: 'mcp__aang__run', question: 'run the build', means: 'Runs a program on this PC' })`);
  await wait(700);
  check('a waiting question shows its keys', (await js(`!document.getElementById('asks').hidden && document.querySelectorAll('#asks .key').length > 0`)) === true);
  check('the conversation stays with the question pinned under it', (await js(`Boolean(document.getElementById('lblist')) && !document.getElementById('back').hidden`)) === true);

  // Lots of history: the cockpit grows, but never past the room it was given (520) plus the window's margins
  const many = Array.from({ length: 30 }, (_, i) => `{ id: ${i + 1}, ts: '2026-10-20 1${i % 10}:00:00', who: '${i % 2 ? 'you' : 'Aang'}', text: 'Message number ${i + 1} in a long day of talking about the cockpit and its many parts.' }`).join(',');
  await js(`window.__deliver({ t: 'history.reply', items: [${many}] })`);
  await wait(1500);
  const last = (await sizes()).at(-1);
  check('the cockpit never grows past its room', Boolean(last && last.height <= 520 + 18 + 56 + 6 + 2), JSON.stringify(last));
  check('the conversation scrolls inside instead', (await js(`(() => { const l = document.getElementById('lblist'); return l.scrollHeight > l.clientHeight + 10; })()`)) === true);

  // A row opened, then a click away from it closes it (his ask: click out like any normal interface)
  const opened = await js(`(() => { const h = document.querySelector('#lblist .lt-item.can[data-id="39"] .lt-head') || document.querySelector('#lblist .lt-item.can .lt-head'); if (!h) return 'none'; h.click(); return document.querySelector('#lblist .lt-item.open') ? 'open' : 'closed'; })()`);
  if (opened !== 'none') {
    await wait(200);
    check('opening a video row widens the cockpit', (await js(`document.getElementById('bubble').classList.contains('ckwide')`)) === true);
    await js(`document.getElementById('ckBox').click()`);
    await wait(300);
    check('a click away closes the opened row', (await js(`!document.querySelector('#lblist .lt-item.open')`)) === true);
  } else console.log('NOTE  no openable row in the sample history; click-away not exercised here');

  // COCKPIT_SHOT=<file.png>: a picture of the open cockpit, for looking at (not a check).
  if (process.env.COCKPIT_SHOT) {
    await js(`document.body.style.background = '#2a2238'; document.getElementById('lblist').scrollTop = 1e6`);
    await wait(400);
    console.log('state: ' + JSON.stringify(await js(`(() => { const c = document.getElementById('ck'), b = document.getElementById('bubble'); const r = c.getBoundingClientRect(), q = b.getBoundingClientRect(); return { ckHidden: c.hidden, ckDisplay: getComputedStyle(c).display, ck: [Math.round(r.top), Math.round(r.height)], bubble: [Math.round(q.top), Math.round(q.height)], styleH: b.style.height, cls: b.className }; })()`)));
    writeFileSync(process.env.COCKPIT_SHOT, (await w.webContents.capturePage()).toPNG());
    console.log('picture: ' + process.env.COCKPIT_SHOT);
  }
  // Right-click: the Samara-style menu, with its rows
  await js(`(() => { const t = document.querySelector('#lblist [data-id="41"]') || document.getElementById('said'); const r = t.getBoundingClientRect(); t.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: r.left + 10, clientY: r.top + 5 })); })()`);
  await wait(200);
  const rows = await js(`[...document.querySelectorAll('#turnmenu .mrow')].map(b => b.textContent)`) as string[];
  check('right-click opens the menu in the cockpit', rows.includes('Copy text') && rows.includes('Reply to this'), rows.join(', '));
  check('the menu wears Samara\'s wood', (await js(`getComputedStyle(document.getElementById('turnmenu')).borderTopWidth`)) === '3px');
  await js(`document.getElementById('turnmenu')?.remove()`);

  // Esc in the typing area (nothing running) asks to close; then the main process closes it
  await js(`window.__deliver({ t: 'state', state: 'idle' })`);
  await js(`document.getElementById('ckBox').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))`);
  await wait(100);
  check('Esc asks to close the cockpit', (await js(`window.__sent.some(s => s[0] === 'inputClose')`)) === true);
  await js(`window.__fire('onCockpit', { open: false })`);
  await wait(700);
  check('closed: the typing area is gone from the bubble', (await js(`document.getElementById('ck').hidden && !document.getElementById('bubble').classList.contains('cockpit')`)) === true);
  check('closed with a question still waiting: the question stays', (await js(`!document.getElementById('bubble').hidden && !document.getElementById('asks').hidden`)) === true);
  check('closed: the question is drawn the one-bubble way (no wood)', (await js(`!document.getElementById('bubble').classList.contains('lantern')`)) === true);
  await js(`window.__deliver({ t: 'ask.expired', id: 'p1' })`);
  await wait(900);

  // ---- C3 (2026-10-21): docked. A click on a message opens the cockpit bound to it (docked); closing lets the main
  // process's undock dismiss it. The hotkey opens it NOT docked, and a "sent" undock never closes it.
  const openIt = async (docked: boolean) => { await js(`window.__fire('onCockpit', { open: true, state: { maxH: 620, docked: ${docked} } }); window.__fire('onInputState', { opened: true, mode: 'auto', week: 0.3 })`); await wait(900); };
  const closeIt = async () => { await js(`window.__fire('onCockpit', { open: false })`); };
  const isOpen = () => js(`document.getElementById('bubble').classList.contains('cockpit') && !document.getElementById('ck').hidden && !document.getElementById('bubble').hidden`) as Promise<boolean>;
  const shown = () => js(`!document.getElementById('bubble').hidden`) as Promise<boolean>;
  await js(`window.__deliver({ t: 'bubble', text: 'The build passed.', stream: false, turn: 60 })`);
  await wait(2200);
  await js(`window.__sent.length = 0; document.getElementById('bubble').click()`);
  const dock = await js(`window.__sent.filter(s => s[0] === 'dockBox').map(s => s[1][0])`) as { turn: number }[];
  check('docked: a click on a message asks to open the cockpit bound to it', dock.at(-1)?.turn === 60, JSON.stringify(dock));
  await openIt(true);
  check('docked: the cockpit opens', await isOpen());
  await closeIt();
  await wait(250);
  check('docked: closing waits for the undock (the message is still bound)', await shown());
  await js(`window.__fire('onUndock', null)`);
  await wait(900);
  check('docked: the undock lets the message go, as the old docked box did', (await shown()) === false);
  await openIt(false);
  check('hotkey: the cockpit opens, not docked', await isOpen());
  await js(`window.__fire('onUndock', 'sent')`);
  await wait(300);
  check('undocking while open (he sent) leaves the cockpit open', await isOpen());
  await js(`window.__deliver({ t: 'history.reply', items: [{ id: 58, ts: '2026-10-21 08:00:00', who: 'you', text: 'what is on today' }, { id: 59, ts: '2026-10-21 08:00:05', who: 'Aang', text: 'A quiet day.' }] })`);
  await wait(300);

  // ---- C3: the brief arrives while it is open: a card in the live area, under the conversation, above the typing area
  const brief = { day: 'Tuesday, October 21', events: [{ title: 'Interview with Acme', start: '2026-10-21T14:00:00', end: '2026-10-21T15:00:00', where: 'Zoom' }],
    unread: [{ from: 'Dana Smith', subject: 'Your offer letter', why: 'asked for a call this week', at: '2026-10-21T07:10:00' }],
    parts: [{ part: 'morn', sky: 'sun', temp: 8 }, { part: 'aftn', sky: 'cloud', temp: 12 }, { part: 'eve', sky: 'rain', temp: 9 }], week: 0.42 };
  await js(`window.__deliver(${JSON.stringify({ t: 'bubble', text: 'Your morning brief.', stream: false, turn: 70, proactive: true, brief })})`);
  await wait(1200);
  const order = (a: string) => js(`(() => { const r = (s) => document.querySelector(s)?.getBoundingClientRect(); const l = r('#lblist'), x = r('${a}'), k = r('#ck'); return Boolean(l && x && k && x.height > 20 && x.top >= l.bottom - 2 && x.bottom <= k.top + 2); })()`) as Promise<boolean>;
  check('brief: shows inside the open cockpit', (await isOpen()) && (await js(`!document.querySelector('.briefcard').hidden && document.getElementById('bubble').contains(document.querySelector('.briefcard'))`)) === true);
  check('brief: under the conversation, above the typing area', await order('.briefcard'));
  check('brief: the cockpit widens for it', (await js(`document.getElementById('bubble').classList.contains('ckwide')`)) === true);
  const shot = process.env.COCKPIT_SHOT;
  const snap = async (file: string) => { await js(`document.body.style.background = '#2a2238'`); await wait(500); writeFileSync(file, (await w.webContents.capturePage()).toPNG()); console.log('picture: ' + file); };
  if (shot) await snap(shot.replace(/\.png$/i, '') + '-brief.png');
  await js(`[...document.querySelectorAll('.briefcard .lt-foot .key')].find(k => k.textContent.startsWith('Got it'))?.click()`);
  await wait(600);
  check('brief: Got it puts it into the conversation as a row and the cockpit stays', (await isOpen()) && (await js(`document.querySelector('.briefcard').hidden && Boolean(document.querySelector('#lblist [data-id="70"]'))`)) === true);

  // ---- C3: a message about a video arrives while it is open: the video opens straight in, and the cockpit widens
  await js(`window.__deliver({ t: 'bubble', text: 'HisWattson posted a video.', stream: false, turn: 71, proactive: true, about: { url: 'https://www.youtube.com/watch?v=abc123', title: 'Wattson ranked guide' } })`);
  await wait(1500);
  check('video: its card shows inside the open cockpit', (await isOpen()) && (await js(`Boolean(document.querySelector('#aboutbox:not([hidden]) .vshot'))`)) === true);
  check('video: under the conversation, above the typing area', await order('#aboutbox'));
  check('video: the cockpit widens for it', (await js(`document.getElementById('bubble').classList.contains('ckwide')`)) === true);
  if (shot) await snap(shot);

  // ---- C3: a Claude plan arrives while it is open: the video joins the conversation, the plan takes the live area
  const plan = { id: 'samara:9', task: 'Book the dentist', sites: [{ site: 'dentist.ca', login: true, favicon: '' }], steps: ['Open the booking page', 'Pick Tuesday at 4'], wont: 'pay for anything' };
  await js(`window.__deliver(${JSON.stringify({ t: 'plan', id: plan.id, steps: plan.steps.map((text) => ({ text })), samara: plan })})`);
  await wait(900);
  check('plan: shows inside the open cockpit with its keys', (await isOpen()) && (await js(`!document.querySelector('.samaraplan').hidden && !document.getElementById('asks').hidden`)) === true);
  check('plan: the video before it is now a row in the conversation', (await js(`Boolean(document.querySelector('#lblist [data-id="71"]')) && document.getElementById('aboutbox').hidden`)) === true);
  check('plan: under the conversation, above the typing area', await order('.samaraplan'));
  await js(`window.__deliver({ t: 'bubble', text: 'Side note while you decide.', stream: false, turn: 72 })`);
  await wait(500);
  check('plan: a reply meanwhile goes into the conversation; the plan stays pinned', (await js(`!document.querySelector('.samaraplan').hidden && Boolean(document.querySelector('#lblist [data-id="72"]'))`)) === true);
  await js(`window.__sent.length = 0; [...document.querySelectorAll('#asks .key')].at(-1)?.click()`);
  await wait(500);
  check('plan: answered, it leaves the live area and the cockpit stays', (await isOpen()) && (await js(`document.querySelector('.samaraplan').hidden && window.__sent.some(s => s[0] === 'answerAsk')`)) === true);

  // ---- parity in the cockpit: a stop (bubble.clear) keeps it open; "now playing" shows its keys; Esc outside the field
  await js(`window.__deliver({ t: 'bubble', text: 'Working on a long answer that he will stop', stream: true, turn: 73 })`);
  await wait(300);
  await js(`window.__deliver({ t: 'bubble.clear' })`);
  await wait(400);
  check('stop: the live answer goes, the cockpit and conversation stay', (await isOpen()) && (await js(`document.getElementById('scroller').hidden && Boolean(document.getElementById('lblist'))`)) === true);
  await js(`window.__deliver({ t: 'whisper', text: 'Now playing: Lo-fi beats', controls: 'media' })`);
  await wait(500);
  check('whisper: "now playing" and its keys show in the cockpit', (await isOpen()) && (await js(`!document.querySelector('.media').hidden && document.getElementById('said').textContent.includes('Now playing')`)) === true);
  await js(`window.__sent.length = 0; document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))`);
  await wait(100);
  check('Esc outside the typing area closes the cockpit too', (await js(`window.__sent.some(s => s[0] === 'inputClose')`)) === true);
  await closeIt();
  await wait(900);
  check('closed: back to nothing on screen, no cockpit left behind', (await shown()) === false && (await js(`!document.getElementById('bubble').classList.contains('cockpit') && document.querySelector('.media').hidden`)) === true);

  // ---- Sheet 48 (his pick, 2026-10-21): each kind on its own paper, its little label only under the mouse, Claude's
  // icon on Claude's rows and the gold key on what was done for him. Old unmarked chat stays plain parchment.
  await openIt(false);
  const KINDS = [
    { id: 801, ts: '2026-10-21 15:00:00', who: 'Aang', text: 'Your morning brief', extra: { brief: { day: 'Tuesday', events: [], unread: [], jobsNew: 0 } } },
    { id: 802, ts: '2026-10-21 15:01:00', who: 'Aang', text: 'An old reply with no mark.' },
    { id: 803, ts: '2026-10-21 15:02:00', who: 'Aang', text: 'Done. I moved the demo to Monday.', extra: { kind: 'action' } },
    { id: 804, ts: '2026-10-21 15:03:00', who: 'Aang', text: 'HisWattson posted a video', extra: { about: { url: 'https://www.youtube.com/watch?v=k48', title: 'guide' } } },
    { id: 805, ts: '2026-10-21 15:04:00', who: 'Aang', text: 'Claude Code finished in Waymark.', extra: { kind: 'claude', project: 'Waymark' } },
    { id: 806, ts: '2026-10-21 15:05:00', who: 'Aang', text: 'This week’s research', extra: { research: { finds: [] } } },
    { id: 807, ts: '2026-10-21 15:06:00', who: 'Aang', text: 'You said yes: moved a file', kind: 'yes', extra: { yes: { question: 'move it', choice: 'once', did: 'moved a file', ok: true, note: '', at: '2026-10-21T15:06:00Z', cant: 'no' } } },
  ];
  await js(`window.__deliver(${JSON.stringify({ t: 'history.reply', items: KINDS })})`);
  await wait(600);
  const kinds = await js(`(() => { const o = {}; for (const id of [801, 802, 803, 804, 805, 806, 807]) { const r = document.querySelector('#lblist [data-id="' + id + '"]'); o[id] = r ? { cls: [...r.classList].filter(c => c.startsWith('k-')).join(' '), label: r.querySelector('.lb-kind')?.textContent ?? '', claude: Boolean(r.querySelector('.lt-tile img.lb-claude')), key: Boolean(r.querySelector('.lt-tile .lb-key')), bg: getComputedStyle(r).backgroundImage + getComputedStyle(r).backgroundColor } : null; } return o; })()`) as Record<number, { cls: string; label: string; claude: boolean; key: boolean; bg: string } | null>;
  check('kinds: the brief is on honey paper, labelled BRIEF', kinds[801]?.cls === 'k-brief' && kinds[801]?.label === 'BRIEF', JSON.stringify(kinds[801]));
  check('kinds: an unmarked old reply stays plain parchment, no label', kinds[802]?.cls === '' && kinds[802]?.label === '' && /rgba\(0, 0, 0, 0\)/.test(kinds[802]?.bg ?? ''), JSON.stringify(kinds[802]));
  check('kinds: done for you is on sage with the gold key', kinds[803]?.cls === 'k-action' && kinds[803]?.label === 'DONE FOR YOU' && kinds[803]?.key && !kinds[803]?.claude && /gradient/.test(kinds[803]?.bg ?? ''), JSON.stringify(kinds[803]));
  check('kinds: a video is on dark wood, labelled VIDEO', kinds[804]?.cls === 'k-video' && kinds[804]?.label === 'VIDEO' && /rgb\(42, 26, 16\)/.test(kinds[804]?.bg ?? ''), JSON.stringify(kinds[804]));
  check('kinds: Claude is on terracotta with Claude\'s icon and its project', kinds[805]?.cls === 'k-claude' && kinds[805]?.label === 'CLAUDE · WAYMARK' && kinds[805]?.claude && !kinds[805]?.key, JSON.stringify(kinds[805]));
  check('kinds: research shares the honey, labelled RESEARCH', kinds[806]?.cls === 'k-brief' && kinds[806]?.label === 'RESEARCH', JSON.stringify(kinds[806]));
  check('kinds: a yes he gave is done for you too', kinds[807]?.cls === 'k-action' && kinds[807]?.label === 'DONE FOR YOU', JSON.stringify(kinds[807]));
  check('kinds: only Claude rows wear Claude\'s icon, only done-for-you talk wears the key',
    (await js(`document.querySelectorAll('#lblist .lt-tile img.lb-claude').length`)) === 1 && (await js(`document.querySelectorAll('#lblist .lt-tile .lb-key').length`)) === 1);
  // His correction (2026-10-21): under the mouse the row itself opens a little to show the label inside it, above the
  // words (sheet-48/c-tag.png), the rows below glide down, nothing overlaps; a quick sweep across rows opens none.
  const geo = (id: number) => js(`(() => { const r = document.querySelector('#lblist [data-id="${id}"]'); const l = r?.querySelector('.lb-kind'); if (!r || !l) return null; const a = r.getBoundingClientRect(), b = l.getBoundingClientRect(), t = r.querySelector('.lt-txt b').getBoundingClientRect(); return { top: a.top, bottom: a.bottom, h: a.height, lh: b.height, lt: b.top, lb: b.bottom, ll: b.left, lr: b.right, left: a.left, right: a.right, wordsTop: t.top, shown: r.classList.contains('kshow') }; })()`) as Promise<{ top: number; bottom: number; h: number; lh: number; lt: number; lb: number; ll: number; lr: number; left: number; right: number; wordsTop: number; shown: boolean } | null>;
  // Every row's box against the next one in its slip, and the conversation against the typing area under it.
  const overlaps = () => js(`(() => { const bad = []; for (const s of document.querySelectorAll('#lblist .lt-slip')) { const rs = [...s.querySelectorAll(':scope > .lt-item, :scope > .lb-mine')].map(e => [e.dataset.id ?? 'mine', e.getBoundingClientRect()]); for (let i = 1; i < rs.length; i++) if (rs[i - 1][1].bottom > rs[i][1].top + 0.5) bad.push(rs[i - 1][0] + '>' + rs[i][0]); } const l = document.getElementById('lblist').getBoundingClientRect(), b = document.getElementById('bubble').getBoundingClientRect(), k = document.getElementById('ck').getBoundingClientRect(); if (l.bottom > k.top + 0.5) bad.push('list>typing'); if (k.bottom > b.bottom + 0.5) bad.push('typing past the frame'); return bad; })()`) as Promise<string[]>;
  await js(`document.querySelector('#lblist [data-id="805"]').scrollIntoView({ block: 'center' })`);
  await wait(200);
  const g0 = await geo(805);
  check('label: closed while the mouse is away (0 tall, the row at rest)', Boolean(g0 && g0.lh < 0.5 && !g0.shown), JSON.stringify(g0));
  // The mouse moves over the row: sent to this off-screen page only, never to a real window.
  const at = await js(`(() => { const r = document.querySelector('#lblist [data-id="805"] .lt-txt').getBoundingClientRect(); return { x: Math.round(r.left + 20), y: Math.round(r.top + r.height / 2) }; })()`) as { x: number; y: number };
  w.webContents.sendInputEvent({ type: 'mouseMove', x: at.x, y: at.y });
  await wait(30);
  check('label: waits a moment before opening (no ripple when the mouse passes)', (await geo(805))?.shown === false);
  await wait(110);
  const gMid = await geo(805);
  check('label: opens smoothly, partway there mid-way', Boolean(gMid && gMid.lh > 0.5 && gMid.lh < 10.5), JSON.stringify(gMid));
  mkdirSync(path.join(HERE, 'perf-out'), { recursive: true });
  writeFileSync(path.join(HERE, 'perf-out', 'kind-hover-mid.png'), (await w.webContents.capturePage()).toPNG());
  await wait(400);
  const g1 = await geo(805);
  check('label: the row grows by the label\'s height', Boolean(g0 && g1 && Math.abs(g1.h - g0.h - 11) < 1.5), `${g0?.h} -> ${g1?.h}`);
  check('label: shows inside the row, above the words', Boolean(g1 && g1.lh > 10 && g1.lt >= g1.top && g1.lb <= g1.wordsTop + 0.5 && g1.ll >= g1.left && g1.lr <= g1.right + 0.5), JSON.stringify(g1));
  check('label: the row is still the one under the mouse', (await js(`document.elementFromPoint(${at.x}, ${at.y})?.closest('[data-id]')?.dataset.id`)) === '805');
  check('label: the other rows keep theirs closed', (await geo(803))?.lh === 0);
  const ov = await overlaps();
  check('label: no rows overlap, the typing area stays in the frame', ov.length === 0, ov.join(', '));
  writeFileSync(path.join(HERE, 'perf-out', 'kind-hover.png'), (await w.webContents.capturePage()).toPNG());
  w.webContents.sendInputEvent({ type: 'mouseMove', x: 2, y: 2 });
  await wait(450);
  const g2 = await geo(805);
  check('label: closes again when the mouse leaves, the row back at rest', Boolean(g0 && g2 && g2.lh < 0.5 && Math.abs(g2.h - g0.h) < 0.5), JSON.stringify(g2));
  // A quick sweep down every row (20 ms on each, quicker than the wait): none of them opens.
  const ys = await js(`[...document.querySelectorAll('#lblist .lt-item')].map(r => { const b = r.getBoundingClientRect(); return Math.round(b.top + b.height / 2); })`) as number[];
  for (const y of ys) { w.webContents.sendInputEvent({ type: 'mouseMove', x: at.x, y }); await wait(20); }
  w.webContents.sendInputEvent({ type: 'mouseMove', x: 2, y: 2 });
  await wait(150);
  check('label: a quick sweep across the rows opens none of them', (await js(`document.querySelectorAll('#lblist .lt-item.kshow').length`)) === 0);
  // The live answer wears its kind's paper too, and an ordinary one does not.
  await js(`window.__deliver({ t: 'bubble', text: 'Claude Code finished in Waymark, that one took 6 minutes.', stream: false, turn: 808, proactive: true, kind: 'claude', project: 'Waymark' })`);
  await wait(1500);
  check('live: Claude\'s answer under the conversation is on Claude\'s paper', (await js(`document.getElementById('scroller').classList.contains('k-claude') && /gradient/.test(getComputedStyle(document.getElementById('scroller')).backgroundImage)`)) === true);
  await js(`window.__deliver({ t: 'bubble', text: 'Your demo is Friday.', stream: false, turn: 809 })`);
  await wait(1500);
  check('live: the Claude answer joins the conversation on its paper, the plain one is plain', (await js(`document.querySelector('#lblist [data-id="808"]')?.classList.contains('k-claude') && !document.getElementById('scroller').classList.contains('k-claude')`)) === true);
  await closeIt();
  await wait(700);

  check('no errors in the page', errors.length === 0, errors.join(' | '));
  pages.close();
  console.log(bad ? `${bad} failed` : 'all passed');
  setTimeout(() => app.exit(bad ? 1 : 0), 300);
});
