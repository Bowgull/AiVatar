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
process.on('SIGINT', async () => { await core.stop(); process.exit(0); });

await core.start();
// Discord, if Joshua has set it up. It connects OUT to Discord and back into this Core, and Aang runs without it.
// Loaded only when used, so Aang without Discord carries none of it.
if (existsSync(path.join(core.cfg.stateDir, 'discord.token'))) {
  void import('./discord-gateway.ts').then(d => d.startDiscord(core.cfg.stateDir, core.cfg.port)).catch(e => console.error('discord: ' + (e as Error).message));
}
