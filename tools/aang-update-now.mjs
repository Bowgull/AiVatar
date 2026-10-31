// His "update Aang now" (2026-10-31, his pick: Claude does it, no button). Asks the brain on this machine to look on
// GitHub and put in what is new for Aang (his brain and his Mac app) right away, instead of waiting until he has been
// away half an hour. Never in a call; the old copies are kept and the watchdog puts them back if the new ones fail.
// Signed with the brain's key for this run (link.key, the same lock as the aang-link mod), so only a program that can
// read his Aang folder can ask. Then it waits until the brain and Aang's app are back, and says so.
// Run: node tools/aang-update-now.mjs
import { createHmac, randomBytes } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync, statSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const dataDir = process.env.AANG_DATA_DIR || path.join(process.env.USERPROFILE || os.homedir(), 'Documents', 'Aang');
const keyFile = path.join(dataDir, 'link.key');
const base = `http://127.0.0.1:${Number(process.env.AANG_PORT || 47831) + 1}`;
const mac = (key, ...parts) => createHmac('sha256', key).update(parts.join('\n')).digest('hex');
const key = () => readFileSync(keyFile, 'utf8').trim();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function call(method, url, body = '') {
  const k = key(), ts = String(Date.now());
  const r = await fetch(base + url, { method, body: method === 'POST' ? body : undefined, signal: AbortSignal.timeout(120_000),
    headers: { 'Content-Type': 'application/json', 'x-aang-link-ts': ts, 'x-aang-link-sig': mac(k, 'req', ts, method, url, body) } });
  return { status: r.status, json: r.status === 200 ? await r.json() : null, key: k };
}
/** The brain is up and holds the key now in link.key (it proves it, as it does for the mod). */
async function brainUp() {
  try { const n = randomBytes(16).toString('hex'), r = await call('GET', `/link/hello?n=${n}`); return r.status === 200 && r.json?.proof === mac(r.key, 'hello', n); } catch { return false; }
}
/** Aang's Mac app is running (launchd's pid for it), or null off the Mac. */
function petPid() {
  if (process.platform !== 'darwin') return null;
  try { return /\n\s*pid = (\d+)/.exec(execFileSync('launchctl', ['print', `gui/${process.getuid()}/com.aang.pet`], { encoding: 'utf8' }))?.[1] ?? ''; } catch { return ''; }
}

let keyAt = 0; try { keyAt = statSync(keyFile).mtimeMs; } catch { console.log(`No brain key at ${keyFile}: is Aang's brain running on this machine?`); process.exit(1); }
if (!(await brainUp())) { console.log("Aang's brain is not answering on this machine."); process.exit(1); }
const pet0 = petPid();
const r = await call('POST', '/link/update-now', '{}');
if (r.status !== 200 || !r.json) { console.log(`The brain said no (${r.status}).`); process.exit(1); }
console.log(r.json.message);
if (!r.json.ok || !/^Putting in/.test(r.json.message)) process.exit(r.json.ok ? 0 : 1);

// Wait for what was put in to come back (up to four minutes).
const brainNew = /brain \d/.test(r.json.message), appNew = /app \d/.test(r.json.message);
let brainBack = !brainNew, appBack = !appNew;
for (let i = 0; i < 48 && !(brainBack && appBack); i++) {
  await sleep(5000);
  if (!brainBack) { let at = 0; try { at = statSync(keyFile).mtimeMs; } catch { /* restarting */ } brainBack = at > keyAt && await brainUp(); }
  if (!appBack) { const p = petPid(); appBack = p === null || (!!p && p !== pet0); }
}
if (brainNew) console.log(brainBack ? "Aang's brain is back." : "Aang's brain is not back after four minutes: the watchdog puts the old one back if it never gets going.");
if (appNew) console.log(appBack ? "Aang's app is back." : "Aang's app is not back after four minutes: the watchdog puts the old one back if it does not stay up.");
process.exit(brainBack && appBack ? 0 : 1);
