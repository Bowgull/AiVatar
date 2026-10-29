// aang-link's plain parts: the MAC, the summaries Aang shows, the to-do list, and turning his answer into Claude
// Code's own permission decision. No `$` here, so the tests can check each one directly.

const enc = new TextEncoder()

const hex = (b: Uint8Array): string => Array.from(b, x => x.toString(16).padStart(2, '0')).join('')

async function sha256(bytes: Uint8Array): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))
}

/**
 * HMAC-SHA256 (RFC 2104) as hex, built from SHA-256: the mod's environment has `crypto.subtle.digest` and nothing
 * else of WebCrypto. The brain checks with Node's createHmac over the same bytes (the key's UTF-8, the parts joined
 * by newlines), so the two always agree.
 */
export async function hmacHex(key: string, ...parts: string[]): Promise<string> {
  let k = enc.encode(key)
  if (k.length > 64) k = await sha256(k)
  const block = new Uint8Array(64)
  block.set(k)
  const msg = enc.encode(parts.join('\n'))
  const inner = new Uint8Array(64 + msg.length)
  inner.set(block.map(b => b ^ 0x36))
  inner.set(msg, 64)
  const outer = new Uint8Array(64 + 32)
  outer.set(block.map(b => b ^ 0x5c))
  outer.set(await sha256(inner), 64)
  return hex(await sha256(outer))
}

/** Compare two MACs without stopping at the first difference. */
export function sameMac(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let d = 0
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return d === 0
}

/** A fresh nonce: 16 random bytes as hex. */
export const nonce = (): string => hex(crypto.getRandomValues(new Uint8Array(16)))

/** JSON with the keys sorted, so the same input reads the same from tool.call and from the permission request. */
export function stableJson(v: unknown): string {
  return JSON.stringify(v, (_k, x) =>
    x && typeof x === 'object' && !Array.isArray(x) ? Object.fromEntries(Object.entries(x as Record<string, unknown>).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) : x) ?? 'null'
}

/** One tool call running now, as the mod keeps it (register.ts L.running). */
export interface RunningCall { tool: string; input: string; reqId?: string; answered?: boolean; agentId?: string }

/**
 * Which running tool call a permission request (or a question, or a plan) is for, by its tool_use_id (2026-10-22, his
 * "if I answer it in Claude it should disappear from Aang"). The request does not carry the id, so it is found: the
 * newest call of that tool with the very same input and no request yet; failing that (the input as the dialog reads it
 * can differ from the call's), the only open call of that tool in the same loop, or the only one at all. Null when it
 * cannot be told apart: then the ask is still cleared when the request itself ends, or by the brain's safety nets.
 */
export function callFor(running: Iterable<[string, RunningCall]>, tool: string, input: string, agentId?: string): string | null {
  const open = [...running].filter(([, x]) => x.tool === tool && !x.reqId)
  const exact = open.filter(([, x]) => x.input === input)
  if (exact.length) return exact[exact.length - 1]![0]
  const loop = open.filter(([, x]) => (x.agentId ?? '') === (agentId ?? ''))
  if (loop.length === 1) return loop[0]![0]
  return open.length === 1 ? open[0]![0] : null
}

const str = (v: unknown, n: number): string => (typeof v === 'string' ? v : '').replace(/\s+/g, ' ').trim().slice(0, n)

/** One plain line about what a tool call wants, for the card. Aang words it for him; this is the raw fact. */
export function summarize(tool: string, input: unknown): string {
  const i = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>
  if (tool === 'Bash' || tool === 'PowerShell') return str(i.description, 200) || `run: ${str(i.command, 200)}`
  if (tool === 'Edit' || tool === 'Write' || tool === 'NotebookEdit') return `${tool === 'Write' ? 'write' : 'edit'} ${str(i.file_path ?? i.notebook_path, 240)}`
  if (tool === 'Read') return `read ${str(i.file_path, 240)}`
  if (tool === 'WebFetch') return `open ${str(i.url, 240)}`
  if (tool === 'WebSearch') return `search the web for ${str(i.query, 200)}`
  if (tool === 'ExitPlanMode') return 'the plan is ready'
  if (tool === 'AskUserQuestion') return str((i.questions as { question?: string }[] | undefined)?.[0]?.question, 240) || 'a question'
  const first = Object.values(i).find(v => typeof v === 'string')
  return `${tool}${first ? `: ${str(first, 200)}` : ''}`
}

