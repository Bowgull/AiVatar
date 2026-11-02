// The loop catcher (his pick from the WebBrain study, 2026-11-02): a driving session that does the same step again and
// again, getting the same page back each time, is stuck. Two shapes: one step three times in a row (A A A), or two steps
// taking turns (A B A B, a menu opened and closed). A step only counts as the same when the page answered the same, so
// "Next page" pressed five times over five different pages is never a loop. First time: a warning rides on the answer.
// Second time in the same job: the step is refused, and that exact step stays refused for the rest of the job, so the
// session has to try something else or tell him what is stuck. Pure: no Electron, testable on its own.
import { createHash } from 'node:crypto';

/** The steps that act or look. Status checks, his asks and scrolling (the same each time, on purpose) never count. */
const WATCHED = new Set(['open', 'read', 'find', 'form', 'extract', 'hover', 'drag', 'select', 'key', 'click', 'type', 'back', 'forward', 'picture', 'upload']);
/** Parts of an answer that differ every time without the page changing. */
const NOISE = new Set(['waited', 'news', 'handback']);
const KEEP = 6;

export const LOOP_WARN = 'LOOP: this is the same step, with the same result, as the last ones. It is not working. Do something different: read the page again, pick another control, or tell Joshua what is stuck. Samara refuses this step if it loops again.';
export const LOOP_STOP = 'Samara stopped this step: it looped again after the warning. It stays refused for this job. Try a different way, or stop and tell Joshua in one line what is stuck.';

type Seen = { step: string; answer: string };
interface JobLoops { seen: Seen[]; strikes: number; refused: Set<string> }

const hash = (s: string) => createHash('sha1').update(s).digest('hex').slice(0, 16);
/** The step itself: its kind and every argument but his yes. */
export function stepKey(op: string, a: Record<string, unknown>): string {
  const { allowed: _a, ...rest } = a ?? {};
  return op + ':' + JSON.stringify(rest, Object.keys(rest).sort());
}
/** What the page answered, minus the parts that change on their own. */
export function answerKey(out: Record<string, unknown>): string {
  return hash(JSON.stringify(out, (k, v) => (NOISE.has(k) ? undefined : v)));
}

export class LoopCatch {
  private jobs = new Map<number, JobLoops>();
  private of(job: number): JobLoops {
    let j = this.jobs.get(job);
    if (!j) { j = { seen: [], strikes: 0, refused: new Set() }; this.jobs.set(job, j); }
    return j;
  }
  /** Before the step runs: an error when this exact step was stopped earlier in the job. */
  before(job: number | undefined, op: string, a: Record<string, unknown>): string | null {
    if (job === undefined || !WATCHED.has(op)) return null;
    return this.jobs.get(job)?.refused.has(stepKey(op, a)) ? LOOP_STOP : null;
  }
  /** After the step: 'warn', 'stop' or null. A step waiting for his yes has not happened yet, so it is left out. */
  after(job: number | undefined, op: string, a: Record<string, unknown>, out: Record<string, unknown>): 'warn' | 'stop' | null {
    if (job === undefined || !WATCHED.has(op) || out.needs) return null;
    const j = this.of(job);
    const step = stepKey(op, a);
    j.seen.push({ step, answer: answerKey(out) });
    if (j.seen.length > KEEP) j.seen.shift();
    if (!looping(j.seen)) return null;
    j.seen = [];
    j.strikes++;
    if (j.strikes === 1) return 'warn';
    j.refused.add(step);
    return 'stop';
  }
  /** The job is over: forget it. */
  end(job: number): void { this.jobs.delete(job); }
}

const same = (x: Seen, y: Seen) => x.step === y.step && x.answer === y.answer;
function looping(s: Seen[]): boolean {
  const n = s.length;
  if (n >= 3 && same(s[n - 1], s[n - 2]) && same(s[n - 2], s[n - 3])) return true;
  return n >= 4 && same(s[n - 1], s[n - 3]) && same(s[n - 2], s[n - 4]) && !same(s[n - 1], s[n - 2]);
}
