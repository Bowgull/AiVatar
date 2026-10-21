// The progress engine's arithmetic, the Shell's copy (v3, 2026-10-21). Line for line the same as
// src/Core/src/progressmath.ts, which explains every formula (docs/PROGRESS-RESEARCH.md sections 3 and 4); the
// brain sends the numbers, and every bar, ring and time left in the Shell is drawn from these functions each frame.
// src/Core/test/progressmath.test.ts checks this copy gives exactly the same answers as the brain's.

export const SIGMA_MIN = 0.35;
export const SIGMA_MAX = 1.5;
export const EARLY_CAP = 1 / 3;
export const EARN_MS = 20_000;

export const medianOf = (x) => Math.exp(x.mu);
export const meanOf = (x) => Math.exp(x.mu + (x.sigma * x.sigma) / 2);
export const estOf = (medianMs, sigma) => ({ mu: Math.log(Math.max(1, medianMs)), sigma });

export function erfc(x) {
  const z = Math.abs(x), t = 1 / (1 + 0.5 * z);
  const r = t * Math.exp(-z * z - 1.26551223 + t * (1.00002368 + t * (0.37409196 + t * (0.09678418 + t * (-0.18628806 +
    t * (0.27886807 + t * (-1.13520398 + t * (1.48851587 + t * (-0.82215223 + t * 0.17087277)))))))));
  return x >= 0 ? r : 2 - r;
}
export const Phi = (z) => 0.5 * erfc(-z / Math.SQRT2);
export const PhiUpper = (z) => 0.5 * erfc(z / Math.SQRT2);

const A = [-3.969683028665376e+01, 2.209460984245205e+02, -2.759285104469687e+02, 1.383577518672690e+02, -3.066479806614716e+01, 2.506628277459239e+00];
const B = [-5.447609879822406e+01, 1.615858368580409e+02, -1.556989798598866e+02, 6.680131188771972e+01, -1.328068155288572e+01];
const C = [-7.784894002430293e-03, -3.223964580411365e-01, -2.400758277161838e+00, -2.549671010506088e+00, 4.374664141464968e+00, 2.938163982698783e+00];
const D = [7.784695709041462e-03, 3.224671290700398e-01, 2.445134137142996e+00, 3.754408361224082e+00];
export function PhiInv(p) {
  const q0 = Math.min(1 - 1e-16, Math.max(1e-300, p));
  const lo = 0.02425;
  if (q0 > 1 - lo) return -PhiInv(1 - q0);
  let x;
  if (q0 < lo) {
    const q = Math.sqrt(-2 * Math.log(q0));
    x = (((((C[0] * q + C[1]) * q + C[2]) * q + C[3]) * q + C[4]) * q + C[5]) / ((((D[0] * q + D[1]) * q + D[2]) * q + D[3]) * q + 1);
  } else {
    const q = q0 - 0.5, r = q * q;
    x = (((((A[0] * r + A[1]) * r + A[2]) * r + A[3]) * r + A[4]) * r + A[5]) * q / (((((B[0] * r + B[1]) * r + B[2]) * r + B[3]) * r + B[4]) * r + 1);
  }
  // One Halley step against the precise Φ: Acklam alone is off by about 1e-5 in the tails.
  if (q0 > 1e-250) {
    const u = (Phi(x) - q0) * Math.sqrt(2 * Math.PI) * Math.exp((x * x) / 2);
    x = x - u / (1 + (x * u) / 2);
  }
  return x;
}

/**
 * Far in the tail (z > 8, where 1 − Φ underflows), the k with Q(k) = Q(z) / 2, from the asymptotic log tail
 * ln Q(x) ≈ −x²/2 − ln(x√(2π)) + ln(1 − 1/x² + 3/x⁴), by two Newton steps from z + ln2/z. Continuous with the exact form.
 */
function tailHalf(z) {
  const lnQ = (x) => -x * x / 2 - Math.log(x * Math.sqrt(2 * Math.PI)) + Math.log(1 - 1 / (x * x) + 3 / (x * x * x * x));
  const target = lnQ(z) - Math.LN2;
  let k = z + Math.LN2 / z;
  for (let i = 0; i < 2; i++) k -= (lnQ(k) - target) / (-k - 1 / k);
  return k;
}

