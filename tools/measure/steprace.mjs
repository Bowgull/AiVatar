// steprace.mjs - find the exact step count where a local model stops being reliable.
//
// WHY THIS EXISTS: the research says per-step accuracy compounds - 97% per step is 74%
// over ten steps - and that 3-bit quantisation costs 1-3% on single-shot work but 10-15%
// on real multi-step work. That predicts a cliff somewhere between "one tool call" and
// "a whole job". Nobody can tell us where the cliff is for THIS model on THIS card, so
// this measures it: the same job at 1, 2, 3, 4 and 5 dependent steps, repeated, scored
// mechanically on whether the right tools were called in the right order.
//
// The line it finds is the line in Aang's design: below it local can own the job, above
// it Claude must. That is the only number that actually decides the architecture.
//
//   THINK=off node tools/measure/steprace.mjs <model> [model...]
//   REPS=5 THINK=off node tools/measure/steprace.mjs <model>
const HOST = 'http://localhost:11434';
const NOTHINK = process.env.THINK === 'off';
const REPS = Number(process.env.REPS ?? 3);
const models = process.argv.slice(2).filter(a => !a.startsWith('--'));
if (!models.length) { console.error('usage: THINK=off node tools/measure/steprace.mjs <model>...'); process.exit(1); }

const TOOLS = [
  { name: 'get_time', description: 'The current local date and time. You do not know the time; you must call this.', parameters: { type: 'object', properties: {} } },
  { name: 'search_memory', description: 'Search everything Joshua has said before.', parameters: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] } },
  { name: 'set_reminder', description: 'Set a reminder at a given time.', parameters: { type: 'object', properties: { text: { type: 'string' }, when: { type: 'string' } }, required: ['text', 'when'] } },
  { name: 'read_window', description: 'Read the text of the window Joshua is looking at.', parameters: { type: 'object', properties: {} } },
  { name: 'present_list', description: 'Show Joshua a list. Use whenever the reply names two or more separate things.', parameters: { type: 'object', properties: { items: { type: 'array', items: { type: 'string' } } }, required: ['items'] } },
].map(f => ({ type: 'function', function: f }));

// Each job needs exactly N tool calls, and each step depends on the one before it.
const JOBS = [
  { n: 1, ask: 'What time is it?', want: ['get_time'] },
  { n: 2, ask: 'What time is it, and remind me to email Float one hour after that.', want: ['get_time', 'set_reminder'] },
  { n: 3, ask: 'What time is it, remind me to email Float an hour after that, then show me a list of what you just did.', want: ['get_time', 'set_reminder', 'present_list'] },
  { n: 4, ask: 'Check what I said before about Float, read what is on my screen, then set a reminder to follow up in an hour, and show me a list of all three things you did.', want: ['search_memory', 'read_window', 'set_reminder', 'present_list'] },
  { n: 5, ask: 'Tell me the time, search what I said about Float, read my screen, set a reminder for an hour from now, then list everything you did.', want: ['get_time', 'search_memory', 'read_window', 'set_reminder', 'present_list'] },
];

const RESULT = { get_time: 'Tuesday 30 September 2026, 2:14 pm', search_memory: 'He said he has an interview with Float next week.', set_reminder: 'reminder set', read_window: 'A job posting page for Float.', present_list: 'shown to him' };

const post = b => fetch(HOST + '/api/chat', { method: 'POST', body: JSON.stringify(NOTHINK ? { ...b, think: false } : b) }).then(r => r.json());

async function runJob(model, job) {
  const messages = [{ role: 'system', content: 'You are Aang, a desktop assistant. Use the tools when they apply. Do not answer from your own knowledge when a tool exists for it.' }, { role: 'user', content: job.ask }];
  const called = [];
  for (let i = 0; i < job.n + 3; i++) {                     // room to finish, not room to loop forever
    const r = await post({ model, stream: false, tools: TOOLS, options: { num_predict: 800, temperature: 0 }, messages });
    const m = r.message;
    if (!m) return { called, why: 'error: ' + (r.error ?? 'no message') };
    const calls = m.tool_calls ?? [];
    if (!calls.length) return { called, why: called.length ? 'stopped early and replied' : 'never called a tool, answered from its own head' };
    for (const c of calls) {
      called.push(c.function.name);
      messages.push({ role: 'assistant', tool_calls: [c] });
      messages.push({ role: 'tool', content: RESULT[c.function.name] ?? 'ok' });
    }
    if (job.want.every(w => called.includes(w))) return { called, why: '' };
  }
  return { called, why: 'ran out of turns' };
}

const grid = [];
for (const model of models) {
  process.stdout.write(model + ': ');
  const row = { model, cells: [] };
  for (const job of JOBS) {
    let pass = 0; const notes = new Set();
    for (let r = 0; r < REPS; r++) {
      try {
        const out = await runJob(model, job);
        // Pass = every needed tool called, in the right order, nothing invented.
        const ok = job.want.every(w => out.called.includes(w)) &&
          job.want.every((w, i) => out.called.indexOf(w) >= (i ? out.called.indexOf(job.want[i - 1]) : -1));
        if (ok) pass++; else if (out.why) notes.add(out.why);
      } catch (e) { notes.add(e.message.slice(0, 40)); }
    }
    row.cells.push({ n: job.n, pass, of: REPS, notes: [...notes] });
    process.stdout.write(pass === REPS ? '.' : pass === 0 ? 'X' : '?');
  }
  try { await fetch(HOST + '/api/generate', { method: 'POST', body: JSON.stringify({ model, keep_alive: 0 }) }); } catch { }
  grid.push(row); console.log('');
}

console.log('\n' + '='.repeat(88));
console.log('WHERE MULTI-STEP BREAKS  (' + REPS + ' runs per job, pass = right tools in right order)');
console.log('='.repeat(88));
console.log('model'.padEnd(46) + JOBS.map(j => (j.n + ' step').padStart(8)).join(''));
for (const r of grid) console.log(r.model.slice(0, 45).padEnd(46) + r.cells.map(c => (c.pass + '/' + c.of).padStart(8)).join(''));

for (const r of grid) {
  const bad = r.cells.filter(c => c.pass < c.of && c.notes.length);
  if (!bad.length) continue;
  console.log('\n' + r.model + ':');
  for (const c of bad) console.log('  ' + c.n + ' steps: ' + c.notes.join(' | '));
}
console.log('\nThe last column with a full score is where local can be trusted to own the job.');
console.log('Anything past it belongs to Claude.');
