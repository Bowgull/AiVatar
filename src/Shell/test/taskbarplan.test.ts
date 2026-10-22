// Pop-outs on Samara's taskbar (sheet 66 A, 2026-10-22): who has a picture, what a snapped group is called, which
// buttons go where, the bar under the lantern, the group's picture layout, and the pixel icons.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as P from '../src/taskbarplan.ts';
import { GLYPHS, SIZE, glyphBitmap, icoFromPngs, BUTTON_GLYPHS, TASK_GLYPH } from '../src/taskbaricons.ts';

test('a group is named like his example, in a fixed order, with counts', () => {
  assert.equal(P.groupLabel(['player', 'job', 'video']), 'Video + Job + Player');
  assert.equal(P.groupLabel(['job', 'video', 'job']), 'Video + 2 Jobs');
  assert.equal(P.groupLabel(['note', 'timer']), 'Timer + Note');
  assert.equal(P.groupLabel(['snip', 'mystery']), 'Snip');
  assert.equal(P.groupLabel([]), 'Pop-outs');
});

test('the lead: the video, else the player, else a job; ties by id', () => {
  assert.equal(P.leadOf([{ id: 'job:a', kind: 'job' }, { id: 'video', kind: 'video' }, { id: 'player', kind: 'player' }]), 'video');
  assert.equal(P.leadOf([{ id: 'job:a', kind: 'job' }, { id: 'player', kind: 'player' }]), 'player');
  assert.equal(P.leadOf([{ id: 'note:z', kind: 'note' }, { id: 'job:b', kind: 'job' }, { id: 'job:a', kind: 'job' }]), 'job:a');
});

test('loose pop-outs get their own picture; a snapped group is ONE; hidden ones are nowhere', () => {
  const seen: P.Seen[] = [
    { id: 'video', kind: 'video', visible: true, group: ['video', 'job:a', 'player'] },
    { id: 'job:a', kind: 'job', visible: true, group: ['video', 'job:a', 'player'] },
    { id: 'player', kind: 'player', visible: true, group: ['video', 'job:a', 'player'] },
    { id: 'note:1', kind: 'note', visible: true, group: ['note:1'] },
    { id: 'timer:t', kind: 'timer', visible: false, group: ['timer:t', 'note:2'] },
    { id: 'note:2', kind: 'note', visible: true, group: ['timer:t', 'note:2'] },
  ];
  const p = P.planTaskbar(seen);
  assert.deepEqual(p.loose.sort(), ['note:1', 'note:2']);       // note:2's partner is hidden: alone, so loose
  assert.equal(p.groups.length, 1);
  assert.deepEqual(p.groups[0], { lead: 'video', ids: ['job:a', 'player', 'video'], kinds: ['job', 'player', 'video'], label: 'Video + Job + Player' });
  assert.deepEqual(p.hidden, ['timer:t']);
  // Leaving the group: each member is loose again (its own picture back).
  const apart = P.planTaskbar(seen.map((s) => ({ ...s, group: [s.id] })));
  assert.equal(apart.groups.length, 0);
  assert.equal(apart.loose.length, 5);
});

test('names under the pictures', () => {
  const now = 1_000_000;
  assert.equal(P.fmtLeft(412_000), '6:52');
  assert.equal(P.fmtLeft(3_900_000), '1:05:00');
  assert.equal(P.fmtLeft(-5), '0:00');
  const t: P.Timer = { id: 'f', label: 'Flask', total: 600_000, end: now + 412_000, paused: 0 };
  assert.equal(P.memberLabel('timer', { timer: t, now }), 'Flask · 6:52');
  assert.equal(P.memberLabel('timer', { timer: { ...t, paused: 60_000 }, now }), 'Flask · 1:00');
  assert.equal(P.memberLabel('player', { title: 'Maria También', artist: 'Khruangbin' }), 'Maria También · Khruangbin');
  assert.equal(P.memberLabel('player', {}), 'Music');
  assert.equal(P.memberLabel('note', { title: '' }), 'Note');
  assert.equal(P.memberLabel('note', { title: 'Raid\nnight' }), 'Raid night');
  const j = P.jobNow({ id: 'x', title: 'Waymark', phase: 'working', percent: 49.6 }, now);
  assert.equal(P.memberLabel('job', { job: j }), 'Waymark · 50%');
  assert.equal(P.memberLabel('job', { job: P.jobNow({ id: 'x', project: 'aang', phase: 'ended', percent: 100 }, now) }), 'aang');
  assert.equal(P.memberLabel('video', { title: 'Lofi beats to raid to' }), 'Lofi beats to raid to');
  assert.equal(P.memberLabel('video', {}), 'Video');
});