/** How much longer an item that has already run `e` ms will probably take (the honest overrun curve). */
export function remaining(x, e) {
  if (!(e > 0)) return Math.exp(x.mu);
  const s = Math.max(1e-6, x.sigma), z = (Math.log(e) - x.mu) / s;
  const k = z > 8 ? tailHalf(z) : -PhiInv(PhiUpper(z) / 2);
  return Math.max(0, Math.exp(x.mu + s * k) - e);
}
export const p90Of = (x) => Math.exp(x.mu + 1.2816 * x.sigma);

export function squeeze(m, sq) {
  if (!sq) return m;
  if (sq.m0 >= 1) return m >= 1 ? 1 : sq.a;
  return sq.a + (1 - sq.a) * Math.max(0, m - sq.m0) / (1 - sq.m0);
}

/** Where a job's bar stands at `now` (see the Core copy): the bar, the time left, the stall. */
export function barNow(p, phaseWorking, now, agents = []) {
  const running = phaseWorking && p.running;
  const silent = Math.max(0, now - p.aliveAt);
  const stalled = running && silent > p.stallMs;
  const until = stalled ? Math.max(p.at, p.aliveAt + p.stallMs) : now;
  const dt = running ? Math.max(0, until - p.at) : 0;
  const e = p.e + dt, jobW = p.jobW + dt;
  if (p.done >= p.total) return { p: 1, m: 1, left: 0, e, jobW, stalled: false, silentMs: 0, late: false };
  let curRem = p.curEst ? remaining(p.curEst, e) : 0;
  for (const a of agents) {
    if (!a.fg || a.failed || a.endedAt || !a.est) continue;
    const ae = Math.max(0, (stalled ? until : now) - a.since);
    curRem = Math.max(curRem, remaining(a.est, ae));
  }
  const r = p.r > 0 ? p.r : 1;
  let pendW = 0;
  for (const x of p.pend) pendW += meanOf(x) * r;
  let m = (p.doneW + e) / Math.max(1, p.doneW + e + curRem + pendW);
  if (p.done === 0 && p.cap !== false) m = Math.min(m, EARLY_CAP);
  const shown = Math.max(0, Math.min(0.999, squeeze(m, p.sq)));
  return { p: shown, m, left: curRem + pendW, e, jobW, stalled, silentMs: stalled ? silent : 0, late: !!p.curEst && e > p90Of(p.curEst) };
}

export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function seedOf(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619); return h >>> 0; }

