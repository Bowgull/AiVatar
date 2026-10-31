// Sheet 111 (his report, 2026-10-31): after one STOP the Claude chat could never start Samara again ("This session
// already started"), even after done: true. The connector (claude-door-mcp.mjs) is run here against a pretend Samara
// door: a fresh plan works after STOP ALL, after done followed by an open, and what he did in Samara reaches Claude.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import readline from 'node:readline';

const HERE = path.dirname(fileURLToPath(import.meta.url));

/** A pretend Samara: answers each op from `answer`, and keeps every op it was sent. */
async function door(answer: (op: string, a: any) => any) {
  const seen: { op: string; a: any }[] = [];
  const srv = http.createServer((q, r) => {
    let b = ''; q.on('data', (c) => { b += c; });
    q.on('end', () => { const { op, a } = JSON.parse(b); seen.push({ op, a }); r.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(answer(op, a))); });
  });
  await new Promise<void>((ok) => srv.listen(0, '127.0.0.1', () => ok()));
  const dir = mkdtempSync(path.join(os.tmpdir(), 'doorplan-'));
  const file = path.join(dir, 'claude-door.json');
  writeFileSync(file, JSON.stringify({ port: (srv.address() as any).port, key: 'k' }));
  return { seen, file, close: () => srv.close() };
}

/** The connector, spoken to over stdin and stdout like Claude Code does. */
function connector(file: string) {
  const c = spawn(process.execPath, [path.join(HERE, '..', 'src', 'claude-door-mcp.mjs')], { env: { ...process.env, AANG_DOOR_FILE: file }, stdio: ['pipe', 'pipe', 'ignore'] });
  const wait = new Map<number, (m: any) => void>();
  readline.createInterface({ input: c.stdout! }).on('line', (l) => { try { const m = JSON.parse(l); wait.get(m.id)?.(m); } catch { /* not ours */ } });
  let id = 0;
  const rpc = (method: string, params: any) => new Promise<any>((ok) => { const n = ++id; wait.set(n, ok); c.stdin!.write(JSON.stringify({ jsonrpc: '2.0', id: n, method, params }) + '\n'); });
  const call = async (name: string, args: any) => { const m = await rpc('tools/call', { name, arguments: args }); return (m.result?.content ?? []).map((x: any) => x.text).join('\n'); };
  return { rpc, call, end: () => c.kill() };
}

const PLAN = { task: 'Job scan', sites: ['jobs.example'], steps: ['Look'] };

test('a fresh plan works after STOP ALL', async () => {
  let jobs = 0, stopped = new Set<number>();
  const d = await door((op, a) => {
    if (op === 'plan') return { ok: true, job: ++jobs, sites: ['jobs.example'] };
    if (op === 'open') { if (stopped.size) return { ok: false, error: 'Joshua stopped the whole job (STOP ALL), so nothing more is done in it. To start again, send a new plan with browser_plan.' }; return { ok: true, page: 1, title: 'Jobs', url: 'https://jobs.example/' }; }
    if (op === 'jobstate') return { ok: true, live: !stopped.has(a.job), planned: true, pages: 1 };
    return { ok: true };
  });
  const c = connector(d.file);
  try {
    await c.rpc('initialize', { capabilities: {} });
    assert.match(await c.call('browser_plan', PLAN), /allowed the plan/);
    assert.match(await c.call('browser_open', { url: 'https://jobs.example/', task: 'Job scan' }), /Opened page 1/);
    stopped.add(1);
    assert.match(await c.call('browser_open', { url: 'https://jobs.example/2', task: 'Job scan' }), /STOP ALL/);
    const again = await c.call('browser_plan', PLAN);
    assert.match(again, /allowed the plan/, again);
    assert.equal(d.seen.filter((s) => s.op === 'plan').length, 2);
  } finally { c.end(); d.close(); }
});

test('a plan sent while the job is stopped (no call in between) also works', async () => {
  let jobs = 0;
  const d = await door((op, a) => {
    if (op === 'plan') return { ok: true, job: ++jobs, sites: [] };
    if (op === 'jobstate') return { ok: true, live: a.job !== 1, planned: true, pages: 0 };
    return { ok: true };
  });
  const c = connector(d.file);
  try {
    await c.rpc('initialize', { capabilities: {} });
    await c.call('browser_plan', PLAN);
    assert.match(await c.call('browser_plan', PLAN), /allowed the plan/);
  } finally { c.end(); d.close(); }
});

test('done, then a page opened without a plan, then a plan: the plan wins', async () => {
  let jobs = 0; const planned = new Set<number>();
  const d = await door((op, a) => {
    if (op === 'plan') { const j = ++jobs; planned.add(j); return { ok: true, job: j, sites: [] }; }
    if (op === 'start') return { ok: true, job: ++jobs };
    if (op === 'open') return { ok: true, page: 3, title: 'x', url: 'https://jobs.example/' };
    if (op === 'jobstate') return { ok: true, live: true, planned: planned.has(a.job), pages: 1 };
    return { ok: true };
  });
  const c = connector(d.file);
  try {
    await c.rpc('initialize', { capabilities: {} });
    await c.call('browser_plan', PLAN);
    assert.match(await c.call('browser_plan', { done: true }), /Marked done/);
    await c.call('browser_open', { url: 'https://jobs.example/', task: 'Job scan' });
    assert.match(await c.call('browser_plan', PLAN), /allowed the plan/);
    assert.ok(d.seen.some((s) => s.op === 'finish' && s.a.job === 2), 'the plan-less job was finished');
  } finally { c.end(); d.close(); }
});

test('a plan still running is not replaced', async () => {
  const d = await door((op) => op === 'plan' ? { ok: true, job: 1, sites: [] } : op === 'jobstate' ? { ok: true, live: true, planned: true, pages: 2 } : { ok: true });
  const c = connector(d.file);
  try {
    await c.rpc('initialize', { capabilities: {} });
    await c.call('browser_plan', PLAN);
    assert.match(await c.call('browser_plan', PLAN), /already has a plan running/);
  } finally { c.end(); d.close(); }
});

test('what he did in Samara reaches Claude with its next step', async () => {
  const d = await door((op) => op === 'plan' ? { ok: true, job: 1, sites: [] }
    : op === 'close' ? { ok: true, news: ['Joshua took over page 2: it is his until he hands it back.'] } : { ok: true });
  const c = connector(d.file);
  try {
    await c.rpc('initialize', { capabilities: {} });
    await c.call('browser_plan', PLAN);
    // The news rides on the answer of the step that brought it back, at the top.
    const r = await c.call('browser_close', { page: 4 });
    assert.match(r, /^Joshua took over page 2/, r);
  } finally { c.end(); d.close(); }
});
