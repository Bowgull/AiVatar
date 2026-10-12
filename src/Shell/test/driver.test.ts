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
