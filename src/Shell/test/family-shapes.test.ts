// The window family, part 2 (2026-10-22): F4 reshape on snap (family.ts shapeFor / fitShapes / applyFits) and F5 save +
// restore (familysave.ts), pure, no windows.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyFits, fitShapes, groupOf, joinOnDrop, onScreen, remove, type Box, type Fam, type Layouts, type Member } from '../src/family.ts';
import { layoutFor, mergeSave, readSaved, restoreInto, screenKey, EMPTY, type Display } from '../src/familysave.ts';

const mem = (id: string, box: Box, extra: Partial<Member> = {}): Member => ({ id, kind: id.split(':')[0]!, box, own: { width: box.width, height: box.height }, ...extra });
const fam = (...ms: Member[]): Fam => new Map(ms.map((m) => [m.id, m]));
// The kinds as familywin.ts declares them (KIND_LAYOUTS), plus a made-up player the way the mini player would declare it.
const L: Record<string, Layouts> = {
  job: { tall: { width: 152, minHeight: 200 }, wide: { height: 'auto' } },
  note: { tall: { maxWidth: 200, minHeight: 160 }, wide: {} },
  timer: { tall: { width: 140, minHeight: 200, fitHeight: true } },
  snip: { aspect: true, max: { width: 720, height: 560 } },
  player: { tall: { width: 200 }, wide: { height: 120 } },
};
const layoutsOf = (m: Member) => L[m.kind];
const VIDEO = { x: 400, y: 200, width: 640, height: 394 };
const JOB = { width: 372, height: 78 };

test('shape: a job dropped on the video\'s RIGHT becomes a column as tall as the video, lined up at the top', () => {
  const f = fam(mem('video', VIDEO), mem('job:a', { x: 1040, y: 260, ...JOB }));
  const j = joinOnDrop(f, 'job:a')!;
  const fits = fitShapes(j, layoutsOf);
  assert.deepEqual(fits.get('job:a'), { shape: 'tall', width: 152, height: 394 });
  assert.deepEqual(fits.get('video'), { shape: 'free' }, 'the video never reshapes');
  const n = applyFits(j, fits);
  assert.deepEqual(n.get('job:a')!.box, { x: 1040, y: 200, width: 152, height: 394 }, 'flush on the right, top to bottom');
  assert.equal(n.get('job:a')!.own.width, 372, 'its own size is kept for when it leaves');
});

test('shape: on the LEFT it is a column too, and the column ends flush at the video\'s left edge', () => {
  const f = fam(mem('video', VIDEO), mem('job:a', { x: 400 - 372, y: 230, ...JOB }));
  const n = applyFits(joinOnDrop(f, 'job:a')!, fitShapes(joinOnDrop(f, 'job:a')!, layoutsOf));
  assert.deepEqual(n.get('job:a')!.box, { x: 400 - 152, y: 200, width: 152, height: 394 });
  assert.equal(n.get('job:a')!.shape, 'tall');
});

test('shape: ABOVE or BELOW the wider video it is a strip as wide as the video; its height is its page\'s (a job)', () => {
  for (const [y, side] of [[594, 'below'], [200 - 78, 'above']] as const) {
    const f = fam(mem('video', VIDEO), mem('job:a', { x: 500, y, ...JOB }));
    const j = joinOnDrop(f, 'job:a')!;
    assert.equal(j.get('job:a')!.anchor!.side, side);
    const fit = fitShapes(j, layoutsOf).get('job:a')!;
    assert.deepEqual(fit, { shape: 'wide', width: 640 }, side + ': width matched, height left to the page');
    assert.equal(applyFits(j, fitShapes(j, layoutsOf)).get('job:a')!.box.x, 400, 'lined up from the left');
  }
});

test('shape: per kind, a note gets narrower, a timer stacks, a pinned snip keeps its shape, the player declares its own', () => {
  const beside = (id: string, own: { width: number; height: number }) => {
    const f = fam(mem('video', VIDEO), mem(id, { x: 1040, y: 200, ...own }, { anchor: { to: 'video', side: 'right', align: 'start' } }));
    return fitShapes(f, layoutsOf).get(id)!;
  };
  assert.deepEqual(beside('note:n', { width: 260, height: 220 }), { shape: 'tall', width: 200, height: 394 });
  assert.deepEqual(beside('note:small', { width: 180, height: 140 }), { shape: 'tall', width: 180, height: 394 }, 'a narrow note stays as narrow');
  assert.deepEqual(beside('timer:t', { width: 190, height: 52 }), { shape: 'tall', width: 140 }, 'a compact column: its height is the page');
  assert.deepEqual(beside('snip:1', { width: 300, height: 200 }), { shape: 'tall', width: 591, height: 394 }, 'aspect 3:2 kept');
  assert.deepEqual(beside('player', { width: 360, height: 120 }), { shape: 'tall', width: 200, height: 394 });
  const below = fam(mem('video', VIDEO), mem('player', { x: 400, y: 594, width: 360, height: 60 }, { anchor: { to: 'video', side: 'below', align: 'start' } }));
  assert.deepEqual(fitShapes(below, layoutsOf).get('player'), { shape: 'wide', width: 640, height: 120 });
});