/**
 * Anything that looks like a key, token or password, masked, before a command ever leaves the session (2026-10-21).
 * The brain masks again (src/Core/src/claudeprogress.ts stripSecrets, the same patterns), so neither side trusts the other.
 */
export function stripSecrets(s: string): string {
  return s
    .replace(/(\/\/)[^/\s:@]+:[^/\s@]+@/g, '$1•••@')
    .replace(/\b(Bearer|Basic|token)\s+[A-Za-z0-9._~+/=-]{8,}/gi, '$1 •••')
    .replace(/\b([A-Za-z_][A-Za-z0-9_]*(?:KEY|TOKEN|SECRET|PASSWORD|PASSWD|PWD|AUTH|COOKIE|SESSION)[A-Za-z0-9_]*)(\s*[=:]\s*)("[^"]*"|'[^']*'|\S+)/gi, '$1$2•••')
    .replace(/(--?(?:password|passwd|pass|token|api[-_]?key|secret|auth|key)(?:=|\s+))("[^"]*"|'[^']*'|\S+)/gi, '$1•••')
    .replace(/([?&](?:key|token|access_token|api_key|apikey|sig|signature|password|secret|code)=)[^&\s"']+/gi, '$1•••')
    .replace(/\b(?:sk-(?:ant-)?|gh[pousr]_|github_pat_|xox[abprs]-|AKIA|AIza|glpat-|npm_)[A-Za-z0-9_-]{8,}/g, '•••')
    .replace(/\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]*/g, '•••')
    .replace(/\b(?=[A-Za-z0-9_+-]*\d)(?=[A-Za-z0-9_+-]*[A-Za-z])[A-Za-z0-9_+-]{32,}={0,2}/g, '•••')
}

/** Masked first, then cut: a token cut in half before masking could slip through. */
export const safeLine = (v: unknown, n: number): string => stripSecrets((typeof v === 'string' ? v : '').replace(/\s+/g, ' ').trim()).slice(0, n)
const safe = safeLine
const fileName = (v: unknown): string => safe(v, 400).split(/[\\/]/).filter(Boolean).pop()?.slice(0, 80) ?? ''

/** The to-do tools: their news already reaches Aang as the list itself, so they are not reported as activity. */
const LIST_TOOLS = new Set(['TodoWrite', 'TaskCreate', 'TaskUpdate', 'TaskList', 'TaskGet', 'mcp__aang-link__progress'])

/**
 * The safe bits of a tool call for Aang's live "what's happening" line (2026-10-21): never file contents, never a
 * whole path, never a secret. A command is its first 60 characters after masking; a file is its name; a web page its
 * site. Null for the to-do tools (nothing to say that the list does not).
 */
export function activityOf(tool: string, input: Record<string, unknown>): Record<string, string> | null {
  if (LIST_TOOLS.has(tool)) return null
  const out: Record<string, string> = {}
  const put = (k: string, v: string) => { if (v) out[k] = v }
  if (tool === 'Bash' || tool === 'PowerShell') { put('cmd', safe(input.command, 60)); put('desc', safe(input.description, 60)) }
  else if (tool === 'Edit' || tool === 'MultiEdit' || tool === 'Write' || tool === 'Read' || tool === 'NotebookEdit') put('file', fileName(input.file_path ?? input.notebook_path))
  else if (tool === 'Grep') { put('pattern', safe(input.pattern, 40)); put('where', fileName(input.path)) }
  else if (tool === 'Glob') put('pattern', safe(input.pattern, 50))
  else if (tool === 'WebFetch') { try { put('site', new URL(String(input.url ?? '')).hostname.slice(0, 60)) } catch { /* not a URL: no site */ } }
  else if (tool === 'WebSearch') put('query', safe(input.query, 60))
  else if (tool === 'Agent' || tool === 'Task') { put('agent', safe(input.description, 60)); put('kind', safe(input.subagent_type, 40)) }
  else if (tool === 'Skill') put('skill', safe(input.skill ?? input.command, 40))
  else {
    const m = /^mcp__(.+?)__(.+)$/.exec(tool)
    if (m) { put('server', safe(m[1], 40)); put('name', safe(m[2], 40)) }
  }
  return out
}

export type TaskStatus = 'pending' | 'in_progress' | 'completed'
export interface Task { text: string; status: TaskStatus; active?: string }
const STATUS: readonly string[] = ['pending', 'in_progress', 'completed']
const status = (s: unknown): TaskStatus => (STATUS.includes(String(s)) ? (s as TaskStatus) : 'pending')

const listOf = (tasks: Map<string, Task>): Task[] => [...tasks.values()].filter(t => t.text)

/**
 * Claude's to-do list as the call's INPUT already says it will be, so Aang hears it at the tool's start, not a round
 * trip later (2026-10-21, his "as fast as when Claude gets a reply"). TodoWrite carries the whole list; a TaskUpdate
 * its new status; a TaskCreate its task, kept under a stand-in id (`new:<call id>`) until the result names the real
 * one (tasksAtEnd). Null when the call does not change the list.
 */
export function tasksAtStart(tasks: Map<string, Task>, tool: string, input: Record<string, unknown>, callId: string): Task[] | null {
  if (tool === 'TodoWrite') {
    if (!Array.isArray(input.todos)) return null
    tasks.clear()
    input.todos.forEach((t: Record<string, unknown>, n: number) =>
      tasks.set(String(n), { text: str(t?.content, 300), status: status(t?.status), ...(t?.activeForm ? { active: str(t.activeForm, 300) } : {}) }))
  } else if (tool === 'mcp__aang-link__progress') {
    // The mod's own tool (OWN_TOOL): the whole list each time, as TodoWrite, in its own field names.
    if (!Array.isArray(input.tasks)) return null
    tasks.clear()
    input.tasks.slice(0, 100).forEach((t: Record<string, unknown>, n: number) =>
      tasks.set(String(n), { text: str(t?.text, 300), status: status(t?.status), ...(t?.active ? { active: str(t.active, 300) } : {}) }))
  } else if (tool === 'TaskCreate') {
    if (!str(input.subject, 300)) return null
    tasks.set(`new:${callId}`, { text: str(input.subject, 300), status: 'pending', ...(input.activeForm ? { active: str(input.activeForm, 300) } : {}) })
  } else if (tool === 'TaskUpdate') {
    const id = String(input.taskId ?? '')
    const t = tasks.get(id)
    if (!t) return null
    if (input.status === 'deleted') tasks.delete(id)
    else tasks.set(id, {
      text: input.subject ? str(input.subject, 300) : t.text,
      status: input.status ? status(input.status) : t.status,
      ...(input.activeForm ? { active: str(input.activeForm, 300) } : t.active ? { active: t.active } : {}),
    })
  } else return null
  return listOf(tasks)
}

/**
 * What only the result can say: a new task's real id (its stand-in swapped in place, so the order holds), and
 * TaskList's whole list. Null when the call does not change the list.
 */
export function tasksAtEnd(tasks: Map<string, Task>, tool: string, input: Record<string, unknown>, result: unknown, callId: string): Task[] | null {
  const r = (result && typeof result === 'object' ? result : {}) as Record<string, unknown>
  if (tool === 'TaskCreate') {
    const task = r.task as { id?: unknown; subject?: unknown } | undefined
    const tmp = `new:${callId}`
    const had = tasks.get(tmp)
    if (!task?.id) { if (!had) return null; tasks.delete(tmp); return listOf(tasks) }
    const real: Task = { text: str(task.subject ?? input.subject, 300) || had?.text || '', status: had?.status ?? 'pending', ...(had?.active ? { active: had.active } : input.activeForm ? { active: str(input.activeForm, 300) } : {}) }
    const rows = [...tasks.entries()]
    tasks.clear()
    let put = false
    for (const [k, v] of rows) { if (k === tmp) { tasks.set(String(task.id), real); put = true } else tasks.set(k, v) }
    if (!put) tasks.set(String(task.id), real)
    return listOf(tasks)
  }
  if (tool === 'TaskList') {
    if (!Array.isArray(r.tasks)) return null
    const old = new Map(tasks)
    tasks.clear()
    for (const t of r.tasks as Record<string, unknown>[]) {
      const id = String(t?.id ?? '')
      if (!id) continue
      const was = old.get(id)
      tasks.set(id, { text: str(t.subject, 300), status: status(t.status), ...(was?.active ? { active: was.active } : {}) })
    }
    return listOf(tasks)
  }
  return null
}

/**
 * A helper agent's own to-do list, as counts only (2026-10-21, sheet 58 C: each helper's row under its job has its own
 * bar). Only the two tools that carry the WHOLE list in their input (TodoWrite, the mod's own progress tool) are read,
 * so there is nothing to keep per helper; no item's words leave the mod. Null for anything else.
 */
export function agentListOf(tool: string, input: Record<string, unknown>): { done: number; total: number } | null {
  const rows = tool === 'TodoWrite' ? input.todos : tool === 'mcp__aang-link__progress' ? input.tasks : null
  if (!Array.isArray(rows) || !rows.length) return null
  const list = rows.slice(0, 200) as Record<string, unknown>[]
  return { done: list.filter(t => t?.status === 'completed').length, total: list.length }
}

/**
 * Claude's to-do list after one whole call (start and result together). Two tool families keep one: TodoWrite (the
 * whole list each time) and the Task tools (TaskCreate / TaskUpdate / TaskList, one task at a time). Null when the
 * call did not change it.
 */
export function nextTasks(tasks: Map<string, Task>, tool: string, input: Record<string, unknown>, result: unknown, callId = 'call'): Task[] | null {
  const a = tasksAtStart(tasks, tool, input, callId)
  const b = tasksAtEnd(tasks, tool, input, result, callId)
  return b ?? a
}

/**
 * The one paragraph the mod adds to every session's system prompt (2026-10-21, his decision: "YES, tell every Claude
 * session to keep a to-do list"). The progress bars are built from that list, so a job without one can only say
 * "Working". Plain, short, and nothing about Aang.
 */
export const TODO_SECTION_ID = 'aang-link:todos'
export const TODO_SECTION = 'For any task with more than one step, create a to-do list with your to-do tool before starting the work. ' +
  'Mark each item in_progress the moment you start it and completed the moment it is done, one item in progress at a time, never saving ticks up for later. ' +
  'The user watches live progress bars built from this list, so keep it accurate.'
/** The built-in to-do tools the prompt section points at. */
export const TODO_TOOLS = ['TodoWrite', 'TaskCreate']

/**
 * The mod's own to-do tool (2026-10-21), registered only in a session that has no built-in one: the Claude desktop
 * app's sessions offer neither TodoWrite nor the Task tools, so "keep a to-do list" had nothing to keep it with. It
 * goes nowhere but Aang: the call is answered "ok" by the mod itself and its list is told to the brain like TodoWrite's.
 */
export const OWN_TOOL = 'progress'
export const OWN_TOOL_FULL = 'mcp__aang-link__progress'
export const OWN_TOOL_DESC = 'Your to-do list for the current task, shown to the user as a live progress bar. ' +
  'Call it at the start of any task with more than one step with the whole plan, then again every time a step starts or finishes. ' +
  'Always pass the full list; exactly one item in_progress while you work.'
/**
 * v3 (2026-10-21, his build list): the progress tool also takes the project's phase plan, so Aang can show OVERALL
 * (the whole project) above CURRENT (the job in hand), like his Waymark mod. Claude keeps it current; the brain
 * corrects the hour estimates by how past phases went. In a session that has TodoWrite the tool is offered for the
 * plan only, with this shorter description.
 */
export const OWN_TOOL_PLAN_DESC = "Your project's phase plan, shown to the user as an OVERALL progress bar. " +
  'On a project with several phases, call it with plan: every phase with a short label, your estimate in hours and its status; ' +
  'call it again whenever a phase starts or finishes. Keep using your to-do tool for the steps of the job in hand.'
const PLAN_SCHEMA = {
  type: 'object',
  description: "The project's phases, for multi-phase projects only. Always the whole plan.",
  properties: {
    phases: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          label: { type: 'string', description: 'The phase, short ("Phase 2: the sync engine").' },
          hours: { type: 'number', description: 'Your estimate of its working hours.' },
          status: { type: 'string', enum: ['todo', 'running', 'done'] },
        },
        required: ['label', 'hours', 'status'],
      },
    },
  },
  required: ['phases'],
}
export const OWN_TOOL_PLAN_SCHEMA = { type: 'object', properties: { plan: PLAN_SCHEMA }, required: ['plan'] }
export const OWN_TOOL_SCHEMA = {
  type: 'object',
  properties: {
    plan: PLAN_SCHEMA,
    tasks: {
      type: 'array',
      description: 'Every step of the task, in order.',
      items: {
        type: 'object',
        properties: {
          text: { type: 'string', description: 'The step, short and imperative ("Fix the login bug").' },
          status: { type: 'string', enum: ['pending', 'in_progress', 'completed'] },
          active: { type: 'string', description: 'The same step as it is being done ("Fixing the login bug").' },
        },
        required: ['text', 'status'],
      },
    },
  },
}
export const OWN_TOOL_SECTION = 'For any task with more than one step, call the progress tool (mcp__aang-link__progress) before starting the work with your whole plan as a to-do list. ' +
  'Call it again the moment each step starts (in_progress) and the moment it is done (completed), one step in progress at a time, always with the full list. ' +
  'The user watches live progress bars built from this list, so keep it accurate.'
