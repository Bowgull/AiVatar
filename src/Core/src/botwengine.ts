// E3 + E4 (docs/BOTW-ENGINE.md): the BotW engine. A goal he names becomes a tree of needs (E3), each need is matched
// to its sources minus what his save already has, and the planner (E4) picks sources and orders the stops with the
// hours each one is open, from where he saved. Pure look-ups over botw.db (E1) and state.json (E2); nothing here opens
// a Cemu file. The map walks the stops with the route engine (botw-guide-mockups/tools/route/engine.mjs): plan()
// hands it routeGoals in that engine's own shape ({ kind: 'item', id, n } / { kind: 'place', name, at }), so gathering
// and farming spots (which live with the map, not in botw.db) are found there.
//
// Time: the game's clock runs 1 game minute per real second (a day is 24 real minutes). Walking is counted at 5 m a
// second with warps to his finished shrines and climbed towers (a warp costs as much as 160 m of walking, as the route
// engine counts it). A stop that is closed when he gets there waits for it to open (or "sleep at an inn").
import type { DatabaseSync } from 'node:sqlite';
import { nameScore, sayDistance, direction, square } from './botw.ts';

type Row = Record<string, any>;
export interface Spot { x: number; z: number }
/** The parts of state.json (docs/BOTW-STATE.md) the engine reads; E2 fields may be missing in an older state. */
export interface EngineState {
  clock?: { hour: number };
  hearts: { max: number }; stamina: { max: number }; rupees: number;
  pos: { x: number; z: number };
  shrines: { found: string[]; done: string[] };
  towers: { active: string[] };
  quests: { id: string; step: number; steps: number; done: boolean }[];
  gear: { id: string; n: number }[];
  chests?: { opened: number[] };
  people?: { met: string[]; flags?: string[] };
  greatFairies?: number[];        // great_fairies.n he has opened (E2)
}

export type Goal =
  | { kind: 'armor'; name: string; star?: number }          // an armour set (or one piece) by name, upgraded to `star`
  | { kind: 'item'; id: string; n: number }
  | { kind: 'shrines'; near: string; radius?: number }       // every shrine near a place, finished
  | { kind: 'dish'; effect: string }                         // a dish with this effect (LifeMaxUp = Hearty)
  | { kind: 'quest'; id: string }                            // his next step in a quest
  | { kind: 'hearts' | 'stamina'; n: number };

export interface Source {
  kind: 'shop' | 'chest' | 'enemy' | 'shrine' | 'statue' | 'fairy' | 'step' | 'bag';
  id: string; name: string; x?: number; z?: number;
  once: boolean;                 // gone once taken (a chest, a shrine); a shop or an enemy comes back
  hours?: [number, number][];    // when it can be done, game hours; missing = any time
  price?: number;                // rupees each, for a shop
  note?: string;
}
export interface Need { what: string; id?: string; n: number; have: number; sources: Source[]; after?: string[] }  // after: needs to finish first
export interface GoalTree { goal: Goal; title: string; needs: Need[]; gates: string[]; done: boolean }

// ---------------------------------------------------------------- E3: goals -> needs

const json = <T>(s: string | null | undefined, d: T): T => { try { return s ? JSON.parse(s) as T : d; } catch { return d; } };
const dist = (a: Spot, b: Spot) => Math.hypot(a.x - b.x, a.z - b.z);
/** Great Fairy upgrade tiers: level k needs k fountains open (the game's rule), each fountain's offering in rupees. */
export const FAIRY_TIER_COST = [100, 500, 1000, 10000];
const DISH_WORD: Record<string, string> = { LifeMaxUp: 'Hearty', GutsRecover: 'Energizing', ExGutsMaxUp: 'Enduring', ResistHot: 'Chilly', ResistCold: 'Spicy',
  ResistElectric: 'Electro', Fireproof: 'Fireproof', MovingSpeed: 'Hasty', AttackUp: 'Mighty', DefenseUp: 'Tough', Quietness: 'Sneaky' };

