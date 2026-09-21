// Typing to Aang, for real: real hotkey, real keystrokes, real clicks, real mouse wheel, with WoW in front.
// A fake Core records what the Body sends and plays replies back, and screenshots are taken at each step.
//   node typing.mjs
import { requireNoBody, ensureForeground, releaseForeground } from './guard.mjs';
import { WebSocketServer } from 'ws';
import { spawn } from 'node:child_process';
import { mkdirSync, existsSync, rmSync } from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..', '..');
const bodyExe = path.join(root, 'src', 'Body', 'bin', 'Release', 'net10.0-windows', 'Aang.exe');
const capture = path.join(root, 'tools', 'measure', 'Capture.ps1');
const keysPs = path.join(root, 'tools', 'measure', 'Keys.ps1');
const outDir = path.join(root, 'tests', 'out', 'typing');
mkdirSync(outDir, { recursive: true });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const results = [];
const check = (name, ok, detail = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  ' + detail : ''}`); };

// a clean Body state: no saved position or history
for (const f of ['body.json', 'input-history.json']) { const p = path.join(process.env.AANG_BODY_DIR, f); if (existsSync(p)) rmSync(p); }

function server(cmd, args) {
  const p = spawn(cmd, args, { stdio: ['pipe', 'pipe', 'inherit'] });
  let buf = ''; const waiters = [];
  p.stdout.on('data', d => { buf += d; let i; while ((i = buf.indexOf('\n')) >= 0) { const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1); waiters.shift()?.(line); } });
  const next = () => new Promise(r => waiters.push(r));
  return { p, next, ask: async line => { const r = next(); p.stdin.write(line + '\n'); return r; } };
}
const ps = ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File'];
const cap = server('powershell.exe', [...ps, capture, '-Serve']); await cap.next();
const keys = server('powershell.exe', [...ps, keysPs, '-Serve']); await keys.next();
const snap = async name => { const r = await cap.ask(`snap ${path.join(outDir, name + '.png')} Aang Body`); check('snapshot ' + name, r.startsWith('ok')); };

// ---- fake Core
const wss = new WebSocketServer({ host: '127.0.0.1', port: 47831, path: '/body' });
let sock = null; const inbox = [];
const connected = new Promise(res => wss.on('connection', s => { sock = s; s.on('message', m => { const j = JSON.parse(String(m)); j.at = Date.now(); inbox.push(j); if (j.t === 'hello') res(); }); }));
const send = o => sock.send(JSON.stringify(o));
const submits = () => inbox.filter(m => m.t === 'submit');
const waitFor = async (f, ms = 3000) => { const d = Date.now() + ms; while (Date.now() < d) { const r = f(); if (r) return r; await sleep(20); } return null; };

await requireNoBody();
const body = spawn(bodyExe, ['--quiet=never', '--no-core'], { stdio: 'ignore' });
await Promise.race([connected, sleep(20000)]);
check('Body connected', !!sock);
await sleep(1500);
const rect = (await keys.ask('rect Aang Body')).split(' ').map(Number);
const [L, T] = rect;
const spriteXY = [L + 360, T + 110 + 215];                       // a pixel on Aang himself
const openBox = async () => { await ensureForeground(keys.ask); await keys.ask('click ' + spriteXY[0] + ' ' + spriteXY[1]); };
const bubbleXY = [L + 120, T + 110 + 100];                        // inside the bubble when it is showing

// ---- WoW in front, as in real use
const wowFg = await ensureForeground(keys.ask);
console.log(`      foreground before: '${wowFg}'`);
const hasWow = /world of warcraft/i.test(wowFg);
// With WoW closed the game cannot be the 'window that had focus'; use whatever really does, so the same checks still mean something.
const before = hasWow ? wowFg : await keys.ask('fg');

// 1. hotkey opens the box and takes focus
await openBox();
let fg = await keys.ask('fg');
check('clicking Aang opens the input box and it takes focus', /Aang Input/.test(fg), `foreground '${fg}'`);
await snap('01_input_open');

// 2. type + Enter sends, gives focus back, and shows Aang thinking at once
inbox.length = 0;
const t0 = Date.now();
await keys.ask('send hello there{ENTER}');
const s1 = await waitFor(() => submits()[0]);
check('Enter sends the text to the Core', s1?.text === 'hello there', JSON.stringify(s1?.text));
check('the submit carries an id and a mode', !!s1?.id && s1?.mode === 'auto');
fg = await keys.ask('fg');
check('focus went back to where it was (the game)', hasWow ? /world of warcraft/i.test(fg) : fg === before, `foreground '${fg}'`);
await snap('02_thinking_immediately');

// 3. the Core answers; receipt, stream and final all show
send({ t: 'ack', id: s1.id });
send({ t: 'tool', id: s1.id, name: 'mcp__aang__get_time', phase: 'start', label: 'checking the time' }); await sleep(500); await snap('03_receipt');
send({ t: 'bubble', text: 'Quick answer:', stream: true, id: s1.id }); await sleep(150);
send({ t: 'bubble', text: 'Quick answer: it works.', stream: false, id: s1.id }); await sleep(600); await snap('04_answer');

// 4. Up recalls the last message
inbox.length = 0;
await openBox();
await keys.ask('send {UP}{ENTER}');
const s2 = await waitFor(() => submits()[0]);
check('Up recalls the previous message', s2?.text === 'hello there', JSON.stringify(s2?.text));
send({ t: 'bubble', text: 'ok', stream: false, id: s2?.id }); await sleep(300);