/** v3: one more sentence, in every session that has the progress tool: the phase plan for OVERALL. */
export const PLAN_SENTENCE = 'On a project with several phases (hours or days of work), also pass plan to the progress tool (mcp__aang-link__progress): ' +
  'every phase with a short label, your estimate in hours and its status (todo, running or done), and call it again whenever a phase starts or finishes.'

/**
 * show_mockup (2026-10-22, his ask: "All Claude sessions should be sending mockups to Samara"). Registered in every
 * session; a call goes to the brain over the signed link (/link/mockup), and the brain, not the mod, leaves the file for
 * Samara: a session the Claude desktop app started runs sandboxed, and its own writes to %APPDATA% never reach Samara.
 */
export const MOCKUP_TOOL = 'show_mockup'
export const MOCKUP_TOOL_FULL = 'mcp__aang-link__show_mockup'
export const MOCKUP_TOOL_DESC = "Show the user a mockup, design sheet or visual page: it opens in his browser Samara, in its Mockups trail, where every version is kept. " +
  'path: an .html file in your repo, already committed (he sees it as committed; commit again and call again for a new version). ' +
  'Or url: a page you serve on this computer (http://127.0.0.1:<port>/... or localhost). title: a short name ("NN · Name"). ' +
  'The trail is Project > Topic > Sheet: project is what it belongs to (Samara, Couch Mode, Waymark...), branch is the topic inside it (Top bar, TV...). ' +
  'icon: pick the one that fits the topic; it is used when the topic is new.'
