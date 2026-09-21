// Tests start their own Body. If one is already running (the real one, now that Aang starts with Windows, or one
// still shutting down from the last test) wait for it to go, and stop with a clear message rather than kill it.
import { execSync } from 'node:child_process';
export async function requireNoBody(ms = 10000) {
  const running = () => execSync('tasklist /FI "IMAGENAME eq Aang.exe" /NH', { encoding: 'utf8' }).includes('Aang.exe');
  const end = Date.now() + ms;
  while (running() && Date.now() < end) await new Promise(r => setTimeout(r, 300));
  if (running()) { console.error('An Aang.exe is already running. Quit it from the tray first; the test will not kill it.'); process.exit(3); }
}

/**
 * The environment for a test's Core: its own COPY of Joshua's memory, never the real one.
 *
 * Found on 2026-09-20: six suites set a throwaway state folder but left the data folder at the default,
 * which is Joshua's real Documents/Aang. Every test conversation went into his real memory, and the
 * catch-up then turned them into "facts" - his memory said his raid group was "the Bleeding Edge", a
 * name invented for a test. Every Core a test starts goes through here.
 */
export function isolatedEnv(extra = {}) {
  const { mkdtempSync, existsSync, cpSync } = requireFs();
  const os = requireOs(); const path = requirePath();
  const real = path.join(os.homedir(), 'Documents', 'Aang');
  const dataDir = mkdtempSync(path.join(os.tmpdir(), 'aang-testdata-'));
  if (existsSync(path.join(real, 'Brain'))) cpSync(path.join(real, 'Brain'), path.join(dataDir, 'Brain'), { recursive: true });
  if (existsSync(path.join(real, 'aang.db'))) {
    const { DatabaseSync } = requireSqlite();
    const d = new DatabaseSync(path.join(real, 'aang.db'));
    d.exec(`VACUUM INTO '${path.join(dataDir, 'aang.db').split(String.fromCharCode(92)).join('/')}'`);
    d.close();
  }
  const stateDir = mkdtempSync(path.join(os.tmpdir(), 'aang-teststate-'));
  return { ...process.env, AANG_DATA_DIR: dataDir, AANG_STATE_DIR: stateDir, ...extra };
}
import { createRequire } from 'node:module';
const req = createRequire(import.meta.url);
const requireFs = () => req('node:fs');
const requireOs = () => req('node:os');
const requirePath = () => req('node:path');
const requireSqlite = () => req('node:sqlite');

// And by default, for everything this test process starts - including a Core the Body starts by itself,
// which never sees isolatedEnv. Found on 2026-09-20: tests also ran the real Body against Joshua's real
// settings, deleting his body.json and once leaving "saving" switched on, which stalled every later turn
// behind a consent question. Importing this file is enough to be kept off his files.
{
  const base = isolatedEnv();
  process.env.AANG_DATA_DIR = base.AANG_DATA_DIR;
  process.env.AANG_STATE_DIR = base.AANG_STATE_DIR;
  process.env.AANG_BODY_DIR = requireFs().mkdtempSync(requirePath().join(requireOs().tmpdir(), 'aang-testbody-'));
}

// Known environment limitation, found 2026-09-20: this is a Shadow cloud PC, and when Shadow's own
// "ShadowStreamer - Frame Generator" window holds focus (which happens whenever no other app does),
// synthetic mouse input from mouse_event never reaches any other window. Aang receives no WM_LBUTTONDOWN
// at all. Verified not to be an Aang bug: the identical click works with Notepad or WoW focused.
// So: click tests must put a real application in front first (the suites all call `focus WowB`).

/**
 * Put a real window in front before any click test. WoW is the realistic case, but when it is not running
 * the foreground falls to "ShadowStreamer - Frame Generator", and synthetic clicks then reach nothing at
 * all (see the note above). A throwaway Notepad stands in so the suites behave the same either way.
 * Returns the foreground title.
 */
export async function ensureForeground(ask) {
  const wow = await ask('focus WowB');
  if (/world of warcraft/i.test(wow)) return wow;

  // Whatever is already in front will do, as long as it is a real window. Opening one is a last resort:
  // a stand-in Notepad is clutter on Joshua's desktop, and if focus slips the test types into it.
  const current = await ask('fg');
  // Not a notification toast either: after a test closes its own window nothing has focus, and a toast
  // that took it went away mid-test (typing and chip failed on "New notification" in two full runs).
  // And never an app where stray keystrokes would do something: on 2026-09-20 the test typed with the Claude
  // app in front, one slipped focus away from sending test text into Joshua's own chat.
  if (current && !/ShadowStreamer|^Aang|New notification|Windows Input Experience|^Claude$|Spotify|Discord|Firefox/i.test(current)) return current;

  const { spawn } = await import('node:child_process');
  spawn('notepad.exe', [], { stdio: 'ignore', detached: true }).unref();
  await new Promise(r => setTimeout(r, 2500));
  openedStandIn = true;
  // Out of Aang's way: left where Windows puts it, the stand-in covers him and swallows the very clicks
  // the test is trying to make.
  await ask('movewin notepad 0 0 420 300');
  return ask('focus notepad');
}

/** True only when this run opened the stand-in, so nothing the user opened is ever closed. */
let openedStandIn = false;

/**
 * Close the Explorer windows a test opened on its own temp folders, and only those. actions.mjs and
 * window.mjs left them open on Joshua's desktop after every run.
 */
export function closeTestFolders(...prefixes) {
  const pattern = prefixes.map(p => p.replace(/[^a-z0-9-]/gi, '')).join('|');
  const ps = `(New-Object -ComObject Shell.Application).Windows() | Where-Object { $_.LocationURL -match '/Temp/(${pattern})' } | ForEach-Object { $_.Quit() }`;
  try { execSync(`powershell -NoProfile -Command "${ps}"`, { stdio: 'ignore' }); } catch { /* none open */ }
}

/** Close the stand-in window, if this run opened one. */
export async function releaseForeground() {
  if (!openedStandIn) return;
  openedStandIn = false;
  const { execSync } = await import('node:child_process');
  try { execSync('taskkill /IM notepad.exe /F', { stdio: 'ignore' }); } catch { /* none running */ }
}