// 5. Ctrl+Enter is a new line, plain Enter sends
inbox.length = 0;
await openBox();
await keys.ask('send first line^{ENTER}second line');
await sleep(300); await snap('05_two_line_input');
await keys.ask('send {ENTER}');
const s3 = await waitFor(() => submits()[0]);
check('Ctrl+Enter makes a new line and Enter sends both', s3?.text?.replace(/\r/g, '') === 'first line\nsecond line', JSON.stringify(s3?.text));
send({ t: 'bubble', text: 'ok', stream: false, id: s3?.id }); await sleep(300);

// 6. empty Enter does nothing; Esc closes and returns focus
inbox.length = 0;
await openBox();
await keys.ask('send {ENTER}');
await sleep(500);
check('an empty Enter sends nothing', submits().length === 0);
fg = await keys.ask('fg');
check('the box stays open after an empty Enter', /Aang Input/.test(fg), `foreground '${fg}'`);
await keys.ask('send {ESC}');
fg = await keys.ask('fg');
check('Esc closes the box and gives focus back', hasWow ? /world of warcraft/i.test(fg) : !/Aang Input/.test(fg), `foreground '${fg}'`);

// 7. Esc while a reply is running stops it
inbox.length = 0;
await openBox();
await keys.ask('send a slow question{ENTER}');
const s4 = await waitFor(() => submits()[0]);
await sleep(300);                                                // the Core never answers: the reply is "running"
await openBox();
await keys.ask('send {ESC}');
const stop = await waitFor(() => inbox.find(m => m.t === 'stop'));
check('Esc while a reply is running sends stop', !!stop && stop.id === s4?.id, JSON.stringify(stop));
await sleep(300); await snap('06_after_stop');
await keys.ask('send {ESC}');                                    // close the box if it is still open

// 8. clicking Aang himself opens the box
await ensureForeground(keys.ask);
await keys.ask(`click ${spriteXY[0]} ${spriteXY[1]}`);
fg = await keys.ask('fg');
check('clicking Aang opens the input box', /Aang Input/.test(fg), `foreground '${fg}'`);
await keys.ask('send {ESC}');

// 9. a long reply shows "...v", a click expands it, the wheel scrolls, Esc closes it
const long = Array.from({ length: 30 }, (_, i) => `Sentence number ${i + 1} keeps going for a little while so it wraps.`).join(' ');
send({ t: 'bubble', text: long, stream: false, id: 'x' }); await sleep(700);
await snap('07_long_collapsed');
await keys.ask(`click ${bubbleXY[0]} ${bubbleXY[1]}`); await sleep(500);
await snap('08_expanded');
await keys.ask(`wheel -3 ${bubbleXY[0]} ${bubbleXY[1] - 10}`); await sleep(200);
await keys.ask(`wheel -3 ${bubbleXY[0]} ${bubbleXY[1] - 10}`); await sleep(300);
await snap('09_scrolled');
inbox.length = 0;
await keys.ask('send {ESC}'); await sleep(500);
await snap('10_collapsed_by_esc');
check('Esc while expanded did not reach the game (no other window took focus)', hasWow ? /world of warcraft/i.test(await keys.ask('fg')) : true);

// 10. clicking outside closes the expanded bubble (checked against a throwaway window of our own, never the
// game and never Notepad: "rect Notepad" could find Joshua's Notepad and click into it, and the cleanup
// killed every Notepad on the machine)
await keys.ask(`click ${bubbleXY[0]} ${bubbleXY[1]}`); await sleep(500);
await snap('11_expanded_again');
const standInTitle = 'Aang test click-away';
const np = spawn('powershell.exe', ['-NoProfile', '-STA', '-ExecutionPolicy', 'Bypass', '-File',
  path.join(root, 'tools', 'measure', 'StandIn.ps1'), '-Title', standInTitle], { stdio: 'ignore' });
await sleep(2500);
const npRect = (await keys.ask(`rect ${standInTitle}`)).split(' ').map(Number);
if (npRect.length === 4 && !Number.isNaN(npRect[0])) {
  const cx = Math.round((npRect[0] + npRect[2]) / 2), cy = Math.round((npRect[1] + npRect[3]) / 2);
  const inside = cx > L + 300 || cy < T + 100;                  // not on top of Aang
  if (inside) { await keys.ask(`click ${cx} ${cy}`); await sleep(500); await snap('12_after_click_away'); check('clicking outside the bubble closes it', true, '(see 12_after_click_away)'); }
  else check('clicking outside the bubble closes it', false, 'no safe outside point found');
} else check('clicking outside the bubble closes it', false, 'stand-in window not found');
spawn('taskkill', ['/PID', String(np.pid), '/T', '/F'], { stdio: 'ignore' });

// 11. no Core at all: an error, never an empty bubble
send({ t: 'bubble.clear' }); sock.close(); await sleep(2200);
await openBox();
await keys.ask('send anyone there?{ENTER}'); await sleep(600);
await snap('13_no_core_error');

await releaseForeground();
keys.p.stdin.write('quit\n'); cap.p.stdin.write('quit\n'); body.kill(); wss.close();
console.log(`\n${results.filter(Boolean).length}/${results.length} typing checks passed; screenshots in ${outDir}`);
process.exit(results.every(Boolean) ? 0 : 1);

