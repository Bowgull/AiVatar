// Phase 7: what keeps coming up.
//
// THIS IS THE POINT OF THE WHOLE SWEEP. Joshua, 2026-10-03: "what people are generally doing with AI
// agents if something is coming up frequently to look into it like when harnesses first started coming
// out i.e hermes open claw etc. Now people are talking about jev."
//
// A list of this week's popular repositories is easy and nearly worthless - it is the same tutorial
// repos and framework rewrites every week, and none of it tells him anything. "Three different places
// mentioned this, and one of them was last week too" is the signal he actually described, and it cannot
// be computed from one week in isolation. Hence a table that remembers.
//
// A name mentioned twice this week and twice last week is the interesting case. A name mentioned
// fifteen times in one day and never again is a launch, not a trend.
import type { DatabaseSync } from 'node:sqlite';
import type { Finding } from './research.ts';

/** Monday-based week key, so a thing mentioned Sunday and Monday is two weeks, which is correct. */
export function weekOf(d = new Date()): string {
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = (t.getUTCDay() + 6) % 7;                 // Monday = 0
  t.setUTCDate(t.getUTCDate() - day);
  return t.toISOString().slice(0, 10);
}

/**
 * Words that are not names, however often they are capitalised.
 *
 * Kept deliberately small. A huge stop list is a slow way to discover that the extractor is wrong; if
 * rubbish keeps surfacing, the answer is a better extractor (the local model), not a longer list.
 */
const NOT_A_NAME = new Set([
  'the', 'a', 'an', 'and', 'or', 'for', 'with', 'from', 'this', 'that', 'what', 'why', 'how', 'when',
  'ai', 'llm', 'llms', 'open', 'source', 'new', 'using', 'use', 'show', 'hn', 'ask', 'tell', 'why',
  'agent', 'agents', 'model', 'models', 'api', 'app', 'tool', 'tools', 'code', 'data', 'web', 'is',
  'are', 'can', 'will', 'your', 'you', 'we', 'i', 'it', 'of', 'in', 'on', 'to', 'at', 'by', 'via',
  'build', 'building', 'built', 'make', 'making', 'first', 'best', 'free', 'now', 'all', 'one',
]);

/**
 * The names a finding is about.
 *
 * For GitHub the repository name IS the name, which is exact and needs no guessing. For prose titles
 * it takes capitalised words and CamelCase, which is crude and knowingly so: it catches "Hermes",
 * "OpenClaw" and "Jev", and it also catches the occasional sentence-initial word. The three-mentions
 * threshold is what makes that survivable - a word caught by accident rarely gets caught three times.
 *
 * The local model is the intended upgrade here; it would read a title and say what it is about. That
 * costs GPU time rather than quota, so it is affordable, but it is not needed to start.
 */
/**
 * Words that decorate a project name without being one. `awesome-jev` is about jev.
 *
 * This matters more than it looks. A live sweep on 2026-10-03 returned `awesome-jev`, `anyjev`,
 * `jev-chat-jarvis` and `awesome-jev-use-cases` - four separate names, each counted once, when what
 * actually happened is that jev was mentioned four times. Splitting the signal into four pieces of
 * noise defeats the entire point of counting. So the core word is recorded as well as the full name.
 */
const DECORATION = new Set([
  'awesome', 'my', 'open', 'free', 'simple', 'tiny', 'fast', 'easy', 'any', 'auto', 'super', 'ultra',
  'chat', 'app', 'api', 'cli', 'ui', 'web', 'js', 'ts', 'py', 'go', 'rs', 'server', 'client', 'bot',
  'tool', 'tools', 'kit', 'sdk', 'lib', 'core', 'demo', 'example', 'examples', 'test', 'tests',
  'use', 'cases', 'list', 'docs', 'doc', 'starter', 'template', 'boilerplate', 'plugin', 'skill',
  'agent', 'agents', 'ai', 'llm', 'gpt', 'model', 'models', 'project', 'new', 'next', 'v2', 'os',
]);

/** The word a hyphenated name is really about, when there is exactly one candidate. */
function coreOf(name: string): string | null {
  const parts = name.split(/[-_.]+/).filter(p => p.length > 2 && !DECORATION.has(p));
  // Only when it is unambiguous. "gear-quest" has two real words and reducing it to either would be
  // a guess; "awesome-jev-use-cases" has exactly one, which is the answer.
  return parts.length === 1 && parts[0] !== name ? parts[0] : null;
}

