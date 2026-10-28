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
//     (ends the running turn), Play (a short "carry on"), and a model switch (/model);
//   - C6 (2026-10-22): starts a job Joshua said Go to in Aang's bubble. A brand-new session asks once for a start
//     waiting on its folder (Door 1, claimStart); a running one takes a resume ('start'); an open one can start another
//     through the Claude app's own session tools (Door 2). Each only for a signed item whose text hashes to his card.
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
import { MOCKUP_SECTION, MOCKUP_SECTION_ID, MOCKUP_TOOL, MOCKUP_TOOL_DESC, MOCKUP_TOOL_FULL, MOCKUP_TOOL_SCHEMA, MODEL_OK, OWN_TOOL, OWN_TOOL_DESC, OWN_TOOL_FULL, OWN_TOOL_PLAN_DESC, OWN_TOOL_PLAN_SCHEMA, OWN_TOOL_SCHEMA, OWN_TOOL_SECTION, PLAN_SENTENCE, TODO_SECTION, TODO_SECTION_ID, TODO_TOOLS, activityOf, agentListOf, hmacHex, mockupArgs, nonce, planOf, safeLine, sameMac, stableJson, summarize, tasksAtEnd, tasksAtStart, toDecision } from './link.ts'
import { CCD_SERVER, EFFORT_OK, FRESH_MS, mcpText, normFolder, startOf } from './link.ts'
import { MARK_TOOL, MARK_TOOL_DESC, MARK_TOOL_FULL, MARK_TOOL_SCHEMA, markArgs } from './link.ts'
import { callFor, linkOff, notHisCwd } from './link.ts'
import type { RunningCall, Task } from './link.ts'

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
  running: Map<string, RunningCall>
  /** Asks already told as resolved (the newest 100), so one is said once however many paths see it end. */
  settled: Set<string>
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
  const profile = (await $.env.get('USERPROFILE')) || ''
  const home = profile || (await $.env.get('HOME')) || ''
  // The Mac (2026-10-28): a POSIX home takes forward slashes. The Windows-only form could never find the key there,
  // so every signed call (progress, asks, answers, starts) went dark on the Mac.
  const sep = !profile && home.startsWith('/') ? '/' : '\\'
  const dataDir = (await $.env.get('AANG_DATA_DIR')) || [home, 'Documents', 'Aang'].join(sep)
  L.keyPath = dataDir + (dataDir.includes('/') && !dataDir.includes('\\') ? '/' : '\\') + 'link.key'
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
  } else if (item.kind === 'start') {
    // C6: a resume into this session (or a start queued for it before it opened). Only the text Joshua approved on his
    // card: startOf checks the hash against the text, byte for byte. His own words, so asUser; mid-turn it slips in.
    const s = await startOf(item.body)
    if (!s) return
    if (L.mainTurn) await $.session.append({ message: { type: 'user', content: [{ type: 'text', text: s.text }] } })
    else await $.prompt.submit({ text: s.text, asUser: true })
    post($, L, 'started', { id: item.id })
  } else if (item.kind === 'caps') {
    await capsCheck($, L)
  } else if (item.kind === 'door2') {
    await door2($, L, item)
  } else if (item.kind === 'model' && typeof b.model === 'string' && MODEL_OK.test(b.model)) {
    await $.command.run({ command: 'model', args: b.model })
    L.model = (await within($, $.session.model(), 500)) ?? L.model
    post($, L, 'model')
  }
}

/**
 * C6 Door 1 (2026-10-22): a brand-new session asks the brain, once, whether Joshua pressed Go on a job for this folder.
 * The answer is signed over this request's nonce and the folder, single use (the brain hands it out once), and its text
 * must hash to what his card showed. Then the model and effort the card suggested (set once, here, at the start: a
 * model he picks later inside the job is never touched again), then the text, as his own words.
 */
