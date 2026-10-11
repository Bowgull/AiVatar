import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lookalike, siteOf, skeleton } from '../src/lookalike.ts';

test('the real sites and their own subdomains pass', () => {
  for (const u of ['https://www.blizzard.com/', 'https://us.battle.net/login', 'https://mail.google.com/', 'https://www.youtube.com/watch?v=x',
    'https://www.wowhead.com/classic', 'https://secure.tangerine.ca/', 'https://www.td.com/ca/en']) assert.equal(lookalike(u), null, u);
});

test('ordinary sites that resemble nothing pass', () => {
  for (const u of ['https://www.reddit.com/r/classicwow', 'https://www.icy-veins.com/', 'https://news.ycombinator.com/', 'https://www.bbc.co.uk/',
    'https://raider.io/', 'https://www.bing.com/', 'https://glassdoor.com/']) assert.equal(lookalike(u), null, u);
});

test('the real name worn in front of another domain', () => {
  assert.equal(lookalike('https://www.youtube.com.evil.test/'), 'youtube.com');
  assert.equal(lookalike('https://paypal.com.secure-login.io/'), 'paypal.com');
  assert.equal(lookalike('https://account-battle.net.verify.ru/'), 'battle.net');
});

test('typos and swapped letters', () => {
  assert.equal(lookalike('https://b1izzard.com/'), 'blizzard.com');
  assert.equal(lookalike('https://blizzad.com/'), 'blizzard.com');
  assert.equal(lookalike('https://battle-net.com/'), 'battle.net');
  assert.equal(lookalike('https://paypa1.com/'), 'paypal.com');
  assert.equal(lookalike('https://linkedln.com/'), 'linkedin.com');
  assert.equal(lookalike('https://rnicrosoft.com/'), 'microsoft.com');
});

test('foreign letters that look like ours', () => {
  assert.equal(lookalike('https://xn--pypal-4ve.com/'), 'paypal.com');          // pаypal with a Cyrillic a
});

test('helpers', () => {
  assert.equal(siteOf('a.b.example.co.uk'), 'example.co.uk');
  assert.equal(siteOf('www.youtube.com'), 'youtube.com');
  assert.equal(skeleton('b1izzard'), 'blizzard');
});