/**
 * Sources whose titles name products, so counting them means something.
 *
 * arXiv is deliberately NOT here. The first live run remembered "audio", "aware", "benchmark",
 * "benchmarking" and "beyond" as if they were trending tools - because a paper title describes a topic,
 * not a product, and asking "what is this about" of "Beyond Benchmarks: Audio-Aware Agents" correctly
 * returns topic words. The fault was asking at all.
 *
 * Papers stay in the sweep and in the digest. They are there for depth - reading the primary source is
 * what catches a vendor number - and that job does not need them counted.
 */
const NAMES_PRODUCTS = new Set<Finding['source']>(['github', 'hn', 'reddit']);

export function namesIn(f: Finding): string[] {
  if (!NAMES_PRODUCTS.has(f.source)) return [];
  const out = new Set<string>();
  if (f.source === 'github') {
    const repo = (f.title.split('/')[1] ?? f.title).toLowerCase();
    if (repo.length > 2) {
      out.add(repo);
      const core = coreOf(repo);
      if (core) out.add(core);
    }
  }
  for (const w of f.title.matchAll(/\b([A-Z][a-z]{2,}[A-Za-z0-9]*|[A-Z]{2,}[a-z]+[A-Za-z0-9]*)\b/g)) {
    const name = w[1].toLowerCase();
    if (name.length > 2 && !NOT_A_NAME.has(name)) out.add(name);
  }
  return [...out].slice(0, 6);
}

/**
 * The same job done properly, by the local model.
 *
 * The regex above is a fallback and it shows: a live sweep on 2026-10-03 surfaced "there" (from "There
 * are no rogue AI agents") and "long" (from "Long-Horizon") as if they were trending products. A longer
 * stop list is the wrong fix - it is a slow way to keep discovering that the extractor cannot tell a
 * name from a word, and it would have to grow forever.
 *
 * The local model can just read the title and say what it is about. It runs on his own card, so it
 * costs GPU time and none of his Claude week, and it refuses to run while a game is open - which is
 * correct here, because a weekly sweep can wait until he stops playing.
 *
 * Falls back to the regex rather than failing: a worse name list is better than no sweep.
 */
export async function namesInWith(
  ask: (prompt: string, opts?: { system?: string; maxTokens?: number }) => Promise<{ ok: boolean; text: string }>,
  findings: Finding[],
): Promise<Map<string, string[]>> {
  const out = new Map<string, string[]>();
  for (const f of findings) out.set(f.id, namesIn(f));
  if (findings.length === 0) return out;
  // Seeded with the regex above ONLY so that a model that cannot run at all still produces something.
  // Once it HAS run, its "-" is an answer, not a gap, and falling back to the regex there is what put
  // "there", "amazon", "analysis" and "certificate" in the table on the first live run - the model had
  // correctly said those titles name no product, and the fallback overruled it.

  // Only the sources whose titles name products. Asking about a paper title gets a topic word back,
  // which is the right answer to the wrong question - see NAMES_PRODUCTS.
  const asked = findings.filter(f => NAMES_PRODUCTS.has(f.source));
  if (asked.length === 0) return out;
  const list = asked.map((f, i) => `${i + 1}. ${f.title}`).join('\n');
  const r = await ask(
    `Here are ${asked.length} titles from GitHub and Hacker News.\n\n${list}\n\n` +
    `For each one, give the NAME of the product, project or company it is about - the sort of name you ` +
    `would type into a search box. Reply with one line per title, exactly "<number>: <name>" and nothing ` +
    `else.\n\nAnswer "-" whenever there is no such name, and that will be most of them. Never answer with ` +
    `a topic or a description: "audio", "benchmark", "ai agents" and "agent memory" are all wrong answers, ` +
    `and so is any ordinary English word like "there", "long" or "new".`,
    { system: 'You extract product names from titles. You reply only in the format asked for.', maxTokens: 900 },
  );
  if (!r.ok || !r.text) return out;

  // The model answered, so its judgement replaces the regex for everything it was asked about. A repo
  // name is kept regardless, because it is exact and not a guess.
  for (const f of asked) out.set(f.id, f.source === 'github' ? namesIn(f) : []);

  for (const line of r.text.split('\n')) {
    const m = /^\s*(\d+)\s*[:.\)]\s*(.+?)\s*$/.exec(line);
    if (!m) continue;
    const f = asked[Number(m[1]) - 1];
    const name = m[2].trim().toLowerCase();
    if (!f || !name || name === '-' || name.length < 3 || name.length > 40) continue;
    if (NOT_A_NAME.has(name)) continue;
    // One word, or a hyphenated one. "ai agents" and "border drawings" both came back from the first
    // live run as if they were products. A two-word answer is a description almost every time, and the
    // few real ones are not worth the noise of allowing them.
    if (/\s/.test(name)) continue;
    // And it has to actually be IN the title. Anything else is the model inventing one, and an invented
    // name counted three times would read exactly like a real trend.
    if (!f.title.toLowerCase().includes(name.split(/[-_]/)[0])) continue;
    // Keep the repo name too: it is exact, and the model sometimes answers with the owner instead.
    const kept = new Set(f.source === 'github' ? namesIn(f) : []);
    kept.add(name);
    out.set(f.id, [...kept].slice(0, 4));
  }
  return out;
}

