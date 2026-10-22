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
 * @typedef {{ label: string, key: 'A'|'S'|'D'|'X'|'Z', choice: string, tone?: 'primary'|'warn'|'burnt', hold?: boolean }} AskKey
 * @typedef {{ plaque?: string, question: string, means?: string, exact?: string, mail?: { to: string, subject: string, body: string, fresh: string, cc?: string, files?: string }, keys: AskKey[] }} Ask
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
      mail: { to: String(d.to ?? ''), subject: String(d.subject ?? ''), body: String(d.body ?? ''), fresh: String(d.fresh ?? ''), cc: String(d.cc ?? ''), files: String(d.files ?? '') },
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
      // Sheet 64 (2026-10-22): "Allow" and "Not this time", the same words as a Claude OK.
      keys.push({ label: 'Allow', key: 'A', choice: 'yes', tone: 'primary' });
      keys.push({ label: 'Not this time', key: 'Z', choice: 'no' });
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

  // Sheet 62 (his pick, 2026-10-22): something he sent to Aang (words, a picture, a link, a page, a snip) is on his
  // typing box as a chip; Aang asks one line. Ask about it puts his cursor in the box, Keep as a note makes a plain note
  // with the link, and a snip gets a third key, Pin it. The Shell decides what each key does (sendtoaang.ts).
  if (m.t === 'send.ask') {
    const snip = m.snip === true;
    /** @type {AskKey[]} */
    const keys = [
      { label: 'Ask about it', key: 'A', choice: 'ask', tone: 'primary' },
      { label: 'Keep as a note', key: 'S', choice: 'note' },
    ];
    if (snip) keys.push({ label: 'Pin it', key: 'D', choice: 'pin' });
    return {
      plaque: snip ? 'YOUR SNIP' : m.fromSamara === true ? 'SENT FROM SAMARA' : 'SENT TO AANG',
      question: snip ? 'Got your snip. Ask about it, keep it, or pin it?' : 'Got it. Ask about it, or keep it as a note?',
      keys,
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

  // Sheet 17: a timer ran out. Got it, or five more minutes with the same name.
  if (m.t === 'timer.done') {
    const s = Math.round(Number(m.total) / 1000) || 0, h = Math.floor(s / 3600), mi = Math.floor(s / 60) % 60, sec = s % 60;
    /** @param {number} n @param {string} w */
    const part = (n, w) => n ? `${n} ${w}${n === 1 ? '' : 's'}` : '';
    const dur = [part(h, 'hour'), part(mi, 'minute'), h ? '' : part(sec, 'second')].filter(Boolean).join(' ') || 'time';
    const label = typeof m.label === 'string' ? m.label.trim() : '';
    return {
      plaque: 'TIME\u2019S UP',
      question: label ? `${label}. Your ${dur} ${s === 1 ? 'is' : 'are'} up.` : `Your ${dur} ${s === 1 ? 'is' : 'are'} up.`,
      keys: [
        { label: 'Got it', key: 'A', choice: 'ok', tone: 'primary' },
        { label: '5 more', key: 'Z', choice: 'more' },
      ],
    };
  }

  // Sheet 16: pick one of a few, with the FFX glove. The list itself is drawn by the bubble (choiceList);
  // there are no keys under it, "Something else" is the last row.
  if (m.t === 'choice' && Array.isArray(m.options) && m.options.length) {
    return { question: String(m.question ?? 'Which one?'), keys: [] };
  }

  // Sheet 37: a Claude session's plan (Samara's door). Go, Change (a line to type), Not now in burnt orange.
  if (m.t === 'plan' && m.samara && typeof m.samara === 'object') {
    return {
      plaque: '',
      question: '',
      keys: [
        { label: 'Go', key: 'A', choice: 'go', tone: 'primary' },
        { label: 'Change', key: 'S', choice: 'change' },
        { label: 'Not now', key: 'Z', choice: 'no', tone: 'burnt' },
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
