// The job digest (2026-10-14): through the real connector, a job list comes back as his skill's own filter would show it:
// new matches in short lines, near misses, counts of the rest, the full list in a file; and a second look shows nothing
// new. www.linkedin.com is pointed at a local test page.
//
// Run: npx electron test/electron/digest-check.ts
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

const SITE = 47915, DOOR = 47916;
app.commandLine.appendSwitch('host-resolver-rules', `MAP www.linkedin.com 127.0.0.1:${SITE}`);
process.on('uncaughtException', (e) => { console.log('HARNESS NOTE ' + String((e as Error).message).split('\n')[0]); });
process.on('unhandledRejection', (e) => { console.log('HARNESS REJECTION ' + String((e as Error)?.stack ?? e)); app.exit(2); });
setTimeout(() => { console.log('HARNESS TIMEOUT'); app.exit(3); }, 150_000).unref();
app.on('window-all-closed', () => { /* the test decides */ });
const HERE = path.dirname(fileURLToPath(import.meta.url));
BrowserWindow.prototype.show = function (this: BrowserWindow) { this.setPosition(-6000, 100); this.showInactive(); };
BrowserWindow.prototype.focus = function () { /* not in a test */ };
let bad = 0;
const check = (what: string, ok: boolean, d = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${what}${d ? '  -- ' + d.replace(/\s+/g, ' ').slice(0, 240) : ''}`); if (!ok) bad++; };
const card = (t: string, c: string, l: string) => `<div>${t}</div><div>${t}</div><div>${c}</div><div>${l}</div><div>CA$85K/yr</div><div>1 day ago</div>`;
const PAGE = `<!doctype html><meta charset="utf-8"><title>Jobs | LinkedIn</title><body><main><h1>Jobs</h1>
${card('Customer Success Manager', 'Acme', 'Toronto, ON (Hybrid)')}${card('Senior Customer Success Manager', 'Big Co', 'Toronto, ON')}
${card('Client Partner', 'Northwind', 'Toronto, ON (Remote)')}${card('Onboarding Specialist', 'Westco', 'Vancouver, BC')}</main></body>`;

app.whenReady().then(async () => {
  (screen as any).getCursorScreenPoint = () => ({ x: -20000, y: 500 });
  const titles = ['Senior Account Executive', 'Software Engineer', 'Store Manager', 'Data Analyst', 'Warehouse Associate', 'Director of Sales', 'Sales Rep', 'Payroll Clerk', 'Line Cook', 'Nurse'];
  const BIG = `<!doctype html><meta charset="utf-8"><title>Jobs | LinkedIn</title><body><main>${Array.from({ length: 40 }, (_, i) => card(i % 13 === 0 ? `Implementation Specialist ${i}` : `${titles[i % titles.length]} ${i}`, `Company number ${i}`, 'Toronto, Ontario, Canada (Hybrid)')).join('')}</main></body>`;
  const site = http.createServer((q, r) => r.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }).end(String(q.url).includes('big') ? BIG : PAGE));
  await new Promise<void>((r) => site.listen(SITE, '127.0.0.1', () => r()));
  const pages = await servePages(path.join(HERE, '..', '..', 'pages'));
  const state = mkdtempSync(path.join(os.tmpdir(), 'dig-'));
  const data = mkdtempSync(path.join(os.tmpdir(), 'jobdata-'));
  const b = new AangBrowser({ origin: pages.origin, stateDir: state, preloadPath: path.join(HERE, '..', '..', 'src', 'preload.cjs'),
    tabPreloadPath: path.join(HERE, '..', '..', 'src', 'tabpreload.cjs'), settingsPreloadPath: path.join(HERE, '..', '..', 'src', 'settingspreload.cjs'), thingsPreloadPath: path.join(HERE, '..', '..', 'src', 'thingspreload.cjs') });
  process.env.JOB_HUNT_DATA = data;
  const door = startClaudeDoor(() => b, state, DOOR);
  await new Promise((r) => setTimeout(r, 300));
  const mcp = spawn(process.platform === 'win32' ? 'node.exe' : 'node', [path.join(HERE, '..', '..', 'src', 'claude-door-mcp.mjs')], { env: { ...process.env, AANG_DOOR_FILE: path.join(state, 'claude-door.json') }, stdio: ['pipe', 'pipe', 'inherit'] });
  const waiting = new Map<number, (m: any) => void>();
  readline.createInterface({ input: mcp.stdout! }).on('line', (l) => { try { const m = JSON.parse(l); waiting.get(m.id)?.(m); } catch { /* not ours */ } });
  let seq = 0;
  const rpc = (method: string, params: unknown = {}) => new Promise<any>((done) => { const id = ++seq; waiting.set(id, done); mcp.stdin!.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n'); });
  const tool = async (name: string, args: unknown) => { const r = await rpc('tools/call', { name, arguments: args }); return { text: String(r.result?.content?.map((c: any) => c.text ?? '').join(' ') ?? ''), err: r.result?.isError === true }; };
  await rpc('initialize', { protocolVersion: '2025-06-18', clientInfo: { name: 'test' } });

  const o = await tool('browser_open', { url: `http://www.linkedin.com:${SITE}/jobs/search-results/?keywords=x`, task: 'Job scan' });
  const page = Number(/page (\d+)/.exec(o.text)?.[1]);
  const first = await tool('browser_jobs', { page });
  const matches = (/NEW MATCHES \((\d+)\):\n([\s\S]*?)\n\nNEAR/.exec(first.text) ?? []);
  check('his filter: the matching job comes back in one short line', matches[1] === '1' && /^Customer Success Manager \| Acme \| Toronto, ON \(Hybrid\) \| CA\$85K\/yr \| 1 day ago$/m.test(matches[2] ?? ''), matches[2]);
  check('the odd title comes back as a near miss, so it is never lost', /NEAR MISSES[^\n]*\n[^\n]*Client Partner/.test(first.text));
  check('Senior and Vancouver are counted, not listed', /1 skipped by his skip list, 1 outside his area/.test(first.text) && !/Senior Customer|Westco/.test(first.text), (/[^\n]*postings[^\n]*/.exec(first.text) ?? [''])[0]);
  const file = /Full list: (\S+\.json)/.exec(first.text)?.[1] ?? '';
  const saved = file ? JSON.parse(readFileSync(file, 'utf8')) : null;
  check('the full list, all four, is in a file in his job-hunt folder', !!saved && saved.all.length === 4 && file.startsWith(data), file);
  const second = await tool('browser_jobs', { page });
  check('a second look shows nothing new', /4 postings, 0 new \(4 seen before\)/.test(second.text), (/[^\n]*postings[^\n]*/.exec(second.text) ?? [''])[0]);
  const o2 = await tool('browser_open', { url: `http://www.linkedin.com:${SITE}/jobs/search-results/?keywords=big`, task: 'Job scan' });
  const big = await tool('browser_jobs', { page: Number(/page (\d+)/.exec(o2.text)?.[1]) });
  const bigFile = /Full list: (\S+\.json)/.exec(big.text)?.[1] ?? '';
  const raw = bigFile ? JSON.stringify(JSON.parse(readFileSync(bigFile, 'utf8')).all, null, 1).length : 0;
  check('on a real-sized list (40 jobs, 4 matches) the digest is a fraction of the raw list', big.text.length * 3 < raw && /4 match his lanes/.test(big.text), `${big.text.length} characters vs ${raw}`);

  mcp.kill(); door.close(); (b as any).closeAll(); site.close(); pages.close();
  console.log(bad ? `${bad} failed` : 'all passed');
  setTimeout(() => app.exit(bad ? 1 : 0), 500);
});
