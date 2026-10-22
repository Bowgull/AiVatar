import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { parseNoteCommand, cleanHtml, plainOf, linesHtml, Notes } from '../src/notes.ts';

test('sheet 17: notes said loosely are understood without a model', () => {
  assert.deepEqual(parseNoteCommand('hey make a note for raid: flasks, food, repair'), { op: 'make', title: 'Raid', lines: ['Flasks', 'Food', 'Repair'] });
  assert.deepEqual(parseNoteCommand('make a note: call mom about the book'), { op: 'make', title: 'Call mom', lines: ['Call mom about the book'] });
  assert.deepEqual(parseNoteCommand('note: eggs, coffee and rice'), { op: 'make', title: 'Note', lines: ['Eggs', 'Coffee', 'Rice'] });
  assert.deepEqual(parseNoteCommand('add potions to my raid note'), { op: 'add', to: 'raid', lines: ['Potions'] });
  assert.deepEqual(parseNoteCommand('show my notes'), { op: 'show' });
  assert.deepEqual(parseNoteCommand('notes'), { op: 'show' });
});

test('sheet 17: things that are not notes stay with Aang', () => {
  assert.equal(parseNoteCommand('what did my notes say about the raid?'), null);
  assert.equal(parseNoteCommand('remember that I like tea'), null);
  assert.equal(parseNoteCommand('add milk to my grocery list'), null);
});

test('a note keeps only what the editor makes', () => {
  assert.equal(cleanHtml('<div class="cl done" onclick="x()">Flasks</div>'), '<div class="cl done">Flasks</div>');
  assert.equal(cleanHtml('<b>hi</b><script>alert(1)</script><img src=x onerror=alert(1)>'), '<b>hi</b>');
  assert.equal(cleanHtml('<a href="http://evil">click</a>'), 'click');
  assert.equal(cleanHtml('<span style="font-family:\'Caveat\';color:red;background:url(x)">x</span>'), "<span style=\"font-family:'Caveat'\">x</span>");
  assert.equal(cleanHtml('<span style="font-family: Comic Sans">x</span>'), '<span>x</span>');
  assert.equal(cleanHtml('<ul><li>one<li>two</ul>'), '<ul><li>one<li>two</li></li></ul>');
  assert.equal(cleanHtml('1 < 2 & 3 > 2'), '1 &lt; 2 &amp; 3 &gt; 2');
});

test('Aang reads notes as plain lines, ticks included', () => {
  assert.deepEqual(plainOf('<div class="cl done">Flasks</div><div class="cl">Repair</div>'), ['Flasks (done)', 'Repair']);
  assert.equal(linesHtml(['Flasks', 'Food']), '<div class="cl">Flasks</div><div class="cl">Food</div>');
  assert.equal(linesHtml(['Call mom']), '<div>Call mom</div>');
});

test('the store: make, find by name, add, edit, out on the screen, remove, and it survives a restart', () => {
  const file = path.join(mkdtempSync(path.join(os.tmpdir(), 'notes-')), 'n.json');
  const s = new Notes(file);
  const n = s.make('Raid night', linesHtml(['Flasks', 'Food']), 'To-do', 1000)!;
  assert.equal(s.find('raid')?.id, n.id);
  assert.match(s.append(n.id, ['Potions'], 2000)!.html, /<div class="cl">Potions<\/div>$/);
  const e = s.save1({ ...n, title: 'Raid', html: '<b>x</b><img src=y>', out: { x: 5, y: 6, w: 9999, h: 50, opacity: 3, pinned: true } }, 3000)!;
  assert.equal(e.html, '<b>x</b>');
  assert.deepEqual(e.out, { x: 5, y: 6, w: 900, h: 120, opacity: 1, pinned: true });
  assert.equal(new Notes(file).list()[0]!.title, 'Raid');
  assert.match(s.forAang(), /^- Raid: x$/);
  assert.equal(s.save1({ id: '../evil', title: 'x', html: '' }), null);
  assert.equal(s.remove(n.id), true);
  assert.equal(new Notes(file).list().length, 0);
});

test('sheet 62: Keep as a note makes a plain note with the link, and the link survives an edit', () => {
  const file = path.join(mkdtempSync(path.join(os.tmpdir(), 'aang-notes-keep-')), 'notes.json');
  const s = new Notes(file);
  const n = s.keep('Ragnaros knocks back everyone <b>in melee</b>\nat each submerge.', 'https://forever.warcraft.com/guides/molten-core', 'forever.warcraft.com')!;
  assert.ok(n);
  assert.equal(n.title, 'forever.warcraft.com');
  assert.equal(n.cat, undefined);
  assert.deepEqual(n.src, { url: 'https://forever.warcraft.com/guides/molten-core', site: 'forever.warcraft.com' });
  // The page's words are escaped, never markup; the link is its own line.
  assert.match(n.html, /&lt;b&gt;in melee&lt;\/b&gt;/);
  assert.deepEqual(plainOf(n.html).slice(-1), ['https://forever.warcraft.com/guides/molten-core']);
  // An edit from the note window (which does not send src back) keeps the link; a reload keeps it too.
  s.save1({ ...n, src: undefined, html: '<div>changed</div>' });
  assert.deepEqual(new Notes(file).list()[0]!.src, n.src);
  // No javascript: links, and nothing at all is no note.
  const bad = s.keep('words', 'javascript:alert(1)', 'x')!;
  assert.equal(bad.src, undefined);
  assert.equal(s.keep('', 'file:///C:/x', ''), null);
});