async function claimStart($: $T, L: Link): Promise<void> {
  if (L.inert || !L.cwd || L.mainTurn) return
  const now = (await within($, $.clock.now(), 500)) ?? Date.now()
  const u = await within($, $.session.usage(), 1000)
  if (!u || !(now - u.startedAt < FRESH_MS)) return
  // The brain may be slow to prove itself at the very moment a session opens: try a few times, a little apart, before
  // giving up (a missed start is the job not starting at all; the brain hands it out once either way).
  let pv = false
  for (let i = 0; i < 4 && !pv && !L.mainTurn; i++) {
    pv = await proven($, L)
    if (!pv) await new Promise<void>(res => { try { $.clock.after(DOWN_MS + 100, () => res()) } catch { res() } })
  }
  if (!pv || L.mainTurn) return
  const n = nonce()
  const f = normFolder(L.cwd)
  const r = await call($, L, 'GET', `/link/start?f=${encodeURIComponent(f)}&n=${n}`, '', 3000)
  const items = r?.ok ? await checked(L, r.text, n, f) : null
  const item = items?.find(i => i.kind === 'start')
  if (!item) return
  const s = await startOf(item.body)
  if (!s || L.mainTurn) return
  if (s.model) { try { await $.command.run({ command: 'model', args: s.model }); L.model = (await within($, $.session.model(), 500)) ?? L.model } catch { /* the job still starts */ } }
  if (s.effort) { try { await $.command.run({ command: 'effort', args: s.effort }) } catch { /* the job still starts */ } }
  await $.prompt.submit({ text: s.text, asUser: true })
  post($, L, 'started', { id: item.id })
}

/** C6 probe T2: can this session reach the Claude app's own session tools? Names and a yes/no only. */
async function capsCheck($: $T, L: Link): Promise<void> {
  const tools = (await within($, $.tool.list(), 2000)) ?? []
  const ccd = tools.filter(t => t.name.startsWith(`mcp__${CCD_SERVER}__`)).map(t => t.name.slice(CCD_SERVER.length + 7)).slice(0, 30)
  let listOk = false, error = ''
  try {
    const r = await within($, $.mcp.call(CCD_SERVER, 'list_sessions', { limit: 1 }), 8000)
    listOk = !!r && !r.isError
    if (!listOk) error = r ? mcpText(r, 300) : 'no answer'
  } catch (e) { error = String((e as Error)?.message ?? e).slice(0, 300) }
  post($, L, 'caps', { ccd, listOk, ...(error ? { error } : {}) })
}

/**
 * C6 Door 2: this (already open) session starts the new one through the Claude app's own start_session tool. Only for
 * a signed item whose text hashes to his card; only start_session and set_session_model/effort are ever called.
 */
async function door2($: $T, L: Link, item: Item): Promise<void> {
  const s = await startOf(item.body)
  let b: Record<string, unknown> = {}
  try { b = JSON.parse(item.body) ?? {} } catch { return }
  const keys = b.args as { folder?: unknown; prompt?: unknown } | undefined
  const kf = typeof keys?.folder === 'string' && /^\w{1,40}$/.test(keys.folder) ? keys.folder : ''
  const kp = typeof keys?.prompt === 'string' && /^\w{1,40}$/.test(keys.prompt) ? keys.prompt : ''
  if (!s || typeof b.folder !== 'string' || !kf || !kp) { post($, L, 'door2.result', { id: item.id, ok: false, text: 'refused: not a checked start' }); return }
  let ok = false, text = '', sid = ''
  try {
    const r = await within($, $.mcp.call(CCD_SERVER, 'start_session', { [kf]: b.folder, [kp]: s.text }), 20_000)
    ok = !!r && !r.isError
    text = r ? mcpText(r) : 'no answer'
    sid = text.match(/local_[0-9a-f-]{36}/)?.[0] ?? ''
  } catch (e) { text = String((e as Error)?.message ?? e).slice(0, 600) }
  if (ok && sid) {
    if (s.model) { try { await within($, $.mcp.call(CCD_SERVER, 'set_session_model', { session_id: sid, model: s.model }), 8000) } catch { /* he can pick it */ } }
    if (s.effort && EFFORT_OK.test(s.effort)) { try { await within($, $.mcp.call(CCD_SERVER, 'set_session_effort', { session_id: sid, effort: s.effort }), 8000) } catch { /* he can pick it */ } }
  }
  post($, L, 'door2.result', { id: item.id, ok, text, ...(sid ? { sid } : {}) })
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
  // show_mockup (2026-10-22): in every session, so any of them can put a mockup in front of him in Samara.
  if (!tools.some(t => t.name === MOCKUP_TOOL_FULL)) {
    try { await $.tool.register({ name: MOCKUP_TOOL, description: MOCKUP_TOOL_DESC, inputSchema: MOCKUP_TOOL_SCHEMA, isDeferred: false }) } catch { L.ownTool = false }
  }
  // mockup_mark (sheet 79, 2026-10-23): the trail's marks, read before building and set when he says yes.
  if (!tools.some(t => t.name === MARK_TOOL_FULL)) {
    try { await $.tool.register({ name: MARK_TOOL, description: MARK_TOOL_DESC, inputSchema: MARK_TOOL_SCHEMA, isDeferred: false }) } catch { L.ownTool = false }
  }
  if (tools.some(t => t.name === OWN_TOOL_FULL)) return
  // v3: a session with its own to-do tool still gets the progress tool, for the phase plan only (OVERALL).
  const hasTodo = tools.some(t => TODO_TOOLS.includes(t.name))
  try {
    await $.tool.register(hasTodo
      ? { name: OWN_TOOL, description: OWN_TOOL_PLAN_DESC, inputSchema: OWN_TOOL_PLAN_SCHEMA, isDeferred: false }
      : { name: OWN_TOOL, description: OWN_TOOL_DESC, inputSchema: OWN_TOOL_SCHEMA, isDeferred: false })
  } catch { L.ownTool = false }
}

