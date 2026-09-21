// The grocery list and recipe filing, decided in plain code: no model is asked, so using them costs no quota.
// Pure apart from the small file the list is kept in.
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { writeFileAtomic } from './atomic.ts';

// ------------------------------------------------------------------ what he typed

export type ListCommand =
  | { op: 'add'; items: string[] }
  | { op: 'remove'; items: string[] }
  | { op: 'clear' }
  | { op: 'show' };

const LIST = String.raw`(?:the\s+|my\s+|our\s+)?(?:grocery|groceries|shopping)(?:\s+list)?`;
export const MAX_ITEMS = 24;                // Discord allows 25 buttons on a message; one is kept for "Clear checked"
const MAX_ITEM_LEN = 40;

/** "milk, eggs and bread" -> ["milk", "eggs", "bread"]. Tidy, no duplicates, none too long to fit a button. */
export function splitItems(raw: string): string[] {
  const seen = new Set<string>(), out: string[] = [];
  for (const part of raw.split(/\n|,|;|\band\b|&/i)) {
    const t = part.replace(/^[\s\-*•\d.)]+/, '').replace(/[\s.!]+$/, '').trim();
    if (!t || t.length > MAX_ITEM_LEN) continue;
    const k = t.toLowerCase();
    if (!seen.has(k)) { seen.add(k); out.push(t); }
  }
  return out;
}

/** Is this a grocery-list request? Only when the words grocery, groceries or shopping are there. */
export function parseListCommand(text: string): ListCommand | null {
  const t = text.trim();
  let m: RegExpExecArray | null;
  if ((m = new RegExp(String.raw`^(?:please\s+)?(?:add|put)\s+([\s\S]+?)\s+(?:to|on|onto)\s+${LIST}\s*[.!]?$`, 'i').exec(t))) { const items = splitItems(m[1]!); return items.length ? { op: 'add', items } : null; }
  if ((m = new RegExp(String.raw`^${LIST}\s*:\s*([\s\S]+)$`, 'i').exec(t))) { const items = splitItems(m[1]!); return items.length ? { op: 'add', items } : null; }
  if ((m = new RegExp(String.raw`^(?:please\s+)?(?:remove|delete|take|cross)\s+([\s\S]+?)\s+(?:from|off|off of)\s+${LIST}\s*[.!]?$`, 'i').exec(t))) { const items = splitItems(m[1]!); return items.length ? { op: 'remove', items } : null; }
  if (new RegExp(String.raw`^(?:please\s+)?(?:clear|empty|reset)\s+${LIST}\s*[.!]?$`, 'i').test(t)) return { op: 'clear' };
  if (new RegExp(String.raw`^(?:show|see|open|what'?s on|whats on)\s+${LIST}\s*[?.!]?$`, 'i').test(t)) return { op: 'show' };
  return null;
}

// ------------------------------------------------------------------ the list itself

export interface Item { id: number; text: string; done: boolean }
export interface ListState { items: Item[]; nextId: number; messageId?: string; channelId?: string }

export class Grocery {
  s: ListState = { items: [], nextId: 1 };
  private readonly file: string;
  constructor(dir: string) {
    this.file = path.join(dir, 'lists.json');
    try { if (existsSync(this.file)) { const r = JSON.parse(readFileSync(this.file, 'utf8')); if (Array.isArray(r?.grocery?.items)) this.s = { items: r.grocery.items, nextId: r.grocery.nextId ?? 1, messageId: r.grocery.messageId, channelId: r.grocery.channelId }; } }
    catch { this.s = { items: [], nextId: 1 }; }
  }
  private save() { try { writeFileAtomic(this.file, JSON.stringify({ grocery: this.s }, null, 2)); } catch { /* best effort */ } }

