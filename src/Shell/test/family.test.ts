// The window family's maths (src/family.ts): snapping, flush joins, the group moving as one, pull apart and join back
// minus what he took out, rearranging, and a member going back to its own size when it leaves.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  SNAP, EDGE, arrange, biggest, childrenOf, contact, groupOf, insert, isFree, isJoined, joinOnDrop, joinedSides, layoutFrom,
  makesLoop, ownSize, place, rearranged, remove, reroot, rootOf, shimmy, slotFor, snapMove, springStep, settled, MOTION,
  type Box, type Fam, type Member,
} from '../src/family.ts';

const SCREEN = { x: 0, y: 0, width: 1920, height: 1040 };
const mem = (id: string, box: Box, extra: Partial<Member> = {}): Member => ({ id, kind: id.split(':')[0]!, box, own: { width: box.width, height: box.height }, ...extra });
const fam = (...ms: Member[]): Fam => new Map(ms.map((m) => [m.id, m]));
/** Sheet 59's FLUSH picture: the video, the job as a column on its right, the player strip under the video. */
const sheet59 = (): Fam => {
  const f = fam(
    mem('video', { x: 400, y: 200, width: 640, height: 394 }),
    mem('job:a', { x: 1040, y: 200, width: 180, height: 300 }, { anchor: { to: 'video', side: 'right', align: 'start' } }),
    mem('player', { x: 400, y: 594, width: 640, height: 60 }, { anchor: { to: 'video', side: 'below', align: 'start' } }),
  );
  return f;
};

test('snap: a window within 14 px of another sticks flush to it, and lines its top up', () => {
  const video = { x: 400, y: 200, width: 640, height: 394 };
  const job = { x: 1040 + 11, y: 200 + 5, width: 180, height: 300 };   // 11 px off to the right, 5 px low
  const d = snapMove([job], [video], SCREEN);
  assert.deepEqual(d, { dx: -11, dy: -5 });
  assert.equal(contact({ ...job, x: job.x + d.dx, y: job.y + d.dy }, video), 'right');
});

test('snap: 15 px away is not close enough; boxes that do not overlap on the other axis never catch', () => {
  const video = { x: 400, y: 200, width: 640, height: 394 };
  assert.deepEqual(snapMove([{ x: 1040 + SNAP + 1, y: 200, width: 180, height: 300 }], [video], null), { dx: 0, dy: 0 });
  // level with the video's right edge but far below it: no sideways catch
  assert.deepEqual(snapMove([{ x: 1045, y: 700, width: 180, height: 100 }], [video], null).dx, 0);
});

test('snap: below a window, it catches its bottom edge and lines up centres when that is closest', () => {
  const video = { x: 400, y: 200, width: 640, height: 394 };
  const timer = { x: 400 + 320 - 70 + 4, y: 594 + 9, width: 140, height: 60 };   // nearly centred, 9 px below
  const d = snapMove([timer], [video], null);
  assert.equal(d.dy, -9);
  assert.equal(timer.x + d.dx + 70, 400 + 320, 'centred under the video');
});

test('snap: the screen work area catches within 20 px, and the whole group snaps as one outline', () => {
  const a = { x: 15, y: 300, width: 200, height: 100 }, b = { x: 215, y: 300, width: 100, height: 100 };
  assert.deepEqual(snapMove([a, b], [], SCREEN), { dx: -15, dy: 0 });
  assert.deepEqual(snapMove([{ x: 1920 - 200 - EDGE - 1, y: 500, width: 200, height: 10 }], [], SCREEN), { dx: 0, dy: 0 });
  // A window catch beats the screen edge on the same axis.
  const still = { x: 0, y: 100, width: 30, height: 600 };
  assert.equal(snapMove([{ x: 36, y: 300, width: 100, height: 50 }], [still], SCREEN).dx, -6);
});

test('snap: off when the fling is too fast (windows: false), the screen still catches', () => {
  const video = { x: 400, y: 200, width: 640, height: 394 };
  assert.deepEqual(snapMove([{ x: 1045, y: 200, width: 180, height: 300 }], [video], null, { windows: false }), { dx: 0, dy: 0 });
});

