// prefix.mjs - what Aang pays BEFORE Joshua says a word, and how much of it is
// tooling he never uses.
//
// WHY THIS EXISTS: quota.mjs measured the real turn log and found a smart-lane
// cold start costs ~62k input tokens, billed at the 1.25x cache-write rate, so
// ~78k billed equivalents to say hello. Accounting for it locally:
//     system prompt  ~2.7k   (voice.ts, measured)
//     Aang's 53 tools ~5.1k   (measured off the real MCP server)
//     memory          ~6k
//     ------------------------
//     that is ~14k of ~62k.
// The other ~48k is the engine's own built-in tools, which the SDK loads in full
// unless `tools:` names a subset. The shipped sdk-tools.d.ts declares about forty,
// including EnterPlanMode, Workflow, CronCreate, ScheduleWakeup, RemoteTrigger,
// Artifact, EnterWorktree and ShowOnboardingRolePicker - none of which a desktop
// companion can use. This script measures that gap for real instead of assuming it.
//
// It does NOT touch Aang's code. It builds its own throwaway lanes so nothing about
// how Aang runs changes, and each probe is one short turn.
//
//   node tools/measure/prefix.mjs            run the probes (costs a little quota)
//   node tools/measure/prefix.mjs --dry      print the plan and the cost, run nothing
//
// COST: each probe writes its prefix to the cache once. Expect roughly 60-70k input
// tokens in total across both probes. Run it when a number is worth that, not on a loop.
// This file sits outside src/Core, so a bare specifier will not resolve from here:
// Node resolves against the importing FILE's location, not the working directory.
// Reach into the Core package's own copy, which is the one Aang actually runs on.
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const corePkg = path.join(here, '..', '..', 'src', 'Core', 'package.json');
const req = createRequire(corePkg);
const sdkUrl = pathToFileURL(req.resolve('@anthropic-ai/claude-agent-sdk')).href;
const { query } = await import(sdkUrl);

// The built-ins a companion that reads files, searches and reaches the web actually
// needs. Everything omitted is an engine feature with no meaning inside Aang.
const KEEP = ['Bash', 'Read', 'Write', 'Edit', 'Glob', 'Grep', 'WebFetch', 'WebSearch'];

// Deliberately tiny, so the number that moves between probes is the TOOLING and not
// anything of Aang's. A real prefix adds voice.ts and memory on top of both figures.
const PROMPT = 'You are a test harness. Reply with exactly the word: ok';
const ASK = 'Say ok.';

const dry = process.argv.includes('--dry');

const probes = [
  { label: 'every built-in (what Aang loads today)', tools: null },
  { label: `only the ${KEEP.length} Aang uses`, tools: KEEP },
  // The safety check. If `tools:` filters MCP tools too, restricting it would take
  // away all 53 of Aang's own tools at the same time - the fix would be a disaster.
  { label: 'restricted list PLUS a custom MCP tool', tools: ['Read', 'Glob', 'Grep'], withMcp: true },
];

if (dry) {
  console.log('Would run two one-turn probes against the real engine:\n');
  for (const p of probes) console.log('  - ' + p.label + (p.tools ? '  tools: ' + p.tools.join(', ') : '  tools: unrestricted'));
  console.log('\nEach writes its prefix to the cache once; expect ~60-70k input tokens in total.');
  console.log('Nothing in Aang changes: these are throwaway lanes built here.');
  process.exit(0);
}

