import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ActivityLog, SETTLE_MS, describe, forHowLong } from '../src/activity.ts';

const T = 1_700_000_000_000;

test('it reports the window he is in, and how long he has been there', () => {
  const a = new ActivityLog();
  a.record('Code', 'core.ts - AiVatar', T);
  const s = a.summary(T + 5 * 60_000);
  assert.match(s, /Code \(core\.ts - AiVatar\)/);
  assert.match(s, /5 minutes/);
});

test('the same window reported twice is not two entries', () => {
  const a = new ActivityLog();
  a.record('Code', 'core.ts', T);
  a.record('Code', 'core.ts', T + 1000);
  a.record('Code', 'core.ts', T + 2000);
  assert.equal(a.recent(T + 3000).length, 1);
});

test('a new tab in the same window counts as a change', () => {
  const a = new ActivityLog();
  a.record('chrome', 'Crunchyroll - Daemons of the Shadow Realm', T);
  a.record('chrome', 'GitHub - Bowgull/AiVatar', T + 60_000);
  const s = a.summary(T + 61_000);
  assert.match(s, /AiVatar/);
  assert.match(s, /Before that.*Crunchyroll/s);
});

test('windows flicked past while alt-tabbing are left out', () => {
  const a = new ActivityLog();
  a.record('Code', 'core.ts', T);
  a.record('explorer', 'Downloads', T + 10_000);              // held for 10s: real
  a.record('chrome', 'flash', T + 20_000);                    // held 200ms: passed through
  a.record('WowB', 'World of Warcraft', T + 20_200);
  const shown = a.recent(T + 60_000).map(e => e.process);
  assert.deepEqual(shown, ['WowB', 'explorer', 'Code'], 'the window flicked past is not listed');
});

test('Aang never reports himself', () => {
  const a = new ActivityLog();
  a.record('Aang', 'Aang Body', T);
  a.record('Aang', 'Aang Input', T + 100);
  a.record('explorer', 'Program Manager', T + 200);
  assert.equal(a.current(), null, 'his own windows and the desktop shell are not activity');
});

test('a window with no title still names the app', () => {
  const a = new ActivityLog();
  a.record('WowB', '', T);
  assert.match(a.summary(T + 1000), /WowB/);
  assert.equal(describe({ process: 'WowB', title: '', at: T }), 'WowB');
  assert.equal(describe({ process: '', title: 'Untitled', at: T }), 'Untitled');
});

test('switching it off reports nothing and forgets what it had', () => {
  const a = new ActivityLog();
  a.record('Code', 'secret-project.ts', T);
  a.watching = false;
  a.clear();
  a.record('Code', 'still-secret.ts', T + 1000);
  assert.equal(a.current(), null);
  assert.match(a.summary(T + 2000), /turned off/);
  assert.doesNotMatch(a.summary(T + 2000), /secret/);
});

test('it holds only a recent window of history, not a whole session', () => {
  const a = new ActivityLog();
  for (let i = 0; i < 200; i++) a.record('app' + i, 'title' + i, T + i * SETTLE_MS * 2);
  assert.ok(a.recent(T + 1e9, 100).length <= 50, 'capped');
  assert.equal(a.current()?.process, 'app199');
});

test('a very long title is cut rather than carried whole', () => {
  const a = new ActivityLog();
  a.record('chrome', 'x'.repeat(500), T);
  assert.ok((a.current()?.title.length ?? 0) <= 120);
});

test('durations read like a person would say them', () => {
  assert.equal(forHowLong(3_000), '3 seconds');
  assert.equal(forHowLong(5 * 60_000), '5 minutes');
  assert.equal(forHowLong(3 * 3_600_000), '3 hours');
});
