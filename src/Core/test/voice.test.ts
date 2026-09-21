import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildSystemPrompt, lint } from '../src/voice.ts';

// Replies Claude actually produced while the persona was still loose (2026-09-20).
const REAL_BAD_1 = "It's 2:51 p.m. right now on this sunny Sunday! ⏰";
const REAL_BAD_2 = 'Hey there, friend! Ready for adventure? 😄';

test('the real "sunny Sunday" reply is caught: emoji fixed, invented weather flagged', () => {
  const r = lint(REAL_BAD_1, ['mcp__aang__get_time'], 'what time is it right now?');
  assert.ok(!/\p{Extended_Pictographic}/u.test(r.cleaned));
  assert.ok(r.fixed.includes('emoji'));
  assert.ok(r.flags.includes('ungrounded weather claim'), 'sunny was never returned by a tool');
  assert.ok(!r.flags.includes('ungrounded time claim'), 'the time did come from get_time');
});

test('the real generic greeting is flagged as filler and stock cheer', () => {
  const r = lint(REAL_BAD_2, [], 'say hi in a few words');
  assert.ok(r.flags.includes('filler opener'));
  assert.ok(r.flags.includes('stock cheerful phrase'));
});

test('a grounded weather reply passes clean', () => {
  const r = lint('14 degrees and light rain in Toronto right now. Bring a jacket.', ['mcp__aang__get_weather'], 'is it nice out');
  assert.deepEqual(r.flags, []);
  assert.deepEqual(r.fixed, []);
});

test('weather or clock claims without a tool are flagged', () => {
  assert.ok(lint('Looks rainy out there.', [], 'hi').flags.includes('ungrounded weather claim'));
  assert.ok(lint('It is 3:15 pm.', [], 'hi').flags.includes('ungrounded time claim'));
});

test('repeating what Joshua said is not a claim', () => {
  assert.ok(!lint('Rain sounds annoying.', [], 'its raining again').flags.includes('ungrounded weather claim'));
});

import { stripReasoning } from '../src/voice.ts';

// The reply that leaked into the bubble during the end-to-end run (2026-09-20).
const REAL_LEAK = "<thinking>\nJoshua is asking me for three quick facts about pelicans. This doesn't require any of my tools.\n</thinking>\n\nPelicans have a giant throat pouch they use to scoop up fish. They're some of the largest flying birds.";

test('the real leaked reasoning block is removed, leaving only the answer', () => {
  const out = stripReasoning(REAL_LEAK);
  assert.ok(!/thinking|Joshua is asking|tools/i.test(out), out);
  assert.match(out, /^Pelicans have a giant throat pouch/);
  const r = lint(REAL_LEAK, [], 'tell me three quick facts about pelicans');
  assert.ok(r.fixed.includes('leaked reasoning'));
  assert.ok(!/thinking/i.test(r.cleaned));
});

test('reasoning is hidden at every point while it streams in', () => {
  // Feed the leak one character at a time, exactly as a stream would, and check nothing private ever shows.
  let acc = '';
  for (const ch of REAL_LEAK) {
    acc += ch;
    const visible = stripReasoning(acc);
    assert.ok(!/<|thinking|Joshua is asking/i.test(visible), `leaked at ${acc.length} chars: ${JSON.stringify(visible)}`);
  }
});

// The second leak, from the next end-to-end run: invented harness text opened by one tag, closed by another.
const REAL_LEAK_2 = "<system-warning>\nToken usage: 2322/200000</thinking>\n\nPelicans have massive throat pouches that can hold up to 3 gallons of water. They dive from the air to scoop fish.";

test('the second real leak (mismatched tags) is removed, at every point of the stream', () => {
  assert.equal(stripReasoning(REAL_LEAK_2), 'Pelicans have massive throat pouches that can hold up to 3 gallons of water. They dive from the air to scoop fish.');
  let acc = '';
  for (const ch of REAL_LEAK_2) {
    acc += ch;
    const visible = stripReasoning(acc);
    assert.ok(!/<|system-warning|Token usage|200000/i.test(visible), `leaked at ${acc.length} chars: ${JSON.stringify(visible)}`);
  }
});

