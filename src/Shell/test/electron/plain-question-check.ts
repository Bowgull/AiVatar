// 2026-10-22, his words: "surface questions that drive the session".
//
// bubble.html as it ships, fed as main.ts feeds it (through the test preload). A Claude session ended its turn on a
// plain question; the brain listed it as a QUESTION card (reply: true). With REAL input (mouse and keys sent to the
// page, never the OS):
//   1. the card wears sheet 64's look: the QUESTION tag, "Claude · Waymark", the question; its keys wait for the 1.5 s
//      rest, then a click on "Yes" sends exactly that answer for that card;
//   2. "Reply…" opens a small box inside the card, asks for the keyboard, keeps what he typed through a redraw, and
//      Enter sends his words (the keyboard handed back);
//   3. Esc puts the box away again, nothing sent.
//
// Off screen, never focused, no clipboard. Errors exit, never a dialog; every window is closed.
// Run (from src/Shell): npx electron test/electron/plain-question-check.ts
import { app, BrowserWindow, dialog } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { servePages } from '../../src/pageserver.ts';

dialog.showErrorBox = (t: string, c: string) => { console.log('HARNESS DIALOG ' + t + ' ' + c); };
process.on('uncaughtException', (e) => { console.log('HARNESS ERROR ' + String((e as Error)?.stack ?? e)); app.exit(2); });
process.on('unhandledRejection', (e) => { console.log('HARNESS REJECTION ' + String((e as Error)?.stack ?? e)); app.exit(2); });
setTimeout(() => { console.log('HARNESS TIMEOUT'); app.exit(3); }, 90_000).unref();
app.on('window-all-closed', () => { /* the test decides */ });
const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, '..', '..', '..', '..');
const STUB = path.join(HERE, 'cockpit-stub.cjs');
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
let bad = 0;
const check = (what: string, ok: boolean, d: unknown = '') => { const s = typeof d === 'string' ? d : JSON.stringify(d); console.log(`${ok ? 'PASS' : 'FAIL'}  ${what}${s ? '  -- ' + s.slice(0, 300) : ''}`); if (!ok) bad++; };

const W = 940, H = 900;
const JOB = { id: 's-waymark', machine: 'pc', project: 'Waymark', phase: 'idle', startedAt: Date.now() - 60000, prompt: 'Fix the route list', tasks: [], current: '', percent: null, etaMs: null, usage: null, open: 'claude://claude.ai/epitaxy/s-waymark', held: 0 };
const Q = 'Want me to restart the dev server?';
const CARD = { id: 'pq-1', session: 's-waymark', project: 'Waymark', kind: 'question', tool: '', summary: Q, input: '', canAlways: false, reply: true,
  questions: [{ question: Q, options: [{ label: 'Yes' }, { label: 'No' }] }] };
const list = (items: unknown[]) => `window.__deliver({ t: 'claude.wait', items: ${JSON.stringify(items)} })`;
const jobs = `window.__deliver({ t: 'claude.jobs', jobs: [${JSON.stringify(JOB)}] })`;

