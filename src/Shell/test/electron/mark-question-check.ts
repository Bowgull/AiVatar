// His report (2026-10-22 14:01): "Aang surfaced a question from Claude with his purple icon. I clicked it, nothing happened."
//
// What his logs showed: the pet saw four clicks on the purple mark (body.log "mark clicked: question"), and each time the
// bubble page drew the question card again (shell.log: shape 416x114 then 416x101, the card's own first-show pair), so
// between clicks the card had gone. No "pointer over" line after 13:06:24, when the Shell reloaded the bubble page for
// Aang's new pages. After that reload Electron forwarded mouse moves to the old page's window handle: the page never heard
// the pointer, never took the mouse, and his click on the card fell through as a click away, which put the card away.
// Clicking the mark brought it back, and so on. Fixed in bubble.ts (rearmMouse on every load + watchPointer, merged from
// fix/qa-notes-family); this check holds the mark-click path to it.
//
// The real Bubble window (bubble.ts) and page, wired the way main.ts wires them, AFTER the reload his Shell does: a Claude
// question waits, the pet's `mark.click` (through the brain) reaches the bubble exactly as main.ts sends it, the card
// shows; then his pointer and a real press on an option answer Claude (`claude.answer` out of the page); and a question
// answered in Claude instead (the brain's list goes empty) takes the card away. A press only reaches the page when the
// window has taken the mouse; otherwise it is a click away (as Windows delivers it, qa-real-input-check.ts's model).
//
// Off screen (x -6000), never focused, dialogs stubbed, every window closed, exits on any error or after 90 s.
// Run (from src/Shell): npx electron test/electron/mark-question-check.ts
import { app, BrowserWindow, dialog, ipcMain, screen } from 'electron';
import { mkdtempSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { servePages } from '../../src/pageserver.ts';
import { Bubble } from '../../src/bubble.ts';

dialog.showErrorBox = () => {};
const closeAll = () => { for (const w of BrowserWindow.getAllWindows()) try { w.destroy(); } catch { /* gone */ } };
const bail = (why: string, code: number) => { console.log(why); closeAll(); app.exit(code); };
process.on('uncaughtException', (e) => bail('HARNESS ERROR ' + String((e as Error)?.stack ?? e).split('\n').slice(0, 5).join(' | '), 2));
process.on('unhandledRejection', (e) => bail('HARNESS REJECTION ' + String((e as Error)?.stack ?? e).split('\n').slice(0, 5).join(' | '), 2));
setTimeout(() => bail('HARNESS TIMEOUT (90 s)', 3), 90_000).unref();
app.on('window-all-closed', () => {});
app.commandLine.appendSwitch('disable-features', 'CalculateNativeWinOcclusion');
app.commandLine.appendSwitch('disable-renderer-backgrounding');
app.setPath('userData', mkdtempSync(path.join(os.tmpdir(), 'mark-question-')));
const HERE = path.dirname(fileURLToPath(import.meta.url));
const SHELL = path.resolve(HERE, '..', '..');

// Never on his screens: anything asked onto a real screen goes 8000 px left.
const P = BrowserWindow.prototype;
const orig = { setBounds: P.setBounds, setPosition: P.setPosition, showInactive: P.showInactive };
const hits = (r: { x: number; y: number; width: number; height: number }) => screen.getAllDisplays().some((d) => { const b = d.bounds; return r.x < b.x + b.width && r.x + r.width > b.x && r.y < b.y + b.height && r.y + r.height > b.y; });
const off = (r: Electron.Rectangle) => hits(r) ? { ...r, x: r.x - 8000 } : r;
P.setBounds = function (this: BrowserWindow, r: Partial<Electron.Rectangle>, an?: boolean) { orig.setBounds.call(this, off({ ...this.getBounds(), ...r } as Electron.Rectangle), an); };
P.setPosition = function (this: BrowserWindow, x: number, y: number, an?: boolean) { const r = off({ ...this.getBounds(), x, y }); orig.setPosition.call(this, r.x, r.y, an); };
P.showInactive = function (this: BrowserWindow) { const b = this.getBounds(), r = off(b); if (r.x !== b.x) orig.setBounds.call(this, r); orig.showInactive.call(this); };
P.show = function (this: BrowserWindow) { this.showInactive(); };
P.focus = function () {};
P.moveTop = function () {};

let failed = 0;
const check = (step: string, ok: boolean, detail: unknown = '') => {
  if (!ok) failed++;
  const d = detail === '' ? '' : '  -- ' + String(typeof detail === 'string' ? detail : JSON.stringify(detail)).slice(0, 300);
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${step}${d}`);
};
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const until = async (fn: () => boolean | Promise<boolean>, ms = 3000) => { const end = Date.now() + ms; while (Date.now() < end) { if (await fn()) return true; await wait(50); } return fn(); };

const question = (id: string) => ({
  id, session: 's-aang', project: 'Aang', kind: 'question', tool: 'AskUserQuestion', canAlways: false, summary: '',
  questions: [{ question: 'Which fix should go in first?', header: 'Fix', multiSelect: false, options: [
    { label: 'The mark click', description: 'His purple question mark.' }, { label: 'The notes', description: 'The board.' }] }],
});

app.whenReady().then(async () => {
  const pages = await servePages(path.join(SHELL, 'pages'));
  let cursor = { x: -9999, y: -9999 };
  const bubble = new Bubble({ origin: pages.origin, preloadPath: path.join(SHELL, 'src', 'preload.cjs'), cursor: () => cursor });
  const bw = bubble.window()!;
  const BUB = { x: -5900, y: 900 };
  orig.setBounds.call(bw, { x: BUB.x, y: BUB.y, width: 560, height: 220 });
  const errors: string[] = [];
  bw.webContents.on('console-message', (e) => { const m = e as unknown as { message?: string; level?: string }; if (m.level === 'error') errors.push(String(m.message)); });
  const js = <T = any>(code: string): Promise<T> => bw.webContents.executeJavaScript(code, true);
  const mine = (e: Electron.IpcMainEvent) => e.sender === bw.webContents;
  const answers: any[] = [];
  // main.ts's doors for the bubble, as it wires them.
  ipcMain.on('bubble:size', (e, s) => { if (!mine(e)) return; bw.setBounds({ x: BUB.x, y: BUB.y, width: Math.max(220, Math.round(Number(s?.width) || 0)), height: Math.max(80, Math.round(Number(s?.height) || 0)) }); bubble.show(); });
  ipcMain.on('bubble:clickable', (e, on) => { if (mine(e)) bubble.setClickable(on === true); });
  ipcMain.on('bubble:hidden', (e) => { if (mine(e)) { bubble.setClickable(false); bubble.hide(); } });
  ipcMain.on('bubble:recalled', (e, ok) => { if (mine(e) && ok === true) bubble.show(); });
  ipcMain.on('bubble:claude', (e, m) => { if (mine(e)) answers.push(m); });
  const toBubble = (m: unknown) => bubble.send('brain:message', m);
  const clickable = () => (bubble as unknown as { clickable: boolean }).clickable;
  const shown = () => js<boolean>(`!document.getElementById('bubble').hidden && !document.getElementById('bubble').classList.contains('leaving')`);
  const cardUp = () => js<boolean>(`!document.getElementById('ckpins').hidden && !!document.querySelector('#ckpins .pin[data-kind]') && document.querySelectorAll('#ckpins .opt').length >= 2`);
  const at = (sel: string) => js<{ x: number; y: number } | null>(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e) return null; const r = e.getBoundingClientRect(); if (!r.width || !r.height) return null; return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) }; })()`);
  const scr = (p: { x: number; y: number }) => { const c = bw.getContentBounds(); return { x: c.x + p.x, y: c.y + p.y }; };
  /** His click as Windows delivers it: the pointer first; the press reaches the page only if the window took the mouse. */
  async function realClick(sel: string): Promise<'ok' | 'through' | 'missing'> {
    const p = await at(sel);
    if (!p) return 'missing';
    cursor = scr(p);
    await until(() => clickable(), 600);
    if (!clickable()) { bubble.send('bubble:dismiss', 'outside'); await wait(300); return 'through'; }
    const g = scr(p);
    const ev = (type: 'mouseMove' | 'mouseDown' | 'mouseUp') => bw.webContents.sendInputEvent({ type, x: p.x, y: p.y, globalX: g.x, globalY: g.y, button: 'left', clickCount: 1 } as Electron.MouseInputEvent);
    ev('mouseMove'); await wait(30); ev('mouseDown'); await wait(50); ev('mouseUp'); await wait(250);
    return 'ok';
  }
  /** The pet's click on the mark: the brain passes it on as `mark.click`, and main.ts hands it to the bubble as is. */
  const markClick = () => toBubble({ t: 'mark.click', sessions: [{ project: 'Aang', phase: 'waiting', what: 'Which fix should go in first?', source: 'link' }] });

  await until(() => !bw.webContents.isLoading(), 5000);
  // The reload his Shell did at 13:06 (main.ts freshen: Aang came back with new pages).
  bw.webContents.reloadIgnoringCache();
  await until(() => !bw.webContents.isLoading(), 5000);
  await wait(600);

  // 1. A Claude question surfaces while he is in another window, then he clicks it away (the mark stays purple).
  toBubble({ t: 'claude.wait', items: [question('w-1')] });
  check('a Claude question surfaces as its card', await until(async () => (await shown()) && (await cardUp()), 2000));
  bubble.send('bubble:dismiss', 'outside');
  check('a click away puts the card away', await until(async () => !(await shown()), 2000));

  // 2. His click on the purple mark brings the card back, and it stays.
  markClick();
  check('the mark click brings the question card back', await until(async () => (await shown()) && (await cardUp()), 2000));
  await wait(1600);
  check('the card is still up 1.6 s later (not shown and closed at once)', (await shown()) && (await cardUp()));

  // 3. Sheet 64: the options come only once his pointer rests on the card for 1.5 s. After the reload this never happened
  // (the page never heard the pointer), so he saw a question with no options, and his click on it fell through.
  check('before he points at it, the options wait (sheet 64 hover keys)', (await at('#ckpins .opt')) === null);
  const q = await at('#ckpins .q');
  if (q) cursor = scr(q);
  check('his pointer on the card makes the bubble take the mouse', await until(() => clickable(), 600));
  check('after resting 1.5 s the options come', await until(async () => (await at('#ckpins .opt')) !== null, 2500));
  await wait(450);   // the arrival guard (kguard) is over
  // A real press on the first option answers Claude.
  const r = await realClick('#ckpins .opt');
  await until(() => answers.length > 0, 1500);
  const a = answers.at(-1);
  check('a real click on an option reaches the page (not a click-through)', r === 'ok', { r, clickable: clickable() });
  check('it answers Claude with that option (claude.answer)', a?.t === 'claude.answer' && a?.id === 'w-1' && a?.answers?.['Which fix should go in first?'] === 'The mark click', a);
  toBubble({ t: 'claude.wait', items: [] });
  check('answered: the card leaves and the bubble goes', await until(async () => !(await shown()), 2500));

  // 4. A question answered in Claude itself: the brain's list empties, the card goes from the bubble.
  cursor = { x: -9999, y: -9999 };
  toBubble({ t: 'claude.wait', items: [question('w-2')] });
  bubble.send('bubble:dismiss', 'outside');
  await until(async () => !(await shown()), 2000);
  markClick();
  await until(async () => (await shown()) && (await cardUp()), 2000);
  const n0 = answers.length;
  toBubble({ t: 'claude.wait', items: [] });
  check('answered in Claude instead: the card clears from the bubble', await until(async () => !(await shown()), 2500) && answers.length === n0);

  check('no page errors', !errors.length, errors.join(' | '));
  console.log(failed ? `${failed} FAILED` : 'ALL PASS');
  closeAll();
  app.exit(failed ? 1 : 0);
});