test('shape: nothing to fit to keeps its own shape (beside a SHORTER window, a column too short, a free window)', () => {
  const timer = { x: 400, y: 200, width: 190, height: 52 };
  const f = fam(mem('timer:t', timer), mem('job:a', { x: 590, y: 200, ...JOB }, { anchor: { to: 'timer:t', side: 'right', align: 'start' } }));
  assert.equal(fitShapes(f, layoutsOf).get('job:a')!.shape, 'free', 'beside a shorter timer: still a strip');
  const short = fam(mem('note:n', { x: 0, y: 0, width: 200, height: 150 }), mem('job:a', { x: 200, y: 0, width: 140, height: 40 }, { anchor: { to: 'note:n', side: 'right', align: 'start' } }));
  assert.equal(fitShapes(short, layoutsOf).get('job:a')!.shape, 'free', 'a 150 tall neighbour is under the job column\'s 200 minimum');
  assert.deepEqual(fitShapes(fam(mem('job:a', { x: 0, y: 0, ...JOB })), layoutsOf).get('job:a'), { shape: 'free', width: 372, height: 78 });
});

test('shape: a chain fits to the NEW size: a note beside the job column is as tall as the column', () => {
  const f = fam(
    mem('video', VIDEO),
    mem('job:a', { x: 1040, y: 200, ...JOB }, { anchor: { to: 'video', side: 'right', align: 'start' } }),
    mem('note:n', { x: 1412, y: 200, width: 260, height: 220 }, { anchor: { to: 'job:a', side: 'right', align: 'start' } }),
  );
  const n = applyFits(f, fitShapes(f, layoutsOf));
  assert.deepEqual(n.get('note:n')!.box, { x: 1040 + 152, y: 200, width: 200, height: 394 });
});

test('leave: a member taken out of the family goes back to the shape and size it had before it joined', () => {
  const f = fam(mem('video', VIDEO), mem('job:a', { x: 1040, y: 260, ...JOB }));
  const joined = applyFits(joinOnDrop(f, 'job:a')!, fitShapes(joinOnDrop(f, 'job:a')!, layoutsOf));
  assert.equal(joined.get('job:a')!.box.height, 394);
  const out = remove(joined, 'job:a');
  const back = applyFits(out, fitShapes(out, layoutsOf));
  assert.deepEqual(back.get('job:a')!.box, { x: 1040, y: 200, width: 372, height: 78 }, 'its own strip, where it stands');
  assert.equal(back.get('job:a')!.shape, 'free');
  assert.deepEqual(back.get('video')!.box, VIDEO, 'the video untouched');
});

test('onScreen: a group hanging off the screen is slid back whole; a missing monitor puts it on the one that is there', () => {
  const area = { x: 0, y: 0, width: 1920, height: 1040 };
  assert.deepEqual(onScreen([{ x: 1700, y: 100, width: 400, height: 200 }], [area]), { dx: -180, dy: 0 });
  // Saved on a left monitor (-1920..0) that is not plugged in any more: onto the one that is.
  const g = [{ x: -1500, y: 200, width: 640, height: 394 }, { x: -860, y: 200, width: 152, height: 394 }];
  const d = onScreen(g, [area], g[0]);
  assert.equal(g[0]!.x + d.dx, 0);
  assert.equal(d.dy, 0);
  assert.deepEqual(onScreen([{ x: 10, y: 10, width: 100, height: 100 }], [area]), { dx: 0, dy: 0 });
});

const MON = (id: number, x: number, scale = 1): Display => ({ id, scaleFactor: scale, bounds: { x, y: 0, width: 1920, height: 1080 } });

test('save: one layout per screen arrangement (monitor ids + DPI); a new arrangement starts from the last one', () => {
  const two = screenKey([MON(2, 1920), MON(1, 0)]), one = screenKey([MON(1, 0)]);
  assert.equal(two, screenKey([MON(1, 0), MON(2, 1920)]), 'order does not matter');
  assert.notEqual(screenKey([MON(1, 0, 1.5)]), one, 'DPI is part of it');
  const f = fam(mem('video', VIDEO), mem('job:a', { x: 1040, y: 200, ...JOB }, { anchor: { to: 'video', side: 'right', align: 'start' }, shape: 'tall' }));
  const s = mergeSave(EMPTY, two, f, new Set(), 1000);
  assert.deepEqual(layoutFor(s, two)!.members['job:a']!.anchor, { to: 'video', side: 'right', align: 'start' });
  assert.equal(layoutFor(s, two)!.members['job:a']!.shape, 'tall');
  assert.deepEqual(layoutFor(s, two)!.members['job:a']!.own, JOB, 'its own size, not the column');
  // The second monitor unplugged: no layout of its own yet, so the last one is used.
  assert.equal(layoutFor(s, one), layoutFor(s, two));
  // Survives a restart: written and read back as JSON.
  assert.deepEqual(readSaved(JSON.parse(JSON.stringify(s))), s);
  assert.deepEqual(readSaved({ v: 1, layouts: { k: { at: 1, members: { 'x': { own: { width: 'big' } } } } } }).layouts.k!.members, {}, 'junk dropped');
});