export class Engine {
  private readonly db: DatabaseSync; private readonly st: EngineState;
  constructor(db: DatabaseSync, st: EngineState) { this.db = db; this.st = st; }
  private all(sql: string, ...a: any[]): Row[] { return this.db.prepare(sql).all(...a) as Row[]; }
  private one(sql: string, ...a: any[]): Row | undefined { return this.db.prepare(sql).get(...a) as Row | undefined; }
  // gear n is a count, except weapons, bows and shields (durability x100) and armour (0): each of those slots is one owned
  private bag(id: string): number { return this.st.gear.filter(g => g.id === id).reduce((s, g) => s + (/^(Weapon_|Armor_)/.test(g.id) ? 1 : g.n), 0); }
  private itemName(id: string): string { return this.one('SELECT name FROM items WHERE id = ?', id)?.name ?? this.one('SELECT name FROM cook_items WHERE id = ?', id)?.name ?? id; }

  /** When a person is at work: the hours of their schedule they are not asleep (the timeline his save has switched on). */
  hoursOf(personId: string): [number, number][] | undefined {
    const p = this.one('SELECT schedule FROM people WHERE id = ?', personId);
    const s = json<{ always: Row[]; when: { flag: string; nodes: Row[] }[] } | null>(p?.schedule, null);
    if (!s) return undefined;
    const on = new Set(this.st.people?.flags ?? []), t = s.when.find(w => on.has(w.flag))?.nodes ?? s.always;
    const awake = t.filter(n => !/sleep/i.test(n.doing || '')).map(n => [n.from, n.to] as [number, number]);
    return awake.length && !(awake.length === 1 && awake[0]![0] === 0 && awake[0]![1] === 24) ? awake : undefined;
  }

  /** Every place an item comes from: shops (with their hours), chests he has not opened, enemies that drop it. */
  sourcesOf(id: string): Source[] {
    const out: Source[] = [], opened = new Set(this.st.chests?.opened ?? []);
    for (const p of this.all('SELECT p.id, coalesce(p.name, s.name) name, p.x, p.z, p.sells FROM people p LEFT JOIN shops s ON s.npc = p.id WHERE p.sells LIKE ?', `%"${id}"%`)) {
      if (!json<string[]>(p.sells, []).includes(id) || p.x == null) continue;
      out.push({ kind: 'shop', id: p.id, name: p.name || 'a shopkeeper', x: p.x, z: p.z, once: false, hours: this.hoursOf(p.id), price: this.one('SELECT buy FROM items WHERE id = ?', id)?.buy ?? undefined });
    }
    for (const c of this.all("SELECT hash_id, kind, near, x, z FROM chests WHERE item = ? AND map = 'MainField' AND master_mode = 0 AND flag IS NOT NULL", id))
      if (!opened.has(c.hash_id)) out.push({ kind: 'chest', id: String(c.hash_id), name: `a chest near ${c.near}`, x: c.x, z: c.z, once: true, note: c.kind === 'field' ? undefined : c.kind });
    for (const e of this.all('SELECT id, name, drops FROM enemies WHERE drops LIKE ?', `%"${id}"%`))
      out.push({ kind: 'enemy', id: e.id, name: e.name || e.id, once: false, note: 'drops it (spots: the map\'s route)' });
    return out;
  }