/** Sheet 100 (2026-10-28, his "can't Claude decide what fits"): the icons a topic can wear, Samara's own set (pages/mockicons.js). */
export const MOCKUP_ICONS = ['bar', 'shield', 'tv', 'claude', 'bell', 'key', 'globe', 'cog', 'log', 'keyboard', 'tabs', 'fire', 'pad', 'scroll', 'star', 'post', 'video', 'camera', 'mic', 'cal', 'letter', 'moon', 'ads', 'popup']
export const MOCKUP_TOOL_SCHEMA = {
  type: 'object',
  properties: {
    path: { type: 'string', description: 'An .html file in your repo (relative to your folder, or absolute), committed.' },
    url: { type: 'string', description: 'Instead of path: a page on this computer, http://127.0.0.1:<port>/... or http://localhost:<port>/...' },
    title: { type: 'string', description: 'A short name for it in the trail ("Waymark motion").' },
    branch: { type: 'string', description: 'The topic inside the project to file it in ("Top bar", "TV"), 1-40 characters.' },
    project: { type: 'string', description: 'Optional: the project it belongs to ("Samara", "Couch Mode"), 1-40 characters. Default: its repo\'s project.' },
    icon: { type: 'string', enum: MOCKUP_ICONS, description: 'The icon that fits the topic best (used when the topic is new): bar a window\'s top bar, shield safety, tv, claude, bell notices, key logins, globe web, cog settings, log a book, keyboard typing, tabs, fire, pad games, scroll writing, star, post a signpost, video, camera, mic, cal dates, letter mail, moon night, ads, popup.' },
  },
}
/**
 * mockup_mark (sheet 79, his interview 2026-10-23): the marks in Samara's Mockups trail, for every Claude session. No
 * stage: the list of marked versions (what he approved, what is built, what needs a fix, what he parked); read it before
 * building from a mockup, so the approved version wins over any older plan. With a stage: Claude's own mark on a sheet in
 * the repo; an approval needs his own words from the chat.
 */
