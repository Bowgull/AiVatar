// The Mac's presence (2026-10-28): the helper's readings become the same two signals the PC's pet sends.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chmodSync, mkdtempSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { AWAY_AFTER_S, MacPresence, atDesk, parseReading, quietReason, type MacReading } from '../src/macpresence.ts';

const r = (x: Partial<MacReading> = {}): MacReading => ({ front: 'Samara', bundle: 'com.aang.browser', idle: 1, mic: false, cam: false, full: false, focus: null, ...x });

test('quiet on the Mac: a call, the Shadow window, full screen, Focus; nothing else (his rule)', () => {
  assert.equal(quietReason(r()), '');
  assert.equal(quietReason(r({ mic: true })), 'call');
  assert.equal(quietReason(r({ cam: true })), 'call');
  assert.equal(quietReason(r({ front: 'Shadow PC', bundle: 'com.electron.shadow' })), 'shadow');
  assert.equal(quietReason(r({ full: true })), 'full screen');
  assert.equal(quietReason(r({ focus: true })), 'focus');
  assert.equal(quietReason(r({ focus: null })), '', 'Focus unknown is not Focus on');
});

test('away after five minutes idle; after "brb", away until he touches the Mac again', () => {
  const now = 1_000_000;
  assert.equal(atDesk(r({ idle: 10 }), now, null), true);
  assert.equal(atDesk(r({ idle: AWAY_AFTER_S + 1 }), now, null), false);
  const brb = now - 60_000;                                      // said a minute ago
  assert.equal(atDesk(r({ idle: 61 }), now, brb), false, 'no input since: still away');
  assert.equal(atDesk(r({ idle: 2 }), now, brb), true, 'input after it: back');
  assert.equal(atDesk(r({ idle: 0 }), brb - 1000, brb), false, 'the click that picked Away, inside the grace: still away');
});

test('a reading is checked before it is used', () => {
  assert.deepEqual(parseReading('{"front":"Claude","bundle":"x","idle":3,"mic":true,"cam":false,"full":false,"focus":null}'),
    { front: 'Claude', bundle: 'x', idle: 3, mic: true, cam: false, full: false, focus: null });
  assert.equal(parseReading('nonsense'), null);
  assert.equal(parseReading('{"idle":"soon"}'), null);
});

test('the helper\'s lines reach the brain as presence and desk, and "brb" holds until input comes back', async () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'aang-pres-'));
  const bin = path.join(dir, 'fake-presence');
  // Plays the helper: Claude in front, then a call, then input after a long idle.
  writeFileSync(bin, `#!/bin/sh
echo '{"front":"Claude","bundle":"com.anthropic.claudefordesktop","idle":2,"mic":false,"cam":false,"full":false,"focus":null}'
sleep 0.3
echo '{"front":"FaceTime","bundle":"com.apple.FaceTime","idle":2,"mic":true,"cam":true,"full":false,"focus":null}'
sleep 0.3
echo '{"front":"FaceTime","bundle":"com.apple.FaceTime","idle":400,"mic":false,"cam":false,"full":false,"focus":null}'
sleep 5
`);
  chmodSync(bin, 0o755);
  const presence: { foreground: string; quiet: boolean }[] = [], desk: boolean[] = [];
  const p = new MacPresence(bin, { presence: x => presence.push(x), desk: a => desk.push(a) });
  assert.equal(p.start(), true);
  await new Promise(res => setTimeout(res, 2500));
  p.stop();
  assert.deepEqual(presence, [{ foreground: 'Claude', quiet: false, shadow: false }, { foreground: 'FaceTime', quiet: true, shadow: false }, { foreground: 'FaceTime', quiet: false, shadow: false }]);
  assert.deepEqual(desk, [true, false], 'at the Mac, then away after 400 s idle');
});

test('"brb" turns him away at once', () => {
  const desk: boolean[] = [];
  const p = new MacPresence('/nonexistent', { presence: () => {}, desk: a => desk.push(a), now: () => 5_000 });
  p.awaySet();
  assert.deepEqual(desk, [false]);
});
