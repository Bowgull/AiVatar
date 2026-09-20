// Teach Claude Code to tell Aang what it is doing.
//
//   node tools/install-hooks.mjs            show what would change
//   node tools/install-hooks.mjs --apply    write it (the old file is backed up first)
//   node tools/install-hooks.mjs --remove   take Aang's hooks back out
//
// Only Aang's own hook entries are touched; anything else in settings.json is left exactly as it was.
// Each hook is one curl with a 2 second cap that posts the event Claude Code already hands it. The endpoint
// answers 204 with no body, so nothing is ever printed (a UserPromptSubmit hook's stdout would otherwise be
// added to the prompt). If Aang is not running, curl fails at once and `|| exit 0` keeps the session clean.
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const PORT = Number(process.env.AANG_PORT ?? 47831) + 1;
const settingsPath = path.join(os.homedir(), '.claude', 'settings.json');
const EVENTS = ['SessionStart', 'UserPromptSubmit', 'Notification', 'Stop', 'SessionEnd'];
const MARK = 'aang-hook';   // how Aang recognises its own entries later

const command = (event) =>
  `curl -s -m 2 -X POST -H "Content-Type: application/json" --data-binary @- ` +
  `http://127.0.0.1:${PORT}/hook?e=${event} || exit 0`;

const isAang = (h) => typeof h?.command === 'string' && (h.command.includes(`/hook?e=`) || h.command.includes(MARK));

const apply = process.argv.includes('--apply');
const remove = process.argv.includes('--remove');

let settings = {};
if (existsSync(settingsPath)) {
  try { settings = JSON.parse(readFileSync(settingsPath, 'utf8')); }
  catch (e) { console.error(`${settingsPath} is not valid JSON (${e.message}). Fix it first; nothing was changed.`); process.exit(2); }
}
if (typeof settings !== 'object' || settings === null || Array.isArray(settings)) { console.error('settings.json is not an object; nothing was changed.'); process.exit(2); }

const hooks = { ...(settings.hooks ?? {}) };
for (const event of EVENTS) {
  // drop any previous Aang entry for this event, keep everything else
  const kept = (hooks[event] ?? []).map(m => ({ ...m, hooks: (m.hooks ?? []).filter(h => !isAang(h)) })).filter(m => m.hooks.length > 0);
  hooks[event] = remove ? kept : [...kept, { hooks: [{ type: 'command', command: command(event), timeout: 5 }] }];
  if (!hooks[event].length) delete hooks[event];
}
const next = { ...settings, hooks };
if (!Object.keys(hooks).length) delete next.hooks;

const before = existsSync(settingsPath) ? readFileSync(settingsPath, 'utf8') : '(no file)';
const after = JSON.stringify(next, null, 2) + '\n';
if (!apply && !remove) {
  console.log(`Would write ${settingsPath}:\n`);
  console.log(after);
  console.log('Nothing was changed. Run with --apply to write it.');
  process.exit(0);
}
mkdirSync(path.dirname(settingsPath), { recursive: true });
if (existsSync(settingsPath)) {
  const backup = settingsPath + '.before-aang-' + new Date().toISOString().replace(/[:.]/g, '-');
  copyFileSync(settingsPath, backup);
  console.log('backed up the old settings to ' + backup);
}
writeFileSync(settingsPath, after);
console.log(`${remove ? 'Removed' : 'Installed'} Aang's hooks in ${settingsPath}`);
console.log(remove ? '' : `Claude Code will post ${EVENTS.join(', ')} to 127.0.0.1:${PORT}. Restart Claude Code to pick this up.`);
if (before === '(no file)') console.log('(there was no settings.json before; one was created)');
