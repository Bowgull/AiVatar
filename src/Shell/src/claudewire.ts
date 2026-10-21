// C4, Claude in the cockpit (2026-10-21): the checks on what the bubble page may tell the brain about Claude sessions.
//
// An answer here can approve a tool running on his PC, so the page is treated as the least trusted side: every field is
// rebuilt from scratch with its type, length and allowed values checked, and anything else is dropped whole. The brain
// checks again (claudelink.ts answer()), this is the first of the two locks. The wire format is in src/Core/src/protocol.ts.

/** A session id or a waiting item's id: Claude's UUIDs and tool-use ids, nothing that could be a path or a command. */
const ID = /^[A-Za-z0-9._:-]{1,100}$/;
/** The same model names the brain accepts (claudelink.ts MODEL_OK). */
const MODEL = /^[A-Za-z0-9.\-_[\]]{1,60}$/;
const DECISIONS = ['allow', 'always', 'deny', 'deny-message'] as const;

const text = (v: unknown, max: number): string | null => (typeof v === 'string' && v.trim() && v.length <= max ? v : null);

/** What the page sent, as the exact message the brain gets, or null when anything about it is wrong. */
export function claudeMessage(raw: unknown): Record<string, unknown> | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const m = raw as Record<string, unknown>;
  switch (m.t) {
    case 'claude.answer': {
      if (typeof m.id !== 'string' || !ID.test(m.id)) return null;
      if (m.answers !== undefined) {
        // A question's answers: question text -> the label(s) he picked or his own words. At most 4 questions (the brain's cap).
        if (m.decision !== undefined || !m.answers || typeof m.answers !== 'object' || Array.isArray(m.answers)) return null;
        const entries = Object.entries(m.answers as Record<string, unknown>);
        if (!entries.length || entries.length > 4) return null;
        const answers: Record<string, string> = {};
        for (const [q, v] of entries) { const a = text(v, 2000); if (!text(q, 500) || a === null) return null; answers[q] = a; }
        return { t: 'claude.answer', id: m.id, answers };
      }
      if (!DECISIONS.includes(m.decision as typeof DECISIONS[number])) return null;
      if (m.decision === 'deny-message') { const msg = text(m.message, 2000); return msg === null ? null : { t: 'claude.answer', id: m.id, decision: m.decision, message: msg }; }
      if (m.message !== undefined) return null;
      return { t: 'claude.answer', id: m.id, decision: m.decision };
    }
    case 'claude.send': {
      const t = text(m.text, 4000);
      if (typeof m.session !== 'string' || !ID.test(m.session) || t === null || (m.when !== 'now' && m.when !== 'after')) return null;
      return { t: 'claude.send', session: m.session, text: t, when: m.when };
    }
    case 'claude.pause':
      return typeof m.session === 'string' && ID.test(m.session) ? { t: 'claude.pause', session: m.session } : null;
    case 'claude.play': {
      if (typeof m.session !== 'string' || !ID.test(m.session)) return null;
      if (m.text === undefined) return { t: 'claude.play', session: m.session };
      const t = text(m.text, 4000);
      return t === null ? null : { t: 'claude.play', session: m.session, text: t };
    }
    case 'claude.model':
      return typeof m.session === 'string' && ID.test(m.session) && typeof m.model === 'string' && MODEL.test(m.model)
        ? { t: 'claude.model', session: m.session, model: m.model } : null;
    default:
      return null;
  }
}

/** A session's deep link, exactly claude://claude.ai/epitaxy/<id> (the app's ids are local_<uuid>, 2026-10-21), or null. Anything else is never handed to the shell. */
export function claudeLink(raw: unknown): string | null {
  return typeof raw === 'string' && /^claude:\/\/claude\.ai\/epitaxy\/(local_)?[A-Za-z0-9-]{8,100}$/.test(raw) ? raw : null;
}
