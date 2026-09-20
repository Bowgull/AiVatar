// Full stack: real Core + real Claude + the real Body on screen over the game, photographed at each moment.
//   npm run e2e        (needs the Body built in Release, and Body not already running)
import { WebSocket } from 'ws';
import { spawn, execSync } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Core } from '../src/core.ts';

const repo = path.resolve(import.meta.dirname, '..', '..', '..');
const bodyExe = path.join(repo, 'src', 'Body', 'bin', 'Release', 'net10.0-windows', 'Aang.exe');
const capture = path.join(repo, 'tools', 'measure', 'Capture.ps1');
const keysPs = path.join(repo, 'tools', 'measure', 'Keys.ps1');
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

// a real keyboard and mouse, so the last leg (Joshua typing) is tested too, not simulated over the socket
const keys = spawn('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', keysPs, '-Serve'], { stdio: ['pipe', 'pipe', 'inherit'] });
let kbuf = ''; const kwait: ((l: string) => void)[] = [];
keys.stdout.on('data', d => { kbuf += d; let i; while ((i = kbuf.indexOf('\n')) >= 0) { const line = kbuf.slice(0, i).trim(); kbuf = kbuf.slice(i + 1); kwait.shift()?.(line); } });
const ask = (line: string) => new Promise<string>(r => { kwait.push(r); keys.stdin.write(line + '\n'); });
kwait.push(() => {});

// the Body may already be running (it starts with Windows now); these tests start their own
if (execSync('tasklist /FI "IMAGENAME eq Aang.exe" /NH', { encoding: 'utf8' }).includes('Aang.exe')) {
  console.error('An Aang.exe is already running. Quit it from the tray first; this test will not kill it.');
  process.exit(3);
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

// ---- the real last leg: click Aang, type with a real keyboard, read the answer off the screen
const rect = (await ask('rect Aang Body')).split(' ').map(Number);
const [L, T] = rect;
const beforeTyped = inbox.length;
await ask(`click ${L + 360} ${T + 110 + 215}`);                       // click Aang himself
const fg = await ask('fg');
check('clicking Aang opens the input box over the desktop', /Aang Input/.test(fg), fg);
await snap('04_typed_a_box_open');
await ask('send what day is it{ENTER}');
const typed = await (async () => { const d = Date.now() + 60000; while (Date.now() < d) { const m = inbox.slice(beforeTyped).find(x => x.t === 'bubble' && x.stream === false && x.id?.startsWith('u')); if (m) return m; await sleep(50); } return null; })();
check('a question typed by hand reaches Claude and comes back as a reply', !!typed && typed.text.length > 0, JSON.stringify(typed?.text));
await sleep(600); await snap('04_typed_b_answer');
const submitted = core.lastSubmitText;
check('the Core received exactly what was typed', submitted === 'what day is it', JSON.stringify(submitted));

// rate that reply from the bubble; the Core must write it down
const ratings = path.join(dataDir, 'ratings.jsonl');
await ask(`move ${L + 120} ${T + 110 + 105}`); await sleep(300);
await snap('05_rate_a_hover');
await ask(`click ${L + 218} ${T + 110 + 69}`);                        // the "good" button
await sleep(500); await snap('05_rate_b_rated');
const rated = existsSync(ratings) ? readFileSync(ratings, 'utf8').trim().split('\n').map(l => JSON.parse(l)) : [];
check('the rating is written next to the turn it is about', rated.length === 1 && rated[0].value === 'up' && rated[0].reply === typed?.text, JSON.stringify(rated[0]?.value) + ' ' + JSON.stringify(rated[0]?.user));

keys.stdin.write('quit\n');
cap.stdin.write('quit\n'); client.close(); body.kill(); await core.stop();
console.log(`\n${results.filter(Boolean).length}/${results.length} e2e checks passed; screenshots in ${outDir}`);
process.exit(results.every(Boolean) ? 0 : 1);
