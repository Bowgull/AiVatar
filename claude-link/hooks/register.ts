// aang-link (C1, 2026-10-21): links every Claude Code session on this PC to Aang's brain.
//
// What it does, in one place:
//   - tells Aang what the session is doing: its id, folder, model, turns, usage, and Claude's to-do list as it changes;
//   - tells Aang, the moment it happens, which tool is running (a safe one-line summary: a command's first 60
//     characters with anything secret-looking masked, a file's name, a site) and which helper agents start and end,
//     for the live "what's happening" line on his job card (2026-10-21, src/Core/src/claudeprogress.ts);
//   - tells Aang when Claude is waiting on Joshua (a permission, a question, a plan) and lets his answer from Aang
//     decide it. Claude's own dialog is NOT hidden or delayed: Claude Code runs PermissionRequest hooks beside its
//     dialog (checked in the 2.1.299 binary, both the terminal and the desktop app's path), and whichever he answers
//     first wins;
//   - takes what Aang hands back: a message (slips in at Claude's next step, or starts a turn when idle), Pause
//     (ends the running turn), Play (a short "carry on"), and a model switch (/model).
// Fail safe: if Aang is down, slow or not who it says it is, every hook here passes straight through, so the session
// behaves exactly as it would without the mod. Nothing is ever written into the transcript by the mod itself; only
// Joshua's own messages and answers reach Claude. The one exception to "nothing in the prompt" (his decision,
// 2026-10-21): a short paragraph at the end of the system prompt asking Claude to keep its to-do list ticked
// (link.ts TODO_SECTION), so his progress bars have something real to follow.
//
// The lock (the brain's side is src/Core/src/claudelink.ts): the brain writes a fresh key each run to link.key in his
// Aang folder. Every request here is signed with it; before telling the port anything the mod asks the brain to prove
// it holds the key (HMAC over a fresh nonce); and every answer or message handed back must carry
// HMAC(key, nonce + session + item id + kind + body) for the nonce of that very poll, or it is ignored.
import type { EngineInterface, Register } from 'claude-code'
import { MODEL_OK, OWN_TOOL, OWN_TOOL_DESC, OWN_TOOL_FULL, OWN_TOOL_PLAN_DESC, OWN_TOOL_PLAN_SCHEMA, OWN_TOOL_SCHEMA, OWN_TOOL_SECTION, PLAN_SENTENCE, TODO_SECTION, TODO_SECTION_ID, TODO_TOOLS, activityOf, agentListOf, hmacHex, nonce, planOf, safeLine, sameMac, stableJson, summarize, tasksAtEnd, tasksAtStart, toDecision } from './link.ts'
import type { Task } from './link.ts'

type $T = EngineInterface
type Item = { id: string; kind: string; body: string; mac: string }

/** Aang's own chat lanes run in this folder and load his settings too: they are not his sessions. */
const SELF_CWD = /[\\/]\.aang-self[\\/]?$/i
/**
 * How long one event post may take before it is given up on. Hooks never wait on it. v3 (2026-10-21): 300 ms, down
 * from 900, since the brain answers before it does anything else; a slow post is retried once, never dropped at once.
 */
const POST_MS = 300
/** Longer than the brain holds a poll (25 s), so a held poll is never cut short here. */
const POLL_MS = 35_000
/** After Aang is found down (or not proven), leave it alone this long before trying again. */
const DOWN_MS = 5_000
/** A proof from the brain is trusted this long; any failure in between asks again. */
const PROVEN_MS = 30_000
/** v3: the proof is renewed in the background this often, so an event never waits on a hello round trip. */
const RENEW_MS = 25_000
/** v3 heartbeats: while the model streams, one `alive` at most this often (research 3.5). */
const BEAT_MS = 2_000

