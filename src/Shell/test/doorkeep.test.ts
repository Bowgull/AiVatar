// Sheet 115 (his picks, 2026-10-31): the connector (claude-door-mcp.mjs) against a pretend Samara door. Each chat sends
// its own token on every step; after Samara restarts (a new door key) the chat's job comes back and the same chat goes on
// with the same page numbers (no new chat, no lock); a job that did not come back is let go; a new chat carries on a
// gone chat's group with carry_on.
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

async function door(answer: (op: string, a: any, s: string) => any) {
  const seen: { op: string; a: any; s: string; key: string }[] = [];
  const srv = http.createServer((q, r) => {
    let b = ''; q.on('data', (c) => { b += c; });
    q.on('end', () => { const { op, a, s } = JSON.parse(b); seen.push({ op, a, s, key: String(q.headers['x-aang-key']) }); r.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(answer(op, a, s))); });
  });
  await new Promise<void>((ok) => srv.listen(0, '127.0.0.1', () => ok()));
  const file = path.join(mkdtempSync(path.join(os.tmpdir(), 'doorkeep-')), 'claude-door.json');
  const port = (srv.address() as any).port;
  const key = (k: string) => writeFileSync(file, JSON.stringify({ port, key: k }));
  key('k1');
  return { seen, file, key, close: () => srv.close() };
}
function connector(file: string) {
  const c = spawn(process.execPath, [path.join(HERE, '..', 'src', 'claude-door-mcp.mjs')], { env: { ...process.env, AANG_DOOR_FILE: file }, stdio: ['pipe', 'pipe', 'ignore'] });
  const wait = new Map<number, (m: any) => void>();
  readline.createInterface({ input: c.stdout! }).on('line', (l) => { try { const m = JSON.parse(l); wait.get(m.id)?.(m); } catch { /* not ours */ } });
  let id = 0;
  const rpc = (method: string, params: any) => new Promise<any>((ok) => { const n = ++id; wait.set(n, ok); c.stdin!.write(JSON.stringify({ jsonrpc: '2.0', id: n, method, params }) + '\n'); });
  const call = async (name: string, args: any) => { const m = await rpc('tools/call', { name, arguments: args }); return (m.result?.content ?? []).map((x: any) => x.text).join('\n'); };
  return { rpc, call, end: () => c.kill() };
}
const PLAN = { task: 'Job hunt', sites: ['jobs.example'], steps: ['Fill the form'] };

test('every step carries the chat\'s own token, the same one all chat long', async () => {
  const d = await door((op) => op === 'plan' ? { ok: true, job: 3, sites: [] } : op === 'open' ? { ok: true, page: 7, title: 'Jobs', url: 'https://jobs.example/' } : { ok: true });
  const c = connector(d.file);
  try {
    await c.rpc('initialize', { capabilities: {} });
    await c.call('browser_plan', PLAN);
    await c.call('browser_open', { url: 'https://jobs.example/', task: 'Job hunt' });
    const toks = new Set(d.seen.map((x) => x.s));
    assert.equal(toks.size, 1);
    assert.match([...toks][0]!, /^[0-9a-f]{32}$/);
  } finally { c.end(); d.close(); }
});

test('after a restart the job comes back: the same chat goes on with the same page numbers, Claude is told', async () => {
  let restarted = false;
  const d = await door((op, a) => {
    if (op === 'plan') return { ok: true, job: 3, sites: [] };
    if (op === 'resume') return a.job === 3 && restarted ? { ok: true, job: 3 } : { ok: false, error: 'that job did not come back' };
    if (op === 'read') return restarted ? { ok: true, title: 'Contoso', url: 'https://jobs.example/apply', text: 'Your application', items: [], news: ['Samara restarted at 12:45 (update 1.29.3). Your 1 tab is back, with the same page numbers: page 7 Contoso. Page 7 (Contoso) had typing, and Samara put it back.'] } : { ok: true, title: 'Contoso', url: 'https://jobs.example/apply', text: 'x', items: [] };
    return { ok: true };
  });
  const c = connector(d.file);
  try {
    await c.rpc('initialize', { capabilities: {} });
    await c.call('browser_plan', PLAN);
    await c.call('browser_read', { page: 7 });
    restarted = true; d.key('k2');                       // Samara restarted: a new door key
    const r = await c.call('browser_read', { page: 7 });
    assert.match(r, /Samara restarted at 12:45/);
    assert.doesNotMatch(r, /pages and plan are gone/);
    const resume = d.seen.find((x) => x.op === 'resume')!;
    assert.equal(resume.key, 'k2'); assert.equal(resume.a.job, 3);
    // Its plan still holds: a new plan is refused as "already running", never "locked".
    assert.equal(d.seen.filter((x) => x.op === 'plan').length, 1);
  } finally { c.end(); d.close(); }
});

test('a job that did not come back is let go, and the next plan starts fresh (never locked)', async () => {
  let jobs = 0;
  const d = await door((op) => op === 'plan' ? { ok: true, job: ++jobs, sites: [] } : op === 'resume' ? { ok: false, error: 'that job did not come back' } : op === 'jobstate' ? { ok: false, error: 'that is not a page this Claude session opened' } : { ok: true, title: 't', url: 'https://jobs.example/', text: '', items: [] });
  const c = connector(d.file);
  try {
    await c.rpc('initialize', { capabilities: {} });
    await c.call('browser_plan', PLAN);
    d.key('k2');
    assert.match(await c.call('browser_read', { page: 7 }), /send browser_plan again/);
    assert.match(await c.call('browser_plan', PLAN), /allowed the plan/);
    assert.equal(jobs, 2);
  } finally { c.end(); d.close(); }
});

test('a new chat carries on a gone chat\'s group with carry_on, then works in it', async () => {
  const d = await door((op, a) => {
    if (op === 'plan' && a.carry_on) return /job hunt/i.test(a.carry_on) ? { ok: true, job: 3, carried: true, name: 'Job hunt', pages: [{ page: 7, title: 'Contoso' }], note: 'You took over "Job hunt" from an earlier chat: 1 tab, numbered 7. The plan he allowed for it still holds.' } : { ok: false, error: 'There is no group called that.' };
    if (op === 'read') return { ok: true, title: 'Contoso', url: 'https://jobs.example/apply', text: '', items: [] };
    return { ok: true };
  });
  const c = connector(d.file);
  try {
    await c.rpc('initialize', { capabilities: {} });
    assert.match(await c.call('browser_plan', { carry_on: 'Mockups' }), /no group/);
    assert.match(await c.call('browser_plan', { carry_on: 'the job hunt' }), /took over "Job hunt"/);
    await c.call('browser_open', { url: 'https://jobs.example/2', task: 'Job hunt' });
    assert.equal(d.seen.find((x) => x.op === 'open')!.a.job, 3, 'the carried job is this chat\'s now');
  } finally { c.end(); d.close(); }
});
