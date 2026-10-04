// Where the pop-out sits and how big it is (step 6.3). His rule: "your size wins."
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CHROME, MIN, SNAP, firstTime, hold169, ontoScreen, pictureOf, preset, snapToEdges } from '../src/geometry.ts';

/** 16 by 9 has to hold for THE PICTURE, not the window: the window is the picture plus Aang's chrome. */
const pictureIs169 = (box: { width: number; height: number }) => {
  const p = pictureOf(box);
  return Math.abs(p.width / p.height - 16 / 9) < 0.02;
};

const SCREEN = { x: 0, y: 0, width: 1920, height: 1080 };

test('16 by 9 is held for the picture, whichever side he drags', () => {
  // The window is the picture plus the chrome, so a 1600-wide window is 900 + chrome tall.
  assert.deepEqual(hold169(1600, 400, 'width'), { width: 1600, height: 900 + CHROME });
  assert.ok(pictureIs169(hold169(1600, 400, 'width')));
  assert.ok(pictureIs169(hold169(500, 720 + CHROME, 'height')));
});

test('the picture never letterboxes, at any size he might drag to', () => {
  // The first run letterboxed because the WINDOW was 16 by 9 and the chrome ate into the picture.
  for (const w of [400, 640, 854, 1280, 1600, 1920]) {
    assert.ok(pictureIs169(hold169(w, 0, 'width')), `width ${w}`);
  }
  // And with a chrome height the page measured for itself, rather than the built-in guess.
  for (const chrome of [34, 100, 132, 180]) {
    const box = hold169(1280, 0, 'width', chrome);
    const p = pictureOf(box, chrome);
    assert.ok(Math.abs(p.width / p.height - 16 / 9) < 0.02, `chrome ${chrome}`);
  }
});

test('it never goes under what Twitch will play at', () => {
  const tiny = hold169(100, 100, 'width');
  assert.ok(tiny.width >= MIN.width && tiny.height >= MIN.height, JSON.stringify(tiny));
  // And the picture still has to be the right shape at the smallest size.
  assert.ok(pictureIs169(tiny), JSON.stringify(tiny));
});

test('the first time it opens on the right, clear of his health and action bars', () => {
  const b = firstTime(SCREEN);
  assert.ok(b.x > SCREEN.width / 2, 'on the right-hand half');
  assert.ok(b.y > 0 && b.y + b.height < SCREEN.height, 'not under the action bars');
  assert.ok(pictureIs169(b));
});

test('dropped near an edge it snaps flush', () => {
  const near = { x: 12, y: 1080 - 300 - 9, width: 640, height: 360 };
  const snapped = snapToEdges(near, SCREEN);
  assert.equal(snapped.x, 0, 'pulled to the left edge');

  const far = { x: 400, y: 300, width: 640, height: 360 };
  assert.deepEqual(snapToEdges(far, SCREEN), far, 'left alone in the middle');
});

test('a window remembered off-screen comes back within reach', () => {
  // Shadow changes resolution, so a place remembered on a bigger screen can be unreachable.
  const lost = { x: 3000, y: 2000, width: 640, height: 360 };
  const found = ontoScreen(lost, SCREEN);
  assert.ok(found.x < SCREEN.width, 'the bar can be grabbed');
  assert.ok(found.y < SCREEN.height);

  const offLeft = ontoScreen({ x: -600, y: 100, width: 640, height: 360 }, SCREEN);
  assert.ok(offLeft.x + offLeft.width > 0, 'enough of it is visible to take hold of');
});

test('a window too big for the screen is brought down to fit', () => {
  const huge = ontoScreen({ x: 0, y: 0, width: 4000, height: 2000 }, SCREEN);
  assert.ok(huge.width <= SCREEN.width && huge.height <= SCREEN.height);
});

test('a window that already fits is left exactly alone', () => {
  const fine = { x: 1200, y: 360, width: 640, height: 360 };
  assert.deepEqual(ontoScreen(fine, SCREEN), fine);
});

test('the presets are three sizes on the right, corner at the bottom', () => {
  const corner = preset('corner', SCREEN);
  const medium = preset('medium', SCREEN);
  const big = preset('big', SCREEN);
  assert.ok(corner.width < medium.width && medium.width < big.width);
  for (const b of [corner, medium, big]) {
    assert.ok(pictureIs169(b), 'every preset shows a 16 by 9 picture');
    assert.equal(b.x + b.width, SCREEN.width - SNAP, 'all on the right-hand side');
  }
  assert.ok(corner.y + corner.height > SCREEN.height * 0.7, 'the corner one sits low');
});
