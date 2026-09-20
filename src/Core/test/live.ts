// Live check of the Core against real Claude (spends a few thousand tokens). Not part of `npm test`.
//   npm run live
import { WebSocket } from 'ws';
import { DatabaseSync } from 'node:sqlite';
import { cpSync, mkdtempSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Core } from '../src/core.ts';
import type { TurnRecord } from '../src/core.ts';
import { fetchWeather } from '../src/tools.ts';

const PORT = 47999;

// Work on a COPY of Joshua's data. An earlier version of this test wrote its test turns into his real memory.
const realData = path.join(os.homedir(), 'Documents', 'Aang');
const dataDir = mkdtempSync(path.join(os.tmpdir(), 'aang-live-data-'));
cpSync(path.join(realData, 'Brain'), path.join(dataDir, 'Brain'), { recursive: true });
new DatabaseSync(path.join(realData, 'aang.db')).exec(`VACUUM INTO '${path.join(dataDir, 'aang.db').replace(/\\/g, '/')}'`);

const core = new Core({
  port: PORT,
  dataDir,
  stateDir: path.join(os.tmpdir(), 'aang-live-state'),
  warm: true,
});
const records: TurnRecord[] = [];
core.onTurn = r => records.push(r);
await core.start();

const results: { name: string; ok: boolean }[] = [];
const check = (name: string, ok: boolean, detail = '') => { results.push({ name, ok }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  ' + detail : ''}`); };

const ws = new WebSocket(`ws://127.0.0.1:${PORT}/body`);
await new Promise<void>(r => ws.once('open', () => r()));
const inbox: any[] = [];
ws.on('message', d => inbox.push({ at: Date.now(), ...JSON.parse(String(d)) }));
ws.send(JSON.stringify({ t: 'hello', v: 1 }));

let n = 0;
async function ask(text: string, extra: Record<string, unknown> = {}, timeout = 90_000) {
  const id = `t${++n}`;
  const from = inbox.length;
  const t0 = Date.now();
  ws.send(JSON.stringify({ t: 'submit', id, text, ...extra }));
  const deadline = t0 + timeout;
  while (Date.now() < deadline) {
    const msgs = inbox.slice(from);
    const fin = msgs.find(m => (m.t === 'bubble' && m.stream === false && m.id === id) || (m.t === 'error' && m.id === id) || (m.t === 'consent' && m.id === id));
    if (fin) {
      const ack = msgs.find(m => m.t === 'ack' && m.id === id);
      const firstText = msgs.find(m => m.t === 'bubble' && m.id === id && m.text);
      return { id, msgs, fin, text: (fin.text ?? '') as string, ackMs: ack ? ack.at - t0 : null, firstMs: firstText ? firstText.at - t0 : null, doneMs: fin.at - t0 };
    }
    await new Promise(r => setTimeout(r, 20));
  }
  throw new Error('timed out waiting for reply to: ' + text);
}
const lastRecord = () => records[records.length - 1]!;

console.log('--- first real message right after start (the warm-up may still be running) ---');
const a = await ask('hey');
check('acknowledged within 100 ms', (a.ackMs ?? 999) <= 100, `ack ${a.ackMs} ms`);
check('replies with real text', a.fin.t === 'bubble' && a.text.length > 0, JSON.stringify(a.text));
console.log(`      first text ${a.firstMs} ms, done ${a.doneMs} ms, ctx ${lastRecord().ctxTokens} tokens`);

console.log('--- warm turns ---');
const b = await ask('whats the time');
check('time question calls get_time and says so', lastRecord().tools.some(t => t.endsWith('get_time')) && /\d{1,2}:\d{2}/.test(b.text), JSON.stringify(b.text));
check('shows a tool receipt to the Body', b.msgs.some(m => m.t === 'tool' && m.label === 'checking the time'));
check('tool turn shows first text within 2500 ms (two model round trips)', (b.firstMs ?? 99999) <= 2500, `first text ${b.firstMs} ms`);

const c = await ask('is it nice out');
const wx = await fetchWeather();
const temp = Math.round(Number(/, (-?\d+) C \(/.exec(wx)?.[1]));
check('weather answer comes from the tool and matches it', lastRecord().tools.some(t => t.endsWith('get_weather')) && new RegExp(`\\b(${temp - 1}|${temp}|${temp + 1})\\b`).test(c.text), `tool: ${wx} | reply: ${JSON.stringify(c.text)}`);

const top = core.memory.search('what did we say about dinner recipes?', 3);
check('the search tool itself returns the dinner conversation first', top.slice(0, 2).some(h => /dinner|recipes/i.test(h.text)), JSON.stringify(top.map(h => h.text)));
const d = await ask('what did we say about dinner recipes?');
check('memory question searches history and answers from what it found', lastRecord().tools.some(t => t.endsWith('search_memory')) && /(dinner|recipe)/i.test(d.text) && !/(no record|any record|nothing (about|on|found)|not? (finding )?anything)/i.test(d.text), JSON.stringify(d.text));

const e = await ask('opne firefx');
check('understands the typo and does not pretend to have opened it', /(can'?t|cannot|not yet|unable|don'?t)/i.test(e.text) && !/\b(opened it|i opened|opening firefox now)\b/i.test(e.text), JSON.stringify(e.text));

const f = await ask('do you like the chibi');
check('resolves "the chibi" to itself instead of asking what it means', !/\b(what|which|who)\b[^.?]*chibi/i.test(f.text), JSON.stringify(f.text));
check('does not invent how it looks or animates (it has no eyes)', /(can'?t|don'?t|cannot|no way to) (really )?see/i.test(f.text) || !/(bounce|animation|amber|outline|colou?r|pixel|smooth|looks? (good|great|nice|clean))/i.test(f.text), JSON.stringify(f.text));

console.log('--- stop ---');
{
  const id = `t${++n}`; const from = inbox.length;
  ws.send(JSON.stringify({ t: 'submit', id, text: 'write me a long detailed story about a pelican who learns to fly, at least 300 words', mode: 'quick' }));
  while (!inbox.slice(from).some(m => m.t === 'bubble' && m.stream === true && m.id === id)) await new Promise(r => setTimeout(r, 10));
  const tStop = Date.now();
  ws.send(JSON.stringify({ t: 'stop', id }));
  while (!inbox.slice(from).some(m => m.t === 'bubble.clear')) await new Promise(r => setTimeout(r, 5));
  const stopMs = Date.now() - tStop;
  check('stop clears the bubble within 500 ms', stopMs <= 500, `${stopMs} ms`);
  const g = await ask('say ok');
  check('Core answers normally after a stop', g.fin.t === 'bubble' && g.text.length > 0, JSON.stringify(g.text));
}

console.log('--- queue ---');
{
  const from = inbox.length;
  ws.send(JSON.stringify({ t: 'submit', id: 'q1', text: 'say the word alpha', mode: 'quick' }));
  ws.send(JSON.stringify({ t: 'submit', id: 'q2', text: 'say the word bravo', mode: 'quick' }));
  const deadline = Date.now() + 60_000;
  const done = () => inbox.slice(from).filter(m => m.t === 'bubble' && m.stream === false).map(m => m.id);
  while (done().length < 2 && Date.now() < deadline) await new Promise(r => setTimeout(r, 20));
  check('second message is reported as queued', inbox.slice(from).some(m => m.t === 'queued' && m.id === 'q2'));
  check('queued messages are answered in order', JSON.stringify(done()) === JSON.stringify(['q1', 'q2']), JSON.stringify(done()));
}

console.log('--- quota ---');
const qm = inbox.filter(m => m.t === 'quota').pop();
check('live quota reaches the Body', !!qm && qm.week >= 0 && qm.week <= 1 && qm.five >= 0, qm ? `five-hour ${Math.round(qm.five * 100)}%, week ${Math.round(qm.week * 100)}%, level ${qm.level}` : 'none');

console.log('--- saving quota (opt-in) ---');
ws.send(JSON.stringify({ t: 'saving', on: true }));
const h = await ask('please debug this in detail step by step', { mode: 'smart' });
check('bigger model needs consent while saving', h.fin.t === 'consent');
const i = await ask('say ok', { mode: 'smart', once: true });
check('once grants a single bigger-model turn', i.fin.t === 'bubble' && i.fin.who === 'Smart', `answered by ${i.fin.who}`);
ws.send(JSON.stringify({ t: 'saving', on: false }));

console.log('\n--- voice lint over every reply this run ---');
for (const r of records) console.log(`  [${r.lane}] "${r.user}" -> ${JSON.stringify(r.reply)}  fixed=${r.fixed.join(',') || '-'} flags=${r.flags.join(',') || '-'}`);
const flagged = records.filter(r => r.flags.length);
check('no reply needed a flag', flagged.length === 0, `${flagged.length} of ${records.length} flagged`);

// The chat target: plain Quick turns, after the first two (which include start-up), no tool round trip.
const plain = records.slice(2).filter(r => r.lane === 'quick' && r.tools.length === 0).map(r => r.ttftMs).filter((x): x is number => x !== null).sort((x, y) => x - y);
const median = plain[Math.floor(plain.length / 2)] ?? 99999;
check('plain warm Quick chat: median first token within 800 ms', median <= 800, `median ${median} ms over ${plain.length} turns (min ${plain[0]}, max ${plain[plain.length - 1]})`);
console.log(`ctx tokens per turn: ${Math.min(...records.map(r => r.ctxTokens))}-${Math.max(...records.map(r => r.ctxTokens))}`);

ws.close(); await core.stop();
const failed = results.filter(r => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} live checks passed`);
process.exit(failed.length ? 1 : 0);
