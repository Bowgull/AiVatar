// A Shadow session ends with a hard shutdown, and to a file write that is a power cut. This kills a
// writer process without warning, many times, at random moments, and checks what is left on disk.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import os from 'node:os';
import path from 'node:path';

const here = import.meta.dirname;
const srcDir = path.join(here, '..', 'src').replace(/\\/g, '/');
const tmp = () => mkdtempSync(path.join(os.tmpdir(), 'aang-kill-'));
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
const KILLS = 25;

// The writer goes in a file rather than an -e string: nested quoting is how the first attempt broke.
function writerScript(mode: string, dir: string): string {
  const lines = [
    "import { writeFileSync } from 'node:fs';",
    "import path from 'node:path';",
    "import { Reminders } from 'file:///" + srcDir + "/reminders.ts';",
    "import { Memory } from 'file:///" + srcDir + "/memory.ts';",
    'const dir = ' + JSON.stringify(dir) + ';',
    // big enough that one write is several syscalls, so a kill can land in the middle of it
    "const big = 'x'.repeat(4000);",
    'if (' + JSON.stringify(mode) + " === 'control') {",
    "  for (let i = 0; ; i++) writeFileSync(path.join(dir, 'reminders.json'), JSON.stringify([{ at: Date.now() + 1e9, text: big + i }]));",
    '} else {',
    '  const r = new Reminders(dir);',
    '  const m = new Memory(dir);',
    '  for (let i = 0; ; i++) {',
    "    r.add('reminder ' + i + ' ' + big, Date.now() + 1e9);",
    "    if (r.list().length > 40) r.cancel('reminder');",
    "    m.saveTurn('question ' + i, 'answer ' + i, 'test');",
    '  }',
    '}',
  ];
  const file = path.join(dir, 'writer.mjs');
  writeFileSync(file, lines.join('\n'));
  return file;
}

// The exit is captured at spawn time: attaching the listener after the kill misses an early exit, which
// is what made the first version of this test hang for two minutes instead of failing.
async function killAtRandom(mode: string, dir: string): Promise<void> {
  const child = spawn(process.execPath, ['--no-warnings', writerScript(mode, dir)], { stdio: 'ignore' });
  const exited = new Promise(r => child.once('exit', r));
  await sleep(150 + Math.random() * 250);
  child.kill('SIGKILL');                 // no warning, no cleanup: the Shadow shutdown
  await exited;
}

const parses = (file: string) => { try { JSON.parse(readFileSync(file, 'utf8')); return true; } catch { return false; } };

test('control: writing in place, killed at random, shows whether the danger is real', { timeout: 120_000 }, async () => {
  const dir = tmp();
  const rem = path.join(dir, 'reminders.json');
  let corrupt = 0;
  for (let i = 0; i < KILLS; i++) {
    await killAtRandom('control', dir);
    if (existsSync(rem) && !parses(rem)) corrupt++;
  }
  console.log(`      control (write in place): ${corrupt} of ${KILLS} kills left reminders.json unreadable`);
  // Deliberately not asserted: this measures the hazard, it does not test the fix.
});

test('reminders and memory survive being killed at random, every time', { timeout: 240_000 }, async () => {
  const dir = tmp();
  // work on a copy of the real memory database, never the live one
  const live = path.join(os.homedir(), 'Documents', 'Aang', 'aang.db');
  const db = path.join(dir, 'aang.db');
  if (existsSync(live)) { const d = new DatabaseSync(live); d.exec(`VACUUM INTO '${db.replace(/\\/g, '/')}'`); d.close(); }
  else { const d = new DatabaseSync(db); d.exec('CREATE TABLE IF NOT EXISTS turns (id INTEGER PRIMARY KEY, ts TEXT, role TEXT, tier TEXT, text TEXT)'); d.close(); }

  const rem = path.join(dir, 'reminders.json');
  let unreadable = 0, damaged = 0, lost = 0, held = 0;
  for (let i = 0; i < KILLS; i++) {
    await killAtRandom('fixed', dir);
    if (existsSync(rem) && !parses(rem)) unreadable++;

    const d = new DatabaseSync(db);
    const ok = (d.prepare('PRAGMA integrity_check').get() as any)?.integrity_check;
    const n = Number((d.prepare('SELECT count(*) AS c FROM turns').get() as any)?.c ?? 0);
    d.close();
    if (ok !== 'ok') damaged++;
    if (n < held) lost++;                 // a turn that had been committed has vanished
    held = n;
  }
  console.log(`      fixed: ${unreadable} unreadable, ${damaged} damaged databases, ${lost} losses over ${KILLS} kills; ${held} turns held`);
  assert.equal(unreadable, 0, 'reminders.json was left unreadable by a kill');
  assert.equal(damaged, 0, 'the memory database failed its integrity check');
  assert.equal(lost, 0, 'data that had already been committed was lost');
});
