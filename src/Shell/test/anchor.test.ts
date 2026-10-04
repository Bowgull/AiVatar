// Step 6.10b: the pet and its windows move together.
//
// "Done when: nothing about where the bubble appears is different from today." Today the bubble is
// painted inside the pet's own window, so the thing to prove is that the arithmetic here puts it in the
// same place the C# painting does, and that it survives the cases that have broken placement before:
// display scaling, screen edges and a second monitor.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BUBBLE_FROM_SPRITE, bubbleAt, inputAt, moved, onScreen, readPetAt } from '../src/anchor.ts';
import type { PetAt } from '../src/anchor.ts';

/** A 1920x1080 screen with a taskbar, which is his: Shadow is 1920x1080 at scaleFactor 1. */
const SCREEN = { x: 0, y: 0, width: 1920, height: 1040 };
const at = (over: Partial<PetAt> = {}): PetAt => ({
  sprite: { x: 1400, y: 600, width: 224, height: 224 },
  screen: SCREEN, scale: 1, edge: 'none', peeking: false, ...over,
});

test('the bubble hangs off the sprite exactly where the C# paints it', () => {
  // BubbleView.cs:24 Right = 262, Bottom = 124; Dock.cs:19 SpriteX = 246, SpriteY = 86. Both are in the
  // space PetWindow.cs:953 translates into, so the offsets are 262-246 = 16 and 124-86 = 38.
  assert.equal(BUBBLE_FROM_SPRITE.right, 262 - 246);
  assert.equal(BUBBLE_FROM_SPRITE.bottom, 124 - 86);

  const b = bubbleAt(at(), { width: 256, height: 150 });
  assert.equal(b.x + b.width, 1400 + 16, 'its right edge sits 16px past his left edge');
  assert.equal(b.y + b.height, 600 + 38, 'its bottom sits 38px below his top');
});

test('it grows up and to the left, which is why he never gets pushed across the screen', () => {
  const small = bubbleAt(at(), { width: 256, height: 150 });
  const big = bubbleAt(at(), { width: 556, height: 530 });     // a conversation, ScrollbackExtra wide
  assert.equal(small.x + small.width, big.x + big.width, 'the right edge does not move');
  assert.equal(small.y + small.height, big.y + big.height, 'and neither does the bottom');
  assert.ok(big.x < small.x && big.y < small.y, 'it is the top-left that travels');
});

test('display scaling moves it with him, because the offsets are his pixels not the screen\'s', () => {
  // At 150% the sprite is reported bigger and in different screen pixels; the gap between him and the
  // bubble has to grow by the same amount or the tail stops touching him.
  const b = bubbleAt(at({ sprite: { x: 1400, y: 600, width: 336, height: 336 }, scale: 1.5 }), { width: 384, height: 225 });
  assert.equal(b.x + b.width, 1400 + 16 * 1.5);
  assert.equal(b.y + b.height, 600 + 38 * 1.5);
});

test('it is never pushed off the screen, even standing in a corner', () => {
  // Top-left: a bubble growing up and left from here would land at negative coordinates.
  const tl = bubbleAt(at({ sprite: { x: 4, y: 4, width: 224, height: 224 } }), { width: 400, height: 300 });
  assert.ok(tl.x >= SCREEN.x && tl.y >= SCREEN.y, JSON.stringify(tl));

  // Bottom-right, with a tall bubble.
  const br = bubbleAt(at({ sprite: { x: 1850, y: 980, width: 224, height: 224 } }), { width: 400, height: 300 });
  assert.ok(br.x + br.width <= SCREEN.x + SCREEN.width, JSON.stringify(br));
  assert.ok(br.y + br.height <= SCREEN.y + SCREEN.height, JSON.stringify(br));
});

test('a second monitor is just another set of coordinates, including a negative one', () => {
  // A display to the LEFT of the main one has negative x in Windows. Placement must stay on THAT screen
  // rather than snapping back to the primary.
  const left = { x: -1920, y: 0, width: 1920, height: 1040 };
  const b = bubbleAt(at({ sprite: { x: -500, y: 300, width: 224, height: 224 }, screen: left }), { width: 400, height: 300 });
  assert.ok(b.x >= left.x && b.x + b.width <= left.x + left.width, JSON.stringify(b));
  assert.equal(b.x + b.width, -500 + 16);
});

test('a window bigger than the screen loses its end, not its beginning', () => {
  // Pinned to the top-left rather than centred: text reads from there.
  const b = onScreen({ x: 500, y: 500, width: 3000, height: 2000 }, SCREEN);
  assert.equal(b.x, SCREEN.x);
  assert.equal(b.y, SCREEN.y);
});

test('the typing box sits under him, lined up with the bubble', () => {
  const box = inputAt(at(), { width: 300, height: 48 });
  assert.equal(box.x + box.width, 1400 + 16, 'same right edge as the bubble');
  assert.equal(box.y, 600 + 224 + 6, 'just below his feet');
});

test('the jitter of a held mouse does not move anything, but a real drag does', () => {
  const a = at();
  assert.equal(moved(null, a), true, 'the first one always counts');
  assert.equal(moved(a, a), false);
  assert.equal(moved(a, at({ sprite: { ...a.sprite, x: a.sprite.x + 1 } })), false, 'one pixel is noise');
  assert.equal(moved(a, at({ sprite: { ...a.sprite, x: a.sprite.x + 9 } })), true, 'nine is a drag');
  // At 150% the same screen distance is less movement to his eye, so the threshold scales with him.
  const hi = at({ scale: 1.5 });
  assert.equal(moved(hi, at({ scale: 1.5, sprite: { ...hi.sprite, x: hi.sprite.x + 2 } })), false);
});

test('anything that changes placement counts as a move, not just the position', () => {
  const a = at();
  assert.equal(moved(a, at({ scale: 1.5 })), true, 'display scaling');
  assert.equal(moved(a, at({ edge: 'left' })), true, 'docking');
  assert.equal(moved(a, at({ peeking: true })), true, 'tucking away');
  assert.equal(moved(a, at({ screen: { x: 1920, y: 0, width: 1920, height: 1040 } })), true, 'another monitor');
});

test('a message from the other program is read defensively, never trusted', () => {
  // This crosses a process boundary from C#. A missing field must give null, not a window at NaN,NaN,
  // which Electron accepts and which puts the bubble somewhere nobody can find it.
  assert.equal(readPetAt(null), null);
  assert.equal(readPetAt({ sprite: { x: 0, y: 0, width: 10, height: 10 } }), null, 'no screen');
  assert.equal(readPetAt({ sprite: { x: 'a', y: 0, width: 10, height: 10 }, screen: SCREEN }), null);
  assert.equal(readPetAt({ sprite: { x: 0, y: 0, width: 0, height: 10 }, screen: SCREEN }), null, 'zero size');
  assert.equal(readPetAt({ sprite: { x: NaN, y: 0, width: 10, height: 10 }, screen: SCREEN }), null, 'NaN');

  const ok = readPetAt({ sprite: { x: 1, y: 2, width: 3, height: 4 }, screen: SCREEN, scale: 'big', edge: 'sideways', peeking: 'yes' });
  assert.equal(ok?.scale, 1, 'a nonsense scale falls back to 1 rather than to zero');
  assert.equal(ok?.edge, 'none');
  assert.equal(ok?.peeking, false, 'only a real true is true');
});
