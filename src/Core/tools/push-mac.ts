// Push the finished version to the MacBook over SSH, without the brain (2026-10-20, his ask: "push both when
// something is complete"). The update key on the Mac only hears of an update through the brain on this PC; when Aang is
// closed and Samara runs alone, the Mac got nothing. This builds the very same signed update the brain would send
// (macship.ts, for the commit in his Aang folder's mac-ship) and runs it on the Mac the way Samara's own update key
// does: "prepare" at background priority, then "swap" on its own, its output in update.log, so the report Samara sends
// on its next start still works.
//
//   node --no-warnings src/Core/tools/push-mac.ts [--dry] [--force] [--host <ssh host>] [--state <dir>] [--data <dir>]
//
// --dry   builds, signs and checks the Mac (read-only), but sends and runs nothing, and writes nothing here.
// --force installs even if the Mac was used in the last 3 minutes. Never during a call.
// Exit codes: 0 done (or already up to date), 1 something failed, 3 the Mac is busy (try later), 4 the keys do not match.
//
// Nothing secret is printed: the script carries Aang's keys, so only its size and fingerprint are shown.
import { spawnSync } from 'node:child_process';
import { verify } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { tailnetAddress } from '../src/hooks.ts';
import * as ship from '../src/macship.ts';

const args = process.argv.slice(2);
const flag = (n: string) => args.includes(n);
const opt = (n: string) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : undefined; };
const dry = flag('--dry'), force = flag('--force');
const host = opt('--host') ?? 'joshs-macbook-pro';
const home = os.homedir();
const repoRoot = path.join(import.meta.dirname, '..', '..', '..');
const dataDir = opt('--data') ?? process.env.AANG_DATA_DIR ?? path.join(home, 'Documents', 'Aang');
/** The brain's state folder. From Claude's shell, %APPDATA% is a private copy of the real one (writes there never reach
 *  Aang), so the real folder is read through the machine's own admin share instead, when it is there. Only read. */
const stateDir = opt('--state') ?? process.env.AANG_STATE_DIR ?? (() => {
  const real = path.join(process.env.APPDATA ?? path.join(home, 'AppData', 'Roaming'), 'Aang');
  const m = /^([A-Za-z]):\\(.*)$/.exec(real);
  const unc = m ? `\\\\localhost\\${m[1]!.toLowerCase()}$\\${m[2]}` : '';
  return unc && existsSync(path.join(unc, 'mac-update-sign.pem')) ? unc : real;
})();
const hookPort = Number(process.env.AANG_PORT ?? 47831) + 1;
/** Where this tool keeps its own frozen copy of the shipped commit (gitignored), apart from the brain's. */
const releaseDir = path.join(repoRoot, '.mac-push', 'release');
const IDLE_NEEDED = 180;

const say = (s: string) => console.log(s);
function stop(code: number, s: string): never { console.log(s); process.exit(code); }