export const MARK_TOOL = 'mockup_mark'
export const MARK_TOOL_FULL = 'mcp__aang-link__mockup_mark'
export const MARK_TOOL_DESC = "Read or set the marks in his Mockups trail in Samara. Call with no stage to list every marked version: APPROVED (build exactly this one), " +
  'BUILT, FIX (with his note) and PARKED (do not build). Read it before building anything from a mockup. When he says yes to a mockup in the chat, mark it: ' +
  'stage approved, with his exact words in said. After you build an approved version into Samara, mark it stage built. ' +
  'path: the sheet (.html in your repo); version: optional (default the newest).'
export const MARK_TOOL_SCHEMA = {
  type: 'object',
  properties: {
    path: { type: 'string', description: 'The sheet, an .html file in your repo (needed to set a mark).' },
    version: { type: 'number', description: 'Optional: which version (default the newest).' },
    stage: { type: 'string', enum: ['approved', 'built', 'fix', 'park', 'clear'], description: 'Leave out to list the marks.' },
    said: { type: 'string', description: 'For approved: his own words from the chat when he said yes.' },
    note: { type: 'string', description: 'For fix: what he wants changed.' },
  },
}
/** A mockup_mark call's input, cut to sane sizes; or why not. */
export function markArgs(input: Record<string, unknown>): { ok: true; list: true } | { ok: true; list: false; body: Record<string, unknown> } | { ok: false; error: string } {
  const stage = typeof input.stage === 'string' ? input.stage.trim() : ''
  if (!stage) return { ok: true, list: true }
  if (!['approved', 'built', 'fix', 'park', 'clear'].includes(stage)) return { ok: false, error: 'stage is one of: approved, built, fix, park, clear (or leave it out to list).' }
  const p = typeof input.path === 'string' ? input.path.trim() : ''
  if (!p || p.length > 1000) return { ok: false, error: 'Pass path: the sheet (.html) in your repo.' }
  const said = safeLine(input.said, 300), note = safeLine(input.note, 300)
  if (stage === 'approved' && !said) return { ok: false, error: 'An approval needs his own words from the chat in said.' }
  const v = Number(input.version)
  return { ok: true, list: false, body: { path: p, stage, ...(Number.isInteger(v) && v > 0 ? { v } : {}), ...(said ? { said } : {}), ...(note ? { note } : {}) } }
}
export const MOCKUP_SECTION_ID = 'aang-link:mockups'
export const MOCKUP_SECTION = `To show the user a mockup, design sheet or visual page, call show_mockup (${MOCKUP_TOOL_FULL}): it opens in his browser Samara's Mockups trail. ` +
  'Never ask permission to open local mockup pages.'
