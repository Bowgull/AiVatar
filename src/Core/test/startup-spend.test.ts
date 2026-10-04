import './_env.ts';
// What a start costs: nothing goes to Claude just because the Core started (decision 47, step Q).
// Joshua's week sat at 72% to 88% while the Core restarted 4 to 22 times a day.
import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Core } from '../src/core.ts';

const tmp = () => mkdtempSync(path.join(os.tmpdir(), 'aang-spend-'));

/** Starts a Core with fake timers, runs 25 s of them, and reports whether the catch-up ran. */
async function studied(cfg: Record<string, unknown>, port: number): Promise<boolean> {
  mock.timers.enable({ apis: ['setTimeout'] });
  const core: any = new Core({ port, dataDir: tmp(), stateDir: tmp(), warm: false, ...cfg });
  let ran = false;
  core.catchUp = async () => { ran = true; };
  try {
    await core.start();
    mock.timers.tick(25_000);
    await new Promise(r => setImmediate(r));
  } finally {
    mock.timers.reset();
    await core.stop();
  }
  return ran;
}

test('Q4: a normal start does not study the last session', async () => {
  assert.equal(await studied({}, 48300), false);
});

test('Q4: it still runs when deliberately switched on', async () => {
  assert.equal(await studied({ consolidate: true }, 48302), true);
});

// ------------------------------------------------------------------ Q1: the warm-up turn

/** Starts a Core and reports whether the Quick lane was warmed, optionally after a poke. */
async function warmed(port: number, poke: boolean): Promise<boolean> {
  const core: any = new Core({ port, dataDir: tmp(), stateDir: tmp() });
  let sent = 0;
  core.lane = () => ({ send: () => { sent++; } });
  try {
    await core.start();
    if (poke) core.onBody({ readyState: 1, send() {} }, { t: 'poked' });
  } finally {
    await core.stop();
  }
  return sent > 0;
}

test('Q1: starting the Core sends nothing to Claude', async () => {
  assert.equal(await warmed(48304, false), false);
});

test('Q1: clicking Aang warms the lane', async () => {
  assert.equal(await warmed(48306, true), true);
});

test('Q1: it warms once, not on every click', async () => {
  const core: any = new Core({ port: 48308, dataDir: tmp(), stateDir: tmp() });
  let sent = 0;
  core.lane = () => ({ send: () => { sent++; } });
  const ws: any = { readyState: 1, send() {} };
  try {
    await core.start();
    core.onBody(ws, { t: 'poked' });
    core.onBody(ws, { t: 'poked' });
    core.onBody(ws, { t: 'poked' });
  } finally {
    await core.stop();
  }
  assert.equal(sent, 1);
});
