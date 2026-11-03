// BG3, the Breath of the Wild guide tools (docs/BOTW-GUIDE.md): what a snip about his game is answered from.
//
// Hand-written look-ups, never model-written SQL, over two files in %LOCALAPPDATA%\Aang\botw (AANG_BOTW_DIR moves them):
// - botw.db: the game's own data (BG1, scripts/botw-pack.mjs), every row with a spoiler kind and level;
// - state.json: his save as the save watcher last read it (BG2, docs/BOTW-STATE.md). Nothing here opens a Cemu file.
//
// His spoiler rules (2026-11-02) are kept here as well as in the prompt, so a tool can never hand the model more than
// the rule allows: items, recipes, prices and drops come straight; where a shrine or Korok is comes up the hint ladder
// (warm, warmer, the spot); a story boss or a quest step he has not reached stays out. "Just tell me" (just_tell_me)
// lifts it for that one call.
import { DatabaseSync } from 'node:sqlite';
import { existsSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { isSmallTalk } from './route.ts';
import { DO_IT } from './instant.ts';

export const botwDir = (): string => process.env.AANG_BOTW_DIR || path.join(process.env.LOCALAPPDATA || '', 'Aang', 'botw');

/** The parts of state.json (docs/BOTW-STATE.md, v 1) these tools read. */
export interface BotwState {
  v: number; savedAt: string; slot: number; playtime: number;
  clock?: { day: number; hour: number };
  hearts: { max: number; now: number }; stamina: { max: number }; rupees: number;
  pos: { x: number; y: number; z: number; map: string; square: string; label: string };
  shrines: { found: string[]; done: string[] };
  towers: { found: string[]; active: string[] };
  koroks: { seeds: number; found: number[] };
  divineBeasts: string[];
  quests: { id: string; type: string; step: number; steps: number; done: boolean }[];
  places: string[]; dishes: string[];
  gear: { id: string; name: string; kind: string; n: number; equipped: boolean }[];
}

interface Spot { x: number; z: number; y?: number | null }
type Row = Record<string, any>;

// ---------------------------------------------------------------- the map's geometry
// objmap world units are about a metre; north is -z, east is +x; the map grid is A-J across, 1-8 down.
export function square(x: number, z: number): string {
  const col = Math.max(0, Math.min(9, Math.floor((x + 5000) / 1000))), row = Math.max(1, Math.min(8, Math.floor((z + 4000) / 1000) + 1));
  return 'ABCDEFGHIJ'[col] + '-' + row;
}
const POINTS = ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west'];
export function direction(from: Spot, to: Spot): string {
  const deg = (Math.atan2(to.x - from.x, -(to.z - from.z)) * 180 / Math.PI + 360) % 360;
  return POINTS[Math.round(deg / 45) % 8];
}
const dist = (a: Spot, b: Spot) => Math.hypot(a.x - b.x, a.z - b.z);
/** A distance as he would say it: exact enough for the spot, never more. */
export function sayDistance(m: number, rough = false): string {
  if (rough) return m < 400 ? 'close by' : m < 1500 ? `about ${Math.round(m / 500) * 0.5 || 0.5} km` : `about ${Math.round(m / 1000)} km`;
  return m < 60 ? 'right here' : m < 1000 ? `${Math.round(m / 10) * 10} m` : `${(m / 1000).toFixed(1)} km`;
}
const height = (from: Spot, to: Spot) => to.y == null || from.y == null ? '' : to.y - from.y > 40 ? `, ${Math.round(to.y - from.y)} m up` : from.y - to.y > 40 ? `, ${Math.round(from.y - to.y)} m below` : '';
const hearts = (quarters: number) => { const h = quarters / 4; return `${Number.isInteger(h) ? h : h.toFixed(2).replace(/0$/, '')} heart${h === 1 ? '' : 's'}`; };
const clean = (s: string | null | undefined) => (s || '').replace(/\{[\d.]+\}/g, '').replace(/\s+/g, ' ').trim();
const norm = (s: string) => s.toLowerCase().replace(/[‘’`]/g, "'").replace(/[^a-z0-9' ]+/g, ' ').replace(/\b(the|a|an)\b/g, ' ').replace(/\s+/g, ' ').trim();
function lev(a: string, b: string): number {
  if (Math.abs(a.length - b.length) > 3) return 9;
  const d = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) { let prev = d[0]; d[0] = i;
    for (let j = 1; j <= b.length; j++) { const t = d[j]; d[j] = Math.min(d[j] + 1, d[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1)); prev = t; } }
  return d[b.length];
}
/** How well a name answers what he typed: 100 exact ... 0 not at all. */
export function nameScore(q: string, name: string | null | undefined): number {
  if (!name) return 0;
  const a = norm(q), b = norm(name);
  if (!a || !b) return 0;
  if (a === b) return 100;
  if (b.startsWith(a)) return 85;
  if (b.includes(a)) return 70;
  const qw = a.split(' '), bw = b.split(' ');
  if (qw.every(w => bw.some(x => x === w || (w.length > 3 && x.startsWith(w))))) return 60;
  if (a.length >= 4 && lev(a, b) <= Math.max(1, Math.floor(a.length / 6))) return 55;
  // a name typed with a slip in one word ("hylain shroom")
  if (qw.length > 1 && qw.length === bw.length && qw.every((w, i) => w === bw[i] || (w.length > 3 && lev(w, bw[i]) <= (w.length > 4 ? 2 : 1)))) return 50;
  return 0;
}

// ---------------------------------------------------------------- cooking (the game's own numbers)
// The same rules as botw-guide-mockups/tools/cookengine.mjs: a recipe is a list of groups, each met by one KIND of
// ingredient (five of one thing count once); critters and monster parts only make elixirs; hearts = sum x LRMR;
// an effect needs every effect ingredient to agree, its level is potency x rate within the effect's limits.
const EFFECT_WORD: Record<string, [string, string]> = {
  LifeMaxUp: ['Hearty', 'extra hearts'], GutsRecover: ['Energizing', 'restores stamina'], ExGutsMaxUp: ['Enduring', 'extra stamina'],
  ResistHot: ['Chilly', 'heat resistance'], ResistCold: ['Spicy', 'cold resistance'], ResistElectric: ['Electro', 'shock resistance'],
  Fireproof: ['Fireproof', 'flame guard'], MovingSpeed: ['Hasty', 'speed'], AttackUp: ['Mighty', 'attack up'], DefenseUp: ['Tough', 'defence up'],
  Quietness: ['Sneaky', 'stealth'],
};
const WANT: [RegExp, string][] = [
  [/hearty|extra heart|yellow heart|max heart/i, 'LifeMaxUp'], [/enduring|extra stamina|more stamina/i, 'ExGutsMaxUp'],
  [/energi[sz]ing|stamina/i, 'GutsRecover'], [/fire ?proof|flame|burn|death mountain|eldin|lava/i, 'Fireproof'],
  [/chilly|heat|hot|desert|gerudo/i, 'ResistHot'], [/spicy|cold|snow|freez|hebra|tabantha/i, 'ResistCold'],
  [/electro|shock|electric|lightning|thunder/i, 'ResistElectric'], [/hasty|speed|fast|quick/i, 'MovingSpeed'],
  [/mighty|attack|damage|strength|strong/i, 'AttackUp'], [/tough|defen[cs]e|armou?r/i, 'DefenseUp'], [/sneaky|stealth|quiet|sneak/i, 'Quietness'],
];
interface CookItem { id: string; name: string; tags: string[]; hp: number; effect: string | null; potency: number; time: number; boost_time: number; boost_hp: number; boost_max: number; boost_stamina: number }
interface Recipe { n: number; dish: string; dish_name: string; single: number; hearts: number | null; groups: { actor?: string; tag?: string }[][] }
export interface Dish { name: string; ids: string[]; hp: number; effect: string | null; level?: number; time?: number }

class Kitchen {
  readonly items = new Map<string, CookItem>();
  readonly recipes: Recipe[];
  readonly effects = new Map<string, Row>();
  readonly lrmr: number;
  constructor(db: DatabaseSync) {
    for (const r of db.prepare('SELECT * FROM cook_items').all() as Row[]) this.items.set(r.id, { ...r, tags: JSON.parse(r.tags) } as CookItem);
    this.recipes = (db.prepare('SELECT * FROM recipes ORDER BY single, n').all() as Row[])
      .map(r => ({ ...r, groups: JSON.parse(r.needs).map((g: Row) => g.one_of) }) as Recipe);
    for (const r of db.prepare('SELECT * FROM cook_effects').all() as Row[]) this.effects.set(r.effect, r);
    this.lrmr = Number((db.prepare("SELECT value FROM meta WHERE key = 'cook_lrmr'").get() as Row | undefined)?.value ?? 2);
  }
  private meets(g: { actor?: string; tag?: string }[], id: string) { const it = this.items.get(id); return g.some(o => o.actor === id || (!!o.tag && !!it?.tags.includes(o.tag))); }
  private fits(r: Recipe, all: string[]) {
    const ids = [...new Set(all)], used = new Set<number>();
    const go = (i: number): boolean => {
      if (i === r.groups.length) return true;
      for (let s = 0; s < ids.length; s++) if (!used.has(s) && this.meets(r.groups[i], ids[s])) { used.add(s); if (go(i + 1)) return true; used.delete(s); }
      return false;
    };
    return go(0);
  }
  private static critter = (id: string) => /^(Animal_Insect_|Item_Enemy_|BeeHome$)/.test(id) && id !== 'Animal_Insect_F' && id !== 'BeeHome';
  private static failed = (dish: string) => /Item_Cook_O_0[12]/.test(dish);
  dishOf(ids: string[]): Recipe | null {
    const c = ids.filter(Kitchen.critter).length;
    if (c && c < ids.length) return null;
    for (const r of this.recipes) if (!r.single && this.fits(r, ids) && (!c || /Item_Cook_C_17/.test(r.dish))) return r;
    if (new Set(ids).size === 1) for (const r of this.recipes) if (r.single && this.fits(r, ids)) return r;
    return null;
  }
  stats(ids: string[], r: Recipe): Omit<Dish, 'name' | 'ids'> {
    const its = ids.map(id => this.items.get(id)!);
    const effs = [...new Set(its.map(i => i.effect).filter(Boolean))] as string[];
    let hp = 0, time = 0, pot = 0, bt = 0, bhp = 0, bmax = 0, bst = 0;
    for (const i of its) { hp += i.hp; time += i.time; bt += i.boost_time; bhp += i.boost_hp; bmax += i.boost_max; bst += i.boost_stamina; if (effs.length === 1 && i.effect === effs[0]) pot += i.potency; }
    const out: Omit<Dish, 'name' | 'ids'> = { hp: Math.min(120, hp * this.lrmr + bhp + (r.hearts && r.hearts > 0 ? r.hearts : 0)), effect: null };
    if (effs.length === 1) {
      const E = effs[0], c = this.effects.get(E);
      if (c) {
        out.effect = E;
        // the rates are float32 (1.4 is 1.39999998): without the nudge five Stamella Shrooms come out one step short
        out.level = Math.max(c.min, Math.min(c.max, Math.floor((pot + (E === 'LifeMaxUp' ? bmax : E === 'GutsRecover' || E === 'ExGutsMaxUp' ? bst : 0)) * c.rate + 1e-6)));
        if (c.base_time) out.time = Math.round(c.base_time + time + bt);
      }
    }
    return out;
  }
  /** The strongest version of recipe r with effect E (or none) from what he has. */
  private best(r: Recipe, E: string | null, pool: Record<string, number>): Dish | null {
    const left = { ...pool }, ids: string[] = [];
    const eff = (id: string) => this.items.get(id)?.effect ?? null, pot = (id: string) => this.items.get(id)?.potency ?? 0, hp = (id: string) => this.items.get(id)?.hp ?? 0;
    const ok = (id: string) => (left[id] || 0) > 0 && (eff(id) === null || eff(id) === E);
    const rank = (a: string, b: string) => ((+(eff(b) === E) * 100 + pot(b)) - (+(eff(a) === E) * 100 + pot(a))) || hp(b) - hp(a);
    for (const g of r.groups) {
      const c = Object.keys(left).filter(id => ok(id) && !ids.includes(id) && this.meets(g, id)).sort(rank)[0];
      if (!c) return null;
      ids.push(c); left[c]--;
    }
    if (E) for (const id of Object.keys(left).filter(id => eff(id) === E && left[id] > 0).sort(rank)) while (ids.length < 5 && left[id] > 0) { ids.push(id); left[id]--; }
    while (ids.length && this.dishOf(ids)?.dish !== r.dish) { if (ids.length <= r.groups.length) return null; ids.pop(); }
    if (E && !ids.some(id => eff(id) === E)) return null;
    const s = this.stats(ids, r);
    if (E && s.effect !== E) return null;
    return { name: r.dish_name, ids, ...s };
  }
  /** Every dish he can make from this bag, the best version of each (dish x effect). */
  book(pool: Record<string, number>): Dish[] {
    const out = new Map<string, Dish>();
    const score = (d: Dish) => (d.level || 0) * 1e6 + (d.time || 0) * 100 + d.hp;
    for (const r of this.recipes) {
      if (Kitchen.failed(r.dish) || !r.dish_name) continue;
      for (const E of [null, ...Object.keys(EFFECT_WORD)]) {
        const b = this.best(r, E, pool);
        if (!b) continue;
        const k = b.name + '|' + (b.effect || ''), o = out.get(k);
        if (!o || score(b) > score(o)) out.set(k, b);
      }
    }
    return [...out.values()];
  }
}

// ---------------------------------------------------------------- the guide

export class BotwGuide {
  private dbAt = 0; private dbh: DatabaseSync | null = null; private kitchen: Kitchen | null = null;
  private stateAt = 0; private st: BotwState | null = null;
  /** The hint ladder: how far up each thing he asked about has gone. Half an hour later it starts warm again. */
  private readonly ladder = new Map<string, { level: number; at: number }>();
  private readonly dir: string;
  private readonly now: () => number;
  constructor(dir = botwDir(), now = () => Date.now()) { this.dir = dir; this.now = now; }

  private db(): DatabaseSync | null {
    const f = path.join(this.dir, 'botw.db');
    if (!existsSync(f)) return null;
    const m = statSync(f).mtimeMs;
    if (!this.dbh || m !== this.dbAt) { try { this.dbh?.close(); } catch { /* already closed */ } this.dbh = new DatabaseSync(f, { readOnly: true }); this.dbAt = m; this.kitchen = null; }
    return this.dbh;
  }
  private state(): BotwState | null {
    const f = path.join(this.dir, 'state.json');
    if (!existsSync(f)) { this.st = null; return null; }
    const m = statSync(f).mtimeMs;
    if (m !== this.stateAt) { try { this.st = JSON.parse(readFileSync(f, 'utf8')); this.stateAt = m; } catch { return this.st; } }
    return this.st;
  }
  close(): void { try { this.dbh?.close(); } catch { /* fine */ } this.dbh = null; }

  private all(sql: string, ...a: any[]): Row[] { return this.db()!.prepare(sql).all(...a) as Row[]; }
  private one(sql: string, ...a: any[]): Row | undefined { return this.db()!.prepare(sql).get(...a) as Row | undefined; }

  private static NO_DB = 'The BotW data pack is not on this PC yet (botw.db): run scripts/botw-pack.mjs. Say you cannot look it up right now.';
  private static NO_SAVE = 'No save read yet: Aang reads his save after a play session ends (Cemu closed, or 30 minutes with no save). Say you do not know his game state yet; game facts still work.';

  /** When the save was read, so the model can say "as of when you last stopped". */
  private asOf(s: BotwState): string {
    const ago = Math.max(0, this.now() - Date.parse(s.savedAt)), h = Math.floor(ago / 3.6e6), m = Math.round(ago / 6e4);
    const days = Math.floor(h / 24);
    return `(From his save of ${days ? days + (days === 1 ? ' day' : ' days') : h >= 1 ? h + ' h' : m + ' min'} ago: anything since is not in it.)`;
  }
  private towerArea(p: Spot): string {
    const t = this.all('SELECT name, x, z FROM towers').sort((a, b) => dist(p, a as Spot) - dist(p, b as Spot))[0];
    return t ? `the ${t.name.replace(/ Tower$/, '')} area` : '';
  }
  /** The nearest named landmark (village, stable, a place label), optionally not the thing itself. */
  private landmark(p: Spot, not?: string | null): Row | undefined {
    return this.all("SELECT name, type, x, z FROM places WHERE name IS NOT NULL AND x IS NOT NULL")
      .filter(r => r.name !== not).sort((a, b) => dist(p, a as Spot) - dist(p, b as Spot))[0];
  }

  // ------------------------------------------------ botw_me
  me(): string {
    if (!this.db()) return BotwGuide.NO_DB;
    const s = this.state(); if (!s) return BotwGuide.NO_SAVE;
    const p = s.pos, lm = this.landmark(p);
    const where = p.map === 'MainField' || !p.map
      ? `${p.square || square(p.x, p.z)}, ${lm ? `${sayDistance(dist(p, lm as Spot))} ${direction(lm as Spot, p)} of ${lm.name}` : ''} in ${this.towerArea(p)}, ${Math.round(p.y)} m high`
      : `inside (${p.map}${p.label ? ', ' + this.labelName(p.label) : ''})`;
    const inShrine = /^Dungeon\d+$/.test(p.label) ? this.one('SELECT name FROM shrines WHERE id = ?', p.label)?.name : null;
    const eq = s.gear.filter(g => g.equipped).map(g => g.name);
    const kinds = new Map<string, number>();
    for (const g of s.gear) if (g.kind) kinds.set(g.kind, (kinds.get(g.kind) || 0) + 1);
    const bag = [...kinds].map(([k, n]) => `${n} ${k}`).join(', ');
    const h = Math.floor(s.playtime / 3600), m = Math.floor(s.playtime % 3600 / 60);
    return [
      `Where he saved: ${where}${inShrine ? ` (saved at ${inShrine})` : ''}.`,
      `Hearts ${s.hearts.now}/${s.hearts.max}, stamina ${s.stamina.max} wheel${s.stamina.max === 1 ? '' : 's'}, ${s.rupees} rupees. ${h} h ${m} min played${s.clock ? `, day ${s.clock.day} in game` : ''}.`,
      eq.length ? `Equipped: ${eq.join(', ')}.` : '',
      bag ? `Bag (kinds of thing): ${bag}.` : '',
      this.asOf(s),
    ].filter(Boolean).join('\n');
  }
  private labelName(label: string): string {
    return this.one('SELECT name FROM shrines WHERE id = ?', label)?.name ?? this.one('SELECT name FROM places WHERE msg_id = ? AND name IS NOT NULL', label)?.name ?? label;
  }

  // ------------------------------------------------ botw_progress
  progress(): string {
    if (!this.db()) return BotwGuide.NO_DB;
    const s = this.state(); if (!s) return BotwGuide.NO_SAVE;
    const base = new Set(this.all('SELECT id FROM shrines WHERE dlc = 0').map(r => r.id));
    const done = s.shrines.done.filter(id => base.has(id)).length, found = s.shrines.found.filter(id => base.has(id)).length;
    const dlcDone = s.shrines.done.filter(id => !base.has(id)).length;
    const qt = new Map(this.all('SELECT id, type, dlc, collab FROM quests').map(r => [r.id, r]));
    const doneOf = (type: string) => s.quests.filter(q => q.done && qt.get(q.id)?.type === type && !qt.get(q.id)?.dlc && !qt.get(q.id)?.collab).length;
    const total = (type: string) => (this.one('SELECT count(*) n FROM quests WHERE type = ? AND dlc = 0 AND collab = 0', type)!.n as number);
    const open = s.quests.filter(q => !q.done && qt.get(q.id)?.type !== 'minigame').length;
    return [
      `Shrines: ${done} of 120 done (${found} found)${dlcDone ? `, plus ${dlcDone} of 16 Champions' Ballad` : ''}.`,
      `Korok seeds: ${s.koroks.seeds} of 900. Towers: ${s.towers.active.length} of 15. Divine Beasts: ${s.divineBeasts.length} of 4.`,
      `Quests: main ${doneOf('main')} of ${total('main')}, side ${doneOf('side')} of ${total('side')}, shrine quests ${doneOf('shrine')} of ${total('shrine')}; ${open} on the go.`,
      `Hearts ${s.hearts.max}, stamina ${s.stamina.max} wheels. Dishes cooked: ${s.dishes.length} kind${s.dishes.length === 1 ? '' : 's'}.`,
      'Counts only: do not list what is left unless he asks.',
      this.asOf(s),
    ].join('\n');
  }

  // ------------------------------------------------ botw_lookup
  /** The best matches for a name across everything the pack knows. */
  find(q: string): { kind: string; row: Row; score: number }[] {
    const hits: { kind: string; row: Row; score: number }[] = [];
    const scan = (kind: string, rows: Row[], name = (r: Row) => r.name as string) => {
      for (const row of rows) { const score = Math.max(nameScore(q, name(row)), kind === 'shrine' ? nameScore(q, row.subtitle) - 5 : 0); if (score) hits.push({ kind, row, score }); }
    };
    scan('item', this.all('SELECT * FROM items'));
    scan('shrine', this.all('SELECT * FROM shrines'));
    scan('tower', this.all('SELECT * FROM towers'));
    // villages and stables before plain map labels, so "kakariko" is the village and not Kakariko Bridge
    scan('place', this.all("SELECT * FROM places WHERE name IS NOT NULL GROUP BY name").map(r => ({ ...r, _major: r.type && r.type !== 'loc' ? 1 : 0 })));
    scan('quest', this.all('SELECT * FROM quests WHERE name IS NOT NULL'));
    scan('enemy', this.all('SELECT * FROM enemies WHERE name IS NOT NULL'));
    scan('dish', this.all('SELECT * FROM recipes WHERE dish_name IS NOT NULL GROUP BY dish_name'), r => r.dish_name);
    scan('person', this.all('SELECT * FROM shops'));
    // the same name in several tables (Zora Armor, a place and a quest): items first, then the order above
    const ORDER = ['item', 'dish', 'enemy', 'shrine', 'tower', 'place', 'quest', 'person'];
    const seen = new Set<string>();
    const len = (h: { row: Row }) => String(h.row.name ?? h.row.dish_name ?? '').length - (h.row._major ? 100 : 0);
    return hits.sort((a, b) => b.score - a.score || ORDER.indexOf(a.kind) - ORDER.indexOf(b.kind) || len(a) - len(b))
      .filter(h => { const k = h.kind + ':' + (h.row.name ?? h.row.dish_name); if (seen.has(k)) return false; seen.add(k); return true; });
  }

  lookup(name: string, tell = false): string {
    if (!this.db()) return BotwGuide.NO_DB;
    const hits = this.find(name);
    if (!hits.length) return `Nothing in the game's data is called "${name}". Ask him what he means rather than guessing.`;
    let top = hits[0];
    // a dish is in items too (its name and text); the recipe is what he wants to know
    if (top.kind === 'item' && top.row.kind === 'dish') { const r = this.one('SELECT * FROM recipes WHERE dish = ? ORDER BY n LIMIT 1', top.row.id); if (r) top = { kind: 'dish', row: r, score: top.score }; }
    const also = hits.slice(1, 4).filter(h => h.score >= top.score - 15).map(h => `${h.row.name ?? h.row.dish_name} (${h.kind})`);
    const body = this.describe(top.kind, top.row, tell);
    const sameName = (h: { row: Row }) => (h.row.name ?? h.row.dish_name) === (top.row.name ?? top.row.dish_name);
    also.splice(0, also.length, ...hits.slice(1, 4).filter(h => h.score >= top.score - 15 && !sameName(h)).map(h => `${h.row.name ?? h.row.dish_name} (${h.kind})`));
    return body + (also.length ? `\nAlso called something like that: ${also.join(', ')}.` : '');
  }

  private bagCount(id: string): number | null {
    const s = this.state(); if (!s) return null;
    return s.gear.filter(g => g.id === id).reduce((n, g) => n + (/(one-handed|two-handed|spear|bow|shield)/.test(g.kind) ? 1 : g.n), 0);
  }
  private from(p: Spot): string {
    const s = this.state();
    return s ? `${sayDistance(dist(s.pos, p))} ${direction(s.pos, p)} of where he saved${height(s.pos, p)}` : '';
  }

  private describe(kind: string, r: Row, tell: boolean): string {
    const s = this.state();
    switch (kind) {
      case 'item': {
        // the Champions' powers and emblems are what the Divine Beasts give: story until he has them
        if (/HeroSoul|HeroSeal|MemorialPicture/.test(r.id) && !tell && !this.bagCount(r.id)) return `${r.name}: a story reward he has not got yet. Do not say what it does or how it is earned. If he wants it anyway, he can say "just tell me".`;
        const lines = [`${r.name} (${r.kind}): ${clean(r.descr)}`];
        const stats = [r.attack ? `attack ${r.attack}` : '', r.guard ? `guard ${r.guard}` : '', r.durability ? `durability ${r.durability}` : '',
          r.heal ? `heals ${hearts(r.heal)} raw` : '', r.effect === 'LifeMaxUp' ? `in a dish, ${hearts(r.effect_level)} extra each` : r.effect ? `effect ${EFFECT_WORD[r.effect]?.[1] ?? r.effect}${r.effect_level ? ' ' + r.effect_level : ''}` : '',
          r.buy > 0 ? `costs ${r.buy} rupees` : '', r.sell > 0 ? `sells for ${r.sell}` : ''].filter(Boolean);
        if (stats.length) lines.push(stats.join(', ') + '.');
        const sellers = this.all('SELECT name, x, z FROM shops WHERE items LIKE ?', `%"${r.id}"%`);
        if (sellers.length) lines.push('Sold by: ' + sellers.slice(0, 4).map(v => `${v.name}${v.x != null ? ` near ${this.landmark(v as Spot)?.name ?? square(v.x, v.z)}` : ''}`).join('; ') + '.');
        const droppers = this.all('SELECT name FROM enemies WHERE drops LIKE ? AND spoiler_level < 3', `%"${r.id}"%`).map(e => e.name);
        if (droppers.length) lines.push(`Dropped by: ${[...new Set(droppers)].slice(0, 6).join(', ')}.`);
        const up = this.all('SELECT star, defense, materials FROM armor_upgrades WHERE piece = ? AND materials IS NOT NULL ORDER BY star', r.id);
        if (up.length) lines.push('Great Fairy upgrades: ' + up.map(u => `★${u.star} (defence ${u.defense}): ${JSON.parse(u.materials).map((m: Row) => `${m.n} ${m.name}`).join(', ')}`).join('; ') + '.');
        const n = this.bagCount(r.id);
        if (n != null) lines.push(n ? `He has ${n} in his bag.` : 'He has none in his bag.');
        return lines.join('\n') + '\nItems are a straight answer: say it plainly.';
      }
      case 'dish': {
        const groups = (JSON.parse(r.needs) as Row[]).map(g => (g.one_of as Row[]).map(o => o.name ?? `any ${String(o.tag).replace(/^Cook/, '').toLowerCase()}`).join(' or '));
        const made = s?.dishes.includes(r.dish) ? ' He has cooked it before.' : '';
        return `${r.dish_name}: ${[...new Set(groups)].join(' + ')}.${r.hearts > 0 ? ` Adds ${hearts(r.hearts)} on top.` : ''}${made}\nRecipes are a straight answer. botw_cook says what he can make from his bag.`;
      }
      case 'enemy': {
        if (r.spoiler_level >= 3 && !tell) return `${r.name}: a story enemy he has not reached in the story yet. Do not describe it or where it is. If he wants it anyway, he can say "just tell me".`;
        const drops = r.drops ? [...new Set(Object.values(JSON.parse(r.drops) as Record<string, Row[]>).flat().map(d => d.name).filter(Boolean))] : [];
        return `${r.name}: ${r.life} health${r.attack ? `, hits for ${r.attack}` : ''}.${drops.length ? ` Drops: ${drops.join(', ')}.` : ''}\nHow to fight it is fair to explain plainly.`;
      }
      case 'shrine': {
        const found = s?.shrines.found.includes(r.id), done = s?.shrines.done.includes(r.id);
        const status = !s ? '' : done ? 'He has done it.' : found ? 'He has found it, not done it yet.' : 'He has not found it yet.';
        const where = found || tell ? ` It is in ${r.x != null ? square(r.x, r.z) : '?'}, ${this.from(r as Spot)}.` : ' Where it is: a hint only, via botw_hint (he has not found it).';
        return `${r.name}${r.subtitle ? `, "${r.subtitle}"` : ''}${r.dlc ? " (Champions' Ballad)" : ''}. ${status}${where}\nThe puzzle inside gets hints, never the solution, unless he says just tell me.`;
      }
      case 'tower': {
        const on = s?.towers.active.includes(r.id);
        return `${r.name}, in ${square(r.x, r.z)}, ${this.from(r as Spot)}. ${s ? on ? 'He has activated it.' : 'Not activated yet.' : ''}\nTowers can be seen from far off: where it is is a straight answer; how to climb it is a hint.`;
      }
      case 'place': {
        const been = r.flag && s?.places.includes(r.flag);
        return `${r.name}${r.type && r.type !== 'loc' ? ` (${({ Hatago: 'stable', Village: 'village', Castle: 'castle', CheckPoint: 'checkpoint' } as Row)[r.type] ?? r.type})` : ''}, in ${square(r.x, r.z)}, ${this.from(r as Spot)}.${r.flag && s ? been ? ' He has been there.' : ' He has not been there yet.' : ''}`;
      }
      case 'quest': {
        const q = s?.quests.find(x => x.id === r.id);
        const status = !s ? '' : !q ? 'He has not started it.' : q.done ? 'He has finished it.' : `He is on it (step ${q.step} of ${q.steps}).`;
        return `${r.name} (${r.type === 'shrine' ? 'shrine quest' : r.type + ' quest'})${r.giver_name && r.giver_name !== '???' ? `, from ${r.giver_name}` : ''}${r.location_name ? ` around ${r.location_name}` : ''}. ${status}\nQuests are story: for what to do next, botw_quest gives only his next step.`;
      }
      case 'person': {
        const items = (JSON.parse(r.items) as string[]).map(id => this.one('SELECT name FROM items WHERE id = ?', id)?.name).filter(Boolean);
        return `${r.name}${r.x != null ? `, near ${this.landmark(r as Spot)?.name ?? square(r.x, r.z)}` : ''}, sells: ${items.slice(0, 20).join(', ')}${items.length > 20 ? ` and ${items.length - 20} more` : ''}.`;
      }
    }
    return `${r.name}`;
  }

  // ------------------------------------------------ botw_nearby
  private left(s: BotwState) {
    const kfound = new Set(s.koroks.found);
    return {
      koroks: this.all('SELECT hash_id, korok_id, puzzle, x, y, z FROM koroks').filter(k => !kfound.has(k.hash_id)),
      shrinesUnfound: this.all('SELECT * FROM shrines').filter(r => !s.shrines.found.includes(r.id) && !s.shrines.done.includes(r.id)),
      shrinesUndone: this.all('SELECT * FROM shrines').filter(r => s.shrines.found.includes(r.id) && !s.shrines.done.includes(r.id)),
      towers: this.all('SELECT * FROM towers').filter(r => !s.towers.active.includes(r.id)),
    };
  }

  nearby(radius = 500, what: 'all' | 'koroks' | 'shrines' | 'towers' = 'all', spots = false): string {
    if (!this.db()) return BotwGuide.NO_DB;
    const s = this.state(); if (!s) return BotwGuide.NO_SAVE;
    if (s.pos.map && s.pos.map !== 'MainField') return `He saved inside (${s.pos.map}), not out on the map, so "near" means nothing yet. ${this.asOf(s)}`;
    radius = Math.max(50, Math.min(5000, radius || 500));
    const L = this.left(s), p = s.pos, inR = (r: Row) => r.x != null && dist(p, r as Spot) <= radius;
    const groups: [string, string, Row[]][] = [
      ['koroks', 'Korok seed', what === 'all' || what === 'koroks' ? L.koroks.filter(inR) : []],
      ['shrines', 'shrine he has not found', what === 'all' || what === 'shrines' ? L.shrinesUnfound.filter(inR) : []],
      ['shrines', 'shrine found but not done', what === 'all' || what === 'shrines' ? L.shrinesUndone.filter(inR) : []],
      ['towers', 'tower not activated', what === 'all' || what === 'towers' ? L.towers.filter(inR) : []],
    ];
    const said = groups.filter(g => g[2].length).map(([, label, rows]) => `${rows.length} ${rows.length === 1 ? label : plural(label)}`);
    if (!said.length) return `Nothing left within ${sayDistance(radius)} of where he saved${what === 'all' ? ' (Koroks, shrines, towers)' : ` (${what})`}. ${this.asOf(s)}`;
    const head = `Within ${sayDistance(radius)} of where he saved: ${said.join(', ')}.`;
    if (!spots) return `${head}\nCounts only. Give him the counts; spots only if he asks again (show_spots). ${this.asOf(s)}`;
    const list = groups.flatMap(([, label, rows]) => rows.map(r => ({ label, r, d: dist(p, r as Spot) }))).sort((a, b) => a.d - b.d).slice(0, 8)
      .map(({ label, r, d }) => `- ${label.startsWith('shrine found') ? r.name : label.startsWith('shrine') ? 'a shrine' : label.startsWith('tower') ? r.name : 'Korok'}: ${sayDistance(d)}${d < 60 ? '' : ' ' + direction(p, r as Spot)}${height(p, r as Spot)}`);
    return `${head}\nThe spots, nearest first (he asked for them):\n${list.join('\n')}\nNo puzzle types or solutions: those are botw_hint's. ${this.asOf(s)}`;
  }

  // ------------------------------------------------ botw_cook
  cook(want = ''): string {
    const db = this.db(); if (!db) return BotwGuide.NO_DB;
    const s = this.state(); if (!s) return BotwGuide.NO_SAVE;
    this.kitchen ??= new Kitchen(db);
    const K = this.kitchen;
    const pool: Record<string, number> = {};
    for (const g of s.gear) if (K.items.has(g.id) && g.n > 0) pool[g.id] = (pool[g.id] || 0) + g.n;
    if (!Object.keys(pool).length) return `No cooking ingredients in his bag. ${this.asOf(s)}`;
    const E = WANT.find(([re]) => re.test(want))?.[1] ?? null;
    const healing = /heal|health|hearts?\b|hp|restore/i.test(want) && !E;
    let dishes = K.book(pool);
    if (E) dishes = dishes.filter(d => d.effect === E);
    const named = want && !E && !healing ? dishes.filter(d => nameScore(want, d.name) >= 50 || nameScore(want, `${d.effect ? EFFECT_WORD[d.effect][0] + ' ' : ''}${d.name}`) >= 50) : [];
    if (named.length) dishes = named;
    dishes.sort((a, b) => E ? (b.level! - a.level!) || ((b.time || 0) - (a.time || 0)) || b.hp - a.hp : healing || !want ? b.hp - a.hp : 0);
    if (!dishes.length) return `From his bag he cannot make a ${E ? EFFECT_WORD[E][1] + ' ' : ''}dish${want && !E ? ` like "${want}"` : ''} right now. ${E ? `What gives ${EFFECT_WORD[E][1]}: ${this.all('SELECT name FROM cook_items WHERE effect = ? ORDER BY potency DESC LIMIT 5', E).map(r => r.name).join(', ')}.` : ''} ${this.asOf(s)}`;
    const name = (id: string) => K.items.get(id)!.name;
    const say = (d: Dish) => {
      const counts = new Map<string, number>(); for (const id of d.ids) counts.set(id, (counts.get(id) || 0) + 1);
      const ings = [...counts].map(([id, n]) => `${name(id)}${n > 1 ? ' x' + n : ''}`).join(', ');
      const eff = d.effect === 'LifeMaxUp' ? ` + ${hearts(d.level!)} extra` : d.effect ? `, ${EFFECT_WORD[d.effect][1]}${d.effect === 'GutsRecover' ? ` ${(d.level! / 5).toFixed(1).replace(/\.0$/, '')} wheel${d.level === 5 ? '' : 's'}` : ` level ${d.level}`}${d.time ? ` for ${Math.floor(d.time / 60)}:${String(d.time % 60).padStart(2, '0')}` : ''}` : '';
      return `- ${d.effect ? EFFECT_WORD[d.effect][0] + ' ' : ''}${d.name}: ${ings} -> ${d.effect === 'LifeMaxUp' ? 'full heal' : hearts(d.hp)}${eff}`;
    };
    return `From his bag (the game's own cooking numbers), best first:\n${dishes.slice(0, 6).map(say).join('\n')}${dishes.length > 6 ? `\n(${dishes.length - 6} more)` : ''}\nRecipes are a straight answer. ${this.asOf(s)}`;
  }

  // ------------------------------------------------ botw_quest
  quest(name = '', tell = false): string {
    if (!this.db()) return BotwGuide.NO_DB;
    const s = this.state(); if (!s) return BotwGuide.NO_SAVE;
    const info = (id: string) => this.one('SELECT * FROM quests WHERE id = ?', id);
    if (!name.trim()) {
      const open = s.quests.filter(q => !q.done).map(q => ({ q, r: info(q.id) })).filter(x => x.r && x.r.type !== 'minigame' && x.r.name);
      if (!open.length) return `No quests on the go. ${this.asOf(s)}`;
      const order = ['main', 'side', 'shrine'];
      // The DLC drops a dozen "EX" quests into his log by itself, and the Xenoblade tie-in is not one he chose: those
      // go last, so his own quests lead and the list stays short.
      const auto = (r: Row) => r.dlc || r.collab ? 1 : 0;
      open.sort((a, b) => auto(a.r!) - auto(b.r!) || order.indexOf(a.r!.type) - order.indexOf(b.r!.type));
      const shown = open.slice(0, 8), more = open.length - shown.length;
      return `On the go: ${shown.map(x => `${x.r!.name} (${x.r!.type})`).join(', ')}${more ? `, and ${more} more (mostly the DLC's EX quests)` : ''}.\nAsk botw_quest with one name for its next step. ${this.asOf(s)}`;
    }
    const hit = this.all('SELECT * FROM quests WHERE name IS NOT NULL').map(r => ({ r, sc: nameScore(name, r.name) + (s.quests.some(q => q.id === r.id) ? 5 : 0) }))
      .filter(x => x.sc > 5).sort((a, b) => b.sc - a.sc)[0]?.r;
    if (!hit) return `No quest called "${name}". Ask him which one he means.`;
    const q = s.quests.find(x => x.id === hit.id);
    if (!q) return `${hit.name}: he has not started it.${hit.giver_name && hit.giver_name !== '???' ? ` It starts with ${hit.giver_name}` : ' It starts'}${hit.location_name ? ` around ${hit.location_name}` : ''}. ${this.asOf(s)}`;
    if (q.done) return `${hit.name}: he finished it. ${this.asOf(s)}`;
    // His log shows the text of the last step he reached; the step after that is what he is working towards, and its
    // text would tell him how it ends, so it never leaves here.
    const now = this.one('SELECT * FROM quest_steps WHERE quest_id = ? AND n < ? AND saved = 1 AND text IS NOT NULL ORDER BY n DESC LIMIT 1', hit.id, Math.max(1, q.step))
      ?? this.one('SELECT * FROM quest_steps WHERE quest_id = ? AND n = 0', hit.id);
    const where = now?.x != null && now.z != null
      ? tell ? ` The marker: ${square(now.x, now.z)}, ${this.from(now as Spot)}.` : ` It points ${direction(s.pos, now as Spot)} of where he saved, ${sayDistance(dist(s.pos, now as Spot), true)} (warm hint; the spot only if he asks again or says just tell me).`
      : '';
    return `${hit.name}, his next step (what his quest log says now): ${clean(now?.text) || 'no log text'}${where}\nOnly this step: never what comes after it. ${this.asOf(s)}`;
  }

  // ------------------------------------------------ botw_hint
  /** What he means by the thing he wants a hint for: a named shrine, tower, place or quest, or "nearest Korok/shrine". */
  private target(q: string, s: BotwState): { key: string; label: string; spot: Spot | null; kind: string; row: Row } | null {
    const L = this.left(s), p = s.pos, near = (rows: Row[]) => rows.filter(r => r.x != null).sort((a, b) => dist(p, a as Spot) - dist(p, b as Spot))[0];
    if (/korok|seed/i.test(q) && !/shrine|tower/i.test(q)) { const k = near(L.koroks); return k ? { key: 'korok:' + k.hash_id, label: 'the nearest Korok', spot: k as Spot, kind: 'korok', row: k } : null; }
    if (/^(the )?(nearest|closest|next)? ?shrine|shrine (near|close)/i.test(q.trim()) || /^shrines?$/i.test(q.trim())) {
      const r = near([...L.shrinesUndone, ...L.shrinesUnfound]); return r ? { key: 'shrine:' + r.id, label: 'the nearest shrine left', spot: r as Spot, kind: 'shrine', row: r } : null;
    }
    if (/^(the )?(nearest|closest|next)? ?tower/i.test(q.trim())) { const r = near(L.towers); return r ? { key: 'tower:' + r.id, label: r.name, spot: r as Spot, kind: 'tower', row: r } : null; }
    const hit = this.find(q).find(h => ['shrine', 'tower', 'place', 'quest'].includes(h.kind));
    if (!hit) return null;
    const r = hit.row;
    if (hit.kind === 'quest') {
      const qs = s.quests.find(x => x.id === r.id);
      const st = qs && this.one('SELECT * FROM quest_steps WHERE quest_id = ? AND n < ? AND saved = 1 AND x IS NOT NULL ORDER BY n DESC LIMIT 1', r.id, Math.max(1, qs.step));
      return { key: 'quest:' + r.id, label: r.name, spot: st ? st as Spot : null, kind: 'quest', row: r };
    }
    return { key: hit.kind + ':' + (r.id ?? r.n), label: r.name, spot: r.x != null ? r as Spot : null, kind: hit.kind, row: r };
  }

  hint(what: string, level?: number, tell = false): string {
    if (!this.db()) return BotwGuide.NO_DB;
    const s = this.state(); if (!s) return BotwGuide.NO_SAVE;
    const t = this.target(what, s);
    if (!t) return `Nothing to hint at called "${what}" (shrines, Koroks, towers, places and quests have hints). If it is a puzzle in front of him, hint from what you see: what to look at, never the move.`;
    const prev = this.ladder.get(t.key), fresh = prev && this.now() - prev.at < 30 * 60_000;
    const lv = tell ? 3 : Math.max(1, Math.min(3, level ?? (fresh ? prev!.level + 1 : 1)));
    this.ladder.set(t.key, { level: Math.max(lv, fresh ? prev!.level : 0), at: this.now() });
    const p = s.pos, spot = t.spot;
    const rung = ['', 'warm', 'warmer', 'the spot'][lv];
    if (!spot) return `${t.label}: no place on the map to point at${t.kind === 'quest' ? ' (his log has no marker for this step)' : ''}. Give a nudge from what he knows, not the answer.`;
    const d = dist(p, spot), lm = this.landmark(spot, t.row.name);
    let out: string;
    if (lv === 1) out = `${sayDistance(d, true)} ${direction(p, spot)} of where he saved, in ${this.towerArea(spot)}.`;
    else if (lv === 2) out = `${lm ? `Near ${lm.name}, ${sayDistance(dist(lm as Spot, spot), true) === 'close by' ? 'close by it' : sayDistance(dist(lm as Spot, spot), true) + ' ' + direction(lm as Spot, spot) + ' of it'}` : `In ${this.towerArea(spot)}`}${height(p, spot)}.${t.kind === 'korok' && t.row.puzzle ? ` The Korok's puzzle: ${t.row.puzzle}.` : ''}`;
    else out = `${square(spot.x, spot.z)}: ${sayDistance(d)} ${direction(p, spot)} of where he saved${height(p, spot)}${lm ? `, by ${lm.name}` : ''}.${t.kind === 'korok' && t.row.puzzle ? ` Puzzle: ${t.row.puzzle}.` : ''}${t.kind === 'shrine' ? ` It is ${t.row.name}.` : ''}`;
    const unnamed = t.kind === 'shrine' && !s.shrines.found.includes(t.row.id) && lv < 3;
    return `Hint for ${unnamed ? 'a shrine he has not found' : t.label} (rung ${lv} of 3, ${rung}): ${out}\nSay only this rung, in your own words.${lv < 3 ? ' He gets the next rung by asking again.' : ''}${unnamed ? ' Do not name the shrine.' : ''} ${this.asOf(s)}`;
  }
}

const plural = (label: string) => label.replace(/^(\S+)/, w => w === 'Korok' ? 'Korok' : w + 's').replace(/^Korok seed/, 'Korok seeds');

let guide: BotwGuide | null = null;
export const botwGuide = (): BotwGuide => guide ??= new BotwGuide();

/** BotW words: a question with one of these goes to the guide lanes even when it sounds like a request ("find me..."). */
const BOTW_WORDS = /\b(shrines?|korok|seeds?|towers?|quests?|cook|recipes?|dish|elixir|hearts?|stamina|rupees?|bag|inventory|armou?r|weapons?|bows?|shields?|hint|where am i|progress|how many|divine beast|great fairy|stable|hyrule|zelda|botw)\b/i;

/**
 * Which Claude lane answers while Cemu runs (his rule: the local model only does small talk while a game holds the
 * card). A BotW question in words goes to Haiku (Quick, which carries the botw tools); one with a snip needs eyes and
 * goes to Sonnet (Smart). Small talk stays local; anything else he asks Aang to DO keeps today's routing.
 */
export function botwLane(words: string, attached: boolean, game: { running: boolean; which: string | null }): 'quick' | 'smart' | null {
  if (!game.running || !/^cemu$/i.test(game.which ?? '')) return null;
  const t = words.trim();
  if (attached) return 'smart';
  if (!t || isSmallTalk(t)) return null;
  if (DO_IT.test(t) && !BOTW_WORDS.test(t)) return null;
  return 'quick';
}
