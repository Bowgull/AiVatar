// Register Joshua's vault with Obsidian so it opens straight into it.
// Written as a file rather than an inline -e: the vault path contains "\07_Knowledge", and a shell
// treats \07 as an octal escape, which silently turned it into a bell character on the first try.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const vault = ['G:', 'My Drive', 'CereBro-Vault', '07_Knowledge', 'obsidian-vault'].join('\\');
const cfgDir = path.join(process.env.APPDATA, 'obsidian');
const file = path.join(cfgDir, 'obsidian.json');

if (!fs.existsSync(vault)) { console.error('vault not found at ' + vault); process.exit(1); }
if (!fs.existsSync(path.join(vault, '.obsidian'))) { console.error('no .obsidian folder; that is not a vault root'); process.exit(1); }

// Obsidian keys each vault by a 16-char hex id. Any stable id works; deriving it from the path
// means re-running this is idempotent rather than adding a duplicate entry.
const id = crypto.createHash('md5').update(vault.toLowerCase()).digest('hex').slice(0, 16);

let j = { vaults: {} };
try { j = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { /* first run */ }
j.vaults = j.vaults ?? {};
j.vaults[id] = { path: vault, ts: Date.now(), open: true };

fs.mkdirSync(cfgDir, { recursive: true });
fs.writeFileSync(file, JSON.stringify(j, null, 2));

console.log('vault :', vault);
console.log('id    :', id);
console.log('notes :', fs.readdirSync(vault).filter(f => f.endsWith('.md')).length, 'at the top level');
console.log('config:', file);
