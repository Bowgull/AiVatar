// The progress engine's arithmetic, v3 (2026-10-21, docs/PROGRESS-RESEARCH.md sections 3 and 4).
//
// Why this file exists: the old bar gave every to-do item an equal slice and crept to 90% of it, which is the shape
// people feel as slowest and which looks exactly like a stall. v3 weighs every item by how long that kind of item
// usually takes HERE (learned from his own history, progresshistory.ts), lets a late item keep inching instead of
// hitting a wall, freezes the bar when nothing has happened for too long, and never lets a rewritten list pull the
// bar back. Everything is a lognormal (mu, sigma) in log-milliseconds, because task times are heavy-tailed.
//
// Pure functions only: the brain uses them to build the numbers it sends, and the Shell has a line-for-line copy
// (src/Shell/pages/progressmath.js) that draws every frame from them. test/progressmath.test.ts checks both agree.

/** An expected duration: ln-milliseconds. The median is exp(mu), the mean exp(mu + sigma²/2). */
export interface Est { mu: number; sigma: number }

export const SIGMA_MIN = 0.35;
export const SIGMA_MAX = 1.5;
/** The first item of a job can't pass a third of the bar before anything has been ticked (Microsoft's rule). */
export const EARLY_CAP = 1 / 3;
/** Time left is only said once the job has run this long (research section 4b). */
export const EARN_MS = 20_000;

export const medianOf = (x: Est): number => Math.exp(x.mu);
export const meanOf = (x: Est): number => Math.exp(x.mu + (x.sigma * x.sigma) / 2);
export const estOf = (medianMs: number, sigma: number): Est => ({ mu: Math.log(Math.max(1, medianMs)), sigma });

// ------------------------------------------------------------------ the normal distribution

/** erfc with relative error under 1.2e-7 everywhere (Numerical Recipes' Chebyshev fit), so far tails stay exact. */
export function erfc(x: number): number {
  const z = Math.abs(x), t = 1 / (1 + 0.5 * z);
  const r = t * Math.exp(-z * z - 1.26551223 + t * (1.00002368 + t * (0.37409196 + t * (0.09678418 + t * (-0.18628806 +
    t * (0.27886807 + t * (-1.13520398 + t * (1.48851587 + t * (-0.82215223 + t * 0.17087277)))))))));
  return x >= 0 ? r : 2 - r;
}
/** Φ(z), the normal CDF. */
export const Phi = (z: number): number => 0.5 * erfc(-z / Math.SQRT2);
/** 1 − Φ(z), computed directly so a late item (big z) keeps its precision. */
export const PhiUpper = (z: number): number => 0.5 * erfc(z / Math.SQRT2);

const A = [-3.969683028665376e+01, 2.209460984245205e+02, -2.759285104469687e+02, 1.383577518672690e+02, -3.066479806614716e+01, 2.506628277459239e+00];
const B = [-5.447609879822406e+01, 1.615858368580409e+02, -1.556989798598866e+02, 6.680131188771972e+01, -1.328068155288572e+01];
const C = [-7.784894002430293e-03, -3.223964580411365e-01, -2.400758277161838e+00, -2.549671010506088e+00, 4.374664141464968e+00, 2.938163982698783e+00];
const D = [7.784695709041462e-03, 3.224671290700398e-01, 2.445134137142996e+00, 3.754408361224082e+00];
/** Φ⁻¹(p), Acklam's approximation (relative error 1.15e-9). p outside (0, 1) is clamped. */
export function PhiInv(p: number): number {
  const q0 = Math.min(1 - 1e-16, Math.max(1e-300, p));
  const lo = 0.02425;
  if (q0 > 1 - lo) return -PhiInv(1 - q0);
  let x: number;
  if (q0 < lo) {
    const q = Math.sqrt(-2 * Math.log(q0));
    x = (((((C[0]! * q + C[1]!) * q + C[2]!) * q + C[3]!) * q + C[4]!) * q + C[5]!) / ((((D[0]! * q + D[1]!) * q + D[2]!) * q + D[3]!) * q + 1);
  } else {
    const q = q0 - 0.5, r = q * q;
    x = (((((A[0]! * r + A[1]!) * r + A[2]!) * r + A[3]!) * r + A[4]!) * r + A[5]!) * q / (((((B[0]! * r + B[1]!) * r + B[2]!) * r + B[3]!) * r + B[4]!) * r + 1);
  }
  // One Halley step against the precise Φ: Acklam alone is off by about 1e-5 in the tails.
  if (q0 > 1e-250) {
    const u = (Phi(x) - q0) * Math.sqrt(2 * Math.PI) * Math.exp((x * x) / 2);
    x = x - u / (1 + (x * u) / 2);
  }
  return x;
}

