import './_env.ts';
// THE LOCK (step S1, decision 47): a web page cannot reach Aang's brain.
//
// Browsers do not apply same-origin rules to WebSockets. They connect to anything and only send an
// Origin header, leaving the check to the server (RFC 6455 section 10.2). Without this, any page open
// in any browser on this PC could send messages as Joshua, read his history, or send a waiting email
// draft. Phase 6 puts a full browser on this same machine, which is why it lands before the shell.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { WebSocket } from 'ws';
import { Core } from '../src/core.ts';

const tmp = () => mkdtempSync(path.join(os.tmpdir(), 'aang-lock-'));

async function withCore(port: number, fn: () => Promise<void>) {
  const core: any = new Core({ port, dataDir: tmp(), stateDir: tmp(), warm: false });
  await core.start();
  try { await fn(); } finally { await core.stop(); }
}

/** Opens a socket the way a browser page would, and reports whether it got in. */
function connect(port: number, origin?: string): Promise<boolean> {
  return new Promise(resolve => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}/body`, origin ? { origin } : {});
    const done = (ok: boolean) => { try { ws.close(); } catch { /* already gone */ } resolve(ok); };
    ws.once('open', () => done(true));
    ws.once('error', () => done(false));
    ws.once('unexpected-response', () => done(false));
  });
}

test('S1: a web page is refused, whatever site it claims to be', async () => {
  await withCore(48320, async () => {
    assert.equal(await connect(48320, 'https://evil.example'), false);
    assert.equal(await connect(48320, 'http://localhost:3000'), false);
    // A rebound page carries the attacker's own origin, so this covers DNS rebinding too.
    assert.equal(await connect(48320, 'http://127.0.0.1:48320'), false);
    assert.equal(await connect(48320, 'null'), false);
  });
});

test('S1: Aang\'s own window still connects, because it sends no origin', async () => {
  await withCore(48322, async () => {
    assert.equal(await connect(48322), true);
  });
});

test('S1: a refused page cannot do anything at all', async () => {
  await withCore(48324, async () => {
    const got: unknown[] = [];
    const ws = new WebSocket(`ws://127.0.0.1:48324/body`, { origin: 'https://evil.example' });
    ws.on('message', d => got.push(String(d)));
    ws.on('error', () => { /* the 403 is the point of this test */ });
    // The Body sends hello then asks for the Panel, which carries his facts, permissions and drafts.
    ws.on('open', () => {
      ws.send(JSON.stringify({ t: 'hello', v: 1, client: 'desktop' }));
      ws.send(JSON.stringify({ t: 'panel' }));
    });
    await new Promise(r => setTimeout(r, 300));
    try { ws.close(); } catch { /* already gone */ }
    assert.equal(got.length, 0, 'a refused page must never be answered');
  });
});

// ---------------------------------------------------------------- the hook server, same lock

test('S1: a web page cannot post fake Claude Code events either', async () => {
  await withCore(48326, async () => {
    const post = async (headers: Record<string, string>) => {
      const r = await fetch('http://127.0.0.1:48327/hook', {
        method: 'POST', headers, body: JSON.stringify({ hook_event_name: 'Stop', session_id: 'x' }),
      });
      return r.status;
    };
    // A page can POST across origins to localhost with no preflight when the body is plain text,
    // so being on loopback is not proof this came from Claude Code.
    assert.equal(await post({ 'Content-Type': 'text/plain', origin: 'https://evil.example' }), 403);
    // curl, which is what the hooks actually use, sends no origin.
    assert.equal(await post({ 'Content-Type': 'application/json' }), 204);
  });
});
