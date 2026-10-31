// Samara restarting under a Claude job (2026-10-31: an update restarted it mid-application, and the Claude chat was
// locked out for good). A real Samara and its door, the real connector, a plan and a page; then Samara closes and a new
// one starts on the same folder with a new key, as an update does. The chat must be told plainly and start again.
//
// Run: npx electron test/electron/restart-check.ts
import { app, BrowserWindow, screen } from 'electron';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';
import { servePages } from '../../src/pageserver.ts';
import { AangBrowser } from '../../src/browser.ts';
import { startClaudeDoor } from '../../src/claudedoor.ts';

process.on('uncaughtException', (e) => { console.log('HARNESS NOTE ' + String((e as Error).message).split('\n')[0]); });
process.on('unhandledRejection', (e) => { console.log('HARNESS REJECTION ' + String((e as Error)?.stack ?? e)); app.exit(2); });
setTimeout(() => { console.log('HARNESS TIMEOUT'); app.exit(3); }, 120_000).unref();
app.on('window-all-closed', () => { /* the test decides */ });
const HERE = path.dirname(fileURLToPath(import.meta.url));
BrowserWindow.prototype.show = function (this: BrowserWindow) { this.setPosition(-6000, 100); this.showInactive(); };
BrowserWindow.prototype.focus = function () { /* not in a test */ };
let bad = 0;
const check = (what: string, ok: boolean, d = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${what}${d ? '  -- ' + d.replace(/\s+/g, ' ').slice(0, 240) : ''}`); if (!ok) bad++; };
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const PORT = 47933;

app.whenReady().then(async () => {
  (screen as any).getCursorScreenPoint = () => ({ x: -20000, y: 500 });
  const site = http.createServer((q, r) => r.writeHead(200, { 'Content-Type': 'text/html' }).end('<!doctype html><title>Apply - Northwind</title><body><h1>Account Manager</h1><input aria-label="Full name"></body>'));
  await new Promise<void>((r) => site.listen(0, '127.0.0.1', () => r()));
  const host = `127.0.0.1:${(site.address() as any).port}`, url = `http://${host}/apply`;
  const pages = await servePages(path.join(HERE, '..', '..', 'pages'));
  const state = mkdtempSync(path.join(os.tmpdir(), 'restart-'));
  // One Samara: its browser and its door. His OKs are answered yes, as he would.
  const samara = () => {
    const b = new AangBrowser({ origin: pages.origin, stateDir: state, preloadPath: path.join(HERE, '..', '..', 'src', 'preload.cjs'),
      tabPreloadPath: path.join(HERE, '..', '..', 'src', 'tabpreload.cjs'), settingsPreloadPath: path.join(HERE, '..', '..', 'src', 'settingspreload.cjs'), thingsPreloadPath: path.join(HERE, '..', '..', 'src', 'thingspreload.cjs'), testLocal: true }) as any;
    const ask = b.askForClaude.bind(b); b.askForClaude = async (w: string) => (/^use Samara/.test(w) ? true : ask(w));
    b.askPlan = async (c: any) => ({ go: true, keep: c.sites.map((s: any) => s.site), note: '' });
    return { b, door: startClaudeDoor(() => b, state, PORT) };
  };
  let s = samara();
  await wait(300);
  const key1 = JSON.parse(readFileSync(path.join(state, 'claude-door.json'), 'utf8')).key;

  const mcp = spawn(process.platform === 'win32' ? 'node.exe' : 'node', [path.join(HERE, '..', '..', 'src', 'claude-door-mcp.mjs')], { env: { ...process.env, AANG_DOOR_FILE: path.join(state, 'claude-door.json') }, stdio: ['pipe', 'pipe', 'inherit'] });
  const waiting = new Map<number, (m: any) => void>();
  readline.createInterface({ input: mcp.stdout! }).on('line', (l) => { try { const m = JSON.parse(l); waiting.get(m.id)?.(m); } catch { /* not ours */ } });
  let seq = 0;
  const rpc = (method: string, params: unknown = {}) => new Promise<any>((done) => { const id = ++seq; waiting.set(id, done); mcp.stdin!.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n'); });
  const tool = async (name: string, args: unknown) => { const r = await rpc('tools/call', { name, arguments: args }); return { text: String(r.result?.content?.map((c: any) => c.text ?? '').join(' ') ?? ''), err: r.result?.isError === true }; };
  await rpc('initialize', { protocolVersion: '2025-06-18', clientInfo: { name: 'claude-code' } });

  const PLAN = { task: 'Apply Northwind', sites: [host], steps: ['Fill the form'] };
  const p1 = await tool('browser_plan', PLAN);
  check('a plan starts', !p1.err && /allowed the plan/.test(p1.text), p1.text);
  const o1 = await tool('browser_open', { url, task: 'Apply Northwind' });
  const page = Number(/page (\d+)/i.exec(o1.text)?.[1]);
  check('a page opens', !o1.err && Number.isInteger(page), o1.text);

  // The restart, as an update does it: this Samara closes, a new one starts on the same folder.
  await new Promise<void>((r) => s.door.close(() => r()));
  for (const w of BrowserWindow.getAllWindows()) w.destroy();
  s = samara();
  await wait(400);
  const key2 = JSON.parse(readFileSync(path.join(state, 'claude-door.json'), 'utf8')).key;
  check('the new Samara has a new door key', key2 !== key1);

  const r1 = await tool('browser_read', { page });
  check('the next step says plainly that Samara restarted', r1.err && /Samara restarted/.test(r1.text) && /browser_plan again/.test(r1.text), r1.text);
  const tabs = await tool('browser_tabs', {});
  check('his tabs can be asked for again, not "not a page this session opened"', !/not a page this Claude session opened/.test(tabs.text), tabs.text);
  const p2 = await tool('browser_plan', PLAN);
  check('a new plan works in the same chat (never "already has a plan running")', !p2.err && /allowed the plan|allowed before: go/.test(p2.text), p2.text);
  const o2 = await tool('browser_open', { url, task: 'Apply Northwind' });
  check('the page opens again', !o2.err && /page \d+/i.test(o2.text), o2.text);
  const r2 = await tool('browser_read', { page: Number(/page (\d+)/i.exec(o2.text)?.[1]) });
  check('and Claude carries on in it', !r2.err && /Account Manager/.test(r2.text), r2.text.slice(0, 200));

  console.log(bad ? `${bad} FAILED` : 'ALL PASS');
  mcp.kill(); site.close();
  app.exit(bad ? 1 : 0);
});