// ------------------------------------------------------------------ one item's time left

/**
 * Far in the tail (z > 8, where 1 − Φ underflows), the k with Q(k) = Q(z) / 2, from the asymptotic log tail
 * ln Q(x) ≈ −x²/2 − ln(x√(2π)) + ln(1 − 1/x² + 3/x⁴), by two Newton steps from z + ln2/z. Continuous with the exact form.
 */
function tailHalf(z: number): number {
  const lnQ = (x: number) => -x * x / 2 - Math.log(x * Math.sqrt(2 * Math.PI)) + Math.log(1 - 1 / (x * x) + 3 / (x * x * x * x));
  const target = lnQ(z) - Math.LN2;
  let k = z + Math.LN2 / z;
  for (let i = 0; i < 2; i++) k -= (lnQ(k) - target) / (-k - 1 / k);
  return k;
}

/**
 * How much longer an item that has already run `e` ms will probably take: the median of its lognormal given it lasts
 * longer than `e`, less `e` (research 3.2). At e = 0 it is the plain median; once the item is late it does not hit 0
 * and sit there, it grows slowly, which is the truth for heavy-tailed work. No cap to tune.
 */
export function remaining(x: Est, e: number): number {
  if (!(e > 0)) return Math.exp(x.mu);
  const s = Math.max(1e-6, x.sigma), z = (Math.log(e) - x.mu) / s;
  // Upper-tail form: median of Z given Z > z is −Φ⁻¹(Q(z)/2). Past z = 8 the asymptote z + ln2/z is exact to 0.1%.
  const k = z > 8 ? tailHalf(z) : -PhiInv(PhiUpper(z) / 2);
  return Math.max(0, Math.exp(x.mu + s * k) - e);
}

/** The p90 of an item: "a tool usually done by now" for the stall rule. */
export const p90Of = (x: Est): number => Math.exp(x.mu + 1.2816 * x.sigma);

// ------------------------------------------------------------------ learning

/**
 * Empirical-Bayes shrinkage (research 3.3): n samples with mean m and variance s2 of ln ms, pulled towards the broader
 * key's (mu, sigma) with weight k. Sigma is kept between 0.35 and 1.5 so neither a lucky streak nor one wild run rules.
 */
export function shrink(parent: Est, n: number, m: number, s2: number, k = 3): Est {
  if (!(n > 0)) return { ...parent };
  const mu = (k * parent.mu + n * m) / (k + n);
  const sigma = Math.sqrt((k * parent.sigma * parent.sigma + n * Math.max(0, s2)) / (k + n));
  return { mu, sigma: Math.min(SIGMA_MAX, Math.max(SIGMA_MIN, sigma)) };
}

/**
 * The session's speed factor r (research 3.2): how its finished items compared with their medians, shrunk towards 1
 * by the +2, so one fast commit doesn't make the whole job look quick. Multiplies the pending medians.
 */
export function speedFactor(done: readonly { actual: number; median: number }[]): number {
  let s = 0, n = 0;
  for (const d of done) if (d.actual > 0 && d.median > 0) { s += Math.log(d.actual / d.median); n++; }
  return Math.exp(s / (n + 2));
}

// ------------------------------------------------------------------ the stall rule

/**
 * How long a working job may stay silent before it counts as stalled (research 3.5): a tool running gets twice its
 * usual p90 (at least a minute; 3 min with no history); a model streaming gets 90 s (the API slow or retrying);
 * between steps 60 s, which should be seconds.
 */