/**
 * show_mockup (2026-10-22): the page goes to the brain over the signed link, and the brain's answer is the result. If
 * Aang is not running (or not proven), the call says so; nothing is written anywhere by the mod itself.
 */
async function showMockup($: $T, L: Link, input: Record<string, unknown>): Promise<{ result: string; isError?: true }> {
  const a = mockupArgs(input)
  if (!a.ok) return { result: a.error, isError: true }
  if (!L.sessionId) L.sessionId = (await within($, $.session.id(), 1000)) ?? ''
  // On his MacBook (2026-10-22): no brain there; Samara on the Mac takes it itself, at its own signed door.
  const mac = await macHome($)
  if (mac) return macMockup($, L, mac, a.body)
  if (!L.sessionId || !(await proven($, L))) return { result: "Aang is not running, so the mockup cannot reach Samara. Tell the user where the file is instead.", isError: true }
  const r = await call($, L, 'POST', '/link/mockup', JSON.stringify({ session: L.sessionId, cwd: L.cwd, ...a.body }), 8000)
  let j: { ok?: unknown; message?: unknown } = {}
  try { j = r?.ok ? JSON.parse(r.text) : {} } catch { j = {} }
  const msg = typeof j.message === 'string' && j.message ? j.message.slice(0, 600) : 'Aang did not answer, so the mockup was not shown.'
  return j.ok === true ? { result: msg } : { result: msg, isError: true }
}

/**
 * mockup_mark (sheet 79, 2026-10-23): on his Mac, Samara's own signed door (the same lock as show_mockup's); on the PC,
 * the brain over the signed link (/link/mockupmark), which checks the sheet and hands the mark to Samara.
 */