/** One session's link, kept per load of the module (a reload starts it afresh, which is harmless). */
interface Link {
  base: string
  keyPath: string
  key: string | null
  provenUntil: number
  downUntil: number
  inert: boolean
  sessionId: string
  cwd: string
  model: string
  mainTurn: string | null
  pumping: boolean
  /** Events not sent yet, in order, each stamped with when it happened here (`t`, for the latency trace). */
  outq: Record<string, unknown>[]
  /** One post is on the wire: anything said meanwhile rides the next one, together. */
  sending: boolean
  /** The brain takes several events in one post (its hello said v 2); an older brain gets them one by one. */
  batch: boolean
  /** The list last told, so the same list is not sent twice (at a to-do tool's start and again at its end). */
  lastList: string
  /** Tool calls running now, so an answer in Claude's own dialog can take Aang's card down. */
  running: Map<string, { tool: string; input: string; reqId?: string; answered?: boolean }>
  tasks: Map<string, Task>
  /** Helper agents this module saw start (so only their own turn.complete reports an end), with what they are doing. */
  agents: Map<string, { kind: string; what: string; bg?: true }>
  /** Main-loop tools running now, as told to Aang, for a snapshot. */
  told: Map<string, { tool: string; detail: Record<string, string> }>
  /** What Claude is asking him right now (a permission, a question, a plan), as told to Aang, for a snapshot. */
  asks: Map<string, Record<string, unknown>>
  /** The brain key the session's snapshot was last sent under: a different key is a brain that has not seen it. */
  snapFor: string
  needSnap: boolean
  /** A failure was seen: the 5 s pause starts at the next proven(). */
  downPending: boolean
  /** Our own progress tool was registered (no built-in to-do tool in this session). */
  ownTool: boolean
  /** v3: this load's id and the number of the last event posted, so the brain can spot a lost or doubled event. */
  gen: string
  seq: number
  /** v3: the open quiet windows after a heartbeat, for the main loop ('') and each helper agent. */
  beats: Map<string, { cancel(): void }>
  /** v3: the background renewal of the brain's proof is scheduled. */
  renewing: { cancel(): void } | null
  /** v3: the project's phase plan as Claude last gave it, for a snapshot. */
  plan: { label: string; hours: number; status: string }[] | null
}

/**
 * Resolves the promise, or undefined after `ms` (or on any failure). Never rejects. The timer is the engine's own
 * clock: the mod's environment has no setTimeout, and AbortSignal.timeout is declared there but not present.
 */
function within<T>($: $T, p: Promise<T>, ms: number): Promise<T | undefined> {
  return new Promise(resolve => {
    let done = false
    let timer: { cancel(): void } | null = null
    // The promise is handled first (v3, 2026-10-21): if the engine's clock is gone (the session closing), a failing
    // request must still never become an unhandled rejection.
    p.then(v => { if (!done) { done = true; timer?.cancel(); resolve(v) } }, () => { if (!done) { done = true; timer?.cancel(); resolve(undefined) } })
    try { timer = $.clock.after(ms, () => { if (!done) { done = true; resolve(undefined) } }) }
    catch { if (!done) { done = true; resolve(undefined) } }
  })
}

async function where($: $T, L: Link): Promise<void> {
  if (L.base) return
  const port = Number((await $.env.get('AANG_PORT')) ?? 47831) + 1
  L.base = `http://127.0.0.1:${Number.isFinite(port) ? port : 47832}`
  const home = (await $.env.get('USERPROFILE')) || (await $.env.get('HOME')) || ''
  const dataDir = (await $.env.get('AANG_DATA_DIR')) || `${home}\\Documents\\Aang`
  L.keyPath = `${dataDir}\\link.key`
}

/** One signed request to the brain. Undefined when it failed or took longer than `ms`. */
async function call($: $T, L: Link, method: 'GET' | 'POST', pathQ: string, body: string, ms: number) {
  await where($, L)
  if (!L.key) L.key = (await within($, $.fs.read(L.keyPath), 500))?.trim() || null
  if (!L.key) return undefined
  const ts = String(Date.now())
  const sig = await hmacHex(L.key, 'req', ts, method, pathQ, body)
  const headers: Record<string, string> = { 'x-aang-link-ts': ts, 'x-aang-link-sig': sig }
  if (body) headers['content-type'] = 'application/json'
  return within($, $.http.fetch(L.base + pathQ, { method, headers, ...(body ? { body } : {}) }), ms)
}