export function stallLimit(o: { tool: boolean; toolP90?: number | null; streaming: boolean }): number {
  if (o.tool) return Math.max(60_000, o.toolP90 && o.toolP90 > 0 ? 2 * o.toolP90 : 180_000);
  return o.streaming ? 90_000 : 60_000;
}

// ------------------------------------------------------------------ the bar

/** What the brain sends about one job's to-do list (Job.progress, v 3). Times are this PC's clock. */
export interface ProgressV3 {
  v: 3;
  done: number;
  total: number;
  /** The item in hand, or -1 with everything ticked. */
  cur: number;
  /** When these numbers were taken. */
  at: number;
  /** Working ms on the item in hand at `at`. */
  e: number;
  /** Working ms of the whole job at `at`. */
  jobW: number;
  /** The ACTUAL working ms of the finished items, summed. */
  doneW: number;
  /** The item in hand's expected duration; null with everything ticked. */
  curEst: Est | null;
  /** The pending items' expected durations, raw (r not applied). */
  pend: Est[];
  /** This session's speed factor. */
  r: number;
  /** The estimate rests on real data: a key with 3+ samples, or an item of this job finished. */
  earned: boolean;
  /** The never-backwards squeeze after a rewrite (research 3.4): a = the bar drawn then, m0 = the new model then. */
  sq: { a: number; m0: number } | null;
  /** A reason said once ("Claude added 3 steps", "Tidying its memory"), with when. */
  note: { text: string; at: number } | null;
  /** The last sign of life (tool, stream chunk, helper's tool call, ask, list change) and the silence allowed. */
  aliveAt: number;
  stallMs: number;
  /** The working clock runs at `at` (the turn is on, nothing waits on him, not paused). */
  running: boolean;
  /** Counts list rewrites. */
  rev: number;
  /** For an older viewer: the same as `e`, and no pace. */
  elapsedMs: number;
  paceMs: null;
  rewroteAt: number | null;
  /** False for a CI run measured as one item: the first-third cap is for to-do lists only. */
  cap?: false;
}

/** A helper agent's own clock, as a row and (when it blocks the main loop) a floor under the item's time left. */
export interface AgentEst { since: number; est: Est | null; fg: boolean; failed?: boolean; endedAt?: number }

export interface BarNow {
  /** 0..1, the bar as drawn: squeezed, early-capped, frozen in a stall. */
  p: number;
  /** The model fraction before the squeeze. */
  m: number;
  /** Time left from the same numbers as the bar (ms). */
  left: number;
  /** Working ms on the item in hand, as of now (frozen in a stall). */
  e: number;
  jobW: number;
  stalled: boolean;
  /** How long nothing has been heard, while stalled. */
  silentMs: number;
  /** The item in hand has run past its own p90: "Taking longer than usual". */
  late: boolean;
}

/** The squeeze (research 3.4): from the bar drawn at the rewrite, fill the rest at a pace that ends at 100% with the work. */
export function squeeze(m: number, sq: { a: number; m0: number } | null): number {
  if (!sq) return m;
  if (sq.m0 >= 1) return m >= 1 ? 1 : sq.a;
  return sq.a + (1 - sq.a) * Math.max(0, m - sq.m0) / (1 - sq.m0);
}

/**
 * Where a job's bar stands at `now` (research 3.2): fraction = (doneW + e) / (doneW + e + curRem + pendW), time left =
 * curRem + pendW, so the two can never disagree. A foreground helper agent puts a floor under curRem. `phaseWorking`
 * is the job's phase; the clock runs only when that and `p.running` say so, and stops at the stall's onset.
 */
export function barNow(p: ProgressV3, phaseWorking: boolean, now: number, agents: readonly AgentEst[] = []): BarNow {
  const running = phaseWorking && p.running;
  const silent = Math.max(0, now - p.aliveAt);
  const stalled = running && silent > p.stallMs;
  // The clock stops where the stall began, so the bar freezes in place and starts again on the next sign of life.
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

// ------------------------------------------------------------------ the range (Monte Carlo)

/** A small seeded generator, so the same job draws the same samples and the words don't flicker. */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function seedOf(s: string): number { let h = 2166136261; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619); return h >>> 0; }

