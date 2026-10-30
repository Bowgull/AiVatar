// Driver v2 (2026-10-14, his "I want everything"): through the real connector Claude Code starts, against a test page.
// Lasting numbers, states, hidden (shadow) components, a box opening, a button that does nothing, a dropdown, Escape,
// only-what-changed after a scroll, find, back, and a security-check page that closes that site for a day (the whole session only on his job sites).
//
// Run: npx electron test/electron/driver2-check.ts
import { app, BrowserWindow, screen } from 'electron';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';
import { servePages } from '../../src/pageserver.ts';
import { AangBrowser } from '../../src/browser.ts';
import { startClaudeDoor } from '../../src/claudedoor.ts';

process.on('uncaughtException', (e) => { console.log('HARNESS NOTE ' + String((e as Error).message).split('\n')[0]); });
process.on('unhandledRejection', (e) => { console.log('HARNESS REJECTION ' + String((e as Error)?.stack ?? e)); app.exit(2); });
setTimeout(() => { console.log('HARNESS TIMEOUT'); app.exit(3); }, 150_000).unref();
app.on('window-all-closed', () => { /* the test decides */ });
const HERE = path.dirname(fileURLToPath(import.meta.url));
BrowserWindow.prototype.show = function (this: BrowserWindow) { this.setPosition(-6000, 100); this.showInactive(); };
BrowserWindow.prototype.focus = function () { /* not in a test */ };
let bad = 0;
const check = (what: string, ok: boolean, d = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${what}${d ? '  -- ' + d.replace(/\s+/g, ' ').slice(0, 170) : ''}`); if (!ok) bad++; };
const PORT = 47912;
const rows = Array.from({ length: 60 }, (_, i) => `<li>Posting ${i + 1}: ${i === 47 ? 'UX Lead at Northwind' : 'Designer at Lumen'}</li>`).join('');
const APP = `<!doctype html><title>Jobs</title><body>
<h1>Jobs board</h1>
<label><input type="checkbox" id="remote"> Remote only</label>
<button id="open">Open details</button>
<button id="dead">Does nothing</button>
<label>Experience <select id="exp"><option>Junior</option><option>Mid</option><option>Senior</option></select></label>
<shadow-box></shadow-box>
<div role="dialog" aria-label="Job details" id="dlg" style="display:none"><h2>Job details</h2><p>Hybrid, 3 days in office</p></div>
<a href="/second">Next posting</a>
<ul>${rows}</ul>
<script>
customElements.define('shadow-box', class extends HTMLElement { connectedCallback() { const r = this.attachShadow({ mode: 'open' }); r.innerHTML = '<button aria-expanded="false">Show filters</button>'; const b = r.querySelector('button'); b.onclick = () => b.setAttribute('aria-expanded', 'true'); } });
document.getElementById('open').onclick = () => { document.getElementById('dlg').style.display = 'block'; };
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') document.getElementById('dlg').style.display = 'none'; });
</script></body>`;

app.whenReady().then(async () => {
  (screen as any).getCursorScreenPoint = () => ({ x: -20000, y: 500 });
  const site = http.createServer((q, r) => {
    const body = q.url === '/second' ? '<!doctype html><title>Second posting</title><body>UX Lead</body>'
      : q.url === '/check' ? '<!doctype html><title>Just a moment...</title><body>Checking your browser</body>' : APP;
    r.writeHead(200, { 'Content-Type': 'text/html' }).end(body);
  });
  await new Promise<void>((r) => site.listen(0, '127.0.0.1', () => r()));
  const base = `http://127.0.0.1:${(site.address() as any).port}`;
  const pages = await servePages(path.join(HERE, '..', '..', 'pages'));
  const state = mkdtempSync(path.join(os.tmpdir(), 'drv2-'));
  const b = new AangBrowser({ origin: pages.origin, stateDir: state, preloadPath: path.join(HERE, '..', '..', 'src', 'preload.cjs'),
    tabPreloadPath: path.join(HERE, '..', '..', 'src', 'tabpreload.cjs'), settingsPreloadPath: path.join(HERE, '..', '..', 'src', 'settingspreload.cjs'), thingsPreloadPath: path.join(HERE, '..', '..', 'src', 'thingspreload.cjs'), testLocal: true });
  // The test answers his one OK per Claude session (AI lockdown G11) as if he said yes.
  { const ask = (b as any).askForClaude.bind(b); (b as any).askForClaude = async (w: string) => (/^use Samara/.test(w) ? true : ask(w)); }
  const door = startClaudeDoor(() => b, state, PORT);
  await new Promise((r) => setTimeout(r, 300));
  const mcp = spawn(process.platform === 'win32' ? 'node.exe' : 'node', [path.join(HERE, '..', '..', 'src', 'claude-door-mcp.mjs')], { env: { ...process.env, AANG_DOOR_FILE: path.join(state, 'claude-door.json') }, stdio: ['pipe', 'pipe', 'inherit'] });
  const waiting = new Map<number, (m: any) => void>();
  readline.createInterface({ input: mcp.stdout! }).on('line', (l) => { try { const m = JSON.parse(l); waiting.get(m.id)?.(m); } catch { /* not ours */ } });
  let seq = 0;
  const rpc = (method: string, params: unknown = {}) => new Promise<any>((done) => { const id = ++seq; waiting.set(id, done); mcp.stdin!.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n'); });
  const tool = async (name: string, args: unknown) => { const r = await rpc('tools/call', { name, arguments: args }); return { text: String(r.result?.content?.map((c: any) => c.text ?? '').join(' ') ?? ''), err: r.result?.isError === true }; };
  await rpc('initialize', { protocolVersion: '2025-06-18', clientInfo: { name: 'test' } });
  const tools = (await rpc('tools/list')).result.tools.map((t: any) => t.name);
  check('the new tools are there', ['browser_find', 'browser_key', 'browser_select', 'browser_back', 'browser_forward'].every((t) => tools.includes(t)), tools.join(','));

  const o = await tool('browser_open', { url: base + '/' });
  const page = Number(/page (\d+)/.exec(o.text)?.[1]);
  const r1 = await tool('browser_read', { page });
  const num = (txt: string, label: string) => Number(new RegExp(`\\[(\\d+)\\][^\\n]*${label}`).exec(txt)?.[1]);
  check('a checkbox shows its state', /\{unchecked\}[^\n]*Remote only|Remote only/.test(r1.text) && /unchecked/.test(r1.text));
  check('a button inside a hidden (shadow) component is found, with its state', /\{collapsed\}: Show filters/.test(r1.text), (/[^\n]*Show filters[^\n]*/.exec(r1.text) ?? [''])[0]);
  const openN = num(r1.text, 'Open details');
  const r2 = await tool('browser_read', { page });
  check('numbers stay the same between reads', num(r2.text, 'Open details') === openN);

  const remote = num(r1.text, 'Remote only') || Number(/\[(\d+)\] button\/input \{unchecked/.exec(r1.text)?.[1]);
  const c1 = await tool('browser_click', { page, n: remote });
  check('a click says what changed: the box is now checked', /now checked/.test(c1.text), c1.text);
  const c2 = await tool('browser_click', { page, n: openN });
  check('a box opening is reported', /a box opened: "Job details"/.test(c2.text), c2.text);
  const k = await tool('browser_key', { page, key: 'Escape' });
  check('Escape closes it, and says so', /the box closed/.test(k.text), k.text);
  const c3 = await tool('browser_click', { page, n: num(r1.text, 'Does nothing') });
  check('a click that did nothing is called out, never reported as done', /nothing visible changed/.test(c3.text), c3.text);
  const sel = await tool('browser_select', { page, n: num(r1.text, 'Experience') || Number(/\[(\d+)\] select[^\n]*= "Junior"/.exec(r1.text)?.[1]), option: 'Senior' });
  check('a dropdown is set by its words', /now says "Senior"/.test(sel.text), sel.text);
  const f = await tool('browser_find', { page, text: 'Northwind' });
  check('find gives just the matching lines', /UX Lead at Northwind/.test(f.text) && !/Posting 3:/.test(f.text), f.text);
  await tool('browser_scroll', { page, down: true });
  const r3 = await tool('browser_read', { page, changes: true });
  check('after a scroll, only what changed comes back', /are the same as your last read/.test(r3.text) && r3.text.length < r1.text.length, `${r3.text.length} vs ${r1.text.length}`);
  const go = await tool('browser_click', { page, n: num(r1.text, 'Next posting') });
  const back = await tool('browser_back', { page });
  check('back works and says where it went', /Second posting/.test(go.text) && /moved to/.test(back.text), back.text);

  const p2 = await tool('browser_open', { url: base + '/check' });
  check('a security-check page closes that page, never retried', p2.err && /security check/.test(p2.text) && /do not retry/.test(p2.text) && /left alone for a day/.test(p2.text), p2.text);
  const after = await tool('browser_read', { page });
  check('the rest of the session goes on (not a job site)', !after.err && /Jobs board/.test(after.text), after.text);
  const again = await tool('browser_open', { url: base + '/' });
  check('that site is then left alone, saying why (never "he pressed STOP")', again.err && /showed a security check earlier/.test(again.text) && !/STOP/.test(again.text), again.text);

  mcp.kill(); door.close(); b.closeAll(); site.close(); pages.close();
  console.log(bad ? `${bad} failed` : 'all passed');
  setTimeout(() => app.exit(bad ? 1 : 0), 500);
});
