// BG5 (docs/BOTW-GUIDE.md): a note pinned on the Hyrule map is a normal sticky note with a place, in the Zelda category
// (his next free colour), and the placed ones are handed to the map as notes.json (docs/BOTW-STATE.md).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Notes, cleanPlace, ZELDA_CAT } from '../src/notes.ts';
import { afterPlayNote, botwNoteSettings, botwNotesFile, rememberPin, rememberThis, writeBotwNotes } from '../src/botwnotes.ts';
import { nearNotes } from '../src/botwwatch.ts';
import type { BotwState } from '../src/botwsave.ts';

const tmp = () => mkdtempSync(path.join(os.tmpdir(), 'aang-botwnotes-'));
const st = { pos: { x: 1610, y: 116, z: 475, facing: 0, map: 'MainField', square: 'G-5', label: '' } } as unknown as BotwState;

test('a place: botw and two numbers inside Hyrule, rounded; anything else is no place', () => {
  assert.deepEqual(cleanPlace({ game: 'botw', x: 1610.016, z: '-475.04' }), { game: 'botw', x: 1610, z: -475 });
  for (const bad of [null, {}, { game: 'wow', x: 1, z: 1 }, { game: 'botw', x: 1 }, { game: 'botw', x: '', z: 3 },
    { game: 'botw', x: NaN, z: 1 }, { game: 'botw', x: 9000, z: 1 }, { game: 'botw', x: null, z: 1 }]) assert.equal(cleanPlace(bad), undefined);
});

test('pin: a Zelda note at the spot, Zelda takes his next own colour, editors never drop the place, it moves and comes off', () => {
  const d = tmp(), file = path.join(d, 'notes.json');
  const s = new Notes(file);
  s.addCat('Recipes');
  const n = s.pin({ title: 'Cave', text: 'Behind the waterfall\n<b>bring</b> fire', x: 100.04, z: -200 }, 10)!;
  assert.equal(n.cat, ZELDA_CAT);
  assert.deepEqual(n.place, { game: 'botw', x: 100, z: -200 });
  assert.match(n.html, /&lt;b&gt;bring/);
  assert.deepEqual(s.cats().own, ['Recipes', 'Zelda']);
  assert.equal(s.pin({ x: 'far', z: 0 }), null);
  // The board's editor saves it back without a place: the pin stays. A normal sticky note in every other way.
  s.save1({ id: n.id, title: 'Cave!', html: n.html, font: 'caveat', size: 'm', cat: 'Zelda' });
  const again = new Notes(file).list()[0]!;
  assert.equal(again.title, 'Cave!');
  assert.deepEqual(again.place, { game: 'botw', x: 100, z: -200 });
  assert.equal(s.pin({ id: n.id, x: 5, z: 6 })!.title, 'Cave!');
  assert.deepEqual(s.list()[0]!.place, { game: 'botw', x: 5, z: 6 });
  assert.equal(s.unpin(n.id)!.place, undefined);
  assert.equal(new Notes(file).list()[0]!.place, undefined);
  assert.equal(new Notes(file).list()[0]!.cat, 'Zelda');
});

test('notes.json: only placed notes, the shape the map reads, written on every save, not made until there is a pin', () => {
  const d = tmp(), bdir = path.join(d, 'botw'), out = path.join(bdir, 'notes.json');
  const s = new Notes(path.join(d, 'notes.json'), { onChange: (all, own) => writeBotwNotes(bdir, all, own, 1_000) });
  s.make('Shopping', '<div>Eggs</div>');
  assert.equal(existsSync(out), false);
  const n = s.pin({ title: 'Korok here', text: 'Rock ring\nTop of hill', x: 1650, z: 470 }, 2_000)!;
  const f = JSON.parse(readFileSync(out, 'utf8'));
  assert.deepEqual(f, { v: 1, writtenAt: new Date(1_000).toISOString(), own: ['Zelda'], notes: [{
    id: n.id, title: 'Korok here', cat: 'Zelda', lines: ['Rock ring', 'Top of hill'], html: '<div>Rock ring</div><div>Top of hill</div>',
    x: 1650, z: 470, updated: new Date(2_000).toISOString() }] });
  s.unpin(n.id);
  assert.deepEqual(JSON.parse(readFileSync(out, 'utf8')).notes, []);
  assert.equal(botwNotesFile(s.list(), []).notes.length, 0);
});

test('BG6 reads the real notes: a placed Zelda note near his save is found, a far one is not', () => {
  const s = new Notes(path.join(tmp(), 'notes.json'));
  s.pin({ title: 'Near', x: 1700, z: 475 });
  s.pin({ title: 'Far', x: -3000, z: 2000 });
  assert.deepEqual(nearNotes(s.list(), st).map(n => n.title), ['Near']);
  assert.equal(afterPlayNote(s.list(), st), 'Your note "Near" is near where you stopped.');
  assert.equal(afterPlayNote(s.list(), null), null);
});

test('the unconfirmed hooks: off unless note-settings.json says true; "remember this" and what it pins', () => {
  const d = tmp();
  assert.deepEqual(botwNoteSettings(d), { keepOffer: false, afterPlay: false });
  writeFileSync(path.join(d, 'note-settings.json'), JSON.stringify({ keepOffer: true, afterPlay: 'yes' }));
  assert.deepEqual(botwNoteSettings(d), { keepOffer: true, afterPlay: false });
  assert.equal(rememberThis('Aang, remember this: the cave behind the waterfall'), 'the cave behind the waterfall');
  assert.equal(rememberThis('remember this'), '');
  assert.equal(rememberThis('do you remember this song'), null);
  assert.deepEqual(rememberPin('', st), { title: 'Saved spot, G-5', text: 'Remembered here.', x: 1610, z: 475 });
});
