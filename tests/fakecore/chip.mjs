// Typing to Aang, for real: real hotkey, real keystrokes, real clicks, real mouse wheel, with WoW in front.
// A fake Core records what the Body sends and plays replies back, and screenshots are taken at each step.
//   node typing.mjs
import { WebSocketServer } from 'ws';
import { spawn } from 'node:child_process';
import { mkdirSync, existsSync, rmSync, readFileSync } from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..', '..');
const bodyExe = path.join(root, 'src', 'Body', 'bin', 'Release', 'net10.0-windows', 'Aang.exe');
const capture = path.join(root, 'tools', 'measure', 'Capture.ps1');
const keysPs = path.join(root, 'tools', 'measure', 'Keys.ps1');
const outDir = path.join(root, "tests", "out", "chip");
mkdirSync(outDir, { recursive: true });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const results = [];
const check = (name, ok, detail = '') => { if (!ok) console.log('   inbox:', JSON.stringify(inbox.map(m => m.t + ':' + (m.text ?? m.mode ?? m.on ?? ''))));  results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  ' + detail : ''}`); };

// a clean Body state: no saved position or history
for (const f of ['body.json', 'input-history.json']) { const p = path.join(process.env.APPDATA, 'Aang', f); if (existsSync(p)) rmSync(p); }

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

const body = spawn(bodyExe, ['--quiet=never'], { stdio: 'ignore' });
await Promise.race([connected, sleep(20000)]);
check('Body connected', !!sock);
await sleep(1500);
const rect = (await keys.ask('rect Aang Body')).split(' ').map(Number);
const [L, T] = rect;
const spriteXY = [L + 360, T + 110 + 215];                       // a pixel on Aang himself

// ---- the model chip, saving, quota strip, consent and the ONE global hotkey (Ctrl+NumLock), with WoW in front
const wowFg = await keys.ask('focus WowB');
const hasWow = /world of warcraft/i.test(wowFg);
const bubbleXY = [L + 120, T + 110 + 100];
const openBox = async () => { await keys.ask('focus WowB'); await keys.ask(`click ${spriteXY[0]} ${spriteXY[1]}`); await sleep(200); };
const cfgMode = () => { try { return JSON.parse(readFileSync(path.join(process.env.APPDATA, 'Aang', 'body.json'), 'utf8').replace(/^﻿/, '')).Mode; } catch { return null; } };
const answer = async s => { send({ t: 'bubble', text: 'ok', stream: false, id: s?.id }); await sleep(250); };
const quota = (week, five, level) => send({ t: 'quota', five, week, fiveResetsAt: 0, weekResetsAt: 0, level });
const inputRect = async () => (await keys.ask('rect Aang Input')).split(' ').map(Number);
const clickChip = async () => { const r = await inputRect(); await keys.ask(`click ${r[0] + 26} ${r[3] - 12}`); };
const clickSavingPill = async () => { const r = await inputRect(); await keys.ask(`click ${r[0] + 110} ${r[3] - 12}`); };
// ask something: opens the box by clicking Aang, types, sends. Every key goes to the box, and only after we saw it has focus.
const ask = async text => {
  inbox.length = 0; await openBox();
  const fg = await keys.ask('fg');
  if (!/Aang Input/.test(fg)) { console.log('   box did not take focus, not typing (foreground: ' + fg + ')'); return null; }
  await keys.ask(`send ${text}{ENTER}`);
  return waitFor(() => submits().find(m => m.text === text));
};

quota(0.34, 0.12, 'ok');
await sleep(300);
await openBox(); await sleep(300);
await snap('01_strip_auto_ok');
const cfgUsage = () => { try { return JSON.parse(readFileSync(path.join(process.env.APPDATA, 'Aang', 'body.json'), 'utf8').replace(/^﻿/, '')).ShowUsage; } catch { return null; } };
const clickGauge = async () => { const r = await inputRect(); await keys.ask(`click ${r[2] - 25} ${r[3] - 12}`); await sleep(200); };
check('usage numbers start hidden', cfgUsage() !== true, String(cfgUsage()));
await clickGauge(); await snap('01b_usage_open');
check('clicking the gauge opens the numbers (remembered)', cfgUsage() === true, String(cfgUsage()));
await clickGauge();
check('clicking it again hides them', cfgUsage() === false, String(cfgUsage()));

// clicking the chip cycles Auto > Quick > Smart > Deep > Auto
await clickChip(); await clickChip(); await sleep(200);
await snap('02_chip_smart');
await keys.ask('send {ESC}');
let s = await ask('x');
check('two chip clicks select Smart and the next message carries it', s?.mode === 'smart', JSON.stringify(s?.mode));
await answer(s);
check('the choice is saved to body.json', cfgMode() === 'smart', String(cfgMode()));
await openBox(); await clickChip(); await clickChip(); await sleep(150); await keys.ask('send {ESC}');
s = await ask('y');
check('two more clicks wrap round to Auto', s?.mode === 'auto', JSON.stringify(s?.mode));
await answer(s);

// saving pill: appears at the 50% offer, click turns saving on
quota(0.55, 0.5, 'offer');
await openBox(); await sleep(300);
await snap('03_offer_55');
inbox.length = 0;
await clickSavingPill();
let sv = await waitFor(() => inbox.find(m => m.t === 'saving'));
check('clicking "save quota?" turns saving on and tells the Core', sv?.on === true, JSON.stringify(sv));
quota(0.55, 0.5, 'saving'); await sleep(300);
await snap('04_saving_on');
inbox.length = 0;
await clickSavingPill();
sv = await waitFor(() => inbox.find(m => m.t === 'saving'));
check('clicking the pill again turns it off', sv?.on === false, JSON.stringify(sv));
await keys.ask('send {ESC}');
quota(0.44, 0.3, 'warn');
await openBox(); await sleep(300); await snap('05_warn_44');
await keys.ask('send {ESC}');
quota(0.34, 0.12, 'ok');

// the one global hotkey
const before = await keys.ask('rect Aang Body');
await keys.ask('focus WowB');
await keys.ask('hotkey Ctrl+NumLock'); await sleep(400);
check('Ctrl+NumLock hides Aang', (await keys.ask('rect Aang Body')) === 'none');
const fgH = await keys.ask('fg');
check('hiding left focus on the game', hasWow ? /world of warcraft/i.test(fgH) : true, fgH);
await keys.ask('hotkey Ctrl+NumLock'); await sleep(500);
check('Ctrl+NumLock reveals Aang in the same place', (await keys.ask('rect Aang Body')) === before, before);
// the old hotkeys are gone: they do nothing now
inbox.length = 0;
for (const combo of ['Ctrl+Shift+Space', 'Ctrl+Shift+H', 'Ctrl+Shift+M', 'Ctrl+Shift+Q']) await keys.ask(`hotkey ${combo}`);
await sleep(400);
check('the old global hotkeys no longer do anything', (await keys.ask('rect Aang Input')) === 'none' && (await keys.ask('rect Aang Body')) === before && !inbox.some(m => m.t === 'saving'));

// consent: saving is on and a bigger model was asked for
await openBox(); await clickChip(); await clickChip(); await keys.ask('send {ESC}');       // Smart
quota(0.55, 0.5, 'offer');
await openBox(); await sleep(200); await clickSavingPill(); await sleep(200);           // saving on
quota(0.55, 0.5, 'saving'); await keys.ask('send {ESC}');
const c1 = await ask('explain the thing');
check('with Smart chosen the submit carries smart', c1?.mode === 'smart', JSON.stringify(c1?.mode));
send({ t: 'consent', id: c1.id, wanted: 'smart' }); await sleep(500);
await snap('06_consent');
const fgC = await keys.ask('fg');
check('consent opens the box and takes focus', /Aang Input/.test(fgC), fgC);
inbox.length = 0;
await keys.ask('send {ENTER}');
const c2 = await waitFor(() => submits()[0]);
check('Enter on the consent prompt resends the same text, same model, once', c2?.text === 'explain the thing' && c2?.mode === 'smart' && c2?.once === true, JSON.stringify(c2));
send({ t: 'ack', id: c2.id }); await answer(c2);

const c3 = await ask('again');
send({ t: 'consent', id: c3.id, wanted: 'smart' }); await sleep(500);
inbox.length = 0;
await keys.ask('send {ESC}'); await sleep(500);
check('Esc on the consent prompt sends nothing', submits().length === 0);
await snap('07_consent_declined');

// clicking the consent bubble also allows it
const c4b = await ask('third');
send({ t: 'consent', id: c4b.id, wanted: 'smart' }); await sleep(500);
inbox.length = 0;
await keys.ask(`click ${bubbleXY[0]} ${bubbleXY[1]}`);
const c5 = await waitFor(() => submits()[0]);
check('clicking the consent bubble allows it once', c5?.text === 'third' && c5?.once === true, JSON.stringify(c5));
await answer(c5);

// saving survives a Core restart: the Body tells the new Core again
inbox.length = 0;
sock.close(); await sleep(3000);
const again = inbox.find(m => m.t === 'saving');
check('after a reconnect the Body re-sends "saving on" to the Core', again?.on === true, JSON.stringify(again));

keys.p.stdin.write('quit\n'); cap.p.stdin.write('quit\n'); body.kill(); wss.close();
console.log(`\n${results.filter(Boolean).length}/${results.length} chip checks passed; screenshots in ${outDir}`);
process.exit(results.every(Boolean) ? 0 : 1);

