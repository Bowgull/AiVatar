import { existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Core } from './core.ts';

const home = os.homedir();
const core = new Core({
  port: Number(process.env.AANG_PORT ?? 47831),
  dataDir: process.env.AANG_DATA_DIR ?? path.join(home, 'Documents', 'Aang'),
  stateDir: process.env.AANG_STATE_DIR ?? path.join(process.env.APPDATA ?? path.join(home, 'AppData', 'Roaming'), 'Aang'),
  claudeExecutable: process.env.AANG_CLAUDE_EXE || undefined,
  warm: process.env.AANG_WARM !== '0',
});

process.on('unhandledRejection', e => console.error('unhandled rejection:', e));
process.on('uncaughtException', e => console.error('uncaught exception:', e));
/**
 * Shut down once, cleanly, however the request arrives.
 *
 * Only SIGINT was trapped, which in practice meant the cleanup almost never ran: the Body kills the Core
 * with Kill(entireProcessTree: true), and Windows has no way to send a real SIGTERM from .NET at all, so
 * every ordinary restart was a hard kill. Pending permission questions were left unanswered and the
 * database never got a clean close.
 *
 * Guarded against running twice, because two signals can arrive together, and bounded by a timer: a stop()
 * that hangs must not leave a Core alive refusing to die, which is worse than the hard kill it replaced.
 */
let stopping = false;
export async function shutdown(why: string): Promise<void> {
  if (stopping) return;
  stopping = true;
  // Worth knowing if you are ever debugging this: core.log will NOT show this line. The Body tears the log
  // drain down as it closes, so anything written to stderr during shutdown is lost. Proving this path runs
  // at all took writing to a file instead (2026-10-03).
  console.error(`shutting down: ${why}`);
  const giveUp = setTimeout(() => { console.error('shutdown took too long; exiting anyway'); process.exit(0); }, 5000);
  giveUp.unref?.();
  try { await core.stop(); } catch (e) { console.error('shutdown failed:', (e as Error).message); }
  clearTimeout(giveUp);
  process.exit(0);
}

process.on('SIGINT', () => { void shutdown('SIGINT'); });
process.on('SIGTERM', () => { void shutdown('SIGTERM'); });
core.onShutdownRequest = () => { void shutdown('the Body is closing'); };

await core.start();
// Discord, if Joshua has set it up. It connects OUT to Discord and back into this Core, and Aang runs without it.
// Loaded only when used, so Aang without Discord carries none of it.
if (existsSync(path.join(core.cfg.stateDir, 'discord.token'))) {
  void import('./discord-gateway.ts').then(d => d.startDiscord(core.cfg.stateDir, core.cfg.port)).catch(e => console.error('discord: ' + (e as Error).message));
}
