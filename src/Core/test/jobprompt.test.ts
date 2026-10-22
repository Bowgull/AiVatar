// C6 (2026-10-22): the job prompt, the folder guess and the tidy guard (jobprompt.ts), on a pretend disk.
// The five worked examples of docs/C6-PROMPT-RESEARCH.md section 2.3 are kept as snapshots in fixtures/c6/: a change to
// a rule block or to the order shows up as a diff there. To write them again on purpose: C6_SNAPSHOTS=update.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { buildPrompt, cleanWords, guessFolder, shapeOf, tidyGuard } from '../src/jobprompt.ts';
import type { Disk } from '../src/jobprompt.ts';

const HOME = 'C:\\Users\\J';
const at = (...p: string[]) => path.join(HOME, ...p);
const AANG = at('Documents', 'AangApp'), GRASS = at('Waymark-grass'), JOBS = at('job-hunt-data');

function fakeDisk(): Disk {
  const dirs = new Map<string, string[]>([
    [HOME, ['Documents', 'Waymark', 'Waymark-grass', 'Waymark-audit', 'job-hunt-data']],
    [path.join(AANG, 'docs'), ['samara-perf-baseline.md', 'spotify-player-scenes.md', 'briefcard-sheet-23.md', 'C6-PROMPT-RESEARCH.md']],
    [AANG, ['src', 'docs', 'README.md']],
    [GRASS, ['WAYMARK_SESSION_HANDOFF.md', 'BUILD_PLAN.md', 'src']],
  ]);
  const files = new Set([AANG, path.join(AANG, '.git'), path.join(AANG, 'src'), path.join(AANG, 'src', 'Shell'), path.join(AANG, 'docs', 'samara-perf-baseline.md'),
    at('Waymark'), path.join(at('Waymark'), '.git'), GRASS, path.join(GRASS, '.git'), at('Waymark-audit'), JOBS, at('Documents', 'AangApp-wt-c5')]);
  return { exists: p => files.has(p), list: d => dirs.get(d) ?? [] };
}

/** The five, with the Goal paragraph a good tidy would give (so the snapshot shows where it lands). */
const EXAMPLES: { key: string; words: string; folder: string; goal: string }[] = [
  { key: 'A', words: 'fix the skater colours on the player', folder: AANG,
    goal: 'The skate scene on the Spotify mini player needs colour combos that pop. Joshua liked the scene but the skater does not stand out. Show him 3 to 4 colour options before changing the real one.' },
  { key: 'B', words: 'pick Waymark back up and finish the grass thing', folder: GRASS,
    goal: 'Finish the grass work in Waymark.' },
  { key: 'C', words: 'find me 5 jobs in Toronto', folder: JOBS,
    goal: 'Find 5 good job openings in Toronto for Joshua, using his saved profile.' },
  { key: 'D', words: 'why is Samara slow on YouTube', folder: AANG,
    goal: 'Find out why YouTube feels slow in Samara and fix the cause, not the symptom.' },
  { key: 'E', words: 'make the brief show addons', folder: AANG,
    goal: 'Add his WoW addons to the morning brief (likely: which addons have updates).' },
];

test('the five worked examples: folder, model and the whole prompt (snapshots)', () => {
  const disk = fakeDisk();
  const dir = path.join(import.meta.dirname, 'fixtures', 'c6');
  mkdirSync(dir, { recursive: true });
  const expectModel: Record<string, string> = { A: 'sonnet/medium', B: 'opus/high', C: 'sonnet/medium', D: 'opus/high', E: 'opus/high' };
  for (const ex of EXAMPLES) {
    const g = guessFolder(ex.words, disk, { home: HOME });
    assert.equal(g.folder, ex.folder, `${ex.key}: the folder`);
    assert.equal(g.sure, true, `${ex.key}: sure, so no ask`);
    const p = buildPrompt(ex.words, g.folder, disk, { goal: ex.goal });
    assert.equal(`${p.model.model}/${p.model.effort}`, expectModel[ex.key], `${ex.key}: model`);
    assert.ok(p.text.endsWith(`Joshua's words: "${ex.words}"`), `${ex.key}: his exact words close it`);
    const file = path.join(dir, `example-${ex.key}.txt`);
    const shown = `${p.line}\n${p.model.label}${p.model.quota ? ' (might be high quota)' : ''}\n---\n${p.text}\n`;
    if (process.env.C6_SNAPSHOTS === 'update' || !existsSync(file)) writeFileSync(file, shown);
    assert.equal(shown, readFileSync(file, 'utf8').replace(/\r\n/g, '\n'), `${ex.key}: snapshot (C6_SNAPSHOTS=update to rewrite)`);
  }
});