/**
 * A show_mockup call's input, cut to sane sizes; or why not. Exactly one of path and url; a url must be on this
 * computer. The brain checks everything again (src/Core/src/mockupdrop.ts), with the files in front of it.
 */
export function mockupArgs(input: Record<string, unknown>): { ok: true; body: Record<string, string> } | { ok: false; error: string } {
  const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '')
  const p = str(input.path), u = str(input.url)
  if (!p === !u) return { ok: false, error: 'Pass either path (an .html file in your repo) or url (a page on http://127.0.0.1 or localhost).' }
  if (p.length > 1000) return { ok: false, error: 'That path is too long.' }
  if (u) {
    let ok = false
    try { const x = new URL(u); ok = (x.protocol === 'http:' || x.protocol === 'https:') && ['127.0.0.1', 'localhost', '[::1]'].includes(x.hostname) && !x.username && !x.password && u.length <= 2000 } catch { ok = false }
    if (!ok) return { ok: false, error: 'url must be a page on this computer: http://127.0.0.1:<port>/... or http://localhost:<port>/...' }
  }
  const title = safeLine(input.title, 80), branch = safeLine(input.branch, 40), project = safeLine(input.project, 40)
  const icon = typeof input.icon === 'string' && MOCKUP_ICONS.includes(input.icon) ? input.icon : ''
  return { ok: true, body: { ...(p ? { path: p } : { url: u }), ...(title ? { title } : {}), ...(branch ? { branch } : {}), ...(project ? { project } : {}), ...(icon ? { icon } : {}) } }
}

