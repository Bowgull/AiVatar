// Sheet 60 (2026-10-22): a note's colour comes FROM its category. Old notes carried their own colour (`col`); that is
// dropped on load (a sky note was never a to-do), every other part of the note is kept. His own categories are kept in
// the order he made them, because that order is which colour each one gets. And the noticed line: the note's name is
// in it (the link), "!" only on a due date.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Notes, cleanCat, BUILTIN_CATS, MAX_OWN_CATS } from '../src/notes.ts';
import { shapeLine } from '../src/notenotice.ts';

const dir = () => mkdtempSync(path.join(os.tmpdir(), 'aang-notecats-'));

test('migration: an old colour is dropped, the note becomes plain, everything else survives', () => {
  const d = dir(), file = path.join(d, 'notes.json');
  writeFileSync(file, JSON.stringify([
    { id: 'nold1', title: 'Raid', html: '<div class="cl">Flasks</div>', col: 'sky', font: 'caveat', size: '17', updated: 5, notice: false,
      out: { x: 10, y: 20, w: 240, h: 180, opacity: 0.8, pinned: true } },
    { id: 'nold2', title: 'Shop', html: '<div>Eggs</div>', col: 'rose', font: 'figtree', size: 'm', updated: 6 },
  ]));
  const s = new Notes(file);
  const [shop, raid] = s.list();
  assert.equal(raid!.id, 'nold1');
  assert.equal('col' in raid!, false);
  assert.equal(raid!.cat, undefined);
  assert.equal(raid!.font, 'caveat');
  assert.equal(raid!.size, '17');
  assert.equal(raid!.notice, false);
  assert.deepEqual(raid!.out, { x: 10, y: 20, w: 240, h: 180, opacity: 0.8, pinned: true });
  assert.equal(shop!.cat, undefined);
  // A save writes the migrated shape: no colour field on disk any more.
  s.save1({ ...shop!, html: '<div>Eggs, milk</div>' });
  assert.equal(/"col"/.test(readFileSync(file, 'utf8')), false);
});

test('categories: built-ins keep their spelling, his own are kept in the order he made them', () => {
  const d = dir(), file = path.join(d, 'notes.json');
  const s = new Notes(file);
  const a = s.make('A', '<div>x</div>', 'to-do')!;
  assert.equal(a.cat, 'To-do');
  const b = s.make('B', '<div>x</div>', 'Recipes')!;
  assert.equal(b.cat, 'Recipes');
  assert.equal(s.addCat('  Raid <b>stuff</b>  '), 'Raid bstuff/b');
  assert.equal(s.addCat('recipes'), 'Recipes');           // already his: no second one
  assert.equal(s.addCat(''), '');
  assert.deepEqual(s.cats(), { builtin: [...BUILTIN_CATS], own: ['Recipes', 'Raid bstuff/b'] });
  // Plain again: the category goes, the note stays.
  const plain = s.save1({ ...a, cat: '' })!;
  assert.equal(plain.cat, undefined);
  // Kept across a restart, in the same order.
  assert.ok(existsSync(path.join(d, 'note-cats.json')));
  assert.deepEqual(new Notes(file).cats().own, ['Recipes', 'Raid bstuff/b']);
  // A note's category the list does not know (a hand edit) joins his own on load.
  writeFileSync(file, JSON.stringify([{ id: 'nx1', title: 'X', html: '', font: 'figtree', size: 'm', cat: 'Garden', updated: 1 }]));
  assert.deepEqual(new Notes(file).cats().own, ['Recipes', 'Raid bstuff/b', 'Garden']);
});

test('categories: names are cleaned and his own stop at the cap', () => {
  assert.equal(cleanCat('#Work\u0007  stuff'), 'Work stuff');
  assert.equal(cleanCat('x'.repeat(40)).length, 24);
  const s = new Notes(path.join(dir(), 'notes.json'));
  for (let i = 0; i < MAX_OWN_CATS + 3; i++) s.addCat('Cat ' + i);
  assert.equal(s.cats().own.length, MAX_OWN_CATS);
  // Over the cap a note simply stays plain rather than inventing a colour.
  assert.equal(s.make('Z', '', 'One too many')!.cat, undefined);
});

test('the noticed line: the note name is the link, "!" only on a due date', () => {
  const base = { noteId: 'n1', line: 'Renew the passport (Fri)', kind: 'date' as const };
  assert.deepEqual(shapeLine({ ...base, say: 'Renew the passport is due tomorrow.' }, 'Before Friday'),
    { say: 'Renew the passport is due tomorrow!', link: 'Renew the passport' });
  assert.deepEqual(shapeLine({ ...base, kind: 'now', line: 'Network: Burrow-5G', say: 'Your Network note has the Wi-Fi name!' }, 'Network'),
    { say: 'Your Network note has the Wi-Fi name.', link: 'Network' });
  // Qwen did not name it: the name goes in front, so there is always a link.
  const r = shapeLine({ ...base, kind: 'todo', line: 'Call the bank', say: 'That one has waited a week' }, 'Errands');
  assert.equal(r.say, 'Your Errands note: that one has waited a week.');
  assert.equal(r.link, 'Errands');
  // An untitled note: its line is the name.
  const u = shapeLine({ ...base, kind: 'todo', line: 'Call the bank about the card', say: 'Still open after a week' }, 'Note');
  assert.equal(u.link, 'Call the bank');
  assert.equal(u.say, 'Call the bank: still open after a week.');
});
