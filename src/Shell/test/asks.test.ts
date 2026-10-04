// Step 6.12: the four asks, as sheet 5 draws them.
//
// Checked against the sheet's own wording, which was read out of sheet-5-bubble.html rather than
// remembered. The important ones are the rules that protect him: no "Always" on something that cannot
// be undone, and a lever only where the Core said so.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { HOLD_MS, askFrom, holdLabel, verbOf } from '../pages/asks.js';

test('a routine permission is the sheet\'s three keycaps, A / Z / X', () => {
  // Sheet 5: "Can I open Chrome?" with "Open Chrome A", "Not now Z", "Always open apps X".
  const a = askFrom({ t: 'permission', id: '1', tool: 'mcp__aang__open',
    question: 'Can I open Chrome?', remembers: 'open apps',
    means: 'It opens the Chrome browser, the same as double-clicking its icon.' });
  assert.equal(a?.plaque, 'ASKING FIRST');
  assert.equal(a?.question, 'Can I open Chrome?');
  assert.match(a!.means!, /double-clicking/);
  assert.deepEqual(a?.keys.map(k => `${k.label}${k.key}`),
    ['Open ChromeA', 'Not nowZ', 'Always open appsX']);
});

test('no "Always" when the Core did not say it could be remembered', () => {
  const a = askFrom({ t: 'permission', id: '1', tool: 'x', question: 'Can I read that?' });
  assert.equal(a?.keys.length, 2);
  assert.ok(!a?.keys.some(k => k.label.startsWith('Always')));
});

test('A THING THAT CANNOT BE UNDONE GETS A LEVER AND NEVER AN "ALWAYS"', () => {
  // The rule that matters most here. A standing yes to sending email is not a setting anyone should
  // be able to click into by accident, so it is not offered at all.
  const a = askFrom({ t: 'permission', id: '1', tool: 'mcp__aang__mail_send',
    question: 'Can I send the cover letter to Octup?', remembers: 'send email', hold: true });
  assert.equal(a?.plaque, 'THIS CANNOT BE UNDONE');
  assert.equal(a?.keys[0]?.hold, true, 'the first one is the lever');
  assert.match(a!.keys[0]!.label, /^Hold to /);
  assert.ok(!a?.keys.some(k => k.label.startsWith('Always')), 'even though `remembers` was sent');
  assert.deepEqual(a?.keys.slice(1).map(k => `${k.label}${k.key}`), ['Show me firstX', 'NoZ']);
});

test('the lever is only ever the Core\'s decision, never guessed from the question', () => {
  // The same alarming words, without the Core's flag, are still an ordinary ask. The window drawing a
  // question must not be the thing judging how serious it is.
  const a = askFrom({ t: 'permission', id: '1', tool: 'mcp__aang__open', question: 'Can I delete everything?' });
  assert.equal(a?.plaque, 'ASKING FIRST');
  assert.ok(!a?.keys.some(k => k.hold));
});

test('the yes key says the verb, and falls back to something dull rather than something wrong', () => {
  assert.equal(verbOf('Can I open Chrome?'), 'Open Chrome');
  assert.equal(verbOf('Can I run that command?'), 'Run that command');
  assert.equal(verbOf('Is this a good idea?'), 'Yes', 'an unexpected shape gets a plain Yes');
  assert.equal(verbOf(''), 'Yes');
  assert.equal(holdLabel('Can I send the cover letter?'), 'Hold to send');
  assert.equal(holdLabel('Something else entirely'), 'Hold to confirm');
});

test('a fact to remember is about one claim, so there is no "always"', () => {
  const a = askFrom({ t: 'fact.ask', id: 3, text: 'He uses Shadow as his PC', fromDoc: 'profile.md', left: 2 });
  assert.equal(a?.question, 'Is this true?');
  assert.match(a!.means!, /Shadow/);
  assert.match(a!.means!, /profile\.md/);
  assert.equal(a?.plaque, 'ONE OF 3', 'and it says how many are waiting');
  assert.deepEqual(a?.keys.map(k => `${k.label}${k.key}`), ['Yes, rememberA', 'Not trueX', 'SkipZ']);
});

test('the last fact does not claim there are more', () => {
  const a = askFrom({ t: 'fact.ask', id: 3, text: 'x', fromDoc: 'y', left: 0 });
  assert.equal(a?.plaque, undefined);
});

test('a backup ask says what it is about in his units', () => {
  const a = askFrom({ t: 'backup.ask', days: 1, changed: 1 });
  assert.match(a!.means!, /1 change,/);
  assert.match(a!.means!, /1 day ago/);
  const many = askFrom({ t: 'backup.ask', days: 3, changed: 12 });
  assert.match(many!.means!, /12 changes/);
  assert.match(many!.means!, /3 days ago/);
});

test('a consent ask names the mode and says what it costs', () => {
  const a = askFrom({ t: 'consent', id: '1', wanted: 'Deep' });
  assert.match(a!.question, /Deep/);
  assert.match(a!.means!, /weekly allowance/);
  assert.equal(a?.keys[0]?.label, 'Yes, use Deep');
});

test('anything that is not an ask is left alone', () => {
  for (const m of [null, undefined, {}, { t: 'bubble', text: 'hello' }, { t: 'moved' }]) {
    assert.equal(askFrom(m as never), null, JSON.stringify(m));
  }
});

test('the hold is long enough that a reflex click cannot do it', () => {
  // The research sheet 5 cites: identical prompts get clicked through, half in under two seconds.
  // A click is tens of milliseconds; this has to be far longer than that and still bearable.
  assert.ok(HOLD_MS >= 500 && HOLD_MS <= 1500, String(HOLD_MS));
});