test('flush join on release: one anchor is written, the biggest window leads, joined sides go square', () => {
  const f = fam(mem('video', { x: 400, y: 200, width: 640, height: 394 }), mem('job:a', { x: 1040, y: 200, width: 180, height: 300 }));
  const j = joinOnDrop(f, 'job:a')!;
  assert.ok(j);
  assert.equal(rootOf(j, 'job:a'), 'video');
  assert.deepEqual(j.get('job:a')!.anchor, { to: 'video', side: 'right', align: 'start' });
  assert.deepEqual(joinedSides(j).get('video'), ['right']);
  assert.deepEqual(joinedSides(j).get('job:a'), ['left']);
  // Not touching: no join.
  assert.equal(joinOnDrop(fam(mem('a', { x: 0, y: 0, width: 10, height: 10 }), mem('b', { x: 30, y: 0, width: 10, height: 10 })), 'a'), null);
});

test('dropping the big window onto a small one still makes the big one lead', () => {
  const f = fam(mem('timer:1', { x: 100, y: 100, width: 140, height: 60 }), mem('video', { x: 240, y: 80, width: 640, height: 394 }));
  const j = joinOnDrop(f, 'video')!;
  assert.equal(rootOf(j, 'timer:1'), 'video');
  assert.equal(j.get('timer:1')!.anchor!.side, 'left');
});

test('group move: dragging ANY member moves the whole group, and they stay flush', () => {
  const f = sheet59();
  for (const grabbed of ['video', 'job:a', 'player']) {
    const ids = groupOf(f, grabbed);
    assert.equal(ids.length, 3, grabbed);
    // what familywin does on every move: everyone by the same delta
    const moved = new Map([...f].map(([id, m]) => [id, { ...m, box: { ...m.box, x: m.box.x + 37, y: m.box.y - 12 } }]));
    assert.equal(contact(moved.get('job:a')!.box, moved.get('video')!.box), 'right');
    assert.equal(contact(moved.get('player')!.box, moved.get('video')!.box), 'below');
    // and re-placing from the anchors changes nothing (they are exactly where the anchors say)
    const re = layoutFrom(moved, rootOf(moved, grabbed));
    for (const id of ids) assert.deepEqual(re.get(id)!.box, moved.get(id)!.box);
  }
});

test('pull apart spreads 14 px from the biggest window, which stays put', () => {
  const s = arrange(sheet59(), 'player', 14);
  assert.deepEqual(s.get('video')!.box, { x: 400, y: 200, width: 640, height: 394 });
  assert.equal(s.get('job:a')!.box.x, 1040 + 14);
  assert.equal(s.get('player')!.box.y, 594 + 14);
  const back = arrange(s, 'job:a', 0);
  assert.equal(back.get('job:a')!.box.x, 1040);
  assert.equal(back.get('player')!.box.y, 594);
});

test('pull apart: one dragged 40 px away is free; the rest join back flush without it', () => {
  const spread = arrange(sheet59(), 'video', 14);
  const others = ['video', 'player'].map((id) => spread.get(id)!.box);
  assert.equal(isFree({ x: 1040 + 39, y: 200, width: 180, height: 300 }, others), false);
  assert.equal(isFree({ x: 1040 + 40, y: 200, width: 180, height: 300 }, others), true);
  const left = remove(spread, 'job:a');
  assert.equal(isJoined(left, 'job:a'), false);
  const joined = arrange(left, 'video', 0);
  assert.deepEqual(groupOf(joined, 'video').sort(), ['player', 'video']);
  assert.equal(contact(joined.get('player')!.box, joined.get('video')!.box), 'below');
});

test('taking out a window in the middle: its child takes its place, nothing is left where it was', () => {
  // video <- note (below) <- timer (below the note)
  const f = fam(
    mem('video', { x: 0, y: 0, width: 640, height: 360 }),
    mem('note:x', { x: 0, y: 360, width: 220, height: 170 }, { anchor: { to: 'video', side: 'below', align: 'start' } }),
    mem('timer:1', { x: 0, y: 530, width: 140, height: 60 }, { anchor: { to: 'note:x', side: 'below', align: 'start' } }),
  );
  const g = arrange(remove(f, 'note:x'), 'video', 0);
  assert.deepEqual(g.get('timer:1')!.anchor, { to: 'video', side: 'below', align: 'start' });
  assert.deepEqual(g.get('timer:1')!.box, { x: 0, y: 360, width: 140, height: 60 }, 'slid up into the gap');
  // the head itself taken out: its first child leads the rest
  const h = remove(f, 'video');
  assert.equal(rootOf(h, 'timer:1'), 'note:x');
});

