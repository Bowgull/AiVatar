// Prints each phone's pairing link for the Omashu fire remote (omashuremote.ts). Open a link once on that phone, on the
// home Wi-Fi, then Share > Add to Home Screen. The links hold the phone's key: send them only to that phone (AirDrop).
//   node --no-warnings src/omashupair.ts
import os from 'node:os';
import path from 'node:path';
import { loadRemoteConfig, REMOTE_PORT } from './omashuremote.ts';
import { isHomeAddress } from './omashu.ts';

const stateDir = process.env.AANG_STATE_DIR ?? path.join(os.homedir(), 'Library', 'Application Support', 'Aang');
const file = path.join(stateDir, 'omashu-remote.json');
const cfg = loadRemoteConfig(file);
if (!cfg) { console.log(`No settings yet: ${file}`); process.exit(1); }
const ip = Object.values(os.networkInterfaces()).flat().find(a => a && a.family === 'IPv4' && !a.internal && isHomeAddress(a.address))?.address ?? '<this Mac\'s Wi-Fi address>';
for (const p of cfg.phones) console.log(`${p.name}${p.chat ? ' (with WoW chat)' : ''}: http://${ip}:${cfg.port ?? REMOTE_PORT}/pair/${p.key}`);
