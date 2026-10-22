// Sheet 60 v5 (his picks, 2026-10-22): a note's colour comes FROM its category. Plain = butter; To-do sky, Idea green,
// Reference stone, For Claude coral (Claude's colour); his own take the next colours in the order he made them. The
// sheet's papers exactly, and every pair clearly different (his note: "To-do and For Claude are just slightly similar").
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { catColour, allCats, setOwnCats, ownCats, PLAIN, BUILTIN, OWN } from '../pages/notecats.js';

test('plain and the four built-ins are the sheet\'s papers, any case', () => {
  assert.equal(catColour('').paper, '#f8dc8e');
  assert.equal(catColour(undefined).plain, true);
  assert.equal(catColour('   ').paper, PLAIN.paper);
  assert.equal(catColour('To-do').paper, '#84c9f8');
  assert.equal(catColour('to-do').paper, '#84c9f8');
  assert.equal(catColour('Idea').paper, '#a8dba5');
  assert.equal(catColour('Reference').paper, '#dbd3cb');
  assert.equal(catColour('For Claude').paper, '#e79c7b');
  assert.equal(catColour('For Claude').deep, '#c4572f');
});

test('his own categories take the next colours in the order he made them, and keep them', () => {
  setOwnCats(['Recipes', 'Raid', 'Garden']);
  assert.deepEqual(ownCats(), ['Recipes', 'Raid', 'Garden']);
  assert.equal(catColour('Recipes').paper, '#d49dbb');          // the sheet's mauve
  assert.equal(catColour('raid').paper, OWN[1].paper);
  assert.equal(catColour('Garden').paper, OWN[2].paper);
  // A name not saved yet (just typed) shows the colour it is about to get.
  assert.equal(catColour('Brand new').paper, OWN[3].paper);
  // The picker lists plain, the four, then his own, each with its colour.
  const all = allCats();
  assert.deepEqual(all.map((c: { cat: string }) => c.cat), ['', 'To-do', 'Idea', 'Reference', 'For Claude', 'Recipes', 'Raid', 'Garden']);
  assert.equal(all[5].paper, '#d49dbb');
  // Past the end of the palette it wraps rather than failing.
  setOwnCats(Array.from({ length: 9 }, (_, i) => 'C' + i));
  assert.equal(catColour('C8').paper, OWN[8 % OWN.length].paper);
  setOwnCats([]);
});

test('no two papers share a colour: every pair is clearly apart (CIELAB distance)', () => {
  const lab = (h: string) => {
    const n = parseInt(h.slice(1), 16), c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => { v /= 255; return v > 0.04045 ? ((v + 0.055) / 1.055) ** 2.4 : v / 12.92; });
    const x = (c[0]! * 0.4124 + c[1]! * 0.3576 + c[2]! * 0.1805) / 0.95047, y = c[0]! * 0.2126 + c[1]! * 0.7152 + c[2]! * 0.0722, z = (c[0]! * 0.0193 + c[1]! * 0.1192 + c[2]! * 0.9505) / 1.08883;
    const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
    return [116 * f(y) - 16, 500 * (f(x) - f(y)), 200 * (f(y) - f(z))];
  };
  const papers: [string, string][] = [['plain', PLAIN.paper], ...BUILTIN.map((b: { name: string; paper: string }) => [b.name, b.paper] as [string, string]), ['own 1', OWN[0].paper], ['own 2', OWN[1].paper]];
  for (let i = 0; i < papers.length; i++) for (let j = i + 1; j < papers.length; j++) {
    const a = lab(papers[i]![1]), b = lab(papers[j]![1]);
    const d = Math.hypot(a[0]! - b[0]!, a[1]! - b[1]!, a[2]! - b[2]!);
    assert.ok(d >= 25, `${papers[i]![0]} and ${papers[j]![0]} are too alike (${d.toFixed(1)})`);
  }
});
