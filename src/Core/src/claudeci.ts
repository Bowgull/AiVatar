// CI as a first-class job (2026-10-21, docs/PROGRESS-RESEARCH.md 3.7): the best thing in his Waymark mod, fed from
// real history instead of label guesses.
//
// For a Claude session whose folder has a GitHub remote, and only when `gh` is installed here, the brain watches that
// repo's GitHub Actions runs:
//   - once per repo: the last 20 runs (their durations become history, failures kept apart) and the steps of up to 10
//     successful ones, so a bar has real numbers from the first run it shows;
//   - after a session pushes: a look 3 s later, then every 5 s for up to 2 minutes until the new run appears;
//   - while a run is queued or in progress: every 5 s (far inside GitHub's 5,000 requests an hour);
//   - otherwise: nothing at all. No idle polling.
// One `gh` at a time, each with a 15 s limit, never awaited by anything on the event path, never throws.
//
// A run's bar is step-weighted, the same sum as a Claude job's (progressmath.ts barNow): finished steps at their real
// time, the running step by its own history's overrun curve, pending steps at their medians. A queued run has no bar
// ("Waiting for a runner · 40 s"). With no step history but 3+ past runs, the run as one item; with neither, elapsed only.
import { runOffThread } from './offthread.ts';
import type { Est, ProgressV3 } from './progressmath.ts';
import type { ProgressHistory } from './progresshistory.ts';

/** Runs a program; its stdout, or null on any failure. Injected so tests need no gh or git. */
export type Runner = (cmd: 'gh' | 'git', args: string[], cwd?: string) => Promise<string | null>;

// 2026-10-21: started from the helper thread (offthread.ts): starting gh or git from the brain's own thread held it for
// 30-150 ms each time on his PC.
const defaultRunner: Runner = async (cmd, args, cwd) => {
  const r = await runOffThread(cmd, args, { ...(cwd ? { cwd } : {}), timeout: 15_000, maxBuffer: 4 * 1024 * 1024 });
  return r.ok ? r.out : null;
};

/** "owner/repo" from a git remote URL, or null when it is not GitHub. */
export function parseRemote(url: string): string | null {
  const m = /github\.com[:/]([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+?)(?:\.git)?\/?\s*$/.exec(url.trim());
  return m ? `${m[1]}/${m[2]}` : null;
}

const time = (s: unknown): number | null => { const t = Date.parse(String(s ?? '')); return Number.isFinite(t) && t > 946_684_800_000 ? t : null; };
const str = (v: unknown, n: number): string => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, n);

export interface CiRun { id: string; workflow: string; title: string; event: string; branch: string; status: string; conclusion: string; url: string; createdAt: number; startedAt: number | null; updatedAt: number | null }
export interface CiStep { name: string; status: string; conclusion: string; startedAt: number | null; completedAt: number | null }
export interface CiJob { name: string; status: string; conclusion: string; startedAt: number | null; completedAt: number | null; steps: CiStep[] }

/** `gh run list --json ...`. Anything malformed is skipped. */
export function parseRuns(text: string): CiRun[] {
  let a: unknown;
  try { a = JSON.parse(text); } catch { return []; }
  if (!Array.isArray(a)) return [];
  return a.flatMap((r: any) => {
    const id = String(r?.databaseId ?? '');
    if (!/^\d{1,20}$/.test(id)) return [];
    return [{ id, workflow: str(r.workflowName, 80) || 'CI', title: str(r.displayTitle, 120), event: str(r.event, 30), branch: str(r.headBranch, 80),
      status: str(r.status, 20), conclusion: str(r.conclusion, 20), url: /^https:\/\/github\.com\//.test(String(r.url)) ? str(r.url, 200) : '',
      createdAt: time(r.createdAt) ?? 0, startedAt: time(r.startedAt), updatedAt: time(r.updatedAt) }];
  });
}

/** `gh run view <id> --json jobs`. */
export function parseJobs(text: string): CiJob[] {
  let o: any;
  try { o = JSON.parse(text); } catch { return []; }
  if (!Array.isArray(o?.jobs)) return [];
  return o.jobs.slice(0, 50).map((j: any) => ({
    name: str(j?.name, 80), status: str(j?.status, 20), conclusion: str(j?.conclusion, 20), startedAt: time(j?.startedAt), completedAt: time(j?.completedAt),
    steps: (Array.isArray(j?.steps) ? j.steps : []).slice(0, 80).map((s: any) => ({ name: str(s?.name, 80), status: str(s?.status, 20), conclusion: str(s?.conclusion, 20), startedAt: time(s?.startedAt), completedAt: time(s?.completedAt) })),
  }));
}

