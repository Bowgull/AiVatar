// The needs-you door (2026-11-15, his ask "add a needs-you door to Aang"): any Claude session can leave him a short plain
// note in #needs-you, posted by Aang's own Discord bot, so the bot's token never leaves Aang. The mod's needs_you tool
// sends it over the signed Claude link (claudelink.ts /link/needsyou). Here: what is let through, and how often.
//   - Words only: one line, up to 400 characters. Discord's mentions are off for everything Aang sends.
//   - A stuck loop cannot fill his phone: 3 notes per session and 10 in all per hour.

export const NEEDS_MAX = 400;
export const PER_SESSION = 3;
export const PER_HOUR = 10;
const HOUR = 60 * 60_000;

export class NeedsLimit {
  private sent: { session: string; at: number }[] = [];
  /** Null when it may go (and it is counted), else why not. */
  take(session: string, now = Date.now()): string | null {
    this.sent = this.sent.filter(s => now - s.at < HOUR);
    if (this.sent.filter(s => s.session === session).length >= PER_SESSION) return `This session has sent ${PER_SESSION} notes this hour; that is the limit. Tell him in your reply instead.`;
    if (this.sent.length >= PER_HOUR) return `${PER_HOUR} notes have gone to his phone this hour; that is the limit. Tell him in your reply instead.`;
    this.sent.push({ session, at: now });
    return null;
  }
}

/** The note as it will be posted, or why not. Mentions and markdown that pings are made harmless. */
export function needsNote(text: unknown, cwd: string): { ok: true; content: string } | { ok: false; why: string } {
  const t = (typeof text === 'string' ? text : '').replace(/\s+/g, ' ').trim();
  if (!t) return { ok: false, why: 'The note was empty.' };
  if (t.length > NEEDS_MAX) return { ok: false, why: `Keep it to ${NEEDS_MAX} characters.` };
  const safe = t.replace(/@(everyone|here)/gi, '@​$1').replace(/<@[!&]?\d+>/g, '@someone');
  const where = (cwd.split(/[\\/]/).filter(Boolean).pop() ?? '').replace(/[^\w .-]/g, '').slice(0, 40);
  return { ok: true, content: where ? `${safe}\n-# from a Claude session in ${where}` : safe };
}