/** A phase plan from the progress tool's input, cut to sane sizes and masked; null when there is none. */
export function planOf(input: Record<string, unknown>): { label: string; hours: number; status: 'todo' | 'running' | 'done' }[] | null {
  const p = input.plan as { phases?: unknown } | undefined
  if (!p || typeof p !== 'object' || !Array.isArray(p.phases)) return null
  const out = p.phases.slice(0, 30).map((x: Record<string, unknown>) => ({
    label: safeLine(x?.label, 80),
    hours: Math.max(0, Math.min(1000, Number(x?.hours) || 0)),
    status: (x?.status === 'running' || x?.status === 'done' ? x.status : 'todo') as 'todo' | 'running' | 'done',
  })).filter(x => x.label)
  return out.length ? out : null
}

/** Claude Code's PermissionRequest decision, as its own types spell it. */
export type PermissionDecision =
  | { behavior: 'allow'; updatedInput?: Record<string, unknown>; updatedPermissions?: unknown[] }
  | { behavior: 'deny'; message?: string; interrupt?: true }

/**
 * His answer (already MAC-checked) to Claude Code's decision. Anything that does not fit is null, and null means
 * "not answered": Claude's own dialog stays up and decides. Nothing here ever allows on its own.
 */
export function toDecision(kind: 'permission' | 'question' | 'plan', body: unknown, input: Record<string, unknown>, suggestions: unknown[] | undefined): PermissionDecision | null {
  const b = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>
  if (b.decision === 'deny') return { behavior: 'deny', message: 'Joshua said no (answered from Aang).', interrupt: true }
  if (b.decision === 'deny-message' && typeof b.message === 'string' && b.message.trim()) return { behavior: 'deny', message: b.message.slice(0, 2000) }
  if (kind === 'question') {
    const asked = new Set(((input.questions as { question?: unknown }[] | undefined) ?? []).map(q => String(q?.question ?? '')))
    const a = b.answers && typeof b.answers === 'object' ? (b.answers as Record<string, unknown>) : {}
    const answers = Object.fromEntries(Object.entries(a).filter(([q, v]) => asked.has(q) && typeof v === 'string' && v.trim()).map(([q, v]) => [q, String(v).slice(0, 2000)]))
    return Object.keys(answers).length ? { behavior: 'allow', updatedInput: { ...input, answers } } : null
  }
  if (b.decision === 'allow') {
    // A plan approved from Aang leaves plan mode the way Claude's own "yes" does, or nothing could run.
    return kind === 'plan'
      ? { behavior: 'allow', updatedInput: input, updatedPermissions: [{ type: 'setMode', mode: 'default', destination: 'session' }] }
      : { behavior: 'allow' }
  }
  if (b.decision === 'always' && kind === 'permission' && Array.isArray(suggestions) && suggestions.length) return { behavior: 'allow', updatedPermissions: suggestions }
  return null
}

