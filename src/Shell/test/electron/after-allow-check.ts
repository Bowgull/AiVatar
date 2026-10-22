// 2026-10-22 (his report: "once I hit Allow I saw this", a long EMPTY parchment frame beside Aang, only its tail).
//
// bubble.html as it ships, fed each kind of ask exactly as main.ts feeds it (through the test preload). For each: the
// mouse rests on the bubble until the keys come, then a real click (mouse down/up on the page, never his desktop) on a
// key, the main one and then the second one. From the click on, the bubble is sampled every 40 ms: it must never be a
// shown frame with nothing in it, and within 1 s it is either closed (or closing) or saying something. Then the mouse
// leaves, and the same must still hold 1.5 s later (a frame he cannot get rid of is the bug). Claude's asks run twice:
// with the brain's next list (the answered one gone) arriving 300 ms after the click, and with it not arriving.
//
// Off screen, never focused, no real input, never the clipboard. Errors exit, never a dialog.
// Run (from src/Shell): npx electron test/electron/after-allow-check.ts [--shots=<dir>]
import { app, BrowserWindow, dialog } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { servePages } from '../../src/pageserver.ts';

dialog.showErrorBox = (t: string, c: string) => { console.log('HARNESS DIALOG ' + t + ' ' + c); };
process.on('uncaughtException', (e) => { console.log('HARNESS ERROR ' + String((e as Error)?.stack ?? e)); app.exit(2); });
process.on('unhandledRejection', (e) => { console.log('HARNESS REJECTION ' + String((e as Error)?.stack ?? e)); app.exit(2); });
setTimeout(() => { console.log('HARNESS TIMEOUT'); app.exit(3); }, 240_000).unref();
app.on('window-all-closed', () => { /* the test decides */ });
const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, '..', '..', '..', '..');
const STUB = path.join(HERE, 'cockpit-stub.cjs');
const SHOTS = process.argv.find((a) => a.startsWith('--shots='))?.slice(8) ?? '';
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
let bad = 0;
const check = (what: string, ok: boolean, d: unknown = '') => { const s = typeof d === 'string' ? d : JSON.stringify(d); console.log(`${ok ? 'PASS' : 'FAIL'}  ${what}${s ? '  -- ' + s.slice(0, 300) : ''}`); if (!ok) bad++; };

const SPRITE = 'data:image/png;base64,' + readFileSync(path.join(ROOT, 'assets', 'aang', 'frames', 'idle_0.png')).toString('base64');
const W = 940, H = 900, fx = W - 300, fy = H - 240, head = { x: fx + 112, y: fy + 96 };

const JOB = { id: 's-waymark', machine: 'pc', project: 'Waymark', phase: 'working', startedAt: Date.now() - 60000, prompt: 'Build the route screen', tasks: [], current: '', percent: 40, etaMs: 60000, usage: null, open: 'claude://claude.ai/epitaxy/s-waymark', held: 0 };
const CPERM = { id: 'toolu_01perm', session: 's-waymark', project: 'Waymark', kind: 'permission', tool: 'Bash', summary: 'Waymark wants to run the route tests on this PC.', input: '{"command":"npm test -- routes"}', canAlways: true };
const CQ = { id: 'w-1', session: 's-waymark', project: 'Waymark', kind: 'question', tool: 'AskUserQuestion', canAlways: false, summary: '',
  questions: [{ question: 'Which layout should the map use?', header: 'Layout', multiSelect: false, options: [
    { label: 'Full-screen map', description: 'The map fills the screen.' }, { label: 'Split: map and list', description: 'Turns listed underneath.' }] }] };
const CPLAN = { id: 'toolu_09plan', session: 's-waymark', project: 'Waymark', kind: 'plan', tool: 'ExitPlanMode', summary: '', plain: 'Waymark has a plan for the route screen.',
  plan: '1. Add a grid for the map\n2. Wire the route list under it', canAlways: false };

