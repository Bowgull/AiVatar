// aang-link: the MAC, the to-do list, his answers, and the fail-safe rule (Aang down or not proven = the session
// behaves exactly as without the mod). The brain is played by the test's own http.fetch hook.
import { describe, expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'
import { hmacHex, nextTasks, toDecision } from '../hooks/link.ts'
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
function brain(on: On, opts: { answer?: string; forge?: boolean; squatter?: boolean; down?: boolean; inbox?: string }) {
  const seen: string[] = []
  const events: Record<string, unknown>[] = []
  let inbox = opts.inbox
  mock.env(on, { USERPROFILE: 'C:\\Users\\T' })
  const clock = mock.clock(on)
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('classic.PermissionRequest', () => ({}))
  on('session.id', () => ({ value: SESSION }))
  on('session.model', () => ({ value: 'sonnet' }))
  on('fs.read', ($, e) => (String(e.path).endsWith('link.key') ? { value: KEY } : { deny: 'no such file' }))
  on('http.fetch', async ($, e) => {
    const u = new URL(e.url)
    seen.push(u.pathname)
    if (opts.down) throw new Error('connection refused')
    const n = u.searchParams.get('n') ?? ''
    const reply = (v: unknown) => ({ value: { status: 200, ok: true, headers: {}, text: JSON.stringify(v) } })
    if (u.pathname === '/link/hello') return reply({ proof: opts.squatter ? 'f'.repeat(64) : await hmacHex(KEY, 'hello', n) })
    if (u.pathname === '/link/event') { events.push(JSON.parse(e.init?.body ?? '{}')); return { value: { status: 204, ok: true, headers: {}, text: '' } } }
    if (u.pathname === '/link/wait' && inbox) {
      const body = JSON.stringify({ text: inbox }); inbox = undefined
      return reply({ items: [{ id: 'm1', kind: 'inbox', body, mac: await hmacHex(KEY, n, SESSION, 'm1', 'inbox', body) }] })
    }
    if (u.pathname === '/link/answer' && opts.answer) {
      const id = u.searchParams.get('r') ?? ''
      const mac = opts.forge ? '0'.repeat(64) : await hmacHex(KEY, n, SESSION, id, 'answer', opts.answer)
      return reply({ items: [{ id, kind: 'answer', body: opts.answer, mac }] })
    }
    return reply({ items: [] })
  })
  return { seen, clock, events }
}

const start = { cwd: 'C:\\code\\Waymark', surface: null, isInteractive: true } as const

test('his "yes" from Aang, with the right MAC, approves', async ($, on) => {
  const { seen, clock } = brain(on, { answer: JSON.stringify({ decision: 'allow' }) })
  await $.session.start(start)
  await clock.settle(); await clock.settle()
  const r = await $.classic.PermissionRequest({ tool_name: 'Bash', tool_input: { command: 'npm test' }, permission_suggestions: [] })
  expect(r.decision).toEqual({ behavior: 'allow' })
  expect(seen).toContain('/link/event')
})

test('an answer with a forged MAC is ignored: Claude\'s own dialog decides', async ($, on) => {
  const { clock } = brain(on, { answer: JSON.stringify({ decision: 'allow' }), forge: true })
  await $.session.start(start)
  await clock.settle(); await clock.settle()
  const r = await $.classic.PermissionRequest({ tool_name: 'Bash', tool_input: { command: 'rm -rf build' }, permission_suggestions: [] })
  expect(r.decision).toBeUndefined()
})

test('a program on the port that cannot prove the key is told nothing', async ($, on) => {
  const { seen, clock } = brain(on, { answer: JSON.stringify({ decision: 'allow' }), squatter: true })
  await $.session.start(start)
  await clock.settle(); await clock.settle()
  const r = await $.classic.PermissionRequest({ tool_name: 'Bash', tool_input: { command: 'ls' }, permission_suggestions: [] })
  expect(r.decision).toBeUndefined()
  expect(seen).not.toContain('/link/event')
  expect(seen).not.toContain('/link/answer')
})

test('Aang down: the request passes straight through', async ($, on) => {
  const { clock } = brain(on, { down: true })
  await $.session.start(start)
  await clock.settle(); await clock.settle()
  const r = await $.classic.PermissionRequest({ tool_name: 'Bash', tool_input: { command: 'ls' }, permission_suggestions: [] })
  expect(r.decision).toBeUndefined()
})

test('his pick from Aang answers AskUserQuestion', async ($, on) => {
  const questions = [{ question: 'Which colour?', header: 'Colour', options: [{ label: 'Plum', description: '' }, { label: 'Sage', description: '' }], multiSelect: false }]
  const { clock } = brain(on, { answer: JSON.stringify({ answers: { 'Which colour?': 'Sage' } }) })
  await $.session.start(start)
  await clock.settle(); await clock.settle()
  const r = await $.classic.PermissionRequest({ tool_name: 'AskUserQuestion', tool_input: { questions }, permission_suggestions: [] })
  expect(r.decision).toEqual({ behavior: 'allow', updatedInput: { questions, answers: { 'Which colour?': 'Sage' } } })
})

test("Aang's own chat lanes are left alone", async ($, on) => {
  const { seen, clock } = brain(on, { answer: JSON.stringify({ decision: 'allow' }) })
  await $.session.start({ ...start, cwd: 'C:\\Users\\T\\Documents\\Aang\\.aang-self' })
  await clock.settle(); await clock.settle()
  const r = await $.classic.PermissionRequest({ tool_name: 'Bash', tool_input: { command: 'ls' }, permission_suggestions: [] })
  expect(r.decision).toBeUndefined()
  expect(seen).toHaveLength(0)
})

test('a message from Aang starts a turn when the session is idle', async ($, on) => {
  const sent: string[] = []
  on('prompt.submit', ($, e) => { sent.push(e.text); return { text: e.text } })
  const { clock } = brain(on, { inbox: 'also update the changelog' })
  await $.session.start(start)
  await clock.settle(); await clock.settle(); await clock.settle()
  expect(sent).toEqual(['Joshua (sent through Aang): also update the changelog'])
})

test("Claude's to-do list reaches Aang as it changes", async ($, on) => {
  on('tool.call', () => ({ result: { oldTodos: [], newTodos: [] } }))
  const { clock, events } = brain(on, {})
  await $.session.start(start)
  await clock.settle(); await clock.settle()
  await $.tool.call({ tool: 'TodoWrite', todos: [{ content: 'Write tests', status: 'in_progress', activeForm: 'Writing tests' }] })
  await clock.settle(); await clock.settle()
  expect(events.find(ev => ev.type === 'todos')).toMatchObject({ session: SESSION, todos: [{ text: 'Write tests', status: 'in_progress', active: 'Writing tests' }] })
})