/**
 * The p50 and p80 of the time left (research 3.2): 500 draws of the item in hand from its lognormal truncated at `e`,
 * plus every pending item from its own (r applied). Microseconds of work; the viewer does it about once a second.
 */
export function etaRange(cur: Est | null, e: number, pend: readonly Est[], r: number, seed: number, n = 500): { p50: number; p80: number } {
  const rand = rng(seed), lr = Math.log(r > 0 ? r : 1);
  const normal = () => { const u = Math.max(1e-12, rand()), v = rand(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
  const out: number[] = new Array(n);
  const z = cur && e > 0 ? (Math.log(e) - cur.mu) / Math.max(1e-6, cur.sigma) : -Infinity;
  const tail = cur ? (z === -Infinity ? 1 : PhiUpper(z)) : 0;
  for (let i = 0; i < n; i++) {
    let s = 0;
    if (cur) {
      const v = Math.max(1e-12, rand());
      // A draw from the upper tail beyond z: exact by inversion, or the Rayleigh tail once Q(z) underflows.
      const x = z > 8 ? Math.sqrt(z * z - 2 * Math.log(v)) : -PhiInv(tail * v);
      s += Math.max(0, Math.exp(cur.mu + cur.sigma * x) - e);
    }
    for (const p of pend) s += Math.exp(p.mu + lr + p.sigma * normal());
    out[i] = s;
  }
  out.sort((a, b) => a - b);
  return { p50: out[Math.floor(n * 0.5)]!, p80: out[Math.floor(n * 0.8)]! };
}

// ------------------------------------------------------------------ the words

/** Research section 4 rounding: no false precision. */
export function roundLeft(ms: number): string {
  if (ms < 45_000) return 'under a minute';
  const min = ms / 60_000;
  if (min < 10) return `${Math.max(1, Math.round(min))} min`;
  if (min < 60) { const m5 = Math.round(min / 5) * 5; return m5 >= 60 ? '1 h' : `${m5} min`; }
  const q = Math.round(min / 15) * 15, h = Math.floor(q / 60), m = q % 60;
  return m ? `${h} h ${m} min` : `${h} h`;
}
/** Whole minutes as a bare number for a range's low end ("4-7 min"), by the same rounding. */
const minutesOf = (ms: number): number => { const min = ms / 60_000; return min < 10 ? Math.max(1, Math.round(min)) : Math.round(min / 5) * 5; };

/**
 * The time-left words from the headline figure and the spread (research section 4): narrow (p80/p50 < 1.6) is
 * "about 4 min left", wider a range "4-7 min left", wider than 3x no number at all, "a while yet".
 */
export function etaWords(ms: number, ratio: number): string {
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

/** "about 6 h of build left, maybe 9" for OVERALL. */
export function overallWords(p50: number, p80: number): string {
  if (!(p50 > 0)) return '';
  const hrs = (ms: number) => { const h = ms / 3_600_000; return h < 10 ? Math.round(h * 2) / 2 : Math.round(h); };
  if (p50 < 3_600_000) {
    const a = roundLeft(p50);
    return p80 > p50 * 1.25 ? `about ${a} of build left, maybe ${roundLeft(p80)}` : `about ${a} of build left`;
  }
  const a = hrs(p50), b = hrs(p80);
  return b > a ? `about ${a} h of build left, maybe ${b}` : `about ${a} h of build left`;
}

/**
 * Steady words (research section 4): recompute every second, but change what is shown only when the new figure
 * differs by more than 15%, or it has sat on the other side of a rounding step for 3 s; at least every 5 s. `rose`
 * says the shown figure just went up by more than 25%, so the line can give the reason once.
 */
export class EtaSteady {
  words = '';
  val = 0;
  shownAt = 0;
  private otherSince: number | null = null;
  roseAt: number | null = null;
  update(val: number, words: string, now: number): string {
    if (!this.words || !words) { this.set(val, words, now); return this.words; }
    if (words === this.words) { this.otherSince = null; return this.words; }
    const rel = this.val > 0 ? Math.abs(val - this.val) / this.val : 1;
    if (this.otherSince === null) this.otherSince = now;
    if (rel > 0.15 || now - this.otherSince >= 3000 || now - this.shownAt >= 5000) this.set(val, words, now);
    return this.words;
  }
  private set(val: number, words: string, now: number): void {
    if (this.words && words && this.val > 0 && val > this.val * 1.25) this.roseAt = now;
    this.words = words; this.val = val; this.shownAt = now; this.otherSince = null;
  }
}

// ------------------------------------------------------------------ OVERALL (the plan)

export type PhaseStatus = 'todo' | 'running' | 'done';
export interface PlanPhase { label: string; hours: number; status: PhaseStatus }
/** What the brain sends about a project's plan (Job.plan). */
export interface PlanV3 {
  phases: PlanPhase[];
  /** Working ms already spent on the running phase, at `at`. */
  runE: number;
  at: number;
  /** A session of this project is working right now (the phase's clock runs). */
  running: boolean;
  /** The project's calibration: geometric mean of actual/estimate over its finished phases, shrunk to 1 (k = 2). */
  R: number;
  /** Up to 30 past actual/estimate ratios, for the p50/p80 (Evidence-Based Scheduling). */
  ratios: number[];
}

/** The phase's spread around its calibrated estimate: estimates by a human who knows the work are tighter than a guess. */
export const PHASE_SIGMA = 0.6;

/** R from past phases (research 3.8): geometric mean of actual/estimate, shrunk towards 1 with k = 2. */
export function calibration(ratios: readonly number[]): number {
  let s = 0, n = 0;
  for (const x of ratios) if (x > 0) { s += Math.log(x); n++; }
  return Math.exp(s / (n + 2));
}

export interface OverallNow { p: number; left: number; p50: number; p80: number; phase: number; of: number; runF: number }

/**
 * OVERALL (research 3.8): overall = (done estimates + the running phase's estimate × its live fraction) / all
 * estimates; time left = (running × (1 − fraction) + todo) × R. The running phase's live fraction is time-based like
 * every other bar here (its working time against its calibrated estimate, with the same overrun curve), because one
 * session's to-do list is one turn, not a whole phase.
 */
export function overallNow(plan: PlanV3, now: number, seed = 1): OverallNow | null {
  const ph = plan.phases.filter(x => x.hours > 0);
  if (!ph.length) return null;
  const H = 3_600_000, total = ph.reduce((s, x) => s + x.hours, 0);
  const runI = ph.findIndex(x => x.status === 'running');
  const e = plan.runE + (plan.running ? Math.max(0, now - plan.at) : 0);
  let runF = 0;
  if (runI >= 0) {
    const est: Est = { mu: Math.log(ph[runI]!.hours * H * plan.R), sigma: PHASE_SIGMA };
    runF = e > 0 ? e / (e + remaining(est, e)) : 0;
  }
  const doneH = ph.filter(x => x.status === 'done').reduce((s, x) => s + x.hours, 0);
  const todoH = ph.filter(x => x.status === 'todo').reduce((s, x) => s + x.hours, 0);
  const runH = runI >= 0 ? ph[runI]!.hours : 0;
  const p = (doneH + runH * runF) / total;
  const restH = runH * (1 - runF) + todoH;
  const left = restH * H * plan.R;
  // p50/p80 over the history of R: a bootstrap of his own past ratios once there are 3, else a spread around R.
  const rand = rng(seed), n = 400, out: number[] = new Array(n);
  for (let i = 0; i < n; i++) {
    let ratio: number;
    if (plan.ratios.length >= 3) ratio = plan.ratios[Math.floor(rand() * plan.ratios.length)]!;
    else { const u = Math.max(1e-12, rand()), v = rand(); ratio = plan.R * Math.exp(0.35 * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)); }
    out[i] = restH * H * ratio;
  }
  out.sort((a, b) => a - b);
  const done = ph.filter(x => x.status === 'done').length;
  return { p: Math.max(0, Math.min(1, p)), left, p50: out[n >> 1]!, p80: out[Math.floor(n * 0.8)]!, phase: runI >= 0 ? runI + 1 : Math.min(ph.length, done + 1), of: ph.length, runF };
}