  tree(goal: Goal): GoalTree {
    const needs: Need[] = [], gates: string[] = [];
    const item = (id: string, n: number, what = this.itemName(id)) => { const have = this.bag(id); needs.push({ what, id, n, have, sources: have >= n ? [] : this.sourcesOf(id) }); };
    let title = '';
    switch (goal.kind) {
      case 'item': title = `${goal.n} × ${this.itemName(goal.id)}`; item(goal.id, goal.n); break;
      case 'armor': {
        // the base pieces (star 0) whose name matches; one set = the pieces of one series
        const pieces = this.all("SELECT a.piece, a.series, i.name FROM armor_upgrades a JOIN items i ON i.id = a.piece WHERE a.star = 0")
          .map((r): Row => ({ ...r, score: nameScore(goal.name, r.name) })).filter(r => r.score >= 60);
        const top = Math.max(0, ...pieces.map(p => p.score)), first = String(pieces.find(p => p.score === top)?.name ?? '').split(' ')[0];
        // a slot named ("helm", "boots") is that piece; otherwise "X armor" means the whole set, as players say it
        const slot = /\b(helm|helmet|boots|hood|cap|mask|headband|tights|trousers|pants|greaves|shirt|tunic|veil|headdress|earrings|top|bottoms)\b/i.test(goal.name);
        const set = slot ? pieces.filter(p => p.score === top) : this.all("SELECT a.piece, i.name FROM armor_upgrades a JOIN items i ON i.id = a.piece WHERE a.star = 0")
          .filter(p => String(p.name).split(' ')[0] === first);
        const star = goal.star ?? 0;
        title = `${set.map(p => p.name).join(', ')}${star ? ` at ${star} star${star > 1 ? 's' : ''}` : ''}`;
        if (!set.length) { gates.push(`no armour called "${goal.name}"`); break; }
        const totals = new Map<string, number>();
        for (const p of set) {
          // owning any level of the piece counts as owning the piece
          const levels = this.all('SELECT level_id, star, materials FROM armor_upgrades WHERE piece = ? ORDER BY star', p.piece);
          const ownStar = Math.max(-1, ...levels.filter(l => this.bag(l.level_id) > 0).map(l => l.star));
          if (ownStar < 0) item(p.piece, 1, p.name);
          for (const l of levels) if (l.star > Math.max(0, ownStar) && l.star <= star)
            for (const m of json<{ id: string; n: number }[]>(l.materials, [])) totals.set(m.id, (totals.get(m.id) ?? 0) + m.n);
        }
        for (const [id, n] of totals) item(id, n);
        if (star > 0) {
          const fountains = this.all('SELECT n, name, near, x, z FROM great_fairies WHERE n <= 4 ORDER BY n'), open = new Set(this.st.greatFairies ?? []);
          const have = fountains.filter(f => open.has(f.n)).length;
          if (have < star) gates.push(`${star} Great Fair${star > 1 ? 'ies' : 'y'} open: level ${star} upgrades need ${star} fountain${star > 1 ? 's' : ''} (${have} open; each new one asks ${FAIRY_TIER_COST.slice(have, star).join(', then ')} rupees)`);
          const mats = needs.map(n => n.what);
          needs.push({ what: 'Great Fairy fountains open', n: star, have, sources: fountains.filter(f => !open.has(f.n)).map(f => ({ kind: 'fairy' as const, id: `GreatFairy${f.n}`, name: `Great Fairy ${f.name}'s fountain`, x: f.x, z: f.z, once: true })) });
          needs.push({ what: 'the upgrades', n: 1, have: 0, after: [...mats, 'Great Fairy fountains open'], sources: fountains.map(f => ({ kind: 'fairy' as const, id: `upgrade${f.n}`, name: `any Great Fairy (${f.name})`, x: f.x, z: f.z, once: false })) });
        }
        break;
      }
      case 'shrines': {
        const at = this.all('SELECT name, x, z FROM places WHERE name IS NOT NULL AND x IS NOT NULL').map((p): Row => ({ ...p, s: nameScore(goal.near, p.name) })).sort((a, b) => b.s - a.s)[0];
        title = `the shrines near ${at?.s ? at.name : goal.near}`;
        if (!at?.s) { gates.push(`no place called "${goal.near}"`); break; }
        const done = new Set(this.st.shrines.done), r = goal.radius ?? 1200;
        const near = this.all('SELECT id, name, x, z, dlc FROM shrines WHERE x IS NOT NULL AND dlc = 0').filter(s => dist(s as Spot, at as Spot) <= r);
        needs.push({ what: 'shrines finished', n: near.length, have: near.filter(s => done.has(s.id)).length,
          sources: near.filter(s => !done.has(s.id)).map(s => ({ kind: 'shrine' as const, id: s.id, name: s.name, x: s.x, z: s.z, once: true })) });
        break;
      }
      case 'dish': {
        const word = DISH_WORD[goal.effect] ?? goal.effect;
        title = `a ${word} dish`;
        const ings = this.all('SELECT id, name, potency, buy FROM cook_items WHERE effect = ? ORDER BY potency DESC', goal.effect);
        const inBag = ings.filter(i => this.bag(i.id) > 0);
        if (inBag.length) needs.push({ what: `a ${word} ingredient`, n: 1, have: 1, sources: [{ kind: 'bag', id: inBag[0]!.id, name: inBag[0]!.name, once: false, note: 'in your bag: cook it at any pot' }] });
        else needs.push({ what: `a ${word} ingredient`, n: 1, have: 0, sources: ings.flatMap(i => this.sourcesOf(i.id).map(s => ({ ...s, note: `${i.name}${s.note ? ' · ' + s.note : ''}` }))) });
        break;
      }
      case 'quest': {
        const q = this.one('SELECT id, name, needs_flag FROM quests WHERE id = ?', goal.id), mine = this.st.quests.find(x => x.id === goal.id);
        title = q?.name ?? goal.id;
        if (!q) { gates.push(`no quest ${goal.id}`); break; }
        if (mine?.done) { needs.push({ what: 'quest done', n: 1, have: 1, sources: [] }); break; }
        if (!mine && q.needs_flag) gates.push('it opens after another part of the story');
        const step = this.one('SELECT n, name, text, x, z, people, hours FROM quest_steps WHERE quest_id = ? AND n >= ? ORDER BY n LIMIT 1', goal.id, mine?.step ?? 0);
        if (!step) break;
        const who = json<string[]>(step.people, []), hrs = json<Record<string, { nodes: Row[] }>>(step.hours, {});
        const hours = who.length && hrs[who[0]!] ? hrs[who[0]!]!.nodes.filter(n => !/sleep/i.test(n.doing || '')).map(n => [n.from, n.to] as [number, number]) : undefined;
        const at = step.x != null ? { x: step.x, z: step.z } : who.length ? this.one('SELECT x, z FROM people WHERE id = ?', who[0]) : null;
        needs.push({ what: 'the next step', n: 1, have: 0, sources: at?.x != null ? [{ kind: 'step', id: `${goal.id}:${step.n}`, name: who.length ? (this.one('SELECT name FROM people WHERE id = ?', who[0])?.name ?? 'someone') : 'the marker',
          x: at.x, z: at.z, once: true, hours: hours?.length ? hours : undefined }] : [] });
        break;
      }
      case 'hearts': case 'stamina': {
        // one Spirit Orb a base-game shrine; 4 orbs buy a heart or a stamina vessel at a Goddess statue
        const orbsHeld = this.st.shrines.done.filter(id => +id.replace(/\D/g, '') < 120).length - 4 * (this.st.hearts.max - 3) - 4 * Math.round((this.st.stamina.max - 1) / 0.2);
        const want = 4 * goal.n, have = Math.max(0, orbsHeld);
        title = `${goal.n} more ${goal.kind === 'hearts' ? (goal.n > 1 ? 'hearts' : 'heart') : 'stamina'}`;
        if (have < want) needs.push({ what: 'Spirit Orbs', n: want, have, sources: this.all('SELECT id, name, x, z FROM shrines WHERE dlc = 0 AND x IS NOT NULL')
          .filter(s => !this.st.shrines.done.includes(s.id)).map(s => ({ kind: 'shrine' as const, id: s.id, name: s.name, x: s.x, z: s.z, once: true })) });
        needs.push({ what: 'a Goddess statue', n: 1, have: 0, after: ['Spirit Orbs'], sources: this.all("SELECT hash_id, near, x, z FROM goddess_statues WHERE kind = 'prayable'")
          .map(g => ({ kind: 'statue' as const, id: String(g.hash_id), name: `the Goddess statue at ${g.near}`, x: g.x, z: g.z, once: false })) });
        break;
      }
    }
    return { goal, title, needs, gates, done: needs.every(n => n.have >= n.n) && !gates.some(g => /^no /.test(g)) };
  }