export interface Mention { name: string; times: number; weeks: number; firstSeen: string; lastSeen: string; sources: string }

export class Mentions {
  private readonly db: DatabaseSync;
  constructor(db: DatabaseSync) { this.db = db; }

  /** Record everything one sweep saw. Same name twice in one week counts twice; that is the signal. */
  note(findings: Finding[], now = new Date(), names?: Map<string, string[]>): void {
    const week = weekOf(now);
    const iso = now.toISOString();
    try {
      const up = this.db.prepare(`
        INSERT INTO mentions (name, week, times, first_seen, last_seen, sources) VALUES (?,?,1,?,?,?)
        ON CONFLICT(name, week) DO UPDATE SET
          times = times + 1,
          last_seen = excluded.last_seen,
          sources = CASE WHEN instr(sources, excluded.sources) > 0 THEN sources ELSE sources || ',' || excluded.sources END`);
      for (const f of findings) for (const name of (names?.get(f.id) ?? namesIn(f))) up.run(name, week, iso, iso, f.source);
    } catch (e) {
      console.error('mentions: could not record a sweep: ' + (e as Error).message);
    }
  }

  /**
   * Names worth saying out loud: seen at least `least` times across the last `weeks` weeks.
   *
   * Spread across weeks is reported separately from the raw count on purpose. Something seen five times
   * in one week is news; something seen twice a week for three weeks is a trend, and the second is what
   * he asked to be told about.
   */
  repeated(least = 3, weeks = 4, now = new Date()): Mention[] {
    const from = weekOf(new Date(now.getTime() - weeks * 7 * 86_400_000));
    try {
      return this.db.prepare(`
        SELECT name,
               SUM(times) AS times,
               COUNT(DISTINCT week) AS weeks,
               MIN(first_seen) AS firstSeen,
               MAX(last_seen) AS lastSeen,
               GROUP_CONCAT(DISTINCT sources) AS sources
          FROM mentions WHERE week >= ?
          GROUP BY name HAVING times >= ?
          ORDER BY weeks DESC, times DESC LIMIT 20`).all(from, least) as unknown as Mention[];
    } catch (e) {
      console.error('mentions: could not read the table: ' + (e as Error).message);
      return [];
    }
  }

  /** True when this is the first week a name has ever appeared - so "new this week" is honest. */
  isNew(name: string, now = new Date()): boolean {
    try {
      const r = this.db.prepare('SELECT COUNT(DISTINCT week) AS n FROM mentions WHERE name = ? AND week < ?')
        .get(name.toLowerCase(), weekOf(now)) as { n: number } | undefined;
      return (r?.n ?? 0) === 0;
    } catch { return false; }
  }

  /** Old weeks, dropped. Four months is long enough to see a trend and short enough to stay small. */
  prune(keepWeeks = 16, now = new Date()): void {
    try {
      this.db.prepare('DELETE FROM mentions WHERE week < ?')
        .run(weekOf(new Date(now.getTime() - keepWeeks * 7 * 86_400_000)));
    } catch { /* housekeeping must never break a sweep */ }
  }
}
