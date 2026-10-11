// Step 6.12: turning the brain's four kinds of ask into what sheet 5 draws.
//
// The four, with their real fields (protocol.ts):
//   permission   question, means, remembers, hold
//   consent      wanted
//   fact.ask     text, fromDoc, left
//   backup.ask   days, changed
//
// This file decides only the SHAPE of the ask: the question, the explaining line, and the keys with
// their letters. It does not decide how serious anything is - the Core does that and says so with
// `hold` - and it does not touch the screen. Both so it can be tested, and so the window drawing a
// question is never the thing judging it.
//
// The letters are A, X and Z, as they are today: A is the thing he usually wants, Z declines, X is the
// third way out. Those three keys are what his hands already know.

/**
 * @typedef {{ label: string, key: 'A'|'X'|'Z', choice: string, tone?: 'primary'|'warn', hold?: boolean }} AskKey
 * @typedef {{ plaque?: string, question: string, means?: string, exact?: string, mail?: { to: string, subject: string, body: string, fresh: string }, keys: AskKey[] }} Ask
 */

/**
 * @param {Record<string, any>} m a message from the brain
 * @returns {Ask | null} null when this message is not an ask
 */
export function askFrom(m) {
  if (!m || typeof m !== 'object') return null;

  // 6.14, sheet 13: an email waiting to be sent shows the letter itself. Hold to send, Change it, Not now.
  // Still the same permission underneath: the hold is the lever, and nothing is sent without it.
  if (m.t === 'permission' && m.draft && typeof m.draft === 'object') {
    const d = m.draft;
    return {
      plaque: d.fresh ? 'EMAIL TO SOMEONE NEW' : 'EMAIL DRAFT',
      question: String(d.subject || '(no subject)'),
      mail: { to: String(d.to ?? ''), subject: String(d.subject ?? ''), body: String(d.body ?? ''), fresh: String(d.fresh ?? '') },
      keys: [
        { label: 'Hold to send', key: 'A', choice: 'yes', hold: true },
        { label: 'Change it', key: 'X', choice: 'change' },
        { label: 'Not now', key: 'Z', choice: 'no', tone: 'warn' },
      ],
    };
  }

  if (m.t === 'permission') {
    /** @type {AskKey[]} */
    const keys = [];
    if (m.hold) {
      // Sheet 5: the lever, plus "Show me first" and "No". There is deliberately no "Always" here -
      // a thing that cannot be undone must never become a standing yes.
      keys.push({ label: holdLabel(m.question), key: 'A', choice: 'yes', hold: true });
      keys.push({ label: 'Show me first', key: 'X', choice: 'show' });
      keys.push({ label: 'No', key: 'Z', choice: 'no', tone: 'warn' });
    } else {
      keys.push({ label: verbOf(m.question), key: 'A', choice: 'yes', tone: 'primary' });
      keys.push({ label: 'Not now', key: 'Z', choice: 'no' });
      // Only when the Core says this kind of thing CAN be remembered. Its own row, never the default.
      if (m.remembers) keys.push({ label: 'Always ' + m.remembers, key: 'X', choice: 'always' });
    }
    // Approvals in plain words, never code (sheet 13). A command's exact text comes off the question and
    // the explaining line and sits one tap away instead; the old bubble and Discord still show it inline.
    const exact = typeof m.exact === 'string' && m.exact ? m.exact : undefined;
    let question = String(m.question ?? 'Can I do that?');
    let means = m.means ? String(m.means) : undefined;
    if (exact) {
      if (/^run this:/i.test(question)) question = 'run a command I do not recognise';
      if (means) means = means.replace(/\s*Exactly this:[\s\S]*$/, '').trim() || undefined;
    }
    return {
      plaque: m.hold ? 'THIS CANNOT BE UNDONE' : 'ASKING FIRST',
      question,
      means,
      exact,
      keys,
    };
  }

  if (m.t === 'fact.ask') {
    // Not a permission, deliberately: this asks whether a CLAIM is true. There is no "always", because
    // the answer is about this one fact and nothing else.
    const left = Number(m.left) || 0;
    return {
      plaque: left > 0 ? `ONE OF ${left + 1}` : undefined,
      question: 'Is this true?',
      means: [String(m.text ?? ''), m.fromDoc ? `From ${m.fromDoc}` : ''].filter(Boolean).join(' — '),
      keys: [
        { label: 'Yes, remember', key: 'A', choice: 'yes', tone: 'primary' },
        { label: 'Not true', key: 'X', choice: 'no' },
        { label: 'Skip', key: 'Z', choice: 'skip' },
      ],
    };
  }

  if (m.t === 'backup.ask') {
    const days = Number(m.days) || 0, changed = Number(m.changed) || 0;
    return {
      plaque: 'NOT BACKED UP',
      question: 'Back up your memory now?',
      means: `${changed} ${changed === 1 ? 'change' : 'changes'}, and the last clean backup was ${days} ${days === 1 ? 'day' : 'days'} ago.`,
      keys: [
        { label: 'Back it up', key: 'A', choice: 'yes', tone: 'primary' },
        { label: 'Not now', key: 'Z', choice: 'no' },
      ],
    };
  }

  // 6.13, sheet 13 "The plan, before he acts": the steps, each marked, then Go.
  if (m.t === 'plan' && Array.isArray(m.steps)) {
    return {
      plaque: 'THE PLAN',
      question: 'Here is what I will do.',
      keys: [
        { label: 'Go', key: 'A', choice: 'go', tone: 'primary' },
        { label: 'Not now', key: 'Z', choice: 'no' },
      ],
    };
  }

  // 6.14b, sheet 13 "Something broke": the brain is down. In his voice, never a blank box or a spinner.
  // These two never reach the brain (it is the thing that is down): the bubble answers them itself.
  if (m.t === 'brain.wait') {
    return { plaque: 'ONE MOMENT', question: 'My brain stopped. I am restarting it.',
      means: 'Nothing you said is lost. I will pick up where we were.', keys: [] };
  }
  if (m.t === 'brain.down') {
    // Sheet 5 says "after three tries"; the Shell cannot count the pet's restarts, so it says what it knows.
    return { plaque: 'STILL DOWN', question: 'I still cannot restart after a minute of trying.',
      means: 'Something is stopping me starting. Your messages are saved.',
      keys: [
        { label: 'Try again', key: 'A', choice: 'retry', tone: 'primary' },
        { label: 'Show what went wrong', key: 'X', choice: 'log' },
      ] };
  }

  // A reminder coming due (6.12, sheet 13): a short ask rather than a reply that times out unread.
  if (m.t === 'bubble' && typeof m.reminder === 'string' && m.reminder) {
    return {
      plaque: 'REMINDER',
      question: String(m.text ?? '').replace(/^Reminder:\s*/i, ''),
      keys: [
        { label: 'Got it', key: 'A', choice: 'ok', tone: 'primary' },
        { label: 'Snooze 5 min', key: 'Z', choice: 'snooze' },
      ],
    };
  }

  if (m.t === 'consent') {
    const wanted = String(m.wanted ?? '');
    return {
      plaque: 'COSTS MORE',
      question: `Use ${wanted} for this one?`,
      means: 'It is slower and uses more of your weekly allowance.',
      keys: [
        { label: 'Yes, use ' + wanted, key: 'A', choice: 'yes', tone: 'primary' },
        { label: 'No, stay as you are', key: 'Z', choice: 'no' },
      ],
    };
  }

  return null;
}

/**
 * The verb for the "yes" key, taken from the question itself.
 *
 * "Can I open Chrome?" gives "Open Chrome", which is what sheet 5 shows. Falling back to plain "Yes"
 * is deliberate: a wrong verb on the button he presses most is worse than a dull one.
 * @param {string} question
 */
export function verbOf(question) {
  const m = /^can i\s+(.{1,40}?)\s*\?*$/i.exec(String(question ?? '').trim());
  if (!m) return 'Yes';
  const v = m[1].trim();
  return v ? v.charAt(0).toUpperCase() + v.slice(1) : 'Yes';
}

/** The lever's own words: "Hold to send", "Hold to delete". @param {string} question */
export function holdLabel(question) {
  const v = verbOf(question);
  const first = v.split(' ')[0]?.toLowerCase();
  return first && first !== 'yes' ? `Hold to ${first}` : 'Hold to confirm';
}

/** How long the lever must be held, in milliseconds. Long enough that a reflex click cannot do it. */
export const HOLD_MS = 800;
