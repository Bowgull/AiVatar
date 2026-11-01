// answerrace.mjs - can a local model answer small talk and plain knowledge as Aang, fast (2026-11-01, "instant answers")?
//
// The router (routerace.mjs) keeps two lanes local: talk and know. This races who answers them: first word, finished
// reply, the facts it must get right (mechanical), and how many fixes Aang's own linter (voice.ts lint) had to make.
// The system prompt is Aang's real VOICE_CORE, so the model is judged on what Aang is actually told.
//
//   node tools/measure/answerrace.mjs qwen3.5:4b qwen3.5-35b-a3b:iq3
import { VOICE_CORE, lint } from '../../src/Core/src/voice.ts';

const HOST = 'http://127.0.0.1:11434';
const SYSTEM = `You are Aang, Joshua's companion: a small pixel-art Air Nomad monk kid who lives on his desktop. You are curious and light on your feet, you like games, food and flying, and you have small opinions you are happy to say out loud. You are a pet program; you have no tools in this reply, so answer from what you know.\n${VOICE_CORE}`;
const ASKS = [
  ['hey checking in'], ['how are you man'], ['just kmaking sure youre good pal'], ['do you like the chibi'], ['I had a rough week, cheer me up'],
  ['whats your favourite thing about living on my desktop?'], ['tell me a one line fun fact'], ['say hi in five words'], ['lol nice'], ['Morning. Are you there?'],
  ['who wrote the book Neuromancer?', /gibson/i], ['explain in two sentences why the sky is blue', /scatter/i], ['whats the highest mountain on earth', /everest/i],
  ['what is the capital of France?', /paris/i], ['where can i get the warm dublet or whatever its called in botw', /old man|plateau|hateno/i],
  ['whats the fastest way from undercity to thunder bluff?', /zeppelin|orgrimmar|portal/i], ['how long do i boil an egg for soft yolk', /\b[4-7]\b|six|five|seven/i],
  ['whats a good name for a pet frog'], ['who wrote the book Dune?', /herbert/i], ['how many hearts does an octopus have', /three|\b3\b/i],
];

async function one(model, text) {
  const t0 = performance.now(); let first = 0, out = '';
  const r = await fetch(HOST + '/api/chat', { method: 'POST', body: JSON.stringify({ model, stream: true, think: false, keep_alive: '30m',
    options: { temperature: 0.7, num_predict: 160 }, messages: [{ role: 'system', content: SYSTEM }, { role: 'user', content: text }] }) });
  const dec = new TextDecoder(); let buf = '';
  for await (const chunk of r.body) {
    buf += dec.decode(chunk, { stream: true });
    let i; while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i); buf = buf.slice(i + 1); if (!line.trim()) continue;
      const j = JSON.parse(line); const piece = j.message?.content ?? '';
      if (piece && !first) first = performance.now() - t0; out += piece;
    }
  }
  return { first, done: performance.now() - t0, out: out.trim() };
}

for (const model of process.argv.slice(2)) {
  await one(model, 'hi');                                                       // load it; not timed
  let right = 0, facts = 0, fixes = 0; const firsts = [], dones = [];
  console.log(`\n== ${model}`);
  for (const [text, want] of ASKS) {
    const r = await one(model, text); firsts.push(r.first); dones.push(r.done);
    const flags = lint(r.out, [], text, 'plain').flags; fixes += flags.length;
    if (want) { facts++; if (want.test(r.out)) right++; }
    console.log(`  ${(r.first / 1000).toFixed(2)}s/${(r.done / 1000).toFixed(2)}s ${want ? (want.test(r.out) ? 'RIGHT' : 'WRONG') : '     '} ${flags.length ? '[' + flags.join(',') + '] ' : ''}${text.slice(0, 30)} => ${r.out.replace(/\s+/g, ' ').slice(0, 150)}`);
  }
  const med = (xs) => [...xs].sort((a, b) => a - b)[xs.length >> 1];
  console.log(`${model}: facts ${right}/${facts}, linter fixes ${fixes}, first word ${(med(firsts) / 1000).toFixed(2)} s, done ${(med(dones) / 1000).toFixed(2)} s (medians)`);
}
