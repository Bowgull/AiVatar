import { test } from 'node:test';
import assert from 'node:assert/strict';
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
