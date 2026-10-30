// The sessions engine (2026-10-30): a click on Claude's mark answers with the brain's one list (Core sessionlist.ts),
// now with each session's machine, sources and what it waits on. This holds the bubble to drawing exactly that list:
// the list is made by the brain's own claudeNow from a hook session, a Mac front desk job waiting on him and a PC
// session, and handed to the real bubble page as main.ts hands it (`mark.click`).
//
// Off screen (x -6000), never focused, dialogs stubbed, every window closed, exits on any error or after 60 s.
// Run (from src/Shell): the Electron binary with this file, under a time limit.
import { app, BrowserWindow, dialog, ipcMain, screen } from 'electron';
import { mkdtempSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { servePages } from '../../src/pageserver.ts';
import { Bubble } from '../../src/bubble.ts';
import { claudeNow } from '../../../Core/src/claudemark.ts';

dialog.showErrorBox = () => {};
const closeAll = () => { for (const w of BrowserWindow.getAllWindows()) try { w.destroy(); } catch { /* gone */ } };
const bail = (why: string, code: number) => { console.log(why); closeAll(); app.exit(code); };
process.on('uncaughtException', (e) => bail('HARNESS ERROR ' + String((e as Error)?.stack ?? e).split('\n').slice(0, 5).join(' | '), 2));
process.on('unhandledRejection', (e) => bail('HARNESS REJECTION ' + String((e as Error)?.stack ?? e).split('\n').slice(0, 5).join(' | '), 2));
setTimeout(() => bail('HARNESS TIMEOUT (60 s)', 3), 60_000).unref();
app.on('window-all-closed', () => {});
app.dock?.hide();
app.commandLine.appendSwitch('disable-renderer-backgrounding');
app.setPath('userData', mkdtempSync(path.join(os.tmpdir(), 'sessions-card-')));
const SHELL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

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
app.focus = () => {};

let failed = 0;
const check = (step: string, ok: boolean, detail: unknown = '') => {
  if (!ok) failed++;
  const d = detail === '' ? '' : '  -- ' + String(typeof detail === 'string' ? detail : JSON.stringify(detail)).slice(0, 300);
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${step}${d}`);
};
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const until = async (fn: () => boolean | Promise<boolean>, ms = 3000) => { const end = Date.now() + ms; while (Date.now() < end) { if (await fn()) return true; await wait(50); } return fn(); };

app.whenReady().then(async () => {
  const pages = await servePages(path.join(SHELL, 'pages'));
  const bubble = new Bubble({ origin: pages.origin, preloadPath: path.join(SHELL, 'src', 'preload.cjs'), cursor: () => ({ x: -9999, y: -9999 }) });
  const bw = bubble.window()!;
  bw.setFocusable(false);
  const BUB = { x: -5900, y: 900 };
  orig.setBounds.call(bw, { x: BUB.x, y: BUB.y, width: 560, height: 220 });
  const errors: string[] = [];
  bw.webContents.on('console-message', (e) => { const m = e as unknown as { message?: string; level?: string }; if (m.level === 'error') errors.push(String(m.message)); });
  const js = <T = any>(code: string): Promise<T> => bw.webContents.executeJavaScript(code, true);
  const mine = (e: Electron.IpcMainEvent) => e.sender === bw.webContents;
  ipcMain.on('bubble:size', (e, s) => { if (!mine(e)) return; bw.setBounds({ x: BUB.x, y: BUB.y, width: Math.max(220, Math.round(Number(s?.width) || 0)), height: Math.max(80, Math.round(Number(s?.height) || 0)) }); bubble.show(); });
  ipcMain.on('bubble:hidden', (e) => { if (mine(e)) bubble.hide(); });
  ipcMain.on('bubble:recalled', (e, ok) => { if (mine(e) && ok === true) bubble.show(); });
  const toBubble = (m: unknown) => bubble.send('brain:message', m);
  const text = () => js<string>(`document.getElementById('bubble').innerText`);
  const keys = () => js<string[]>(`[...document.querySelectorAll('button.key')].filter(b => !b.closest('[hidden]')).map(b => b.firstChild ? String(b.firstChild.textContent).trim() : '')`);

  await until(() => !bw.webContents.isLoading(), 5000);
  await wait(500);

  // The brain's list, made by the brain's own code (a PC brain, so the Mac rows carry the MacBook key).
  const now = Date.now();
  const st = claudeNow({ now, here: 'pc', jobs: [], waits: [],
    hooks: [{ id: 'h1', project: 'Waymark', phase: 'working', changedAt: now, prompt: 'fix the build', waitingFor: '' }],
    desk: [{ session: 'd1', cwd: '/Users/x/Aang Jobs/report', title: 'Weekly report', at: now, updatedAt: now, state: 'waiting', last: 'it wants to run Bash' }] });
  check('the brain lists both, waiting first', st.sessions.map(s => `${s.project}:${s.phase}:${s.machine}`).join(',') === 'Weekly report:waiting:mac,Waymark:working:pc', st.sessions);
  toBubble({ t: 'mark.click', sessions: st.sessions.slice(0, 4) });
  const shownOk = await until(async () => /Weekly report/.test(await text()), 3000);
  const t = await text();
  check('the card names the desk job and what it waits for', shownOk && /Weekly report\s*is waiting on you: it wants to run Bash/.test(t), t);
  check('and the hook session with its prompt', /Waymark\s*is working on .fix the build./.test(t), t);
  const k = await keys();
  check('one key per machine: Open in Claude (PC) and Open on the MacBook', k.includes('Open in Claude') && k.includes('Open on the MacBook'), k);

  // He answered the desk job on his phone: the next click lists only what is left.
  const later = claudeNow({ now, here: 'pc', jobs: [], waits: [],
    hooks: [{ id: 'h1', project: 'Waymark', phase: 'working', changedAt: now, prompt: 'fix the build', waitingFor: '' }],
    desk: [{ session: 'd1', cwd: '/x', title: 'Weekly report', at: now, updatedAt: now, state: 'done' }] });
  toBubble({ t: 'mark.click', sessions: later.sessions.slice(0, 4) });
  await until(async () => !/Weekly report/.test(await text()), 3000);
  const t2 = await text();
  check('answered elsewhere: the next click lists only what is left', !/Weekly report/.test(t2) && /Waymark/.test(t2), t2);

  check('no page errors', !errors.length, errors.join(' | '));
  console.log(failed ? `${failed} FAILED` : 'ALL PASS');
  closeAll();
  app.exit(failed ? 1 : 0);
});
