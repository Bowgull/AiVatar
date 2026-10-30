// M2, run by hand (not part of npm test: it takes about a minute). Runs the REAL heartbeat script from the Mac
// setup against a stand-in Shadow on this PC: the state must go to "on", then to "off" about 30 s after the
// brain stops answering. Needs bash and curl (Git Bash has both).
//
// Run: node --no-warnings test/heartbeat-live.ts
import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { HookServer } from '../src/hooks.ts';
import { macSetupScript } from '../src/macsetup.ts';

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const dir = mkdtempSync(path.join(os.tmpdir(), 'aang-heartbeat-'));
const KEY = 'h'.repeat(24);
const setup = macSetupScript('100.1.2.3', 48421, KEY, 'f'.repeat(24));
let hb = /cat > "\$DIR\/heartbeat\.sh" <<'HEARTBEAT'\n([\s\S]*?)HEARTBEAT\n/.exec(setup)![1]!;
// The Mac's curl is /usr/bin/curl; on this PC it is wherever Git Bash keeps it. Nothing else changes.
hb = hb.replace('/usr/bin/curl', 'curl');
writeFileSync(path.join(dir, 'heartbeat.sh'), hb);
writeFileSync(path.join(dir, 'alive.curl'), `url = "http://127.0.0.1:48421/alive"\nheader = "x-aang-key: ${KEY}"\n`);
const state = () => { try { return readFileSync(path.join(dir, 'shadow.state'), 'utf8').trim(); } catch { return '(none)'; } };

let desk = true;
const s = new HookServer(48421, () => {}, KEY, null, () => ({ up: true, atDesk: desk }));
await s.start();
const bash = spawn('bash', [path.join(dir, 'heartbeat.sh').replace(/\\/g, '/')], { stdio: 'ignore' });
let bad = 0;
const check = (what: string, ok: boolean) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${what}  -- ${state()}`); if (!ok) bad++; };
try {
  await wait(3000);
  check('Shadow up and he is at it: "on desk"', state().startsWith('on desk'));
  desk = false;
  await wait(11_000);
  check('he walked away from the PC: "on away"', state().startsWith('on away'));
  await s.stop();
  await wait(15_000);
  check('one or two misses are not "off" yet', state().startsWith('on '));
  await wait(25_000);
  check('three misses in a row: "off"', state().startsWith('off'));
} finally { bash.kill(); await s.stop().catch(() => {}); }
console.log(bad ? `${bad} failed` : 'all passed');
process.exit(bad ? 1 : 0);
