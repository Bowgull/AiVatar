// 2026-10-28 notice review (R2, R8): held lines carry their time and tier; a full hold drops the least important.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { earlier, fresh, keep, tierOf, type Held } from '../src/heldnotes.ts';
import { FrontGate } from '../src/claudefront.ts';

test('a reminder or a session waiting on him is tier 1, the brief or something he asked for 2, the rest 3', () => {
  assert.equal(tierOf({ reminder: 'r1' }), 1);
  assert.equal(tierOf({ blocking: true }), 1);
  assert.equal(tierOf({ brief: {} }), 2);
  assert.equal(tierOf({ asked: true }), 2);
  assert.equal(tierOf({}), 3);
});

test('a full hold lets the least important go first, never the brief for a video post', () => {
  const list: (Held & { n: string })[] = [];
  keep(list, { n: 'brief', at: 1, tier: 2 }, 3);
  keep(list, { n: 'video 1', at: 2, tier: 3 }, 3);
  keep(list, { n: 'video 2', at: 3, tier: 3 }, 3);
  assert.equal(keep(list, { n: 'reminder', at: 4, tier: 1 }, 3), 1);
  assert.deepEqual(list.map((x) => x.n), ['brief', 'video 2', 'reminder']);
});

test('past its age a held line is not news; a reminder never goes stale but says when it was due', () => {
  const now = 10 * 3_600_000;
  assert.equal(fresh({ at: now - 30 * 60_000, tier: 3 }, now), true);
  assert.equal(fresh({ at: now - 61 * 60_000, tier: 3 }, now), false);
  assert.equal(fresh({ at: now - 90 * 60_000, tier: 2 }, now), true);
  assert.equal(fresh({ at: now - 90 * 60_000, tier: 2 }, now, true), false, 'the brief only lasts an hour');
  assert.equal(fresh({ at: 0, tier: 1 }, now), true);
  assert.match(earlier(now - 3_600_000, now), /^Earlier, at \d{1,2}:\d{2} [ap]m: $/);
  assert.equal(earlier(now - 60_000, now), '');
});

test('leaving Claude drops a held line that went stale while he was in there', () => {
  let t = 0, inClaude = true;
  const gate = new FrontGate(() => inClaude, () => t);
  gate.moved();                                   // the presence report that put him in Claude
  assert.equal(gate.pass({ t: 'bubble', text: 'X just posted', stream: false, proactive: true }), null);
  t = 2 * 3_600_000;
  assert.equal(gate.pass({ t: 'bubble', text: 'Reminder: call', stream: false, proactive: true, reminder: 'r1' } as never), null);
  inClaude = false;
  assert.deepEqual(gate.moved().lines.map((m) => (m as { text: string }).text), ['Reminder: call']);
});

test('three held at once come out as one bubble, a row each, the whole message behind each row (sheet 102)', async () => {
  const { bundleOf } = await import('../src/heldnotes.ts');
  const msgs = [
    { t: 'bubble', text: 'Reminder: call the dentist', stream: false, proactive: true, reminder: 'r1' },
    { t: 'bubble', text: 'Waymark needs your OK. Delete 3 old build folders?', stream: false, proactive: true, kind: 'claude', blocking: true, project: 'Waymark' },
    { t: 'bubble', text: 'A creator you follow just posted: a new video', stream: false, proactive: true, about: { url: 'https://youtu.be/x', title: 'x' } },
  ] as never[];
  const b = bundleOf(msgs, 'While you were busy:') as unknown as { text: string; list: { items: { title: string; subtitle?: string; chipText: string }[]; held: unknown[] } };
  assert.equal(b.text, 'While you were busy:');
  assert.deepEqual(b.list.items.map((i) => i.chipText), ['REMINDER', 'CLAUDE', 'VIDEO']);
  assert.equal(b.list.items[1]!.title, 'Waymark needs your OK');
  assert.equal(b.list.items[1]!.subtitle, 'Delete 3 old build folders?');
  assert.equal(b.list.held.length, 3);
});

test('back from away: one line with what went to the phone, rows open Look back; nothing went, nothing said', async () => {
  const { welcomeBack, awayItemOf } = await import('../src/heldnotes.ts');
  assert.equal(welcomeBack([]), null);
  const b = welcomeBack([awayItemOf('Your Waymark job finished. Every test passed.', { kind: 'claude' }, 1), awayItemOf('Reminder: laundry', { reminder: 'r2' }, 2)]) as unknown as { text: string; list: { items: { look?: boolean; chipText: string }[] } };
  assert.equal(b.text, 'Welcome back. 2 things went to your phone while you were away:');
  assert.deepEqual(b.list.items.map((i) => [i.chipText, i.look]), [['CLAUDE', true], ['REMINDER', true]]);
});