// ---- SSH: every remote step is a small bash script sent on stdin (his Mac's login shell is zsh).
const D = '"$HOME/Library/Application Support/AangListener"';
function remote(script: string, opts: { input?: Buffer; args?: string[]; timeout?: number } = {}): { code: number; out: string } {
  const sshArgs = ['-o', 'BatchMode=yes', '-o', 'ConnectTimeout=15', '-o', 'ServerAliveInterval=15', host];
  // With input, the data is stdin and the script goes on the command line (it is short and holds no secrets).
  const cmd = opts.input ? `/bin/bash -c '${script.replace(/'/g, `'\\''`)}' push ${(opts.args ?? []).map(a => `'${a}'`).join(' ')}`
    : `/bin/bash -s -- ${(opts.args ?? []).map(a => `'${a}'`).join(' ')}`;
  const r = spawnSync('ssh', [...sshArgs, cmd], { input: opts.input ?? script, encoding: 'utf8', timeout: opts.timeout ?? 60_000, maxBuffer: 16 * 1024 * 1024 });
  return { code: r.status ?? -1, out: `${r.stdout ?? ''}${r.stderr ?? ''}`.trim() };
}

/** What the Mac has and is doing, read only. */
function macState() {
  const r = remote(`D=${D}; U="$HOME/Library/Application Support/Aang"
printf 'installed\\t%s\\n' "$(tr -d '\\n' < "$D/browser/installed.json" 2>/dev/null)"
printf 'staged\\t%s\\n' "$(cat "$D/browser/staged/version" 2>/dev/null)"
printf 'call\\t%s\\n' "$([ -f "$U/in-call.json" ] && echo yes)"
printf 'samara\\t%s\\n' "$(pgrep -f 'Samara.app/Contents/MacOS/' >/dev/null && echo yes)"
printf 'idle\\t%s\\n' "$(ioreg -c IOHIDSystem | awk '/HIDIdleTime/ {print int($NF/1000000000); exit}')"
printf 'pub\\t%s\\n' "$(base64 < "$D/update-sign.pub" 2>/dev/null | tr -d '\\n')"
printf 'failed\\t%s\\n' "$(tr '\\n' ' ' < "$D/browser/failed-updates.txt" 2>/dev/null)"
printf 'busy\\t%s\\n' "$(pgrep -f 'AangListener/update.sh (prepare|swap|post)' >/dev/null && echo yes)"
printf 'node\\t%s\\n' "$([ -x "$D/node/bin/node" ] && echo yes)"
`);
  if (r.code !== 0) stop(1, `Could not reach the Mac over SSH (${host}): ${r.out.split('\n').pop()}`);
  const kv = Object.fromEntries(r.out.split('\n').map(l => l.split('\t')).filter(p => p.length === 2) as [string, string][]);
  let installed = { version: '', commit: '', status: '' };
  try { const j = JSON.parse(kv.installed || '{}'); installed = { version: String(j.version ?? ''), commit: String(j.commit ?? ''), status: String(j.status ?? '') }; } catch { /* none */ }
  return {
    installed, staged: kv.staged ?? '', inCall: kv.call === 'yes' && kv.samara === 'yes', idle: Number(kv.idle ?? NaN),
    pub: kv.pub ? Buffer.from(kv.pub, 'base64').toString('utf8') : '', failed: (kv.failed ?? '').split(/\s+/).filter(Boolean),
    busy: kv.busy === 'yes', node: kv.node === 'yes',
  };
}

// ---- 1. The update, exactly as the brain builds it.
const root = ship.releaseRoot(repoRoot, dataDir, releaseDir, false);
if (!root) stop(1, `No finished version to send: ${path.join(dataDir, 'mac-ship')} is missing, or its commit could not be checked out.`);
const release = ship.releaseOf(repoRoot, root!);
if (!release.version || !release.commit) stop(1, 'Could not work out the finished version.');
const tailnet = tailnetAddress();
if (!tailnet) stop(1, 'This PC has no Tailscale address, so the Mac would not know where to reach it.');
let macAddr: string | null = null;
try { macAddr = String(JSON.parse(readFileSync(path.join(stateDir, 'mac.json'), 'utf8')).addr || '') || null; } catch { /* unknown */ }
let key: ship.UpdateKey, hookKey: string, frontKey: string;
try {
  key = ship.loadUpdateKey(stateDir, false);
  hookKey = ship.readKey(dataDir, 'hook.key', false); frontKey = ship.readKey(dataDir, 'mac-front.key', false);
} catch (e) { stop(1, `Missing a key this update needs (${(e as Error).message}). Set the Mac up through Aang first.`); }
const frozen = await ship.loadFrozen(root!, release.commit);
const desk = ship.frontDeskFor({ root: root!, stateDir, macAddr, bundle: frozen.bundle, bsyncKey: () => ship.readKey(dataDir, 'bsync.key', false), pcHalf: false, log: () => {} });
if (!desk?.browser) stop(1, 'Could not put the update together (no Mac address, Discord token or browser bundle on this PC).');

// ---- 2. The Mac first: nothing is recorded or sent unless it wants this version and is free.
const mac = macState();
if (mac.installed.version === release.version) stop(0, `The Mac already has this version (${release.version}, commit ${release.commit}). Nothing to do.`);
if (mac.pub && mac.pub.trim() !== key!.pub.trim()) stop(4, "The Mac holds a different update key than this PC's, so it would refuse this update. Not sent.");
if (mac.inCall) stop(3, "You're in a call on the Mac; try again later.");
if (mac.busy) stop(3, 'The Mac is already in the middle of an update; try again later.');
if (!mac.node) stop(1, "The Mac has no Aang Node yet (run the Mac setup once instead).");
if (mac.failed.includes(release.version) && !force) stop(3, `This version failed on the Mac before (or he skipped it). Use --force to send it anyway.`);
const idleOk = Number.isFinite(mac.idle) && mac.idle >= IDLE_NEEDED;
if (!idleOk && !force && !dry) stop(3, `The Mac is in use (idle ${mac.idle}s, needs ${IDLE_NEEDED}s); try again later.`);

// ---- 3. His release number and name, the same bookkeeping as the brain's offer (mac-releases.json in his Aang folder).
const list = ship.readReleases(dataDir);
const { e: rel, added } = ship.releaseNo(list, release.version, release.commit, () => ship.whatsNew(root!, dataDir));
const changelog = ship.changelogText(list, ship.whatsNew(root!, dataDir));
const { script, sha256, sig } = ship.signedUpdate(frozen, { tailnet: tailnet!, hookPort, hookKey: hookKey!, frontKey: frontKey!, desk, release, changelog, key: key! });
if (!verify(null, Buffer.from(script), key!.pub, Buffer.from(sig, 'base64'))) stop(1, 'The signature did not check out here; not sent.');

const summary = `Version ${rel.semver}: ${rel.name} (${release.version}, commit ${release.commit}), ${Math.round(script.length / 1024)} KB, sha256 ${sha256.slice(0, 16)}`;
if (dry) {
  say(`Dry run. Would send ${summary}.`);
  say(`From: ${root} | state: ${stateDir} | PC ${tailnet}:${hookPort} | Mac ${macAddr ?? 'unknown'} via ${host}`);
  say(`The Mac runs ${mac.installed.version || 'nothing yet'} (${mac.installed.status || 'no status'}); staged: ${mac.staged || 'none'}; idle ${mac.idle}s; in a call: ${mac.inCall ? 'yes' : 'no'}; update key ${mac.pub ? 'matches' : 'not on the Mac yet'}.`);
  say(added ? `New release number; a real run records it in mac-releases.json.` : `Release number already recorded.`);
  say(idleOk ? 'The Mac is free: a real run would install now.' : `The Mac is in use: a real run would wait (exit 3) unless --force.`);
  process.exit(0);
}
if (added) {
  try { ship.saveReleases(dataDir, list); ship.writeChangelogFile(dataDir, changelog); } catch (e) { console.error('could not record the release: ' + (e as Error).message); }
}

// ---- 4. Copy it over, and have the Mac check it itself, as Samara does: the fingerprint, and the PC's signature
// against the key the Mac already holds (a first update brings that key, so then there is nothing to check against).
say(`Sending ${summary}...`);
const put = remote(`D=${D}; umask 077; cat > "$D/update.sh.new" && [ "$(shasum -a 256 "$D/update.sh.new" | cut -d' ' -f1)" = "$1" ] || { rm -f "$D/update.sh.new"; echo "the copy on the Mac did not match"; exit 2; }
if [ -f "$D/update-sign.pub" ]; then
  "$D/node/bin/node" -e 'const c=require("crypto"),fs=require("fs");const [f,p,s]=process.argv.slice(1);process.exit(c.verify(null,fs.readFileSync(f),fs.readFileSync(p,"utf8"),Buffer.from(s,"base64"))?0:1)' "$D/update.sh.new" "$D/update-sign.pub" "$2" || { rm -f "$D/update.sh.new"; echo "the update was not signed by the PC"; exit 3; }
fi
head -c 11 "$D/update.sh.new" | grep -q '^#!/bin/bash' || { rm -f "$D/update.sh.new"; echo "not an update script"; exit 2; }
mv "$D/update.sh.new" "$D/update.sh" && chmod 700 "$D/update.sh"`, { input: Buffer.from(script), args: [sha256, sig], timeout: 10 * 60_000 });
if (put.code !== 0) stop(1, `The Mac did not take the update: ${put.out || 'ssh exit ' + put.code}`);

// Run detached in its own session (like Samara's spawn with detached), so a dropped SSH line cannot stop it part way.
const detach = (inner: string) => `perl -MPOSIX -e 'fork and exit; POSIX::setsid(); exec @ARGV' /bin/bash -c '${inner}' </dev/null >/dev/null 2>&1`;

// ---- 5. Prepare: the new Samara made in the background, at low priority (taskpolicy -b), while he works.
say('Getting it ready on the Mac (in the background)...');
const go = remote(`D=${D}; rm -f "$D/update-prepare.exit"; ${detach(`D="$HOME/Library/Application Support/AangListener"; /usr/sbin/taskpolicy -b /bin/bash "$D/update.sh" prepare >"$D/update-prepare.log" 2>&1; echo $? >"$D/update-prepare.exit"`)}`);
if (go.code !== 0) stop(1, `Could not start getting it ready: ${go.out}`);
const wait = (ms: number) => new Promise(r => setTimeout(r, ms));
let prepared = '';
for (const until = Date.now() + 30 * 60_000; Date.now() < until;) {
  await wait(10_000);
  const r = remote(`D=${D}; cat "$D/update-prepare.exit" 2>/dev/null; printf '/'; cat "$D/browser/staged/version" 2>/dev/null`);
  const [code, staged] = r.out.split('/');
  if (code?.trim()) { prepared = code.trim() === '0' && staged?.trim() === release.version ? 'ok' : `exit ${code.trim()}`; break; }
}
if (prepared !== 'ok') {
  const log = remote(`D=${D}; tail -5 "$D/update-prepare.log" 2>/dev/null`);
  stop(1, `Getting it ready failed (${prepared || 'timed out'}); nothing changed on the Mac. Last lines:\n${log.out}`);
}

// ---- 6. Swap: the same checks as his Restart now, again, since time has passed. Then Samara closes and opens new.
const now = macState();
if (now.inCall) stop(3, "Ready on the Mac, but you're in a call now; it was not swapped in. Press UPDATE in Samara later, or run this again.");
if (!force && !(now.idle >= IDLE_NEEDED)) stop(3, `Ready on the Mac, but it is in use now (idle ${now.idle}s); try again later.`);
const sw = remote(`D=${D}; ${detach(`D="$HOME/Library/Application Support/AangListener"; exec /bin/bash "$D/update.sh" swap >"$D/update.log" 2>&1`)}`);
if (sw.code !== 0) stop(1, `Could not start the swap: ${sw.out}`);
say('Swapping it in; Samara closes and opens again...');

// ---- 7. The outcome: the new Samara marks itself good after a minute up; the swap puts the old one back if it does not start.
for (const until = Date.now() + 5 * 60_000; Date.now() < until;) {
  await wait(15_000);
  const s = macState();
  if (s.installed.version === release.version && s.installed.status === 'good') stop(0, `Done. The Mac runs ${summary.split(' (')[0]}.`);
  if (s.failed.includes(release.version) || (!s.busy && s.installed.version !== release.version)) {
    stop(1, `The update did not take; the Mac is back on ${s.installed.version || 'the old version'}. See update.log in AangListener on the Mac.`);
  }
}
stop(0, `Installed; the Mac runs ${release.version} but has not marked it good yet. Check again in a minute.`);
