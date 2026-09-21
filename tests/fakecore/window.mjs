// Does Aang know which app Joshua is in? Real Body, real Core, real Claude, real window switching.
//   node window.mjs
import { requireNoBody, releaseForeground } from './guard.mjs';
import { spawn, execSync } from 'node:child_process';
import { mkdirSync, mkdtempSync } from 'node:fs';
import { WebSocket } from 'ws';
import os from 'node:os';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..', '..');
const outDir = path.join(root, 'tests', 'out', 'window');
mkdirSync(outDir, { recursive: true });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const results = [];
const check = (name, ok, detail = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  ' + detail : ''}`); };

function server(cmd, args) {
  const p = spawn(cmd, args, { stdio: ['pipe', 'pipe', 'inherit'] });
  let buf = ''; const w = [];
  p.stdout.on('data', d => { buf += d; let i; while ((i = buf.indexOf('\n')) >= 0) { const l = buf.slice(0, i).trim(); buf = buf.slice(i + 1); w.shift()?.(l); } });
  return { p, ask: line => new Promise(r => { w.push(r); p.stdin.write(line + '\n'); }), prime: () => w.push(() => {}) };
}
const ps = ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File'];
const cap = server('powershell.exe', [...ps, path.join(root, 'tools', 'measure', 'Capture.ps1'), '-Serve']); cap.prime();
const keys = server('powershell.exe', [...ps, path.join(root, 'tools', 'measure', 'Keys.ps1'), '-Serve']); keys.prime();
await sleep(1500);

// Close any folder windows left open by an earlier run: 'focus explorer' picks whichever one Windows
// hands back, and a stale one made this test look like a product failure twice. Quit() closes the folder
// windows only; killing explorer.exe would take the taskbar down with it.
execSync('powershell -NoProfile -Command "(New-Object -ComObject Shell.Application).Windows() | ForEach-Object { $_.Quit() }"', { stdio: 'ignore' });
await sleep(1500);

await requireNoBody();
const stateDir = mkdtempSync(path.join(os.tmpdir(), 'aang-win-'));
const core = spawn(process.execPath, ['--no-warnings', 'src/index.ts'], {
  cwd: path.join(root, 'src', 'Core'), stdio: ['ignore', 'pipe', 'pipe'],
  env: { ...process.env, AANG_STATE_DIR: stateDir, AANG_WARM: '0' },
});
core.stderr.on('data', d => process.stdout.write('      core!: ' + d));
await sleep(6000);

const body = spawn(path.join(root, 'src', 'Body', 'bin', 'Release', 'net10.0-windows', 'Aang.exe'), ['--quiet=never', '--no-core'], { stdio: 'ignore' });
const c = new WebSocket('ws://127.0.0.1:47831/body');
const inbox = [];
c.on('message', d => inbox.push(JSON.parse(String(d))));
await new Promise(r => c.once('open', r));
await sleep(3000);
const waitFor = async (f, ms = 120000) => { const d = Date.now() + ms; while (Date.now() < d) { const r = f(); if (r) return r; await sleep(60); } return null; };
const ask = async (id, text) => {
  c.send(JSON.stringify({ t: 'submit', id, text, mode: 'quick' }));
  const m = await waitFor(() => inbox.find(x => x.t === 'bubble' && x.stream === false && x.id === id));
  console.log(`      "${text}" -> ${JSON.stringify(m?.text)}`);
  return m;
};
// A folder window does not have its title the instant it appears, and focusing it too early gave an
// empty title and an answer with no folder name in it. Wait for the title rather than guessing a delay.
const waitForTitle = async (part, ms = 15000) => {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    await keys.ask('focus explorer');
    const fg = await keys.ask('fg');
    if (fg.toLowerCase().includes(part.toLowerCase())) return fg;
    await sleep(800);
  }
  return keys.ask('fg');
};
const toolsSince = from => inbox.slice(from).filter(m => m.t === 'tool').map(m => m.name);