/** Is the brain on the port, and does it hold this run's key? Asked before anything about the session is sent. */
async function proven($: $T, L: Link): Promise<boolean> {
  // The engine's clock (2026-10-21), so the tests can move it; the signatures still carry the wall clock (call()).
  const now = (await within($, $.clock.now(), 500)) ?? Date.now()
  if (L.downPending) { L.downPending = false; L.downUntil = now + DOWN_MS; L.provenUntil = 0 }
  if (now < L.provenUntil) return true
  if (now < L.downUntil) return false
  let ok = false
  // Twice at most: a brain that answers but not to our key may be a restarted Aang with a new one, so the key is read
  // again and asked once more at once (a restart is picked up in one go, not after a 5 s pause).
  for (let attempt = 0; attempt < 2 && !ok; attempt++) {
    if (attempt === 1) { if (!L.key) break; L.key = null }
    const n = nonce()
    const r = await call($, L, 'GET', `/link/hello?n=${n}`, '', POST_MS)
    if (!r?.ok) break
    if (!L.key) continue
    try {
      const j = JSON.parse(r.text)
      ok = sameMac(String(j?.proof ?? ''), await hmacHex(L.key, 'hello', n))
      L.batch = ok && Number(j?.v) >= 2
    } catch { ok = false }
  }
  if (ok) {
    L.provenUntil = now + PROVEN_MS
    renewLater($, L)
    // A brain this session has not told anything yet (2026-10-21, his "pick up running sessions even if I restart
    // him"): a restarted brain has a new key. It gets the whole picture at once, not at the next tool call.
    if (L.key && L.key !== L.snapFor) {
      L.snapFor = L.key; L.needSnap = true
      if (!L.sending) void flush($, L)
    }
    return true
  }
  // Down, or not Aang, or Aang restarted with a new key: read the key afresh next time.
  L.key = null; L.provenUntil = 0; L.downUntil = now + DOWN_MS
  return false
}

/** Leave Aang alone for DOWN_MS, timed from the next proven() (which reads the engine's clock). */
function forget(L: Link): void { L.provenUntil = 0; L.downPending = true }

/**
 * v3 plumbing (2026-10-21, research section 5): the hello proof is renewed in the background 25 s after each one, so
 * an event never finds an expired proof and pays a round trip first. A failed renewal just lets the proof lapse; the
 * next event then asks as before.
 */
function renewLater($: $T, L: Link): void {
  if (L.inert) return
  L.renewing?.cancel()
  L.renewing = $.clock.after(RENEW_MS, () => {
    L.renewing = null
    if (L.inert || !L.sessionId) return
    L.provenUntil = 0
    void proven($, L).catch(() => {})
  })
}

/**
 * Tell the brain something, in order, never holding up the hook that said it (nothing here is awaited by a hook).
 * 2026-10-21, "as fast as when Claude gets a reply": an event goes on the wire the moment it is said when nothing else
 * is; while one post is out, whatever is said meanwhile waits and goes together in the next post (one request, in
 * order), instead of queueing one request behind another. Each event carries `t`, when it happened here, so the
 * brain's trace (AANG_PROGRESS_TRACE) can time every hop.
 */
function post($: $T, L: Link, type: string, data: Record<string, unknown> = {}): void {
  if (L.inert) return
  // v3: numbered, so the brain drops a retry that got through twice and asks for a snapshot when one went missing.
  L.outq.push({ type, t: Date.now(), gen: L.gen, sq: ++L.seq, ...(L.model ? { model: L.model } : {}), ...data })
  if (L.outq.length > 200) L.outq.splice(0, L.outq.length - 200)
  if (!L.sending) void flush($, L)
}

/**
 * Everything a brain that has just met this session needs, in one event (2026-10-21): where it runs, its model, the
 * to-do list, whether a turn is running, the tools and helper agents running now, and anything still waiting on him.
 * A wait in a snapshot is one this brain cannot answer (the old brain's poll for it ended with that brain), so it is
 * marked read-only: Aang shows it and says to answer it in Claude, whose own dialog is still up.
 */
function snapshot(L: Link): Record<string, unknown> {
  return {
    type: 'snapshot', t: Date.now(), ...(L.model ? { model: L.model } : {}),
    phase: L.mainTurn ? 'working' : 'idle',
    todos: [...L.tasks.values()].filter(t => t.text),
    tools: [...L.told.entries()].map(([id, x]) => ({ id, tool: x.tool, detail: x.detail })),
    agents: [...L.agents.entries()].map(([id, a]) => ({ id, kind: a.kind, what: a.what, ...(a.bg ? { bg: true } : {}) })),
    asks: [...L.asks.values()].map(a => ({ ...a, readonly: true })),
    ...(L.plan ? { plan: L.plan } : {}),
  }
}

