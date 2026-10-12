import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bySite, cleanName, doubles, readTidy, staleTrails, tidyPrompt, type TidyTab } from '../src/tidy.ts';

const T = (id: number, url: string, extra: Partial<TidyTab> = {}): TidyTab => ({ id, url, title: 'Tab ' + id, trail: null, lastSeen: 1000 + id, active: false, audible: false, lent: false, ...extra });

test('doubles keep the one he is on, else the newest', () => {
  assert.deepEqual(doubles([T(1, 'https://a.com/x'), T(2, 'https://a.com/x#top'), T(3, 'https://b.com/')]), [1]);
  assert.deepEqual(doubles([T(1, 'https://a.com/x', { active: true }), T(2, 'https://a.com/x')]), [2]);
});

test('stale trails: every tab unseen for two weeks, nothing playing', () => {
  const now = 100 * 86_400_000;
  const tabs = [T(1, 'https://a.com', { trail: 7, lastSeen: 0 }), T(2, 'https://b.com', { trail: 8, lastSeen: 0, audible: true }), T(3, 'https://c.com', { trail: 9, lastSeen: now })];
  assert.deepEqual(staleTrails([{ id: 7, name: 'A', named: false }, { id: 8, name: 'B', named: false }, { id: 9, name: 'C', named: false }], tabs, now), [7]);
});

test('without Qwen: same-site tabs become a trail', () => {
  assert.deepEqual(bySite([T(1, 'https://www.wowhead.com/a'), T(2, 'https://classic.wowhead.com/b'), T(3, 'https://reddit.com/')]), [{ name: 'WOWHEAD', tabs: [1, 2] }]);
});

test("Qwen's answer is read strictly", () => {
  const loose = [T(10, 'https://a.com'), T(11, 'https://b.com'), T(12, 'https://c.com')];
  const r = readTidy('Sure! {"groups":[{"name":"raid prep!!","tabs":[1,2,2,9]},{"name":"solo","tabs":[3]}],"names":[{"trail":"T1","name":"job hunt"},{"trail":"T5","name":"x"}]}', loose,
    [{ id: 4, name: 'WOWHEAD', named: false }]);
  assert.deepEqual(r.groups, [{ name: 'RAID PREP', tabs: [10, 11] }]);
  assert.deepEqual(r.names, [{ trail: 4, name: 'JOB HUNT' }]);
  assert.deepEqual(readTidy('no json here', loose, []), { groups: [], names: [] });
  assert.equal(cleanName('<script>alert(1)</script> ok'), 'SCRIPT ALERT 1 SCRIPT OK');
});

test('the prompt numbers the tabs and carries only site and title', () => {
  const p = tidyPrompt([T(1, 'https://www.wowhead.com/x', { title: 'Raid guide' })], []);
  assert.match(p, /1\. \[wowhead\.com\] Raid guide/);
});