test('rearrange: dragged near another open side, it goes there and the neighbours slide aside (no slot)', () => {
  const spread = arrange(sheet59(), 'video', 14);
  // drag the job from the video's right to under the player strip
  const without = remove(spread, 'job:a');
  // its middle 30 px under the player strip's bottom edge (the strip ends at 594 + 14 + 60 while spread)
  const drag = { x: 420, y: 594 + 14 + 60 + 30 - 150, width: 180, height: 300 };
  const slot = slotFor(without, groupOf(without, 'video'), drag);
  assert.deepEqual(slot, { target: 'player', side: 'below' });
  // far from every side: no place (on release it would be free, or spring back)
  assert.equal(slotFor(without, groupOf(without, 'video'), { x: 1400, y: 900, width: 180, height: 300 }), null);
  const r = rearranged(spread, 'job:a', slot!.target, slot!.side, 14);
  assert.equal(r.get('job:a')!.anchor!.to, 'player');
  // and joined back flush
  const flush = arrange(r, 'video', 0);
  assert.equal(contact(flush.get('job:a')!.box, flush.get('player')!.box), 'below');
  assert.equal(flush.get('job:a')!.box.width, 180, 'own size kept (reshape is F4)');
});

test('rearrange into a taken side: the one already there moves out one place and hangs on the newcomer', () => {
  const f = sheet59();
  const t = mem('timer:1', { x: 0, y: 0, width: 140, height: 60 });
  f.set(t.id, t);
  const g = insert(f, 'timer:1', 'video', 'right');
  assert.deepEqual(g.get('job:a')!.anchor, { to: 'timer:1', side: 'right', align: 'start' });
  const placed = layoutFrom(g, 'video');
  assert.equal(placed.get('timer:1')!.box.x, 1040);
  assert.equal(placed.get('job:a')!.box.x, 1040 + 140);
  assert.ok(makesLoop(g, 'video', 'job:a'), 'anchoring the head under its own child would loop');
  assert.equal(insert(g, 'video', 'job:a', 'right').get('video')!.anchor, undefined, 'refused');
});

test('leaving restores its own size; reroot keeps every box where it is', () => {
  const f = sheet59();
  f.get('job:a')!.box = { ...f.get('job:a')!.box, height: 394 };   // as if F4 had stretched it into a column
  assert.deepEqual(ownSize(f.get('job:a')!), { width: 180, height: 300 });
  const r = reroot(f, 'player');
  assert.equal(rootOf(r, 'video'), 'player');
  assert.equal(r.get('video')!.anchor!.side, 'above');
  const re = layoutFrom(r, 'player');
  for (const id of f.keys()) assert.deepEqual(re.get(id)!.box, f.get(id)!.box, id);
  assert.equal(biggest(f, groupOf(f, 'job:a')), 'video');
});

test('F3: a member that changes size re-places its children from their anchors', () => {
  const f = sheet59();
  const p = mem('note:n', { x: 400, y: 654, width: 220, height: 170 }, { anchor: { to: 'player', side: 'below', align: 'start' } });
  f.set(p.id, p);
  f.get('player')!.box.height = 28;     // the player shades to a strip
  const g = layoutFrom(f, 'video');
  assert.equal(g.get('note:n')!.box.y, 594 + 28, 'the note followed it up');
  // centre alignment holds through a width change
  assert.deepEqual(place({ x: 0, y: 0, width: 600, height: 300 }, { width: 140, height: 60 }, { to: 'v', side: 'below', align: 'center' }), { x: 230, y: 300 });
  assert.equal(childrenOf(g, 'video').length, 2);
});

test('springs settle where they were sent with no more than a whisker of overshoot; the shimmy is 1 px', () => {
  for (const m of [MOTION.spread, MOTION.join, MOTION.back]) {
    let s = { x: 0, v: 0 }, peak = 0, frames = 0;
    while (!settled(s, 14) && frames < 120) { s = springStep(s, 14, 1 / 60, m.response, m.damping); peak = Math.max(peak, s.x); frames++; }
    assert.ok(frames < 90, `settles in ${frames} frames`);
    assert.ok(peak < 14 * 1.1, `overshoot ${peak}`);
  }
  for (let t = 0; t < 2; t += 0.05) { const d = shimmy(t, 3); assert.equal(Math.abs(d.dx) + Math.abs(d.dy), 1); }
});
