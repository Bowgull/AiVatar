// quota.mjs - what Aang actually spends, read from the turn log rather than guessed.
//
// WHY THIS EXISTS: on 2026-09-30 a first read of turns.jsonl said the quick lane had
// ZERO cache reads across 24 turns, which would have meant the cheap lane was paying
// full price for ~28k of context on every single turn. It was wrong. cacheReadTokens
// and cacheWriteTokens were only added to the logging on 2026-09-24, and every
// quick-lane record predates them: the field is ABSENT, not zero. JSON.parse gives
// undefined, undefined coerces to 0 in arithmetic, and a missing measurement silently
// became a dramatic finding. So this script separates "measured as zero" from "never
// measured" everywhere, prints the coverage before any cost, and refuses to fold an
// unmeasured turn into a total. A number here should be worth deciding on.
//
//   node tools/measure/quota.mjs                 the default log
//   node tools/measure/quota.mjs --json          machine readable, for diffing over time
//   node tools/measure/quota.mjs --file <path>   some other log
//   node tools/measure/quota.mjs --since 2026-09-24
//
// BILLING MODEL. Anthropic bills a cache write at 1.25x the base input rate and a
// cache read at 0.1x, so a token is not a token. Every total below is in "billed token
// equivalents": uncached x1, written x1.25, read x0.1. That is the number that moves
// the quota, and it is the only input total this prints.
import fs from 'node:fs';
import path from 'node:path';

const WRITE_RATE = 1.25;                 // 5-minute cache write, the default TTL
const READ_RATE = 0.1;
const SESSION_GAP_MS = 30 * 60 * 1000;   // a gap this long starts a new session
const CACHE_TTL_MIN = 5;                 // the default cache lifetime

const argv = process.argv.slice(2);
const flag = (name, fallback = null) => {
  const i = argv.indexOf(name);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : fallback;
};
const asJson = argv.includes('--json');
const file = flag('--file', path.join(process.env.APPDATA || process.env.HOME || '.', 'Aang', 'turns.jsonl'));
const since = flag('--since');

if (!fs.existsSync(file)) {
  console.error('no turn log at ' + file);
  process.exit(1);
}

// A half-written final line is normal: a running process appends to this file.
const rows = [];
let unparseable = 0;
for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
  if (!line.trim()) continue;
  try { rows.push(JSON.parse(line)); } catch { unparseable++; }
}
const turns = rows
  .filter(r => r && r.ts)
  .filter(r => !since || r.ts >= since)
  .sort((a, b) => a.ts.localeCompare(b.ts));

if (!turns.length) { console.error('no turns in range'); process.exit(1); }

// The distinction the first read of this file got wrong. A property check, never a
// truthiness check, so a genuine measured 0 still counts as measured.
const has = (r, k) => Object.prototype.hasOwnProperty.call(r, k) && typeof r[k] === 'number';
const measured = r => has(r, 'cacheReadTokens') && has(r, 'cacheWriteTokens');

const num = xs => xs.filter(x => typeof x === 'number' && Number.isFinite(x));
const sum = xs => xs.reduce((a, b) => a + b, 0);
const avg = xs => xs.length ? sum(xs) / xs.length : 0;
const pct = (a, b) => (b ? (100 * a / b) : 0);
const q = (xs, p) => {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(p * s.length))];
};
const n = x => Math.round(x).toLocaleString('en-US');

// ctxTokens is the whole input for the turn, so whatever the cache did not cover was
// billed at full rate. Clamped at 0: these fields are sampled from different places in
// the SDK response, and rounding between them must never manufacture a negative.
const uncachedOf = r => Math.max(0, (r.ctxTokens || 0) - r.cacheReadTokens - r.cacheWriteTokens);
const billedOf = r => uncachedOf(r) + r.cacheWriteTokens * WRITE_RATE + r.cacheReadTokens * READ_RATE;

const lanes = [...new Set(turns.map(t => t.lane || 'unknown'))].sort();
const report = {
  file, generated: new Date().toISOString(),
  range: { from: turns[0].ts, to: turns.at(-1).ts },
  turns: turns.length, unparseable, lanes: {}, sessions: [], totals: {},
};

