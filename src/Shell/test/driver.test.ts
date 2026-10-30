import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cleanName, weigh } from '../src/driverrules.ts';

test('6.25a decision 42: links, search and typing are free; sending asks; money and passwords never', () => {
  assert.equal(weigh({ kind: 'link', label: 'Crossroads to Thunder Bluff route' }), 'free');
  assert.equal(weigh({ kind: 'search', label: '' }), 'free');
  assert.equal(weigh({ kind: 'text', label: '' }), 'free');
  assert.equal(weigh({ kind: 'submit', label: 'Search', formSearch: true }), 'free');
  for (const label of ['Post comment', 'Send', 'Apply now', 'Sign in', 'Delete', 'Submit']) assert.equal(weigh({ kind: 'button', label }), 'lever', label);
  assert.equal(weigh({ kind: 'submit', label: 'Go' }), 'lever');
  for (const label of ['Buy now', 'Checkout', 'Add to cart', 'Place order', 'Pay']) assert.equal(weigh({ kind: 'button', label }), 'never', label);
  assert.equal(weigh({ kind: 'password', label: '' }), 'never');
  assert.equal(weigh({ kind: 'payment', label: '' }), 'never');
  assert.equal(weigh({ kind: 'link', label: 'Unsubscribe' }), 'lever');
});

test('a job is named for its trail in capitals, short', () => {
  assert.equal(cleanName('thunder bluff map'), 'THUNDER BLUFF MAP');
  assert.equal(cleanName(''), 'AANG');
  assert.ok(cleanName('a'.repeat(80)).length <= 24);
});

// ---- driver v2 (2026-10-14): security checks stop the job, a person's pace, only what changed, what an action did.
import { challengeOf, challengeStops, diffRead, paceFor, whatChanged } from '../src/driverrules.ts';

test('a security check or captcha is spotted, an ordinary page is not', () => {
  assert.ok(challengeOf({ url: 'https://www.linkedin.com/checkpoint/challenge/xyz' }));
  assert.ok(challengeOf({ title: 'Just a moment...' }));
  assert.ok(challengeOf({ text: "Let's do a quick security check" }));
  assert.ok(challengeOf({ text: 'We noticed unusual activity on your account' }));
  assert.equal(challengeOf({ title: 'Product Designer jobs in Toronto', text: 'Apply now. Security clearance required.' }), null);
  // A check on his job sites stops the whole session; anywhere else only that site (2026-10-30, Stack Overflow ended a read-only job).
  for (const h of ['linkedin.com', 'www.linkedin.com', 'ca.indeed.com', 'glassdoor.ca']) assert.equal(challengeStops(h), 'job', h);
  for (const h of ['stackoverflow.com', 'reddit.com', '127.0.0.1', '']) assert.equal(challengeStops(h), 'site', h);
});
test("a person's pace on the job sites only", () => {
  assert.deepEqual(paceFor('www.linkedin.com'), { least: 20, jitter: 40 });
  assert.ok(paceFor('ca.indeed.com'));
  assert.equal(paceFor('greenhouse.io'), null);
  assert.equal(paceFor('notlinkedin.com'), null);
});
test('only what changed since the last read', () => {
  const a = { lines: ['Jobs', 'Designer at Lumen'], items: [{ n: 1, kind: 'link', label: 'Lumen', href: 'x' }] };
  const b = { lines: ['Jobs', 'Designer at Lumen', 'UX Lead at Northwind'], items: [{ n: 1, kind: 'link', label: 'Lumen', href: 'x' }, { n: 2, kind: 'link', label: 'Northwind', href: 'y' }] };
  const d = diffRead(a, b);
  assert.deepEqual(d.lines, ['UX Lead at Northwind']);
  assert.deepEqual(d.items.map((i) => i.n), [2]);
  assert.equal(d.sameLines, 2);
});
test('an action that changed nothing says so; real changes are named', () => {
  const s = { url: 'u', title: 't', focus: null, dialogs: [], textLen: 100, lines: ['a'] };
  assert.deepEqual(whatChanged(s, { ...s }), []);
  assert.match(whatChanged(s, { ...s, dialogs: ['Apply to Lumen'] }).join(), /a box opened: "Apply to Lumen"/);
  assert.match(whatChanged({ ...s, el: { n: 4, state: 'unchecked' } }, { ...s, el: { n: 4, state: 'checked' } }).join(), /control 4 is now checked/);
  assert.match(whatChanged(s, { ...s, url: 'v' }).join(), /moved to v/);
});