async function flush($: $T, L: Link): Promise<void> {
  L.sending = true
  try {
    while (L.outq.length || L.needSnap) {
      if (!L.sessionId || !(await proven($, L))) { L.outq.length = 0; break }
      if (L.needSnap) {
        L.needSnap = false
        // Numbered just before what is queued, so the brain counts on from it without dropping anything after it.
        const first = Number(L.outq[0]?.sq)
        L.outq.unshift({ ...snapshot(L), gen: L.gen, sq: Number.isFinite(first) ? first - 1 : ++L.seq })
      }
      const take = L.outq.splice(0, L.batch ? 50 : 1)
      const body = JSON.stringify(L.batch && take.length > 1
        ? { session: L.sessionId, cwd: L.cwd, events: take }
        : { session: L.sessionId, cwd: L.cwd, ...take[0] })
      // v3: a slow or failed post is tried once more before anything is given up (the numbers stop a double).
      let r = await call($, L, 'POST', '/link/event', body, POST_MS)
      if (!r?.ok) r = await call($, L, 'POST', '/link/event', body, POST_MS)
      // Lost on the way twice: whatever was in it is gone, so the next brain proven (the same or a new one) gets a snapshot.
      if (!r?.ok) { forget(L); L.outq.length = 0; L.snapFor = ''; break }
    }
  } catch { L.outq.length = 0 }
  finally { L.sending = false }
}

/**
 * A heartbeat (v3), at most every BEAT_MS for the main loop ('') and for each helper agent. The window is timed on the
 * engine's own clock (as everything else here), so the tests can move it.
 */
function beat($: $T, L: Link, who: string, data: Record<string, unknown>): void {
  if (L.beats.has(who)) return
  hush($, L, who)
  post($, L, 'alive', who ? { agent: who } : data)
}
/** Opens a quiet window of BEAT_MS for `who`: something was just said, so no heartbeat is needed until it closes. */
function hush($: $T, L: Link, who: string): void {
  if (L.beats.has(who)) return
  const until = { cancel() {} }
  L.beats.set(who, until)
  try { const t = $.clock.after(BEAT_MS, () => { if (L.beats.get(who) === until) L.beats.delete(who) }); until.cancel = () => t.cancel() }
  catch { L.beats.delete(who) }
}

/** Claude's to-do list, told once per change. */
function postList($: $T, L: Link, list: unknown[] | null): void {
  if (!list) return
  const s = JSON.stringify(list)
  if (s === L.lastList) return
  L.lastList = s
  post($, L, 'todos', { todos: list })
}

/** Only what carries the right MAC for this poll's nonce; anything else means "not Aang". */
async function checked(L: Link, text: string, n: string, session: string): Promise<Item[] | null> {
  let items: unknown
  try { items = JSON.parse(text)?.items } catch { return null }
  if (!Array.isArray(items) || !L.key) return null
  const out: Item[] = []
  for (const i of items as Item[]) {
    if (typeof i?.id !== 'string' || typeof i.kind !== 'string' || typeof i.body !== 'string' || typeof i.mac !== 'string') return null
    if (!sameMac(i.mac, await hmacHex(L.key, n, session, i.id, i.kind, i.body))) return null
    out.push(i)
  }
  return out
}

