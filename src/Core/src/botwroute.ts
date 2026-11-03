// Sheet 25 (approved, 2026-11-03): "Ask Aang: add the general store to my route". What he names becomes ONE goal in the
// Hyrule page's own shapes (botw-guide-mockups app/route.js addStop): a place, an item, a dish, an armour set or a quest.
// The page plans it into stops; Aang only says what went on and how many stops the route has now.
//
// His spoiler rules hold here as everywhere: a shrine or tower he has not found, a place he has not been, a quest he
// has not started is never named, so it is never a goal either. Plain look-ups, no model.
import { existsSync, readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import { nameScore } from './botw.ts';
import { parseGoal } from './botwengine.ts';

export type RouteGoal =
  | { kind: 'place'; at: [number, number]; name: string; icon?: string }
  | { kind: 'item'; id: string; n: number }
  | { kind: 'dish'; effect: string }
  | { kind: 'armor'; name: string; star?: number }
  | { kind: 'quest'; id: string };
/** What the guide needs from state.json (docs/BOTW-STATE.md). */
export interface RouteState {
  pos: { x: number; z: number };
  shrines: { found: string[]; done: string[] };
  towers: { found: string[] };
  places: string[];
  quests: { id: string; done: boolean }[];
}
export type Resolved = { goal: RouteGoal; name: string } | { why: string };

type Row = Record<string, any>;
/** The game's shop kinds (the map's own icons, sheet-09/game) and the words he uses for them. */
export const SHOP_WORDS: [string, RegExp, string][] = [
  ['ShopYorozu', /general (store|shop|goods)|\bgrocer/, 'General store'],
  ['ShopYadoya', /\binn\b/, 'Inn'],
  ['ShopBougu', /armou?r (shop|store)|clothes shop/, 'Armor shop'],
  ['ShopJewel', /jewel(le)?ry/, 'Jewelry shop'],
  ['ShopColor', /\bdye\b/, 'Dye shop'],
];
const DISH: Record<string, string> = { LifeMaxUp: 'Hearty', GutsRecover: 'Energizing', ExGutsMaxUp: 'Enduring', ResistHot: 'Chilly', ResistCold: 'Spicy',
  ResistElectric: 'Electro', Fireproof: 'Fireproof', MovingSpeed: 'Hasty', AttackUp: 'Mighty', DefenseUp: 'Tough', Quietness: 'Sneaky' };
const NEAR_PLACE = 350;   // a shop belongs to the place he visited within this many metres (the map's own rule: 350)

/** The Hyrule map's folder (the same one Samara serves), for the shops list that lives with the map. */
export function hyruleDir(env: NodeJS.ProcessEnv = process.env): string {
  return env.AANG_HYRULE_DIR || path.join(env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local'), 'Aang', 'Hyrule');
}
export function loadShops(dir = hyruleDir()): [string, number, number][] {
  const f = path.join(dir, 'sheet-07', 'shops.json');
  try { return existsSync(f) ? JSON.parse(readFileSync(f, 'utf8')) : []; } catch { return []; }
}

/**
 * His words to one route goal. "the general store" (the one by a place he has been, nearest where he saved; "the inn in
 * kakariko" picks that place's), "kakariko", "ta'loh naeg shrine" (found only), "5 hylian shrooms", "a hearty dish",
 * "flamebreaker armor", a quest he has started.
 */
export function resolveRouteGoal(db: DatabaseSync, st: RouteState, words: string, shops: [string, number, number][] = loadShops()): Resolved {
  const w = words.toLowerCase().replace(/\b(to|on|onto|off|from)\s+(my|the)\s+route\b/g, '').replace(/\s+/g, ' ').trim();
  if (!w) return { why: 'Say what to add.' };
  const visited = (db.prepare('SELECT flag, name, x, z FROM places WHERE name IS NOT NULL AND x IS NOT NULL').all() as Row[]).filter(p => st.places.includes(p.flag));

  // a kind of shop: the one by a place he has been (named, else nearest where he saved)
  const shop = SHOP_WORDS.find(([, re]) => re.test(w));
  if (shop) {
    const [kind, , label] = shop;
    const by = (x: number, z: number) => visited.map(p => ({ p, d: Math.hypot(p.x - x, p.z - z) })).filter(o => o.d < NEAR_PLACE).sort((a, b) => a.d - b.d)[0]?.p;
    const rest = w.replace(shop[1], '').replace(/\b(the|a|in|at|by|near|of|one)\b/g, '').replace(/\s+/g, ' ').trim();
    const named = rest ? visited.map(p => ({ p, s: nameScore(rest, p.name) })).filter(o => o.s >= 60).sort((a, b) => b.s - a.s)[0]?.p : undefined;
    const all = shops.filter(s => s[0] === kind).map(([, x, z]) => ({ x, z, place: by(x, z) })).filter(s => s.place && (!named || s.place.name === named.name))
      .sort((a, b) => Math.hypot(a.x - st.pos.x, a.z - st.pos.z) - Math.hypot(b.x - st.pos.x, b.z - st.pos.z));
    const s = all[0];
    if (!s) return { why: named ? `There is no ${label.toLowerCase()} by ${named.name}.` : `You have not been anywhere with a ${label.toLowerCase()} yet.` };
    const name = `${label} (${s.place!.name})`;
    return { goal: { kind: 'place', at: [s.x, s.z], name, icon: `sheet-09/game/${kind}.png` }, name };
  }

  // a place by name, only ones he has found: a place he has been, a shrine or tower he has found
  const found = new Set([...st.shrines.found, ...st.shrines.done]);
  const cand: { name: string; at: [number, number]; icon: string; s: number }[] = [];
  for (const p of visited) cand.push({ name: p.name, at: [p.x, p.z], icon: 'sheet-09/game/village.png', s: nameScore(w, p.name) });
  for (const r of db.prepare('SELECT id, name, x, z FROM shrines WHERE name IS NOT NULL').all() as Row[]) if (found.has(r.id))
    cand.push({ name: r.name, at: [r.x, r.z], icon: `sheet-09/game/${st.shrines.done.includes(r.id) ? 'shrine-done' : 'shrine-open'}.png`, s: nameScore(w.replace(/\bshrine\b/, ''), String(r.name).replace(/ Shrine$/, '')) });
  for (const r of db.prepare('SELECT id, name, x, z FROM towers WHERE name IS NOT NULL').all() as Row[]) if (st.towers.found.includes(r.id))
    cand.push({ name: r.name, at: [r.x, r.z], icon: 'sheet-09/game/tower.png', s: nameScore(w, r.name) });
  const place = cand.sort((a, b) => b.s - a.s)[0];
  if (place && place.s >= 85) return { goal: { kind: 'place', at: place.at, name: place.name, icon: place.icon }, name: place.name };

  // the planner's goals: an item, a dish, an armour set, a quest he has started
  // "5 hylian shrooms": the item list names one of each, so a plural tries its singular too
  const g = parseGoal(db, words) ?? parseGoal(db, words.replace(/\b(\w{3,}?)s\b/gi, '$1'));
  if (g?.kind === 'item') { const r = db.prepare('SELECT name FROM items WHERE id = ?').get(g.id) as Row | undefined; return { goal: { kind: 'item', id: g.id, n: Math.max(1, g.n) }, name: `${g.n > 1 ? g.n + ' ' : ''}${r?.name ?? g.id}` }; }
  if (g?.kind === 'dish') return { goal: { kind: 'dish', effect: g.effect }, name: DISH[g.effect] ? `a ${DISH[g.effect]} dish` : 'a dish' };
  if (g?.kind === 'armor') return { goal: { kind: 'armor', name: g.name, ...(g.star ? { star: g.star } : {}) }, name: g.name };
  if (g?.kind === 'quest') {
    if (!st.quests.some(q => q.id === g.id && !q.done)) return { why: 'That is not a quest you have going.' };
    const r = db.prepare('SELECT name FROM quests WHERE id = ?').get(g.id) as Row | undefined;
    return { goal: { kind: 'quest', id: g.id }, name: r?.name ?? 'that quest' };
  }
  if (g) return { why: 'That one is a plan, not a stop: ask me to plan it instead.' };
  if (place && place.s >= 70) return { goal: { kind: 'place', at: place.at, name: place.name, icon: place.icon }, name: place.name };
  return { why: `I could not find "${words}" among the places you have been or the things you can get.` };
}

/** Aang's one line once the map has it. */
export function routeLine(r: { name: string; remove?: boolean; state: 'planned' | 'queued' | 'off'; title?: string; stops?: number }): string {
  if (r.state === 'off') return 'Your Hyrule map is not reachable right now (Samara is closed).';
  if (r.state === 'queued') return r.remove ? `I'll take ${r.name} off your route when you open your Hyrule map.` : `I'll put ${r.name} on your route when you open your Hyrule map.`;
  const route = r.title || 'your route';
  if (r.stops === undefined) return r.remove ? `Asked your Hyrule map to take ${r.name} off ${route}.` : `Sent ${r.name} to ${route} on your Hyrule map.`;
  const n = r.stops;
  return r.remove ? `Took ${r.name} off ${route}: ${n} stop${n === 1 ? '' : 's'} left.` : `Added ${r.name} to ${route}: ${n} stop${n === 1 ? '' : 's'} now.`;
}
