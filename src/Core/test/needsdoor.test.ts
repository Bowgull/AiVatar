// The needs-you door (2026-11-15): a Claude session's short note, posted in #needs-you by Aang's own bot.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { NeedsLimit, needsNote, PER_SESSION, PER_HOUR } from '../src/needsdoor.ts';
import { JobTracker, LinkDoor, linkMac } from '../src/claudelink.ts';

test('needs-you: words only, one line, no pings, and where it came from', () => {
  const n = needsNote('Done:\n the title screen is   built. @everyone <@123> look', '/Users/x/projects/omashu');
  assert.equal(n.ok, true);
  if (!n.ok) return;
  assert.ok(!n.content.includes('@everyone') && !n.content.includes('<@123>'));
  assert.match(n.content, /^Done: the title screen is built\./);
  assert.match(n.content, /from a Claude session in omashu$/);
  assert.equal(needsNote('', '/x').ok, false);
  assert.equal(needsNote('x'.repeat(401), '/x').ok, false);
});

test('needs-you: 3 notes per session and 10 in all per hour, then it says no', () => {
  const l = new NeedsLimit(), t0 = 1_000_000;
  for (let i = 0; i < PER_SESSION; i++) assert.equal(l.take('a', t0), null);
  assert.match(l.take('a', t0)!, /limit/);
  for (let i = 0; i < PER_HOUR - PER_SESSION; i++) assert.equal(l.take('s' + i, t0), null);
  assert.match(l.take('fresh', t0)!, /limit/);
  assert.equal(l.take('a', t0 + 61 * 60_000), null, 'an hour later it may go again');
});

test('needs-you: /link/needsyou answers only a signed request, with the session it came from', async () => {
  const KEY = 'k'.repeat(43);
  const tracker = new JobTracker();
  const door = new LinkDoor(KEY, tracker);
  const asked: { session: string; cwd: string; text: unknown }[] = [];
  door.onNeedsYou = async (ask) => { asked.push(ask); return { ok: true, message: 'Sent to #needs-you.' }; };
  const way = '/Users/x/projects/omashu';
  tracker.event({ session: 's1', type: 'start', cwd: way }, Date.now());
  const srv = http.createServer((q, r) => door.handle(q, r));
  await new Promise<void>((r) => srv.listen(0, '127.0.0.1', () => r()));
  const port = (srv.address() as { port: number }).port;
  const post = (body: string, sign = true) => new Promise<{ code: number; text: string }>((done, fail) => {
    const ts = String(Date.now());
    const headers: Record<string, string> = { 'content-type': 'application/json', 'x-aang-link-ts': ts, 'x-aang-link-sig': sign ? linkMac(KEY, 'req', ts, 'POST', '/link/needsyou', body) : '0'.repeat(64) };
    const rq = http.request({ host: '127.0.0.1', port, path: '/link/needsyou', method: 'POST', headers, agent: false }, (res) => { let t = ''; res.on('data', (d) => { t += d; }); res.on('end', () => done({ code: res.statusCode ?? 0, text: t })); });
    rq.on('error', fail); rq.end(body);
  });
  try {
    const body = JSON.stringify({ session: 's1', cwd: '/elsewhere', text: 'Done.' });
    assert.equal((await post(body, false)).code, 403, 'unsigned');
    assert.equal(asked.length, 0);
    const r = await post(body);
    assert.equal(JSON.parse(r.text).ok, true, r.text);
    assert.deepEqual(asked[0], { session: 's1', cwd: way, text: 'Done.' });
  } finally { tracker.close(); await new Promise((r) => srv.close(() => r(null))); }
});
