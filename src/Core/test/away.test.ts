import './_env.ts';
// "Away mode": a Claude Code job's own updates reach Discord with a picture when he has already trusted that, and
// replying to one of those messages continues that job with his words. Joshua, 2026-09-21: "let me know when a claude
// session... is done in discord and also gives me whatever the prompt was and i can reply back". No real link is ever
// opened here (openInClaude is never reached): Core.startClaude is stubbed for the one test that needs it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { WebSocket } from 'ws';
import { Core } from '../src/core.ts';
import { DiscordAdapter } from '../src/discord.ts';
import type { Button, ButtonPress, CoreLink, Gateway, Incoming, OutMsg } from '../src/discord.ts';

const tmp = () => mkdtempSync(path.join(os.tmpdir(), 'aang-away-'));
const wait = (ms: number) => new Promise(r => setTimeout(r, ms));
const OWNER = 'owner1';

// ------------------------------------------------------------------ Core: announce() carries the job and the picture

async function withCore(port: number, fn: (core: any, desk: { c: WebSocket; inbox: any[] }) => Promise<void>) {
  const core: any = new Core({ port, dataDir: tmp(), stateDir: tmp(), warm: false, consolidate: false });
  await core.start();
  const c = new WebSocket(`ws://127.0.0.1:${port}/body`);
  const inbox: any[] = [];
  c.on('message', d => inbox.push(JSON.parse(String(d))));
  await new Promise<void>(r => c.once('open', () => r()));
  c.send(JSON.stringify({ t: 'hello', v: 1, client: 'discord' }));
  await wait(60);
  try { await fn(core, { c, inbox }); } finally { c.close(); await core.stop(); }
}

test('a job update carries its folder and, once pictures are trusted, a picture too', async () => {
  await withCore(47966, async (core, desk) => {
    core.trust.allow('send to Discord', 'sent a file');
    core.announce('Need input in Claude on the browsing job: which one?', { asked: true, jobCwd: 'C:\\jobs\\a' });
    await wait(80);
    const m = desk.inbox.find(x => x.t === 'bubble' && /Need input/.test(x.text));
    assert.ok(m);
    assert.equal(m.jobCwd, 'C:\\jobs\\a');
    // no desktop connected in this test, so no picture is fetched even though the kind is trusted - it never hangs
    assert.equal(m.image, undefined);
  });
});

test('genuinely blocking news is marked so; ordinary news is not', async () => {
  await withCore(47967, async (core, desk) => {
    core.announce('Need input in Claude on the browsing job: which one?', { asked: true });
    core.announce('The job hunt is ready in Claude with the request typed in. Press Enter there to start it.', { asked: true });
    core.announce('Job hunt done. Two applied. Details in Claude.', { asked: true });
    core.announce("You've used 45% of your week.");
    await wait(80);
    const blocking = desk.inbox.filter(m => m.t === 'bubble' && m.blocking === true).map(m => m.text);
    assert.equal(blocking.length, 2);
    assert.match(blocking[0], /^Need input/);
    assert.match(blocking[1], /ready in Claude/);
    assert.ok(!desk.inbox.some(m => m.t === 'bubble' && /Job hunt done/.test(m.text) && m.blocking));
    assert.ok(!desk.inbox.some(m => m.t === 'bubble' && /used 45%/.test(m.text) && m.blocking));
  });
});

test('a reply naming a job neither Core nor Discord know about does nothing and does not crash', async () => {
  await withCore(47968, async (core, desk) => {
    desk.c.send(JSON.stringify({ t: 'claude.reply', cwd: 'C:\\nowhere', text: 'keep going' }));
    await wait(150);
    assert.ok(!desk.inbox.some(x => x.t === 'bubble'), 'nothing was sent back for a job that is not tracked');
  });
});

test('claude.reply finds the tracked job by its folder and continues it in the SAME kind, without opening a real link', async () => {
  const stateDir = tmp(); const jobDir = tmp();
  writeFileSync(path.join(stateDir, 'launched.json'), JSON.stringify([
    { name: 'browsing job', cwd: jobDir, kind: 'browse', state: 'needs you', sessionId: 's1', startedAt: Date.now() },
  ]));
  const core: any = new Core({ port: 47970, dataDir: tmp(), stateDir, warm: false, consolidate: false });
  const calls: any[] = [];
  core.startClaude = async (...args: any[]) => { calls.push(args); return 'Opened a new Claude Code session in the Claude app for the browsing job.'; };
  await core.start();
  const c = new WebSocket('ws://127.0.0.1:47970/body');
  const inbox: any[] = [];
  c.on('message', d => inbox.push(JSON.parse(String(d))));
  await new Promise<void>(r => c.once('open', () => r()));
  c.send(JSON.stringify({ t: 'hello', v: 1, client: 'discord' }));
  await wait(60);
  try {
    c.send(JSON.stringify({ t: 'claude.reply', cwd: jobDir, text: 'yes, click the blue one' }));
    await wait(150);
    assert.deepEqual(calls, [['yes, click the blue one', jobDir, undefined, 'browse']]);
    assert.ok(inbox.some(m => m.t === 'bubble' && /Opened a new Claude Code session/.test(m.text)));
  } finally { c.close(); await core.stop(); }
});

// ------------------------------------------------------------------ Discord: the message is remembered, a reply is told to the job

