// aang-link (C1, 2026-10-21): links every Claude Code session on this PC to Aang's brain.
//
// What it does, in one place:
//   - tells Aang what the session is doing: its id, folder, model, turns, usage, and Claude's to-do list as it changes;
//   - tells Aang when Claude is waiting on Joshua (a permission, a question, a plan) and lets his answer from Aang
//     decide it. Claude's own dialog is NOT hidden or delayed: Claude Code runs PermissionRequest hooks beside its
//     dialog (checked in the 2.1.299 binary, both the terminal and the desktop app's path), and whichever he answers
//     first wins;
//   - takes what Aang hands back: a message (slips in at Claude's next step, or starts a turn when idle), Pause
//     (ends the running turn), Play (a short "carry on"), and a model switch (/model).
// Fail safe: if Aang is down, slow or not who it says it is, every hook here passes straight through, so the session
// behaves exactly as it would without the mod. Nothing is ever written into a prompt or the transcript by the mod
// itself; only Joshua's own messages and answers reach Claude.
//
// The lock (the brain's side is src/Core/src/claudelink.ts): the brain writes a fresh key each run to link.key in his
// Aang folder. Every request here is signed with it; before telling the port anything the mod asks the brain to prove
// it holds the key (HMAC over a fresh nonce); and every answer or message handed back must carry
// HMAC(key, nonce + session + item id + kind + body) for the nonce of that very poll, or it is ignored.
import type { EngineInterface, Register } from 'claude-code'
import { MODEL_OK, hmacHex, nextTasks, nonce, sameMac, stableJson, summarize, toDecision } from './link.ts'
import type { Task } from './link.ts'

type $T = EngineInterface
type Item = { id: string; kind: string; body: string; mac: string }

/** Aang's own chat lanes run in this folder and load his settings too: they are not his sessions. */
const SELF_CWD = /[\\/]\.aang-self[\\/]?$/i
/** How long one event post may take before it is given up on. Hooks never wait on it. */
const POST_MS = 900
/** Longer than the brain holds a poll (25 s), so a held poll is never cut short here. */
const POLL_MS = 35_000
/** After Aang is found down (or not proven), leave it alone this long before trying again. */
const DOWN_MS = 5_000
/** A proof from the brain is trusted this long; any failure in between asks again. */
const PROVEN_MS = 30_000

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
  queue: Promise<unknown>
  /** Tool calls running now, so an answer in Claude's own dialog can take Aang's card down. */
  running: Map<string, { tool: string; input: string; reqId?: string; answered?: boolean }>
  tasks: Map<string, Task>
}

/**
 * Resolves the promise, or undefined after `ms` (or on any failure). Never rejects. The timer is the engine's own
 * clock: the mod's environment has no setTimeout, and AbortSignal.timeout is declared there but not present.
 */
function within<T>($: $T, p: Promise<T>, ms: number): Promise<T | undefined> {
  return new Promise(resolve => {
    let done = false
    const timer = $.clock.after(ms, () => { if (!done) { done = true; resolve(undefined) } })
    p.then(v => { if (!done) { done = true; timer.cancel(); resolve(v) } }, () => { if (!done) { done = true; timer.cancel(); resolve(undefined) } })
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
  const now = Date.now()
  if (now < L.provenUntil) return true
  if (now < L.downUntil) return false
  const n = nonce()
  const r = await call($, L, 'GET', `/link/hello?n=${n}`, '', POST_MS)
  let ok = false
  if (r?.ok && L.key) {
    try { ok = sameMac(String(JSON.parse(r.text)?.proof ?? ''), await hmacHex(L.key, 'hello', n)) } catch { ok = false }
  }
  if (ok) { L.provenUntil = now + PROVEN_MS; return true }
  // Down, or not Aang, or Aang restarted with a new key: read the key afresh next time.
  L.key = null; L.provenUntil = 0; L.downUntil = now + DOWN_MS
  return false
}

function forget(L: Link): void { L.provenUntil = 0; L.downUntil = Date.now() + DOWN_MS }

/** Tell the brain something, in order, never holding up the hook that said it. */
function post($: $T, L: Link, type: string, data: Record<string, unknown> = {}): void {
  if (L.inert) return
  L.queue = L.queue.then(async () => {
    if (!L.sessionId || !(await proven($, L))) return
    const r = await call($, L, 'POST', '/link/event', JSON.stringify({ session: L.sessionId, cwd: L.cwd, type, ...(L.model ? { model: L.model } : {}), ...data }), POST_MS)
    if (!r?.ok) forget(L)
  }).catch(() => {})
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

/** Learns the session (and starts its poll) once the session is ready; never holds the session up. */
async function begin($: $T, L: Link): Promise<void> {
  L.sessionId = (await within($, $.session.id(), 1000)) ?? ''
  L.model = (await within($, $.session.model(), 1000)) ?? ''
  post($, L, 'start')
  pump($, L)
}

/** A main-loop turn began: the id (again, after a /clear), the model, and what he asked. */
async function turnBegan($: $T, L: Link, prompt: string): Promise<void> {
  if (!L.sessionId) L.sessionId = (await within($, $.session.id(), 1000)) ?? ''
  L.model = (await within($, $.session.model(), 500)) ?? L.model
  post($, L, 'turn.start', { prompt: prompt.slice(0, 200) })
  pump($, L)
}

async function turnEnded($: $T, L: Link, aborted: boolean): Promise<void> {
  post($, L, 'turn.end', { aborted, usage: await usage($) })
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
  const asked = await call($, L, 'POST', '/link/event', JSON.stringify({
    session: L.sessionId, cwd: L.cwd, type: 'ask', id, kind, tool, summary: summarize(tool, input), input: json.slice(0, 2000),
    canAlways: Array.isArray(suggestions) && suggestions.length > 0,
    ...(kind === 'question' ? { questions: input.questions } : {}),
    ...(kind === 'plan' ? { plan: String(input.plan ?? '').slice(0, 8000) } : {}),
  }), POST_MS)
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
    mainTurn: null, pumping: false, queue: Promise.resolve(), running: new Map(), tasks: new Map(),
  }

  on('session.start', async ($, e, next) => {
    const started = await next(e)
    L.cwd = e.cwd
    L.inert = SELF_CWD.test(L.cwd)
    if (!L.inert) void begin($, L).catch(() => {})
    return started
  })

  on('session.end', async ($, e, next) => {
    post($, L, 'end', { reason: e.reason })
    // A /clear goes on as a new session: its id is read again at the next turn.
    if (e.reason === 'clear') { L.sessionId = ''; L.tasks.clear() }
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
      void turnEnded($, L, e.isAborted).catch(() => {})
    }
    return next(e)
  })

  on('tool.call', async ($, e, next) => {
    if (L.inert) return next(e)
    const { tool, tool_use_id: id, agentId, requestMeta: _meta, ...input } = e as unknown as Record<string, unknown> & { tool: string; tool_use_id: string; agentId?: string }
    const rec: { tool: string; input: string; reqId?: string; answered?: boolean } = { tool, input: stableJson(input) }
    L.running.set(id, rec)
    let r
    try { r = await next(e) }
    finally {
      L.running.delete(id)
      // Answered in Claude's own dialog (or the call ended): Aang takes its card down.
      if (rec.reqId && !rec.answered) post($, L, 'resolved', { id: rec.reqId })
    }
    if (agentId === undefined && r && r.deny === undefined && !r.isError) {
      try {
        const list = nextTasks(L.tasks, tool, input, r.result)
        if (list) post($, L, 'todos', { todos: list })
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
