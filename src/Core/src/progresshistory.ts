// How long things take HERE: the progress engine's memory (2026-10-21, docs/PROGRESS-RESEARCH.md 3.3).
//
// Why: an equal slice per to-do item is the worst guess there is, and asking the model is off by 3-10x. So every
// finished thing (a to-do item, a shell command, a helper agent, a CI run and its steps, a plan phase) leaves one
// short line in progress-history.jsonl in his Aang folder, and the bars size their slices from those lines.
//
// The rules he was promised:
//   - only working time (idle, paused, waiting for his OK and compaction are left out by the clocks that measure it);
//   - event timestamps, never arrival times (the tracker passes the mod's own `t`);
//   - only finished, successful samples teach (a failed or aborted one is written, but never feeds an estimate, so a
//     hung build can't poison the median: Jenkins' mistake);
//   - nothing secret: a label is lower-cased, masked by stripSecrets and cut to 60 characters; a command to its first
//     40 masked characters; no file contents, no prompts, no paths;
//   - small and bounded: about 100 bytes a line, cut back to the newest 5,000 once it passes 6,000;
//   - survives restarts: the stats are rebuilt from the file on start.
//
// Keys go from narrow to broad and each is pulled towards the broader one (shrinkage, k = 3), so a label seen once
// leans on its kind, and a kind seen once leans on the seed priors below.
import { appendFile, readFileSync } from 'node:fs';
import path from 'node:path';
import { reportWriteFailure, writeFileAtomic } from './atomic.ts';
import { estOf, shrink } from './progressmath.ts';
import type { Est } from './progressmath.ts';

export type Src = 'task' | 'agent' | 'ci-run' | 'ci-step' | 'cmd' | 'turn' | 'phase';
export interface Sample {
  at: number;
  src: Src;
  /** The project (a folder's name) or, for CI, owner/repo. */
  p?: string;
  /** The kind: a to-do item's kind, a command's family, an agent's type, a CI workflow. */
  k?: string;
  /** The narrow key: a to-do label, a command's start, an agent's task kind, a CI event or job|step. */
  key: string;
  ms: number;
  /** Model family (haiku/sonnet/opus). */
  m?: string;
  ok: boolean;
  /** ln(actual / the median it was given), for the per-model multiplier. */
  x?: number;
  /** A phase's human estimate in ms. */
  est?: number;
  /** A CI run's id, so a run is learned once. */
  id?: string;
}

export const historyFile = (dataDir: string) => path.join(dataDir, 'progress-history.jsonl');
const MAX_LINES = 6000;
const KEEP_LINES = 5000;
const RECENT = 30;
const SIGMA0 = 0.9;
const MIN = 60_000;

/** Seed priors before any history (research 3.3), sigma 0.9 for all. */
export const SEED: Record<string, number> = {
  implement: 4 * MIN, test: 90_000, build: 60_000, research: 3 * MIN, review: 2 * MIN, commit: 30_000, mockup: 5 * MIN,
  'ci-wait': 5 * MIN, other: 2.5 * MIN,
};
export const AGENT_SEED = 3 * MIN;
/** A command with no history has no estimate at all; this is only the floor of its family's prior once one exists. */
const CMD_SEED = 30_000;

/** Kind of a to-do item, from a small keyword table. It only picks the prior: real events still move the bar. */
export function kindOf(label: string): string {
  const s = label.toLowerCase();
  const rows: [RegExp, string][] = [
    [/\b(commit|push|pull request|open a pr|merge|tag the release)\b/, 'commit'],
    [/\b(wait for|watch) (the )?(ci|checks|build|actions|workflow|run)\b|\bci (run|to finish|to pass)\b/, 'ci-wait'],
    [/\b(tests?|specs?|verify|run the suite|unit tests?|e2e|offscreen check)\b/, 'test'],
    [/\b(build|compile|bundle|type-?check|lint|package|rebuild)\b/, 'build'],
    [/\b(review|audit|look over|double-check|proofread)\b/, 'review'],
    [/\b(research|investigate|explore|find out|look into|read|understand|map|survey|compare|plan)\b/, 'research'],
    [/\b(mock-?ups?|design|sheet|sketch|wireframe|draw)\b/, 'mockup'],
    [/\b(implement|add|write|fix|create|make|wire|update|change|refactor|port|hook up|replace|remove|rename|move|build out|extend|edit)\b/, 'implement'],
  ];
  for (const [re, k] of rows) if (re.test(s)) return k;
  return 'other';
}