class FakeGateway implements Gateway {
  sent: { channelId: string; msg: OutMsg }[] = [];
  private msgCb: (m: Incoming) => void = () => {};
  private btnCb: (b: ButtonPress) => void = () => {};
  onMessage(cb: (m: Incoming) => void) { this.msgCb = cb; }
  onButton(cb: (b: ButtonPress) => void) { this.btnCb = cb; }
  async ensureLayout() { return { aang: 'ch-aang', capture: 'ch-capture', 'job-inbox': 'ch-job-inbox', 'job-digest': 'ch-job-digest', applied: 'ch-applied', 'needs-you': 'ch-needs-you', drafts: 'ch-drafts', lists: 'ch-lists', recipes: 'ch-recipes', guides: 'ch-guides', log: 'ch-log' }; }
  async send(channelId: string, msg: OutMsg) { const id = 'm' + (this.sent.length + 1); this.sent.push({ channelId, msg }); return id; }
  async edit() { /* not used here */ }
  async pin() { /* not used here */ }
  async createPost() { return 'thread1'; }
  async download() { return Buffer.from(''); }
  async typing() { /* not used here */ }
  async fetchSince() { return []; }
  async permissions() { return ['ViewChannel', 'SendMessages', 'ReadMessageHistory']; }
  say(channel: string, authorId: string, content: string, replyTo?: string) { this.msgCb({ id: 'u' + Math.random(), channelId: 'ch-' + channel, channelName: channel, authorId, isBot: false, content, createdAt: Date.now(), ...(replyTo ? { replyTo } : {}) }); }
  to(channel: string) { return this.sent.filter(s => s.channelId === 'ch-' + channel).map(s => s.msg); }
}
class FakeCore implements CoreLink {
  submits: any[] = [];
  submit(id: string, text: string) { this.submits.push({ id, text }); }
  permission() { /* not used here */ }
  stop() { /* not used here */ }
  status() { /* not used here */ }
  actions() { /* not used here */ }
  trust() { /* not used here */ }
  revoke() { /* not used here */ }
  hush() { /* not used here */ }
  mailAct() { /* not used here */ }
  brief() { /* not used here */ }
  claudeReplies: { cwd: string; text: string }[] = [];
  claudeReply(cwd: string, text: string) { this.claudeReplies.push({ cwd, text }); }
  private cb: (m: any) => void = () => {};
  onEvent(cb: (m: any) => void) { this.cb = cb; }
  emit(m: any) { this.cb(m); }
}
const tick = () => new Promise(r => setTimeout(r, 15));

async function make() {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'aang-away-dc-'));
  mkdirSync(dir, { recursive: true });
  const gw = new FakeGateway(), core = new FakeCore();
  const a = new DiscordAdapter(gw, core, dir, { now: () => new Date(2026, 8, 21, 14, 0), typingMs: 1_000_000 });
  writeFileSync(path.join(dir, 'discord.json'), JSON.stringify({ ownerId: OWNER, channels: {}, lastSeen: {} }));
  await a.start();
  return { a, gw, core };
}

test('a job update becomes one message (with a picture when there is one), remembered by its folder', async () => {
  const { gw, core } = await make();
  core.emit({ t: 'bubble', text: 'Need input in Claude on the browsing job: which one?', proactive: true, asked: true, jobCwd: 'C:\\jobs\\a' });
  await tick();
  const posted = gw.to('needs-you').at(-1)!;
  assert.match(posted.content!, /Need input/);
  assert.equal(posted.files, undefined);

  core.emit({ t: 'bubble', text: 'The self job is done. Branch aang/timer.', proactive: true, asked: true, jobCwd: 'C:\\jobs\\b', image: { data: Buffer.from('x').toString('base64'), mimeType: 'image/jpeg' } });
  await tick();
  const withPic = gw.to('aang').at(-1)!;
  assert.equal(withPic.files?.length, 1);
  assert.equal(withPic.files![0]!.name, 'screen.jpg');
});

test('replying to a job update tells THAT job, not ordinary chat, and only he can do it', async () => {
  const { gw, core } = await make();
  core.emit({ t: 'bubble', text: 'Need input in Claude on the browsing job: which one?', proactive: true, asked: true, jobCwd: 'C:\\jobs\\a' });
  await tick();
  assert.ok(gw.to('needs-you').at(-1));
  const id = 'm' + gw.sent.length;         // the id FakeGateway.send returned for that post

  gw.say('needs-you', OWNER, 'the blue one', id);
  await tick();
  assert.deepEqual(core.claudeReplies, [{ cwd: 'C:\\jobs\\a', text: 'the blue one' }]);
  assert.equal(core.submits.length, 0, 'it never reaches ordinary chat');
  assert.match(gw.to('needs-you').at(-1)!.content!, /Telling Claude/);

  gw.say('needs-you', 'stranger', 'the blue one', id);
  await tick();
  assert.equal(core.claudeReplies.length, 1, 'a stranger cannot answer for him');
});

test('a reply to any other message is ordinary chat, as before', async () => {
  const { gw, core } = await make();
  gw.say('aang', OWNER, 'what is the weather', 'some-other-message-id');
  await tick();
  assert.equal(core.submits.length, 1);
  assert.equal(core.claudeReplies.length, 0);
});