for (const lane of lanes) {
  const all = turns.filter(t => (t.lane || 'unknown') === lane);
  const m = all.filter(measured);
  const ctx = num(all.map(t => t.ctxTokens));
  const ms = num(all.map(t => t.ms));
  const L = {
    turns: all.length,
    measured: m.length,
    unmeasured: all.length - m.length,
    ctx: { avg: avg(ctx), median: q(ctx, 0.5), p95: q(ctx, 0.95), max: ctx.length ? Math.max(...ctx) : 0 },
    latency: { avgMs: avg(ms), p95Ms: q(ms, 0.95), avgTtftMs: avg(num(all.map(t => t.ttftMs))) },
    tools: sum(num(all.map(t => t.tools))),
    flags: sum(num(all.map(t => t.flags))),
  };
  // Cost is reported ONLY over the measured subset, with the subset always stated next
  // to it, so a lane with no measured turns reports nothing rather than a confident 0.
  if (m.length) {
    const read = sum(m.map(t => t.cacheReadTokens));
    const write = sum(m.map(t => t.cacheWriteTokens));
    const uncached = sum(m.map(uncachedOf));
    const billed = sum(m.map(billedOf));
    const raw = read + write + uncached;
    L.cost = {
      cacheReadTokens: read, cacheWriteTokens: write, uncachedTokens: uncached,
      rawInputTokens: raw,
      billedTokenEquivalents: billed,
      billedPerTurn: billed / m.length,
      billedWithNoCacheAtAll: raw,          // what these turns would cost with caching off
      savedPct: pct(raw - billed, raw),
      coldStarts: m.filter(t => t.cacheReadTokens === 0 && t.cacheWriteTokens > 0).length,
    };
  }
  report.lanes[lane] = L;
}

// Sessions, by gap. A cache write only pays for itself when later turns read it, so the
// interesting unit for cost is the session, not the turn.
let cur = null;
for (const t of turns) {
  const ts = Date.parse(t.ts);
  if (!cur || ts - cur.lastTs > SESSION_GAP_MS) {
    cur = { from: t.ts, to: t.ts, lastTs: ts, rows: [] };
    report.sessions.push(cur);
  }
  cur.rows.push(t); cur.to = t.ts; cur.lastTs = ts;
}
for (const s of report.sessions) {
  const m = s.rows.filter(measured);
  s.n = s.rows.length;
  s.lanes = [...new Set(s.rows.map(t => t.lane))].join(',');
  s.measured = m.length;
  if (m.length) {
    s.write = sum(m.map(t => t.cacheWriteTokens));
    s.read = sum(m.map(t => t.cacheReadTokens));
    s.billed = sum(m.map(billedOf));
    // A write nobody ever read is quota spent for nothing: the 1.25x premium bought a
    // cache that expired before a second turn ever arrived to use it.
    s.wastedWriteTokens = s.read === 0 ? s.write : 0;
  }
  delete s.rows; delete s.lastTs;
}

const allMeasured = turns.filter(measured);
report.totals = {
  measuredTurns: allMeasured.length,
  unmeasuredTurns: turns.length - allMeasured.length,
  coveragePct: pct(allMeasured.length, turns.length),
};
if (allMeasured.length) {
  const raw = sum(allMeasured.map(t => t.cacheReadTokens + t.cacheWriteTokens + uncachedOf(t)));
  const billed = sum(allMeasured.map(billedOf));
  report.totals.rawInputTokens = raw;
  report.totals.billedTokenEquivalents = billed;
  report.totals.billedPerTurn = billed / allMeasured.length;
  report.totals.savedPct = pct(raw - billed, raw);
  report.totals.wastedWriteTokens = sum(report.sessions.map(s => s.wastedWriteTokens || 0));
  report.totals.wastedBilledEquivalents = report.totals.wastedWriteTokens * WRITE_RATE;
}

if (asJson) { console.log(JSON.stringify(report, null, 2)); process.exit(0); }

