import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { QuotaPolicy, parseRateLimit } from '../src/quota.ts';

// The event exactly as the SDK emitted it on 2026-09-20.
const REAL_EVENT = {
  type: 'rate_limit_event',
  rate_limit_info: {
    status: 'allowed', resetsAt: 1789942800, rateLimitType: 'five_hour', overageStatus: 'rejected', isUsingOverage: false,
    unifiedWindows: { five_hour: { utilization: 0.09, resetsAt: 1789942800 }, seven_day: { utilization: 0.01, resetsAt: 1790506800 } },
  },
};
const q = (week: number, five = 0.1) => ({ five, week, fiveResetsAt: 1, weekResetsAt: 2 });

test('parses the real rate_limit_event', () => {
  const r = parseRateLimit(REAL_EVENT)!;
  assert.equal(r.five, 0.09);
  assert.equal(r.week, 0.01);
  assert.equal(r.weekResetsAt, 1790506800);
});

test('returns null when the event has no usage numbers', () => {
  assert.equal(parseRateLimit({ type: 'rate_limit_event', rate_limit_info: { status: 'allowed' } }), null);
  assert.equal(parseRateLimit(null), null);
});

test('warns once at 40% and offers once at 50%', () => {
  const p = new QuotaPolicy();
  assert.equal(p.update(q(0.39)), null);
  assert.equal(p.update(q(0.4)), 'warn');
  assert.equal(p.update(q(0.42)), null, 'no repeat warning');
  assert.equal(p.update(q(0.5)), 'offer');
  assert.equal(p.update(q(0.55)), null, 'no repeat offer');
  assert.equal(p.level, 'offer');
});

test('jumping straight past 50% gives the offer, not two notices', () => {
  const p = new QuotaPolicy();
  assert.equal(p.update(q(0.6)), 'offer');
  assert.equal(p.update(q(0.61)), null);
});

test('saving is opt-in and switchable in both directions', () => {
  const p = new QuotaPolicy();
  p.update(q(0.5));
  assert.equal(p.saving, false, 'never turns on by itself');
  p.setSaving(true);
  assert.equal(p.level, 'saving');
  p.setSaving(false);
  assert.equal(p.level, 'warn', '"not now" at 50%+ does not nag again');
  p.setSaving(true);
  assert.equal(p.level, 'saving');
});

test('a new week clears the state (hysteresis below 35%)', () => {
  const p = new QuotaPolicy();
  p.update(q(0.55)); p.setSaving(false);
  assert.equal(p.update(q(0.36)), null, 'still inside the hysteresis band');
  p.update(q(0.05));
  assert.equal(p.update(q(0.41)), 'warn');
  assert.equal(p.update(q(0.51)), 'offer');
});

// ---------------------------------------------------------------- Q2: saving mode survives a restart

test('Q2: saving mode is remembered across restarts', () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'aang-saving-'));
  const first = new QuotaPolicy(dir);
  assert.equal(first.saving, false);
  first.setSaving(true);

  // The Core restarting is a brand new policy reading the same folder.
  assert.equal(new QuotaPolicy(dir).saving, true);

  const third = new QuotaPolicy(dir);
  third.update(q(0.88));
  third.setSaving(false);
  assert.equal(new QuotaPolicy(dir).saving, false);
});

test('Q2: "not now" is remembered, so the offer does not come back every restart', () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'aang-saving-'));
  const first = new QuotaPolicy(dir);
  assert.equal(first.update(q(0.88)), 'offer');
  first.setSaving(false);                       // "not now"

  // Before this fix every restart offered again: his only duplicated message in 154 proactive rows.
  const after = new QuotaPolicy(dir);
  assert.equal(after.update(q(0.88)), null);
});

test('Q2: a new week offers again', () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'aang-saving-'));
  const p = new QuotaPolicy(dir);
  p.update(q(0.88));
  p.setSaving(false);
  p.update(q(0.02));                            // the week reset
  assert.equal(new QuotaPolicy(dir).update(q(0.88)), 'offer');
});

test('Q2: with no folder it still works, just without remembering', () => {
  const p = new QuotaPolicy();
  p.setSaving(true);
  assert.equal(p.saving, true);
});
