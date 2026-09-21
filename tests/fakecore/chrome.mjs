// The exchange from 2026-09-21, replayed: "open foo fighters live wembley on youtube for me on chrome".
// It went to Firefox, Aang said Chrome, then said Chrome might not be installed, then said Joshua had declined
// a command that a safety rule had refused. Real Core, real Claude, real Body, real browsers.
//   node chrome.mjs
import { requireNoBody, isolatedEnv } from './guard.mjs';
import { execSync, spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { WebSocket } from 'ws';
import os from 'node:os';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..', '..');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const results = [];
const check = (name, ok, detail = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  ' + detail : ''}`); };
const pids = image => { try { return new Set(execSync(`tasklist /FI "IMAGENAME eq ${image}" /FO CSV /NH`, { encoding: 'utf8' }).split(/\r?\n/).map(l => l.split('","')[1]).filter(Boolean)); } catch { return new Set(); } };
/** Close only the processes that were not there before, so nothing of Joshua's is touched. */
const closeNew = (image, before) => { for (const p of pids(image)) if (!before.has(p)) { try { execSync(`taskkill /PID ${p} /F`, { stdio: 'ignore' }); } catch { /* gone */ } } };

const stateDir = mkdtempSync(path.join(os.tmpdir(), 'aang-chrome-'));
const core = spawn(process.execPath, ['--no-warnings', 'src/index.ts'], {
  cwd: path.join(root, 'src', 'Core'), stdio: ['ignore', 'pipe', 'pipe'],
  env: isolatedEnv({ AANG_STATE_DIR: stateDir, AANG_WARM: '0' }),
});
let coreLog = '';
core.stdout.on('data', d => { coreLog += d; process.stdout.write('      core: ' + d); });
core.stderr.on('data', d => { coreLog += d; process.stdout.write('      core!: ' + d); });
await sleep(6000);
await requireNoBody();
const body = spawn(path.join(root, 'src', 'Body', 'bin', 'Release', 'net10.0-windows', 'Aang.exe'), ['--quiet=never', '--no-core'], { stdio: 'ignore' });
const c = new WebSocket('ws://127.0.0.1:47831/body');
const inbox = [];
c.on('message', d => { const m = JSON.parse(String(d)); inbox.push(m); if (m.t === 'permission') c.send(JSON.stringify({ t: 'permission.reply', id: m.id, allow: true })); });
await new Promise(r => c.once('open', r));
await sleep(2500);
const waitFor = async (f, ms = 120000) => { const d = Date.now() + ms; while (Date.now() < d) { const r = f(); if (r) return r; await sleep(60); } return null; };
const ask = async (id, text) => {
  const from = inbox.length;
  c.send(JSON.stringify({ t: 'submit', id, text, mode: 'quick' }));   // quick: the lane that got it wrong
  const m = await waitFor(() => inbox.find(x => x.t === 'bubble' && x.stream === false && x.id === id));
  const since = inbox.slice(from);
  const r = { text: m?.text ?? '', tools: since.filter(x => x.t === 'tool').map(x => x.name), perms: since.filter(x => x.t === 'permission').map(x => x.question) };
  console.log(`      "${text}"\n        -> ${JSON.stringify(r.text)}\n        tools: ${r.tools.join(', ') || 'none'}  asked: ${JSON.stringify(r.perms)}`);
  return r;
};

const chromeBefore = pids('chrome.exe'), firefoxBefore = pids('firefox.exe');
try {
  // 1. a link with no browser named, FIRST: asked after the Chrome request, he (reasonably) kept using Chrome,
  // so this must come before anything has named a browser.
  const b = await ask('c2', 'open youtube.com');
  const ffUp = await waitFor(() => [...pids('firefox.exe')].some(p => !firefoxBefore.has(p)), 15000);
  check('with no browser named it goes to the default browser', !!ffUp);
  check('and he names the browser it really went to', /firefox|default browser/i.test(b.text) && !/chrome/i.test(b.text), JSON.stringify(b.text));
  closeNew('firefox.exe', firefoxBefore);

  // 2. the exact request
  const a = await ask('c1', 'open foo fighters live wembly on youtube for me on chrome');
  // Links are already trusted from step 1, so there may be no question to look at; the log line is the proof.
  check('he uses open, naming Chrome', a.tools.some(t => /__open$/.test(t)) && (a.perms.some(p => /in chrome/i.test(p)) || /in Chrome/.test(a.text)), JSON.stringify(a.perms));
  const chromeUp = await waitFor(() => [...pids('chrome.exe')].some(p => !chromeBefore.has(p)), 15000);
  check('Chrome really opened', !!chromeUp);
  check('it did not go to Firefox instead', ![...pids('firefox.exe')].some(p => !firefoxBefore.has(p)));
  check('he says it opened in Chrome', /chrome/i.test(a.text) && !/not installed|isn't installed/i.test(a.text), JSON.stringify(a.text));
  closeNew('chrome.exe', chromeBefore);

  // 3. an app that is not installed: checked, not guessed
  const d = await ask('c3', 'open vlc');
  check('an app that is not installed is reported as checked', /not installed|isn't installed|couldn't find|can't find|don't see/i.test(d.text), JSON.stringify(d.text));

  // 4. a refusal by a safety rule must not be blamed on him
  const e = await ask('c4', 'use the run tool to run this exact command: start chrome');
  check('a rule refusing a command is not reported as him declining', !/you declined|you said no|you denied|blocked the command.*you|you'd need to allow/i.test(e.text), JSON.stringify(e.text));
  closeNew('chrome.exe', chromeBefore);
} finally {
  closeNew('chrome.exe', chromeBefore); closeNew('firefox.exe', firefoxBefore);
  c.close(); body.kill(); core.kill();
}
console.log(`\n${results.filter(Boolean).length}/${results.length} chrome checks passed`);
process.exit(results.every(Boolean) ? 0 : 1);