test('the rules follow the kind: interview for a new feature, measure for slowness, go big + plan to pick work back up', () => {
  const disk = fakeDisk();
  const e = buildPrompt('make the brief show addons', AANG, disk);
  assert.ok(e.blocks.includes('INTERVIEW') && e.blocks.includes('MOCKUPS') && e.blocks.includes('COMMIT'));
  const d = buildPrompt('why is Samara slow on YouTube', AANG, disk);
  assert.ok(d.blocks.includes('MEASURE') && !d.blocks.includes('INTERVIEW'));
  const b = buildPrompt('pick Waymark back up and finish the grass thing', GRASS, disk);
  assert.deepEqual(b.blocks.slice(0, 2), ['GO_BIG', 'PLAN']);
  // Not a repo: no commit line. Jobs: browse rules + the job-hunt skill.
  const c = buildPrompt('find me 5 jobs in Toronto', JOBS, disk);
  assert.ok(!c.blocks.includes('COMMIT') && c.blocks.includes('BROWSE'));
  assert.deepEqual(c.skills, ['the job-hunt skill']);
  // "plan it" always wins; "just do it" turns interview and plan off; "go big" is Opus xhigh with the quota line.
  assert.ok(buildPrompt('fix the rune colour, plan it', AANG, disk).blocks.includes('PLAN'));
  const j = buildPrompt('add a timer to the brief, just do it', AANG, disk);
  assert.ok(!j.blocks.includes('INTERVIEW') && !j.blocks.includes('PLAN'));
  const big = buildPrompt('go big on the rune redesign', AANG, disk);
  assert.equal(big.model.effort, 'xhigh'); assert.equal(big.model.quota, true);
  // Every job: safety; no template ever drops his words.
  for (const p of [e, d, b, c, j, big]) assert.ok(p.blocks.includes('SAFETY'));
});

test('folder guess: a named folder, a project word, a recent session; asks only on a tie or nothing', () => {
  const disk = fakeDisk();
  assert.deepEqual(guessFolder(`look at ${GRASS} please`, disk, { home: HOME }), { folder: GRASS, sure: true, options: [] });
  assert.equal(guessFolder('waymark audit things', disk, { home: HOME }).folder, at('Waymark-audit'));
  assert.equal(guessFolder('waymark sounds', disk, { home: HOME }).folder, at('Waymark'));
  const tie = guessFolder('put the waymark map in the brief', disk, { home: HOME });
  assert.equal(tie.sure, false);
  assert.deepEqual(tie.options.map(o => o.label), ['AangApp', 'Waymark', 'Other']);
  const recent = [{ title: 'Toolbar polish', cwd: at('Documents', 'AangApp-wt-c5') }, { title: 'Toolbar sweep', cwd: AANG }];
  // A running job's worktree is never picked by itself; the next match is.
  assert.deepEqual(guessFolder('finish the toolbar', disk, { home: HOME, recent }), { folder: AANG, sure: true, options: [] });
  const none = guessFolder('sort out the thing', disk, { home: HOME });
  assert.equal(none.sure, false);
  assert.equal(none.options.at(-1)?.label, 'Other');
});

test('the tidy guard: no invented files, no lists, no em dashes, not too long, thinking stripped', () => {
  const disk = fakeDisk();
  assert.equal(tidyGuard('<think>hmm</think>Goal: Fix the skater \u2014 it should pop.', AANG, disk), 'Fix the skater, it should pop.');
  assert.equal(tidyGuard('Read docs/samara-perf-baseline.md first.', AANG, disk), 'Read docs/samara-perf-baseline.md first.');
  assert.equal(tidyGuard('Edit src/Shell/pages/skater.js to fix it.', AANG, disk), null);
  assert.equal(tidyGuard('- one\n- two', AANG, disk), null);
  assert.equal(tidyGuard('word '.repeat(151), AANG, disk), null);
  assert.equal(tidyGuard('   ', AANG, disk), null);
});

test('the door words come off his ask; the kind reads his words', () => {
  assert.equal(cleanWords('Start a Claude job: fix the rune'), 'fix the rune');
  assert.equal(cleanWords('tell claude to make the brief show addons'), 'make the brief show addons');
  assert.equal(shapeOf('pick waymark back up').kind, 'resume');
  assert.equal(shapeOf('why is samara slow').kind, 'perf');
  assert.equal(shapeOf('add yourself a timer', 'self').kind, 'self');
});
