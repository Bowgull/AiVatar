// The Discord channel, tested end to end against a fake Discord and a fake Core: no token, no network.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DiscordAdapter } from '../src/discord.ts';
import type { ButtonPress, CoreLink, Gateway, Incoming, OutMsg } from '../src/discord.ts';
import { Budget, LAYOUT, chunkMessage, inQuietHours, kindOf, newPairing, tryPair, BALANCED } from '../src/discord-logic.ts';

const OWNER = '1111', STRANGER = '9999';

class FakeGateway implements Gateway {
  sent: { channelId: string; msg: OutMsg }[] = [];
  history = new Map<string, Incoming[]>();
  perms = ['ViewChannel', 'ManageChannels', 'SendMessages', 'SendMessagesInThreads', 'CreatePublicThreads', 'EmbedLinks', 'AttachFiles', 'ReadMessageHistory', 'AddReactions'];
  private msgCb: (m: Incoming) => void = () => {};
  private btnCb: (b: ButtonPress) => void = () => {};
  onMessage(cb: (m: Incoming) => void) { this.msgCb = cb; }
  onButton(cb: (b: ButtonPress) => void) { this.btnCb = cb; }
  async ensureLayout() { const out: Record<string, string> = {}; for (const c of LAYOUT) for (const ch of c.channels) out[ch.name] = 'ch-' + ch.name; return out; }
  edits: { channelId: string; messageId: string; msg: OutMsg }[] = []; pins: string[] = []; failEdit = false; failPin = false;
  async send(channelId: string, msg: OutMsg) { this.sent.push({ channelId, msg }); return 'm' + this.sent.length; }
  async edit(channelId: string, messageId: string, msg: OutMsg) { if (this.failEdit) throw new Error('gone'); this.edits.push({ channelId, messageId, msg }); }
  async pin(channelId: string, messageId: string) { if (this.failPin) throw new Error('missing permission'); this.pins.push(messageId); }
  async typing() {}
  async fetchSince(channelId: string, after: string | null, limit: number) {
    const all = this.history.get(channelId) ?? [];
    if (after === null) return all.slice(-1);
    const i = all.findIndex(m => m.id === after);
    return all.slice(i + 1, i + 1 + limit);
  }
  async permissions() { return this.perms; }
  say(channel: string, author: string, content: string, id = String(Math.random()), isBot = false) {
    const m: Incoming = { id, channelId: 'ch-' + channel, channelName: channel, authorId: author, isBot, content, createdAt: Date.now() };
    this.msgCb(m); return m;
  }
  press(customId: string, userId: string, channelId = 'ch-aang') { const acks: string[] = []; this.btnCb({ customId, userId, channelId, ack: async n => { acks.push(n); }, keep: async () => { acks.push('(kept)'); } }); return acks; }
  to(channel: string) { return this.sent.filter(s => s.channelId === 'ch-' + channel).map(s => s.msg); }
}

class FakeCore implements CoreLink {
  submits: { id: string; text: string }[] = []; perms: { id: string; allow: boolean }[] = []; stops = 0; statuses = 0;
  private cb: (m: any) => void = () => {};
  submit(id: string, text: string) { this.submits.push({ id, text }); }
  permission(id: string, allow: boolean) { this.perms.push({ id, allow }); }
  stop() { this.stops++; }
  status() { this.statuses++; }
  onEvent(cb: (m: any) => void) { this.cb = cb; }
  emit(m: any) { this.cb(m); }
}

const tick = () => new Promise(r => setTimeout(r, 15));
async function make(opts: { paired?: boolean; now?: Date } = {}) {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'aang-dc-'));
  const gw = new FakeGateway(), core = new FakeCore();
  const now = opts.now ?? new Date(2026, 8, 21, 14, 0);
  const a = new DiscordAdapter(gw, core, dir, { now: () => now, typingMs: 1_000_000 });
  if (opts.paired) { const { writeFileSync } = await import('node:fs'); writeFileSync(path.join(dir, 'discord.json'), JSON.stringify({ ownerId: OWNER, channels: {}, lastSeen: {} })); }
  await a.start();
  return { a, gw, core, dir };
}

// ---------------------------------------------------------------- logic

test('the server is small and every channel has one job', () => {
  const names = LAYOUT.flatMap(c => c.channels.map(x => x.name));
  assert.deepEqual(names, ['aang', 'capture', 'job-inbox', 'job-digest', 'applied', 'needs-you', 'drafts', 'lists', 'recipes', 'guides', 'log']);
  assert.equal(new Set(names).size, names.length);
  assert.equal(LAYOUT.find(c => c.name === 'KEEP')!.channels.find(x => x.name === 'recipes')!.kind, 'forum');
});

