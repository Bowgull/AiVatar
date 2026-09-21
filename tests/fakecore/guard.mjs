// Tests start their own Body. If one is already running (the real one, now that Aang starts with Windows, or one
// still shutting down from the last test) wait for it to go, and stop with a clear message rather than kill it.
import { execSync } from 'node:child_process';
export async function requireNoBody(ms = 10000) {
  const running = () => execSync('tasklist /FI "IMAGENAME eq Aang.exe" /NH', { encoding: 'utf8' }).includes('Aang.exe');
  const end = Date.now() + ms;
  while (running() && Date.now() < end) await new Promise(r => setTimeout(r, 300));
  if (running()) { console.error('An Aang.exe is already running. Quit it from the tray first; the test will not kill it.'); process.exit(3); }
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
  if (current && !/ShadowStreamer|^Aang/i.test(current)) return current;

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

/** Close the stand-in window, if this run opened one. */
export async function releaseForeground() {
  if (!openedStandIn) return;
  openedStandIn = false;
  const { execSync } = await import('node:child_process');
  try { execSync('taskkill /IM notepad.exe /F', { stdio: 'ignore' }); } catch { /* none running */ }
}