test('a job: its %, from percent or its task list; stalled by the brain\'s own limit', () => {
  const now = 10_000_000;
  assert.equal(P.jobNow({ phase: 'working', progress: { done: 1, total: 4 } }, now).pct, 25);
  assert.equal(P.jobNow({ phase: 'working' }, now).pct, null);
  assert.equal(P.jobNow({ phase: 'working', activity: { aliveAt: now - 400_000, stallMs: 300_000 } }, now).stalled, true);
  assert.equal(P.jobNow({ phase: 'working', activity: { aliveAt: now - 400_000, stallMs: 300_000, now: 'Waiting for you' } }, now).stalled, false);
  assert.equal(P.jobNow({ phase: 'working', activity: { aliveAt: now - 10_000, stallMs: 300_000 } }, now).stalled, false);
  assert.equal(P.jobNow(null, now).active, false);
});

test('the bar under the lantern: none, normal (the one furthest behind), amber when paused or stalled, moving with no %', () => {
  const j = (phase: string, pct: number | null, stalled = false): P.JobNow => ({ title: 'x', phase, active: phase === 'working' || phase === 'paused', pct, stalled });
  assert.deepEqual(P.barFor([]), { value: -1, mode: 'none' });
  assert.deepEqual(P.barFor([j('ended', 100)]), { value: -1, mode: 'none' });
  assert.deepEqual(P.barFor([j('working', 80), j('working', 30)]), { value: 0.3, mode: 'normal' });
  assert.deepEqual(P.barFor([j('working', 80), j('paused', 60)]), { value: 0.6, mode: 'paused' });
  assert.deepEqual(P.barFor([j('working', 40, true)]), { value: 0.4, mode: 'paused' });
  assert.deepEqual(P.barFor([j('working', null)]), { value: -1, mode: 'none' });
  assert.equal(P.barFor([j('working', 0)]).value, 0.01);
});

test('buttons: player prev/play-pause/next, job pause/open, timer pause/+1/stop, the video play/pin; a group carries the player\'s', () => {
  assert.deepEqual(P.buttonsFor('player', { playing: true }).map((b) => b.tip), ['Previous', 'Pause', 'Next']);
  assert.deepEqual(P.buttonsFor('player', { playing: false }).map((b) => b.icon), ['prev', 'play', 'next']);
  assert.deepEqual(P.buttonsFor('job', { paused: false }).map((b) => b.tip), ['Pause', 'Open in Claude']);
  assert.deepEqual(P.buttonsFor('job', { paused: true }).map((b) => b.tip), ['Resume', 'Open in Claude']);
  assert.deepEqual(P.buttonsFor('job', { active: false }).map((b) => b.tip), ['Open in Claude']);
  assert.deepEqual(P.buttonsFor('timer', {}).map((b) => b.tip), ['Pause', 'One more minute', 'Stop']);
  assert.deepEqual(P.buttonsFor('video', { pinned: true }).map((b) => b.icon), ['pause', 'pin']);
  assert.deepEqual(P.buttonsFor('note'), []);
  for (const k of ['player', 'job', 'timer', 'video']) for (const b of P.buttonsFor(k)) assert.ok((BUTTON_GLYPHS as readonly string[]).includes(b.icon), b.icon);
  const kinds: Record<string, string> = { video: 'video', 'job:a': 'job', player: 'player' };
  assert.equal(P.groupButtonsOwner({ lead: 'video', ids: ['job:a', 'player', 'video'] }, (id) => kinds[id]!), 'player');
  assert.equal(P.groupButtonsOwner({ lead: 'video', ids: ['job:a', 'video'] }, (id) => kinds[id]!), 'video');
});

