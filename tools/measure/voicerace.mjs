// voicerace.mjs - can a local model hold Aang's voice, and can it chain tools?
//
// WHY THIS EXISTS: modelrace.mjs measures facts, speed and ONE tool call. Everyday use
// needs the two things it does not measure, and they are the two I expect local models
// to fail: sounding like Aang, and getting through a multi-step job without drifting.
//
// The voice score is NOT my opinion and NOT another model's opinion. It runs each reply
// through Aang's own linter (`lint()` in voice.ts), the same deterministic code that
// polices his real replies, and counts what it had to fix. A reply that trips the linter
// is a reply the real Aang would have had rewritten before Joshua saw it.
//
// The multi-step test is the one that separates a chat model from an agent: three tool
// calls in order, where the second depends on the first. Error compounds here, so this
// is where a 3-bit model should show its seams if it has any.
//
//   node tools/measure/voicerace.mjs model1 model2 ...
//   THINK=off node tools/measure/voicerace.mjs ...     (needed for thinking models)
import { lint } from '../../src/Core/src/voice.ts';

const HOST = 'http://localhost:11434';
const NOTHINK = process.env.THINK === 'off';
const models = process.argv.slice(2).filter(a => !a.startsWith('--'));
if (!models.length) { console.error('usage: node tools/measure/voicerace.mjs <model> [model...]'); process.exit(1); }

// The real rules, lifted from voice.ts line 18 so the model is judged on what Aang is
// actually told, not a paraphrase of it.
const SYSTEM = `You are Aang, Joshua's desktop companion on his Windows PC.
Write plain text only: no markdown, no emoji, no exclamation marks unless he uses them first.
Speak plainly and briefly, like someone who knows him. Two or three sentences at most.
Never perform enthusiasm. Never end by offering more help. Just answer.`;

// Messages drawn from his REAL history (turns.jsonl), not invented ones.
const VOICE_CASES = [
  'morning',
  'I had a rough week, cheer me up',
  'say something nice to me',
  'what can you do?',
  'say hi in five words',
  'are you there?',
];

const TOOLS = [
  { type: 'function', function: { name: 'get_time', description: 'The current local date and time.', parameters: { type: 'object', properties: {} } } },
  { type: 'function', function: { name: 'search_memory', description: 'Search everything Joshua has said before.', parameters: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] } } },
  { type: 'function', function: { name: 'set_reminder', description: 'Set a reminder at a time.', parameters: { type: 'object', properties: { text: { type: 'string' }, when: { type: 'string' } }, required: ['text', 'when'] } } },
  { type: 'function', function: { name: 'present_list', description: 'Show Joshua a list of items. Use whenever the reply names two or more separate things.', parameters: { type: 'object', properties: { title: { type: 'string' }, items: { type: 'array', items: { type: 'string' } } }, required: ['items'] } } },
];

const post = (p, b) => fetch(HOST + p, { method: 'POST', body: JSON.stringify(NOTHINK ? { ...b, think: false } : b) }).then(r => r.json());
const unload = m => post('/api/generate', { model: m, keep_alive: 0 }).catch(() => { });

async function voice(model) {
  const out = [];
  for (const msg of VOICE_CASES) {
    const r = await post('/api/chat', { model, stream: false, options: { num_predict: 700, temperature: 0.7 }, messages: [{ role: 'system', content: SYSTEM }, { role: 'user', content: msg }] });
    const text = (r.message?.content ?? '').trim();
    // Aang's own linter decides. `fixed` is what it had to repair; empty means clean.
    const v = text ? lint(text, [], msg) : { fixed: ['EMPTY REPLY'], text: '' };
    out.push({ msg, text, broke: v.fixed ?? [], sentences: text ? text.split(/(?<=[.!?])\s+/).filter(Boolean).length : 0 });
  }
  return out;
}

// Three steps, each depending on the last. A model that can chat but not chain will
// answer in prose, or call the wrong tool, or stop after one.
async function chain(model) {
  const messages = [
    { role: 'system', content: SYSTEM + '\nUse the tools when they apply. Call them one at a time.' },
    { role: 'user', content: 'What time is it, then remind me to email Float one hour after that, and list for me the two things you just did.' },
  ];
  const steps = [];
  for (let i = 0; i < 6; i++) {
    const r = await post('/api/chat', { model, stream: false, tools: TOOLS, options: { num_predict: 700, temperature: 0 }, messages });
    const m = r.message;
    if (!m) { steps.push('ERROR ' + (r.error ?? 'no message')); break; }
    const calls = m.tool_calls ?? [];
    if (!calls.length) { steps.push('replied: ' + (m.content ?? '').trim().slice(0, 70)); break; }
    for (const c of calls) {
      steps.push(c.function.name);
      messages.push({ role: 'assistant', tool_calls: [c] });
      // Feed a plausible result so the chain can continue.
      const fake = c.function.name === 'get_time' ? 'Tuesday 30 September 2026, 2:14 pm'
        : c.function.name === 'set_reminder' ? 'reminder set'
          : c.function.name === 'present_list' ? 'shown' : 'ok';
      messages.push({ role: 'tool', content: fake });
    }
    if (calls.some(c => c.function.name === 'present_list')) break;
  }
  return steps;
}

const rows = [];
for (const model of models) {
  process.stdout.write('testing ' + model + ' ... ');
  await unload(model);
  try {
    const v = await voice(model);
    const c = await chain(model);
    rows.push({ model, v, c });
    console.log('done');
  } catch (e) { console.log('FAILED ' + e.message); rows.push({ model, error: e.message }); }
  await unload(model);
}

console.log('\n' + '='.repeat(96));
console.log('VOICE + MULTI-STEP (scored by Aang\'s own linter in voice.ts, not by a model)');
console.log('='.repeat(96));
console.log('model'.padEnd(46) + 'clean'.padStart(8) + 'avg sent'.padStart(10) + '  chain');
for (const r of rows) {
  if (r.error) { console.log(r.model.padEnd(46) + '  FAILED ' + r.error); continue; }
  const clean = r.v.filter(x => x.broke.length === 0).length;
  const avgS = (r.v.reduce((a, b) => a + b.sentences, 0) / r.v.length).toFixed(1);
  const gotList = r.c.includes('present_list');
  const gotBoth = r.c.includes('get_time') && r.c.includes('set_reminder');
  console.log(r.model.slice(0, 45).padEnd(46) + (clean + '/' + r.v.length).padStart(8) + String(avgS).padStart(10) +
    '  ' + (gotBoth && gotList ? 'ok' : gotBoth ? 'partial (no list)' : 'FAIL') + ' [' + r.c.join(' -> ') + ']');
}

for (const r of rows.filter(r => !r.error)) {
  const bad = r.v.filter(x => x.broke.length);
  if (!bad.length) continue;
  console.log('\n' + r.model + ' broke Aang\'s rules on:');
  for (const b of bad) console.log('  "' + b.msg + '" -> ' + b.broke.join(', ') + '\n     ' + b.text.slice(0, 150).replace(/\n/g, ' '));
}
console.log('\nclean = replies Aang\'s linter did not have to fix. avg sent = sentences (his rule is 2-3).');
console.log('chain = did it call get_time, then set_reminder, then present_list, in one conversation.');
