// Tests start their own Body. If one is already running (the real one, now that Aang starts with Windows, or one
// still shutting down from the last test) wait for it to go, and stop with a clear message rather than kill it.
import { execSync } from 'node:child_process';
export async function requireNoBody(ms = 10000) {
  const running = () => execSync('tasklist /FI "IMAGENAME eq Aang.exe" /NH', { encoding: 'utf8' }).includes('Aang.exe');
  const end = Date.now() + ms;
  while (running() && Date.now() < end) await new Promise(r => setTimeout(r, 300));
  if (running()) { console.error('An Aang.exe is already running. Quit it from the tray first; the test will not kill it.'); process.exit(3); }
}