/** Does what one checked item says: a message, Pause, Play or a model switch. */
async function act($: $T, L: Link, item: Item): Promise<void> {
  let b: Record<string, unknown> = {}
  try { b = JSON.parse(item.body) ?? {} } catch { return }
  if (item.kind === 'inbox' && typeof b.text === 'string' && b.text.trim()) {
    const text = `Joshua (sent through Aang): ${b.text.slice(0, 4000)}`
    // Mid-turn it slips in at Claude's next step; between turns it starts one.
    if (L.mainTurn) await $.session.append({ message: { type: 'user', content: [{ type: 'text', text }] } })
    else await $.prompt.submit({ text })
  } else if (item.kind === 'pause') {
    if (L.mainTurn) await $.turn.abort({ turnId: L.mainTurn })
  } else if (item.kind === 'play') {
    await $.prompt.submit({ text: typeof b.text === 'string' && b.text.trim() ? `Joshua (sent through Aang): ${b.text.slice(0, 4000)}` : 'Carry on where you left off.' })
  } else if (item.kind === 'resync') {
    // v3: the brain saw a gap in the numbers: the whole picture again, at once.
    L.needSnap = true
    if (!L.sending) void flush($, L)
  } else if (item.kind === 'model' && typeof b.model === 'string' && MODEL_OK.test(b.model)) {
    await $.command.run({ command: 'model', args: b.model })
    L.model = (await within($, $.session.model(), 500)) ?? L.model
    post($, L, 'model')
  }
}

/** One turn of the session's own long poll for messages, Pause, Play and the model; it schedules the next. */
async function pumpOnce($: $T, L: Link): Promise<void> {
  let gap = 50
  try {
    if (L.sessionId && (await proven($, L))) {
      const n = nonce()
      const s = L.sessionId
      const r = await call($, L, 'GET', `/link/wait?s=${encodeURIComponent(s)}&n=${n}`, '', POLL_MS)
      const items = r?.ok ? await checked(L, r.text, n, s) : null
      if (!items) { forget(L); gap = DOWN_MS }
      else for (const i of items) await act($, L, i).catch(() => {})
    } else gap = DOWN_MS
  } catch { gap = DOWN_MS }
  $.clock.after(gap, () => { void pumpOnce($, L) })
}

/** Starts the poll, once for the session's life. */
function pump($: $T, L: Link): void {
  if (L.pumping || L.inert) return
  L.pumping = true
  void pumpOnce($, L)
}

/** The session's context fill, rate limits and cost, as the status line has them. */
async function usage($: $T): Promise<Record<string, unknown>> {
  const u = await within($, $.session.usage(), 500)
  if (!u) return {}
  return {
    ...(typeof u.context?.percent === 'number' ? { contextPercent: u.context.percent } : {}),
    rateLimits: (u.rateLimits ?? []).map(r => ({ kind: r.kind, percentUsed: r.percentUsed, ...(r.resetsAt ? { resetsAt: r.resetsAt } : {}) })),
    ...(u.cost ? { costUsd: u.cost.usd } : {}),
  }
}

/**
 * The mod's own progress tool, only in a session with no built-in to-do tool (2026-10-21). Checked once per load of
 * the module: at the session's start, or, in a session that was already running when the mod (re)loaded, at its
 * next turn (the tool is offered from the prompt after that).
 */
async function ensureTool($: $T, L: Link): Promise<void> {
  if (L.ownTool || L.inert) return
  const tools = await within($, $.tool.list(), 1000)
  if (!tools) return
  L.ownTool = true
  if (tools.some(t => t.name === OWN_TOOL_FULL)) return
  // v3: a session with its own to-do tool still gets the progress tool, for the phase plan only (OVERALL).
  const hasTodo = tools.some(t => TODO_TOOLS.includes(t.name))
  try {
    await $.tool.register(hasTodo
      ? { name: OWN_TOOL, description: OWN_TOOL_PLAN_DESC, inputSchema: OWN_TOOL_PLAN_SCHEMA, isDeferred: false }
      : { name: OWN_TOOL, description: OWN_TOOL_DESC, inputSchema: OWN_TOOL_SCHEMA, isDeferred: false })
  } catch { L.ownTool = false }
}

/** Learns the session (and starts its poll) once the session is ready; never holds the session up. */
async function begin($: $T, L: Link): Promise<void> {
  L.sessionId = (await within($, $.session.id(), 1000)) ?? ''
  L.model = (await within($, $.session.model(), 1000)) ?? ''
  post($, L, 'start')
  pump($, L)
}

/** A main-loop turn began: the id (again, after a /clear), the model, and what he asked. */
async function turnBegan($: $T, L: Link, prompt: string): Promise<void> {
  void ensureTool($, L).catch(() => {})
  if (!L.sessionId) L.sessionId = (await within($, $.session.id(), 1000)) ?? ''
  L.model = (await within($, $.session.model(), 500)) ?? L.model
  post($, L, 'turn.start', { prompt: prompt.slice(0, 200) })
  pump($, L)
}

