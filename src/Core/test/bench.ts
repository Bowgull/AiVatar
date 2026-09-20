// Does disabling extended thinking speed up the Quick lane? Measured, not assumed.
//   npm run bench
import os from 'node:os';
import path from 'node:path';
import { Lane } from '../src/lane.ts';
import type { LaneEvent } from '../src/lane.ts';
import { Memory } from '../src/memory.ts';
import { TOOL_NAMES, makeToolServer } from '../src/tools.ts';
import { buildSystemPrompt } from '../src/voice.ts';

const mem = new Memory(path.join(os.homedir(), 'Documents', 'Aang'));
const server = makeToolServer(mem);
const prompt = buildSystemPrompt(mem.profile(), mem.learned());
const questions = ['hey', 'how are you doing', 'whats a good name for a pelican', 'i had a rough week', 'do you like your window', 'say something short'];

async function run(label: string, thinking?: { type: 'disabled' }) {
  const lane = new Lane({ name: label, model: 'claude-haiku-4-5-20251001', systemPrompt: prompt, mcpServer: server, allowedTools: TOOL_NAMES, builtinTools: [], thinking });
  let resolve!: (e: Extract<LaneEvent, { t: 'result' }>) => void;
  lane.onEvent(e => { if (e.t === 'result') resolve(e); });
  const once = (text: string) => new Promise<Extract<LaneEvent, { t: 'result' }>>(r => { resolve = r; lane.send(text); });
  await once('Reply with a single period.'); // warm-up, discarded
  const rows: { q: string; ttft: number | null; ms: number; text: string }[] = [];
  for (const q of questions) { const r = await once(q); rows.push({ q, ttft: r.ttftMs, ms: r.ms, text: r.text }); }
  lane.close();
  const t = rows.map(r => r.ttft ?? 0).sort((a, b) => a - b), m = rows.map(r => r.ms).sort((a, b) => a - b);
  console.log(`${label.padEnd(18)} first token: median ${t[Math.floor(t.length / 2)]} ms (min ${t[0]}, max ${t[t.length - 1]})   full reply: median ${m[Math.floor(m.length / 2)]} ms`);
  for (const r of rows) console.log(`    ${String(r.ttft).padStart(5)} ms  "${r.q}" -> ${JSON.stringify(r.text)}`);
}

await run('thinking default');
await run('thinking disabled', { type: 'disabled' });
process.exit(0);
