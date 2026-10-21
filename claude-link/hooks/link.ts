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
const LIST_TOOLS = new Set(['TodoWrite', 'TaskCreate', 'TaskUpdate', 'TaskList', 'TaskGet'])

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

/**
 * Claude's to-do list as it changes. Two tool families keep one: TodoWrite (the whole list each time) and the
 * Task tools (TaskCreate / TaskUpdate / TaskList, one task at a time). Returns the full list after this call, or
 * null when the call did not change it.
 */
export function nextTasks(tasks: Map<string, Task>, tool: string, input: Record<string, unknown>, result: unknown): Task[] | null {
  const r = (result && typeof result === 'object' ? result : {}) as Record<string, unknown>
  if (tool === 'TodoWrite') {
    if (!Array.isArray(input.todos)) return null
    tasks.clear()
    input.todos.forEach((t: Record<string, unknown>, n: number) =>
      tasks.set(String(n), { text: str(t?.content, 300), status: status(t?.status), ...(t?.activeForm ? { active: str(t.activeForm, 300) } : {}) }))
  } else if (tool === 'TaskCreate') {
    const task = r.task as { id?: unknown; subject?: unknown } | undefined
    if (!task?.id) return null
    tasks.set(String(task.id), { text: str(task.subject ?? input.subject, 300), status: 'pending', ...(input.activeForm ? { active: str(input.activeForm, 300) } : {}) })
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
  } else if (tool === 'TaskList') {
    if (!Array.isArray(r.tasks)) return null
    const old = new Map(tasks)
    tasks.clear()
    for (const t of r.tasks as Record<string, unknown>[]) {
      const id = String(t?.id ?? '')
      if (!id) continue
      const was = old.get(id)
      tasks.set(id, { text: str(t.subject, 300), status: status(t.status), ...(was?.active ? { active: was.active } : {}) })
    }
  } else return null
  return [...tasks.values()].filter(t => t.text)
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
