// The progress engine's arithmetic, v3 (2026-10-21, progressmath.ts; the formulas are docs/PROGRESS-RESEARCH.md 3-4).
// Pure math only: the normal distribution, the overrun curve, shrinkage, the speed factor, the stall limits, the
// time-weighted bar with its squeeze and freeze, the Monte Carlo range, the words and their steadiness, and OVERALL.
// The last test checks the Shell's copy (src/Shell/pages/progressmath.js) gives the very same numbers.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as M from '../src/progressmath.ts';
import type { ProgressV3 } from '../src/progressmath.ts';

const MIN = 60_000;
const close = (a: number, b: number, tol: number, what = '') => assert.ok(Math.abs(a - b) <= tol, `${what} ${a} vs ${b}`);

test('normal: Φ and Φ⁻¹ are accurate, and the far tail keeps its precision', () => {
  close(M.Phi(0), 0.5, 1e-7);
  close(M.Phi(1.96), 0.9750021, 1e-6);
  close(M.Phi(-1), 0.1586553, 1e-6);
  close(M.PhiInv(0.975), 1.959964, 1e-5);
  close(M.PhiInv(0.5), 0, 1e-7);
  close(M.PhiInv(0.001), -3.0902323, 1e-6);
  close(M.PhiInv(1e-12), -7.0344838, 1e-4);
  for (const p of [0.01, 0.2, 0.7, 0.99]) close(M.Phi(M.PhiInv(p)), p, 1e-6, `round trip ${p}`);
  // 1 − Φ(6) is about 1e-9: computed directly it is right to a few percent, where 1 − Φ would be noise.
  close(M.PhiUpper(6) / 9.865876e-10, 1, 0.02);
});

test('remaining(): the plain median at the start, never zero when late, and it grows slowly (the honest overrun)', () => {
  const x = M.estOf(4 * MIN, 0.9);
  close(M.remaining(x, 0), 4 * MIN, 1);
  // Half way to the median there is still more than half a median left (heavy tail).
  assert.ok(M.remaining(x, 2 * MIN) > 2 * MIN);
  // At the median: the median of what is left of a lognormal given it has run that long.
  const atMed = M.remaining(x, 4 * MIN);
  close(atMed, 4 * MIN * Math.exp(0.9 * M.PhiInv(0.75)) - 4 * MIN, 50);
  // Late: it does not sit at 0, and it grows as the item keeps running.
  let last = 0;
  for (const e of [8, 15, 30, 60, 120].map(m => m * MIN)) {
    const r = M.remaining(x, e);
    assert.ok(r > 0, `late at ${e}`);
    assert.ok(r >= last, `grows at ${e}`);
    last = r;
  }
  // Far past z = 8 the asymptote takes over without a jump.
  const z8 = Math.exp(x.mu + 8 * x.sigma);
  close(M.remaining(x, z8 * 0.9999) / M.remaining(x, z8 * 1.0001), 1, 0.01, 'continuous at z = 8');
});

test('shrinkage: few samples lean on the broader key; sigma stays between 0.35 and 1.5', () => {
  const parent = M.estOf(4 * MIN, 0.9);
  const one = M.shrink(parent, 1, Math.log(MIN), 0);
  assert.ok(one.mu > Math.log(MIN) && one.mu < parent.mu, 'one sample moves it a quarter of the way');
  close(one.mu, (3 * parent.mu + Math.log(MIN)) / 4, 1e-9);
  const many = M.shrink(parent, 30, Math.log(MIN), 0.01);
  close(Math.exp(many.mu) / MIN, 1, 0.2, 'thirty samples rule');
  assert.equal(many.sigma >= M.SIGMA_MIN, true);
  assert.equal(M.shrink(parent, 5, 0, 99).sigma, M.SIGMA_MAX);
  assert.deepEqual(M.shrink(parent, 0, 0, 0), parent);
});

test('speed factor r: shrunk towards 1, so one fast item does not make the job look quick', () => {
  assert.equal(M.speedFactor([]), 1);
  close(M.speedFactor([{ actual: 30_000, median: 120_000 }]), Math.exp(Math.log(0.25) / 3), 1e-9);
  const slow = M.speedFactor(Array.from({ length: 10 }, () => ({ actual: 240_000, median: 120_000 })));
  assert.ok(slow > 1.6 && slow < 2, `${slow}`);
});

