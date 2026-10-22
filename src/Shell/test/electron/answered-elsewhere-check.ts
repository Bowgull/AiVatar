// 2026-10-22, his words: "If I act on something Aang is surfacing, like a question, in Claude without clicking on
// Aang, it should disappear."
//
// bubble.html as it ships, fed exactly as main.ts feeds it (through the test preload). A Claude ask (a permission, a
// question, a plan) is up; nothing is clicked in Aang; the brain's next list arrives without it (he answered it in
// Claude). Within 1 s the card is gone: the closed bubble folds away (never an empty frame, mouse on it or not), the
// open cockpit's pinned question goes while the cockpit stays, and with two waiting only the answered one goes.
//
// Off screen, never focused, no real input, never the clipboard. Errors exit, never a dialog.
// Run (from src/Shell): npx electron test/electron/answered-elsewhere-check.ts
import { app, BrowserWindow, dialog } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { servePages } from '../../src/pageserver.ts';

dialog.showErrorBox = (t: string, c: string) => { console.log('HARNESS DIALOG ' + t + ' ' + c); };
process.on('uncaughtException', (e) => { console.log('HARNESS ERROR ' + String((e as Error)?.stack ?? e)); app.exit(2); });
process.on('unhandledRejection', (e) => { console.log('HARNESS REJECTION ' + String((e as Error)?.stack ?? e)); app.exit(2); });
setTimeout(() => { console.log('HARNESS TIMEOUT'); app.exit(3); }, 120_000).unref();
app.on('window-all-closed', () => { /* the test decides */ });
const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, '..', '..', '..', '..');
const STUB = path.join(HERE, 'cockpit-stub.cjs');
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
let bad = 0;
const check = (what: string, ok: boolean, d: unknown = '') => { const s = typeof d === 'string' ? d : JSON.stringify(d); console.log(`${ok ? 'PASS' : 'FAIL'}  ${what}${s ? '  -- ' + s.slice(0, 300) : ''}`); if (!ok) bad++; };

const W = 940, H = 900;
const JOB = { id: 's-waymark', machine: 'pc', project: 'Waymark', phase: 'working', startedAt: Date.now() - 60000, prompt: 'Build the route screen', tasks: [], current: '', percent: 40, etaMs: 60000, usage: null, open: 'claude://claude.ai/epitaxy/s-waymark', held: 0 };
const CPERM = { id: 'a-perm', session: 's-waymark', project: 'Waymark', kind: 'permission', tool: 'Bash', summary: 'Waymark wants to run the route tests on this PC.', input: '{"command":"npm test -- routes"}', canAlways: true };
const CQ = { id: 'a-q', session: 's-waymark', project: 'Waymark', kind: 'question', tool: 'AskUserQuestion', canAlways: false, summary: '',
  questions: [{ question: 'Which layout should the map use?', header: 'Layout', multiSelect: false, options: [
    { label: 'Full-screen map', description: 'The map fills the screen.' }, { label: 'Split: map and list', description: 'Turns listed underneath.' }] }] };
const CPLAN = { id: 'a-plan', session: 's-waymark', project: 'Waymark', kind: 'plan', tool: 'ExitPlanMode', summary: '', plain: 'Waymark has a plan for the route screen.', plan: '1. Add a grid\n2. Wire the list', canAlways: false };
const list = (items: unknown[], quiet = false) => `window.__deliver({ t: 'claude.wait', items: ${JSON.stringify(items)}${quiet ? ', quiet: true' : ''} })`;
const jobs = `window.__deliver({ t: 'claude.jobs', jobs: [${JSON.stringify(JOB)}] })`;

