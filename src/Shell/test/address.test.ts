// 6.20: the address slot searches or goes to a site, and never runs anything.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addressFor } from '../src/address.ts';

test('a site goes to the site, words go to a search', () => {
  assert.equal(addressFor('wowhead.com/guide'), 'https://wowhead.com/guide');
  assert.equal(addressFor('https://www.wowhead.com/'), 'https://www.wowhead.com/');
  assert.match(String(addressFor('frost mage opener')), /^https:\/\/search\.brave\.com\/search\?q=frost%20mage%20opener&summary=0$/);
  assert.equal(addressFor('localhost:3000'), 'http://localhost:3000');
});

test('NEVER A COMMAND: other schemes become a harmless search, never a navigation', () => {
  for (const bad of ['javascript:alert(1)', 'file:///C:/Windows/win.ini', 'chrome://settings', 'data:text/html,<b>x</b>', 'vbscript:x']) {
    const out = String(addressFor(bad));
    assert.ok(out.startsWith('https://search.brave.com/search?q='), `${bad} -> ${out}`);
  }
});