/** A model name the /model command takes, and nothing that could be anything else. */
export const MODEL_OK = /^[A-Za-z0-9.\-_[\]]{1,60}$/

// ------------------------------------------------------------------ C6 (2026-10-22): starting jobs from Aang

/** An effort level the /effort command takes. */
export const EFFORT_OK = /^(low|medium|high|xhigh|max)$/

/** SHA-256 of a text's UTF-8, as hex: the brain's createHash('sha256') over the same bytes. */
export async function sha256Hex(s: string): Promise<string> {
  return hex(await sha256(enc.encode(s)))
}

/** How a folder is compared on both sides of the link (the brain's jobstart.ts normFolder is the same). */
export const normFolder = (p: string): string => String(p ?? '').replace(/\//g, '\\').replace(/\\+$/, '').toLowerCase()

/**
 * Sessions that are never Joshua's jobs (2026-10-22): a bench ran real sessions in src/Core and its question landed
 * in his jobs list. The mod goes inert when the session was started with AANG_LINK_OFF=1 or AANG_TEST=1 (every Aang
 * lane sets the first), or when its folder is Aang's or a test's own (.aang-self, .aang-test), AangApp's test folder
 * (src\Core\test) or a temp folder. AangApp itself stays his. Mirrored in src/Core/src/notjobs.ts.
 */
export function notHisCwd(cwd: string, tmp = ''): boolean {
  const c = String(cwd ?? '').trim()
  if (!c) return false
  if (/[\\/]\.aang-(self|test)([\\/]|$)/i.test(c) || /[\\/]src[\\/]Core[\\/]test([\\/]|$)/i.test(c)) return true
  if (/[\\/]AppData[\\/]Local[\\/]Temp([\\/]|$)/i.test(c) || /^\/tmp(\/|$)/.test(c)) return true
  const t = tmp ? normFolder(tmp) : ''
  return !!t && (normFolder(c) === t || normFolder(c).startsWith(t + '\\'))
}
export const linkOff = (v: string | null | undefined): boolean => /^(1|true|yes|on)$/i.test(String(v ?? '').trim())

/** Only a session this young may take a waiting start (a mod reload fires session.start again in old sessions). */
export const FRESH_MS = 3 * 60_000

export interface StartBody { text: string; hash: string; model?: string; effort?: string }

/**
 * A start the brain handed over, checked: the text, its hash, and that the hash really is the text's. Anything else
 * (a missing field, an odd model name, a text that is not what Joshua approved on the card) is null: nothing is sent.
 */
export async function startOf(body: string): Promise<StartBody | null> {
  let b: Record<string, unknown>
  try { b = JSON.parse(body) ?? {} } catch { return null }
  const text = b.text, hash = b.hash
  if (typeof text !== 'string' || !text.trim() || text.length > 12_000 || typeof hash !== 'string' || !/^[0-9a-f]{64}$/.test(hash)) return null
  if (!sameMac(await sha256Hex(text), hash)) return null
  const out: StartBody = { text, hash }
  if (typeof b.model === 'string' && MODEL_OK.test(b.model)) out.model = b.model
  if (typeof b.effort === 'string' && EFFORT_OK.test(b.effort)) out.effort = b.effort
  return out
}

/** The text of an MCP result's blocks, joined and cut. */
export function mcpText(r: { content?: unknown } | undefined | null, n = 600): string {
  const blocks = Array.isArray(r?.content) ? r!.content as { type?: string; text?: unknown }[] : []
  return blocks.filter(c => c?.type === 'text' && typeof c.text === 'string').map(c => String(c.text)).join('\n').slice(0, n)
}

/** The Claude app's own session tools: the ONLY ones Door 2 ever calls, and only for a signed item. */
export const CCD_SERVER = 'ccd_session_mgmt'
