// The key chooser, which Joshua has never been able to confirm works. Open it, press a real key, and check
// that the key he pressed is what gets saved and what actually hides him afterwards.
//   node hotkeybox.mjs
import { requireNoBody, ensureForeground, releaseForeground } from './guard.mjs';
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..', '..');
const outDir = path.join(root, 'tests', 'out', 'hotkey');
mkdirSync(outDir, { recursive: true });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const results = [];
const check = (name, ok, detail = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  ' + detail : ''}`); };
const cfgFile = path.join(process.env.AANG_BODY_DIR, 'body.json');
const logFile = path.join(process.env.AANG_BODY_DIR, 'body.log');
const hotkeyInConfig = () => { try { return JSON.parse(readFileSync(cfgFile, 'utf8').replace(/^﻿/, '')).Hotkey; } catch { return null; } };

for (const f of ['body.json', 'input-history.json']) { const p = path.join(process.env.AANG_BODY_DIR, f); if (existsSync(p)) rmSync(p); }

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

await requireNoBody();
const logWas = existsSync(logFile) ? readFileSync(logFile, 'utf8').length : 0;
await ensureForeground(keys.ask);
const body = spawn(path.join(root, 'src', 'Body', 'bin', 'Release', 'net10.0-windows', 'Aang.exe'),
  ['--quiet=never', '--no-core', '--set-hotkey'], { stdio: 'ignore' });
await sleep(5000);

const visible = async () => (await keys.ask('rect Aang Body')) !== 'none';
const boxOpen = async () => (await keys.ask('rect Aang hotkey')) !== 'none';

check('the key chooser opens', await boxOpen(), await keys.ask('rect Aang hotkey'));
check('it took focus, so the keys go to it', /Aang hotkey/i.test(await keys.ask('fg')), await keys.ask('fg'));
console.log('      ' + (await cap.ask(`snap ${path.join(outDir, '01_box.png')} Aang hotkey`)).slice(0, 60));

// press a combination that is definitely not the current one
await keys.ask('hotkey Ctrl+Alt+F8');
await sleep(1200);
check('pressing a key closes the chooser', !(await boxOpen()));
check('the key he pressed is what got saved', hotkeyInConfig() === 'Ctrl+Alt+F8', JSON.stringify(hotkeyInConfig()));

// and the new key must actually work
await ensureForeground(keys.ask);
check('he is on screen before the test press', await visible());
await keys.ask('hotkey Ctrl+Alt+F8');
await sleep(700);
check('the newly chosen key hides him', !(await visible()));
await keys.ask('hotkey Ctrl+Alt+F8');
await sleep(700);
check('and brings him back', await visible());

// the old key must no longer do anything
await keys.ask('hotkey Ctrl+NumLock');
await sleep(700);
check('the key it replaced no longer does anything', await visible());

// what the log says the keyboard actually sent, which is the thing Joshua needs to know
const log = readFileSync(logFile, 'utf8').slice(logWas);
const read = [...log.matchAll(/hotkey box: key press (.+?) read as '(.+?)'/g)].map(m => `${m[1]} -> ${m[2]}`);
console.log('      what the keyboard sent: ' + (read.join(' | ') || 'nothing logged'));
check('the chooser logged what the keyboard really sent', read.length > 0);
check('a hotkey was registered afterwards', /hotkey registered: Ctrl\+Alt\+F8/.test(log), (log.match(/hotkey [a-z ]+: .+/g) || []).slice(-3).join(' | '));

await releaseForeground();
keys.p.stdin.write('quit\n'); cap.p.stdin.write('quit\n'); body.kill();
console.log(`\n${results.filter(Boolean).length}/${results.length} hotkey chooser checks passed`);
process.exit(results.every(Boolean) ? 0 : 1);
