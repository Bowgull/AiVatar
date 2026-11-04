// BG7 "check it like a stranger would" (docs/BOTW-GUIDE.md), on HIS real save: the spoiler questions botwguide.test.ts
// asks a made-up save, asked again of where he really is. Tool level (no model, no quota): a spoiler the tool never hands
// over is one Aang cannot give. Skipped when his botw.db or state.json is not on this machine (Nintendo's data and his
// save, never in the repo). The counts half of BG7 is scripts/botw-pack-check.mjs.
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { copyFileSync, existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import os from 'node:os';
import path from 'node:path';
import { BotwGuide } from '../src/botw.ts';

const HOME = path.join(process.env.LOCALAPPDATA || '', 'Aang', 'botw');
const have = existsSync(path.join(HOME, 'botw.db')) && existsSync(path.join(HOME, 'state.json'));
const SQUARE = /\b[A-J]-[1-8]\b/;
let dir = '', g: BotwGuide, st: any, db: DatabaseSync, clock = Date.now();

before(() => {
  if (!have) return;
  dir = mkdtempSync(path.join(os.tmpdir(), 'aang-botwstranger-'));
  copyFileSync(path.join(HOME, 'botw.db'), path.join(dir, 'botw.db'));
  copyFileSync(path.join(HOME, 'state.json'), path.join(dir, 'state.json'));   // no guide-settings.json: Hints first
  st = JSON.parse(readFileSync(path.join(dir, 'state.json'), 'utf8'));
  db = new DatabaseSync(path.join(dir, 'botw.db'), { readOnly: true });
  g = new BotwGuide(dir, () => clock);
});
after(() => { if (!have) return; g.close(); db.close(); rmSync(dir, { recursive: true, force: true }); });

const t = (name: string, fn: () => void) => test(name, { skip: !have && 'his botw.db / state.json are not on this machine' }, fn);
const unfound = () => (db.prepare('SELECT id, name, x, z FROM shrines').all() as any[]).filter(s => !st.shrines.found.includes(s.id))
  .sort((a, b) => Math.hypot(a.x - st.pos.x, a.z - st.pos.z) - Math.hypot(b.x - st.pos.x, b.z - st.pos.z));

t('1. nearest Korok from where he saved: rung 1 has no square and no puzzle', () => {
  const r = g.hint('nearest korok'); assert.match(r, /rung 1 of 3/); assert.doesNotMatch(r, SQUARE); assert.doesNotMatch(r, /puzzle/i);
});
t('2. asked again: rung 2, still no square; a third time: the spot', () => {
  const r = g.hint('nearest korok'); assert.match(r, /rung 2 of 3/); assert.doesNotMatch(r, SQUARE);
  assert.match(g.hint('nearest korok'), /rung 3 of 3/);
});
t('3. nearest shrine (one he has not found): never named, no square', () => {
  const s = unfound()[0]; assert.ok(s, 'a shrine he has not found');
  const r = g.hint('nearest shrine');
  assert.match(r, /rung 1 of 3/); assert.doesNotMatch(r, /w+ Shrine/); assert.ok(!r.includes(s.name), `"${s.name}" stays hidden`); assert.doesNotMatch(r, SQUARE);
});
t('4. an unfound shrine by name: no spot, no distance', () => {
  const s = unfound().at(-1); const r = g.lookup(s.name);
  assert.doesNotMatch(r, SQUARE); assert.doesNotMatch(r, /\d+ m /);
});
t('5. a Divine Beast boss: held back', () => {
  const r = g.lookup('waterblight ganon'); assert.doesNotMatch(r, /health|weak point/i);
});
t('6. every quest he has open: his step only, never the next one', () => {
  const open = st.quests.filter((q: any) => !q.done);
  assert.ok(open.length, 'he has open quests');
  for (const q of open.slice(0, 12)) {
    const next = db.prepare('SELECT text FROM quest_steps WHERE quest_id = ? AND n = ?').get(q.id, q.step + 1) as any;
    const now = db.prepare('SELECT text FROM quest_steps WHERE quest_id = ? AND n = ?').get(q.id, q.step) as any;
    const name = (db.prepare('SELECT name FROM quests WHERE id = ?').get(q.id) as any)?.name;
    if (!next?.text || !name) continue;
    const r = g.quest(name), bit = String(next.text).replace(/\{[\d.]+\}/g, '').trim().slice(0, 40);
    // the game's log repeats one text over several steps (Captured Memories 0-2): words he already has are no spoiler
    if (String(now?.text ?? '').replace(/\{[\d.]+\}/g, '').includes(bit)) continue;
    assert.ok(bit.length < 12 || !r.includes(bit), `${name}: the step after his isn't in it`);
  }
});
t('7. Koroks around where he saved: counts only, no spots', () => {
  const r = g.nearby(400, 'koroks'); assert.doesNotMatch(r, /- Korok/);
});
t('8. a memory he has not found: no place given', () => {
  const r = g.lookup('captured memories'); assert.doesNotMatch(r, SQUARE);
});
t('9. half an hour later the ladder starts warm again', () => {
  clock += 31 * 60_000; assert.match(g.hint('nearest korok'), /rung 1 of 3/);
});
t('10. "just tell me" gives the spot at once', () => {
  assert.match(g.hint('nearest shrine', undefined, true), /rung 3 of 3/);
});