async function markMockup($: $T, L: Link, input: Record<string, unknown>): Promise<{ result: string; isError?: true }> {
  const a = markArgs(input)
  if (!a.ok) return { result: a.error, isError: true }
  const NAME: Record<string, string> = { ok: 'APPROVED (his click)', chat: 'APPROVED (he said yes in chat)', built: 'BUILT', fix: 'FIX', park: 'PARKED' }
  const listed = (stages: unknown[]) => {
    const lines = stages.slice(0, 60).map((x) => { const v = x as Record<string, unknown>
      return `${String(v.sheet)} v${String(v.v)} (commit ${String(v.commit).slice(0, 7)}): ${NAME[String(v.stage)] ?? String(v.stage)}${v.note ? ` · fix: ${String(v.note)}` : ''}${v.said ? ` · his words: "${String(v.said)}"` : ''}` })
    return { result: lines.length ? lines.join('\n') : 'No marks yet: nothing is approved in the Mockups trail.' }
  }
  const home = await macHome($)
  if (!home) {
    // On the PC: the brain checks it and hands it to Samara (src/Core/src/mockupdrop.ts markMockup).
    if (!L.sessionId) L.sessionId = (await within($, $.session.id(), 1000)) ?? ''
    if (!L.sessionId || !(await proven($, L))) return { result: 'Aang is not running, so the marks cannot be read. Ask him which version he approved.', isError: true }
    const r = await call($, L, 'POST', '/link/mockupmark', JSON.stringify({ session: L.sessionId, cwd: L.cwd, ...(a.list ? { list: true } : a.body) }), 6000)
    let j: { ok?: unknown; message?: unknown; stages?: unknown[] } = {}
    try { j = r?.ok ? JSON.parse(r.text) : {} } catch { j = {} }
    if (j.ok === true && a.list) return listed(Array.isArray(j.stages) ? j.stages : [])
    const msg = typeof j.message === 'string' && j.message ? j.message.slice(0, 600) : 'Aang did not answer, so nothing was marked.'
    return j.ok === true ? { result: msg } : { result: msg, isError: true }
  }
  const key = (await within($, $.fs.read(`${home}/Library/Application Support/Aang/mockup-door.key`), 500))?.trim() || ''
  if (key.length < 32) return { result: 'Samara is not running on this Mac, so the marks cannot be read.', isError: true }
  const base = 'http://127.0.0.1:47844'
  const signed = async (method: 'GET' | 'POST', pathQ: string, b: string, ms: number) => {
    const ts = String(Date.now())
    const headers: Record<string, string> = { 'x-aang-link-ts': ts, 'x-aang-link-sig': await hmacHex(key, 'req', ts, method, pathQ, b) }
    if (b) headers['content-type'] = 'application/json'
    return within($, $.http.fetch(base + pathQ, { method, headers, ...(b ? { body: b } : {}) }), ms)
  }
  const n = nonce()
  const hello = await signed('GET', `/hello?n=${n}`, '', 1000)
  let ok = false
  try { ok = !!hello?.ok && sameMac(String(JSON.parse(hello.text)?.proof ?? ''), await hmacHex(key, 'hello', n)) } catch { ok = false }
  if (!ok) return { result: 'Samara is not running on this Mac, so the marks cannot be read.', isError: true }
  if (a.list) {
    const r = await signed('GET', '/stages', '', 4000)
    let j: { ok?: unknown; stages?: unknown[]; message?: unknown } = {}
    try { j = r?.ok ? JSON.parse(r.text) : {} } catch { j = {} }
    if (j.ok !== true) return { result: typeof j.message === 'string' ? j.message : 'Samara did not answer.', isError: true }
    return listed(j.stages ?? [])
  }
  const r = await signed('POST', '/stage', JSON.stringify({ cwd: L.cwd, ...a.body }), 4000)
  let j: { ok?: unknown; message?: unknown } = {}
  try { j = r?.ok ? JSON.parse(r.text) : {} } catch { j = {} }
  const msg = typeof j.message === 'string' && j.message ? j.message.slice(0, 600) : 'Samara did not answer, so nothing was marked.'
  return j.ok === true ? { result: msg } : { result: msg, isError: true }
}

/** His Mac's home folder when this session runs on a Mac (a /Users/ home and no Windows profile), else null. */
async function macHome($: $T): Promise<string | null> {
  const profile = (await within($, $.env.get('USERPROFILE'), 500)) || ''
  const home = (await within($, $.env.get('HOME'), 500)) || ''
  return !profile && /^\/Users\/[^/]+$/.test(home) ? home : null
}

/**
 * show_mockup on the Mac (2026-10-22): Samara's mockup door on this Mac's loopback (src/Shell/src/mockupdoor.ts). The
 * same lock as the brain's link: Samara's fresh key per run in its own folder; every request signed; Samara proves it
 * holds the key (HMAC over a fresh nonce) before it is told any folder or file name.
 */
async function macMockup($: $T, L: Link, home: string, body: Record<string, string>): Promise<{ result: string; isError?: true }> {
  const down = { result: "Samara is not running on this Mac, so the mockup cannot reach it. Tell the user where the file is instead.", isError: true as const }
  const key = (await within($, $.fs.read(`${home}/Library/Application Support/Aang/mockup-door.key`), 500))?.trim() || ''
  if (key.length < 32) return down
  const base = 'http://127.0.0.1:47844'
  const signed = async (method: 'GET' | 'POST', pathQ: string, b: string, ms: number) => {
    const ts = String(Date.now())
    const headers: Record<string, string> = { 'x-aang-link-ts': ts, 'x-aang-link-sig': await hmacHex(key, 'req', ts, method, pathQ, b) }
    if (b) headers['content-type'] = 'application/json'
    return within($, $.http.fetch(base + pathQ, { method, headers, ...(b ? { body: b } : {}) }), ms)
  }
  const n = nonce()
  const hello = await signed('GET', `/hello?n=${n}`, '', 1000)
  let ok = false
  try { ok = !!hello?.ok && sameMac(String(JSON.parse(hello.text)?.proof ?? ''), await hmacHex(key, 'hello', n)) } catch { ok = false }
  if (!ok) return down
  const r = await signed('POST', '/mockup', JSON.stringify({ cwd: L.cwd, ...body }), 8000)
  let j: { ok?: unknown; message?: unknown } = {}
  try { j = r?.ok ? JSON.parse(r.text) : {} } catch { j = {} }
  const msg = typeof j.message === 'string' && j.message ? j.message.slice(0, 600) : 'Samara did not answer, so the mockup was not shown.'
  return j.ok === true ? { result: msg } : { result: msg, isError: true }
}

