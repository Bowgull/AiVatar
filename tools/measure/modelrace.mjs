// modelrace.mjs - race local models on THIS machine, on Aang's real jobs.
//
// WHY THIS EXISTS: on 2026-09-30 the fit-checker websites disagreed with each other
// and with the card. WillItRunAI said Gemma 4 12B "will not fit" at 15.7 GB; it runs at
// 8.1 GB here. So nothing about which local model to use is settled by a website or
// by a maker's own benchmark. This measures four things on the real card, for every
// model, with the same inputs each time:
//
//   1. memory   real VRAM the model holds once loaded, from nvidia-smi
//   2. speed    words per second writing, and seconds before the first word
//   3. facts    pull durable facts out of a real document (scored by checking each
//               expected fact, which is mechanical, not another model's opinion)
//   4. tool     does it produce a valid tool call with the right name and arguments
//
// The THINKING TRAP: think:false is not always honoured (qwen3-vl:8b ignored it and
// burned its whole budget), so a thinking model ALSO gets a generous token budget and the
// score counts only the final answer. An empty final answer is a FAIL and is reported as
// one, never skipped. It is now sent BY DEFAULT, because that is what Aang does; measuring
// with thinking on measures a mode nothing runs. Use THINK=on to compare deliberately.
//
//   node tools/measure/modelrace.mjs model1 model2 ...
//   node tools/measure/modelrace.mjs --list          models installed right now
import { execSync } from 'node:child_process';

const HOST = 'http://localhost:11434';
// Generous enough that EMPTY means the model really could not finish, not that it ran out of room.
//
// Raised from 1500 on 2026-10-03 after a wrong diagnosis worth recording. Qwen3.5-35B scored EMPTY with
// thinking on, and on a SHORT prompt it turned out to need only ~1,600 thinking tokens and answered
// fine at 4000 - which looked like proof that 1500 was simply too small.
//
// It was not. On this file's real extract prompt the same model thinks until whatever budget it is
// given is gone: 1,537 tokens at a budget of 1500, and 3,967 at a budget of 4000, answering neither
// time. Its thinking expands to fill the space. So EMPTY here is a genuine failure of that model in
// that mode, and the budget is 4000 only so nobody has to wonder about it again.
const BUDGET = 4000;

const models = process.argv.slice(2).filter(a => !a.startsWith('--'));
if (process.argv.includes('--list') || !models.length) {
  const r = await (await fetch(HOST + '/api/tags')).json();
  for (const m of r.models) console.log(m.name.padEnd(56), (m.size / 1e9).toFixed(1) + ' GB');
  process.exit(0);
}

// A document with durable facts AND the things a sloppy extractor wrongly keeps.
// Every fact below is either expected (must appear) or a trap (must not).
const DOC = `From: Joshua Bocas
Re: where things stand, September 2026

I've been at PayMyTuition as an Account Manager since January. Before that I was at IPEX
and Skytale Digital. I live in Toronto. I'm job hunting hard right now because I want to
move into systems and automation work, and I have an interview with Float next week.

I play World of Warcraft most nights, mostly raiding on Tuesdays and Thursdays. I'm on
level 15 in the beta with my first character. Haha, I was so tired last night I just
wanted to lie down. Anyway.

I'm building a desktop assistant called Aang on the side. It runs on my Shadow cloud PC.
My resume is tailored per posting and I keep a tracker of every application in a Google
Sheet. Oh and I asked someone today what the tallest mountain in the world was, forgot.
I never want an application sent until I have seen the draft.`;

const EXPECT = [
  ['PayMyTuition', /paymytuition/i],
  ['Account Manager', /account manager/i],
  ['Toronto', /toronto/i],
  ['job hunting', /job.?(hunt|search)|looking for (a )?job/i],
  ['WoW', /warcraft|\bwow\b/i],
  ['raids Tue/Thu', /tuesday|thursday|raid/i],
  ['builds Aang', /aang/i],
  ['wants draft approval', /draft|approv|before.*(sent|submit)/i],
];
const TRAPS = [
  ['mood kept as a fact', /tired|lie down/i],
  ['one-off question kept', /tallest mountain/i],
];

const EXTRACT_PROMPT = `Extract DURABLE FACTS about Joshua from the text below: his job, where he lives, hobbies, projects, preferences, schedule.
A fact must still be true next month. Do NOT include passing moods, one-off questions he asked, or what he was doing in a single moment.
One short sentence per fact, each starting with "Joshua". No duplicates. Output ONLY a numbered list.

TEXT:
${DOC}`;

const TOOLS = [{
  type: 'function',
  function: {
    name: 'set_reminder',
    description: 'Set a reminder for Joshua at a specific time.',
    parameters: {
      type: 'object',
      properties: {
        text: { type: 'string', description: 'what to remind him about' },
        when: { type: 'string', description: 'when, as he said it, e.g. "tomorrow at 9am"' },
      },
      required: ['text', 'when'],
    },
  },
}];
const TOOL_ASK = 'Remind me to send the Float follow-up email tomorrow at 9am.';

