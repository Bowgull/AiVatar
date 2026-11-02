// Sheet 117 (2026-11-01): the mini player's lyrics, read from LRCLIB's timed LRC text.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseLrc, lineAt, fetchLyrics, spreadPlain, plainTitle } from '../src/lyrics.ts';

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
  const reply = (body: unknown, status = 200) => ({ ok: status === 200, status, json: async () => body });
  const fake = async (url: string) => { asked.push(url); return url.includes('/get?') ? reply(null, 404) : reply([{ duration: 300, syncedLyrics: '[00:01.00] far' }, { duration: 241, syncedLyrics: '[00:02.00] near' }]); };
  const l = await fetchLyrics(fake as never, { title: 'Maria También', artist: 'Khruangbin', duration: 241 });
  assert.deepEqual(l, { lines: [{ t: 2, text: 'near' }], instrumental: false, timed: true });
  assert.ok(asked[0]!.startsWith('https://lrclib.net/api/get?') && asked[0]!.includes('duration=241'));
  assert.equal(await fetchLyrics(fake as never, { title: '', artist: 'x' }), null);
  const instr = async () => reply({ instrumental: true, syncedLyrics: null });
  assert.deepEqual(await fetchLyrics(instr as never, { title: 'a', artist: 'b' }), { lines: null, instrumental: true, timed: false });
});

test('busy LRCLIB: asked again; never reached is an error (asked later), not "none"', async () => {
  let n = 0;
  const flaky = async () => { n++; if (n < 3) throw new Error('timeout'); return { ok: true, status: 200, json: async () => ({ syncedLyrics: '[00:03.00] at last' }) }; };
  assert.deepEqual(await fetchLyrics(flaky as never, { title: 'a', artist: 'b' }, { pause: [1, 1] }), { lines: [{ t: 3, text: 'at last' }], instrumental: false, timed: true });
  const down = async () => ({ ok: false, status: 503, json: async () => ({}) });
  assert.equal(await fetchLyrics(down as never, { title: 'a', artist: 'b' }, { pause: [1, 1] }), 'error');
  const none = async () => ({ ok: false, status: 404, json: async () => ({}) });
  assert.equal(await fetchLyrics(none as never, { title: 'a', artist: 'b' }, { pause: [1, 1] }), null);
});

test('untimed lyrics are spread over the song; the title is also tried plain', async () => {
  const l = spreadPlain('one\ntwo\n\nthree', 100)!;
  assert.deepEqual(l.map((x) => x.text), ['one', 'two', 'three']);
  assert.ok(l[0]!.t === 6 && l[1]!.t > l[0]!.t && l[2]!.t > l[1]!.t && l[2]!.t < 94);
  assert.equal(plainTitle('Something - Remastered 2009'), 'Something');
  assert.equal(plainTitle('Song (feat. Someone)'), 'Song');
  assert.equal(plainTitle('Live Forever'), 'Live Forever');
  const asked: string[] = [];
  const fake = async (url: string) => { asked.push(url); return url.includes('track_name=Something&') && url.includes('/get?') ? { ok: true, status: 200, json: async () => ({ plainLyrics: 'la\nla', duration: 200 }) } : { ok: false, status: 404, json: async () => ({}) }; };
  const r = await fetchLyrics(fake as never, { title: 'Something - Remastered 2009', artist: 'The Beatles', duration: 200 }, { pause: [1, 1] });
  assert.ok(r && r !== 'error' && r.timed === false && r.lines!.length === 2);
});
