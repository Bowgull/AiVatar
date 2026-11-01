// The Satchel's clips (sheet 116, 2026-11-01): his rules, without a clipboard. The lock here is a stand-in that flips
// every byte, so a test can tell that nothing reaches the disk as it was copied.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { KEEP_DAYS, SatchelStore, kindOfText, type Lock } from '../src/satchelstore.ts';

const flip = (b: Buffer) => Buffer.from(b.map((x) => x ^ 0xa5));
const lock: Lock = { on: true, seal: flip, open: flip };
const dirs: string[] = [];
const tmp = () => { const d = mkdtempSync(path.join(os.tmpdir(), 'aang-satchel-')); dirs.push(d); return d; };
after(() => { for (const d of dirs) rmSync(d, { recursive: true, force: true }); });
const PNG = Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex');

test('copied text is sorted into words, links, colours and commands', () => {
  assert.equal(kindOfText('Molten Core, Fri 8pm. Bring fire resist.'), 'text');
  assert.equal(kindOfText('https://forever.warcraft.com/patch-notes'), 'link');
  assert.equal(kindOfText('#A970FF'), 'color');
  assert.equal(kindOfText('git push origin main --follow-tags'), 'code');
  assert.equal(kindOfText('git is great\nand so on'), 'text', 'a command is one line');
});

test('the same thing copied again moves to the top instead of being kept twice', () => {
  let t = 1000; const s = new SatchelStore(tmp(), lock, () => t);
  const a = s.addText('first', ''); t += 10; s.addText('second', ''); t += 10; s.addText('first', '');
  assert.equal(s.list().length, 2);
  assert.equal(s.list()[0]!.id, a!.id, 'the copied-again one is on top');
});

test('pinned clips sit on top and survive the 7 days; the rest clear', () => {
  let t = 10_000_000; const dir = tmp(); const s = new SatchelStore(dir, lock, () => t);
  const keep = s.addText('keep me', ''); s.addText('let me go', '');
  s.pin(keep!.id);
  t += 1; s.addText('newest', '');
  assert.deepEqual(s.list().map((c) => c.text), ['keep me', 'newest', 'let me go']);
  t += (KEEP_DAYS + 1) * 86_400_000;
  assert.deepEqual(s.list().map((c) => c.text), ['keep me']);
  // and it is the same after a restart
  assert.deepEqual(new SatchelStore(dir, lock, () => t).list().map((c) => c.text), ['keep me']);
});

test('nothing is written down as it was copied: the list and the pictures are locked', () => {
  const dir = tmp(); const s = new SatchelStore(dir, lock);
  s.addText('my secret plan for raid night', ''); const p = s.addPic(PNG, 1, 1, '');
  const raw = readFileSync(path.join(dir, 'satchel.bin'));
  assert.ok(!raw.toString('latin1').includes('secret plan'), 'the list is not readable on disk');
  const pic = readdirSync(path.join(dir, 'satchel-pics'));
  assert.equal(pic.length, 1);
  assert.notDeepEqual(readFileSync(path.join(dir, 'satchel-pics', pic[0]!)), PNG, 'the picture is not readable on disk');
  assert.deepEqual(s.picBytes(p!), PNG, 'but it opens again');
});

test('binning a picture deletes its file; the same picture twice is one file', () => {
  const dir = tmp(); const s = new SatchelStore(dir, lock);
  const a = s.addPic(PNG, 1, 1, ''); const b = s.addPic(PNG, 1, 1, 'again');
  assert.equal(a!.id, b!.id); assert.equal(readdirSync(path.join(dir, 'satchel-pics')).length, 1);
  s.bin(a!.id);
  assert.equal(readdirSync(path.join(dir, 'satchel-pics')).length, 0);
  assert.equal(s.list().length, 0);
});
