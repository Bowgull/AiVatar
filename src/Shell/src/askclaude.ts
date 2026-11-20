// Sheet 109 (2026-10-30, his decisions): "Claude in your tabs", Aang's side: the chats a pick can go to (from the brain's
// job rows) and the brain's answer to a pick. Samara's side, the pick itself and the hand-over, is claudehand.ts (split
// on 2026-11-20, phase 1 of Samara's own repo, docs/SAMARA-REPO-PLAN.md).

// ------------------------------------------------------------------ pointing: Ask Claude (Aang's side)

/** One Claude chat the menu offers: the brain's session id and his name for it. */
export interface Chat { id: string; name: string }

/** The job rows the brain sends (claudelink.ts Job), as much of them as the menu needs. */
export interface JobLike { id?: unknown; title?: unknown; project?: unknown; phase?: unknown; source?: unknown; lastActivity?: unknown }

/**
 * The chats a pick can go to, last used first: his last chat and up to three recent ones. Only sessions the aang-link mod
 * speaks for (a transcript-only session cannot take a message) that have not ended.
 */
export function chatsFrom(jobs: unknown, max = 4): Chat[] {
  if (!Array.isArray(jobs)) return [];
  return (jobs as JobLike[])
    .filter((j) => j && typeof j.id === 'string' && /^[\w-]{1,100}$/.test(j.id) && j.source !== 'transcript' && j.phase !== 'ended')
    .sort((a, b) => (Number(b.lastActivity) || 0) - (Number(a.lastActivity) || 0))
    .slice(0, max)
    .map((j) => ({ id: String(j.id), name: one(j.title, 40) || one(j.project, 40) || 'Claude' }));
}

const one = (s: unknown, n: number): string => {
  const t = String(s ?? '').replace(/\s+/g, ' ').trim();
  return t.length > n ? t.slice(0, n - 1) + '…' : t;
};

/**
 * A pick sent to the brain ({t:'claude.pick'}) and its answer ({t:'claude.picked'}): null when the chat took it, else
 * the plain reason. No answer in time is said as such, never as sent.
 */
export class PickReplies {
  private seq = 0;
  private wait = new Map<string, (why: string | null) => void>();
  ask(send: (m: Record<string, unknown>) => boolean, session: string, text: string, ms = 8000): Promise<string | null> {
    const id = `p${Date.now().toString(36)}${++this.seq}`;
    return new Promise((done) => {
      const t = setTimeout(() => { if (this.wait.delete(id)) done('Aang did not answer in time'); }, ms);
      this.wait.set(id, (why) => { clearTimeout(t); done(why); });
      if (!send({ t: 'claude.pick', id, session, text })) { this.wait.delete(id); clearTimeout(t); done('Aang is not running'); }
    });
  }
  /** The brain's answer. True when it was one of ours. */
  got(m: { t?: unknown; id?: unknown; ok?: unknown; why?: unknown }): boolean {
    if (m?.t !== 'claude.picked') return false;
    const f = this.wait.get(String(m.id ?? ''));
    if (!f) return true;
    this.wait.delete(String(m.id));
    f(m.ok === true ? null : String(m.why ?? 'Not sent').slice(0, 120));
    return true;
  }
}