/** One CI run as the Shell draws it (a row under the job of every session in that repo). */
export interface CiRow {
  id: string; repo: string; workflow: string; title: string; url: string;
  status: 'queued' | 'in_progress' | 'completed';
  conclusion: string;
  createdAt: number;
  startedAt: number | null;
  /** The step in hand, e.g. "Build app (unsigned)", and where it is ("step 9 of 12"). */
  step: string; stepNo: number; steps: number;
  /** The bar's numbers in the Claude jobs' own shape (null: no history yet, elapsed only). */
  progress: ProgressV3 | null;
}

/** The bar's numbers for a run, from its jobs' steps and the history (research 3.7). Pure, for the tests. */
export function runModel(hist: ProgressHistory, repo: string, run: CiRun, jobs: CiJob[], at: number): { progress: ProgressV3 | null; step: string; stepNo: number; steps: number } {
  const none = { progress: null, step: '', stepNo: 0, steps: 0 };
  if (run.status !== 'in_progress') return none;
  // The slowest job is the run's critical path: the one with the most expected time left.
  let best: { p: ProgressV3; left: number; step: string; stepNo: number; steps: number } | null = null;
  let allKnown = jobs.length > 0;
  for (const j of jobs) {
    if (j.status === 'completed') continue;
    const steps = j.steps;
    let doneW = 0, done = 0, cur = -1, e = 0, curEst: Est | null = null, earned = true, ok = true;
    const pend: Est[] = [];
    steps.forEach((s, i) => {
      const h = hist.ciStep(repo, run.workflow, j.name, s.name);
      if (s.status === 'completed') { done++; if (s.startedAt && s.completedAt) doneW += Math.max(0, s.completedAt - s.startedAt); return; }
      if (!h) { ok = false; return; }
      if (!h.earned) earned = false;
      if (s.status === 'in_progress' && cur < 0) { cur = i; e = s.startedAt ? Math.max(0, at - s.startedAt) : 0; curEst = { mu: h.mu, sigma: h.sigma }; }
      else pend.push({ mu: h.mu, sigma: h.sigma });
    });
    if (!ok || !steps.length) { allKnown = false; continue; }
    const p: ProgressV3 = { v: 3, done, total: steps.length, cur, at, e, jobW: j.startedAt ? Math.max(0, at - j.startedAt) : e, doneW, curEst, pend, r: 1, earned,
      sq: null, note: null, aliveAt: at, stallMs: 3_600_000, running: true, rev: 0, elapsedMs: e, paceMs: null, rewroteAt: null, cap: false };
    const left = (curEst ? Math.exp((curEst as Est).mu) : 0) + pend.reduce((s, x) => s + Math.exp(x.mu), 0);
    if (!best || left > best.left) best = { p, left, step: cur >= 0 ? steps[cur]!.name : '', stepNo: cur >= 0 ? cur + 1 : done, steps: steps.length };
  }
  if (best && allKnown) return { progress: best.p, step: best.step, stepNo: best.stepNo, steps: best.steps };
  // No step history for every step: the run as one item, once its workflow has 3+ runs behind it.
  const runEst = hist.ciRun(repo, run.workflow, run.event);
  const jobNow = jobs.find(j => j.status === 'in_progress');
  const stepNow = jobNow?.steps.find(s => s.status === 'in_progress');
  const meta = { step: stepNow?.name ?? '', stepNo: stepNow && jobNow ? jobNow.steps.indexOf(stepNow) + 1 : 0, steps: jobNow?.steps.length ?? 0 };
  if (!runEst || runEst.n < 3 || !run.startedAt) return { progress: null, ...meta };
  const e = Math.max(0, at - run.startedAt);
  return { progress: { v: 3, done: 0, total: 1, cur: 0, at, e, jobW: e, doneW: 0, curEst: { mu: runEst.mu, sigma: runEst.sigma }, pend: [], r: 1, earned: true,
    sq: null, note: null, aliveAt: at, stallMs: 3_600_000, running: true, rev: 0, elapsedMs: e, paceMs: null, rewroteAt: null, cap: false }, ...meta };
}

