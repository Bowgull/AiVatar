// Sheet 41: Claude's plans in his scroll-back, shared by the PC (main.ts) and the Mac (macaang.ts). Every plan that
// starts becomes a row the brain keeps (shown.save); the brain says which row it is (shown.saved), and the row is marked
// done when the job finishes (shown.update). A job can finish before the brain has answered: it is marked then.
import type { PlanStarted } from './claudedoor.ts';

type Send = (m: Record<string, unknown>) => void;

export class PlanRows {
  /** A plan's row while its job runs: the row id once the brain has kept it, and whether the job already finished. */
  private rows = new Map<number, { id: number | null; extra: Record<string, unknown>; done: boolean }>();
  private readonly send: Send;
  constructor(send: Send) { this.send = send; }

  started(p: PlanStarted): void {
    const extra = { plan: { title: p.task, sites: p.sites.slice(0, 12), steps: p.steps.slice(0, 12), done: false }, remembered: p.remembered };
    this.rows.set(p.job, { id: null, extra, done: false });
    while (this.rows.size > 30) this.rows.delete(this.rows.keys().next().value as number);
    this.send({ t: 'shown.save', kind: 'plan', text: `Claude's plan: ${p.task}`.slice(0, 600), extra, ref: `plan-${p.job}` });
  }

  /** The brain's shown.saved for one of ours. */
  saved(ref: string, id: number): void {
    const job = Number(/^plan-(\d+)$/.exec(ref)?.[1]);
    const row = this.rows.get(job);
    if (!row || !Number.isInteger(id) || id <= 0) return;
    row.id = id;
    if (row.done) this.done(job);
  }

  done(job: number): void {
    const row = this.rows.get(job);
    if (!row) return;
    row.done = true;
    if (row.id === null) return;                 // marked when the brain says which row it is
    const extra = { ...row.extra, plan: { ...(row.extra.plan as Record<string, unknown>), done: true } };
    this.send({ t: 'shown.update', id: row.id, extra });
    this.rows.delete(job);
  }
}