const vram = () => {
  try { return Number(execSync('nvidia-smi --query-gpu=memory.used --format=csv,noheader,nounits', { encoding: 'utf8' }).trim().split('\n')[0]); }
  catch { return NaN; }
};
// Thinking OFF by default, because that is how Aang actually calls these models (local.ts always sends
// think:false). Measuring them with thinking ON measures something nobody runs.
//
// This default was the other way round and it nearly cost a wrong decision on 2026-10-03: Qwen3.5-35B
// came back EMPTY twice, burning 1,600 tokens thinking, which read exactly like the model had regressed
// since the September race. It had not. With thinking off, as Aang sends it, the same model answers in
// 2.9 seconds with 7/8. Set THINK=on to measure the other way deliberately.
const NOTHINK = process.env.THINK !== 'on';
const post = (path, body) => fetch(HOST + path, { method: 'POST', body: JSON.stringify(NOTHINK && path === '/api/chat' ? { ...body, think: false } : body) }).then(r => r.json());
const unload = async m => { try { await post('/api/generate', { model: m, keep_alive: 0 }); } catch { /* already gone */ } };

async function race(model) {
  const row = { model };
  await unload(model);
  await new Promise(r => setTimeout(r, 1500));
  const before = vram();

  // 1+2. load it and time a plain answer
  const t0 = Date.now();
  const warm = await post('/api/chat', { model, stream: false, messages: [{ role: 'user', content: 'Say the word ready.' }], options: { num_predict: BUDGET, temperature: 0 } });
  row.loadSec = +((Date.now() - t0) / 1000).toFixed(1);
  if (warm.error) { row.error = warm.error; return row; }
  row.vramGB = +((vram() - before) / 1024).toFixed(1);

  // 3. facts
  const f0 = Date.now();
  const fx = await post('/api/chat', { model, stream: false, messages: [{ role: 'user', content: EXTRACT_PROMPT }], options: { num_predict: BUDGET, temperature: 0.1 } });
  const out = (fx.message?.content ?? '').trim();
  row.factsSec = +((Date.now() - f0) / 1000).toFixed(1);
  row.wordsPerSec = +((fx.eval_count ?? 0) / Math.max(0.001, (fx.eval_duration ?? 1) / 1e9)).toFixed(1);
  row.thoughtTokens = (fx.message?.thinking ?? '').length ? Math.round((fx.message.thinking.length) / 3.7) : 0;
  row.answerEmpty = out.length === 0;
  row.found = EXPECT.filter(([, re]) => re.test(out)).map(([n]) => n);
  row.missed = EXPECT.filter(([, re]) => !re.test(out)).map(([n]) => n);
  row.trapsHit = TRAPS.filter(([, re]) => re.test(out)).map(([n]) => n);

  // 4. tool call
  const c0 = Date.now();
  const tc = await post('/api/chat', { model, stream: false, tools: TOOLS, messages: [{ role: 'user', content: TOOL_ASK }], options: { num_predict: BUDGET, temperature: 0 } });
  row.toolSec = +((Date.now() - c0) / 1000).toFixed(1);
  const call = tc.message?.tool_calls?.[0]?.function;
  row.toolOk = !!call && call.name === 'set_reminder' && typeof call.arguments?.text === 'string' && /9/.test(String(call.arguments?.when ?? ''));
  row.toolSeen = call ? JSON.stringify(call).slice(0, 110) : (tc.error ? 'ERROR ' + tc.error : 'no tool call made');
  if (tc.error) row.toolNote = tc.error;

  await unload(model);
  return row;
}

const rows = [];
for (const m of models) {
  process.stdout.write('racing ' + m + ' ... ');
  try { const r = await race(m); rows.push(r); console.log(r.error ? 'FAILED: ' + r.error : 'done'); }
  catch (e) { console.log('FAILED: ' + e.message); rows.push({ model: m, error: e.message }); }
}

console.log('\n' + '='.repeat(100));
console.log('RACE RESULTS (this machine: RTX 2000 Ada, 15.3 GB)');
console.log('='.repeat(100));
console.log('model'.padEnd(46) + 'VRAM'.padStart(7) + 'w/sec'.padStart(7) + 'facts'.padStart(8) + 'traps'.padStart(7) + 'tool'.padStart(6) + 'secs'.padStart(7));
for (const r of rows) {
  if (r.error) { console.log(r.model.padEnd(46) + '  FAILED: ' + r.error.slice(0, 50)); continue; }
  console.log(
    r.model.slice(0, 45).padEnd(46) +
    (r.vramGB + 'G').padStart(7) +
    String(r.wordsPerSec).padStart(7) +
    (r.answerEmpty ? 'EMPTY' : r.found.length + '/' + EXPECT.length).padStart(8) +
    String(r.trapsHit.length).padStart(7) +
    (r.toolOk ? 'ok' : 'FAIL').padStart(6) +
    String(r.factsSec).padStart(7));
}
console.log('\nfacts = expected facts found (of ' + EXPECT.length + '). traps = junk wrongly kept (0 is best). secs = time for the fact job.');
for (const r of rows.filter(r => !r.error)) {
  if (r.missed.length || r.trapsHit.length || !r.toolOk || r.answerEmpty)
    console.log('\n' + r.model + (r.answerEmpty ? '\n  EMPTY ANSWER: it spent its whole budget thinking (' + r.thoughtTokens + ' tokens)' : '') +
      (r.missed.length ? '\n  missed : ' + r.missed.join(', ') : '') +
      (r.trapsHit.length ? '\n  KEPT JUNK: ' + r.trapsHit.join(', ') : '') +
      (!r.toolOk ? '\n  tool   : ' + r.toolSeen : ''));
}
