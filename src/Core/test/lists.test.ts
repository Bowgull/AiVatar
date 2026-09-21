import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Grocery, MAX_ITEMS, cleanIngredient, looksLikeRecipe, parseListCommand, parseRecipe, splitItems } from '../src/lists.ts';

const tmp = () => mkdtempSync(path.join(os.tmpdir(), 'aang-lists-'));

test('items split the way he writes them', () => {
  assert.deepEqual(splitItems('milk, eggs and bread'), ['milk', 'eggs', 'bread']);
  assert.deepEqual(splitItems('- oat milk\n- 2 bananas\n* Milk'), ['oat milk', 'bananas', 'Milk']);
  assert.deepEqual(splitItems('a, A, b'), ['a', 'b'], 'no duplicates, ignoring case');
  assert.deepEqual(splitItems('x'.repeat(50) + ', ok'), ['ok'], 'too long to be an item');
});

test('only grocery words make a message a list command; everything else is left for Aang', () => {
  assert.deepEqual(parseListCommand('add milk and eggs to the grocery list'), { op: 'add', items: ['milk', 'eggs'] });
  assert.deepEqual(parseListCommand('Please add oat milk to my groceries.'), { op: 'add', items: ['oat milk'] });
  assert.deepEqual(parseListCommand('put bread on the shopping list'), { op: 'add', items: ['bread'] });
  assert.deepEqual(parseListCommand('groceries: rice, beans'), { op: 'add', items: ['rice', 'beans'] });
  assert.deepEqual(parseListCommand('remove milk from the grocery list'), { op: 'remove', items: ['milk'] });
  assert.deepEqual(parseListCommand('clear the grocery list'), { op: 'clear' });
  assert.deepEqual(parseListCommand('show my grocery list'), { op: 'show' });
  for (const no of ['add a task to my job hunt', 'put the kettle on', 'what is a good grocery store', 'add milk', 'clear my schedule', 'grocery']) assert.equal(parseListCommand(no), null, no);
});

test('the list: adds once, an asked-for-again item comes back unticked, ticking, clearing, and the size limit', () => {
  const g = new Grocery(tmp());
  assert.deepEqual(g.add(['milk', 'eggs']), { added: ['milk', 'eggs'], had: [], full: [] });
  const milk = g.s.items[0]!;
  g.toggle(milk.id);
  assert.equal(g.s.items[0]!.done, true);
  assert.deepEqual(g.add(['Milk']).had, ['Milk']);
  assert.equal(g.s.items[0]!.done, false, 'asking for it again means it is needed again');
  g.toggle(milk.id);
  assert.equal(g.clearChecked(), 1);
  assert.deepEqual(g.s.items.map(i => i.text), ['eggs']);
  assert.deepEqual(g.remove(['egg']), ['eggs'], 'a piece of the name is enough');
  const many = Array.from({ length: MAX_ITEMS + 3 }, (_, i) => 'item' + i);
  const r = g.add(many);
  assert.equal(r.added.length, MAX_ITEMS);
  assert.equal(r.full.length, 3);
  assert.equal(g.clearAll(), MAX_ITEMS);
});

test('the list survives a restart', () => {
  const dir = tmp();
  const a = new Grocery(dir); a.add(['tea', 'jam']); a.toggle(a.s.items[0]!.id); a.remember('m1', 'c1');
  const b = new Grocery(dir);
  assert.deepEqual(b.s.items.map(i => [i.text, i.done]), [['tea', true], ['jam', false]]);
  assert.equal(b.s.messageId, 'm1');
  assert.equal(b.add(['x']).added[0], 'x');
  assert.equal(b.s.items.at(-1)!.id, 3, 'ids keep counting up');
});

test('the message shows what is still needed first, ticked items last, and a clear button only when something is ticked', () => {
  const g = new Grocery(tmp());
  assert.match(g.render().content, /empty/);
  assert.equal(g.render().buttons.length, 0);
  g.add(['milk', 'eggs', 'jam']); g.toggle(g.s.items[0]!.id);
  const r = g.render();
  assert.match(r.content, /2 to get, 1 in the basket/);
  assert.deepEqual(r.buttons.map(b => b.label), ['eggs', 'jam', '✓ milk', 'Clear ticked']);
  assert.deepEqual(r.buttons.map(b => b.style), ['secondary', 'secondary', 'success', 'danger']);
  assert.ok(r.buttons.length <= 25);
  const full = new Grocery(tmp()); full.add(Array.from({ length: MAX_ITEMS }, (_, i) => 'i' + i)); full.toggle(1);
  assert.equal(full.render().buttons.length, 25, 'full list plus the clear button fits Discord\'s limit');
});

const RECIPE = `Lemon Pasta
Ingredients
- 200 g spaghetti
- 2 cloves garlic, minced
- 1 large lemon (zested)
- 3 tbsp olive oil

Instructions
Boil the pasta. Toss with everything else.`;

test('a recipe is recognised, titled, and its ingredients reduced to what to buy', () => {
  assert.equal(looksLikeRecipe(RECIPE), true);
  assert.equal(looksLikeRecipe('recipe: soup'), true);
  assert.equal(looksLikeRecipe('what is in a carbonara'), false);
  assert.equal(looksLikeRecipe('Ingredients'), false, 'too short to be a pasted recipe');
  const r = parseRecipe(RECIPE);
  assert.equal(r.title, 'Lemon Pasta');
  assert.deepEqual(r.ingredients, ['spaghetti', 'garlic', 'lemon', 'olive oil']);
  assert.equal(cleanIngredient('1/2 cup all-purpose flour, sifted'), 'all-purpose flour');
  assert.equal(cleanIngredient('2 cans of chickpeas'), 'chickpeas');
  assert.equal(parseRecipe('recipe: Toast\nbread and butter').title, 'Toast');
});