  // ---------------------------------------------------------------- E4: the planner

  /** Warp points he has: finished shrines and climbed towers. */
  private warps(): Spot[] {
    const done = new Set(this.st.shrines.done), on = new Set(this.st.towers.active);
    return [...this.all('SELECT id, x, z FROM shrines WHERE x IS NOT NULL').filter(s => done.has(s.id)), ...this.all('SELECT id, x, z FROM towers').filter(t => on.has(t.id))] as Spot[];
  }

  plan(tree: GoalTree, opt: { maxStops?: number } = {}): Plan {
    const W8 = 160, SPEED = 5, warps = this.warps();
    const leg = (a: Spot, b: Spot) => { const walk = dist(a, b), w = warps.map(p => ({ p, d: dist(p, b) })).sort((x, y) => x.d - y.d)[0];
      return w && W8 + w.d < walk ? { cost: W8 + w.d, warp: true, walk: w.d } : { cost: walk, warp: false, walk }; };
    // what each need still lacks, and how many of a source's kind it takes (a shrine is one orb; a chest one item)
    type Job = { need: Need; cands: Source[]; many: number };
    const jobs: Job[] = [];
    const missing: string[] = [];
    for (const n of tree.needs) {
      const left = n.n - n.have; if (left <= 0) continue;
      const placed = n.sources.filter(s => s.x != null);
      if (!placed.length) { missing.push(`${n.what}: ${n.sources.length ? n.sources.map(s => s.name).slice(0, 3).join(', ') + ' (no fixed spot: the map finds one)' : 'no source known'}`); continue; }
      // shops and statues are visited once and cover it all; shrines and fountains count one each
      // a chest holds one; with no shop, the rest come from gathering or enemies (the map finds those spots)
      const shop = placed.some(s => s.kind === 'shop'), onlyChests = !shop && placed.every(s => s.kind === 'chest');
      const each = placed[0]!.kind === 'shrine' || placed[0]!.kind === 'fairy' ? left : onlyChests ? Math.min(left, placed.length) : 1;
      if (onlyChests && left > placed.length) missing.push(`${n.what}: ${left - placed.length} more than the chests hold (gather or farm them: the map finds spots)`);
      jobs.push({ need: n, cands: placed, many: each });
    }
    // one stop per visit: each job becomes `many` stops chosen from its candidates
    const start: Spot = { x: this.st.pos.x, z: this.st.pos.z }, hour0 = this.st.clock?.hour ?? 12;
    const open = (s: Source, h: number) => { if (!s.hours) return 0; const t = ((h % 24) + 24) % 24;
      if (s.hours.some(([a, b]) => t >= a && t < b)) return 0; const next = Math.min(...s.hours.map(([a]) => (a - t + 24) % 24)); return next; };
    const stops: Stop[] = []; let at = start, hour = hour0, metres = 0, waited = 0;
    const used = new Set<string>();
    const pending = jobs.flatMap(j => Array.from({ length: j.many }, () => j));
    const limit = opt.maxStops ?? 12;
    while (pending.length && stops.length < limit) {
      // nearest-first over every (job, candidate) pair, counting the wait for a closed shop
      let best: { i: number; s: Source; cost: number; m: number; wait: number; warp: boolean; walk: number } | null = null;
      const blocked = (j: Job) => (j.need.after ?? []).some(w => pending.some(p => p.need.what === w));
      pending.forEach((j, i) => { if (blocked(j)) return; for (const s of j.cands) { if (s.once && used.has(s.kind + s.id)) continue;
        const L = leg(at, s as Spot), m = L.cost, arrive = hour + m / SPEED / 60, wait = open(s, arrive), cost = m / SPEED / 60 + wait;
        if (!best || cost < best.cost) best = { i, s, cost, m, wait, warp: L.warp, walk: L.walk }; } });
      if (!best) break;
      const b = best as { i: number; s: Source; cost: number; m: number; wait: number; warp: boolean; walk: number };
      const job = pending.splice(b.i, 1)[0]!;
      used.add(b.s.kind + b.s.id); metres += b.m; waited += b.wait; hour += b.cost;
      stops.push({ what: job.need.what, source: b.s, metres: Math.round(b.walk), warp: b.warp, arrive: Math.round((hour % 24) * 10) / 10, wait: Math.round(b.wait * 10) / 10 });
      at = b.s as Spot;
    }
    if (pending.length) missing.push(`${pending.length} more stop${pending.length > 1 ? 's' : ''} after these`);
    const routeGoals = [
      ...tree.needs.filter(n => n.id && n.have < n.n).map(n => ({ kind: 'item' as const, id: n.id!, n: n.n - n.have })),
      ...stops.filter(s => s.source.kind === 'shrine' || s.source.kind === 'step' || s.source.kind === 'fairy' || s.source.kind === 'statue')
        .map(s => ({ kind: 'place' as const, name: s.source.name, at: [s.source.x!, s.source.z!] as [number, number] })),
    ];
    return { tree, stops, gameHours: Math.round((hour - hour0) * 10) / 10, waited: Math.round(waited * 10) / 10, metres: Math.round(metres), missing, routeGoals };
  }

