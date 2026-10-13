// 2026-10-12 conversation fixes: the em dash never reaches him, and the messages that went to Quick and failed now
// go to Smart, while plain chat stays on Quick.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { undash } from '../src/core.ts';
import { pickLane } from '../src/route.ts';

test('no em dash ever reaches the bubble', () => {
  assert.equal(undash('I need to know where\u2014 streaming service, file on your PC?'), 'I need to know where, streaming service, file on your PC?');
  assert.equal(undash('Zeppelin to Orgrimmar \u2014 then Thunder Bluff.'), 'Zeppelin to Orgrimmar, then Thunder Bluff.');
  assert.equal(undash('pages 3 \u2013 5 are fine'), 'pages 3, 5 are fine');
  assert.equal(undash('2024\u20132026 stays'), '2024\u20132026 stays');
  assert.ok(!/\u2014/.test(undash('a \u2014 b \u2014 c')));
});

test('the requests that failed on Quick go to Smart; chat stays on Quick', () => {
  const lane = (t: string) => pickLane(t, 'auto', false, false, 'desktop').lane;
  for (const t of ['whats the fastest way from undercity to thunder bluff?', 'camn you oput on naruto?', 'get anderson paak tiny desk on youtube', 'how do i get to booty bay'])
    assert.equal(lane(t), 'smart', t);
  for (const t of ['how are you', 'lol nice', 'thanks man'])
    assert.equal(lane(t), 'quick', t);
  // 2026-10-13: only plain small talk is Quick now; "yup" usually answers something just asked, so it needs Smart.
  for (const t of ['yup', 'output on the screen is weird'])
    assert.equal(lane(t), 'smart', t);
});