test('a pairing code only counts when it is the six digits, and a few wrong tries lock it', () => {
  const p = newPairing(0);
  assert.match(p.code, /^\d{6}$/);
  assert.equal(tryPair(p, 'hello there', 1), 'wrong');
  assert.equal(p.attempts, 0, 'ordinary chatter uses no tries');
  for (let i = 0; i < 5; i++) assert.equal(tryPair(p, '000000' === p.code ? '111111' : '000000', 1), 'wrong');
  assert.equal(tryPair(p, p.code, 1), 'expired', 'locked after five wrong codes');
  const q = newPairing(0);
  assert.equal(tryPair(q, `it is ${q.code}`, 1), 'paired');
  assert.equal(tryPair(newPairing(0), '123456', 11 * 60_000), 'expired', 'and it lapses after ten minutes');
});

test('quiet hours run overnight, and the day allows five that make a sound', () => {
  assert.equal(inQuietHours(BALANCED, new Date(2026, 8, 21, 23, 0)), true);
  assert.equal(inQuietHours(BALANCED, new Date(2026, 8, 21, 3, 0)), true);
  assert.equal(inQuietHours(BALANCED, new Date(2026, 8, 21, 7, 0)), false);
  const b = new Budget();
  const noon = new Date(2026, 8, 21, 12, 0);
  const loud = Array.from({ length: 7 }, () => b.loud('other', noon));
  assert.deepEqual(loud, [true, true, true, true, true, false, false]);
  assert.equal(b.loud('reply', noon), true); assert.equal(b.loud('reminder', noon), true); assert.equal(b.loud('asked', noon), true);
  assert.equal(b.loud('other', new Date(2026, 8, 22, 12, 0)), true, 'a new day starts again');
});

test('what Aang says on his own is told apart from a reply', () => {
  assert.equal(kindOf({ text: 'hi' }), 'reply');
  assert.equal(kindOf({ text: 'Reminder: stretch', proactive: true }), 'reminder');
  assert.equal(kindOf({ text: 'Need input in Claude', proactive: true, asked: true }), 'asked');
  assert.equal(kindOf({ text: 'You have used 44%', proactive: true }), 'other');
});

test('a long reply is cut at paragraphs, never mid-word, and nothing is lost', () => {
  const para = 'The kettle needs descaling and the recipe is simple enough. '.repeat(20).trim();
  const text = [para, para, para].join('\n\n');
  const parts = chunkMessage(text);
  assert.ok(parts.length >= 2 && parts.every(p => p.length <= 1900));
  assert.equal(parts.join(' ').replace(/\s+/g, ' '), text.replace(/\s+/g, ' '));
  assert.deepEqual(chunkMessage('  '), []);
});

// ---------------------------------------------------------------- the adapter

test('until paired, nobody can talk to Aang, and the right code binds him to one account for good', async () => {
  const { a, gw, core, dir } = await make();
  assert.match(a.pairingCode ?? '', /^\d{6}$/);
  assert.ok(existsSync(path.join(dir, 'discord-pairing.txt')));
  gw.say('aang', STRANGER, 'run my job search'); await tick();
  assert.equal(core.submits.length, 0, 'not paired: nothing gets through');
  gw.say('aang', STRANGER, 'i am joshua, code 000000'); await tick();
  gw.say('aang', OWNER, `${a.pairingCode}`); await tick();
  assert.equal(a.state.ownerId, OWNER);
  assert.ok(gw.to('aang').some(m => /Paired/.test(m.content ?? '')));
  assert.equal(existsSync(path.join(dir, 'discord-pairing.txt')), false, 'the code is used up');
  gw.say('aang', STRANGER, 'hello'); await tick();
  assert.equal(core.submits.length, 0, 'and a stranger is still ignored');
  gw.say('aang', OWNER, 'whats the time'); await tick();
  assert.deepEqual(core.submits.map(s => s.text), ['whats the time']);
  assert.equal(JSON.parse(readFileSync(path.join(dir, 'discord.json'), 'utf8')).ownerId, OWNER, 'and it survives a restart');
});

