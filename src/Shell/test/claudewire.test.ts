// C4 (2026-10-21): the bubble's one door to Claude sessions lets through only well-formed messages, rebuilt field by field,
// and Open in Claude only ever hands the exact claude://claude.ai/epitaxy/<id> link to the shell.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { claudeMessage, claudeLink } from '../src/claudewire.ts';

const S = '3f2a9c1e-55aa-4b7e-9c11-0d7e2b4c9a10';

test('good messages pass, rebuilt with only their own fields', () => {
  assert.deepEqual(claudeMessage({ t: 'claude.answer', id: 'toolu_01AbC', decision: 'allow', extra: 'x' }), { t: 'claude.answer', id: 'toolu_01AbC', decision: 'allow' });
  assert.deepEqual(claudeMessage({ t: 'claude.answer', id: 'w1', decision: 'deny-message', message: 'use the test db' }), { t: 'claude.answer', id: 'w1', decision: 'deny-message', message: 'use the test db' });
  assert.deepEqual(claudeMessage({ t: 'claude.answer', id: 'w1', answers: { 'Which?': 'Sleep, Resting HR' } }), { t: 'claude.answer', id: 'w1', answers: { 'Which?': 'Sleep, Resting HR' } });
  assert.deepEqual(claudeMessage({ t: 'claude.send', session: S, text: 'add rest days', when: 'after' }), { t: 'claude.send', session: S, text: 'add rest days', when: 'after' });
  assert.deepEqual(claudeMessage({ t: 'claude.pause', session: S }), { t: 'claude.pause', session: S });
  assert.deepEqual(claudeMessage({ t: 'claude.play', session: S }), { t: 'claude.play', session: S });
  assert.deepEqual(claudeMessage({ t: 'claude.model', session: S, model: 'claude-opus-5-5' }), { t: 'claude.model', session: S, model: 'claude-opus-5-5' });
});

test('anything off is dropped whole', () => {
  for (const bad of [
    null, 'claude.answer', [], { t: 'claude.stop', session: S }, { t: 'submit', text: 'hi' },
    { t: 'claude.answer', id: '../x', decision: 'allow' },
    { t: 'claude.answer', id: 'w1', decision: 'yes' },
    { t: 'claude.answer', id: 'w1', decision: 'deny-message' },
    { t: 'claude.answer', id: 'w1', decision: 'deny-message', message: '   ' },
    { t: 'claude.answer', id: 'w1', decision: 'allow', message: 'sneaky' },
    { t: 'claude.answer', id: 'w1', decision: 'allow', answers: { q: 'a' } },
    { t: 'claude.answer', id: 'w1', answers: { q: 3 } },
    { t: 'claude.answer', id: 'w1', answers: {} },
    { t: 'claude.answer', id: 'w1', answers: { a: '1', b: '2', c: '3', d: '4', e: '5' } },
    { t: 'claude.answer', id: 'w1', answers: { q: 'x'.repeat(2001) } },
    { t: 'claude.send', session: S, text: 'hi', when: 'later' },
    { t: 'claude.send', session: S, text: '', when: 'now' },
    { t: 'claude.send', session: S, text: 'x'.repeat(4001), when: 'now' },
    { t: 'claude.send', session: 'a b', text: 'hi', when: 'now' },
    { t: 'claude.model', session: S, model: 'opus; rm -rf' },
  ]) assert.equal(claudeMessage(bad), null, JSON.stringify(bad)?.slice(0, 80));
});

test('Open in Claude takes only the exact session link', () => {
  assert.equal(claudeLink(`claude://claude.ai/epitaxy/${S}`), `claude://claude.ai/epitaxy/${S}`);
  for (const bad of [`https://claude.ai/epitaxy/${S}`, `claude://claude.ai/epitaxy/${S}?x=1`, `claude://evil.ai/epitaxy/${S}`, `claude://claude.ai/epitaxy/../../x`, 'file:///C:/Windows/system32/calc.exe', 42])
    assert.equal(claudeLink(bad), null, String(bad));
});
