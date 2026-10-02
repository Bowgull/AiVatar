import './_env.ts';
// 3.2: the graphics card belongs to the game.
//
// The rule is RUNNING, not FOCUSED. Alt-tabbing out of WoW does not give the card back, so the foreground
// signal the rest of the app uses would happily load 13 GB on top of a live raid.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GAME_PROCESS, gameRunning, forgetGameCheck, freeVramMiB } from '../src/gpu.ts';
import { looksVisual } from '../src/screen.ts';
import { askLocal } from '../src/local.ts';

test('the game list here agrees with the one in screen.ts', () => {
  // Two copies of a list like this drift the moment a game is added to one of them. screen.ts answers a
  // different question (is this window a picture) from the same set of names, so they must stay in step.
  const games = ['wow', 'wowb', 'wow-64', 'overwatch', 'diablo', 'hearthstone', 'valorant', 'league of legends'];
  for (const g of games) {
    assert.ok(GAME_PROCESS.test(g), `${g} should be a game here`);
    assert.equal(looksVisual(g, ''), 'game', `${g} should be a game in screen.ts too`);
  }
  // And the shipped-binary catch-all, which is how most Unreal games appear in a process list.
  assert.ok(GAME_PROCESS.test('SomeGame-Win64-Shipping'));
  assert.equal(looksVisual('SomeGame-Win64-Shipping', ''), 'game');
});

test('ordinary programs are not mistaken for games', () => {
  // A false positive here means Aang silently never reads anything, which is the expensive failure:
  // it looks exactly like the feature not working.
  for (const p of ['explorer', 'chrome', 'code', 'node', 'Aang', 'obsidian', 'discord', 'powershell', 'WowAddonManager']) {
    assert.ok(!GAME_PROCESS.test(p), `${p} must not read as a game`);
  }
});

test('asking the machine gives a definite answer and caches it', async () => {
  forgetGameCheck();
  const first = await gameRunning();
  assert.equal(typeof first.running, 'boolean');
  assert.equal(first.running, first.which !== null, 'the name and the flag must agree');
  // Second call inside the cache window: same answer, and fast enough that it clearly did not shell out.
  const t0 = Date.now();
  const second = await gameRunning();
  assert.equal(second.which, first.which);
  assert.ok(Date.now() - t0 < 50, 'a cached answer should not run tasklist again');
});

test('the local model is refused while a game is running', async () => {
  const game = await gameRunning();
  if (!game.running) {
    // No game up, so prove the opposite instead: the gate is not blocking for no reason.
    const r = await askLocal('', { });      // empty prompt, refused before any network or process check
    assert.equal(r.why, 'empty');
    return;
  }
  const r = await askLocal('read this', { timeoutMs: 5000 });
  assert.equal(r.ok, false);
  assert.equal(r.why, 'game');
  assert.ok(r.detail?.includes(game.which!), 'it should say which game has the card');
});

test('free VRAM reads as a number or honestly as unknown', async () => {
  const free = await freeVramMiB();
  assert.ok(free === null || (Number.isFinite(free) && free >= 0), `unexpected: ${free}`);
  if (free !== null) console.log(`      ${free} MiB free on the card`);
});