// ---- a window whose title we control exactly.
// Notepad was the wrong choice: Windows 11 restores its previous tabs, so the title was a leftover
// unsaved tab and never named our file. A command window would not reliably come to the front. A folder
// does both: Explorer puts the folder's name in the title, and the name is ours to choose.
const raidFolder = mkdtempSync(path.join(os.tmpdir(), 'raid-night-plan-'));
spawn('explorer.exe', [raidFolder], { stdio: 'ignore', detached: true }).unref();
console.log('      in front: ' + await waitForTitle('raid-night-plan'));
await sleep(1500);

let from = inbox.length;
const a = await ask('w1', 'what am i in right now');
check('he gets it from the tool, not a guess', toolsSince(from).some(t => /what_im_doing/.test(t)), toolsSince(from).join(', ') || 'no tools');
check('he repeats the exact title, which nothing but the title could give him', /raid.?night/i.test(a?.text ?? ''), JSON.stringify(a?.text?.slice(0, 120)));
await sleep(500);
console.log('      ' + (await cap.ask(`snap ${path.join(outDir, '01_window.png')} Aang Body`)).slice(0, 40));

// ---- switch windows: he should follow.
// Asserted against whatever is genuinely in front at the moment of asking, because focus drifts on this
// machine and an earlier version of this test assumed it would stay put.
await keys.ask('send %{F4}');          // close the first folder window
await sleep(1500);
const folder = mkdtempSync(path.join(os.tmpdir(), 'grocery-list-'));
spawn('explorer.exe', [folder], { stdio: 'ignore', detached: true }).unref();
const fgNow = await waitForTitle('grocery-list');
await sleep(1500);
console.log('      in front: ' + fgNow);

from = inbox.length;
const b = await ask('w2', 'what about now, what am i looking at');
check('he follows the switch and names what is actually in front',
  /grocery|explorer|folder|file/i.test(b?.text ?? ''), `in front "${fgNow}" -> ${JSON.stringify(b?.text?.slice(0, 90))}`);
check('he asked again rather than repeating his last answer', toolsSince(from).some(t => /what_im_doing/.test(t)), toolsSince(from).join(', ') || 'no tools');
check('the window he left is not still reported as current',
  !/raid.?night/i.test(b?.text ?? '') || /before|was|earlier|left/i.test(b?.text ?? ''), JSON.stringify(b?.text?.slice(0, 90)));

// ---- and it can be switched off. The Body is stopped first: while it runs it keeps reporting the
// window twice a second, which would undo the switch immediately.
body.kill();
await sleep(1500);
// Switched off, then a window he must never learn about is reported anyway. Asking whether he *says*
// "it is off" is unreliable - he sometimes repeats his previous answer instead of checking again - but
// whether a title sent while off can reach him is exactly the property that matters, and it is absolute.
c.send(JSON.stringify({ t: 'presence', quiet: false, foreground: 'explorer', title: 'private-banking-statement', watching: false }));
await sleep(1000);
from = inbox.length;
const d2 = await ask('w3', 'what window am i in now? check again');
console.log('      w3 tools: ' + (toolsSince(from).join(', ') || 'none - he answered from the conversation'));
check('a window reported while it is switched off never reaches him', !/private.?banking/i.test(d2?.text ?? ''), JSON.stringify(d2?.text?.slice(0, 100)));
check('and nothing recorded before it was switched off leaked either', !/raid.?night|grocery/i.test(d2?.text ?? ''), JSON.stringify(d2?.text?.slice(0, 100)));

// close the folder window politely; killing explorer.exe would take the taskbar down with it
await keys.ask('focus explorer');
await keys.ask('send %{F4}');
await sleep(800);
await releaseForeground();
keys.p.stdin.write('quit\n'); cap.p.stdin.write('quit\n'); c.close(); core.kill();
console.log(`\n${results.filter(Boolean).length}/${results.length} window checks passed; screenshots in ${outDir}`);
process.exit(results.every(Boolean) ? 0 : 1);
