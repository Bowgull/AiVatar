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
  const { spawn } = await import('node:child_process');
  if (!/notepad/i.test(await ask('fg'))) {
    spawn('notepad.exe', [], { stdio: 'ignore', detached: true }).unref();
    await new Promise(r => setTimeout(r, 2500));
  }
  // Shove it into the top-left corner. Left where Windows puts it, the stand-in window sits over Aang and
  // swallows the very clicks the test is trying to make - which is exactly what broke the chip and rate
  // suites once this helper was introduced.
  await ask('movewin notepad 0 0 420 300');
  return ask('focus notepad');
}

/** Close the stand-in window, if we opened one. */
export async function releaseForeground() {
  const { execSync } = await import('node:child_process');
  try { execSync('taskkill /IM notepad.exe /F', { stdio: 'ignore' }); } catch { /* none running */ }
}