const windows: BrowserWindow[] = [];
app.whenReady().then(async () => {
  const pages = await servePages(path.join(ROOT, 'src', 'Shell', 'pages'));
  async function open() {
    const w = new BrowserWindow({ width: W, height: H, show: false, frame: false, useContentSize: true,
      webPreferences: { preload: STUB, contextIsolation: false, sandbox: false, offscreen: true } });
    windows.push(w);
    const errors: string[] = [];
    w.webContents.on('console-message', (e) => { const x = e as unknown as { message?: string; level?: string }; if (x.level === 'error') errors.push(String(x.message)); });
    await w.loadURL(`${pages.origin}/bubble.html`);
    await wait(600);
    const js = <T = unknown>(s: string) => w.webContents.executeJavaScript(s, true) as Promise<T>;
    await js(`window.__fire('onAim', { x: 700, y: 700, flip: false }); true`);
    await wait(150);
    /** The centre of the first element matching `sel` (optionally with this text), or null when it is not drawn. */
    const at = (sel: string, text = '') => js<{ x: number; y: number } | null>(`(() => {
      const e = [...document.querySelectorAll(${JSON.stringify(sel)})].find((x) => !${JSON.stringify(text)} || x.textContent.includes(${JSON.stringify(text)}));
      if (!e || !e.getClientRects().length) return null; const r = e.getBoundingClientRect();
      return r.width && r.height ? { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) } : null; })()`);
    const move = (p: { x: number; y: number }) => w.webContents.sendInputEvent({ type: 'mouseMove', x: p.x, y: p.y });
    const click = async (p: { x: number; y: number }) => {
      move(p); await wait(40);
      w.webContents.sendInputEvent({ type: 'mouseDown', x: p.x, y: p.y, button: 'left', clickCount: 1 });
      w.webContents.sendInputEvent({ type: 'mouseUp', x: p.x, y: p.y, button: 'left', clickCount: 1 });
      await wait(120);
    };
    const type = async (text: string) => { for (const ch of text) { w.webContents.sendInputEvent({ type: 'char', keyCode: ch }); await wait(10); } };
    const key = async (k: string) => { w.webContents.sendInputEvent({ type: 'keyDown', keyCode: k }); w.webContents.sendInputEvent({ type: 'keyUp', keyCode: k }); await wait(120); };
    const sent = () => js<[string, unknown[]][]>(`window.__sent.map(([k, a]) => { try { return [k, JSON.parse(JSON.stringify(a ?? []))]; } catch { return [k, []]; } })`);
    const answers = async () => (await sent()).filter(([k, a]) => k === 'claude' && (a[0] as { t?: string })?.t === 'claude.answer').map(([, a]) => a[0]);
    const typing = async () => (await sent()).filter(([k]) => k === 'bubbleTyping').map(([, a]) => a[0]);
    /** Up, with the mouse resting on it until the keys come. */
    const upAndRest = async () => {
      await js(`${jobs}; ${list([CARD])}; true`);
      await wait(1300);
      const b = await at('#bubble');
      if (b) move({ x: b.x, y: b.y });
      await wait(1900);
    };
    return { w, js, at, move, click, type, key, answers, typing, upAndRest, errors };
  }

  // 1. The look, the hover rule, and a key.
  {
    const t = await open();
    await t.js(`${jobs}; ${list([CARD])}; true`);
    await wait(1300);
    const look = await t.js<{ tag: string; who: string; q: string; kind: string; keys: boolean }>(`(() => {
      const b = document.getElementById('bubble'), pin = document.querySelector('#ckpins .pin');
      return { tag: pin?.querySelector('.ktag .kt')?.textContent ?? '', who: pin?.querySelector('.kwho.door')?.textContent ?? '', q: pin?.querySelector('p.q')?.textContent ?? '',
        kind: b.dataset.kind ?? '', keys: !!pin?.querySelector('.opts') && pin.querySelector('.opts').getClientRects().length > 0 }; })()`);
    check('the card: QUESTION tag, "Claude · Waymark", the question, the lavender kind', look.tag === 'Question' && look.who === 'Claude · Waymark' && look.q === Q && look.kind === 'question', look);
    check('its keys wait for the 1.5 s rest', !look.keys, look);
    const b = await t.at('#bubble');
    t.move(b!);
    await wait(1900);
    const yes = await t.at('#ckpins .opt', 'Yes'), reply = await t.at('#ckpins .opt', 'Reply');
    check('after the rest: Yes, No and Reply… are there', !!yes && !!reply && !!(await t.at('#ckpins .opt', 'No')));
    await wait(500);  // past the arrival guard
    await t.click(yes!);
    const a = await t.answers();
    check('a click on Yes sends exactly that answer for this card', a.length === 1 && JSON.stringify(a[0]) === JSON.stringify({ t: 'claude.answer', id: 'pq-1', answers: { [Q]: 'Yes' } }), a);
    check('no page errors', !t.errors.length, t.errors.slice(0, 3).join(' | '));
    t.w.destroy();
  }

  // 2. Reply…: the box inside the card, his words survive a redraw, Enter sends them.
  {
    const t = await open();
    await t.upAndRest();
    await wait(500);
    const reply = await t.at('#ckpins .opt', 'Reply');
    check('Reply… is a key', !!reply);
    if (reply) await t.click(reply);
    await wait(150);
    const box = await t.at('#ckpins .rbox');
    check('a small reply box opens inside the card', !!box && !!(await t.js(`!!document.querySelector('#bubble #ckpins .pin .rbox')`)));
    check('it asks for the keyboard', JSON.stringify(await t.typing()) === '[true]', await t.typing());
    check('the caret is in it', await t.js<boolean>(`document.activeElement?.classList?.contains('rbox') === true`));
    await t.type('restart it after the');
    // The plain words come in meanwhile: the card is redrawn, the box and his words stay.
    await t.js(`${list([{ ...CARD, plain: 'Claude wants to restart the test server.' }])}; true`);
    await wait(200);
    check('a redraw keeps the box and what he typed', await t.js<string>(`document.querySelector('#ckpins .rbox')?.value ?? ''`) === 'restart it after the');
    await t.js(`document.querySelector('#ckpins .rbox')?.focus(); true`);
    await t.type(' build');
    await t.key('Enter');
    const a = await t.answers();
    check('Enter sends his words for this card', a.length === 1 && JSON.stringify(a[0]) === JSON.stringify({ t: 'claude.answer', id: 'pq-1', answers: { [Q]: 'restart it after the build' } }), a);
    const ty = await t.typing();
    check('the keyboard is handed back', ty[ty.length - 1] === false, ty);
    check('no page errors', !t.errors.length, t.errors.slice(0, 3).join(' | '));
    t.w.destroy();
  }

  // 3. Esc puts the box away, nothing sent.
  {
    const t = await open();
    await t.upAndRest();
    await wait(500);
    const reply = await t.at('#ckpins .opt', 'Reply');
    if (reply) await t.click(reply);
    await wait(150);
    await t.type('nev');
    await t.key('Escape');
    check('Esc: the box goes, Reply… is back, nothing sent', !(await t.at('#ckpins .rbox')) && !!(await t.at('#ckpins .opt', 'Reply')) && (await t.answers()).length === 0);
    const ty = await t.typing();
    check('Esc: the keyboard is handed back', ty[ty.length - 1] === false, ty);
    check('no page errors', !t.errors.length, t.errors.slice(0, 3).join(' | '));
    t.w.destroy();
  }

  for (const w of windows) if (!w.isDestroyed()) w.destroy();
  pages.close();
  console.log(bad ? `${bad} FAILED` : 'ALL PASS');
  setTimeout(() => app.exit(bad ? 1 : 0), 200);
}).catch((e) => { console.log('HARNESS ERROR ' + String(e?.stack ?? e)); for (const w of windows) if (!w.isDestroyed()) w.destroy(); app.exit(2); });