export function etaRange(cur, e, pend, r, seed, n = 500) {
  const rand = rng(seed), lr = Math.log(r > 0 ? r : 1);
  const normal = () => { const u = Math.max(1e-12, rand()), v = rand(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
  const out = new Array(n);
  const z = cur && e > 0 ? (Math.log(e) - cur.mu) / Math.max(1e-6, cur.sigma) : -Infinity;
  const tail = cur ? (z === -Infinity ? 1 : PhiUpper(z)) : 0;
  for (let i = 0; i < n; i++) {
    let s = 0;
    if (cur) {
      const v = Math.max(1e-12, rand());
      const x = z > 8 ? Math.sqrt(z * z - 2 * Math.log(v)) : -PhiInv(tail * v);
      s += Math.max(0, Math.exp(cur.mu + cur.sigma * x) - e);
    }
    for (const p of pend) s += Math.exp(p.mu + lr + p.sigma * normal());
    out[i] = s;
  }
  out.sort((a, b) => a - b);
  return { p50: out[Math.floor(n * 0.5)], p80: out[Math.floor(n * 0.8)] };
}

export function roundLeft(ms) {
  if (ms < 45_000) return 'under a minute';
  const min = ms / 60_000;
  if (min < 10) return `${Math.max(1, Math.round(min))} min`;
  if (min < 60) { const m5 = Math.round(min / 5) * 5; return m5 >= 60 ? '1 h' : `${m5} min`; }
  const q = Math.round(min / 15) * 15, h = Math.floor(q / 60), m = q % 60;
  return m ? `${h} h ${m} min` : `${h} h`;
}
const minutesOf = (ms) => { const min = ms / 60_000; return min < 10 ? Math.max(1, Math.round(min)) : Math.round(min / 5) * 5; };

export function etaWords(ms, ratio) {
  if (!Number.isFinite(ms) || ms < 0) return '';
  if (ratio > 3) return 'a while yet';
  if (ms < 45_000) return 'under a minute left';
  if (ratio < 1.6) return `about ${roundLeft(ms)} left`;
  const hi = ms * ratio;
  if (hi < 3_600_000) {
    const a = minutesOf(ms), b = Math.max(a + 1, minutesOf(hi));
    return `${a}-${b} min left`;
  }
  return `${roundLeft(ms)} to ${roundLeft(hi)} left`;
}

export function overallWords(p50, p80) {
  if (!(p50 > 0)) return '';
  const hrs = (ms) => { const h = ms / 3_600_000; return h < 10 ? Math.round(h * 2) / 2 : Math.round(h); };
  if (p50 < 3_600_000) {
    const a = roundLeft(p50);
    return p80 > p50 * 1.25 ? `about ${a} of build left, maybe ${roundLeft(p80)}` : `about ${a} of build left`;
  }
  const a = hrs(p50), b = hrs(p80);
  return b > a ? `about ${a} h of build left, maybe ${b}` : `about ${a} h of build left`;
}

/** Steady words: change only past 15%, or after 3 s on the other side of a rounding step; at least every 5 s. */
export class EtaSteady {
  constructor() { this.words = ''; this.val = 0; this.shownAt = 0; this.otherSince = null; this.roseAt = null; }
  update(val, words, now) {
    if (!this.words || !words) { this.set(val, words, now); return this.words; }
    if (words === this.words) { this.otherSince = null; return this.words; }
    const rel = this.val > 0 ? Math.abs(val - this.val) / this.val : 1;
    if (this.otherSince === null) this.otherSince = now;
    if (rel > 0.15 || now - this.otherSince >= 3000 || now - this.shownAt >= 5000) this.set(val, words, now);
    return this.words;
  }
  set(val, words, now) {
    if (this.words && words && this.val > 0 && val > this.val * 1.25) this.roseAt = now;
    this.words = words; this.val = val; this.shownAt = now; this.otherSince = null;
  }
}

export const PHASE_SIGMA = 0.6;
export function calibration(ratios) {
  let s = 0, n = 0;
  for (const x of ratios) if (x > 0) { s += Math.log(x); n++; }
  return Math.exp(s / (n + 2));
}

export function overallNow(plan, now, seed = 1) {
  const ph = plan.phases.filter((x) => x.hours > 0);
  if (!ph.length) return null;
  const H = 3_600_000, total = ph.reduce((s, x) => s + x.hours, 0);
  const runI = ph.findIndex((x) => x.status === 'running');
  const e = plan.runE + (plan.running ? Math.max(0, now - plan.at) : 0);
  let runF = 0;
  if (runI >= 0) {
    const est = { mu: Math.log(ph[runI].hours * H * plan.R), sigma: PHASE_SIGMA };
    runF = e > 0 ? e / (e + remaining(est, e)) : 0;
  }
  const doneH = ph.filter((x) => x.status === 'done').reduce((s, x) => s + x.hours, 0);
  const todoH = ph.filter((x) => x.status === 'todo').reduce((s, x) => s + x.hours, 0);
  const runH = runI >= 0 ? ph[runI].hours : 0;
  const p = (doneH + runH * runF) / total;
  const restH = runH * (1 - runF) + todoH;
  const left = restH * H * plan.R;
  const rand = rng(seed), n = 400, out = new Array(n);
  for (let i = 0; i < n; i++) {
    let ratio;
    if (plan.ratios.length >= 3) ratio = plan.ratios[Math.floor(rand() * plan.ratios.length)];
    else { const u = Math.max(1e-12, rand()), v = rand(); ratio = plan.R * Math.exp(0.35 * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)); }
    out[i] = restH * H * ratio;
  }
  out.sort((a, b) => a - b);
  const done = ph.filter((x) => x.status === 'done').length;
  return { p: Math.max(0, Math.min(1, p)), left, p50: out[n >> 1], p80: out[Math.floor(n * 0.8)], phase: runI >= 0 ? runI + 1 : Math.min(ph.length, done + 1), of: ph.length, runF };
}