const bar = label => console.log('\n' + label + '\n' + '-'.repeat(Math.max(20, label.length)));

console.log('turn log : ' + file);
console.log('range    : ' + report.range.from.slice(0, 19) + ' -> ' + report.range.to.slice(0, 19));
console.log('turns    : ' + turns.length + (unparseable ? '  (' + unparseable + ' unparseable lines skipped)' : ''));
console.log('measured : ' + report.totals.measuredTurns + ' of ' + turns.length +
  ' (' + report.totals.coveragePct.toFixed(0) + '%) carry cache fields');
if (report.totals.unmeasuredTurns) {
  console.log('           ' + report.totals.unmeasuredTurns + ' turn(s) predate cache logging. They are EXCLUDED from every');
  console.log('           cost number below, not counted as zero. Context sizes are still shown.');
}

bar('PER LANE');
console.log('lane   turns  meas   avg ctx   med ctx   p95 ctx   avg ms   billed/turn   cache saved');
for (const [lane, L] of Object.entries(report.lanes)) {
  const c = L.cost;
  console.log([
    lane.padEnd(6),
    String(L.turns).padStart(5),
    String(L.measured).padStart(5),
    n(L.ctx.avg).padStart(9),
    n(L.ctx.median).padStart(9),
    n(L.ctx.p95).padStart(9),
    n(L.latency.avgMs).padStart(8),
    (c ? n(c.billedPerTurn) : 'not measured').padStart(13),
    (c ? c.savedPct.toFixed(0) + '%' : '-').padStart(13),
  ].join(' '));
}

bar('SESSIONS  (a gap over 30 min starts a new one; the cache itself expires after ' + CACHE_TTL_MIN + ' min)');
console.log('start                 turns  lanes        written      read   billed   note');
for (const s of report.sessions) {
  const note = s.measured === 0 ? 'no cache data'
    : s.wastedWriteTokens ? 'WRITE NEVER READ: ' + n(s.wastedWriteTokens) + ' tok at ' + WRITE_RATE + 'x bought nothing'
      : '';
  console.log([
    s.from.slice(0, 19),
    String(s.n).padStart(6),
    (s.lanes || '').padEnd(10),
    (s.measured ? n(s.write) : '-').padStart(11),
    (s.measured ? n(s.read) : '-').padStart(9),
    (s.measured ? n(s.billed) : '-').padStart(8),
    ' ' + note,
  ].join(' '));
}

if (report.totals.billedTokenEquivalents !== undefined) {
  const t = report.totals;
  bar('TOTAL  (measured turns only)');
  console.log('raw input tokens           ' + n(t.rawInputTokens).padStart(12));
  console.log('billed token equivalents   ' + n(t.billedTokenEquivalents).padStart(12) +
    '   (write ' + WRITE_RATE + 'x, read ' + READ_RATE + 'x)');
  console.log('caching saved              ' + (t.savedPct.toFixed(1) + '%').padStart(12) + '   vs sending it all uncached');
  console.log('per turn                   ' + n(t.billedPerTurn).padStart(12));
  if (t.wastedWriteTokens) {
    console.log('\ncache written but never read ' + n(t.wastedWriteTokens).padStart(10) + ' tokens');
    console.log('  costing                    ' + n(t.wastedBilledEquivalents).padStart(12) + ' billed equivalents, for nothing.');
    console.log('  That is a one-turn session: it paid the ' + WRITE_RATE + 'x write premium to build a cache,');
    console.log('  then ended before anything read it. The cache expires ' + CACHE_TTL_MIN + ' min after the write.');
  }
}

bar('WHAT IS NOT MEASURED HERE');
console.log('- output tokens: not in the log at all, so no output cost appears above.');
for (const [lane, L] of Object.entries(report.lanes)) {
  if (L.unmeasured) console.log('- ' + lane + ' lane: ' + L.unmeasured + ' of ' + L.turns + ' turns have no cache data, so its cache behaviour is UNKNOWN.');
}
console.log('- the split between system prompt, memory and conversation inside ctxTokens.');
