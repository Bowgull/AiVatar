// Sheet 117 (2026-11-01): the mini player's lyrics, read from LRCLIB's timed LRC text.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseLrc, lineAt, fetchLyrics } from '../src/lyrics.ts';

test('LRC lines are read into timed lines, in order; untimed text is not lyrics', () => {
  assert.deepEqual(parseLrc('[00:12.50] second\n[ar: someone]\n[00:01.00] first\n[01:02.3][01:30.00] chorus'),
    [{ t: 1, text: 'first' }, { t: 12.5, text: 'second' }, { t: 62.3, text: 'chorus' }, { t: 90, text: 'chorus' }]);
  assert.equal(parseLrc('just words'), null);
  assert.equal(parseLrc(''), null);
  assert.equal(parseLrc(42), null);
});

test('the line playing now is the last one that has started', () => {
  const l = [{ t: 0, text: 'a' }, { t: 5, text: 'b' }, { t: 10, text: 'c' }];
  assert.equal(lineAt(l, -1), -1);
  assert.equal(lineAt(l, 0), 0);
  assert.equal(lineAt(l, 7), 1);
  assert.equal(lineAt(l, 99), 2);
});

test('LRCLIB: the exact match first, then the search (the closest length), never without a title and artist', async () => {
  const asked: string[] = [];
  const reply = (body: unknown, ok = true) => ({ ok, status: ok ? 200 : 404, json: async () => body });
  const fake = async (url: string) => { asked.push(url); return url.includes('/get?') ? reply(null, false) : reply([{ duration: 300, syncedLyrics: '[00:01.00] far' }, { duration: 241, syncedLyrics: '[00:02.00] near' }]); };
  const l = await fetchLyrics(fake as never, { title: 'Maria También', artist: 'Khruangbin', duration: 241 });
  assert.deepEqual(l, { lines: [{ t: 2, text: 'near' }], instrumental: false });
  assert.ok(asked[0]!.startsWith('https://lrclib.net/api/get?') && asked[0]!.includes('duration=241'));
  assert.equal(await fetchLyrics(fake as never, { title: '', artist: 'x' }), null);
  const instr = async () => reply({ instrumental: true, syncedLyrics: null });
  assert.deepEqual(await fetchLyrics(instr as never, { title: 'a', artist: 'b' }), { lines: null, instrumental: true });
});
