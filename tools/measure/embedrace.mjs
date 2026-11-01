// embedrace.mjs - race embedding models on his own memory: which one finds the right old conversation when he asks
// about it in different words (2026-11-01). Mechanical score: a query is a hit when one of the top 5 turns matches its
// answer pattern; the queries are paraphrases, so plain word matching is not what is being measured.
//
// The corpus is every turn in a COPY of aang.db (pass its path); the queries and patterns are inline below and say
// nothing private beyond what the patterns name. Memory search today is embeddinggemma (embed.ts).
//
//   node tools/measure/embedrace.mjs <copy-of-aang.db> embeddinggemma embeddinggemma-2:570m qwen3-embedding:0.6b
import { DatabaseSync } from 'node:sqlite';

const HOST = 'http://127.0.0.1:11434';
const QUERIES = [
  ['which job did I get furthest with', /octup/i],
  ['where do I live exactly', /symington/i],
  ['the dungeon quests I can hand to my group', /shareable|lordaeron/i],
  ['that message to my friend with the funny subject', /maya/i],
  ['the video about agents that learn skills', /hermes/i],
  ['the company a hiring manager pinged me about on linkedin', /borderless/i],
  ['what dessert do I like', /pie/i],
  ['directions to the place in burlington', /burlington|rowely/i],
  ['when your sign in broke', /oauth|authenticat|login had expired/i],
  ['add-ons for your browser', /extension/i],
  ['the warm clothes in the zelda game', /doublet|dublet/i],
  ['getting from the undead city to the tauren capital', /thunder bluff/i],
  ["the recruiter's test before the interview", /rhea|assessment/i],
  ['that rock concert video in london', /foo fighters|wembl/i],
  ['the short video about open source projects for you', /patchwright|tiktok/i],
];

async function embed(model, input) {
  const r = await fetch(HOST + '/api/embed', { method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ model, input, keep_alive: '10m' }), signal: AbortSignal.timeout(300_000) });
  if (!r.ok) throw new Error(`${r.status} ${(await r.text()).slice(0, 160)}`);
  return (await r.json()).embeddings;
}
const norm = (v) => { const n = Math.hypot(...v) || 1; return v.map(x => x / n); };
const dot = (a, b) => { let s = 0; for (let i = 0; i < a.length; i++) s += a[i] * b[i]; return s; };

const [dbPath, ...models] = process.argv.slice(2);
const db = new DatabaseSync(dbPath, { readOnly: true });
const turns = db.prepare("SELECT text FROM turns WHERE length(text) > 8").all().map(r => String(r.text).slice(0, 2000));
console.log(`${turns.length} turns, ${QUERIES.length} queries`);

for (const model of models) {
  try {
    const t0 = performance.now();
    const docs = [];
    for (let i = 0; i < turns.length; i += 64) docs.push(...(await embed(model, turns.slice(i, i + 64))).map(norm));
    const indexMs = performance.now() - t0;
    let hits = 0; const qms = []; const missed = [];
    for (const [q, want] of QUERIES) {
      const q0 = performance.now(); const v = norm((await embed(model, [q]))[0]); qms.push(performance.now() - q0);
      const top = docs.map((d, i) => [dot(v, d), i]).sort((a, b) => b[0] - a[0]).slice(0, 5);
      if (top.some(([, i]) => want.test(turns[i]))) hits++; else missed.push(q);
    }
    qms.sort((a, b) => a - b);
    console.log(`\n${model}: ${hits}/${QUERIES.length} found in top 5, query ${qms[qms.length >> 1].toFixed(0)} ms median, indexing ${(indexMs / 1000).toFixed(1)} s, ${docs[0].length} dims`);
    for (const m of missed) console.log('   missed: ' + m);
  } catch (e) { console.log(`\n${model}: could not run (${e.message})`); }
}