export function familyOf(model: string): string {
  const m = model.toLowerCase();
  return /haiku/.test(m) ? 'haiku' : /sonnet/.test(m) ? 'sonnet' : /opus/.test(m) ? 'opus' : /fable/.test(m) ? 'fable' : '';
}

/** A to-do label as a key: lower case, masked, first 5 words, at most 60 characters. */
export function labelKey(label: string, mask: (s: string) => string): string {
  return mask(label.toLowerCase().replace(/[^\p{L}\p{N}\s'-]/gu, ' ').replace(/\s+/g, ' ').trim()).split(' ').slice(0, 5).join(' ').slice(0, 60);
}
/** A command as a key: its first 40 characters after masking. */
export const cmdKey = (cmd: string, mask: (s: string) => string): string => mask(cmd.replace(/\s+/g, ' ').trim()).slice(0, 40);

interface Stat { n: number; vals: number[] }
export interface Estimate extends Est { n: number; earned: boolean }

/** The keys a sample teaches, narrow to broad. */
function keysOf(s: Sample): string[] {
  const p = s.p ?? '', k = s.k ?? '';
  switch (s.src) {
    case 'task': return [`t|${p}|${s.key}`, `t|${p}|*${k}`, `t|*|*${k}`];
    case 'cmd': return [`c|${p}|${s.key}`, `c|${p}|*${k}`, `c|*|*${k}`];
    case 'agent': return [`a|${k}|${s.key}`, `a|${k}`, 'a|*'];
    case 'ci-run': return [`r|${p}|${k}|${s.key}`, `r|${p}|${k}`];
    case 'ci-step': return [`s|${p}|${k}|${s.key}`];
    case 'turn': return [`u|${p}`];
    default: return [];
  }
}

export class ProgressHistory {
  private readonly file: string | null;
  private readonly stats = new Map<string, Stat>();
  private readonly ratios = new Map<string, number[]>();
  private readonly model = new Map<string, { s: number; n: number }>();
  private readonly runs = new Set<string>();
  private lines = 0;
  private writing: Promise<void> = Promise.resolve();
  /** `file` null keeps it in memory only (tests). */
  constructor(file: string | null) {
    this.file = file;
    if (!file) return;
    let text = '';
    try { text = readFileSync(file, 'utf8'); } catch { return; }
    for (const line of text.split('\n')) {
      if (!line.trim()) continue;
      try { const s = fromLine(JSON.parse(line)); if (s) { this.learn(s); this.lines++; } } catch { /* a torn last line: skipped */ }
    }
  }

  private learn(s: Sample): void {
    if (s.src === 'ci-run' && s.id) this.runs.add(`${s.p}|${s.id}`);
    if (!s.ok || !(s.ms > 0)) return;
    if (s.src === 'phase') {
      if (s.est && s.est > 0) { const l = this.ratios.get(s.p ?? '') ?? []; l.push(s.ms / s.est); this.ratios.set(s.p ?? '', l.slice(-RECENT)); }
      return;
    }
    const ln = Math.log(s.ms);
    for (const key of keysOf(s)) {
      let st = this.stats.get(key);
      if (!st) { st = { n: 0, vals: [] }; this.stats.set(key, st); }
      st.n++; st.vals.push(ln);
      if (st.vals.length > RECENT) st.vals.shift();
    }
    if (s.src === 'task' && s.m && Number.isFinite(s.x)) { const f = this.model.get(s.m) ?? { s: 0, n: 0 }; f.s += s.x!; f.n++; this.model.set(s.m, f); }
  }

  /** One finished thing. Written in the background; never throws. */
  add(s: Sample): void {
    const clean: Sample = { ...s, key: s.key.slice(0, 80), ...(s.p ? { p: s.p.slice(0, 80) } : {}), ...(s.k ? { k: s.k.slice(0, 40) } : {}), ms: Math.round(s.ms) };
    this.learn(clean);
    if (!this.file) return;
    const file = this.file;
    this.lines++;
    const line = JSON.stringify(toLine(clean)) + '\n';
    const compact = this.lines > MAX_LINES;
    this.writing = this.writing.then(() => new Promise<void>(resolve => {
      appendFile(file, line, (e) => {
        if (e) reportWriteFailure(file, e);
        if (compact) this.compact(file);
        resolve();
      });
    }));
  }

  /** Cut the file back to its newest KEEP_LINES lines (rare: about once per thousand samples). */
  private compact(file: string): void {
    try {
      const all = readFileSync(file, 'utf8').split('\n').filter(l => l.trim());
      if (all.length <= MAX_LINES) { this.lines = all.length; return; }
      const keep = all.slice(-KEEP_LINES);
      writeFileAtomic(file, keep.join('\n') + '\n');
      this.lines = keep.length;
    } catch (e) { reportWriteFailure(file, e); }
  }

  /** Waits for every write so far (tests, and a clean stop). */
  flush(): Promise<void> { return this.writing; }

  stat(key: string): { n: number; mean: number; var: number } | null {
    const st = this.stats.get(key);
    if (!st || !st.vals.length) return null;
    const m = st.vals.reduce((a, b) => a + b, 0) / st.vals.length;
    const v = st.vals.length > 1 ? st.vals.reduce((a, b) => a + (b - m) * (b - m), 0) / (st.vals.length - 1) : 0;
    return { n: st.n, mean: m, var: v };
  }

  /**
   * The estimate for a chain of keys (narrow first), shrunk from the prior up through each broader key to the
   * narrowest. `earned` is the research's "narrowest key with enough data": some key on the chain has 3+ samples.
   * `n` is the narrowest key with any data's count (0 = the prior alone).
   */
  estimate(chain: readonly string[], prior: Est): Estimate {
    let est: Est = { ...prior }, n = 0, earned = false;
    for (let i = chain.length - 1; i >= 0; i--) {
      const st = this.stat(chain[i]!);
      if (!st) continue;
      est = shrink(est, Math.min(st.n, RECENT), st.mean, st.var);
      n = st.n;
      if (st.n >= 3) earned = true;
    }
    return { ...est, n, earned };
  }

  /** A to-do item, by its label in the project, then the project's kind, then the kind everywhere, then the seed. */
  task(project: string, label: string, mask: (s: string) => string, family = ''): Estimate & { kind: string; key: string } {
    const kind = kindOf(label), key = labelKey(label, mask);
    const e = this.estimate([`t|${project}|${key}`, `t|${project}|*${kind}`, `t|*|*${kind}`], estOf(SEED[kind] ?? SEED.other!, SIGMA0));
    // Per model family (research 3.3): a learned multiplier on the same keys, shrunk hard (k = 5) until it has data.
    const f = family ? this.model.get(family) : undefined;
    const mu = f ? e.mu + f.s / (f.n + 5) : e.mu;
    return { ...e, mu, kind, key };
  }

  /** A shell command: its own start in the project, then its family in the project, then the family everywhere. Null with no data at all. */
  cmd(project: string, cmd: string, family: string, mask: (s: string) => string): Estimate | null {
    const chain = [`c|${project}|${cmdKey(cmd, mask)}`, `c|${project}|*${family}`, `c|*|*${family}`];
    if (!chain.some(k => this.stats.has(k))) return null;
    // Commands have no seed worth the name (an `ls` and a build share nothing): the broadest key with data is the prior.
    const root = [...chain].reverse().map(k => this.stat(k)).find(Boolean);
    return this.estimate(chain, root ? { mu: root.mean, sigma: SIGMA0 } : estOf(CMD_SEED, SIGMA0));
  }

  /** A helper agent: its type and task kind, then its type, then every agent, then 3 min. */
  agent(type: string, what: string): Estimate {
    return this.estimate([`a|${type}|${kindOf(what)}`, `a|${type}`, 'a|*'], estOf(AGENT_SEED, SIGMA0));
  }

  /** A CI run of a workflow (with its event), or null until there is any history: CI starts at "no estimate". */
  ciRun(repo: string, workflow: string, event: string): Estimate | null {
    const chain = [`r|${repo}|${workflow}|${event}`, `r|${repo}|${workflow}`];
    if (!chain.some(k => this.stats.has(k))) return null;
    const base = this.stat(chain[1]!) ?? this.stat(chain[0]!)!;
    return this.estimate(chain, { mu: base.mean, sigma: SIGMA0 });
  }
  /** One CI step, from its own history only; null when never seen. */
  ciStep(repo: string, workflow: string, job: string, step: string): Estimate | null {
    const st = this.stat(`s|${repo}|${workflow}|${job}|${step}`.slice(0, 200));
    if (!st) return null;
    return { ...shrink({ mu: st.mean, sigma: SIGMA0 }, Math.min(st.n, RECENT), st.mean, st.var), n: st.n, earned: st.n >= 3 };
  }
  hasRun(repo: string, id: string): boolean { return this.runs.has(`${repo}|${id}`); }
  ciStepKey = (job: string, step: string): string => `${job}|${step}`.slice(0, 120);

  /** A project's past phases: actual / estimate, newest last. */
  phaseRatios(project: string): number[] { return [...(this.ratios.get(project) ?? [])]; }
}

function toLine(s: Sample): Record<string, unknown> {
  return {
    at: s.at, s: s.src, ...(s.p ? { p: s.p } : {}), ...(s.k ? { k: s.k } : {}), key: s.key, ms: s.ms, ...(s.m ? { m: s.m } : {}), ok: s.ok ? 1 : 0,
    ...(Number.isFinite(s.x) ? { x: Math.round(s.x! * 100) / 100 } : {}), ...(s.est ? { est: Math.round(s.est) } : {}), ...(s.id ? { id: s.id } : {}),
  };
}
function fromLine(o: any): Sample | null {
  const src = String(o?.s ?? '') as Src;
  if (!['task', 'agent', 'ci-run', 'ci-step', 'cmd', 'turn', 'phase'].includes(src) || typeof o.key !== 'string' || !Number.isFinite(o.ms)) return null;
  return {
    at: Number(o.at) || 0, src, key: o.key, ms: Number(o.ms), ok: o.ok === 1 || o.ok === true,
    ...(typeof o.p === 'string' ? { p: o.p } : {}), ...(typeof o.k === 'string' ? { k: o.k } : {}), ...(typeof o.m === 'string' ? { m: o.m } : {}),
    ...(Number.isFinite(o.x) ? { x: Number(o.x) } : {}), ...(Number.isFinite(o.est) ? { est: Number(o.est) } : {}), ...(typeof o.id === 'string' ? { id: o.id } : {}),
  };
}

// ------------------------------------------------------------------ plans (OVERALL)

export const plansFile = (dataDir: string) => path.join(dataDir, 'progress-plans.json');
export interface StoredPhase { label: string; hours: number; status: 'todo' | 'running' | 'done'; workMs: number }
export interface StoredPlan { phases: StoredPhase[]; updatedAt: number }

/**
 * Each project's phase plan, as Claude last gave it through the progress tool, with the working time each phase has
 * had so far. One small JSON file, written atomically; survives restarts so a phase can span sessions and days.
 */
export class PlanStore {
  private readonly file: string | null;
  private plans: Record<string, StoredPlan> = {};
  constructor(file: string | null) {
    this.file = file;
    if (!file) return;
    try {
      const o = JSON.parse(readFileSync(file, 'utf8'));
      if (o && typeof o === 'object') for (const [k, v] of Object.entries(o)) { const p = readPlan(v); if (p) this.plans[k] = p; }
    } catch { /* none yet */ }
  }
  get(project: string): StoredPlan | null { return this.plans[project] ?? null; }
  set(project: string, plan: StoredPlan): void {
    this.plans[project] = plan;
    // At most 40 projects: the oldest plan goes first.
    const keys = Object.keys(this.plans);
    if (keys.length > 40) { const old = keys.sort((a, b) => this.plans[a]!.updatedAt - this.plans[b]!.updatedAt)[0]!; delete this.plans[old]; }
    this.save();
  }
  save(): void {
    if (!this.file) return;
    try { writeFileAtomic(this.file, JSON.stringify(this.plans)); } catch (e) { reportWriteFailure(this.file, e); }
  }
}
function readPlan(v: any): StoredPlan | null {
  if (!v || !Array.isArray(v.phases)) return null;
  const phases = v.phases.slice(0, 30).map((x: any) => ({
    label: String(x?.label ?? '').slice(0, 80), hours: Math.max(0, Math.min(1000, Number(x?.hours) || 0)),
    status: (['todo', 'running', 'done'] as const).includes(x?.status) ? x.status : 'todo', workMs: Math.max(0, Number(x?.workMs) || 0),
  })).filter((x: StoredPhase) => x.label);
  return phases.length ? { phases, updatedAt: Number(v.updatedAt) || 0 } : null;
}