test('stall limits: a tool gets twice its p90 (a minute at least, 3 min unknown), streaming 90 s, between steps 60 s', () => {
  assert.equal(M.stallLimit({ tool: false, streaming: false }), 60_000);
  assert.equal(M.stallLimit({ tool: false, streaming: true }), 90_000);
  assert.equal(M.stallLimit({ tool: true, toolP90: null, streaming: false }), 180_000);
  assert.equal(M.stallLimit({ tool: true, toolP90: 10_000, streaming: false }), 60_000);
  assert.equal(M.stallLimit({ tool: true, toolP90: 5 * MIN, streaming: false }), 10 * MIN);
});

const prog = (o: Partial<ProgressV3> = {}): ProgressV3 => ({
  v: 3, done: 0, total: 3, cur: 0, at: 0, e: 0, jobW: 0, doneW: 0, curEst: M.estOf(MIN, 0.6), pend: [M.estOf(MIN, 0.6), M.estOf(MIN, 0.6)], r: 1, earned: true,
  sq: null, note: null, aliveAt: 0, stallMs: 60_000, running: true, rev: 0, elapsedMs: 0, paceMs: null, rewroteAt: null, ...o,
});

test('bar: time-weighted slices; a heavy item gets a big slice; bar and time left from the same numbers', () => {
  // Item 1 took a minute; item 2 (in hand) usually 10 min; item 3 usually 30 s.
  const p = prog({ done: 1, cur: 1, doneW: MIN, curEst: M.estOf(10 * MIN, 0.5), pend: [M.estOf(30_000, 0.5)] });
  const b = M.barNow(p, true, 0);
  const pendW = M.meanOf(M.estOf(30_000, 0.5));
  close(b.left, 10 * MIN + pendW, 1);
  close(b.p, MIN / (MIN + 10 * MIN + pendW), 1e-9, 'fraction = (doneW + e) / (doneW + e + curRem + pendW)');
  assert.ok(b.p < 0.1, 'one of three ticked is NOT a third: the big one is still ahead');
  // It creeps as working time passes, and never goes back.
  let last = 0;
  for (let t = 0; t <= 60 * MIN; t += 30_000) {
    const v = M.barNow({ ...p, aliveAt: t }, true, t).p;
    assert.ok(v >= last - 1e-12, `never backwards at ${t}`);
    last = v;
  }
  assert.ok(last > 0.5 && last < 0.999, `late item: still inching, no wall (${last})`);
  // Everything ticked: 1, nothing left.
  assert.deepEqual([M.barNow(prog({ done: 3, cur: -1, curEst: null, pend: [] }), true, 0).p, M.barNow(prog({ done: 3, cur: -1, curEst: null, pend: [] }), true, 0).left], [1, 0]);
});

test('bar: before the first tick it cannot pass a third (a CI run measured whole can)', () => {
  const p = prog({ curEst: M.estOf(10_000, 0.4), pend: [M.estOf(1000, 0.4)] });
  assert.ok(M.barNow({ ...p, aliveAt: 9e9 }, true, 60_000).p <= 1 / 3 + 1e-12);
  assert.ok(M.barNow({ ...p, aliveAt: 9e9, cap: false }, true, 60_000).p > 1 / 3);
});

test('bar: the clock runs only while working and not waiting on him; a stall freezes it where it began', () => {
  const p = prog({ at: 0, aliveAt: 0, stallMs: 60_000 });
  const live = M.barNow(p, true, 30_000);
  assert.ok(live.e === 30_000 && !live.stalled);
  assert.equal(M.barNow({ ...p, running: false }, true, 30_000).e, 0, 'waiting on him: no working time');
  assert.equal(M.barNow(p, false, 30_000).e, 0, 'idle or paused: no working time');
  const st = M.barNow(p, true, 5 * MIN);
  assert.equal(st.stalled, true);
  assert.equal(st.e, 60_000, 'frozen at the stall onset');
  assert.equal(st.silentMs, 5 * MIN);
  assert.equal(M.barNow(p, true, 10 * MIN).p, st.p, 'stillness means stillness');
  // The first heartbeat after it: alive again, the clock picks up.
  assert.equal(M.barNow({ ...p, aliveAt: 5 * MIN }, true, 5 * MIN + 1000).stalled, false);
});