type Case = { name: string; deliver: string; keys: string; follow?: string; hold?: boolean };
const aang = (m: unknown) => `window.__deliver(${JSON.stringify(m)})`;
const claudeAsk = (item: unknown) => `window.__deliver({ t: 'claude.jobs', jobs: [${JSON.stringify(JOB)}] }); window.__deliver({ t: 'claude.wait', items: [${JSON.stringify(item)}] })`;
const CLAUDE_KEYS = '#ckpins .ckeys button.key, #ckpins .opts .opt';
const CASES: Case[] = [
  { name: 'Aang OK', deliver: aang({ t: 'permission', id: 'p-1', question: 'Can I delete the 3 old build folders?', means: 'They take 2.1 GB.', exact: 'AangApp\\build: old-1, old-2, old-3' }), keys: '#asks button.key' },
  { name: 'Aang hold lever', deliver: aang({ t: 'permission', id: 'p-2', hold: true, question: 'Send the email to Sam?', means: 'It cannot be unsent.' }), keys: '#asks .lever, #asks button.key', hold: true },
  { name: 'Aang question', deliver: aang({ t: 'choice', id: 'c-1', question: 'What should I play?', options: [{ label: 'Lo-fi' }, { label: 'Ragnaros' }] }), keys: '#opts .opt' },
  { name: 'Aang plan', deliver: aang({ t: 'plan', id: 'pl-1', steps: ['Read the log', 'Fix the line'] }), keys: '#asks button.key' },
  { name: 'Aang backup offer', deliver: aang({ t: 'backup.ask', id: 'b-1', days: 4, changed: 12 }), keys: '#asks button.key' },
  { name: 'Claude OK', deliver: claudeAsk(CPERM), keys: CLAUDE_KEYS },
  { name: 'Claude OK, brain list follows', deliver: claudeAsk(CPERM), keys: CLAUDE_KEYS, follow: `window.__deliver({ t: 'claude.wait', items: [] })` },
  { name: 'Claude question', deliver: claudeAsk(CQ), keys: CLAUDE_KEYS },
  { name: 'Claude plan', deliver: claudeAsk(CPLAN), keys: CLAUDE_KEYS, follow: `window.__deliver({ t: 'claude.wait', items: [] })` },
];