async function probe({ label, tools, withMcp }) {
  // A throwaway MCP server with one unmistakable tool name, only for the third probe.
  let mcpServers;
  if (withMcp) {
    const { createSdkMcpServer, tool } = await import(sdkUrl);
    const { z } = await import(pathToFileURL(req.resolve('zod')).href);
    mcpServers = { probe: createSdkMcpServer({ name: 'probe', version: '1.0.0', tools: [
      tool('canary', 'A tool that exists only to see whether it survives the tools: filter.',
        { x: z.string().describe('ignored') }, async () => ({ content: [{ type: 'text', text: 'ok' }] })),
    ] }) };
  }
  const started = Date.now();
  const q = query({
    prompt: (async function* () { yield { type: 'user', message: { role: 'user', content: ASK }, parent_tool_use_id: null, session_id: '' }; })(),
    options: {
      model: 'sonnet',
      systemPrompt: { type: 'custom', prompt: PROMPT, snapshot: false },
      settingSources: [],
      maxTurns: 1,
      permissionMode: 'default',
      // Same two switches the real lanes set, so the comparison is like for like.
      env: { ...process.env, ENABLE_CLAUDEAI_MCP_SERVERS: 'false', ENABLE_TOOL_SEARCH: 'false' },
      // The one variable under test. Never [] - an empty array switches every built-in
      // off rather than restricting them, which is a different thing entirely.
      ...(tools ? { tools } : {}),
      ...(mcpServers ? { mcpServers } : {}),
    },
  });

  let usage = null;
  let seenTools = null;
  for await (const m of q) {
    // The init message lists exactly what the model was given. This is the only way to
    // tell whether `tools:` filters MCP tools as well as built-ins - and if it does,
    // restricting it would silently take away all 53 of Aang's own tools.
    if (m.type === 'system' && m.subtype === 'init' && Array.isArray(m.tools)) seenTools = m.tools;
    if (m.type === 'result') { usage = m.usage ?? null; break; }
  }
  try { await q.close?.(); } catch { /* the process is done with either way */ }

  const u = usage || {};
  const read = u.cache_read_input_tokens ?? 0;
  const write = u.cache_creation_input_tokens ?? 0;
  const plain = u.input_tokens ?? 0;
  return { label, tools: tools ? tools.length : 'all', read, write, plain, total: read + write + plain, ms: Date.now() - started, seenTools };
}

const results = [];
for (const p of probes) {
  process.stdout.write('probing: ' + p.label + ' ... ');
  try {
    const r = await probe(p);
    results.push(r);
    console.log(r.total.toLocaleString() + ' input tokens');
  } catch (e) {
    console.log('FAILED: ' + e.message);
    results.push({ label: p.label, failed: e.message });
  }
}

console.log('\nPREFIX COST');
console.log('-'.repeat(72));
console.log('tools   uncached     written       read      total   probe');
for (const r of results) {
  if (r.failed) { console.log('  -            -           -          -          -   ' + r.label + '  (' + r.failed + ')'); continue; }
  console.log([
    String(r.tools).padStart(5),
    r.plain.toLocaleString().padStart(10),
    r.write.toLocaleString().padStart(11),
    r.read.toLocaleString().padStart(10),
    r.total.toLocaleString().padStart(10),
    '  ' + r.label,
  ].join(' '));
}

const [all, few] = results;
if (all && few && !all.failed && !few.failed) {
  const saved = all.total - few.total;
  console.log('\n' + '-'.repeat(72));
  console.log('difference                ' + saved.toLocaleString().padStart(10) + ' input tokens per cold start');
  console.log('billed at the 1.25x write rate ' + Math.round(saved * 1.25).toLocaleString().padStart(5) + ' billed equivalents saved, every new session');
  console.log('as a share of the probe   ' + ((100 * saved / all.total).toFixed(0) + '%').padStart(10));
  console.log('\nBoth probes carry the same tiny system prompt, so this difference is the');
  console.log('built-in tooling alone. Aang\'s real prefix adds voice.ts (~2.7k), his 53');
  console.log('tools (~5.1k) and memory (~6k) on top of BOTH figures equally.');
}

// Did the custom MCP tool survive the tools: filter?
const canary = results.find(r => r.seenTools && r.label.includes('MCP'));
if (canary) {
  const mcpSeen = canary.seenTools.filter(t => String(t).includes('canary'));
  console.log('\nDOES tools: ALSO FILTER MCP TOOLS?');
  console.log('-'.repeat(72));
  console.log('tools the model was actually given: ' + canary.seenTools.length);
  console.log('  ' + canary.seenTools.join(', '));
  console.log(mcpSeen.length
    ? '\nSAFE. The custom MCP tool survived, so tools: restricts built-ins ONLY.\n'
      + 'Aang can drop the built-ins he already disallows and keep all 53 of his own.'
    : '\nNOT SAFE. The custom MCP tool was filtered out too, so restricting tools:\n'
      + 'would take away Aang\'s own tools as well. The fix needs the MCP names listed too.');
}