app.whenReady().then(async () => {
  const pages = await servePages(path.join(ROOT, 'src', 'Shell', 'pages'));
  async function open() {
    const w = new BrowserWindow({ width: W, height: H, show: false, frame: false, useContentSize: true,
      webPreferences: { preload: STUB, contextIsolation: false, sandbox: false, offscreen: true } });
    const errors: string[] = [];
    w.webContents.on('console-message', (e) => { const x = e as unknown as { message?: string; level?: string }; if (x.level === 'error') errors.push(String(x.message)); });
    await w.loadURL(`${pages.origin}/bubble.html`);
    await wait(600);
    const js = <T = unknown>(s: string) => w.webContents.executeJavaScript(s, true) as Promise<T>;
    await js(`window.__fire('onAim', { x: 700, y: 700, flip: false }); true`);
    await wait(150);
    const look = () => js<{ hidden: boolean; leaving: boolean; text: string; empty: boolean; card: string; pins: boolean; cockpit: boolean }>(`(() => {
      const b = document.getElementById('bubble'), text = b.hidden ? '' : b.innerText.replace(/\\s+/g, ' ').trim(), leaving = b.classList.contains('leaving');
      const pin = document.querySelector('#ckpins .pin'), pinsEl = document.getElementById('ckpins');
      return { hidden: b.hidden, leaving, text: text.slice(0, 80), empty: !b.hidden && !leaving && !text, card: pin?.dataset.id ?? '',
        pins: !!pinsEl && !pinsEl.hidden && !!pin && pin.getClientRects().length > 0, cockpit: b.classList.contains('cockpit') };
    })()`);
    /** Samples every 40 ms for `ms`: the first empty frame seen, and the state at the end. */
    const watch = async (ms: number) => {
      let empty: unknown = null, last = await look();
      for (const t0 = Date.now(); Date.now() - t0 < ms;) { last = await look(); if (last.empty && !empty) empty = { ...last, ms: Date.now() - t0 }; await wait(40); }
      return { empty, last };
    };
    return { w, js, look, watch, errors };
  }

  // 1. The closed bubble speaking the card; answered in Claude: it folds away. With the mouse resting on it too.
  for (const [name, item] of [['permission', CPERM], ['question', CQ], ['plan', CPLAN]] as const) {
    for (const hover of [false, true]) {
      const label = `closed bubble, ${name}${hover ? ', mouse on it' : ''}`;
      const t = await open();
      await t.js(`${jobs}; ${list([item])}; true`);
      await wait(1300);
      const before = await t.look();
      check(`${label}: the card is up`, before.pins && before.card === item.id, before);
      if (hover) {
        const p = await t.js<{ x: number; y: number }>(`(() => { const r = document.getElementById('bubble').getBoundingClientRect(); return { x: Math.round(r.left + 40), y: Math.round(r.top + r.height / 2) }; })()`);
        t.w.webContents.sendInputEvent({ type: 'mouseMove', x: p.x, y: p.y }); await wait(400);
      }
      await t.js(`${list([])}; true`);
      const { empty, last } = await t.watch(1000);
      check(`${label}: never an empty frame`, !empty, empty ?? '');
      check(`${label}: gone within 1 s`, (last.hidden || last.leaving) && !last.pins, last);
      check(`${label}: no page errors`, !t.errors.length, t.errors.slice(0, 3).join(' | '));
      t.w.destroy();
    }
  }

  // 2. The open cockpit with the question pinned: the pin goes, the cockpit stays open.
  {
    const t = await open();
    await t.js(`window.__fire('onCockpit', { open: true, state: { maxH: 600 } }); ${jobs}; ${list([CQ])}; true`);
    await wait(1000);
    const before = await t.look();
    check('cockpit: the question is pinned', before.cockpit && before.pins && before.card === CQ.id, before);
    await t.js(`${list([])}; true`);
    const { last } = await t.watch(600);
    check('cockpit: the pinned question goes, the cockpit stays', last.cockpit && !last.pins && !last.hidden, last);
    check('cockpit: no page errors', !t.errors.length, t.errors.slice(0, 3).join(' | '));
    t.w.destroy();
  }

  // 3. Two waiting: only the answered one goes; the other is still there to answer.
  {
    const t = await open();
    await t.js(`${jobs}; ${list([CPERM, CQ])}; true`);
    await wait(1300);
    const before = await t.look();
    check('two waiting: the first is shown', before.pins && before.card === CPERM.id, before);
    await t.js(`${list([CQ])}; true`);
    const { empty, last } = await t.watch(800);
    check('two waiting: the answered one goes, the other is shown, no empty frame', !empty && last.pins && last.card === CQ.id && !last.hidden, { empty, last });
    t.w.destroy();
  }

  // 4. Listed while he was in Claude (quiet: parked, nothing popped up), answered there: still nothing, nothing left
  //    parked for the next open.
  {
    const t = await open();
    await t.js(`${jobs}; ${list([CQ], true)}; true`);
    await wait(800);
    const quiet = await t.look();
    check('in Claude: nothing pops up', quiet.hidden, quiet);
    await t.js(`${list([], true)}; true`);
    await wait(300);
    await t.js(`window.__fire('onCockpit', { open: true, state: { maxH: 600 } }); true`);
    await wait(600);
    const opened = await t.look();
    check('in Claude, answered there: opening Aang later pins nothing', opened.cockpit && !opened.pins, opened);
    t.w.destroy();
  }

  pages.close();
  console.log(bad ? `${bad} FAILED` : 'ALL PASS');
  setTimeout(() => app.exit(bad ? 1 : 0), 200);
}).catch((e) => { console.log('HARNESS ERROR ' + String(e?.stack ?? e)); app.exit(2); });