test('save: a window closing does not erase anyone\'s slot; his own change does', () => {
  const k = 'k';
  const f = fam(mem('video', VIDEO), mem('job:a', { x: 1040, y: 200, ...JOB }, { anchor: { to: 'video', side: 'right', align: 'start' } }));
  let s = mergeSave(EMPTY, k, f, new Set(), 1);
  // The video put away: the job is free now, but only because the video went (it waits for it).
  const without = remove(f, 'video');
  without.delete('video');
  s = mergeSave(s, k, without, new Set(['job:a']), 2);
  assert.equal(layoutFor(s, k)!.members['job:a']!.anchor?.to, 'video', 'still beside the video');
  assert.ok(layoutFor(s, k)!.members.video, 'the closed video keeps its entry');
  // He drags the job somewhere else on its own: that is his choice, written down.
  s = mergeSave(s, k, without, new Set(), 3);
  assert.equal(layoutFor(s, k)!.members['job:a']!.anchor, undefined);
});

test('restore: the video reopens and the job that waited goes back to its side; a job opening finds its parent', () => {
  const saved = {
    video: { own: { width: 640, height: 394 }, at: 1 },
    'job:a': { own: JOB, at: 1, anchor: { to: 'video', side: 'right' as const, align: 'start' as const }, shape: 'tall' as const },
    'note:n': { own: { width: 260, height: 220 }, at: 1, anchor: { to: 'video', side: 'below' as const, align: 'start' as const } },
  };
  // The job and note closed up on each other when the video went (part 1: the rest close up). Both wait for it.
  const f = fam(mem('video', VIDEO), mem('job:a', { x: 1200, y: 300, ...JOB }), mem('note:n', { x: 1200, y: 378, width: 260, height: 220 }, { anchor: { to: 'job:a', side: 'below', align: 'start' } }));
  const n = restoreInto(f, 'video', saved, new Set(['job:a', 'note:n']))!;
  assert.ok(n);
  assert.equal(n.get('job:a')!.anchor?.to, 'video');
  assert.equal(n.get('job:a')!.anchor?.side, 'right');
  assert.equal(n.get('note:n')!.anchor?.to, 'video');
  assert.equal(n.get('note:n')!.anchor?.side, 'below');
  assert.deepEqual(groupOf(n, 'video').sort(), ['job:a', 'note:n', 'video']);
  // He had moved the job himself since (not waiting): it stays where he put it.
  const mine = restoreInto(fam(mem('video', VIDEO), mem('job:a', { x: 1200, y: 300, ...JOB })), 'video', saved, new Set());
  assert.equal(mine, null);
  // After a restart the job opens second: it finds the video open and goes back beside it.
  const later = restoreInto(fam(mem('video', VIDEO), mem('job:a', { x: 50, y: 50, ...JOB })), 'job:a', saved, new Set(['job:a']))!;
  assert.equal(later.get('job:a')!.anchor?.to, 'video');
  // Its parent is not open (a monitor unplugged took nothing, but the video is closed): nothing to restore.
  assert.equal(restoreInto(fam(mem('job:a', { x: 50, y: 50, ...JOB })), 'job:a', saved, new Set(['job:a'])), null);
});

test('shape: timers pack tight (2026-10-22, "a ton of empty space"): a compact column at the top, a second one stacks under it, a plate under the video keeps its size', () => {
  const T = { width: 250, height: 92 };
  const f = fam(
    mem('video', VIDEO),
    mem('timer:a', { x: 1040, y: 200, ...T }, { anchor: { to: 'video', side: 'right', align: 'start' } }),
    mem('timer:b', { x: 1040, y: 400, ...T }, { anchor: { to: 'timer:a', side: 'below', align: 'start' } }),
    mem('timer:c', { x: 400, y: 594, ...T }, { anchor: { to: 'video', side: 'below', align: 'start' } }),
  );
  const fits = fitShapes(f, layoutsOf);
  assert.deepEqual(fits.get('timer:a'), { shape: 'tall', width: 140 });
  assert.deepEqual(fits.get('timer:b'), { shape: 'tall', width: 140 }, 'under a 140 column: a column too');
  assert.deepEqual(fits.get('timer:c'), { shape: 'free', width: 250, height: 92 }, 'under the video: its own compact plate, no long bar');
  const n = applyFits(f, fits);
  assert.equal(n.get('timer:a')!.box.y, 200, 'lined up with the top of the video');
});