test('bar: a foreground helper agent floors the time left of the item in hand; a background one does not', () => {
  const p = prog({ curEst: M.estOf(30_000, 0.5), pend: [] , total: 1 });
  const agent = { since: 0, est: M.estOf(5 * MIN, 0.5), fg: true };
  assert.ok(M.barNow(p, true, 0, [agent]).left > 4 * MIN);
  assert.ok(M.barNow(p, true, 0, [{ ...agent, fg: false }]).left < MIN);
  assert.ok(M.barNow(p, true, 0, [{ ...agent, failed: true }]).left < MIN);
});

test('squeeze: after a rewrite the bar holds, then fills the rest so it ends at 100% with the work', () => {
  const sq = { a: 0.6, m0: 0.3 };
  assert.equal(M.squeeze(0.3, sq), 0.6, 'no drop at the rewrite');
  assert.equal(M.squeeze(0.2, sq), 0.6, 'never below what was drawn');
  close(M.squeeze(0.65, sq), 0.8, 1e-12, 'half way through the rest');
  assert.equal(M.squeeze(1, sq), 1);
  assert.equal(M.squeeze(0.4, null), 0.4);
});

test('range: the Monte Carlo p50/p80 sit around the numbers, seeded so it never flickers', () => {
  const cur = M.estOf(2 * MIN, 0.6), pend = [M.estOf(3 * MIN, 0.6), M.estOf(MIN, 0.6)];
  const a = M.etaRange(cur, 0, pend, 1, 42), b = M.etaRange(cur, 0, pend, 1, 42);
  assert.deepEqual(a, b, 'same seed, same answer');
  assert.ok(a.p80 > a.p50);
  assert.ok(a.p50 > 5 * MIN && a.p50 < 8 * MIN, `p50 ${a.p50}`);
  // r = 2 doubles what is pending.
  assert.ok(M.etaRange(null, 0, pend, 2, 1).p50 > 1.7 * M.etaRange(null, 0, pend, 1, 1).p50);
  // A late item: the truncated draw is never below what it has already run.
  const late = M.etaRange(cur, 20 * MIN, [], 1, 7);
  assert.ok(late.p50 > 0);
});

test('words: rounding with no false precision; about / a range / "a while yet" by the spread', () => {
  assert.equal(M.roundLeft(30_000), 'under a minute');
  assert.equal(M.roundLeft(4.4 * MIN), '4 min');
  assert.equal(M.roundLeft(23 * MIN), '25 min');
  assert.equal(M.roundLeft(58 * MIN), '1 h');
  assert.equal(M.roundLeft(75 * MIN), '1 h 15 min');
  assert.equal(M.roundLeft(128 * MIN), '2 h 15 min');
  assert.equal(M.etaWords(4 * MIN, 1.3), 'about 4 min left');
  assert.equal(M.etaWords(4 * MIN, 1.8), '4-7 min left');
  assert.equal(M.etaWords(25 * MIN, 2), '25-50 min left');
  assert.equal(M.etaWords(40 * MIN, 2), '40 min to 1 h 15 min left');
  assert.equal(M.etaWords(50 * MIN, 2), '50 min to 1 h 45 min left');
  assert.equal(M.etaWords(4 * MIN, 3.5), 'a while yet');
  assert.equal(M.etaWords(20_000, 2), 'under a minute left');
});

test('steadiness: words change only past 15%, or after 3 s on the other side of a step; a rise over 25% is noted', () => {
  const s = new M.EtaSteady();
  assert.equal(s.update(4 * MIN, 'about 4 min left', 0), 'about 4 min left');
  // 3.6 min rounds to 4: same words, nothing to do.
  assert.equal(s.update(3.6 * MIN, 'about 4 min left', 1000), 'about 4 min left');
  // 3.45 min reads "about 3 min" but is within 15%: held for 3 s.
  assert.equal(s.update(3.45 * MIN, 'about 3 min left', 2000), 'about 4 min left');
  assert.equal(s.update(3.45 * MIN, 'about 3 min left', 4000), 'about 4 min left');
  assert.equal(s.update(3.45 * MIN, 'about 3 min left', 5100), 'about 3 min left');
  // A jump of more than 15% shows at once, and a rise over 25% is marked so the line can say why.
  assert.equal(s.update(7 * MIN, 'about 7 min left', 5200), 'about 7 min left');
  assert.equal(s.roseAt, 5200);
});