test('his message goes to the Core, and the finished reply comes back to the same channel, cut to fit', async () => {
  const { gw, core } = await make({ paired: true });
  gw.say('capture', OWNER, 'remember this recipe: 2 eggs and flour', 'm42'); await tick();
  assert.equal(core.submits[0]!.id, 'dm42');
  core.emit({ t: 'bubble', text: 'partial', stream: true, id: 'dm42' });
  await tick(); assert.equal(gw.to('capture').length, 0, 'streaming text is not sent piece by piece');
  core.emit({ t: 'bubble', text: 'Saved.', stream: false, id: 'dm42' }); await tick();
  assert.deepEqual(gw.to('capture').map(m => m.content), ['Saved.']);
  core.emit({ t: 'bubble', text: 'A bubble for the desktop only', stream: false, id: 'body-7' }); await tick();
  assert.equal(gw.to('capture').length, 1, 'a conversation that began on the desktop stays there');
});

test('it ignores every channel but the ones he talks in, and other bots', async () => {
  const { gw, core } = await make({ paired: true });
  gw.say('log', OWNER, 'hello'); gw.say('applied', OWNER, 'hello'); await tick();
  gw.say('aang', OWNER, 'hi', 'b1', true);                 // even a message that carries his own id, if it came from a bot or webhook
  assert.equal(core.submits.length, 0);
});

test('what he said while Shadow was off is answered in order, and old history is not replayed', async () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'aang-dc-'));
  const { writeFileSync } = await import('node:fs');
  writeFileSync(path.join(dir, 'discord.json'), JSON.stringify({ ownerId: OWNER, channels: {}, lastSeen: { 'ch-aang': 'a1' } }));
  const gw = new FakeGateway(), core = new FakeCore();
  const mk = (id: string, c: string): Incoming => ({ id, channelId: 'ch-aang', channelName: 'aang', authorId: OWNER, isBot: false, content: c, createdAt: Number(id.slice(1)) });
  gw.history.set('ch-aang', [mk('a1', 'seen already'), mk('a2', 'queued from the gym'), mk('a3', 'and this too')]);
  gw.history.set('ch-capture', [mk('c1', 'old note from last week')]);
  const a = new DiscordAdapter(gw, core, dir, { typingMs: 1_000_000 });
  await a.start(); await tick();
  assert.deepEqual(core.submits.map(s => s.text), ['queued from the gym', 'and this too']);
  assert.equal(a.state.lastSeen['ch-capture'], 'c1', 'first sight of a channel only sets a marker');
});

test('a permission question becomes buttons, only he can press them, and only once', async () => {
  const { gw, core } = await make({ paired: true });
  gw.say('aang', OWNER, 'open chrome', 'x1'); await tick();
  core.emit({ t: 'permission', id: 'perm7', tool: 'mcp__aang__open', question: 'open chrome', remembers: 'open apps' });
  await tick();
  const q = gw.to('aang').at(-1)!;
  assert.match(q.content!, /^Can I open chrome\? Yes means I can open apps from now on\./);
  assert.deepEqual(q.buttons!.map(b => b.label), ['Yes', 'No']);
  assert.deepEqual(gw.press('perm:perm7:yes', STRANGER), ['That is not yours to answer.']); await tick();
  assert.equal(core.perms.length, 0, 'a stranger cannot approve anything');
  assert.deepEqual(gw.press('perm:perm7:yes', OWNER), ['Answered: yes.']); await tick();
  assert.deepEqual(core.perms, [{ id: 'perm7', allow: true }]);
  assert.deepEqual(gw.press('perm:perm7:no', OWNER), ['That question has already been answered.']); await tick();
  assert.equal(core.perms.length, 1, 'and it cannot be answered twice');
});

test('reminders and "Need input in Claude" reach him; the routine ones go quiet at night or once the day is used', async () => {
  const night = await make({ paired: true, now: new Date(2026, 8, 21, 23, 30) });
  night.core.emit({ t: 'bubble', text: 'Reminder: stretch', stream: false, proactive: true }); await tick();
  night.core.emit({ t: 'bubble', text: 'Need input in Claude on the job hunt. It wants permission to use Claude in Chrome', stream: false, proactive: true, asked: true }); await tick();
  night.core.emit({ t: 'bubble', text: 'Claude Code finished in AangApp.', stream: false, proactive: true }); await tick();
  const said = night.gw.to('aang').filter(m => !m.buttons);      // the pinned command deck is not something he was told
  assert.equal(said[0]!.silent, false, 'a reminder he set always makes a sound');
  assert.match(night.gw.to('needs-you')[0]!.content!, /^Need input in Claude/);
  assert.equal(night.gw.to('needs-you')[0]!.silent, false);
  assert.equal(said[1]!.silent, true, 'routine news at night is posted silently, not dropped');
});

