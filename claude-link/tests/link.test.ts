// aang-link: the MAC, the to-do list, his answers, and the fail-safe rule (Aang down or not proven = the session
// behaves exactly as without the mod). The brain is played by the test's own http.fetch hook.
import { describe, expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'
import { sha256Hex } from '../hooks/link.ts'
import { callFor } from '../hooks/link.ts'
import { MOCKUP_SECTION, MOCKUP_SECTION_ID, MOCKUP_TOOL, MOCKUP_TOOL_FULL, mockupArgs, OWN_TOOL, OWN_TOOL_FULL, OWN_TOOL_PLAN_DESC, OWN_TOOL_SECTION, PLAN_SENTENCE, TODO_SECTION, TODO_SECTION_ID, activityOf, agentListOf, hmacHex, nextTasks, planOf, stripSecrets, toDecision } from '../hooks/link.ts'
import type { Task } from '../hooks/link.ts'

const KEY = 'test-key-for-aang-link-0123456789abcdefghij'
const SESSION = 'S1'

describe('plain parts', () => {
  test('the MAC is real HMAC-SHA256 (RFC 4231 case 2)', async () => {
    expect(await hmacHex('Jefe', 'what do ya want for nothing?')).toBe('5bdcc146bf60754e6a042426089575c75a003f089d2739839dec58b964ec3843')
  })

  test('the to-do list follows TodoWrite and the Task tools', () => {
    const tasks = new Map<string, Task>()
    expect(nextTasks(tasks, 'TodoWrite', { todos: [{ content: 'Read', status: 'completed', activeForm: 'Reading' }, { content: 'Fix', status: 'in_progress', activeForm: 'Fixing' }] }, {}))
      .toEqual([{ text: 'Read', status: 'completed', active: 'Reading' }, { text: 'Fix', status: 'in_progress', active: 'Fixing' }])
    const t2 = new Map<string, Task>()
    nextTasks(t2, 'TaskCreate', { subject: 'Ship', description: 'x' }, { task: { id: '7', subject: 'Ship' } })
    expect(nextTasks(t2, 'TaskUpdate', { taskId: '7', status: 'in_progress' }, { success: true })).toEqual([{ text: 'Ship', status: 'in_progress' }])
    expect(nextTasks(t2, 'TaskUpdate', { taskId: '7', status: 'deleted' }, { success: true })).toEqual([])
    expect(nextTasks(t2, 'Bash', { command: 'ls' }, {})).toBeNull()
  })

  test('his answers become Claude Code decisions; nothing unclear ever allows', () => {
    expect(toDecision('permission', { decision: 'allow' }, {}, [])).toEqual({ behavior: 'allow' })
    expect(toDecision('permission', { decision: 'always' }, {}, [])).toBeNull()
    expect(toDecision('permission', { decision: 'always' }, {}, [{ type: 'addRules' }])).toEqual({ behavior: 'allow', updatedPermissions: [{ type: 'addRules' }] })
    expect(toDecision('permission', { decision: 'deny-message', message: 'use pnpm' }, {}, [])).toEqual({ behavior: 'deny', message: 'use pnpm' })
    expect(toDecision('permission', { decision: 'yes please' }, {}, [])).toBeNull()
    const q = { questions: [{ question: 'Which?', header: 'Pick', options: [], multiSelect: false }] }
    expect(toDecision('question', { answers: { 'Which?': 'B', 'Other?': 'x' } }, q, [])).toEqual({ behavior: 'allow', updatedInput: { ...q, answers: { 'Which?': 'B' } } })
    expect(toDecision('question', { decision: 'allow' }, q, [])).toBeNull()
  })
})

/** A pretend brain: proves the key, takes events, and answers one waiting item with `answer` (or a forged MAC). */
function brain(on: On, opts: { answer?: string; forge?: boolean; squatter?: boolean; down?: boolean; inbox?: string; v1?: boolean; hold?: () => Promise<void>; key?: string; tools?: string[]; resync?: boolean; failPosts?: number; start?: string; forgeStart?: boolean; startedAt?: number; startInbox?: string; mcp?: (server: string, tool: string, args: unknown) => unknown; goneOnResolved?: boolean; env?: Record<string, string> }) {
  const seen: string[] = []
  const events: Record<string, unknown>[] = []
  const posts: Record<string, unknown>[] = []
  const mockups: { body: Record<string, unknown>; signed: boolean }[] = []
  let inbox = opts.inbox
  const resolvedWait = new Map<string, () => void>()
  mock.env(on, { USERPROFILE: 'C:\\Users\\T', ...(opts.env ?? {}) })
  const clock = mock.clock(on)
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('classic.PermissionRequest', () => ({}))
  on('session.id', () => ({ value: SESSION }))
  on('session.model', () => ({ value: 'sonnet' }))
  // C6: how old the session is (a start is only for a brand-new one), and the Claude app's own session tools.
  const mcpCalls: { server: string; tool: string; args: unknown }[] = []
  if (opts.startedAt !== undefined) on('session.usage', () => ({ value: { startedAt: opts.startedAt!, rateLimits: [] } as never }))
  if (opts.mcp) on('mcp.call', ($, e) => { const x = e as unknown as { server: string; tool: string; args: unknown }; mcpCalls.push(x); return { value: opts.mcp!(x.server, x.tool, x.args) as never } })
  const starts: string[] = []
  const reads: string[] = []
  on('fs.read', ($, e) => { reads.push(String(e.path)); return String(e.path).endsWith('link.key') ? { value: opts.key ?? KEY } : { deny: 'no such file' } })
  // The session's tools (2026-10-21): TodoWrite unless a test says otherwise; what the mod registers is kept.
  const registered: Record<string, unknown>[] = []
  on('tool.list', () => ({ value: (opts.tools ?? ['Bash', 'TodoWrite']).map(name => ({ name, description: '', mcp: false })) }))
  on('tool.register', ($, e) => { registered.push(e as unknown as Record<string, unknown>); return { value: { tool: `mcp__aang-link__${(e as { name: string }).name}` } } })
  let inflight = 0
  on('http.fetch', async ($, e) => {
    inflight++
    try { return await answerFetch(e) } finally { inflight-- }
  })
  /**
   * Lets everything under way finish: the mod's posts run on real crypto as well as the mocked clock, so one or two
   * settles were not always enough on a busy machine (2026-10-21). Quiet = nothing new on the wire for a few settles.
   */
  const quiet = async () => {
    let same = 0, last = -1
    for (let i = 0; i < 400 && same < 6; i++) {
      await clock.settle()
      const k = seen.length
      if (k === last && inflight === 0) same++; else { same = 0; last = k }
    }
  }
  /** Settles until `pred` holds (or gives up after many tries; the assertion after it then says what was missing). */
  const count = (type: string) => events.filter(ev => ev.type === type).length
  const until = async (pred: () => boolean) => { for (let i = 0; i < 3000 && !pred(); i++) await clock.settle() }
  const answerFetch = async (e: { url: string; init?: { body?: string } }) => {
    const u = new URL(e.url)
    seen.push(u.pathname)
    if (opts.down) throw new Error('connection refused')
    const n = u.searchParams.get('n') ?? ''
    const reply = (v: unknown) => ({ value: { status: 200, ok: true, headers: {}, text: JSON.stringify(v) } })
    if (u.pathname === '/link/hello') return reply({ proof: opts.squatter ? 'f'.repeat(64) : await hmacHex(opts.key ?? KEY, 'hello', n), ...(opts.v1 ? {} : { v: 2 }) })
    if (u.pathname === '/link/event' && opts.failPosts && opts.failPosts > 0) { opts.failPosts--; throw new Error('timed out') }
    if (u.pathname === '/link/event') {
      // A batch (2026-10-21) is several events in one post; each is kept as the brain reads it, session and all.
      const b = JSON.parse(e.init?.body ?? '{}')
      posts.push(b)
      if (Array.isArray(b.events)) for (const ev of b.events) events.push({ session: b.session, cwd: b.cwd, ...ev })
      else events.push(b)
      for (const ev of events) if (ev.type === 'resolved') resolvedWait.get(String(ev.id))?.()
      if (opts.hold) await opts.hold()
      return { value: { status: 204, ok: true, headers: {}, text: '' } }
    }
    // show_mockup (2026-10-22): kept with whether its signature is right; answered like the brain does.
    if (u.pathname === '/link/mockup') {
      const body = e.init?.body ?? ''
      const h = (e.init as { headers?: Record<string, string> } | undefined)?.headers ?? {}
      mockups.push({ body: JSON.parse(body), signed: h['x-aang-link-sig'] === await hmacHex(opts.key ?? KEY, 'req', h['x-aang-link-ts'] ?? '', 'POST', '/link/mockup', body) })
      return reply({ ok: true, message: 'Showing docs/motion.html in the Mockups trail.' })
    }
    // C6 Door 1: the start waiting on this folder, signed over the nonce and the folder; handed out once.
    if (u.pathname === '/link/start') {
      starts.push(u.searchParams.get('f') ?? '')
      if (!opts.start) return reply({ items: [] })
      const body = opts.start; opts.start = undefined
      const mac = opts.forgeStart ? '0'.repeat(64) : await hmacHex(KEY, n, u.searchParams.get('f') ?? '', 'st1', 'start', body)
      return reply({ items: [{ id: 'st1', kind: 'start', body, mac }] })
    }
    if (u.pathname === '/link/wait' && opts.startInbox) {
      const body = opts.startInbox; opts.startInbox = undefined
      return reply({ items: [{ id: 'st2', kind: 'start', body, mac: await hmacHex(KEY, n, SESSION, 'st2', 'start', body) }] })
    }
    if (u.pathname === '/link/wait' && opts.resync) {
      opts.resync = false
      return reply({ items: [{ id: 'r1', kind: 'resync', body: '{}', mac: await hmacHex(KEY, n, SESSION, 'r1', 'resync', '{}') }] })
    }
    if (u.pathname === '/link/wait' && inbox) {
      const body = JSON.stringify({ text: inbox }); inbox = undefined
      return reply({ items: [{ id: 'm1', kind: 'inbox', body, mac: await hmacHex(KEY, n, SESSION, 'm1', 'inbox', body) }] })
    }
    // 2026-10-22: as the brain does, the held poll for an answer ends 'gone' once the session says the ask is over.
    if (u.pathname === '/link/answer' && opts.goneOnResolved) {
      const id = u.searchParams.get('r') ?? ''
      if (!events.some(ev => ev.type === 'resolved' && ev.id === id)) await new Promise<void>(res => resolvedWait.set(id, res))
      return reply({ items: [{ id, kind: 'gone', body: '{}', mac: await hmacHex(KEY, n, SESSION, id, 'gone', '{}') }] })
    }
    if (u.pathname === '/link/answer' && opts.answer) {
      const id = u.searchParams.get('r') ?? ''
      const mac = opts.forge ? '0'.repeat(64) : await hmacHex(KEY, n, SESSION, id, 'answer', opts.answer)
      return reply({ items: [{ id, kind: 'answer', body: opts.answer, mac }] })
    }
    return reply({ items: [] })
  }
  return { seen, clock, events, posts, quiet, until, count, registered, mockups, starts, mcpCalls, reads }
}

const start = { cwd: 'C:\\code\\Waymark', surface: null, isInteractive: true } as const

test('his "yes" from Aang, with the right MAC, approves', async ($, on) => {
  const { seen, clock, quiet, until, count } = brain(on, { answer: JSON.stringify({ decision: 'allow' }) })
  await $.session.start(start)
  await quiet()
  const r = await $.classic.PermissionRequest({ tool_name: 'Bash', tool_input: { command: 'npm test' }, permission_suggestions: [] })
  expect(r.decision).toEqual({ behavior: 'allow' })
  expect(seen).toContain('/link/event')
})

test('on the Mac the key is read from a POSIX path, so the link works there too', async ($, on) => {
  const { seen, quiet, reads } = brain(on, { answer: JSON.stringify({ decision: 'allow' }), env: { USERPROFILE: '', HOME: '/Users/T' } })
  await $.session.start({ ...start, cwd: '/Users/T/code/Waymark' })
  await quiet()
  const r = await $.classic.PermissionRequest({ tool_name: 'Bash', tool_input: { command: 'npm test' }, permission_suggestions: [] })
  expect(reads).toContain('/Users/T/Documents/Aang/link.key')
  expect(r.decision).toEqual({ behavior: 'allow' })
  expect(seen).toContain('/link/event')
})

test('an answer with a forged MAC is ignored: Claude\'s own dialog decides', async ($, on) => {
  const { clock, quiet, until, count } = brain(on, { answer: JSON.stringify({ decision: 'allow' }), forge: true })
  await $.session.start(start)
  await quiet()
  const r = await $.classic.PermissionRequest({ tool_name: 'Bash', tool_input: { command: 'rm -rf build' }, permission_suggestions: [] })
  expect(r.decision).toBeUndefined()
})

test('a program on the port that cannot prove the key is told nothing', async ($, on) => {
  const { seen, clock, quiet, until, count } = brain(on, { answer: JSON.stringify({ decision: 'allow' }), squatter: true })
  await $.session.start(start)
  await quiet()
  const r = await $.classic.PermissionRequest({ tool_name: 'Bash', tool_input: { command: 'ls' }, permission_suggestions: [] })
  expect(r.decision).toBeUndefined()
  expect(seen).not.toContain('/link/event')
  expect(seen).not.toContain('/link/answer')
})

test('Aang down: the request passes straight through', async ($, on) => {
  const { clock, quiet, until, count } = brain(on, { down: true })
  await $.session.start(start)
  await quiet()
  const r = await $.classic.PermissionRequest({ tool_name: 'Bash', tool_input: { command: 'ls' }, permission_suggestions: [] })
  expect(r.decision).toBeUndefined()
})

test('his pick from Aang answers AskUserQuestion', async ($, on) => {
  const questions = [{ question: 'Which colour?', header: 'Colour', options: [{ label: 'Plum', description: '' }, { label: 'Sage', description: '' }], multiSelect: false }]
  const { clock, quiet, until, count } = brain(on, { answer: JSON.stringify({ answers: { 'Which colour?': 'Sage' } }) })
  await $.session.start(start)
  await quiet()
  const r = await $.classic.PermissionRequest({ tool_name: 'AskUserQuestion', tool_input: { questions }, permission_suggestions: [] })
  expect(r.decision).toEqual({ behavior: 'allow', updatedInput: { questions, answers: { 'Which colour?': 'Sage' } } })
})

test("Aang's own chat lanes are left alone", async ($, on) => {
  const { seen, clock, quiet, until, count } = brain(on, { answer: JSON.stringify({ decision: 'allow' }) })
  await $.session.start({ ...start, cwd: 'C:\\Users\\T\\Documents\\Aang\\.aang-self' })
  await quiet()
  const r = await $.classic.PermissionRequest({ tool_name: 'Bash', tool_input: { command: 'ls' }, permission_suggestions: [] })
  expect(r.decision).toBeUndefined()
  expect(seen).toHaveLength(0)
})

// 2026-10-22: a bench's question ran in src/Core and landed in his jobs list. Tests, benches, temp folders and any
// session started with AANG_LINK_OFF=1 (every Aang lane) or AANG_TEST=1 are left alone; AangApp itself is not.
for (const [label, cwd, env] of [
  ['a session in the test folder', 'C:/Users/T/Documents/AangApp/src/Core/test', {}],
  ['a session in a temp folder', 'C:/Users/T/AppData/Local/Temp/aang-run', {}],
  ['a lane started with AANG_LINK_OFF=1', 'C:/Users/T/Documents/AangApp/src/Core', { AANG_LINK_OFF: '1' }],
  ['a bench started with AANG_TEST=1', 'C:/Users/T/Documents/AangApp/src/Core', { AANG_TEST: '1' }],
] as const) {
  test(`${label} is never his job`, async ($, on) => {
    const { seen, quiet } = brain(on, { answer: JSON.stringify({ decision: 'allow' }), env })
    await $.session.start({ ...start, cwd })
    await quiet()
    const r = await $.classic.PermissionRequest({ tool_name: 'Bash', tool_input: { command: 'ls' }, permission_suggestions: [] })
    expect(r.decision).toBeUndefined()
    expect(seen).toHaveLength(0)
  })
}

test('his own AangApp session is still linked', async ($, on) => {
  const { seen, quiet } = brain(on, {})
  await $.session.start({ ...start, cwd: 'C:/Users/T/Documents/AangApp' })
  await quiet()
  expect(seen.length).toBeGreaterThan(0)
})

test('a message from Aang starts a turn when the session is idle', async ($, on) => {
  const sent: string[] = []
  on('prompt.submit', ($, e) => { sent.push(e.text); return { text: e.text } })
  const { clock, quiet, until, count } = brain(on, { inbox: 'also update the changelog' })
  await $.session.start(start)
  await quiet()
  for (let i = 0; i < 200 && !sent.length; i++) await clock.settle()
  expect(sent).toEqual(['Joshua (sent through Aang): also update the changelog'])
})

test("Claude's to-do list reaches Aang as it changes", async ($, on) => {
  on('tool.call', () => ({ result: { oldTodos: [], newTodos: [] } }))
  const { clock, events, quiet, until, count } = brain(on, {})
  await $.session.start(start)
  await quiet()
  await $.tool.call({ tool: 'TodoWrite', todos: [{ content: 'Write tests', status: 'in_progress', activeForm: 'Writing tests' }] })
  await until(() => count('todos') > 0)
  expect(events.find(ev => ev.type === 'todos')).toMatchObject({ session: SESSION, todos: [{ text: 'Write tests', status: 'in_progress', active: 'Writing tests' }] })
})

// The live "what's happening" line (2026-10-21): tools and helper agents reported as they start and end, safely.
test('activity: the safe bits only, secrets masked, the to-do tools left out', () => {
  const curl = activityOf('Bash', { command: 'curl -H "Authorization: Bearer abcdefghijklmnop1234" https://x.co?token=s3cr3tvalue', description: 'Fetch it' })!
  expect(curl.desc).toBe('Fetch it')
  expect(curl.cmd).not.toContain('abcdefghijklmnop1234')
  expect(stripSecrets('https://x.co?token=s3cr3tvalue')).not.toContain('s3cr3tvalue')
  const masked = activityOf('Bash', { command: 'ANTHROPIC_API_KEY=sk-ant-api03-ABCDEFGHIJKLMNOP npm test -- --run' })!.cmd!
  expect(masked).not.toContain('sk-ant')
  expect(masked).toContain('npm test')
  expect(stripSecrets('git clone https://joshua:hunter22@github.com/x/y')).not.toContain('hunter22')
  expect(stripSecrets('gh auth login --with-token ghp_abcdefghijklmnopqrstuvwxyz0123')).not.toContain('ghp_')
  expect(activityOf('Edit', { file_path: 'C:\\Users\\Shadow\\Documents\\AangApp\\src\\Shell\\pages\\bubble.js', old_string: 'secret stuff', new_string: 'x' })).toEqual({ file: 'bubble.js' })
  expect(activityOf('WebFetch', { url: 'https://github.com/x/y?token=abc', prompt: 'read' })).toEqual({ site: 'github.com' })
  expect(activityOf('mcp__aang-browser__browser_read', { tab: 3 })).toEqual({ server: 'aang-browser', name: 'browser_read' })
  expect(activityOf('TodoWrite', { todos: [] })).toBeNull()
  expect(activityOf('Bash', { command: 'x'.repeat(200) })!.cmd).toHaveLength(60)
})

test('activity: a tool start and end reach Aang at once, in order', async ($, on) => {
  on('tool.call', () => ({ result: 'ok' }))
  const { clock, events, quiet, until, count } = brain(on, {})
  await $.session.start(start)
  await quiet()
  await $.tool.call({ tool: 'Bash', command: 'npm test -- --run --token=abcd1234efgh', description: 'Run the tests' })
  await until(() => count('tool.end') > 0)
  const st = events.find(ev => ev.type === 'tool.start') as { id: string; tool: string; detail: { cmd: string } } | undefined
  expect(st?.tool).toBe('Bash')
  expect(st?.detail.cmd).toContain('npm test -- --run')
  expect(st?.detail.cmd).not.toContain('abcd1234efgh')
  const types = events.map(ev => ev.type)
  expect(types.indexOf('tool.end')).toBeGreaterThan(types.indexOf('tool.start'))
  expect(events.find(ev => ev.type === 'tool.end')).toMatchObject({ id: st?.id })
})

test('activity: a helper agent is told when it starts and when it ends', async ($, on) => {
  on('agent.spawn', () => ({ model: 'haiku', agentId: 'agent-7' }))
  on('turn.complete', () => ({ text: '' }))
  const { clock, events, quiet, until, count } = brain(on, {})
  await $.session.start(start)
  await quiet()
  await $.agent.spawn({ prompt: 'Look over the diff.', description: 'Reviewing the diff', subagentType: 'general-purpose' })
  await until(() => count('agent.start') > 0)
  expect(events.find(ev => ev.type === 'agent.start')).toMatchObject({ id: 'agent-7', kind: 'general-purpose', what: 'Reviewing the diff' })
  await $.turn.complete({ answer: 'done', durationMs: 5, isAborted: false, turnId: 't9', agentId: 'agent-7', reason: 'answer' })
  await until(() => count('agent.end') > 0)
  expect(events.find(ev => ev.type === 'agent.end')).toMatchObject({ id: 'agent-7' })
})

// ---- 2026-10-21, the supercharged progress engine: the to-do prompt, ticks at the tool's start, a helper agent's own
// list kept apart, and a send path that never waits.

const COMPOSE = { model: 'claude-sonnet-5', promptModel: 'claude-sonnet-5', surfaces: [], outputStyle: null, traits: [] }
const SECTIONS = { sections: [{ id: 'intro', text: 'You are Claude Code.', scope: 'shared' as const }, { id: 'env', text: 'cwd', scope: 'session' as const }] }

test('every session is asked to keep a to-do list: one short section, added last, on the session side', async ($, on) => {
  on('prompt.compose', () => SECTIONS)
  const { clock, quiet, until, count } = brain(on, {})
  await $.session.start(start)
  await clock.settle()
  const r = await $.prompt.compose({ ...COMPOSE, tools: ['Bash', 'TodoWrite'] })
  const last = r.sections[r.sections.length - 1]!
  expect(last).toEqual({ id: TODO_SECTION_ID, text: TODO_SECTION, scope: 'session' })
  expect(r.sections.slice(0, 2)).toEqual(SECTIONS.sections)
  expect(TODO_SECTION.split(/(?<=\.)\s/).length).toBeLessThanOrEqual(3)
  expect(TODO_SECTION).not.toMatch(/aang/i)
  // The Task tools count as a to-do tool too; with none offered there is nothing to point at.
  expect((await $.prompt.compose({ ...COMPOSE, tools: ['TaskCreate', 'TaskUpdate'] })).sections.some(s => s.id === TODO_SECTION_ID)).toBe(true)
  expect((await $.prompt.compose({ ...COMPOSE, tools: ['Bash'] })).sections.some(s => s.id === TODO_SECTION_ID)).toBe(false)
})

test("Aang's own chat lanes get no to-do section", async ($, on) => {
  on('prompt.compose', () => SECTIONS)
  const { clock, quiet, until, count } = brain(on, {})
  await $.session.start({ ...start, cwd: 'C:\\Users\\T\\Documents\\Aang\\.aang-self' })
  await clock.settle()
  const r = await $.prompt.compose({ ...COMPOSE, tools: ['TodoWrite'] })
  expect(r.sections.some(s => s.id === TODO_SECTION_ID)).toBe(false)
})

test('a tick reaches Aang at the to-do tool START, before the tool has even run', async ($, on) => {
  let atRun: Record<string, unknown> | undefined
  const { clock, events, quiet, until, count } = brain(on, {})
  on('tool.call', async () => {
    // Inside the tool itself: the list must already be on its way.
    await until(() => count('todos') > 0)
    atRun = [...events].reverse().find(ev => ev.type === 'todos')
    return { result: { oldTodos: [], newTodos: [] } }
  })
  await $.session.start(start)
  await quiet()
  await $.tool.call({ tool: 'TodoWrite', todos: [{ content: 'Read', status: 'completed', activeForm: 'Reading' }, { content: 'Fix', status: 'in_progress', activeForm: 'Fixing' }] })
  expect(atRun).toMatchObject({ todos: [{ text: 'Read', status: 'completed' }, { text: 'Fix', status: 'in_progress' }] })
  expect(typeof atRun?.t).toBe('number')
  // A plain tool after it, as a marker: once its end is in, everything the to-do call said is in too.
  await $.tool.call({ tool: 'Read', file_path: 'a.ts' })
  await until(() => count('tool.end') > 0)
  // Told once: the same list again at the result is not sent a second time.
  expect(events.filter(ev => ev.type === 'todos')).toHaveLength(1)
})

test('the Task tools: a new task shows at once and keeps its place when its real id comes back; an update ticks at its start', async ($, on) => {
  let atUpdate: Record<string, unknown> | undefined
  const { clock, events, quiet, until, count } = brain(on, {})
  on('tool.call', async ($, e) => {
    const x = e as unknown as Record<string, unknown>
    if (x.tool === 'TaskCreate') return { result: { task: { id: String(x.subject) === 'Build' ? '1' : '2', subject: x.subject } } }
    if (x.tool === 'TaskUpdate') { await until(() => count('todos') >= 3); atUpdate = [...events].reverse().find(ev => ev.type === 'todos'); return { result: { success: true } } }
    return { result: 'ok' }
  })
  await $.session.start(start)
  await quiet()
  await $.tool.call({ tool: 'TaskCreate', subject: 'Build', description: 'x', activeForm: 'Building' })
  await $.tool.call({ tool: 'TaskCreate', subject: 'Test', description: 'y' })
  await $.tool.call({ tool: 'TaskUpdate', taskId: '1', status: 'in_progress' })
  expect(atUpdate).toMatchObject({ todos: [{ text: 'Build', status: 'in_progress', active: 'Building' }, { text: 'Test', status: 'pending' }] })
  await $.tool.call({ tool: 'TaskUpdate', taskId: '1', status: 'completed' })
  await $.tool.call({ tool: 'TaskUpdate', taskId: '2', status: 'in_progress' })
  await until(() => count('todos') >= 5)
  const lists = events.filter(ev => ev.type === 'todos').map(ev => (ev.todos as Task[]).map(t => `${t.text}:${t.status}`).join(','))
  expect(lists).toEqual(['Build:pending', 'Build:pending,Test:pending', 'Build:in_progress,Test:pending', 'Build:completed,Test:pending', 'Build:completed,Test:in_progress'])
})

test("a helper agent's to-do list never overwrites the session's", async ($, on) => {
  on('tool.call', () => ({ result: { oldTodos: [], newTodos: [] } }))
  const { clock, events, quiet, until, count } = brain(on, {})
  await $.session.start(start)
  await quiet()
  await $.tool.call({ tool: 'TodoWrite', todos: [{ content: 'Main job', status: 'in_progress', activeForm: 'Doing the main job' }] })
  await $.tool.call({ tool: 'TodoWrite', agentId: 'agent-3', todos: [{ content: 'Helper step', status: 'completed', activeForm: 'x' }] } as never)
  // The marker: a main-loop tool after the helper's call. Once its end is in, the helper's list would have been too.
  await $.tool.call({ tool: 'Read', file_path: 'a.ts' })
  await until(() => count('tool.end') > 0)
  const lists = events.filter(ev => ev.type === 'todos')
  expect(lists).toHaveLength(1)
  expect(lists[0]).toMatchObject({ todos: [{ text: 'Main job', status: 'in_progress' }] })
})

test('a refused to-do call puts the list back', async ($, on) => {
  on('tool.call', ($, e) => ((e as unknown as { todos: unknown[] }).todos.length > 1 ? { result: 'no', isError: true } : { result: {} }))
  const { clock, events, quiet, until, count } = brain(on, {})
  await $.session.start(start)
  await quiet()
  await $.tool.call({ tool: 'TodoWrite', todos: [{ content: 'A', status: 'in_progress', activeForm: 'A' }] })
  await $.tool.call({ tool: 'TodoWrite', todos: [{ content: 'A', status: 'completed', activeForm: 'A' }, { content: 'B', status: 'pending', activeForm: 'B' }] })
  await until(() => count('todos') >= 3)
  const lists = events.filter(ev => ev.type === 'todos').map(ev => (ev.todos as Task[]).map(t => `${t.text}:${t.status}`).join(','))
  expect(lists).toEqual(['A:in_progress', 'A:completed,B:pending', 'A:in_progress'])
})

test('the send path never holds a hook up: a slow brain gets the next events together, in order, in one post', async ($, on) => {
  let release: () => void = () => {}
  let holding = false
  const { clock, events, posts, quiet, until, count } = brain(on, { hold: () => (holding ? new Promise<void>(r => { release = r }) : Promise.resolve()) })
  on('tool.call', () => ({ result: 'ok' }))
  await $.session.start(start)
  await quiet()
  holding = true
  // Each call returns while the brain still sits on the first post.
  await $.tool.call({ tool: 'Bash', command: 'npm test', description: 'Run the tests' })
  await $.tool.call({ tool: 'Read', file_path: 'C:\\x\\a.ts' })
  for (let i = 0; i < 200 && events.length < 3; i++) await clock.settle()
  // Both calls have returned, yet the brain still sits on a post: nothing waited for it.
  expect(events.map(ev => ev.type).slice(0, 3)).toEqual(['snapshot', 'start', 'tool.start'])
  holding = false
  release()
  await until(() => events.length >= 6)
  expect(events.map(ev => ev.type)).toEqual(['snapshot', 'start', 'tool.start', 'tool.end', 'tool.start', 'tool.end'])
  // What was said while a post was out went together, in one post.
  expect(posts.length).toBeLessThan(events.length)
  expect(posts.some(p => Array.isArray(p.events) && (p.events as unknown[]).length >= 2)).toBe(true)
  expect(events.filter(ev => ev.type === 'tool.start').map(ev => ev.tool)).toEqual(['Bash', 'Read'])
})

test('an older brain (no v 2 in its hello) still gets one event per post', async ($, on) => {
  on('tool.call', () => ({ result: 'ok' }))
  const { clock, posts, quiet, until, count } = brain(on, { v1: true })
  await $.session.start(start)
  await quiet()
  await $.tool.call({ tool: 'Bash', command: 'ls' })
  await $.tool.call({ tool: 'Read', file_path: 'a.ts' })
  await until(() => posts.length >= 6)
  expect(posts.every(p => !('events' in p))).toBe(true)
  expect(posts.map(p => p.type)).toEqual(['snapshot', 'start', 'tool.start', 'tool.end', 'tool.start', 'tool.end'])
})

test('Claude writing counts as something happening: one step event per kind as the reply streams', async ($, on) => {
  on('turn.step', async function* (_$, e) {
    yield { kind: 'thinking', index: 0, text: 'hmm' }
    yield { kind: 'text', index: 1, text: 'Here' }
    yield { kind: 'text', index: 1, text: ' it is' }
    yield { kind: 'tool', index: 2, id: 'tu1', name: 'Write' }
    return { turnId: e.turnId, index: e.index, answer: 'Here it is', toolUses: [], stopReason: 'tool_use', usage: null }
  } as never)
  on('tool.call', () => ({ result: 'ok' }))
  const { clock, events, quiet, until, count } = brain(on, {})
  await $.session.start(start)
  await quiet()
  const chunks: string[] = []
  const s = $.turn.step({ turnId: 't1', index: 0, model: 'sonnet', messageCount: 1 })
  for await (const c of s) chunks.push(c.kind)
  expect(chunks).toEqual(['thinking', 'text', 'text', 'tool'])
  await until(() => count('step') >= 3)
  expect(events.filter(ev => ev.type === 'step').map(ev => ev.what)).toEqual(['thinking', 'text', 'tool'])
  expect(events.find(ev => ev.type === 'step' && ev.what === 'tool')).toMatchObject({ tool: 'Write' })
  // A helper agent's steps are not the session's.
  const sub = $.turn.step({ turnId: 't2', index: 0, model: 'sonnet', messageCount: 1, agentId: 'agent-1' })
  for await (const _ of sub) { /* drain */ }
  await $.tool.call({ tool: 'Read', file_path: 'a.ts' })
  await until(() => count('tool.end') > 0)
  expect(events.filter(ev => ev.type === 'step')).toHaveLength(3)
})

// ---- 2026-10-21: sessions with no to-do tool of their own (the Claude desktop app's), and a restarted brain.

test('no built-in to-do tool: the mod registers its own progress tool, the prompt points at it, a call reaches Aang', async ($, on) => {
  const { clock, events, quiet, until, count, registered } = brain(on, { tools: ['Bash', 'Read'] })
  on('prompt.compose', () => SECTIONS)
  await $.session.start(start)
  await quiet()
  // (2026-10-22: show_mockup is registered too, in every session; the progress tool is the one asked about here.)
  const own = registered.filter(r => r.name === OWN_TOOL)
  expect(own).toHaveLength(1)
  expect(own[0]).toMatchObject({ name: OWN_TOOL, isDeferred: false })
  expect(String(own[0]!.description)).toMatch(/start of any task with more than one step/)
  const r = await $.prompt.compose({ ...COMPOSE, tools: ['Bash', OWN_TOOL_FULL] })
  const last = r.sections[r.sections.length - 1]!
  expect(last).toEqual({ id: TODO_SECTION_ID, text: OWN_TOOL_SECTION + ' ' + PLAN_SENTENCE, scope: 'session' })
  expect(OWN_TOOL_SECTION).not.toMatch(/aang(?!-link)/i)
  // The model calls it: answered by the mod itself, the list told like TodoWrite's.
  const res = await $.tool.call({ tool: OWN_TOOL_FULL, tasks: [{ text: 'Plan', status: 'completed' }, { text: 'Build', status: 'in_progress', active: 'Building' }] } as never)
  expect(res).toMatchObject({ result: 'Progress shown.' })
  await until(() => count('todos') > 0)
  expect(events.find(ev => ev.type === 'todos')).toMatchObject({ todos: [{ text: 'Plan', status: 'completed' }, { text: 'Build', status: 'in_progress', active: 'Building' }] })
  expect(count('tool.start')).toBe(0)
  void clock
})

test('a session with TodoWrite gets no second to-do tool: the progress tool is offered for the phase plan only (v3)', async ($, on) => {
  const { quiet, registered } = brain(on, { tools: ['Bash', 'TodoWrite'] })
  on('prompt.compose', () => SECTIONS)
  await $.session.start(start)
  await quiet()
  const own = registered.filter(r => r.name === OWN_TOOL)
  expect(own).toHaveLength(1)
  expect(own[0]).toMatchObject({ name: OWN_TOOL, description: OWN_TOOL_PLAN_DESC })
  expect(JSON.stringify(own[0]!.inputSchema)).not.toContain('"tasks"')
  // The prompt asks for the plan once the tool is there, after the to-do paragraph.
  const r = await $.prompt.compose({ ...COMPOSE, tools: ['Bash', 'TodoWrite', OWN_TOOL_FULL] })
  expect(r.sections[r.sections.length - 1]).toEqual({ id: TODO_SECTION_ID, text: TODO_SECTION + ' ' + PLAN_SENTENCE, scope: 'session' })
  expect(PLAN_SENTENCE).not.toMatch(/aang(?!-link)/i)
})

test('a restarted brain gets the whole session at once, once: list, turn, tools running, helper agents', async ($, on) => {
  const opts: Parameters<typeof brain>[1] = {}
  let toolGo: () => void = () => {}
  on('tool.call', ($, e) => ((e as unknown as { tool: string }).tool === 'Bash' ? new Promise(r => { toolGo = () => r({ result: 'ok' }) }) : { result: {} }))
  on('agent.spawn', () => ({ model: 'haiku', agentId: 'agent-9' }))
  on('turn.start', ($, e) => ({ turnId: e.turnId }))
  const { clock, events, until, count, quiet } = brain(on, opts)
  await $.session.start(start)
  await quiet()
  expect(count('snapshot')).toBe(1)                       // the first brain this session met
  await $.turn.start({ text: 'build it', turnId: 't1' })
  await $.tool.call({ tool: 'TodoWrite', todos: [{ content: 'A', status: 'completed', activeForm: 'A' }, { content: 'B', status: 'in_progress', activeForm: 'Doing B' }] })
  await $.agent.spawn({ prompt: 'x', description: 'Mapping the code', subagentType: 'Explore' })
  const running = $.tool.call({ tool: 'Bash', command: 'npm test', description: 'Run the tests' })
  await until(() => count('tool.start') > 0 && count('agent.start') > 0)
  // Aang restarts: down for a moment, then back with a new key.
  opts.down = true
  await $.tool.call({ tool: 'Read', file_path: 'a.ts' })     // lost on the way
  await quiet()
  opts.down = false; opts.key = 'a-new-key-after-the-brain-restarted-0123456789'
  await clock.advance(6000)                                 // the pump tries again after its pause
  await until(() => count('snapshot') >= 2)
  const snap = [...events].reverse().find(ev => ev.type === 'snapshot')!
  expect(snap).toMatchObject({
    session: SESSION, phase: 'working',
    todos: [{ text: 'A', status: 'completed' }, { text: 'B', status: 'in_progress', active: 'Doing B' }],
    tools: [{ tool: 'Bash', detail: { cmd: 'npm test', desc: 'Run the tests' } }],
    agents: [{ id: 'agent-9', kind: 'Explore', what: 'Mapping the code' }],
  })
  // Normal events carry on after it, and the same brain never gets a second one.
  toolGo(); await running
  await until(() => events.filter(ev => ev.type === 'tool.end').length >= 1 && events.indexOf(snap) < events.length - 1)
  await clock.advance(40_000); await quiet()
  await $.tool.call({ tool: 'Read', file_path: 'b.ts' })
  await until(() => events.some(ev => ev.type === 'tool.start' && (ev.detail as { file?: string })?.file === 'b.ts'))
  expect(count('snapshot')).toBe(2)
})

// ---- v3 (2026-10-21, docs/PROGRESS-RESEARCH.md): heartbeats, helper agents' tool calls, numbered events, the retry,
// and the phase plan through the progress tool.

test('v3: every event is numbered in order under one load id; a resync from the brain brings a snapshot', async ($, on) => {
  on('tool.call', () => ({ result: 'ok' }))
  const opts: Parameters<typeof brain>[1] = {}
  const { events, quiet, until, count, clock } = brain(on, opts)
  await $.session.start(start)
  await quiet()
  await $.tool.call({ tool: 'Read', file_path: 'a.ts' })
  await until(() => count('tool.end') > 0)
  const nums = events.filter(ev => ev.type !== 'snapshot').map(ev => Number(ev.sq))
  expect(nums.every((n, i) => i === 0 || n === nums[i - 1]! + 1)).toBe(true)
  expect(new Set(events.map(ev => ev.gen)).size).toBe(1)
  expect(String(events[0]!.gen)).toMatch(/^[0-9a-f]{12}$/)
  // The brain saw a gap: it says resync, the mod sends the whole picture again.
  opts.resync = true
  await clock.advance(6000)
  await until(() => count('snapshot') >= 2)
  expect(count('snapshot')).toBe(2)
})

test('v3: a post that times out is tried once more before anything is dropped', async ($, on) => {
  on('tool.call', () => ({ result: 'ok' }))
  const opts: Parameters<typeof brain>[1] = {}
  const { events, quiet, until, count } = brain(on, opts)
  await $.session.start(start)
  await quiet()
  opts.failPosts = 1
  await $.tool.call({ tool: 'Bash', command: 'npm test', description: 'Run the tests' })
  await until(() => count('tool.end') > 0)
  expect(events.filter(ev => ev.type === 'tool.start')).toHaveLength(1)
  expect(count('snapshot')).toBe(1)            // nothing was lost, so no second snapshot was needed
})

test('v3: tool.end says whether the tool worked', async ($, on) => {
  on('tool.call', ($, e) => ((e as unknown as { command?: string }).command === 'false' ? { result: 'exit 1', isError: true } : { result: 'ok' }))
  const { events, quiet, until, count } = brain(on, {})
  await $.session.start(start)
  await quiet()
  await $.tool.call({ tool: 'Bash', command: 'true' })
  await $.tool.call({ tool: 'Bash', command: 'false' })
  await until(() => count('tool.end') >= 2)
  expect(events.filter(ev => ev.type === 'tool.end').map(ev => ev.ok)).toEqual([true, false])
})

test('v3 heartbeats: the model streaming sends alive at most every 2 s; a helper agent streaming sends its own', async ($, on) => {
  on('agent.spawn', () => ({ model: 'haiku', agentId: 'agent-5' }))
  const { events, quiet, until, count, clock } = brain(on, {})
  on('turn.step', async function* (_$, e) {
    yield { kind: 'text', index: 0, text: 'a'.repeat(400) }
    for (let i = 0; i < 6; i++) { await clock.advance(900); yield { kind: 'text', index: 0, text: 'b'.repeat(400) } }
    return { turnId: e.turnId, index: e.index, answer: '', toolUses: [], stopReason: 'end_turn', usage: null }
  } as never)
  await $.session.start(start)
  await quiet()
  for await (const _ of $.turn.step({ turnId: 't1', index: 0, model: 'sonnet', messageCount: 1 })) { /* drain */ }
  await until(() => count('alive') >= 2)
  const alive = events.filter(ev => ev.type === 'alive')
  // Six chunks 0.9 s apart after the first: about 5.4 s of streaming, so two beats (not six).
  expect(alive).toHaveLength(2)
  expect(Number(alive[1]!.outTok)).toBeGreaterThan(Number(alive[0]!.outTok))
  await $.agent.spawn({ prompt: 'x', description: 'Mapping the code', subagentType: 'Explore' })
  for await (const _ of $.turn.step({ turnId: 't2', index: 0, model: 'haiku', messageCount: 1, agentId: 'agent-5' })) { /* drain */ }
  await until(() => events.some(ev => ev.type === 'alive' && ev.agent === 'agent-5'))
  expect(events.filter(ev => ev.type === 'alive' && ev.agent === 'agent-5').length).toBeGreaterThanOrEqual(1)
})

test("v3: a helper agent's tool calls are its heartbeats; background helpers are marked; a failed one says so", async ($, on) => {
  on('agent.spawn', ($, e) => ({ model: 'haiku', agentId: (e as { description: string }).description === 'Bg job' ? 'agent-bg' : 'agent-1' }))
  on('tool.call', () => ({ result: 'ok' }))
  on('turn.complete', () => ({ text: '' }))
  const { events, quiet, until, count } = brain(on, {})
  await $.session.start(start)
  await quiet()
  await $.agent.spawn({ prompt: 'x', description: 'Mapping the code', subagentType: 'Explore', background: false } as never)
  await $.agent.spawn({ prompt: 'y', description: 'Bg job', subagentType: 'general-purpose', background: true } as never)
  await $.tool.call({ tool: 'Grep', pattern: 'pill(', agentId: 'agent-1' } as never)
  await $.tool.call({ tool: 'Read', file_path: 'a.ts', agentId: 'agent-1' } as never)
  await $.turn.complete({ answer: '', durationMs: 5, isAborted: false, turnId: 'ta', agentId: 'agent-1', reason: 'error' } as never)
  await until(() => count('agent.end') > 0)
  expect(events.filter(ev => ev.type === 'agent.tool').map(ev => ev.id)).toEqual(['agent-1', 'agent-1'])
  expect(events.filter(ev => ev.type === 'tool.start')).toHaveLength(0)       // a helper's tools are not the session's line
  expect(events.find(ev => ev.type === 'agent.start' && ev.id === 'agent-bg')).toMatchObject({ bg: true })
  expect(events.find(ev => ev.type === 'agent.start' && ev.id === 'agent-1')?.bg).toBeUndefined()
  expect(events.find(ev => ev.type === 'agent.end')).toMatchObject({ id: 'agent-1', ok: false })
})

test("2026-10-21 (sheet 58 C): a helper agent's own to-do list reaches the brain as counts only, and never as the session's list", async ($, on) => {
  on('agent.spawn', () => ({ model: 'haiku', agentId: 'agent-3' }))
  on('tool.call', () => ({ result: 'ok' }))
  const { events, quiet, until } = brain(on, {})
  await $.session.start(start)
  await quiet()
  await $.agent.spawn({ prompt: 'x', description: 'Write the route list', subagentType: 'general-purpose' } as never)
  await $.tool.call({ tool: 'TodoWrite', todos: [{ content: 'secret step one', status: 'completed', activeForm: 'a' }, { content: 'b', status: 'in_progress', activeForm: 'b' }, { content: 'c', status: 'pending', activeForm: 'c' }], agentId: 'agent-3' } as never)
  await until(() => events.some(ev => ev.type === 'agent.todos'))
  expect(events.find(ev => ev.type === 'agent.todos')).toMatchObject({ id: 'agent-3', done: 1, total: 3 })
  expect(JSON.stringify(events.find(ev => ev.type === 'agent.todos'))).not.toContain('secret')
  expect(events.filter(ev => ev.type === 'todos')).toHaveLength(0)
  expect(agentListOf('TodoWrite', { todos: [] })).toBeNull()
  expect(agentListOf('Bash', { command: 'ls' })).toBeNull()
  expect(agentListOf(OWN_TOOL_FULL, { tasks: [{ text: 'a', status: 'completed' }, { text: 'b', status: 'completed' }] })).toEqual({ done: 2, total: 2 })
})

test('v3: the phase plan goes through the progress tool, masked and cut, and rides in a snapshot', async ($, on) => {
  const opts: Parameters<typeof brain>[1] = { tools: ['Bash'] }
  const { events, quiet, until, count, clock } = brain(on, opts)
  await $.session.start(start)
  await quiet()
  const res = await $.tool.call({ tool: OWN_TOOL_FULL, plan: { phases: [
    { label: 'Phase 1: the engine', hours: 6, status: 'done' },
    { label: 'Phase 2: sync with api_key=abcd1234efgh5678', hours: 9.5, status: 'running' },
    { label: 'Phase 3: polish', hours: 3, status: 'later' },
  ] } } as never)
  expect(res).toMatchObject({ result: 'Progress shown.' })
  await until(() => count('plan') > 0)
  const plan = events.find(ev => ev.type === 'plan')!.phases as { label: string; hours: number; status: string }[]
  expect(plan.map(p => p.status)).toEqual(['done', 'running', 'todo'])
  expect(plan[1]!.hours).toBe(9.5)
  expect(plan[1]!.label).not.toContain('abcd1234efgh5678')
  expect(count('todos')).toBe(0)
  // Neither tasks nor plan: told plainly.
  expect(await $.tool.call({ tool: OWN_TOOL_FULL } as never)).toMatchObject({ isError: true })
  expect(planOf({ plan: { phases: [{ label: '', hours: 1, status: 'todo' }] } })).toBeNull()
  // A brain that asks again gets the plan in the snapshot.
  opts.resync = true
  await clock.advance(6000)
  await until(() => count('snapshot') >= 2)
  expect([...events].reverse().find(ev => ev.type === 'snapshot')).toMatchObject({ plan: [{ label: 'Phase 1: the engine' }, {}, { label: 'Phase 3: polish' }] })
})

test('show_mockup (2026-10-22): registered in every session, one prompt line, the call checked then sent signed to the brain, its answer the result', async ($, on) => {
  const { quiet, registered, mockups, seen } = brain(on, { tools: ['Bash', 'TodoWrite'] })
  on('prompt.compose', () => SECTIONS)
  await $.session.start(start)
  await quiet()
  expect(registered.filter(r => r.name === MOCKUP_TOOL)).toHaveLength(1)
  // The prompt line, where the tool is offered: show_mockup, and never asking leave to open local pages.
  const r = await $.prompt.compose({ ...COMPOSE, tools: ['Bash', 'TodoWrite', MOCKUP_TOOL_FULL] })
  expect(r.sections.find(s => s.id === MOCKUP_SECTION_ID)).toEqual({ id: MOCKUP_SECTION_ID, text: MOCKUP_SECTION, scope: 'session' })
  expect(MOCKUP_SECTION).toMatch(/call show_mockup/)
  expect(MOCKUP_SECTION).toMatch(/Never ask permission to open local mockup pages/)
  const none = await $.prompt.compose({ ...COMPOSE, tools: ['Bash'] })
  expect(none.sections.some(s => s.id === MOCKUP_SECTION_ID)).toBe(false)
  // Checked here first: one of path or url, a url on this computer only. Nothing goes to the brain for a bad call.
  expect(mockupArgs({}).ok).toBe(false)
  expect(mockupArgs({ path: 'a.html', url: 'http://127.0.0.1:1/' }).ok).toBe(false)
  for (const url of ['https://example.com/', 'http://127.0.0.1.evil.example/', 'http://u:p@localhost/', 'file:///C:/x.html']) expect(mockupArgs({ url, branch: 'T' }).ok).toBe(false)
  // No topic: refused here, so nothing lands under Other (2026-10-30).
  expect(mockupArgs({ path: 'a.html' })).toMatchObject({ ok: false, error: expect.stringMatching(/Give branch/) })
  const bad = await $.tool.call({ tool: MOCKUP_TOOL_FULL, url: 'https://example.com/x' } as never)
  expect(bad).toMatchObject({ isError: true })
  expect(mockups).toHaveLength(0)
  // A good one: signed with the key, the session and its folder with it, the title cut, the brain's words back.
  const ok = await $.tool.call({ tool: MOCKUP_TOOL_FULL, path: 'docs/motion.html', title: 'Waymark motion ' + 'x'.repeat(200), branch: 'Waymark' } as never)
  expect(ok).toMatchObject({ result: 'Showing docs/motion.html in the Mockups trail.' })
  expect(mockups).toHaveLength(1)
  expect(mockups[0]!.signed).toBe(true)
  expect(mockups[0]!.body).toMatchObject({ session: SESSION, cwd: start.cwd, path: 'docs/motion.html', branch: 'Waymark' })
  expect(String(mockups[0]!.body.title).length).toBe(80)
  expect(seen.filter(p => p === '/link/mockup')).toHaveLength(1)
})

test('show_mockup with Aang down says so and sends nothing', async ($, on) => {
  const { quiet, mockups } = brain(on, { tools: ['Bash'], down: true })
  await $.session.start(start)
  await quiet()
  const r = await $.tool.call({ tool: MOCKUP_TOOL_FULL, url: 'http://127.0.0.1:5173/rec', branch: 'Motion' } as never)
  expect(r).toMatchObject({ isError: true })
  expect(String((r as { result: unknown }).result)).toMatch(/not running/)
  expect(mockups).toHaveLength(0)
})

// ------------------------------------------------------------------ C6 (2026-10-22): starting jobs from Aang

const JOB = 'Goal: fix the rune.\n\nJoshua\'s words: "fix the rune"'
const startJson = async (text = JOB, extra: Record<string, unknown> = {}) => JSON.stringify({ text, hash: await sha256Hex(text), model: 'opus', effort: 'high', ...extra })

/** What reached the engine: commands run, prompts submitted (with whether they read as his own words). */
function engine(on: On) {
  const commands: string[] = []
  const submitted: { text: string; asUser: boolean }[] = []
  on('command.run', ($, e) => { const x = e as unknown as { command: string; args?: string }; commands.push(`/${x.command} ${x.args ?? ''}`.trim()); return {} })
  on('prompt.submit', ($, e) => { const x = e as unknown as { text: string; origin?: { asUser?: boolean } }; submitted.push({ text: x.text, asUser: x.origin?.asUser === true }); return { text: x.text } })
  return { commands, submitted }
}

test('C6 Door 1: a brand-new session takes the signed start for its folder once, sets the model and effort, and sends the exact text as his words', async ($, on) => {
  const { commands, submitted } = engine(on)
  const { clock, quiet, starts, events } = brain(on, { start: await startJson(), startedAt: 0 })
  await $.session.start(start)
  await quiet()
  for (let i = 0; i < 3000 && !submitted.length; i++) await clock.settle()
  expect(starts).toEqual(['c:\\code\\waymark'])
  expect(commands).toEqual(['/model opus', '/effort high'])
  expect(submitted).toEqual([{ text: JOB, asUser: true }])
  await quiet()
  expect(events.some(ev => ev.type === 'started' && ev.id === 'st1')).toBe(true)
})

test('C6 Door 1: a forged MAC, a text that is not what his card hashed, or an old session: nothing is sent', async ($, on) => {
  const { commands, submitted } = engine(on)
  const { quiet } = brain(on, { start: await startJson(), forgeStart: true, startedAt: 0 })
  await $.session.start(start)
  await quiet()
  expect(submitted).toHaveLength(0)
  expect(commands).toHaveLength(0)
})

test('C6 Door 1: the text must hash to what his card showed, byte for byte', async ($, on) => {
  const { submitted } = engine(on)
  const body = JSON.stringify({ text: JOB + ' ', hash: await sha256Hex(JOB) })
  const { quiet } = brain(on, { start: body, startedAt: 0 })
  await $.session.start(start)
  await quiet()
  expect(submitted).toHaveLength(0)
})

test('C6 Door 1: a session that started long ago (a mod reload) never asks for a start', async ($, on) => {
  const { submitted } = engine(on)
  const { quiet, starts } = brain(on, { start: await startJson(), startedAt: -10 * 60_000 })
  await $.session.start(start)
  await quiet()
  expect(starts).toHaveLength(0)
  expect(submitted).toHaveLength(0)
})

test('C6 resume: a signed start in the poll goes in as his own words, no model or effort touched', async ($, on) => {
  const { commands, submitted } = engine(on)
  const { clock, quiet } = brain(on, { startInbox: JSON.stringify({ text: JOB, hash: await sha256Hex(JOB) }) })
  await $.session.start(start)
  await quiet()
  for (let i = 0; i < 300 && !submitted.length; i++) await clock.settle()
  expect(submitted).toEqual([{ text: JOB, asUser: true }])
  expect(commands).toHaveLength(0)
})

// 2026-10-22, his words: "If I act on something Aang is surfacing, like a question, in Claude without clicking on Aang,
// it should disappear." The engine raises the request inside the tool call; he answers it in Claude's own dialog, the
// tool runs and ends: Aang is told once, with the ask's id, and the ask names the call it was for.
test('answered in Claude, not in Aang: the ask is resolved once, and carries its tool call', async ($, on) => {
  const questions = [{ question: 'Which colour?', header: 'Colour', options: [{ label: 'Plum', description: '' }, { label: 'Sage', description: '' }], multiSelect: false }]
  let asked: Promise<unknown> | null = null
  const { clock, events, quiet, until, count } = brain(on, { goneOnResolved: true })
  const test$ = $
  on('tool.call', async () => {
    // The dialog's input need not match the call's byte for byte: the one open call of that tool is still found.
    asked = test$.classic.PermissionRequest({ tool_name: 'AskUserQuestion', tool_input: { questions, metadata: { source: 'dialog' } }, permission_suggestions: [] })
    for (let i = 0; i < 3000 && !events.some(ev => ev.type === 'ask'); i++) await clock.settle()
    return { result: { questions, answers: { 'Which colour?': 'Plum' } } }
  })
  await $.session.start(start)
  await quiet()
  await $.tool.call({ tool: 'AskUserQuestion', questions })
  await until(() => count('resolved') > 0 && asked !== null)
  const r = await asked as { decision?: unknown }
  await quiet()
  expect(r.decision).toBeUndefined()
  const ask = events.find(ev => ev.type === 'ask') as { id: string; toolUseId?: string; t?: number }
  expect(typeof ask.toolUseId).toBe('string')
  expect(typeof ask.t).toBe('number')
  const resolved = events.filter(ev => ev.type === 'resolved')
  expect(resolved).toHaveLength(1)
  expect(resolved[0]).toMatchObject({ id: ask.id })
})

test('Esc or a new message in Claude ends the turn: what its main loop asked is resolved, and the request lets go', async ($, on) => {
  on('turn.start', ($, e) => ({ turnId: e.turnId }))
  on('turn.complete', () => ({ text: '' }))
  const { events, quiet, until, count } = brain(on, { goneOnResolved: true })
  await $.session.start(start)
  await quiet()
  await $.turn.start({ text: 'go', turnId: 't1' })
  // No tool call around it here: only the turn's end can say it is over (the brain's poll is held until then).
  const p = $.classic.PermissionRequest({ tool_name: 'Bash', tool_input: { command: 'npm test' }, permission_suggestions: [] })
  await until(() => count('ask') > 0)
  const ask = events.find(ev => ev.type === 'ask') as { id: string; toolUseId?: string }
  expect(ask.toolUseId).toBeUndefined()
  await $.turn.complete({ answer: '', durationMs: 5, isAborted: true, turnId: 't1', reason: 'aborted' } as never)
  await until(() => count('resolved') > 0)
  expect((await p as { decision?: unknown }).decision).toBeUndefined()
  await quiet()
  const resolved = events.filter(ev => ev.type === 'resolved')
  expect(resolved).toHaveLength(1)
  expect(resolved[0]).toMatchObject({ id: ask.id })
})

test('the pure match: a request finds the tool call it is for', () => {
  const running: [string, { tool: string; input: string; reqId?: string; agentId?: string }][] = [
    ['tu1', { tool: 'Bash', input: '{"command":"ls"}' }],
    ['tu2', { tool: 'Bash', input: '{"command":"npm test"}' }],
    ['tu3', { tool: 'AskUserQuestion', input: '{"questions":[]}' }],
    ['tu4', { tool: 'Read', input: '{"file_path":"a"}', agentId: 'ag1' }],
    ['tu5', { tool: 'Read', input: '{"file_path":"b"}' }],
  ]
  expect(callFor(running, 'Bash', '{"command":"npm test"}')).toBe('tu2')
  expect(callFor(running, 'AskUserQuestion', '{"questions":[],"x":1}')).toBe('tu3')
  expect(callFor(running, 'Bash', '{"command":"pwd"}')).toBeNull()
  expect(callFor(running, 'Read', '{"file_path":"c"}', 'ag1')).toBe('tu4')
  expect(callFor(running, 'Read', '{"file_path":"c"}')).toBe('tu5')
  running[2]![1].reqId = 'already'
  expect(callFor(running, 'AskUserQuestion', '{"questions":[]}')).toBeNull()
})