app.whenReady().then(async () => {
  const pages = await servePages(path.join(ROOT, 'src', 'Shell', 'pages'));
  if (SHOTS) mkdirSync(SHOTS, { recursive: true });
  let shots = 0;
  const wins: BrowserWindow[] = [];

  async function open() {
    const w = new BrowserWindow({ width: W, height: H, show: false, frame: false, useContentSize: true,
      webPreferences: { preload: STUB, contextIsolation: false, sandbox: false, offscreen: true } });
    wins.push(w);
    const errors: string[] = [];
    w.webContents.on('console-message', (e) => { const x = e as unknown as { message?: string; level?: string }; if (x.level === 'error') errors.push(String(x.message)); });
    await w.loadURL(`${pages.origin}/bubble.html`);
    await wait(600);
    const js = <T = unknown>(s: string) => w.webContents.executeJavaScript(s, true) as Promise<T>;
    await js(`(() => { const st = new CSSStyleSheet(); st.replaceSync(${JSON.stringify(`html,body{background:#191b24 !important}.wrap{margin:0 ${W - (fx + 140)}px ${H - (fy + 46)}px 14px !important}.stg{position:fixed;pointer-events:none;image-rendering:pixelated}`)}); document.adoptedStyleSheets = [st];
      const i = document.createElement('img'); i.src = ${JSON.stringify(SPRITE)}; i.className = 'stg aang'; i.style.left = '${fx}px'; i.style.top = '${fy}px'; document.body.append(i);
      window.__fire('onAim', { x: ${head.x}, y: ${head.y}, flip: false }); return true; })()`);
    await wait(150);
    const move = async (x: number, y: number) => { w.webContents.sendInputEvent({ type: 'mouseMove', x, y }); await wait(30); };
    /** Shown, not on its way out, and nothing to read or see in it: the empty frame. */
    const look = () => js<{ hidden: boolean; leaving: boolean; text: string; w: number; h: number; empty: boolean }>(`(() => {
      const b = document.getElementById('bubble'), r = b.getBoundingClientRect();
      const text = b.hidden ? '' : b.innerText.replace(/\\s+/g, ' ').trim();
      const leaving = b.classList.contains('leaving');
      return { hidden: b.hidden, leaving, text: text.slice(0, 80), w: Math.round(r.width), h: Math.round(r.height), empty: !b.hidden && !leaving && !text };
    })()`);
    const shot = async (name: string) => {
      if (!SHOTS || shots >= 2) return;
      const r = await js<{ x: number; y: number; width: number; height: number }>(`(() => { const sk = document.getElementById('skin'), a = document.querySelector('.stg.aang');
        const rs = [a.getBoundingClientRect(), sk.getBoundingClientRect()].filter((q) => q.width > 0);
        const x0 = Math.max(0, Math.min(...rs.map((q) => q.left)) - 12), y0 = Math.max(0, Math.min(...rs.map((q) => q.top)) - 12);
        return { x: Math.floor(x0), y: Math.floor(y0), width: Math.ceil(Math.max(...rs.map((q) => q.right)) + 12 - x0), height: Math.ceil(Math.max(...rs.map((q) => q.bottom)) + 12 - y0) }; })()`);
      const img = await w.webContents.capturePage({ x: r.x, y: r.y, width: Math.min(W - r.x, r.width), height: Math.min(H - r.y, r.height) });
      writeFileSync(path.join(SHOTS, `allow-${name}.png`), img.toPNG()); shots++;
      console.log(`  picture allow-${name}.png ${JSON.stringify(img.getSize())}`);
    };
    return { w, js, move, look, shot, errors };
  }

  for (const c of CASES) {
    for (const which of [0, 1]) {
      const label = `${c.name}, ${which === 0 ? 'main key' : 'second key'}`;
      const t = await open();
      await t.js(`${c.deliver}; true`);
      await wait(1300);
      // Rest on the bubble until the keys come (sheet 64: 1.5 s).
      const p = await t.js<{ x: number; y: number }>(`(() => { const r = document.getElementById('bubble').getBoundingClientRect(); return { x: Math.round(r.left + 40), y: Math.round(r.top + r.height / 2) }; })()`);
      await t.move(p.x, p.y);
      await wait(2100);
      const k = await t.js<{ x: number; y: number; label: string } | null>(`(() => {
        const ks = [...document.querySelectorAll(${JSON.stringify(c.keys)})].filter((e) => e.getClientRects().length && getComputedStyle(e).visibility !== 'hidden');
        const e = ks[${which}]; if (!e) return null; const r = e.getBoundingClientRect();
        return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2), label: (e.firstChild?.textContent ?? e.textContent).trim() }; })()`);
      if (!k) { check(`${label}: the key is there`, false, await t.look()); t.w.destroy(); continue; }
      await t.move(k.x, k.y);
      await wait(700);                                 // past the keys' arrival guards
      const before = await t.look();
      check(`${label}: before the click the ask is up and readable`, !before.hidden && !!before.text, before);
      t.w.webContents.sendInputEvent({ type: 'mouseDown', x: k.x, y: k.y, button: 'left', clickCount: 1 });
      if (c.hold && which === 0) await wait(2600);     // the lever: held until its bar fills
      t.w.webContents.sendInputEvent({ type: 'mouseUp', x: k.x, y: k.y, button: 'left', clickCount: 1 });
      if (c.follow) setTimeout(() => { if (!t.w.isDestroyed()) void t.js(`${c.follow}; true`); }, 300);
      // From the click: never an empty frame; settled (closed or saying something) within 1 s.
      let empty: any = null, at1: any = null;
      for (let i = 0, t0 = Date.now(); Date.now() - t0 < 1500; i++) {
        const s = await t.look();
        if (s.empty && !empty) empty = { ...s, ms: Date.now() - t0 };
        // "Change it", "No, and...", "Something else": the bubble asks main for the typing area; main opens the cockpit.
        if (await t.js<boolean>(`(() => { const i = window.__sent.findIndex((x) => x[0] === 'dockBox'); if (i < 0) return false; window.__sent.splice(i, 1); return true; })()`)) await t.js(`window.__fire('onCockpit', { open: true, state: { maxH: 600 } }); true`);
        if (!at1 && Date.now() - t0 >= 1000) at1 = s;
        await wait(40);
      }
      if (empty) await t.shot(c.name.replace(/\W+/g, '-').toLowerCase());
      // He moves off: still never an empty frame left behind.
      await t.move(5, 5);
      await wait(1500);
      const off = await t.look();
      check(`${label} (${k.label}): never an empty frame after the click`, !empty, empty ?? '');
      check(`${label}: within 1 s closed or saying something`, !!at1 && (at1.hidden || at1.leaving || !!at1.text), at1);
      check(`${label}: after the mouse leaves, closed or saying something`, off.hidden || off.leaving || !!off.text, off);
      check(`${label}: no page errors`, !t.errors.length, t.errors.slice(0, 3).join(' | '));
      t.w.destroy();
    }
  }

  // One picture of the fixed state: a Claude OK allowed, the bubble on its way out.
  if (SHOTS && shots < 2) {
    const t = await open();
    await t.js(`${claudeAsk(CPERM)}; true`);
    await wait(1300);
    await t.shot('claude-ok-before');
    // Allow, then a picture 1 s on: nothing left beside him.
    await t.js(`document.querySelector('#ckpins .ckeys button.key.primary').click(); true`);
    await wait(1000);
    const s = await t.look();
    check('Claude OK clicked: closed 1 s on', s.hidden, s);
    await t.shot('claude-ok-after');
    t.w.destroy();
  }

  for (const w of wins) if (!w.isDestroyed()) w.destroy();
  pages.close();
  console.log(bad ? `${bad} FAILED` : 'ALL PASS');
  setTimeout(() => app.exit(bad ? 1 : 0), 200);
}).catch((e) => { console.log('HARNESS ERROR ' + String(e?.stack ?? e)); app.exit(2); });