async function turnEnded($: $T, L: Link, aborted: boolean, reason: string): Promise<void> {
  post($, L, 'turn.end', { aborted, reason, usage: await usage($) })
}

/**
 * Claude is waiting on Joshua: tell Aang, then wait for his answer from Aang. Claude's own dialog is up the whole
 * time; if he answers there first, tool.call tells the brain and this poll comes back "gone". Undefined = no answer.
 */
async function askAang($: $T, L: Link, signal: AbortSignal, tool: string, input: Record<string, unknown>, suggestions: unknown[] | undefined) {
  const kind = tool === 'AskUserQuestion' ? 'question' : tool === 'ExitPlanMode' ? 'plan' : 'permission'
  const id = nonce()
  const json = stableJson(input)
  const rec = [...L.running.values()].reverse().find(x => x.tool === tool && x.input === json && !x.reqId)
  if (rec) rec.reqId = id
  const ask = {
    id, kind, tool, summary: summarize(tool, input), input: json.slice(0, 2000),
    canAlways: Array.isArray(suggestions) && suggestions.length > 0,
    ...(kind === 'question' ? { questions: input.questions } : {}),
    ...(kind === 'plan' ? { plan: String(input.plan ?? '').slice(0, 8000) } : {}),
  }
  // Kept until the tool call ends (tool.call's finally), so a brain that restarts meanwhile still hears of it.
  if (rec) L.asks.set(id, ask)
  const asked = await call($, L, 'POST', '/link/event', JSON.stringify({ session: L.sessionId, cwd: L.cwd, type: 'ask', ...ask }), POST_MS)
  if (!asked?.ok) { forget(L); return undefined }
  while (!signal.aborted) {
    const n = nonce()
    const s = L.sessionId
    const r = await call($, L, 'GET', `/link/answer?s=${encodeURIComponent(s)}&r=${id}&n=${n}`, '', POLL_MS)
    if (!r?.ok) { forget(L); return undefined }
    const items = await checked(L, r.text, n, s)
    if (!items) { forget(L); return undefined }
    const item = items.find(i => i.id === id)
    if (!item) continue
    if (item.kind !== 'answer') return undefined
    let body: unknown
    try { body = JSON.parse(item.body) } catch { return undefined }
    const decision = toDecision(kind, body, input, suggestions)
    if (decision && rec) rec.answered = true
    return decision ?? undefined
  }
  return undefined
}

