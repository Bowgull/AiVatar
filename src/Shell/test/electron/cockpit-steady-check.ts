// The cockpit holds still (2026-10-21). On his desktop the open cockpit crept from 704 to 911 px tall in 20 s while the
// mouse moved over it ("the bubble is glitched so bad"): every hover set off a measure, every measure scrolled the
// conversation to its top, and the top asked the brain for older turns, which made it taller, and so on.
//
// This plays the main process for real: every size the page asks for is applied to the (off-screen) window, the way
// main.ts does, and a fake brain answers "older turns" from a long history. Then the mouse wanders over the cockpit for
// 20 s, resting on rows (their labels open), on the jobs strip and the typing area, while the brain keeps sending the
// same job list. The size must not change once, and measuring twice must give the same answer.
//
// Off screen, never focused, no real input: mouse moves go to this page only. Run: npx electron test/electron/cockpit-steady-check.ts
import { app, BrowserWindow } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { servePages } from '../../src/pageserver.ts';
import { mkdirSync, writeFileSync } from 'node:fs';

process.on('uncaughtException', (e) => { console.log('HARNESS ERROR ' + String((e as Error)?.stack ?? e)); app.exit(2); });
process.on('unhandledRejection', (e) => { console.log('HARNESS REJECTION ' + String((e as Error)?.stack ?? e)); app.exit(2); });
setTimeout(() => { console.log('HARNESS TIMEOUT'); app.exit(3); }, 75_000).unref();
app.on('window-all-closed', () => { /* the test decides */ });
const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(HERE, 'perf-out');
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
let bad = 0;
const check = (what: string, ok: boolean, d = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${what}${d ? '  -- ' + d : ''}`); if (!ok) bad++; };

// A long history in the brain: 199 turns, the last one Aang's answer to his question, his and Aang's, some of them Claude's news (they get a hover label).
const DB = Array.from({ length: 199 }, (_, i) => {
  const id = i + 1, mine = i % 2 === 1;
  const text = mine ? `question ${id} about the day` : `Answer ${id}: a reply long enough to wrap onto a second line in the cockpit, as real ones do.`;
  return { id, ts: `2026-10-2${i < 100 ? 0 : 1} ${String(8 + (i % 12)).padStart(2, '0')}:${String(i % 60).padStart(2, '0')}:00`, who: mine ? 'you' : 'Aang', text,
    ...(id % 7 === 0 && !mine ? { extra: { kind: 'claude', project: 'Waymark' } } : {}) };
});
const JOB = { id: '11111111-aaaa-4bbb-8ccc-000000000001', machine: 'pc', cwd: 'C:\\x\\Waymark', project: 'Waymark', model: 'opus', phase: 'working',
  startedAt: Date.now() - 600_000, lastActivity: Date.now(), prompt: 'do it', tasks: [{ text: 'One', status: 'completed' }, { text: 'Two', status: 'in_progress' }, { text: 'Three', status: 'pending' }],
  current: null, percent: 33, etaMs: 600_000, usage: null, open: 'claude://claude.ai/epitaxy/x', held: 0 };

app.whenReady().then(async () => {
  const pages = await servePages(path.join(HERE, '..', '..', 'pages'));
  const w = new BrowserWindow({ width: 560, height: 300, show: false, frame: false, webPreferences: { preload: path.join(HERE, 'cockpit-stub.cjs'), contextIsolation: false, sandbox: false, offscreen: true } });
  w.setPosition(-6000, 100);
  w.showInactive();
  const errors: string[] = [];
  w.webContents.on('console-message', (e) => { const m = (e as unknown as { message?: string; level?: string }); if (m.level === 'error') errors.push(String(m.message)); });
  await w.loadURL(`${pages.origin}/bubble.html`);
  await wait(800);
  const js = (s: string) => w.webContents.executeJavaScript(s, true);

  // ---- the main process and the brain, played here
  const applied: string[] = [];
  let olderAsked = 0, seen = 0, stop = false;
  const pump = async () => {
    while (!stop) {
      const fresh = await js(`window.__sent.splice(0).filter(s => s[0] === 'bubbleSize' || s[0] === 'olderTurns').map(s => [s[0], s[1][0]])`).catch(() => []) as [string, any][];
      for (const [k, v] of fresh) {
        if (k === 'bubbleSize') {
          // main.ts: clamped to 900 tall, then setBounds
          const width = Math.max(220, Math.min(1400, Math.round(v.width))), height = Math.max(80, Math.min(900, Math.round(v.height)));
          applied.push(`${width}x${height}`);
          w.setSize(width, height);
        } else {
          olderAsked++;
          const before = Number(v?.before) || 1e9;
          const page = DB.filter((t) => t.id < before).slice(-12).reverse();   // the brain sends 12 a page (core.ts history)
          await js(`window.__deliver(${JSON.stringify({ t: 'history.reply', items: page })})`);
        }
      }
      seen += fresh.length;
      await wait(40);
    }
  };
  void pump();

  // Aang said something, then he opens the cockpit (Ctrl+Plus) on a big screen: two thirds of it is 924 px.
  await js(`window.__deliver({ t: 'bubble', text: 'Answer 199: a reply long enough to wrap onto a second line in the cockpit, as real ones do.', stream: false, turn: 199 })`);
  await wait(1500);
  await js(`window.__fire('onCockpit', { open: true, state: { maxH: 924 } }); window.__fire('onInputState', { opened: true, mode: 'auto', week: 0.3 })`);
  await js(`window.__deliver(${JSON.stringify({ t: 'claude.jobs', jobs: [JOB] })})`);
  await wait(2500);
  const settled = applied.at(-1);
  const rows0 = await js(`document.querySelectorAll('#lblist .lt-item, #lblist .lb-mine').length`) as number;
  check('open: only the last exchange shows (his last message and Aang\'s answer)', rows0 === 2, `${rows0} rows`);
  const m1 = await js(`window.__cockMeasure?.()`), m2 = await js(`window.__cockMeasure?.()`);
  check('measuring twice gives the same answer', JSON.stringify(m1) === JSON.stringify(m2) && m1 != null, `${JSON.stringify(m1)} / ${JSON.stringify(m2)}`);
  const askedAtOpen = olderAsked;

  // ---- 20 s of the mouse wandering over it, resting on things, while the brain repeats the same job list
  const before = applied.length;
  const box = await js(`(() => { const r = document.getElementById('bubble').getBoundingClientRect(); return { l: r.left, t: r.top, w: r.width, h: r.height }; })()`) as { l: number; t: number; w: number; h: number };
  const t0 = Date.now();
  let i = 0;
  while (Date.now() - t0 < 20_000) {
    // Targets: every row, the jobs strip, the typing strip's pills, the frame's edges; resting 30 to 400 ms on each.
    const pts = await js(`[...document.querySelectorAll('#lblist .lt-item, #lblist .lb-mine, #ckjobs .job, #ckMode, #ckUsage, #ckBox')].map(e => { const r = e.getBoundingClientRect(); return [Math.round(r.left + r.width / 2), Math.round(r.top + r.height / 2)]; })`) as [number, number][];
    const [x, y] = i % 5 === 4 ? [Math.round(box.l + ((i * 37) % box.w)), Math.round(box.t + ((i * 53) % box.h))] : pts[i % Math.max(1, pts.length)] ?? [10, 10];
    w.webContents.sendInputEvent({ type: 'mouseMove', x, y });
    if (i % 3 === 0) await js(`window.__deliver(${JSON.stringify({ t: 'claude.jobs', jobs: [{ ...JOB, lastActivity: Date.now() }] })})`);
    await wait([30, 120, 400, 60, 250][i % 5]!);
    i++;
  }
  w.webContents.sendInputEvent({ type: 'mouseMove', x: 1, y: 1 });
  await wait(800);
  const during = applied.slice(before);
  check('20 s of hovering: the window size never changed', during.length === 0, during.join(' '));
  check('20 s of hovering: nothing asked the brain for older turns by itself', olderAsked === askedAtOpen, `${askedAtOpen} -> ${olderAsked}`);
  check('the size is where it settled', applied.at(-1) === settled, `${settled} -> ${applied.at(-1)}`);
  const m3 = await js(`window.__cockMeasure?.()`);
  check('measured again after all that: the same answer', JSON.stringify(m3) === JSON.stringify(m1), `${JSON.stringify(m1)} -> ${JSON.stringify(m3)}`);
  const frame = await js(`(() => { const b = document.getElementById('bubble').getBoundingClientRect(), k = document.getElementById('ck').getBoundingClientRect(); return { top: b.top, bottom: b.bottom, ck: k.bottom, ih: innerHeight }; })()`) as { top: number; bottom: number; ck: number; ih: number };
  check('the whole frame is inside the window (nothing clipped)', frame.top >= 0 && frame.bottom <= frame.ih && frame.ck <= frame.bottom + 0.5, JSON.stringify(frame));

  // ---- Wheel up at the top of the conversation: older turns, a few at a time, and only then
  mkdirSync(OUT, { recursive: true });
  await js(`document.body.style.background = '#2a2238'`);
  await wait(300);
  writeFileSync(path.join(OUT, 'cockpit-open-last.png'), (await w.webContents.capturePage()).toPNG());
  const at = await js(`(() => { const r = document.getElementById('lblist').getBoundingClientRect(); return { x: Math.round(r.left + 40), y: Math.round(r.top + 10) }; })()`) as { x: number; y: number };
  // The wheel INSIDE the cockpit no longer fetches older (his call, 2026-10-21: no OLDER key, history is over Aang).
  for (let k = 0; k < 2; k++) { w.webContents.sendInputEvent({ type: 'mouseWheel', x: at.x, y: at.y, deltaX: 0, deltaY: 120, wheelTicksY: 1 } as Electron.MouseWheelInputEvent); await wait(500); }
  const rowsIn = await js(`document.querySelectorAll('#lblist .lt-item, #lblist .lb-mine').length`) as number;
  check('the wheel inside the cockpit brings nothing older', rowsIn === rows0, `${rows0} -> ${rowsIn}`);
  check('no OLDER key shows in the cockpit', await js(`(() => { const o = document.querySelector('#lblist .lb-older'); return !o || getComputedStyle(o).display === 'none'; })()`) === true);
  // The wheel over Aang himself arrives as a page step (onPage): that is how he reaches the history.
  for (let k = 0; k < 4; k++) { await js(`window.__fire('onPage', -1)`); await wait(500); }
  const rows1 = await js(`document.querySelectorAll('#lblist .lt-item, #lblist .lb-mine').length`) as number;
  check('the wheel over Aang brings older turns in', rows1 > rows0, `${rows0} -> ${rows1}`);
  await wait(800);
  writeFileSync(path.join(OUT, 'cockpit-scrolled-up.png'), (await w.webContents.capturePage()).toPNG());
  const grown = applied.at(-1);
  check('scrolled up, it still fits the screen\'s two thirds (and the 900 px window)', Boolean(grown && Number(grown.split('x')[1]) <= 900), String(grown));
  // and still holds still afterwards
  const b2 = applied.length;
  for (let k = 0; k < 40; k++) { w.webContents.sendInputEvent({ type: 'mouseMove', x: at.x + (k % 7) * 30, y: at.y + (k * 23) % 300 }); await wait(k % 2 ? 40 : 200); }
  await wait(600);
  check('after scrolling up, hovering still never changes the size', applied.length === b2, applied.slice(b2).join(' '));

  stop = true;
  check('no errors in the page', errors.length === 0, errors.join(' | '));
  pages.close();
  console.log(bad ? `${bad} failed` : 'all passed');
  setTimeout(() => app.exit(bad ? 1 : 0), 300);
});