test('the group picture keeps the arrangement, fits the size, never grows past real size, and stays flush', () => {
  const boxes = [{ x: 100, y: 100, width: 640, height: 394 }, { x: 740, y: 100, width: 152, height: 394 }, { x: 100, y: 494, width: 792, height: 60 }];
  const l = P.fitLayout(boxes, 200, 120);
  assert.ok(l.width <= 200 && l.height <= 120);
  assert.ok(Math.abs(l.width / l.height - 792 / 454) < 0.05, JSON.stringify(l));
  assert.equal(l.rects[0]!.x + l.rects[0]!.width, l.rects[1]!.x);      // flush side by side
  assert.equal(l.rects[0]!.y + l.rects[0]!.height, l.rects[2]!.y);     // flush above / below
  const big = P.fitLayout(boxes, 4000, 4000);
  assert.equal(big.scale, 1);
  assert.equal(big.width, 792);
  assert.deepEqual(P.boundsOf(boxes), { x: 100, y: 100, width: 792, height: 454 });
});

test('blit: opaque copied, see-through kept, clipped at the edges', () => {
  const dst = new Uint8Array(4 * 4 * 4);
  const src = new Uint8Array([10, 20, 30, 255, 0, 0, 0, 0, 50, 50, 50, 128, 1, 2, 3, 255]);
  P.blit(dst, 4, 4, src, 2, 2, 3, 3);
  assert.deepEqual([...dst.slice((3 * 4 + 3) * 4, (3 * 4 + 3) * 4 + 4)], [10, 20, 30, 255]);
  assert.equal(dst.reduce((a, b) => a + b, 0), 10 + 20 + 30 + 255);
});

test('the right-click tasks: six, the three needing Aang marked', () => {
  assert.deepEqual([...P.POPOUT_TASKS], ['popouts-show', 'popouts-hide', 'popouts-gather', 'new-note', 'timer', 'player']);
  assert.ok(P.isPopoutTask('timer') && !P.isPopoutTask('new-tab') && !P.isPopoutTask('Timer'));
  assert.deepEqual([...P.NEEDS_AANG].sort(), ['new-note', 'player', 'timer']);
});

test('pixel icons: every glyph 16 x 16, parchment with a dark-wood rim, doubled crisply; an .ico of PNGs', () => {
  for (const [name, rows] of Object.entries(GLYPHS)) {
    assert.equal(rows.length, SIZE, name);
    for (const r of rows) assert.equal(r.length, SIZE, `${name}: ${r}`);
    const b = glyphBitmap(name);
    assert.equal(b.length, 16 * 16 * 4);
    const colours = new Set<string>();
    for (let i = 0; i < b.length; i += 4) colours.add([...b.subarray(i, i + 4)].join(','));
    assert.deepEqual([...colours].sort(), ['0,0,0,0', '14,26,42,255', '192,228,243,255'], name);
    const big = glyphBitmap(name, 2);
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      const s = (y * 16 + x) * 4, d = ((y * 2 + 1) * 32 + x * 2 + 1) * 4;
      assert.deepEqual([...big.subarray(d, d + 4)], [...b.subarray(s, s + 4)]);
    }
  }
  for (const g of [...BUTTON_GLYPHS, ...Object.values(TASK_GLYPH)]) assert.ok(GLYPHS[g], g);
  const ico = icoFromPngs([{ size: 16, png: Buffer.from('aa') }, { size: 32, png: Buffer.from('bbb') }]);
  assert.equal(ico.readUInt16LE(2), 1); assert.equal(ico.readUInt16LE(4), 2);
  assert.equal(ico[6], 16); assert.equal(ico[22], 32);
  assert.equal(ico.readUInt32LE(6 + 12), 38); assert.equal(ico.readUInt32LE(22 + 12), 40);
  assert.equal(ico.subarray(38).toString(), 'aabbb');
});
