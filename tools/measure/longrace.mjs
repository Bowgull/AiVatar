// longrace.mjs - does a local model stay reliable deep into ONE long conversation? (2026-11-01)
//
// steprace.mjs runs each job in a fresh chat. People running Qwen3.5 as an agent report tool calls failing silently hours
// into a session (a broken template or a stray think tag piling up in the history). So here 20 jobs, 1 to 5 tool steps
// each, run back to back in a single growing conversation, scored the same way: every needed tool called, in order.
// Also counted: server errors (Ollama's HTTP 500 on a malformed call) and how long the history got.
//
//   node tools/measure/longrace.mjs model1 model2 ...
const HOST = 'http://127.0.0.1:11434';
const fn = (name, description, properties = {}, required = []) => ({ type: 'function', function: { name, description, parameters: { type: 'object', properties, required } } });
const TOOLS = [
  fn('get_time', 'The current local date and time. You do not know the time; you must call this.'),
  fn('search_memory', 'Search everything Joshua has said before.', { query: { type: 'string' } }, ['query']),
  fn('set_reminder', 'Set a reminder at a given time.', { text: { type: 'string' }, when: { type: 'string' } }, ['text', 'when']),
  fn('read_window', 'Read the text of the window Joshua is looking at.'),
  fn('present_list', 'Show Joshua a list. Use whenever the reply names two or more separate things.', { items: { type: 'array', items: { type: 'string' } } }, ['items']),
  fn('open_app', 'Open an app on his PC by name.', { name: { type: 'string' } }, ['name']),
  fn('play_media', 'Put a show, video or song on.', { what: { type: 'string' }, where: { type: 'string' } }, ['what']),
];
const RESULT = { get_time: 'Sunday 1 November 2026, 9:05 am', search_memory: 'He said he has an interview with Float next week.', set_reminder: 'reminder set',
  read_window: 'A job posting page for Float.', present_list: 'shown', open_app: 'opened', play_media: 'playing' };
const JOBS = [
  ['What time is it?', ['get_time']],
  ['Open Discord for me.', ['open_app']],
  ['What did I say about Float?', ['search_memory']],
  ['Put on Naruto.', ['play_media']],
  ['What time is it, and remind me to stretch an hour after that.', ['get_time', 'set_reminder']],
  ["Read what's on my screen and tell me what it is.", ['read_window']],
  ['Check what I said about Float, then remind me to prep for it tonight at 8.', ['search_memory', 'set_reminder']],
  ['Open Spotify and put on some lofi.', ['open_app', 'play_media']],
  ['What time is it, remind me to email Float an hour after that, then show me a list of what you just did.', ['get_time', 'set_reminder', 'present_list']],
  ['Read my screen, then search what I said about that company.', ['read_window', 'search_memory']],
  ['Check what I said before about Float, read what is on my screen, then set a reminder to follow up in an hour, and show me a list of all three things you did.', ['search_memory', 'read_window', 'set_reminder', 'present_list']],
];
const job = (i) => JOBS[i % JOBS.length];

for (const model of process.argv.slice(2)) {
  const messages = [{ role: 'system', content: 'You are Aang, a desktop assistant. Use the tools when they apply. Do not answer from your own knowledge when a tool exists for it.' }];
  let pass = 0, errors = 0; const marks = []; const t0 = performance.now();
  for (let k = 0; k < 20; k++) {
    const [ask, want] = job(k);
    messages.push({ role: 'user', content: ask });
    const called = [];
    for (let i = 0; i < want.length + 3; i++) {
      let r;
      try {
        const res = await fetch(HOST + '/api/chat', { method: 'POST', signal: AbortSignal.timeout(120_000), body: JSON.stringify({ model, stream: false, think: false, keep_alive: '10m', tools: TOOLS, options: { temperature: 0, num_predict: 600, num_ctx: 16384 }, messages }) });
        if (!res.ok) { errors++; break; }
        r = await res.json();
      } catch { errors++; break; }
      const m = r.message ?? {}; const calls = m.tool_calls ?? [];
      if (!calls.length) { messages.push({ role: 'assistant', content: m.content ?? '' }); break; }
      for (const c of calls) { called.push(c.function.name); messages.push({ role: 'assistant', tool_calls: [c] }); messages.push({ role: 'tool', content: RESULT[c.function.name] ?? 'ok' }); }
      if (want.every(w => called.includes(w))) {                                                 // let it say its line, as in real use
        try { const fin = await (await fetch(HOST + '/api/chat', { method: 'POST', body: JSON.stringify({ model, stream: false, think: false, keep_alive: '10m', options: { temperature: 0, num_predict: 120, num_ctx: 16384 }, messages }) })).json(); messages.push({ role: 'assistant', content: fin.message?.content ?? '' }); } catch { }
        break;
      }
    }
    const ok = want.every(w => called.includes(w)) && want.every((w, i) => called.indexOf(w) >= (i ? called.indexOf(want[i - 1]) : -1));
    if (ok) pass++; marks.push(ok ? '.' : 'X');
  }
  const chars = messages.reduce((n, m) => n + JSON.stringify(m).length, 0);
  console.log(`${model}: long session ${pass}/20 [${marks.join('')}], server errors ${errors}, ${(performance.now() - t0) / 1000 | 0} s, history ~${Math.round(chars / 4 / 1000)}k tokens`);
  await fetch(HOST + '/api/generate', { method: 'POST', body: JSON.stringify({ model, keep_alive: 0 }) });
}
