// Full stack: real Core + real Claude + the real Body on screen over the game, photographed at each moment.
//   npm run e2e        (needs the Body built in Release, and Body not already running)
import { WebSocket } from 'ws';
import { spawn } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Core } from '../src/core.ts';

const repo = path.resolve(import.meta.dirname, '..', '..', '..');
const bodyExe = path.join(repo, 'src', 'Body', 'bin', 'Release', 'net10.0-windows', 'Aang.exe');
const capture = path.join(repo, 'tools', 'measure', 'Capture.ps1');
const outDir = path.join(repo, 'tests', 'out', 'e2e');
mkdirSync(outDir, { recursive: true });
if (!existsSync(bodyExe)) { console.error('Build the Body first: ' + bodyExe); process.exit(2); }

const results: boolean[] = [];
const check = (name: string, ok: boolean, detail = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  ' + detail : ''}`); };
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

// copy of Joshua's data, never the real files
const realData = path.join(os.homedir(), 'Documents', 'Aang');
const dataDir = mkdtempSync(path.join(os.tmpdir(), 'aang-e2e-'));
cpSync(path.join(realData, 'Brain'), path.join(dataDir, 'Brain'), { recursive: true });
new DatabaseSync(path.join(realData, 'aang.db')).exec(`VACUUM INTO '${path.join(dataDir, 'aang.db').split(path.sep).join('/')}'`);

// persistent capture process
const cap = spawn('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', capture, '-Serve'], { stdio: ['pipe', 'pipe', 'inherit'] });
let buf = ''; const waiters: ((l: string) => void)[] = [];
cap.stdout.on('data', d => { buf += d; let i; while ((i = buf.indexOf('\n')) >= 0) { const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1); waiters.shift()?.(line); } });
const reply = () => new Promise<string>(r => waiters.push(r));
await reply();
async function snap(name: string) {
  const file = path.join(outDir, name + '.png'); const r = reply();
  cap.stdin.write(`snap ${file} Aang Body\n`);
  check('snapshot ' + name, (await r).startsWith('ok'));
}

const logFile = path.join(process.env.APPDATA ?? '', 'Aang', 'body.log');
const logBefore = existsSync(logFile) ? readFileSync(logFile, 'utf8').length : 0;

const core = new Core({ port: 47831, dataDir, stateDir: dataDir, warm: true });
await core.start();
const body = spawn(bodyExe, ['--quiet=never'], { stdio: 'ignore' });

const client = new WebSocket('ws://127.0.0.1:47831/body');
await new Promise<void>(r => client.once('open', () => r()));
const inbox: any[] = [];
client.on('message', d => inbox.push({ at: Date.now(), ...JSON.parse(String(d)) }));

for (let i = 0; i < 100 && core.clientCount < 2; i++) await sleep(100);
check('the real Body connected to the Core', core.clientCount >= 2, `${core.clientCount} clients`);
await sleep(6000); // let the warm-up turn finish and the hello wave end
await snap('01_idle_connected');

async function conversation(id: string, text: string, tag: string) {
  const from = inbox.length; const t0 = Date.now();
  client.send(JSON.stringify({ t: 'submit', id, text }));
  const has = (f: (m: any) => boolean) => inbox.slice(from).find(f);
  const until = async (f: (m: any) => boolean, ms = 60000) => { const d = Date.now() + ms; while (Date.now() < d && !has(f)) await sleep(10); return has(f); };
  await until(m => m.t === 'bubble.dots'); await sleep(200); await snap(`${tag}_a_thinking`);
  await until(m => m.t === 'bubble' && m.stream === true, 30000);
  await sleep(120); await snap(`${tag}_b_streaming`);
  const fin = await until(m => m.t === 'bubble' && m.stream === false && m.id === id);
  await sleep(700); await snap(`${tag}_c_final`);
  // a long reply must begin at its first word and then page down at reading pace
  if ((fin?.text?.length ?? 0) > 150) { await sleep(4600); await snap(`${tag}_d_paged`); }
  // measured only after the turn is over (an earlier version sampled these too soon and reported wrong numbers)
  const tool = inbox.slice(from).find(m => m.t === 'tool');
  const streamed = inbox.slice(from).filter(m => m.t === 'bubble' && m.stream === true);
  const everShown = inbox.slice(from).filter(m => m.t === 'bubble').map(m => m.text as string);
  console.log(`      "${text}" -> ${JSON.stringify(fin?.text)}  (tool: ${tool ? tool.label : 'none'}, ${fin ? fin.at - t0 : '?'} ms, ${streamed.length} streamed updates)`);
  return { fin, streamed: streamed.length, tool, everShown };
}

const a = await conversation('e1', 'is it nice out', '02_weather');
check('weather reply reached the Body, grounded by a tool call', !!a.fin && /\d/.test(a.fin.text) && a.tool?.label === 'checking the weather', `receipt: ${a.tool?.label}`);
const b = await conversation('e2', 'tell me three quick facts about pelicans', '03_facts');
check('a longer reply streamed in several updates', b.streamed >= 2, `${b.streamed} streamed updates`);
const leaked = [...a.everShown, ...b.everShown].filter(t => /<\/?(thinking|reasoning|scratchpad|analysis)|Joshua is asking|any of my tools/i.test(t));
check('no private reasoning was ever shown, in any streamed update', leaked.length === 0, leaked.map(t => JSON.stringify(t.slice(0, 80))).join(' '));

// the Body must have logged a clean connection and no exceptions
await sleep(500);
const log = existsSync(logFile) ? readFileSync(logFile, 'utf8').slice(logBefore) : '';
check('Body log shows the Core connection', /core connected/.test(log));
check('Body log shows no exceptions', !/(exception|failed|fatal)/i.test(log), log.split('\n').filter(l => /(exception|failed|fatal)/i.test(l)).join(' | '));

cap.stdin.write('quit\n'); client.close(); body.kill(); await core.stop();
console.log(`\n${results.filter(Boolean).length}/${results.length} e2e checks passed; screenshots in ${outDir}`);
process.exit(results.every(Boolean) ? 0 : 1);