interface RepoState {
  repo: string;
  cwds: Set<string>;
  backfilled: boolean;
  runs: Map<string, { run: CiRun; jobs: CiJob[]; seenAt: number }>;
  /** After a push: look until this time for the new run. */
  watchUntil: number;
  knownIds: Set<string>;
}

const FAST_MS = 5_000;
const AFTER_PUSH_MS = 120_000;
const SHOW_DONE_MS = 120_000;

export class CiTracker {
  private readonly hist: ProgressHistory;
  private readonly run: Runner;
  private readonly onChange: () => void;
  private readonly repos = new Map<string, RepoState>();
  private readonly cwdRepo = new Map<string, string | null>();
  private ghOk: boolean | null = null;
  private timer: NodeJS.Timeout | null = null;
  private busy = false;
  private closed = false;
  readonly now: () => number;
  constructor(hist: ProgressHistory, opts: { run?: Runner; onChange?: () => void; now?: () => number } = {}) {
    this.hist = hist; this.run = opts.run ?? defaultRunner; this.onChange = opts.onChange ?? (() => {}); this.now = opts.now ?? Date.now;
  }

  /** A session works in this folder: find its GitHub repo once, and learn the repo's history once. */
  watch(cwd: string): void {
    if (!cwd || this.cwdRepo.has(cwd) || this.closed) return;
    this.cwdRepo.set(cwd, null);
    void this.resolve(cwd);
  }
  private async resolve(cwd: string): Promise<void> {
    if (this.ghOk === null) this.ghOk = (await this.run('gh', ['--version'])) !== null;
    if (!this.ghOk) return;
    const url = await this.run('git', ['-C', cwd, 'remote', 'get-url', 'origin'], cwd);
    const repo = url ? parseRemote(url) : null;
    this.cwdRepo.set(cwd, repo);
    if (!repo) return;
    let st = this.repos.get(repo);
    if (!st) { st = { repo, cwds: new Set(), backfilled: false, runs: new Map(), watchUntil: 0, knownIds: new Set() }; this.repos.set(repo, st); }
    st.cwds.add(cwd);
    if (!st.backfilled) { st.backfilled = true; await this.backfill(st); }
  }

  /** A session in this folder pushed: look for its run (research 3.7). */
  pushed(cwd: string): void {
    const repo = this.cwdRepo.get(cwd);
    if (!repo) { this.watch(cwd); return; }
    const st = this.repos.get(repo);
    if (!st) return;
    st.watchUntil = this.now() + AFTER_PUSH_MS;
    this.schedule(3000);
  }

  /** What to show under a job in this folder: runs in flight, and ones that ended in the last 2 minutes. */
  rows(cwd: string, now = this.now()): CiRow[] {
    const repo = this.cwdRepo.get(cwd);
    const st = repo ? this.repos.get(repo) : null;
    if (!st) return [];
    const out: CiRow[] = [];
    for (const { run, jobs } of st.runs.values()) {
      if (run.status === 'completed' && now - (run.updatedAt ?? 0) > SHOW_DONE_MS) continue;
      const m = runModel(this.hist, st.repo, run, jobs, Math.min(now, this.now()));
      out.push({ id: run.id, repo: st.repo, workflow: run.workflow, title: run.title, url: run.url,
        status: run.status === 'queued' || run.status === 'in_progress' ? run.status : run.status === 'completed' ? 'completed' : 'queued',
        conclusion: run.conclusion, createdAt: run.createdAt, startedAt: run.startedAt, step: m.step, stepNo: m.stepNo, steps: m.steps, progress: m.progress });
    }
    return out.sort((a, b) => b.createdAt - a.createdAt).slice(0, 4);
  }