test('an answer that comes BEFORE a private block is kept', () => {
  assert.equal(stripReasoning('It is 3 pm. <thinking>note to self</thinking>'), 'It is 3 pm.');
  assert.equal(stripReasoning('Answer.\n<system-warning>x</system-warning>'), 'Answer.');
});

test('an unclosed reasoning block shows nothing, and normal text is untouched', () => {
  assert.equal(stripReasoning('<thinking>still working this out'), '');
  assert.equal(stripReasoning('Answer first. <reasoning>and then some notes'), 'Answer first.');
  assert.equal(stripReasoning('2 < 3 and 5 > 4, fine.'), '2 < 3 and 5 > 4, fine.');
  assert.equal(stripReasoning('plain answer'), 'plain answer');
});

test('claiming to see the screen is flagged (real reply from the benchmark)', () => {
  const real = "Yeah. The space is right, I can see what's behind me without getting in the way. Stays out of the way but I can still see what you're doing.";
  assert.ok(lint(real, [], 'do you like your window').flags.includes('claims to see the screen'));
  assert.ok(lint("I'm watching your game.", [], 'hi').flags.includes('claims to see the screen'));
  assert.ok(!lint('That looks like a good screenshot.', [], 'here is a screenshot').flags.includes('claims to see the screen'));
});

test('a closing offer of help is removed', () => {
  const r = lint('The cache hit rate is 62%. Let me know if you want more detail.', [], 'how is the cache');
  assert.equal(r.cleaned, 'The cache hit rate is 62%.');
  assert.ok(r.fixed.includes('closing offer'));
});

test('exclamation marks are softened unless Joshua used them', () => {
  assert.equal(lint('Nice one!', [], 'i did it').cleaned, 'Nice one.');
  assert.equal(lint('Nice one!', [], 'i did it!!').cleaned, 'Nice one!');
});

test('published AI tells are flagged', () => {
  assert.ok(lint('This is a vibrant tapestry of ideas.', [], '').flags.includes('AI vocabulary'));
  assert.ok(lint("It's not just a tool, it's a companion.", [], '').flags.includes('"not just X, but Y"'));
  assert.ok(lint('Great question, here is the answer.', [], '').flags.includes('filler opener'));
});

test('plain, useful replies produce no findings', () => {
  const r = lint("I can't open apps yet, so nothing opened. Firefox is one double-click away.", [], 'opne firefx');
  assert.deepEqual(r.flags, []);
  assert.deepEqual(r.fixed, []);
});

test('the system prompt carries the voice rules, examples and Joshua\'s profile', () => {
  const p = buildSystemPrompt('Joshua lives in Toronto.', '- likes fruit pies');
  for (const part of ['<voice>', '<examples>', 'get_weather', 'Joshua lives in Toronto.', 'fruit pies', 'no emoji']) assert.ok(p.includes(part), part);
});

test('a tool call written out as a stage direction never reaches him', () => {
  const r = lint('(calls remember: "His raid group is the Bleeding Edge")\n\nGot it. Tuesdays at 9.', [], 'my raid group is the Bleeding Edge');
  assert.equal(r.cleaned, 'Got it. Tuesdays at 9.');
  assert.ok(r.fixed.includes('stage direction'));
  assert.ok(r.flags.includes('wrote a tool call as text'));
  assert.equal(lint('(after get_time) 2:51 pm.', ['mcp__aang__get_time']).cleaned, '2:51 pm.');
  assert.equal(lint('Sure (the raid is at nine), see you there.', []).cleaned, 'Sure (the raid is at nine), see you there.', 'ordinary brackets are left alone');
});
