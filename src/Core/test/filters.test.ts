// E6: a Gmail filter is said in plain words before his yes, never forwards, and Trash stands alone.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkFilter, describeFilter, gmailFilter } from '../src/filters.ts';

test('a filter in his words, exactly what it will do from now on', () => {
  const f = { from: 'news@shop.com', actions: ['archive', 'read', 'label'] as const, label: 'Shopping' };
  assert.equal(checkFilter({ ...f, actions: [...f.actions] }), null);
  assert.equal(describeFilter({ ...f, actions: [...f.actions] }), 'Every NEW email from news@shop.com will skip the inbox (still in All Mail), be marked read and get the label "Shopping". Emails already in your inbox are not touched. It keeps doing this until you remove it.');
  assert.deepEqual(gmailFilter({ ...f, actions: [...f.actions] }, 'Label_7'), { criteria: { from: 'news@shop.com' }, action: { addLabelIds: ['Label_7'], removeLabelIds: ['INBOX', 'UNREAD'] } });
});

test('nothing to match, nothing to do, a label with no name, or Trash mixed with more: refused', () => {
  assert.match(checkFilter({ actions: ['archive'] }) ?? '', /something to match/);
  assert.match(checkFilter({ from: 'a@b.co', actions: [] }) ?? '', /something to do/);
  assert.match(checkFilter({ from: 'a@b.co', actions: ['label'] }) ?? '', /Which label/);
  assert.match(checkFilter({ from: 'a@b.co', actions: ['trash', 'star'] }) ?? '', /Trash on its own/);
  assert.match(describeFilter({ subject: 'Your receipt', actions: ['trash'] }), /go straight to Trash \(kept 30 days, then gone\)/);
});

test('there is no forwarding action at all', () => {
  const g = gmailFilter({ from: 'a@b.co', actions: ['star'] });
  assert.equal('forward' in g.action, false);
});
