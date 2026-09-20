// How often does the Quick lane emit reasoning or harness-style tags, and does the prompt matter?
// Counts RAW model output (before any sanitizing). Measured, not assumed.
//   npm run leakbench            plain turns
//   AFTER_TOOL=1 npm run leakbench   every question is asked right after a tool turn (where leaks were found)
import os from 'node:os';
import path from 'node:path';
import { Lane } from '../src/lane.ts';
import type { LaneEvent } from '../src/lane.ts';
import { Memory } from '../src/memory.ts';
import { TOOL_NAMES, makeToolServer } from '../src/tools.ts';
import { buildSystemPrompt } from '../src/voice.ts';

const mem = new Memory(path.join(os.homedir(), 'Documents', 'Aang'));
const server = makeToolServer(mem);
const current = buildSystemPrompt(mem.profile(), mem.learned());

// Earlier prompt variants, kept for comparison. Results on 2026-09-20, question asked right after a tool turn:
//   mention <thinking> + <tools> paragraph: 12/12 leaks;  no mention, <tools> kept: 2/12.
const toolsParagraph = `\n\n<tools>\nUse get_time for any question about the time or date, get_weather for any question about the weather, and search_memory when he refers to something from an earlier conversation. Never state the time or the weather from your own guess.\n</tools>`;
const tagMention = '\nYour reply is exactly what Joshua reads. Never write your reasoning, notes to yourself, or any tags such as <thinking>; think silently and write only the answer.';

const questions = [
  'tell me three quick facts about pelicans', 'why is the sky blue', 'give me a name for a cat', 'whats a good stretch for my wrists',
  'explain what a cache is in two sentences', 'is a tomato a fruit', 'how do i say thank you in japanese', 'tell me a fun fact about volcanoes',
  'what should i eat tonight', 'name three moons in the solar system', 'whats the capital of australia', 'how many legs does a spider have',
];
const TAGGY = /<\/?[a-z][a-z0-9_-]*[^>]*>/i;

async function run(label: string, systemPrompt: string) {
  const lane = new Lane({ name: label, model: 'claude-haiku-4-5-20251001', systemPrompt, mcpServer: server, allowedTools: TOOL_NAMES,  thinking: { type: 'disabled' } });
  let resolve!: (e: Extract<LaneEvent, { t: 'result' }>) => void;
  lane.onEvent(e => { if (e.t === 'result') resolve(e); });
  const once = (text: string) => new Promise<Extract<LaneEvent, { t: 'result' }>>(r => { resolve = r; lane.send(text); });
  await once('Reply with a single period.');
  let leaks = 0; const ttft: number[] = []; const samples: string[] = [];
  for (const q of questions) {
    if (process.env.AFTER_TOOL) await once('is it nice out');
    const r = await once(q);
    if (r.ttftMs !== null) ttft.push(r.ttftMs);
    if (TAGGY.test(r.text)) { leaks++; samples.push(JSON.stringify(r.text.slice(0, 110))); }
  }
  lane.close();
  ttft.sort((a, b) => a - b);
  console.log(`${label.padEnd(48)} raw leaks ${leaks}/${questions.length}   median first token ${ttft[Math.floor(ttft.length / 2)]} ms`);
  for (const s of samples.slice(0, 3)) console.log('      e.g. ' + s);
}

await run('current prompt (no tag mention, no <tools> block)', current);
await run('current + the <tools> paragraph put back', current + toolsParagraph);
await run('current + the <thinking> mention put back', current.replace('</voice>', tagMention.slice(1) + '\n</voice>'));
process.exit(0);
