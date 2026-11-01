// routerace.mjs - race routers on THIS machine: which small model can say where a message goes, how fast, how often right.
//
// WHY (2026-11-01, his "instant answers"): Auto sends everything that is not plain small talk to Smart (route.ts), so a
// trivia question waits seconds on Claude and spends quota. A router in front could keep small talk and plain knowledge
// local. A router is only worth having if it is fast (tens of ms, not seconds) and almost never sends a message LOWER than
// it should go: a question about his email answered by a small model with no tools is the dangerous miss, a trivia
// question sent to Claude only costs a little time. So two scores: exact, and unsafe (sent lower than its label).
//
// Lanes, lowest first: talk (Aang answers small talk himself), know (general knowledge, no tools), mine (his stuff, tools,
// actions, live data: Claude), deep (big planning or research: Opus or a job). The set is his real messages, labelled by
// hand: Documents/Aang/reports/scoreboard/routes.json (private, his words).
//
//   node tools/measure/routerace.mjs rules d3:2b lfm3:1.7b qwen3.5:4b ...
// "rules" is today's route.ts. A model name starting d3 or strands-decider is asked as a decision model (/v1/systemone
// choice); anything else is asked to answer with one word in a JSON schema, thinking off, as Aang calls local models.
import { readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { isSmallTalk } from '../../src/Core/src/route.ts';

const HOST = 'http://127.0.0.1:11434';
const LANES = ['talk', 'know', 'mine', 'deep'];
const set = JSON.parse(readFileSync(path.join(os.homedir(), 'Documents', 'Aang', 'reports', 'scoreboard', 'routes.json'), 'utf8')).routes
  .map(([t, l]) => [t.replace(/^added: /, ''), l]);

const DESCRIBE = {
  talk: 'Small talk with Aang himself: a greeting, checking in, how are you, feelings, a joke or a line about Aang. Nothing to look up.',
  know: 'General knowledge or a short explanation anyone could answer from memory: facts, how-to, games, recipes. Nothing about Joshua himself, nothing live, nothing to do.',
  mine: "Needs Joshua's own things or an action: his email, calendar, memory of past chats, files, apps to open or close, reminders, the weather, the web or anything recent, his Mac, Claude sessions.",
  deep: 'A big job: plan, build, research, compare several things or go through many items, with several steps.',
};
const PROMPT = `You route messages for Aang, a desktop assistant. Pick where this message goes.
${LANES.map(l => `${l}: ${DESCRIBE[l]}`).join('\n')}
If unsure between two, pick the later one in that list. Answer with JSON only.`;

async function post(p, body, ms = 60_000) {
  const r = await fetch(HOST + p, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(ms) });
  if (!r.ok) throw new Error(`${r.status} ${(await r.text()).slice(0, 200)}`);
  return r.json();
}

const decider = (m) => /^(d3|strands-decider)/.test(m);
async function ask(model, text) {
  if (model === 'rules') return isSmallTalk(text) ? 'talk' : 'mine';
  if (decider(model)) {
    const j = await post('/v1/systemone', { model, state: text, keep_alive: '30m', questions: { route: { type: 'choice',
      instructions: 'Where should this message to a desktop assistant go?', criteria: DESCRIBE } } });
    const a = j.answers?.route ?? {};
    const probs = a.choice ?? a.probabilities ?? a.scores ?? a;
    if (typeof probs === 'string') return probs;
    return Object.entries(probs).filter(([k]) => LANES.includes(k)).sort((x, y) => y[1] - x[1])[0]?.[0] ?? 'ERR:' + JSON.stringify(j).slice(0, 120);
  }
  // One plain word, not a JSON schema: measured on qwen3.5:4b, 298 ms against 542 ms for the same answers. The message is
  // quoted inside a question, or a small model answers the message itself ("hey" -> "Hello").
  const j = await post('/api/chat', { model, stream: false, think: false, keep_alive: '30m',
    options: { temperature: 0, num_predict: 3 },
    messages: [{ role: 'system', content: PROMPT.replace('Answer with JSON only.', 'Answer with one word.') },
      { role: 'user', content: `Message: "${text}"\nWhich route? One word: ${LANES.join(', ')}.` }] });
  const word = String(j.message?.content ?? '').toLowerCase().match(/talk|know|mine|deep/)?.[0];
  return word ?? 'ERR:' + String(j.message?.content).slice(0, 60);
}

const vram = async () => { try { const j = await (await fetch(HOST + '/api/ps')).json(); return j.models.map(m => `${m.name} ${(m.size_vram / 1e9).toFixed(1)}GB/${(m.size / 1e9).toFixed(1)}GB`).join(', '); } catch { return '?'; } };

for (const model of process.argv.slice(2)) {
  try { await ask(model, 'hello'); } catch (e) { console.log(`${model}: could not run (${e.message})`); continue; }   // load it; not timed
  let exact = 0, unsafe = 0; const ms = [], misses = [];
  for (const [text, want] of set) {
    const t0 = performance.now();
    let got; try { got = await ask(model, text); } catch (e) { got = 'ERR:' + e.message.slice(0, 40); }
    ms.push(performance.now() - t0);
    if (got === want) exact++;
    else {
      if (!LANES.includes(got) || LANES.indexOf(got) < LANES.indexOf(want)) unsafe++;
      misses.push(`${want}->${got}: ${text.slice(0, 50)}`);
    }
  }
  ms.sort((a, b) => a - b);
  console.log(`\n${model}: exact ${exact}/${set.length}, UNSAFE ${unsafe}, median ${ms[ms.length >> 1].toFixed(0)} ms, p90 ${ms[Math.floor(ms.length * 0.9)].toFixed(0)} ms | ${model === 'rules' ? 'no model' : await vram()}`);
  for (const m of misses) console.log('   ' + m);
}
