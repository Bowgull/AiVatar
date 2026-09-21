// The real reader acting on a real Windows form (tests/fakecore/uia-form.ps1) whose controls and effects are known:
// every press and fill is checked from the form's own log, not from what the reader says about itself. No model.
//   node test/uia-live.ts
import './_env.ts';
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { WebSocket } from 'ws';
import { Core } from '../src/core.ts';
import { runAct } from '../src/uia.ts';

const root = path.resolve(import.meta.dirname, '..', '..', '..');
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
const results: boolean[] = [];
const check = (name: string, ok: boolean, detail = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  ' + detail : ''}`); };
const tmp = (p: string) => mkdtempSync(path.join(os.tmpdir(), p));

const log = path.join(tmp('aang-uia-log-'), 'form.log');
writeFileSync(log, '');
const lines = () => readFileSync(log, 'utf8').split(/\r?\n/).filter(Boolean);
const b64 = (s: string) => 'hello:' + Buffer.from(s, 'utf8').toString('base64');
const form = spawn('powershell.exe', ['-NoProfile', '-STA', '-ExecutionPolicy', 'Bypass', '-File', path.join(root, 'tests', 'fakecore', 'uia-form.ps1')], { env: { ...process.env, UIA_LOG: log }, stdio: 'ignore', windowsHide: false });
const APP = 'Aang UIA stand-in';

const PORT = 47890;
const core: any = new Core({ port: PORT, dataDir: tmp('aang-uia-data-'), stateDir: tmp('aang-uia-state-'), warm: false, consolidate: false });
let ws: WebSocket | null = null;
try {
  for (let i = 0; i < 100 && !lines().includes('ready'); i++) await sleep(150);
  check('the stand-in form is up', lines().includes('ready'));
  await sleep(700);

  const found = await runAct({ app: APP, do: 'find' });
  const names = (found.matches ?? []).map(m => m.name);
  console.log('      controls: ' + JSON.stringify((found.matches ?? []).map(m => `${m.name}/${m.type}${m.password ? '/pw' : ''}${m.enabled ? '' : '/off'}`)));
  check('it finds the window and lists the controls by name', found.ok && ['Name field', 'Say hello', 'Send', 'Subscribe', 'Secret', 'Read only field', 'Greyed', 'Open dialog'].every(n => names.includes(n)), found.error ?? '');
  check('the password field is marked, and the greyed button is marked off', !!found.matches?.find(m => m.name === 'Secret')?.password && found.matches?.find(m => m.name === 'Greyed')?.enabled === false);
  check('a name search narrows the list', (await runAct({ app: APP, do: 'find', name: 'hello' })).matches?.length === 1);
  check('an unknown app is said plainly', /could not find an open window/.test((await runAct({ app: 'no such app anywhere', do: 'find' })).error ?? ''));

  const fill = await runAct({ app: APP, do: 'fill', name: 'Name field', text: 'Josh Bocas ✓ "quoted"' });
  check('fill types into a real field, unicode and quotes intact, and reads it back', fill.ok === true && /Filled "Name field"/.test(fill.detail ?? ''), fill.error ?? fill.detail ?? '');
  const press = await runAct({ app: APP, do: 'press', name: 'Say hello' });
  await sleep(300);
  check('press clicks a real button, and the app saw what was typed', press.ok === true && lines().includes(b64('Josh Bocas ✓ "quoted"')), JSON.stringify(lines().slice(-2)));

  const tick = await runAct({ app: APP, do: 'press', name: 'Subscribe' });
  await sleep(300);
  check('a checkbox is ticked and it says so', tick.ok === true && /switched on/i.test(tick.detail ?? '') && lines().includes('subscribe:True'), tick.detail ?? tick.error ?? '');

  check('a password field is refused', (await runAct({ app: APP, do: 'fill', name: 'Secret', text: 'hunter2' })).error?.includes('password') === true);
  check('a read-only field is refused', /read-only/.test((await runAct({ app: APP, do: 'fill', name: 'Read only field', text: 'x' })).error ?? ''));
  check('a greyed-out button is refused', /greyed out/.test((await runAct({ app: APP, do: 'press', name: 'Greyed' })).error ?? ''));
  check('a name that is not there is refused', /not in that window/.test((await runAct({ app: APP, do: 'press', name: 'Nothing here' })).error ?? ''));
  check('a button cannot be typed into', /cannot be typed into/.test((await runAct({ app: APP, do: 'fill', name: 'Say hello', text: 'x' })).error ?? ''));
  check('none of the refused ones changed anything', !lines().includes('SENT') && lines().filter(l => l.startsWith('hello:')).length === 1 && !lines().includes('SENT'));

  const t0 = Date.now();
  const dlg = await runAct({ app: APP, do: 'press', name: 'Open dialog' });
  const took = Date.now() - t0;
  check('a button that opens a modal dialog does not hang the press', dlg.ok === true && took < 4500 && lines().includes('dialog-opened'), `${took} ms, ${dlg.detail ?? dlg.error}`);
  spawn('taskkill', ['/PID', String(form.pid), '/T', '/F'], { stdio: 'ignore' });                  // closes the dialog too
  await sleep(800);

  // ---- and through the Core's rules, with the real reader (a second form: the first is gone)
  const form2 = spawn('powershell.exe', ['-NoProfile', '-STA', '-ExecutionPolicy', 'Bypass', '-File', path.join(root, 'tests', 'fakecore', 'uia-form.ps1')], { env: { ...process.env, UIA_LOG: log }, stdio: 'ignore' });
  try {
    writeFileSync(log, '');
    for (let i = 0; i < 100 && !lines().includes('ready'); i++) await sleep(150);
    await sleep(700);
    await core.start();
    ws = new WebSocket(`ws://127.0.0.1:${PORT}/body`);
    const asked: string[] = [];
    ws.on('message', d => { const m = JSON.parse(String(d)); if (m.t === 'permission') { asked.push(String(m.question)); ws!.send(JSON.stringify({ t: 'permission.reply', id: m.id, allow: true })); } });
    await new Promise(r => ws!.once('open', r));
    await sleep(200);
    const doers = core.doers();

    const listed = await doers.uiList(APP);
    check('through the Core: listing needs the reading yes, then shows names', /Say hello/.test(listed) && asked.length === 1, asked[0]);
    const r1 = await doers.uiFill(APP, 'Name field', 'Via the Core');
    const r2 = await doers.uiPress(APP, 'Say hello');
    await sleep(300);
    check('through the Core: fill then press works, asked once for the app', r1.ok && r2.ok && lines().includes(b64('Via the Core')) && asked.length === 2, JSON.stringify(asked));
    const r3 = await doers.uiPress(APP, 'Send');
    await sleep(300);
    const r4 = await doers.uiPress(APP, 'Send');
    await sleep(300);
    check('through the Core: Send asks every single time', asked.filter(q => /Send/.test(q)).length === 2 && lines().filter(l => l === 'SENT').length === 2 && r3.ok && r4.ok, JSON.stringify(asked.slice(2)));
    const r5 = await doers.uiPress(APP, 'Twin');
    check('through the Core: two controls with one name are not guessed between', !r5.ok && /2 controls called "Twin"/.test(r5.detail) && !asked.some(q => /Twin/.test(q)), r5.detail);
    const r6 = await doers.uiFill(APP, 'Secret', 'hunter2');
    check('through the Core: the password field is refused before anyone is asked', !r6.ok && /password/.test(r6.detail) && !asked.some(q => /Secret/.test(q)), r6.detail);
  } finally { spawn('taskkill', ['/PID', String(form2.pid), '/T', '/F'], { stdio: 'ignore' }); }
} finally {
  spawn('taskkill', ['/PID', String(form.pid), '/T', '/F'], { stdio: 'ignore' });
  ws?.close();
  await core.stop().catch(() => {});
}
console.log(`\n${results.filter(Boolean).length}/${results.length} checks passed`);
void existsSync;
process.exit(results.every(Boolean) ? 0 : 1);
