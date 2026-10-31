// M4b (his picks, 2026-10-13): Claude Code jobs on the Mac while the Shadow PC is off, run and continued from Discord.
//
//   - Each job has its own post in claude-jobs. A job Aang starts runs in the background, in its own folder under
//     ~/Aang Jobs; a session he runs himself on the Mac gets a post the first time it needs him or finishes (its hooks
//     reach the front desk when the PC does not answer).
//   - He replies in that post: the same Claude session is continued in the background (his pick over typing into the
//     Claude window) and Claude's answer is posted back. It is all there when he opens the session later.
//   - Claude Code's own settings apply (his allow-list). Anything it would have to ASK about is not asked from the
//     phone yet (that is the PIN step, 9.A1): it is refused, and the post says it waits for him at a computer.
import { mkdirSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { query } from '@anthropic-ai/claude-agent-sdk';
import { writeFileAtomic } from './atomic.ts';
import { MODELS } from './route.ts';
import type { Gateway } from './discord.ts';
import { readJson } from './store.ts';

// updatedAt and last (2026-10-30): the brain's sessions engine reads this file (sessionlist.ts DeskJobs) for its one list.
interface Job { session: string; cwd: string; thread: string; title: string; at: number; card?: string; state?: 'working' | 'waiting' | 'done'; updatedAt?: number; last?: string }
type Gw = Pick<Gateway, 'send' | 'edit' | 'createPost' | 'setPostTags'>;
type Draw = (kind: string, data: unknown) => Promise<Buffer | null>;

export const slugOf = (task: string) => task.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'job';

export class MacJobs {
  private jobs: Job[] = [];
  private readonly file: string;
  private running = 0;
  private readonly o: { gw: Gw; dir: string; forum: () => string | undefined; log: (s: string) => void; run?: typeof query; meter?: (m: unknown) => void; draw?: Draw };
  constructor(o: { gw: Gw; dir: string; forum: () => string | undefined; log: (s: string) => void; run?: typeof query; meter?: (m: unknown) => void; draw?: Draw }) {
    this.o = o;
    this.file = path.join(o.dir, 'jobs.json');
    this.jobs = readJson(this.file, this.jobs, (a) => (Array.isArray(a) ? a : null));
  }
  private save() { this.jobs = this.jobs.slice(-60); try { writeFileAtomic(this.file, JSON.stringify(this.jobs)); } catch { /* next time */ } }
  /** The job a Discord thread belongs to, if it is one of these. */
  byThread(thread: string): Job | undefined { return this.jobs.find(j => j.thread === thread); }
  private bySession(s: string): Job | undefined { return this.jobs.find(j => j.session === s); }

  /** Its post, made the first time it is needed. */
  private async postFor(session: string, cwd: string, title: string, first: string, tag: string): Promise<Job | null> {
    const have = this.bySession(session);
    if (have) { await this.say(have, first, tag); return have; }
    const forum = this.o.forum();
    if (!forum) return null;
    const thread = await this.o.gw.createPost(forum, title.slice(0, 90) || 'Claude job', first.slice(0, 1900), [tag]);
    const job = { session, cwd, thread, title, at: Date.now() };
    this.jobs.push(job); this.save();
    return job;
  }
  /**
   * Sheet 21 board 3 (his pick): ONE card per job that changes in place, Working, Needs you, Done, the same card the
   * PC draws (the Mac's Samara draws it). Without a picture, the words alone, still edited in place.
   */
  private async show(job: Job, state: 'working' | 'waiting' | 'done', sub: string): Promise<void> {
    job.state = state;
    const first = sub.replace(/\s+/g, ' ').trim().slice(0, 160);
    job.updatedAt = Date.now(); job.last = first;
    const words = state === 'done' ? `Done: ${first}` : state === 'waiting' ? `Needs you: ${first}` : first || 'Working on it.';
    const png = await this.o.draw?.('job', { plaque: state === 'waiting' ? 'NEEDS YOU' : 'CLAUDE JOB', headline: state === 'done' ? `${job.title}. Done.` : job.title, sub: first, done: state === 'done' }).catch(() => null) ?? null;
    const color = state === 'done' ? 0x78E696 : state === 'waiting' ? 0xFF8040 : 0x966EC8;
    const msg = (png ? { content: words, silent: true, embed: { color, image: 'attachment://card.png' }, files: [{ name: 'card.png', data: png }] } : { content: words, silent: true }) as never;
    let edited = false;
    if (job.card) { try { await this.o.gw.edit(job.thread, job.card, msg); edited = true; } catch { /* the card was deleted: post it again */ } }
    if (!edited) { try { job.card = await this.o.gw.send(job.thread, msg); } catch { /* the post is gone */ } }
    await this.o.gw.setPostTags(job.thread, [state === 'done' ? 'Done' : state === 'waiting' ? 'Needs you' : 'Working']).catch(() => {});
    this.save();
  }
  private async say(job: Job, text: string, tag?: string, loud = false): Promise<void> {
    await this.o.gw.send(job.thread, { content: text.slice(0, 1900), ...(loud ? { loud: true } : { silent: true }) } as never);
    if (tag) await this.o.gw.setPostTags(job.thread, [tag]).catch(() => {});
  }

  /** A session's hook (he runs Claude himself on the Mac): needs you, or done. */
  async hook(event: string, body: { session_id?: string; cwd?: string; message?: string; lastSaid?: string }): Promise<void> {
    const session = String(body?.session_id ?? ''), cwd = String(body?.cwd ?? '');
    if (!session) return;
    const where = path.basename(cwd) || 'a session';
    if (event === 'Notification') {
      const asked = String(body.message ?? '').slice(0, 300);
      const fresh = !this.bySession(session);
      const j = await this.postFor(session, cwd, `On the Mac: ${where}`, `Claude needs you: ${asked}\nReply here to answer it.`, 'Needs you');
      if (!j) return;
      await this.show(j, 'waiting', asked);
      if (!fresh) await this.say(j, `Claude needs you: ${asked}`, undefined, true);
    } else if (event === 'Stop') {
      const said = String(body.lastSaid ?? '');
      const j = await this.postFor(session, cwd, `On the Mac: ${where}`, `Done.${said ? '\n' + said : ''}\nReply here to keep it going.`, 'Done');
      if (j) await this.show(j, 'done', said || 'Finished.');
    }
  }

  /** A new job, in the background, in its own folder. */
  async start(task: string): Promise<string> {
    if (this.running >= 2) return 'Two Claude jobs are already running on the Mac; this one can start when one finishes.';
    const cwd = path.join(os.homedir(), 'Aang Jobs', `${new Date().toISOString().slice(0, 10)}-${slugOf(task)}`);
    mkdirSync(cwd, { recursive: true });
    void this.run(task, cwd, null, task.slice(0, 80));
    return 'Started it on the Mac. Its post in claude-jobs shows how it goes; reply there to steer it.';
  }

  /** His reply in a job's post: the same session, continued. */
  async continue(thread: string, text: string): Promise<boolean> {
    const job = this.byThread(thread);
    if (!job) return false;
    if (this.running >= 2) { await this.say(job, 'Two jobs are busy on the Mac; say it again in a moment.'); return true; }
    await this.say(job, 'Telling Claude...');
    void this.run(text, job.cwd, job.session, job.title);
    return true;
  }

  private async run(prompt: string, cwd: string, resume: string | null, title: string): Promise<void> {
    this.running++;
    let job: Job | undefined = resume ? this.bySession(resume) : undefined;
    let out = '', why = '';
    try {
      const q = (this.o.run ?? query)({
        prompt: prompt.slice(0, 8000),
        options: {
          cwd, model: MODELS.smart.model, maxTurns: 60,
          ...(resume ? { resume } : {}),
          // His own Claude Code settings: what he lets it do without asking.
          settingSources: ['user', 'project'],
          permissionMode: 'default',
          canUseTool: async (tool: string) => {
            if (job) void this.say(job, `Claude wanted to use ${tool}, which needs your OK. That waits for you at a computer.`, 'Needs you', true);
            return { behavior: 'deny' as const, message: 'He is away from his computers; this needs his OK at one. Say what you would do and stop there.' };
          },
          env: { ...process.env, ENABLE_CLAUDEAI_MCP_SERVERS: 'false' },
        },
      });
      for await (const m of q as AsyncIterable<any>) {
        this.o.meter?.(m);
        if (m.type === 'system' && m.session_id && !job) {
          job = await this.postFor(String(m.session_id), cwd, title, `Working on: ${title}`, 'Working') ?? undefined;
          if (job) await this.show(job, 'working', resume ? 'Picking it up again.' : 'Working on it.');
        }
        if (m.type === 'result') { if (m.subtype === 'success') out = String(m.result ?? ''); else why = String(m.errors?.join?.('; ') || m.subtype); }
      }
    } catch (e) { why = (e as Error).message; }
    finally { this.running--; }
    if (!job) { this.o.log('mac jobs: a job ended before it had a post: ' + (why || 'no answer')); return; }
    if (out) { await this.show(job, 'done', out); await this.say(job, out); }
    else { await this.show(job, 'waiting', `It stopped: ${why || 'no answer came back'}.`); await this.say(job, `It stopped: ${why || 'no answer came back'}.`, undefined, true); }
  }
}