test('OVERALL: done + running share over all estimates, time left by R, p50 below p80, build hours only', () => {
  const H = 3_600_000;
  const plan: M.PlanV3 = { phases: [{ label: 'P1', hours: 4, status: 'done' }, { label: 'P2', hours: 6, status: 'running' }, { label: 'P3', hours: 10, status: 'todo' }], runE: 3 * H, at: 0, running: false, R: 1, ratios: [] };
  const o = M.overallNow(plan, 999 * H)!;
  assert.ok(o.runF > 0.3 && o.runF < 0.6, `the running phase's fraction ${o.runF}`);
  close(o.p, (4 + 6 * o.runF) / 20, 1e-9);
  close(o.left, (6 * (1 - o.runF) + 10) * H, 1);
  assert.equal(o.phase, 2); assert.equal(o.of, 3);
  assert.ok(o.p80 > o.p50);
  assert.equal(M.overallNow(plan, 5 * H)!.p, o.p, 'not running: the clock does not tick with nobody at work');
  assert.ok(M.overallNow({ ...plan, running: true }, H)!.p > o.p, 'a session at work moves it');
  // Past phases ran 50% over: R pulls towards 1.5, shrunk with k = 2.
  close(M.calibration([1.5, 1.5, 1.5]), Math.exp(3 * Math.log(1.5) / 5), 1e-12);
  const late = M.overallNow({ ...plan, R: 1.5, ratios: [1.4, 1.5, 1.6, 1.5] }, 0)!;
  assert.ok(late.left > o.left * 1.2);
  assert.ok(late.p50 > o.left * 1.2);
  assert.equal(M.overallWords(6 * H, 9 * H), 'about 6 h of build left, maybe 9');
  assert.equal(M.overallWords(40 * 60_000, 41 * 60_000), 'about 40 min of build left');
  assert.equal(M.overallNow({ ...plan, phases: [] }, 0), null);
});

test("the Shell's copy (pages/progressmath.js) gives the same numbers as this one", async () => {
  const S = await import('../../Shell/pages/progressmath.js' as string) as typeof M;
  const p = prog({ done: 1, cur: 1, doneW: MIN, e: 20_000, curEst: M.estOf(3 * MIN, 0.7), pend: [M.estOf(MIN, 0.5), M.estOf(9 * MIN, 1.1)], r: 1.3, sq: { a: 0.4, m0: 0.2 }, aliveAt: 0, stallMs: 90_000 });
  for (const now of [0, 10_000, 80_000, 200_000]) {
    const a = M.barNow(p, true, now, [{ since: 0, est: M.estOf(4 * MIN, 0.6), fg: true }]);
    const b = S.barNow(p, true, now, [{ since: 0, est: M.estOf(4 * MIN, 0.6), fg: true }]);
    assert.deepEqual(b, a, `barNow at ${now}`);
  }
  for (const e of [0, 1, 1000, 60_000, 1e7, 1e12]) assert.equal(S.remaining(M.estOf(MIN, 0.8), e), M.remaining(M.estOf(MIN, 0.8), e));
  assert.deepEqual(S.etaRange(p.curEst, 30_000, p.pend, 1.3, 5), M.etaRange(p.curEst, 30_000, p.pend, 1.3, 5));
  for (const [ms, r] of [[30_000, 1], [4 * MIN, 1.2], [4 * MIN, 2], [55 * MIN, 2.5], [3 * 3_600_000, 1.1], [MIN, 4]] as const) assert.equal(S.etaWords(ms, r), M.etaWords(ms, r));
  const plan: M.PlanV3 = { phases: [{ label: 'a', hours: 2, status: 'done' }, { label: 'b', hours: 3, status: 'running' }], runE: 3_600_000, at: 0, running: true, R: 1.2, ratios: [1, 1.3, 1.1] };
  assert.deepEqual(S.overallNow(plan, 1000, 3), M.overallNow(plan, 1000, 3));
  assert.equal(S.overallWords(5e6, 9e6), M.overallWords(5e6, 9e6));
  assert.equal(S.seedOf('job-1'), M.seedOf('job-1'));
});
