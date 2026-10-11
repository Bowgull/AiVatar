// 6.22: a known fake site is caught by its address or by its domain, a real one is not.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PhishCheck } from '../src/phish.ts';

test('a listed domain catches its subdomains; a listed address catches only itself; real sites pass', () => {
  const p = new PhishCheck('unused');
  p.add('PHISHING.DATABASE', 'domains', '# comment\nbattle-net-login.com\n');
  p.add('OPENPHISH', 'urls', 'https://evil.example/login\n');
  assert.deepEqual(p.check('https://account.battle-net-login.com/verify'), ['PHISHING.DATABASE']);
  assert.deepEqual(p.check('https://evil.example/login'), ['OPENPHISH']);
  assert.deepEqual(p.check('https://evil.example/other'), []);
  assert.deepEqual(p.check('https://account.battle.net/'), []);
});