  /** The plan in his words: one line a stop, the gates first, never more than he asked for. His spoiler rule: a shrine
   *  he has not found keeps its name and exact square back (a rough way there only) unless spoil (his "just tell me"). */
  say(p: Plan, { spoil = false } = {}): string {
    const t = p.tree, found = new Set([...this.st.shrines.found, ...this.st.shrines.done]);
    const hidden = (s: Source) => !spoil && s.kind === 'shrine' && !found.has(s.id);
    const bag = t.needs.flatMap(n => n.sources).find(s => s.kind === 'bag');
    if (t.done) return bag ? `${t.title}: cook it now, you have ${bag.name} (any cooking pot).` : `${t.title}: you already have everything for it.`;
    const lines: string[] = [];
    if (t.gates.length) lines.push(`First: ${t.gates.join('; ')}.`);
    let from: Spot = { x: this.st.pos.x, z: this.st.pos.z };
    for (const s of p.stops) {
      const sq = hidden(s.source) || s.source.x == null ? '' : ` (${square(s.source.x, s.source.z!)})`;
      const where = s.source.x == null ? '' : s.warp ? `warp, then ${sayDistance(s.metres, true)}${sq}`
        : `${sayDistance(s.metres, true)} ${direction(from as any, s.source as any)}${sq}`;
      const when = s.wait ? `, opens in about ${Math.ceil(s.wait)} h (game time)` : '';
      lines.push(`- ${s.what}: ${hidden(s.source) ? 'a shrine you have not found yet' : s.source.name}${s.source.note ? ` (${s.source.note})` : ''}${where ? ', ' + where : ''}${when}`);
      if (s.source.x != null) from = s.source as Spot;
    }
    for (const m of p.missing) lines.push(`- ${m}`);
    return `${t.title}:\n${lines.join('\n')}${p.stops.length ? `\nAbout ${Math.max(1, Math.round(p.gameHours))} real minutes of travel from where you saved.` : ''}`;
  }
}