test('the permissions it was given are checked, in both directions', async () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'aang-dc-'));
  const gw = new FakeGateway(), core = new FakeCore();
  gw.perms = gw.perms.filter(p => p !== 'AddReactions').concat(['Administrator']);
  await new DiscordAdapter(gw, core, dir, { typingMs: 1_000_000 }).start();
  const log = gw.to('log').map(m => m.content).join('\n');
  assert.match(log, /Missing permissions: AddReactions/);
  assert.match(log, /should not have: Administrator/);
});

test('"stop" from Discord stops the Core', async () => {
  const { gw, core } = await make({ paired: true });
  gw.say('aang', OWNER, 'stop'); await tick();
  assert.equal(core.stops, 1);
  assert.equal(core.submits.length, 0, 'and is not sent to the model as a question');
});


// ---------------------------------------------------------------- command deck, status, pictures and files

const deckOf = (gw: FakeGateway) => gw.to('aang').filter(m => m.buttons?.some(b => b.id.startsWith('deck:')));

test('a paired start posts the command deck once and pins it; the next start edits it in place', async () => {
  const { gw, dir } = await make({ paired: true });
  assert.equal(deckOf(gw).length, 1);
  assert.deepEqual(deckOf(gw)[0]!.buttons!.map(b => b.label), ['Status', 'Job hunt now', 'Stop']);
  assert.equal(gw.pins.length, 1);
  const again = new FakeGateway(), core2 = new FakeCore();
  await new DiscordAdapter(again, core2, dir, { typingMs: 1_000_000 }).start();
  assert.equal(deckOf(again).length, 0, 'not posted twice');
  assert.equal(again.edits.length, 1, 'edited in place');
});

test('if the deck was deleted, a new one is posted; if pinning is refused he is told how to fix it, and it still works', async () => {
  const { dir } = await make({ paired: true });
  const gw = new FakeGateway(), core = new FakeCore();
  gw.failEdit = true; gw.failPin = true;
  await new DiscordAdapter(gw, core, dir, { typingMs: 1_000_000 }).start();
  assert.equal(deckOf(gw).length, 1, 'posted again');
  assert.match(gw.to('log').map(m => m.content).join('\n'), /Pin Messages/);
});

test('the deck is only for him, and Status asks the Core without a model and answers where he pressed', async () => {
  const { gw, core } = await make({ paired: true });
  assert.deepEqual(gw.press('deck:status', STRANGER), ['That is not yours to answer.']);
  await tick();
  assert.equal(core.statuses, 0, 'a stranger pressing it does nothing');
  const acks = gw.press('deck:status', OWNER, 'ch-capture'); await tick();
  assert.deepEqual(acks, ['(kept)'], 'the deck stays: it is acknowledged, not replaced');
  assert.equal(core.statuses, 1);
  assert.equal(core.submits.length, 0, 'no model call');
  core.emit({ t: 'status.reply', text: 'Aang is up.' }); await tick();
  assert.deepEqual(gw.to('capture').map(m => m.content), ['Aang is up.']);
});

test('Job hunt now asks Aang exactly as typing it would, and the answer comes back to that channel; Stop stops', async () => {
  const { gw, core } = await make({ paired: true });
  gw.press('deck:job', OWNER); await tick();
  assert.equal(core.submits.length, 1);
  assert.equal(core.submits[0]!.text, 'Run my job search for today.');
  core.emit({ t: 'bubble', text: 'Opened it in Claude.', stream: false, id: core.submits[0]!.id }); await tick();
  assert.ok(gw.to('aang').some(m => m.content === 'Opened it in Claude.'));
  gw.press('deck:stop', OWNER); await tick();
  assert.equal(core.stops, 1);
});

test('a file or picture from the Core is posted as an attachment in the channel he is talking in', async () => {
  const { gw, core } = await make({ paired: true });
  gw.say('capture', OWNER, 'send me my screen', 'm1'); await tick();
  core.emit({ t: 'attach', name: 'window.jpg', mime: 'image/jpeg', data: Buffer.from('JPEGDATA').toString('base64'), caption: 'your window' }); await tick();
  const m = gw.to('capture').find(x => x.files);
  assert.ok(m, 'posted in #capture, where he asked');
  assert.equal(m!.files![0]!.name, 'window.jpg');
  assert.equal(m!.files![0]!.data.toString(), 'JPEGDATA');
  assert.equal(m!.content, 'your window');
});


