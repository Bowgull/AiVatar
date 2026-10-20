// Samara's shortcuts swap to the lit lantern while it is open, the dark one when closed (his ask, 2026-10-20). Changes his
// real shortcuts, so it ends on whatever matches Samara right now: pass `lit` or `dark` as the last argument.
//
// Each switch is checked against a state the test set first itself, so a shortcut that was already right cannot pass.
//
// Run: npx electron test/electron/shortcut-icon-check.ts lit
import { app } from 'electron';
import { execFileSync, spawnSync } from 'node:child_process';
import { samaraShortcutsLit, shortcutArgs } from '../../src/shortcuticon.ts';

process.on('uncaughtException', (e) => { console.log('HARNESS ERROR ' + (e as Error).message); app.exit(2); });
const end = process.argv.at(-1) !== 'dark';
const read = (): string[] => execFileSync('powershell.exe', ['-NoProfile', '-Command', "$sh=New-Object -ComObject WScript.Shell; foreach($d in @([Environment]::GetFolderPath('Desktop'),[Environment]::GetFolderPath('Programs'))){ $p=Join-Path $d 'Samara.lnk'; if(Test-Path $p){ $sh.CreateShortcut($p).IconLocation } }"], { encoding: 'utf8' }).trim().split(/\r?\n/);
const shows = (lit: boolean) => { const r = read(); return r.length === 2 && r.every((l) => l.includes(lit ? 'samara-open.ico' : 'samara-closed.ico')); };
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function landed(lit: boolean): Promise<number> { const t = Date.now(); while (Date.now() - t < 10_000) { if (shows(lit)) return Date.now() - t; await wait(300); } return -1; }

app.whenReady().then(async () => {
  let bad = 0;
  const check = (what: string, ms: number) => { console.log(`${ms >= 0 ? 'PASS' : 'FAIL'}  ${what}${ms >= 0 ? `  -- ${ms} ms` : `  -- ${read().join(' | ')}`}`); if (ms < 0) bad++; };
  // the starting point, set by the test itself: the opposite of the first switch
  spawnSync('powershell.exe', shortcutArgs(end), { encoding: 'utf8' });
  if (!shows(end)) { console.log('HARNESS could not set the starting point'); app.exit(2); return; }
  samaraShortcutsLit(!end); check(`both shortcuts switch to the ${end ? 'dark' : 'lit'} lantern`, await landed(!end));
  samaraShortcutsLit(end); check(`and back to the ${end ? 'lit' : 'dark'} one`, await landed(end));
  // two switches a moment apart: the last one wins
  samaraShortcutsLit(!end); await wait(50); samaraShortcutsLit(end);
  await wait(4000);
  check('two switches at once: the last one wins', shows(end) ? 0 : -1);
  console.log(bad ? `${bad} FAILED` : 'ALL PASS'); app.exit(bad ? 1 : 0);
});