  private async backfill(st: RepoState): Promise<void> {
    const text = await this.gh(['run', 'list', '-R', st.repo, '--limit', '20', '--json', RUN_FIELDS]);
    if (!text) return;
    const runs = parseRuns(text);
    let views = 0;
    for (const r of runs) {
      st.knownIds.add(r.id);
      if (r.status !== 'completed') { st.runs.set(r.id, { run: r, jobs: [], seenAt: this.now() }); continue; }
      if (this.hist.hasRun(st.repo, r.id)) continue;
      const ok = r.conclusion === 'success';
      let jobs: CiJob[] = [];
      if (ok && views < 10) { views++; jobs = parseJobs((await this.gh(['run', 'view', r.id, '-R', st.repo, '--json', 'jobs'])) ?? ''); }
      this.learn(st.repo, r, jobs);
    }
    if ([...st.runs.values()].some(x => x.run.status !== 'completed')) { this.schedule(0); this.onChange(); }
  }

  /** A finished run becomes history: the run (failures kept apart: ok false) and, for a good run, its steps. */
  private learn(repo: string, r: CiRun, jobs: CiJob[]): void {
    if (!r.startedAt || !r.updatedAt || this.hist.hasRun(repo, r.id)) return;
    const ok = r.conclusion === 'success';
    this.hist.add({ at: r.updatedAt, src: 'ci-run', p: repo, k: r.workflow, key: r.event || 'push', ms: Math.max(1, r.updatedAt - r.startedAt), ok, id: r.id });
    if (!ok) return;
    for (const j of jobs) for (const s of j.steps) {
      if (s.conclusion !== 'success' || !s.startedAt || !s.completedAt) continue;
      this.hist.add({ at: s.completedAt, src: 'ci-step', p: repo, k: r.workflow, key: `${j.name}|${s.name}`.slice(0, 120), ms: Math.max(1, s.completedAt - s.startedAt), ok: true });
    }
  }

  private schedule(ms: number): void {
    if (this.closed) return;
    if (this.timer) { clearTimeout(this.timer); this.timer = null; }
    this.timer = setTimeout(() => { this.timer = null; void this.tick(); }, ms);
    this.timer.unref?.();
  }

  /** One round: every repo with a run in flight, or watching for a pushed run. Schedules the next only if needed. */
  async tick(): Promise<void> {
    if (this.busy || this.closed) return;
    this.busy = true;
    let again = false, changed = false;
    try {
      const now = this.now();
      for (const st of this.repos.values()) {
        const flying = [...st.runs.values()].filter(x => x.run.status !== 'completed');
        if (!flying.length && now > st.watchUntil) continue;
        const text = await this.gh(['run', 'list', '-R', st.repo, '--limit', '10', '--json', RUN_FIELDS]);
        if (text) {
          for (const r of parseRuns(text)) {
            const had = st.runs.get(r.id);
            if (!had && st.knownIds.has(r.id) && r.status === 'completed') continue;
            if (!had) { st.knownIds.add(r.id); st.watchUntil = 0; }
            if (!had || had.run.status !== r.status || had.run.conclusion !== r.conclusion) changed = true;
            const entry = { run: r, jobs: had?.jobs ?? [], seenAt: now };
            st.runs.set(r.id, entry);
            if (r.status === 'in_progress' || (had && had.run.status !== 'completed' && r.status === 'completed')) {
              const jobs = parseJobs((await this.gh(['run', 'view', r.id, '-R', st.repo, '--json', 'jobs'])) ?? '');
              if (jobs.length) { entry.jobs = jobs; changed = true; }
              if (r.status === 'completed') this.learn(st.repo, r, jobs);
            }
          }
        }
        // Old finished runs go after a while; the list stays small.
        for (const [id, x] of st.runs) if (x.run.status === 'completed' && now - (x.run.updatedAt ?? 0) > SHOW_DONE_MS) st.runs.delete(id);
        if ([...st.runs.values()].some(x => x.run.status !== 'completed') || now < st.watchUntil) again = true;
      }
    } catch { /* never throws out of here */ }
    finally { this.busy = false; }
    if (changed) this.onChange();
    if (again) this.schedule(FAST_MS);
  }

  /** One gh at a time, whoever asks (backfill and the poll alike). */
  private queue: Promise<unknown> = Promise.resolve();
  private gh(args: string[]): Promise<string | null> {
    const p = this.queue.then(() => (this.closed ? null : this.run('gh', args)), () => null);
    this.queue = p;
    return p;
  }

  close(): void { this.closed = true; if (this.timer) clearTimeout(this.timer); this.timer = null; }
}

const RUN_FIELDS = 'databaseId,workflowName,displayTitle,event,headBranch,status,conclusion,url,createdAt,startedAt,updatedAt';