export interface Stop { what: string; source: Source; metres: number; warp: boolean; arrive: number; wait: number }  // metres walked (after the warp)
export interface Plan {
  /** gameHours is also real minutes: the game's day is 24 real minutes */
  tree: GoalTree; stops: Stop[]; gameHours: number; waited: number; metres: number; missing: string[];
  routeGoals: ({ kind: 'item'; id: string; n: number } | { kind: 'place'; name: string; at: [number, number] })[];
}

/** His words to a goal: "flamebreaker armor fully upgraded", "kakariko's shrines", "a hearty dish", "2 more hearts". */
export function parseGoal(db: DatabaseSync, words: string): Goal | null {
  const w = words.toLowerCase();
  const n = +(w.match(/\b(\d+)\b/)?.[1] ?? 1);
  if (/\bhearts?\b/.test(w) && /more|get|another|\d/.test(w) && !/hearty/.test(w)) return { kind: 'hearts', n };
  if (/stamina (wheel|vessel)|more stamina/.test(w)) return { kind: 'stamina', n };
  const eff = Object.entries(DISH_WORD).find(([, v]) => w.includes(v.toLowerCase()));
  if (eff && /dish|meal|food|elixir|cook/.test(w)) return { kind: 'dish', effect: eff[0] };
  const sh = w.match(/shrines? (?:near|around|in|at) (.+)|(.+?)'?s? shrines/);
  if (sh) return { kind: 'shrines', near: (sh[1] ?? sh[2] ?? '').replace(/\b(all|of|the)\b/g, '').trim() };
  const star = /fully|max|4 star|four star/.test(w) ? 4 : +(w.match(/(\d) ?star/)?.[1] ?? 0);
  const armor = (db.prepare("SELECT i.name FROM armor_upgrades a JOIN items i ON i.id = a.piece WHERE a.star = 0").all() as Row[])
    .some(r => w.includes(String(r.name).toLowerCase().split(' ')[0]!) && /armou?r|helm|boots|set|outfit|tunic|mask|hood|cap/.test(w));
  if (armor) return { kind: 'armor', name: words.replace(/\b(fully|upgraded|max(ed)?|\d ?stars?|four stars?)\b/gi, '').trim(), star };
  const q = (db.prepare('SELECT id, name FROM quests WHERE name IS NOT NULL').all() as Row[]).map((r): Row => ({ ...r, s: nameScore(words, r.name) })).sort((a, b) => b.s - a.s)[0];
  if (q && q.s >= 70) return { kind: 'quest', id: q.id };
  const it = (db.prepare('SELECT id, name FROM items').all() as Row[]).map((r): Row => ({ ...r, s: nameScore(words.replace(/\b\d+\b|\bx\b/g, '').trim(), r.name) })).sort((a, b) => b.s - a.s)[0];
  if (it && it.s >= 60) return { kind: 'item', id: it.id, n };
  return null;
}