  /** Returns what was really added (already-there items are not added twice) and what did not fit. */
  add(items: string[]): { added: string[]; had: string[]; full: string[] } {
    const added: string[] = [], had: string[] = [], full: string[] = [];
    for (const text of items) {
      const hit = this.s.items.find(i => i.text.toLowerCase() === text.toLowerCase());
      if (hit) { if (hit.done) hit.done = false; had.push(text); continue; }     // asking again means it is needed again
      if (this.s.items.length >= MAX_ITEMS) { full.push(text); continue; }
      this.s.items.push({ id: this.s.nextId++, text, done: false }); added.push(text);
    }
    this.save();
    return { added, had, full };
  }
  remove(items: string[]): string[] {
    const gone: string[] = [];
    for (const text of items) {
      const i = this.s.items.findIndex(x => x.text.toLowerCase() === text.toLowerCase() || x.text.toLowerCase().includes(text.toLowerCase()));
      if (i >= 0) { gone.push(this.s.items[i]!.text); this.s.items.splice(i, 1); }
    }
    this.save();
    return gone;
  }
  toggle(id: number): Item | null {
    const it = this.s.items.find(i => i.id === id); if (!it) return null;
    it.done = !it.done; this.save(); return it;
  }
  clearChecked(): number { const n = this.s.items.filter(i => i.done).length; this.s.items = this.s.items.filter(i => !i.done); this.save(); return n; }
  clearAll(): number { const n = this.s.items.length; this.s.items = []; this.save(); return n; }
  remember(messageId: string, channelId: string) { this.s.messageId = messageId; this.s.channelId = channelId; this.save(); }
  get count(): number { return this.s.items.length; }

  /** The list as one Discord message: unchecked items first, each a button that ticks it. */
  render(): { content: string; buttons: { id: string; label: string; style: 'secondary' | 'success' | 'danger' }[] } {
    const open = this.s.items.filter(i => !i.done), done = this.s.items.filter(i => i.done);
    if (!this.s.items.length) return { content: 'Grocery list: empty. Say "add milk to the grocery list", or paste a recipe in #capture.', buttons: [] };
    const head = `Grocery list: ${open.length} to get${done.length ? `, ${done.length} in the basket` : ''}. Tap an item to tick it off.`;
    const buttons = [...open, ...done].map(i => ({ id: `list:g:${i.id}`, label: i.done ? `✓ ${i.text}` : i.text, style: (i.done ? 'success' : 'secondary') as 'secondary' | 'success' }));
    return { content: head, buttons: done.length ? [...buttons, { id: 'list:g:clear', label: 'Clear ticked', style: 'danger' as const }] : buttons };
  }
}

// ------------------------------------------------------------------ recipes

export interface Recipe { title: string; body: string; ingredients: string[] }

/** A pasted recipe is one that says so, or one that has an ingredients list. Everything else is a normal message. */
export function looksLikeRecipe(text: string): boolean {
  const t = text.trim();
  return /^recipe\b\s*:?/i.test(t) || (t.length > 80 && /^\W*ingredients\b/im.test(t));
}

export function parseRecipe(text: string): Recipe {
  const body = text.trim().replace(/^recipe\s*:\s*/i, '');
  const firstLine = body.split('\n').find(l => l.trim()) ?? 'Recipe';
  const title = firstLine.replace(/^#+\s*/, '').replace(/^ingredients\b.*$/i, 'Recipe').trim().slice(0, 90) || 'Recipe';
  const ingredients: string[] = [];
  const lines = body.split('\n');
  let inList = false;
  for (const line of lines) {
    if (/^\W*ingredients\b/i.test(line)) { inList = true; continue; }
    if (inList && (/^\W*(instructions?|directions?|method|steps?|preparation|notes?)\b/i.test(line))) break;
    if (!inList) continue;
    const t = line.replace(/^[\s\-*•\d.)]+/, '').trim();
    if (!t) { if (ingredients.length) break; continue; }
    if (t.length <= MAX_ITEM_LEN + 20) ingredients.push(cleanIngredient(t));
  }
  return { title, body, ingredients: ingredients.filter(Boolean).slice(0, MAX_ITEMS) };
}

/** "2 cups all-purpose flour, sifted" -> "all-purpose flour". Quantities are for the recipe; the shop needs the thing. */
export function cleanIngredient(line: string): string {
  let t = line.split(',')[0]!.replace(/\(.*?\)/g, '').trim();
  t = t.replace(/^[\d\s/.½¼¾⅓⅔-]+/, '');
  t = t.replace(/^(cups?|tbsps?|tablespoons?|tsps?|teaspoons?|g|grams?|kg|ml|l|litres?|liters?|oz|ounces?|lbs?|pounds?|cloves?|pinch(?:es)?|cans?|tins?|bunch(?:es)?|slices?|large|medium|small)\b\.?\s*(of\s+)?/i, '');
  return t.trim().slice(0, MAX_ITEM_LEN);
}