export const register: Register = on => {
  const L: Link = {
    base: '', keyPath: '', key: null, provenUntil: 0, downUntil: 0, inert: false, sessionId: '', cwd: '', model: '',
    mainTurn: null, pumping: false, outq: [], sending: false, batch: false, lastList: '', running: new Map(), tasks: new Map(), agents: new Map(),
    told: new Map(), asks: new Map(), snapFor: '', needSnap: false, downPending: false, ownTool: false,
    gen: nonce().slice(0, 12), seq: 0, beats: new Map(), renewing: null, plan: null,
  }

  // His decision (2026-10-21): every session keeps a to-do list for any job with more than one step, ticked as it
  // goes, because his progress bars are built from it. Added last, on the session side of the cache line. Where the
  // session has a to-do tool of its own (TodoWrite, the Task tools) the section points at it; where it has none (the
  // Claude desktop app's sessions) it points at the mod's own `progress` tool. Aang's own chat lanes are left alone.
  on('prompt.compose', async ($, e, next) => {
    const r = await next(e)
    if (L.inert || r.sections.some(s => s.id === TODO_SECTION_ID)) return r
    // v3: where the progress tool is offered, one more sentence asks for the phase plan on multi-phase projects.
    const plan = e.tools.includes(OWN_TOOL_FULL) ? ' ' + PLAN_SENTENCE : ''
    const text = e.tools.some(t => TODO_TOOLS.includes(t)) ? TODO_SECTION + plan : e.tools.includes(OWN_TOOL_FULL) ? OWN_TOOL_SECTION + plan : ''
    return text ? { sections: [...r.sections, { id: TODO_SECTION_ID, text, scope: 'session' as const }] } : r
  }).catch(($, e, next) => next(e))

  // "Something happens" includes Claude writing (2026-10-21): the moment a main-loop step starts streaming its reply,
  // its thinking, or a tool call's arguments (a big Write streams for many seconds before the tool runs), Aang's live
  // line says so. Once per kind per step; every chunk is passed on untouched.
  // v3 heartbeats (2026-10-21, research 3.5): while chunks stream, one `alive` at most every 2 s (with a rough count
  // of what was written), so Aang can tell a model that is slowly writing from a session that has gone quiet. A helper
  // agent streaming sends its own, under its id.
  on('turn.step', async function* ($, e, next) {
    const s = next(e)
    if (L.inert) return yield* s
    if (e.agentId !== undefined) {
      const agent = e.agentId
      for await (const c of s) {
        try { if (L.agents.has(agent)) beat($, L, agent, {}) } catch { /* a nicety */ }
        yield c
      }
      return await s.result
    }
    let said = '', chars = 0
    for await (const c of s) {
      try {
        const kind = c.kind === 'text' ? 'text' : c.kind === 'thinking' ? 'thinking' : c.kind === 'tool' ? `tool:${c.name}` : ''
        if (kind && kind !== said) {
          said = kind
          post($, L, 'step', c.kind === 'tool' ? { what: 'tool', tool: safeLine(c.name, 120) } : { what: kind })
          hush($, L, '')
        } else {
          const x = c as { text?: unknown }
          if (typeof x.text === 'string') chars += x.text.length
          beat($, L, '', { outTok: Math.round(chars / 4) })
        }
      } catch { /* a nicety: the chunk goes on either way */ }
      yield c
    }
    return await s.result
  })

  // v3: compaction is a known pause ("Tidying its memory"), left out of working time.
  on('session.compact', async ($, e, next) => {
    if (L.inert || e.agentId !== undefined) return next(e)
    post($, L, 'compact', { on: true })
    try { return await next(e) } finally { post($, L, 'compact', { on: false }) }
  }).catch(($, e, next) => next(e))

  on('session.start', async ($, e, next) => {
    const started = await next(e)
    L.cwd = e.cwd
    L.inert = SELF_CWD.test(L.cwd)
    if (!L.inert) {
      // Awaited (briefly), so the progress tool is listed from the session's first prompt.
      await ensureTool($, L).catch(() => {})
      void begin($, L).catch(() => {})
    }
    return started
  })

  on('session.end', async ($, e, next) => {
    post($, L, 'end', { reason: e.reason })
    // A /clear goes on as a new session: its id is read again at the next turn.
    if (e.reason === 'clear') { L.sessionId = ''; L.tasks.clear(); L.agents.clear(); L.lastList = '' }
    return next(e)
  })

  on('turn.start', async ($, e, next) => {
    if (e.agentId === undefined && !L.inert) {
      L.mainTurn = e.turnId
      void turnBegan($, L, e.text).catch(() => {})
    }
    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    if (e.agentId === undefined && !L.inert) {
      L.mainTurn = null
      void turnEnded($, L, e.isAborted, String(e.reason ?? '')).catch(() => {})
      L.told.clear()
    } else if (e.agentId !== undefined && L.agents.delete(e.agentId)) {
      // v3: whether it ended well, so a failed helper shows red and teaches no history.
      post($, L, 'agent.end', { id: e.agentId, ok: !e.isAborted && e.reason !== 'error' })
      L.beats.get(e.agentId)?.cancel(); L.beats.delete(e.agentId)
    }
    return next(e)
  })

  // A helper agent starting: its type and the few words Claude gave it. Its answer is its own turn.complete (above).
  on('agent.spawn', async ($, e, next) => {
    const r = await next(e)
    if (!L.inert && r && !r.deny && r.agentId) {
      // v3: a background helper does not hold the main loop up, so it does not floor the step's time left.
      const a = { kind: safeLine(e.subagentType, 40), what: safeLine(e.description, 80), ...(e.background === true ? { bg: true as const } : {}) }
      L.agents.set(r.agentId, a)
      post($, L, 'agent.start', { id: r.agentId, ...a })
    }
    return r
  }).catch(($, e, next) => next(e))

  on('tool.call', async ($, e, next) => {
    if (L.inert) return next(e)
    const { tool, tool_use_id: id, agentId, requestMeta: _meta, ...input } = e as unknown as Record<string, unknown> & { tool: string; tool_use_id: string; agentId?: string }
    // 2026-10-21 (sheet 58 C): a helper agent writing its own to-do list: its counts, for its own bar under the job.
    if (agentId !== undefined && L.agents.has(agentId)) {
      try { const n = agentListOf(tool, input); if (n) post($, L, 'agent.todos', { id: agentId, ...n }) } catch { /* a nicety */ }
    }
    // The mod's own progress tool (2026-10-21): answered here, nothing else runs; the main loop's list is told to Aang.
    if (tool === OWN_TOOL_FULL) {
      let plan: ReturnType<typeof planOf> = null
      try { plan = planOf(input) } catch { /* a nicety */ }
      if (agentId === undefined) {
        try { postList($, L, tasksAtStart(L.tasks, tool, input, id)) } catch { /* a nicety */ }
        // v3: the project's phase plan, for OVERALL.
        if (plan) { L.plan = plan; post($, L, 'plan', { phases: plan }) }
      }
      return Array.isArray(input.tasks) || plan ? { result: 'Progress shown.' } : { result: 'Pass tasks (the full list, each { text, status }) or plan ({ phases: [{ label, hours, status }] }).', isError: true as const }
    }
    // v3: a helper agent's own tool call is its heartbeat, and one more in "14 tool calls".
    if (agentId !== undefined && L.agents.has(agentId)) post($, L, 'agent.tool', { id: agentId })
    const rec: { tool: string; input: string; reqId?: string; answered?: boolean } = { tool, input: stableJson(input) }
    L.running.set(id, rec)
    // The live line: the main loop's tools only (a helper agent's own tools would be noise; its start and end are told).
    let told = false
    // The to-do list as this call's input already says it will be, told before the tool even runs (2026-10-21): a
    // tick reaches Aang at the same moment Claude's own list redraws. A helper agent's list is its own and never
    // touches the session's. If the call is refused or fails, the list goes back to what it was.
    let before: Map<string, Task> | null = null
    if (agentId === undefined) {
      try {
        const detail = activityOf(tool, input)
        if (detail) { post($, L, 'tool.start', { id, tool, detail }); told = true; L.told.set(id, { tool, detail }) }
      } catch { /* a nicety: the tool runs either way */ }
      try {
        const snap = new Map(L.tasks)
        const list = tasksAtStart(L.tasks, tool, input, id)
        if (list) { before = snap; postList($, L, list) }
      } catch { /* the list is a nicety; the call is what matters */ }
    }
    let r
    try { r = await next(e) }
    finally {
      L.running.delete(id)
      L.told.delete(id)
      if (rec.reqId) L.asks.delete(rec.reqId)
      // v3: whether it worked, so only good runs teach the command history.
      if (told) post($, L, 'tool.end', { id, ok: !!r && r.deny === undefined && !r.isError })
      // Answered in Claude's own dialog (or the call ended): Aang takes its card down.
      if (rec.reqId && !rec.answered) post($, L, 'resolved', { id: rec.reqId })
    }
    if (agentId === undefined) {
      try {
        if (r && r.deny === undefined && !r.isError) postList($, L, tasksAtEnd(L.tasks, tool, input, r.result, id))
        else if (before) { L.tasks = before; postList($, L, [...before.values()].filter(t => t.text)) }
      } catch { /* the list is a nicety; the call's result is what matters */ }
    }
    return r
  }).catch(($, e, next) => next(e))

  on('classic.PermissionRequest', async ($, e, next) => {
    const below = await next(e)
    // Someone beneath (a settings hook) already decided, or this session is not linked: Claude's dialog decides.
    if (L.inert || below.decision || !L.sessionId || !(await proven($, L))) return below
    const input = (e.tool_input && typeof e.tool_input === 'object' ? e.tool_input : {}) as Record<string, unknown>
    const decision = await askAang($, L, next.signal, e.tool_name, input, e.permission_suggestions)
    return decision ? { ...below, decision } as typeof below : below
  }).catch(($, e, next) => next(e))
}
