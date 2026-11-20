// His rule (2026-11-13): "if samara needs permissions it should come from samara". A Claude session's plan card is asked
// in Samara's own band (opening Samara if it is closed), never sent to Aang's bubble to wait there. And a popup a site
// opens comes up over Samara's window, wholly on that screen.
// Run on the hidden desktop: powershell -File tools/hidden-desktop-run.ps1 -Command "npx electron test/electron/plan-in-samara-check.ts"
import { app, BrowserWindow, screen } from 'electron';
import { mkdtempSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { servePages } from '../../src/pageserver.ts';
import { AangBrowser } from '../../src/browser.ts';

process.on('uncaughtException', (e) => { console.log('HARNESS NOTE ' + String((e as Error).message).split('\n')[0]); });
setTimeout(() => { console.log('HARNESS TIMEOUT'); app.exit(3); }, 60_000).unref();
app.on('window-all-closed', () => { /* the test decides */ });
const TMP = mkdtempSync(path.join(os.tmpdir(), 'plan-here-'));
app.setPath('userData', path.join(TMP, 'user'));
const HERE = path.dirname(fileURLToPath(import.meta.url));
BrowserWindow.prototype.focus = function () { /* not in a test */ };
let bad = 0;
const check = (what: string, ok: boolean, d: unknown = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${what}${d !== '' ? '  -- ' + JSON.stringify(d).slice(0, 220) : ''}`); if (!ok) bad++; };
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

app.whenReady().then(async () => {
  const pages = await servePages(path.join(HERE, '..', '..', 'pages'));
  const b = new AangBrowser({ origin: pages.origin, stateDir: path.join(TMP, 'state'), preloadPath: path.join(HERE, '..', '..', 'src', 'samarapreload.cjs'),
    tabPreloadPath: path.join(HERE, '..', '..', 'src', 'tabpreload.cjs'), settingsPreloadPath: path.join(HERE, '..', '..', 'src', 'settingspreload.cjs'),
    thingsPreloadPath: path.join(HERE, '..', '..', 'src', 'thingspreload.cjs') }) as any;
  let bubbleAsked = 0;
  b.onPlanAsk = async () => { bubbleAsked++; await wait(10_000); return null; };   // a bubble that never answers

  // Samara is closed: the plan opens it and asks in its band.
  check('no Samara window before the plan', !b.lastPane());
  const sent: unknown[] = [];
  const asking = b.askPlan({ task: 'OmaDemon edge art', steps: ['Open Gemini', 'Make the art'], wont: 'No sign-ins', sites: [{ site: 'gemini.google.com', login: true, favicon: '' }] });
  const t0 = Date.now();
  while (!b.win && Date.now() - t0 < 8000) await wait(100);
  const orig = b.win.webContents.send.bind(b.win.webContents);
  b.win.webContents.send = (ch: string, ...a: unknown[]) => { if (ch === 'browser:plan') sent.push(a[0]); return orig(ch, ...a); };
  await wait(2500);
  check('the plan is never sent to Aang\'s bubble to wait there', bubbleAsked === 0, bubbleAsked);
  check('Samara opened to ask it', Boolean(b.win && !b.win.isDestroyed() && b.win.isVisible()));
  const card = sent.find((x) => x && typeof x === 'object') as { id?: string; task?: string } | undefined;
  check('the card is in Samara\'s band', card?.task === 'OmaDemon edge art', card ?? sent);
  b.planReply(card?.id ?? '', { go: true, keep: ['gemini.google.com'] });
  const a = await Promise.race([asking, wait(3000).then(() => 'no answer')]);
  check('his yes in the band answers the session at once', (a as { go?: boolean })?.go === true && Date.now() - t0 < 9000, a);

  // A popup a site opens: over Samara's window, wholly on its screen.
  const box = b.overWindow(520, 680);
  const area = screen.getDisplayMatching(b.win.getBounds()).workArea, wb = b.win.getBounds();
  const inside = box.x >= area.x && box.y >= area.y && box.x + box.width <= area.x + area.width && box.y + box.height <= area.y + area.height;
  const centred = Math.abs(box.x + box.width / 2 - (wb.x + wb.width / 2)) <= 1 || !inside;
  check('a site\'s popup comes up over Samara, wholly on its screen', inside && centred, { box, area, window: wb });
  console.log(bad ? `${bad} FAILED` : 'ALL PASS'); app.exit(bad ? 1 : 0);
});
