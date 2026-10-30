// Sheet 106 v7: the notice queue. One at a time with a count, small ones drain in 4 s and wait while his mouse is on
// them, big ones stay until a button, the three kinds, and the one sound for "needs you" only.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DRAIN_MS, DRAINED, NoticeQueue, cleanNotice, plainNotice, type NoticeIn, type NoticeShown, type NoticeTimers } from '../src/notices.ts';

/** A clock the test moves by hand. */
function fakeTime() {
  let now = 0, seq = 0;
  const due = new Map<number, { at: number; f: () => void }>();
  const timers: NoticeTimers = {
    set: (f, ms) => { const id = ++seq; due.set(id, { at: now + ms, f }); return id; },
    clear: (h) => { due.delete(h as number); },
    now: () => now,
  };
  const tick = (ms: number) => {
    const end = now + ms;
    for (;;) {
      const next = [...due.entries()].filter(([, d]) => d.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
      if (!next) break;
      now = next[1].at; due.delete(next[0]); next[1].f();
    }
    now = end;
  };
  return { timers, tick, pending: () => due.size };
}
const big = (title: string, kind: NoticeIn['kind'] = 'done'): NoticeIn => ({ kind, from: 'menu', kick: 'K', title, keys: [{ label: 'Got it', act: 'ok' }] });
const small = (title: string, kind: NoticeIn['kind'] = 'done'): NoticeIn => ({ kind, from: 'menu', kick: 'K', title, small: true });
function rig() {
  const t = fakeTime(), shown: (NoticeShown | null)[] = [];
  const q = new NoticeQueue((s) => shown.push(s), t.timers);
  const last = () => shown[shown.length - 1];
  return { q, t, shown, last };
}

test('one at a time: the second waits until the first is answered, then drops', () => {
  const { q, shown, last } = rig();
  const heard: string[] = [];
  const a = q.push(big('A'), (act) => heard.push('A:' + act));
  q.push(big('B'), (act) => heard.push('B:' + act));
  assert.equal(q.current?.title, 'A');
  assert.equal(shown.filter((s) => s?.fresh).length, 1, 'only A dropped');
  assert.equal(q.answer(a, 'ok'), true);
  assert.deepEqual(heard, ['A:ok']);
  assert.equal(last()?.notice.title, 'B');
  assert.equal(last()?.fresh, true, 'B drops when A is done');
});

test('the count: "1 of 3", then "2 of 3", "3 of 3", and it starts again once all are done', () => {
  const { q, last } = rig();
  const ids = [q.push(big('A')), q.push(big('B')), q.push(big('C'))];
  assert.deepEqual([last()?.at, last()?.of], [1, 3], 'the one showing learns more are waiting');
  q.answer(ids[0], 'ok');
  assert.deepEqual([last()?.notice.title, last()?.at, last()?.of], ['B', 2, 3]);
  q.answer(ids[1], 'ok');
  assert.deepEqual([last()?.at, last()?.of], [3, 3]);
  q.answer(ids[2], 'ok');
  assert.equal(last(), null, 'nothing left: the layer is put away');
  q.push(big('D'));
  assert.deepEqual([last()?.at, last()?.of], [1, 1], 'a fresh start shows no count');
});

test('one arriving while another shows raises the count without dropping again', () => {
  const { q, last } = rig();
  q.push(big('A'));
  q.push(big('B'));
  assert.equal(last()?.notice.title, 'A');
  assert.equal(last()?.fresh, false);
  assert.equal(last()?.of, 2);
});

test('a small one drains by itself after 4 seconds', () => {
  const { q, t, last } = rig();
  const heard: string[] = [];
  q.push(small('Saved'), (act) => heard.push(act));
  t.tick(DRAIN_MS - 1);
  assert.equal(q.current?.title, 'Saved');
  t.tick(1);
  assert.deepEqual(heard, [DRAINED]);
  assert.equal(last(), null);
});

test('a small one waits while his mouse is on it, and carries on from where it was', () => {
  const { q, t } = rig();
  q.push(small('Saved'));
  t.tick(1000);
  q.hover(true);
  t.tick(60_000);
  assert.equal(q.current?.title, 'Saved', 'still there after a minute under the mouse');
  q.hover(false);
  t.tick(DRAIN_MS - 1000 - 1);
  assert.equal(q.current?.title, 'Saved', 'the 3 s it had left, not a fresh 4');
  t.tick(1);
  assert.equal(q.current, null);
});

test('a big one never drains: it stays until a button', () => {
  const { q, t } = rig();
  const id = q.push(big('Brought in 40 bookmarks'));
  t.tick(10 * 60_000);
  assert.equal(q.current?.id, id);
});

test('a small one behind a big one starts its 4 s only when it shows', () => {
  const { q, t } = rig();
  const a = q.push(big('A'));
  q.push(small('b'));
  t.tick(30_000);
  q.answer(a, 'ok');
  t.tick(DRAIN_MS - 1);
  assert.equal(q.current?.title, 'b');
  t.tick(1);
  assert.equal(q.current, null);
});

test('only "needs you" plays the sound, once, as it first shows', () => {
  const { q, shown } = rig();
  const a = q.push(big('done'));
  const b = q.push(big('need', 'need'));
  q.push(big('bad', 'bad'));
  q.answer(a, 'ok');
  q.update(b, { err: 'Not that code' });
  q.answer(b, 'ok');
  const sounds = shown.filter((s) => s?.sound).map((s) => s!.notice.title);
  assert.deepEqual(sounds, ['need'], 'the sound once, for the blue one only; not again when it changes in place');
});

test('the three kinds keep their kind; anything else becomes done', () => {
  const { q } = rig();
  for (const k of ['done', 'need', 'bad'] as const) q.push(big(k, k));
  assert.deepEqual(q.all.map((n) => n.kind), ['done', 'need', 'bad']);
  assert.equal(cleanNotice({ ...big('x'), kind: 'loud' as never }).kind, 'done');
  assert.equal(cleanNotice({ ...big('x'), from: 'page' as never }).from, 'menu');
});

test('several downloads join the one waiting: one notice, a row each', () => {
  const { q, last } = rig();
  const id = q.push({ kind: 'done', from: 'dl', kick: 'DOWNLOADED', title: 'Ready', group: 'dl', files: [{ id: 1, kind: 'pdf', name: 'tax-form.pdf', meta: '212 KB' }] });
  const g = q.group('dl');
  assert.equal(g?.id, id);
  q.update(id, { kick: '2 DOWNLOADS', title: 'All ready', files: [...g!.files!, { id: 2, kind: 'zip', name: 'receipts.zip', meta: '4.1 MB' }] });
  assert.equal(q.all.length, 1);
  assert.equal(last()?.fresh, false, 'it does not drop a second time');
  assert.deepEqual(last()?.notice.files?.map((f) => f.name), ['tax-form.pdf', 'receipts.zip']);
});

test('an ask that times out is dropped without an answer, and the next one drops', () => {
  const { q, last } = rig();
  const heard: string[] = [];
  const a = q.push(big('camera?', 'need'), (act) => heard.push(act));
  q.push(big('B'));
  q.drop(a);
  assert.deepEqual(heard, []);
  assert.equal(last()?.notice.title, 'B');
  assert.equal(last()?.fresh, true);
});

test('a hover left over from the last notice does not hold the next one', () => {
  const { q, t } = rig();
  const a = q.push(big('A'));
  q.push(small('b'));
  q.hover(true);
  q.answer(a, 'ok');
  t.tick(DRAIN_MS);
  assert.equal(q.current, null, 'the new one starts unhovered and drains');
});

test('the button\'s value reaches the owner (the TV code, the device picked)', () => {
  const { q } = rig();
  let got = '';
  const id = q.push(big('Link'), (act, v) => { got = `${act}:${v}`; });
  q.answer(id, 'code', 'A1B2C3');
  assert.equal(got, 'code:A1B2C3');
  assert.equal(q.answer(id, 'ok'), false, 'answered once only');
});

test('plain lines: short ones are small news, long ones big with Got it', () => {
  const s = plainNotice('Home page saved.');
  assert.equal(s.small, true); assert.equal(s.title, 'Home page saved');
  const l = plainNotice('Closed the mockups. Their history is kept: Mockups in the ... menu brings them back.');
  assert.equal(l.small, undefined); assert.equal(l.rows?.[0].v.startsWith('Closed the mockups'), true); assert.equal(l.keys?.[0].label, 'Got it');
  assert.equal(plainNotice('Something long went badly wrong just now, sorry about that.', { kind: 'bad' }).keys?.[0].label, 'Close');
});

test('cleaned before it leaves: plain words, cut to size', () => {
  const c = cleanNotice({ kind: 'bad', from: 'shield', kick: 'no saved login', title: 'x'.repeat(500), rows: [{ g: 'a', v: 'line\u0000two' }] });
  assert.equal(c.kick, 'NO SAVED LOGIN');
  assert.equal(c.title.length, 80);
  assert.equal(c.rows?.[0].v, 'line two');
});