/** Learns the session (and starts its poll) once the session is ready; never holds the session up. */
async function begin($: $T, L: Link): Promise<void> {
  L.sessionId = (await within($, $.session.id(), 1000)) ?? ''
  L.model = (await within($, $.session.model(), 1000)) ?? ''
  // C6: a brand-new session asks for its start first (one proof at a time), then says hello and starts its poll.
  await claimStart($, L).catch(() => {})
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

async function turnEnded($: $T, L: Link, aborted: boolean, reason: string, answer = ''): Promise<void> {
  // 2026-10-22: the end of Claude's answer (at most 2000 characters), so Aang can put a plain question it ends on up as
  // a card (src/Core/src/plainquestion.ts). The brain could already read it in the transcript; this is the same words.
  const said = !aborted && typeof answer === 'string' ? answer.slice(-2000) : ''
  post($, L, 'turn.end', { aborted, reason, usage: await usage($), ...(said ? { said } : {}) })
}

/**
 * The ask is over, however it ended (2026-10-22, his "if I act on it in Claude it should disappear from Aang"): Aang
 * takes its card, its pinned question and its mark down. Said once per ask, by whichever path sees the end first: the
 * request's own end (Claude's dialog answered, the turn interrupted), or the tool call it was for ending.
 */
function settle($: $T, L: Link, id: string): void {
  L.asks.delete(id)
  if (L.settled.has(id)) return
  L.settled.add(id)
  if (L.settled.size > 100) L.settled.delete(L.settled.values().next().value as string)
  post($, L, 'resolved', { id })
}

/** A helper agent's turn ended: nothing it asked can still be waiting. Always true (it reads as a step in a condition). */
function settleAgent($: $T, L: Link, agentId: string): true {
  for (const [id, a] of [...L.asks]) if (a.agentId === agentId) settle($, L, id)
  return true
}

/**
 * Claude is waiting on Joshua: tell Aang, then wait for his answer from Aang. Claude's own dialog is up the whole
 * time; if he answers there first, the request's end (or its tool call's) says so (settle), the brain drops the ask,
 * and this poll comes back "gone". Undefined = no answer from Aang.
 */
async function askAang($: $T, L: Link, signal: AbortSignal, tool: string, input: Record<string, unknown>, suggestions: unknown[] | undefined, agentId: string | undefined, id: string) {
  const kind = tool === 'AskUserQuestion' ? 'question' : tool === 'ExitPlanMode' ? 'plan' : 'permission'
  const json = stableJson(input)
  // The tool call this is for (2026-10-22): its id goes with the ask, so the brain can drop it the moment that very
  // call ends even if this session's 'resolved' were lost on the way.
  const callId = callFor(L.running.entries(), tool, json, agentId)
  const rec = callId ? L.running.get(callId) : undefined
  if (rec) rec.reqId = id
  const ask = {
    id, kind, tool, summary: summarize(tool, input), input: json.slice(0, 2000),
    canAlways: Array.isArray(suggestions) && suggestions.length > 0,
    ...(kind === 'question' ? { questions: input.questions } : {}),
    ...(kind === 'plan' ? { plan: String(input.plan ?? '').slice(0, 8000) } : {}),
    ...(callId ? { toolUseId: callId } : {}),
    ...(agentId ? { agentId } : {}),
  }
  // Kept until the ask ends (settle), so a brain that restarts meanwhile still hears of it, and a snapshot is the truth.
  L.asks.set(id, ask)
  const asked = await call($, L, 'POST', '/link/event', JSON.stringify({ session: L.sessionId, cwd: L.cwd, type: 'ask', t: Date.now(), ...ask }), POST_MS)
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
    told: new Map(), asks: new Map(), settled: new Set(), snapFor: '', needSnap: false, downPending: false, ownTool: false,
    gen: nonce().slice(0, 12), seq: 0, beats: new Map(), renewing: null, plan: null,
  }

  // His decision (2026-10-21): every session keeps a to-do list for any job with more than one step, ticked as it
  // goes, because his progress bars are built from it. Added last, on the session side of the cache line. Where the
  // session has a to-do tool of its own (TodoWrite, the Task tools) the section points at it; where it has none (the
  // Claude desktop app's sessions) it points at the mod's own `progress` tool. Aang's own chat lanes are left alone.
  // show_mockup (2026-10-22): one more short paragraph, wherever that tool is offered, so mockups go to Samara and no
  // session asks him for leave to open a local page. It goes just before the to-do paragraph, which stays last.
  on('prompt.compose', async ($, e, next) => {
    const r = await next(e)
    if (L.inert) return r
    let sections = r.sections
    if (e.tools.includes(MOCKUP_TOOL_FULL) && !sections.some(s => s.id === MOCKUP_SECTION_ID)) sections = [...sections, { id: MOCKUP_SECTION_ID, text: MOCKUP_SECTION, scope: 'session' as const }]
    if (!sections.some(s => s.id === TODO_SECTION_ID)) {
      // v3: where the progress tool is offered, one more sentence asks for the phase plan on multi-phase projects.
      const plan = e.tools.includes(OWN_TOOL_FULL) ? ' ' + PLAN_SENTENCE : ''
      const text = e.tools.some(t => TODO_TOOLS.includes(t)) ? TODO_SECTION + plan : e.tools.includes(OWN_TOOL_FULL) ? OWN_TOOL_SECTION + plan : ''
      if (text) sections = [...sections, { id: TODO_SECTION_ID, text, scope: 'session' as const }]
    }
    return sections === r.sections ? r : { sections }
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
    L.inert = SELF_CWD.test(L.cwd) || notHisCwd(L.cwd, (await within($, $.env.get('TEMP'), 500)) || '')
    // 2026-10-22: a session started with AANG_LINK_OFF=1 (every Aang lane) or AANG_TEST=1 (tests, benches) is never his job.
    if (!L.inert) L.inert = linkOff(await within($, $.env.get('AANG_LINK_OFF'), 500)) || linkOff(await within($, $.env.get('AANG_TEST'), 500))
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
    L.asks.clear()
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
      // The turn is over, so nothing of its own main loop can still be asking (Esc, a new message, an error).
      for (const [id, a] of [...L.asks]) if (!a.agentId) settle($, L, id)
      void turnEnded($, L, e.isAborted, String(e.reason ?? ''), e.answer).catch(() => {})
      L.told.clear()
    } else if (e.agentId !== undefined && !L.inert && settleAgent($, L, e.agentId) && L.agents.delete(e.agentId)) {
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
    // show_mockup (2026-10-22): answered here, by the brain's answer; nothing else runs.
    if (tool === MOCKUP_TOOL_FULL) {
      try { return await showMockup($, L, input) } catch { return { result: 'The mockup could not be sent to Aang.', isError: true as const } }
    }
    // mockup_mark (sheet 79): answered here, by Samara's answer; nothing else runs.
    if (tool === MARK_TOOL_FULL) {
      try { return await markMockup($, L, input) } catch { return { result: 'The marks could not be reached.', isError: true as const } }
    }
    // v3: a helper agent's own tool call is its heartbeat, and one more in "14 tool calls".
    if (agentId !== undefined && L.agents.has(agentId)) post($, L, 'agent.tool', { id: agentId })
    const rec: RunningCall = { tool, input: stableJson(input), ...(agentId !== undefined ? { agentId } : {}) }
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
      // Answered in Claude's own dialog, refused, interrupted, or simply done: Aang takes its card down. Before tool.end,
      // so the card goes in the same push as the live line.
      if (rec.reqId) settle($, L, rec.reqId)
      // v3: whether it worked, so only good runs teach the command history.
      if (told) post($, L, 'tool.end', { id, ok: !!r && r.deny === undefined && !r.isError })
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
    const agentId = typeof e.agent_id === 'string' && e.agent_id ? e.agent_id : undefined
    const id = nonce()
    // Claude's own dialog answered first (or the turn interrupted): the engine abandons this request, and its signal
    // says so at once, while the poll for Aang's answer may still be held for up to 25 s. Aang hears it then.
    const onAbort = () => settle($, L, id)
    try { next.signal.addEventListener('abort', onAbort, { once: true }) } catch { /* the request's end below still says it */ }
    try {
      const decision = await askAang($, L, next.signal, e.tool_name, input, e.permission_suggestions, agentId, id)
      return decision ? { ...below, decision } as typeof below : below
    } finally {
      try { next.signal.removeEventListener('abort', onAbort) } catch { /* nothing to undo */ }
      // However it ended (his answer from Aang, Claude's dialog, a lost link), it is not waiting any more.
      settle($, L, id)
    }
  }).catch(($, e, next) => next(e))
}
