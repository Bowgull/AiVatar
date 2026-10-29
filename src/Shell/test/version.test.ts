// His version rule (2026-10-14) as Samara's update engine uses it (tools/release/version.mjs, 2026-10-29).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkNewest, next, read } from '../../../tools/release/version.mjs';

const at = (d: string) => new Date(d).toISOString();
test('a fix bumps the last number, a feature the middle, a big change the first and the next name', () => {
  const last = { semver: '1.21.1', name: 'Gojo' };
  assert.deepEqual(next(last, [{ kind: 'fix' }]), { semver: '1.21.2', name: 'Gojo' });
  assert.deepEqual(next(last, [{ kind: 'fix' }, { kind: 'feature' }]), { semver: '1.22.0', name: 'Gojo' });
  assert.deepEqual(next(last, [{ kind: 'feature' }, { kind: 'major' }]), { semver: '2.0.0', name: 'Edward' });
  assert.deepEqual(next({ semver: '2.3.4', name: 'Edward' }, [{ kind: 'major' }]), { semver: '3.0.0', name: 'Naruto' });
  assert.deepEqual(next({ semver: '11.0.0', name: 'Frieren' }, [{ kind: 'major' }]), { semver: '12.0.0', name: 'Yuji' });
});

test('only a version the rule gives can be released, and only with lines that say what it brings', () => {
  const items = [{ at: at('2026-10-29T10:00:00Z'), text: 'x', kind: 'feature' }];
  const prev = { semver: '1.21.1', name: 'Gojo', at: at('2026-10-22T00:00:00Z') };
  assert.equal(checkNewest([prev, { semver: '1.22.0', name: 'Gojo', at: at('2026-10-29T11:00:00Z') }], items), null);
  assert.match(checkNewest([prev, { semver: '1.0.0', name: 'Gojo', at: at('2026-10-29T11:00:00Z') }], items)!, /breaks the rule/);
  assert.match(checkNewest([prev, { semver: '1.22.0', name: 'Edward', at: at('2026-10-29T11:00:00Z') }], items)!, /breaks the rule/);
  assert.match(checkNewest([prev, { semver: '1.21.2', name: 'Gojo', at: at('2026-10-23T00:00:00Z') }], items)!, /adds no lines/);
});

test('the record in the repo follows the rule, and is in order', () => {
  const rec = read('src/Shell/releases.json');
  const items = read('src/Shell/whats-new.json').items;
  assert.ok(rec.versions.length >= 31);
  for (let i = 1; i < rec.versions.length; i++) assert.ok(Date.parse(rec.versions[i].at) > Date.parse(rec.versions[i - 1].at), rec.versions[i].semver);
  if (rec.versions.length > 31) assert.equal(checkNewest(rec.versions, items), null);
});
