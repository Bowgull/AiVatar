// 9.D D3: the cards Aang draws, rendered by the REAL CardRenderer off screen, saved as PNGs to look at. Nothing on
// his screen. Checks each kind draws at 2x with a see-through background, and that page-made text cannot inject markup.
//
// Run: npx electron test/electron/cards-check.ts <folder for pictures>
import { app, nativeImage } from 'electron';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { servePages } from '../../src/pageserver.ts';
import { CardRenderer } from '../../src/cardrender.ts';

process.on('uncaughtException', (e) => { console.log('HARNESS ERROR ' + (e as Error).stack); app.exit(2); });
process.on('unhandledRejection', (e) => { console.log('HARNESS REJECTION ' + String((e as Error)?.stack ?? e)); app.exit(2); });
setTimeout(() => { console.log('HARNESS TIMEOUT'); app.exit(3); }, 60_000).unref();
app.setPath('userData', mkdtempSync(path.join(os.tmpdir(), 'cards-check-')));

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(process.argv[process.argv.length - 1] ?? os.tmpdir());
mkdirSync(OUT, { recursive: true });
let bad = 0;
const check = (what: string, ok: boolean, detail = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${what}${detail ? '  -- ' + detail : ''}`); if (!ok) bad++; };

app.whenReady().then(async () => {
  const pages = await servePages(path.join(HERE, '..', '..', 'pages'));
  const r = new CardRenderer(pages.origin);
  const cases: [string, unknown][] = [
    ['job', { headline: 'Claude is on it', sub: 'Step 4 of 6: waiting on you', steps: 6, at: 4 }],
    ['needs', { title: 'Delete 3 old test files?', text: 'They test the old bubble, which the new one replaced. Nothing else uses them.' }],
    ['watched', { meta: '0:48, read from the transcript', title: 'Lemon pasta in 10 minutes', kind: 'recipe', shows: 'A quick lemon pasta with butter and parmesan.', useful: [{ who: 'you', what: 'dinner tonight' }, { who: 'Aang', what: 'nothing, just for fun' }], best: 0 }],
    ['home', { tiles: [{ k: 'CLAUDE THIS WEEK', v: '31%, on pace', fill: 0.31 }, { k: 'RUNNING', v: '1 Claude job' }, { k: 'WAITING ON YOU', v: '2 things', tone: 'warn' }, { k: 'YOUR PC', v: 'On', tone: 'good' }] }],
    ['brief', { day: 'Tuesday, October 14', weather: '9 to 14 degrees, light rain, 60% chance of rain', job: [{ tag: 'REPLY', who: 'Rhea Patel', what: 'Next steps and the demo' }, { tag: 'NEW', who: '3 job matches', what: '' }], waiting: [{ tag: 'WAITING', who: 'Portfolio update needs you', what: '' }], today: [{ tm: '10:30 am', title: 'Dentist', where: 'Queen St' }, { tm: 'all day', title: 'Mom birthday', where: '' }], other: [{ who: 'Amazon', what: 'Your order has shipped' }], more: 4 }],
    ['brief', { day: 'Wednesday, October 15', weather: '', job: [], waiting: [], today: [], other: [], more: 0 }],
    ['quota', { what: 'a background job: prep for the demo', low: 0.02, high: 0.05, week: 0.34, resetsAt: 1792368000 }],
    ['home', { tiles: [{ k: 'CLAUDE THIS WEEK', v: '34%, on pace', fill: 0.34 }, { k: 'NEXT 5 HOURS', v: '12% used', fill: 0.12 }, { k: 'RUNNING', v: 'nothing' }, { k: 'WAITING ON YOU', v: '2 things', tone: 'warn' }, { k: 'YOUR PC', v: 'On', tone: 'good' }] }],
  ];
  for (const [kind, data] of cases) {
    const res = await r.render(kind, data);
    if (!res.ok || !res.png) { check(`${kind} card draws`, false, res.error); continue; }
    const buf = Buffer.from(res.png, 'base64');
    writeFileSync(path.join(OUT, `card-${kind}-${cases.findIndex((c) => c[1] === data)}.png`), buf);
    const img = nativeImage.createFromBuffer(buf), size = img.getSize();
    check(`${kind} card draws at 2x`, size.width >= 680 && size.width <= 700, `${size.width}x${size.height}`);
    const corner = img.toBitmap()[3];
    check(`${kind} card has a see-through corner`, corner === 0, `alpha ${corner}`);
  }
  // A job title from a website trying to be markup is drawn as plain text.
  const evil = await r.render('needs', { title: '<img src=x onerror=alert(1)>Hi', text: '<b>bold</b>' });
  check('page-made text is drawn as text, never markup', evil.ok === true);
  check('an unknown card is refused', (await r.render('nope', {})).ok === false);
  r.close(); pages.close();
  console.log(bad ? `${bad} failed` : 'all passed');
  app.exit(bad ? 1 : 0);
});
