// The job-hunt flow end to end, on an isolated Core and Body: Aang opens the session in the Claude app, then
// hook events arrive exactly as the app sends them (posted to the real hook port), and Joshua sees "Need input
// in Claude" / "Job hunt done" with Claude as a link that brings the app forward. No job search is sent: the
// Claude app session is only opened with the request typed in.
//   node test/claude-flow-live.ts        (the real Aang must not be running)
import { execFileSync, spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { WebSocket } from 'ws';
import { Core } from '../src/core.ts';
import { folderFor } from '../src/claude.ts';

const root = path.resolve(import.meta.dirname, '..', '..', '..');
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
const results: boolean[] = [];
const check = (name: string, ok: boolean, detail = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  ' + detail : ''}`); };
const tmp = (p: string) => mkdtempSync(path.join(os.tmpdir(), p));
const ps = (file: string, ...a: string[]) => execFileSync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(root, 'tools', 'measure', file), ...a], { encoding: 'utf8' }).trim();

const stateDir = tmp('aang-flow-state-');
writeFileSync(path.join(stateDir, 'trust.json'), JSON.stringify({ 'start Claude sessions': { kind: 'start Claude sessions', example: 'test', since: '2026-09-21' } }));
const core: any = new Core({ port: 47831, dataDir: tmp('aang-flow-data-'), stateDir, warm: false, consolidate: false });
await core.start();
const body = spawn(path.join(root, 'src', 'Body', 'bin', 'Release', 'net10.0-windows', 'Aang.exe'), ['--quiet=always', '--no-core'], { stdio: 'ignore', env: { ...process.env, AANG_BODY_DIR: tmp('aang-flow-body-') } });
const spy = new WebSocket('ws://127.0.0.1:47831/body');
const inbox: any[] = [];
spy.on('message', d => inbox.push(JSON.parse(String(d))));
await new Promise(r => spy.once('open', r));
await sleep(3000);

const hook = (ev: any) => fetch(`http://127.0.0.1:47832/hook?e=${ev.hook_event_name}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(ev) });
const next = async (from: number) => { for (let i = 0; i < 40; i++) { const m = inbox.slice(from).find(x => x.t === 'bubble' && x.proactive); if (m) return m; await sleep(250); } return null; };
const cwd = folderFor('job hunt');

try {
  const said = await core.startClaude('Run my job search for today.', 'job hunt', 'job hunt');
  console.log('      tool said -> ' + said);
  check('it opens the session in the Claude app, not yet sent', /Claude app/.test(said) && /NOT started/.test(said));

  // another session somewhere else must not be mistaken for the job hunt
  let from = inbox.length;
  await hook({ hook_event_name: 'Notification', session_id: 'other-1', cwd: 'C:\\Users\\Shadow\\Documents\\AangApp', message: 'x' });
  await sleep(1200);
  check('a session in another folder is not the job hunt', !inbox.slice(from).some(m => m.t === 'bubble' && /job hunt/.test(m.text ?? '')));

  // he pressed Enter: the job hunt starts in the job-hunt folder and later needs him
  await hook({ hook_event_name: 'SessionStart', session_id: 'jh-1', cwd });
  await hook({ hook_event_name: 'UserPromptSubmit', session_id: 'jh-1', cwd, prompt: 'Run my job search for today.' });
  from = inbox.length;
  await hook({ hook_event_name: 'Notification', session_id: 'jh-1', cwd, message: 'Claude needs your permission to use Claude in Chrome' });
  const need = await next(from);
  console.log('      bubble -> ' + JSON.stringify(need?.text));
  check('"Need input in Claude" reaches him even in quiet mode (he is in the game)', /^Need input in Claude on the job hunt\./.test(need?.text ?? '') && need?.asked === true);
  check('Claude is marked as the link, pointing at the Claude app', need?.link === 'Claude' && need?.focus === 'Claude');
  await sleep(900);
  ps('Capture.ps1', '-Out', path.join(root, 'tests', 'out', 'claude-need-input.png'), '-CropTitle', 'Aang Body');

  // it finishes, with a summary
  const t = path.join(tmp('aang-flow-tr-'), 't.jsonl');
  writeFileSync(t, [JSON.stringify({ type: 'assistant', message: { content: [{ type: 'text', text: 'Sweep done for Sep 21. Applied to 4 roles (Wealthsimple, Shopify, Float, Clio). Screened out 6: 4 under salary floor, 2 needed French. Logged in job_pipeline.md.' }] } })].join('\n'));
  from = inbox.length;
  await hook({ hook_event_name: 'Stop', session_id: 'jh-1', cwd, transcript_path: t });
  const done = await next(from);
  console.log('      bubble -> ' + JSON.stringify(done?.text));
  check('when it finishes he gets the summary and where the detail is', /^Job hunt done\. Sweep done for Sep 21\. Applied to 4 roles/.test(done?.text ?? '') && /Details in Claude\.$/.test(done?.text ?? ''));
  await sleep(900);
  ps('Capture.ps1', '-Out', path.join(root, 'tests', 'out', 'claude-done.png'), '-CropTitle', 'Aang Body');

  // a second session opened in the same folder later is not confused with this one
  from = inbox.length;
  await hook({ hook_event_name: 'Notification', session_id: 'jh-OTHER', cwd, message: 'x' });
  await sleep(1200);
  check('once it has an id, another session in the same folder is not taken for it', !inbox.slice(from).some(m => m.t === 'bubble' && m.asked));

  // click the bubble: the Claude app comes forward
  const keys = spawn('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(root, 'tools', 'measure', 'Keys.ps1'), '-Serve'], { stdio: ['pipe', 'pipe', 'inherit'] });
  let buf = ''; const waits: ((l: string) => void)[] = [() => {}];
  keys.stdout!.on('data', d => { buf += d; let i; while ((i = buf.indexOf('\n')) >= 0) { const l = buf.slice(0, i).trim(); buf = buf.slice(i + 1); waits.shift()?.(l); } });
  const ask = (line: string) => new Promise<string>(r => { waits.push(r); keys.stdin!.write(line + '\n'); });
  await sleep(1500);
  const rect = (await ask('rect Aang Body')).split(' ').map(Number);
  await ask('focus explorer'); await sleep(800);
  const before = await ask('fg');
  await ask(`click ${rect[0]! + 120} ${rect[1]! + 110 + 100}`); await sleep(1500);
  const fg = await ask('fg');
  check('clicking the bubble brings the Claude app to the front', fg === 'Claude' && before !== 'Claude', `before '${before}', after '${fg}'`);
  keys.stdin!.write('quit\n');
} finally {
  spy.close(); body.kill(); await core.stop();
}
console.log(`\n${results.filter(Boolean).length}/${results.length} job-hunt flow checks passed`);
process.exit(results.every(Boolean) ? 0 : 1);
