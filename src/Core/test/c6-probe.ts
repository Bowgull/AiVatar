// C6 probe (2026-10-22): which door can Aang use to START a Claude job without Joshua pressing Enter?
// docs/C6-PROMPT-RESEARCH.md section 3.3. Run it together, about 10 minutes:   cd src/Core && npm run c6-probe
//
// It needs Aang running on a build with C6 (the brain says c6 in its hello), and the aang-link mod from the same build.
// It talks to the brain exactly like the mod does (signed with this run's link.key), and the brain only ever sends its
// own fixed probe line ("reply with only the word PONG"), never words from here.
//   T1 (Door 1): opens claude://code/new?folder=<his Aang folder> with nothing typed. He clicks the folder box once and
//                types NOTHING. Did the new session's mod pick the start up and send it by itself?
//   T2 (Door 2): asks an open Claude session whether it can reach the Claude app's own session tools, and (only if he
//                says yes) tries start_session once.
// The verdict is saved by the brain in c6-door.json, and Aang uses that door from then on.
import { createHmac, randomBytes } from 'node:crypto';
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import readline from 'node:readline/promises';

const dataDir = process.env.AANG_DATA_DIR || path.join(os.homedir(), 'Documents', 'Aang');
const port = Number(process.env.AANG_PORT ?? 47831) + 1;
const base = `http://127.0.0.1:${port}`;
const mac = (key: string, ...parts: string[]) => createHmac('sha256', key).update(parts.join('\n')).digest('hex');
const nonce = () => randomBytes(16).toString('hex');
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
const say = (s: string) => console.log(s);

let key = '';
async function call(method: 'GET' | 'POST', pathQ: string, body = ''): Promise<any> {
  const ts = String(Date.now());
  const headers: Record<string, string> = { 'x-aang-link-ts': ts, 'x-aang-link-sig': mac(key, 'req', ts, method, pathQ, body) };
  if (body) headers['content-type'] = 'application/json';
  const r = await fetch(base + pathQ, { method, headers, ...(body ? { body } : {}), signal: AbortSignal.timeout(10_000) });
  if (!r.ok) throw new Error(`the brain answered ${r.status}`);
  const t = await r.text();
  return t ? JSON.parse(t) : {};
}
const probe = (ask: Record<string, unknown>) => call('POST', '/link/probe', JSON.stringify(ask));

async function main(): Promise<number> {
  try { key = readFileSync(path.join(dataDir, 'link.key'), 'utf8').trim(); }
  catch { say('Aang is not running (no link.key in ' + dataDir + '). Start Aang, then run this again.'); return 1; }
  const n = nonce();
  let hello: any;
  try { hello = await call('GET', `/link/hello?n=${n}`); }
  catch (e) { say('Aang did not answer on port ' + port + ': ' + (e as Error).message); return 1; }
  if (hello?.proof !== mac(key, 'hello', n)) { say('Something on the port is not Aang (wrong proof). Stopping.'); return 1; }
  if (hello?.c6 !== 1) { say('Aang is running an older build without C6. Restart Aang on the new build, then run this again.'); return 1; }
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const ask = async (q: string) => (await rl.question(q)).trim().toLowerCase();

  // ---------------------------------------------------------------- T1, Door 1
  say('\nT1 (Door 1): a new Claude window opens on your Aang folder with NOTHING typed in it.');
  say('  Click to confirm the folder in Claude\'s box. Do not type anything. Waiting up to 2 minutes.\n');
  const d1 = await probe({ op: 'door1' });
  if (!d1?.ok) { say('The brain would not start the probe: ' + (d1?.message ?? 'no reason')); rl.close(); return 1; }
  const link = `claude://code/new?folder=${encodeURIComponent(String(d1.folder))}`;
  try { spawn('rundll32.exe', ['url.dll,FileProtocolHandler', link], { detached: true, stdio: 'ignore' }).unref(); }
  catch (e) { say('Could not open the Claude app: ' + (e as Error).message); }
  let st: any = {}, was = '';
  for (let i = 0; i < 100; i++) {
    await sleep(1500);
    try { st = await probe({ op: 'status', id: d1.id }); } catch { continue; }
    const now = st.sent ? 'sent' : st.started ? 'started' : st.claimed ? 'claimed' : 'waiting';
    if (now !== was) { was = now; say(`  ${new Date().toLocaleTimeString()}  ${now === 'waiting' ? 'waiting for the new session...' : now === 'claimed' ? 'the new session asked for its start' : now === 'started' ? 'the session submitted the probe line by itself' : 'Claude is answering it (turn started)'}`); }
    if (st.sent) break;
  }
  const door1 = st.started === true;
  say(door1 ? '\nT1 PASSED: Door 1 works. You should see "PONG" in that window. You can close it.' : '\nT1 did not pass: the new session never took the start (the app may wait for a first message before it starts the engine).');

  // ---------------------------------------------------------------- T2, Door 2
  say('\nT2 (Door 2): asking an open Claude session whether it can reach the Claude app\'s own session tools...');
  let door2 = false, door2Args: { folder: string; prompt: string } | undefined;
  const c = await probe({ op: 'caps' });
  if (!c?.ok) say('  ' + (c?.message ?? 'no answer'));
  else {
    let caps: any = null;
    for (let i = 0; i < 20 && !caps; i++) { await sleep(1500); caps = (await probe({ op: 'caps.result' }))?.caps ?? null; }
    if (!caps) say('  No answer from that session (its mod may be an older build).');
    else {
      say(`  Session tools it can see: ${caps.ccd?.length ? caps.ccd.join(', ') : '(none listed)'}`);
      say(`  list_sessions through the mod: ${caps.listOk ? 'works' : 'does not work' + (caps.error ? ' (' + caps.error + ')' : '')}`);
      if (caps.listOk && (await ask('  Try Door 2 once? It opens ONE more Claude session that replies PONG. [y/N] ')) === 'y') {
        const folderKey = (await ask('  start_session folder argument name [cwd]: ')) || 'cwd';
        const promptKey = (await ask('  start_session prompt argument name [prompt]: ')) || 'prompt';
        const d2 = await probe({ op: 'door2', args: { folder: folderKey, prompt: promptKey } });
        if (!d2?.ok) say('  ' + (d2?.message ?? 'refused'));
        else {
          let res: any = null;
          for (let i = 0; i < 30 && !res; i++) { await sleep(1500); res = (await probe({ op: 'door2.result' }))?.result ?? null; }
          say(res ? `  start_session ${res.ok ? 'WORKED' : 'failed'}: ${res.text}` : '  No answer from start_session.');
          if (res?.ok) { door2 = true; door2Args = { folder: folderKey, prompt: promptKey }; }
          else if (res) say('  (If the text above names the right argument names, run this again and type them in.)');
        }
      }
    }
  }
  rl.close();

  // ---------------------------------------------------------------- the verdict
  const door = door1 ? 'link' : door2 ? 'door2' : 'prefill';
  await probe({ op: 'save', door, ...(door2Args ? { door2Args } : {}), linkOk: door1 });
  say(`\nVERDICT: ${door === 'link' ? 'Door 1. Aang opens a new session, you click the folder box once, and it sends itself.'
    : door === 'door2' ? 'Door 2. Aang starts jobs through an open Claude session; no Enter, no folder box.'
    : 'Neither door. Aang keeps typing the request in for you to press Enter, and the card says so.'}`);
  say('Saved in c6-door.json; Aang uses it from the next job on.');
  return 0;
}

main().then(code => process.exit(code), e => { console.error('The probe stopped: ' + (e as Error).message); process.exit(1); });
