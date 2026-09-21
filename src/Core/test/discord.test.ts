// The Discord channel, tested end to end against a fake Discord and a fake Core: no token, no network.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, existsSync, writeFileSync } from 'node:fs';
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
  downloads: Record<string, Buffer> = {};
  async download(url: string) { const b = this.downloads[url]; if (!b) throw new Error('download failed (404)'); return b; }
  posts: { forumId: string; title: string; content: string }[] = [];
  async createPost(forumId: string, title: string, content: string) { this.posts.push({ forumId, title, content }); return 'post' + this.posts.length; }
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
  submits: { id: string; text: string; opts?: any }[] = []; perms: { id: string; allow: boolean }[] = []; stops = 0; statuses = 0;
  private cb: (m: any) => void = () => {};
  submit(id: string, text: string, opts?: any) { this.submits.push({ id, text, opts }); }
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
  assert.deepEqual(deckOf(gw)[0]!.buttons!.map(b => b.label), ['Status', 'Job hunt now', 'Apply approved', 'Stop']);
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
  assert.match(core.submits[0]!.text, /sweep and screen only.*shortlist.json/);
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



// ---------------------------------------------------------------- filing: grocery list and recipes

const listOf = (gw: FakeGateway) => gw.to('lists').filter(m => m.content?.startsWith('Grocery list'));

test('a grocery request is handled in code: no model call, the list appears in #lists, and he is told in the channel he used', async () => {
  const { gw, core } = await make({ paired: true });
  gw.say('capture', OWNER, 'add milk, eggs and bread to the grocery list'); await tick();
  assert.equal(core.submits.length, 0, 'the model was never asked');
  assert.match(gw.to('capture').map(m => m.content).join('|'), /Added milk, eggs, bread\./);
  const list = listOf(gw);
  assert.equal(list.length, 1);
  assert.match(list[0]!.content!, /3 to get/);
  assert.deepEqual(list[0]!.buttons!.map(b => b.label), ['milk', 'eggs', 'bread']);
  assert.equal(gw.pins.length >= 1, true);
});

test('the list is edited in place, not reposted; ticking an item and clearing ticked ones work from the buttons', async () => {
  const { gw } = await make({ paired: true });
  gw.say('aang', OWNER, 'add milk and eggs to my groceries'); await tick();
  const before = gw.sent.length, edits = gw.edits.length;
  gw.say('aang', OWNER, 'groceries: jam'); await tick();
  assert.equal(gw.edits.length, edits + 1, 'edited the same message');
  assert.equal(listOf(gw).length, 1, 'no second copy');
  assert.ok(gw.sent.length > before);                              // only his confirmation was added
  const last = () => gw.edits.at(-1)!.msg;
  assert.deepEqual(last().buttons!.map(b => b.label), ['milk', 'eggs', 'jam']);

  const id = last().buttons![0]!.id;                               // tick milk
  const acks = gw.press(id, OWNER); await tick();
  assert.deepEqual(acks, ['(kept)']);
  assert.deepEqual(last().buttons!.map(b => b.label), ['eggs', 'jam', '✓ milk', 'Clear ticked']);
  gw.press('list:g:clear', OWNER); await tick();
  assert.deepEqual(last().buttons!.map(b => b.label), ['eggs', 'jam']);
  assert.deepEqual(gw.press('list:g:1', STRANGER), ['That is not yours to answer.']);
});

test('remove, clear and show, and things that only sound like list requests still go to Aang', async () => {
  const { gw, core } = await make({ paired: true });
  gw.say('aang', OWNER, 'add tea and jam to the grocery list'); await tick();
  gw.say('aang', OWNER, 'take tea off the grocery list'); await tick();
  assert.deepEqual(gw.edits.at(-1)!.msg.buttons!.map(b => b.label), ['jam']);
  gw.say('aang', OWNER, 'show my grocery list'); await tick();
  assert.equal(listOf(gw).length, 2, 'show posts it fresh at the bottom');
  gw.say('aang', OWNER, 'clear the grocery list'); await tick();
  assert.match(gw.edits.at(-1)!.msg.content!, /empty/);
  assert.equal(core.submits.length, 0);
  gw.say('aang', OWNER, 'put the kettle on'); await tick();
  gw.say('aang', OWNER, 'what is a good grocery store near me'); await tick();
  assert.deepEqual(core.submits.map(s => s.text), ['put the kettle on', 'what is a good grocery store near me']);
});

test('the list survives a restart: the next start edits the same message', async () => {
  const { gw, dir } = await make({ paired: true });
  gw.say('aang', OWNER, 'add tea to the grocery list'); await tick();
  const gw2 = new FakeGateway(), core2 = new FakeCore();
  await new DiscordAdapter(gw2, core2, dir, { typingMs: 1_000_000 }).start();
  gw2.say('aang', OWNER, 'add jam to the grocery list'); await tick();
  assert.equal(listOf(gw2).length, 0, 'not posted again');
  assert.deepEqual(gw2.edits.at(-1)!.msg.buttons!.map(b => b.label), ['tea', 'jam']);
});

const PASTA = 'Lemon Pasta\nIngredients\n- 200 g spaghetti\n- 2 cloves garlic, minced\n- 3 tbsp olive oil\n\nInstructions\nBoil the pasta. Toss with everything else and eat it while it is hot.';

test('a pasted recipe becomes a #recipes post, and one button adds its ingredients to the list, once', async () => {
  const { gw, core } = await make({ paired: true });
  gw.say('capture', OWNER, PASTA); await tick();
  assert.equal(core.submits.length, 0, 'no model call');
  assert.equal(gw.posts.length, 1);
  assert.deepEqual([gw.posts[0]!.forumId, gw.posts[0]!.title], ['ch-recipes', 'Lemon Pasta']);
  assert.match(gw.posts[0]!.content, /Boil the pasta/, 'the whole recipe is kept');
  const reply = gw.to('capture').find(m => m.content?.startsWith('Filed in #recipes'))!;
  assert.equal(reply.buttons![0]!.label, 'Add 3 ingredients to the grocery list');
  const acks = gw.press(reply.buttons![0]!.id, OWNER); await tick();
  assert.match(acks[0]!, /^Added 3 to the grocery list/);
  assert.deepEqual(listOf(gw)[0]!.buttons!.map(b => b.label), ['spaghetti', 'garlic', 'olive oil']);
});

test('a long recipe is split across the post and replies, and a recipe pasted in #aang is left for Aang', async () => {
  const { gw, core } = await make({ paired: true });
  const long = 'Big Stew\nIngredients\n- beef\n- carrots\n\n' + ('Simmer gently and stir. '.repeat(200));
  gw.say('capture', OWNER, long); await tick();
  assert.equal(gw.posts.length, 1);
  assert.ok(gw.sent.filter(s => s.channelId === 'post1').length >= 1, 'the rest went into the post as replies');
  gw.say('aang', OWNER, PASTA); await tick();
  assert.equal(gw.posts.length, 1, 'only #capture files recipes');
  assert.equal(core.submits.length, 1);
});

// ---------------------------------------------------------------- jobs, phone files

async function makeJobs() {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'aang-dcj-'));
  const gw = new FakeGateway(), core = new FakeCore();
  const shortlistFile = path.join(dir, 'shortlist.json');
  writeFileSync(path.join(dir, 'discord.json'), JSON.stringify({ ownerId: OWNER, channels: {}, lastSeen: {} }));
  const criteriaFile = path.join(dir, 'crit.md'); writeFileSync(criteriaFile, 'PAYFLOOR-TEST 80K');
  const a = new DiscordAdapter(gw, core, dir, { typingMs: 1_000_000, scanMs: 0, shortlistFile, criteriaFile, inboxDir: path.join(dir, 'in'), now: () => new Date('2026-09-22T15:00:00Z') });
  await a.start();
  return { a, gw, core, dir, shortlistFile };
}
const VERDICT = '{"title":"Onboarding Lead","company":"Acme","location":"Toronto","salary":"$88K","verdict":"apply","reason":"Right lane."}';
const cardsIn = (gw: FakeGateway, ch: string) => gw.to(ch).filter(m => m.buttons?.some(b => b.id.startsWith('job:')));

test('a link pasted in #job-inbox is vetted by Aang privately, and comes back as a card with Open, Approve and Skip', async () => {
  const { gw, core } = await makeJobs();
  gw.say('job-inbox', OWNER, 'check this https://jobs.example.com/onboarding-lead please'); await tick();
  assert.equal(core.submits.length, 1);
  assert.match(core.submits[0]!.text, /Vet this job posting/);
  assert.match(core.submits[0]!.text, /PAYFLOOR-TEST 80K/, 'his criteria are inside the question');
  assert.deepEqual(core.submits[0]!.opts, { ephemeral: true, mode: 'smart' }, 'not kept as something he said');
  core.emit({ t: 'bubble', text: 'Here you go: ' + VERDICT, stream: false, id: core.submits[0]!.id }); await tick();
  const card = cardsIn(gw, 'job-inbox')[0]!;
  assert.match(card.content!, /Onboarding Lead\*\* at Acme/);
  assert.deepEqual(card.buttons!.map(b => b.label), ['Open', 'Approve', 'Skip']);
  assert.ok(!gw.to('job-inbox').some(m => m.content?.startsWith('Here you go')), 'the raw reply is not posted');
  gw.say('job-inbox', OWNER, 'https://jobs.example.com/onboarding-lead'); await tick();
  assert.equal(core.submits.length, 1, 'a link already in the list is not vetted twice');
  assert.match(gw.to('job-inbox').at(-1)!.content!, /already have that one/);
});

test('a vetting reply that is not a verdict is shown as it is, not turned into a card', async () => {
  const { gw, core } = await makeJobs();
  gw.say('job-inbox', OWNER, 'https://jobs.example.com/x'); await tick();
  core.emit({ t: 'bubble', text: 'I could not open that page.', stream: false, id: core.submits[0]!.id }); await tick();
  assert.equal(cardsIn(gw, 'job-inbox').length, 0);
  assert.match(gw.to('job-inbox').at(-1)!.content!, /could not read a verdict[\s\S]*could not open that page/);
});

test('text in #job-inbox with no link is just a message to Aang', async () => {
  const { gw, core } = await makeJobs();
  gw.say('job-inbox', OWNER, 'which of these is best?'); await tick();
  assert.equal(core.submits.length, 1);
  assert.doesNotMatch(core.submits[0]!.text, /Vet this/);
});

test('Approve, Undo and Skip edit the card in place, and only he can press them', async () => {
  const { gw, core } = await makeJobs();
  gw.say('job-inbox', OWNER, 'https://jobs.example.com/a'); await tick();
  core.emit({ t: 'bubble', text: VERDICT, stream: false, id: core.submits[0]!.id }); await tick();
  const [ok, no] = [cardsIn(gw, 'job-inbox')[0]!.buttons![1]!.id, cardsIn(gw, 'job-inbox')[0]!.buttons![2]!.id];
  assert.deepEqual(gw.press(ok, STRANGER), ['That is not yours to answer.']);
  assert.equal(gw.edits.length, 0);
  assert.deepEqual(gw.press(ok, OWNER), ['(kept)']); await tick();
  assert.match(gw.edits.at(-1)!.msg.content!, /Approved/);
  assert.deepEqual(gw.edits.at(-1)!.msg.buttons!.map(b => b.label), ['Open', 'Undo']);
  gw.press(gw.edits.at(-1)!.msg.buttons![1]!.id, OWNER); await tick();
  assert.deepEqual(gw.edits.at(-1)!.msg.buttons!.map(b => b.label), ['Open', 'Approve', 'Skip']);
  gw.press(no, OWNER); await tick();
  assert.match(gw.edits.at(-1)!.msg.content!, /Skipped/);
});

test('the sweep shortlist becomes cards in #job-digest once each, silently, with one loud summary', async () => {
  const { a, gw, shortlistFile } = await makeJobs();
  assert.equal(await a.scanShortlist(), 0, 'no file yet');
  writeFileSync(shortlistFile, JSON.stringify([
    { title: 'CSM', company: 'A', url: 'https://jobs.example.com/1', why: 'lane' },
    { title: 'Onboarding', company: 'B', url: 'https://jobs.example.com/2' },
    { title: 'Evil', company: 'C', url: 'javascript:alert(1)' },
  ]));
  assert.equal(await a.scanShortlist(), 2);
  assert.equal(cardsIn(gw, 'job-digest').length, 2);
  assert.ok(cardsIn(gw, 'job-digest').every(m => m.silent === true), 'each card is silent');
  const summary = gw.to('job-digest').find(m => /2 new jobs/.test(m.content ?? ''))!;
  assert.equal(summary.silent, false, 'one message that does make a sound');
  assert.equal(await a.scanShortlist(), 0, 'unchanged file: nothing');
  writeFileSync(shortlistFile, JSON.stringify([{ title: 'CSM', company: 'A', url: 'https://jobs.example.com/1' }, { title: 'New', company: 'D', url: 'https://jobs.example.com/4' }]));
  const fs = await import('node:fs'); fs.utimesSync(shortlistFile, new Date(), new Date(Date.now() + 5000));
  assert.equal(await a.scanShortlist(), 1, 'only the new one');
});

test('Apply approved sends only approved jobs, no more than the cap, to a Claude session; the rest wait', async () => {
  const { a, gw, core, shortlistFile } = await makeJobs();
  gw.press('deck:apply', OWNER); await tick();
  assert.match(gw.to('aang').at(-1)!.content!, /Nothing is approved yet/);
  assert.equal(core.submits.length, 0);

  writeFileSync(shortlistFile, JSON.stringify(Array.from({ length: 7 }, (_, i) => ({ title: 'Role ' + i, company: 'Co', url: `https://jobs.example.com/${i}` }))));
  await a.scanShortlist();
  for (const c of a.jobs.cards) gw.press(`job:ok:${c.id}`, OWNER);
  await tick();
  gw.press('deck:apply', OWNER); await tick();
  assert.equal(core.submits.length, 1);
  const prompt = core.submits[0]!.text;
  assert.equal((prompt.match(/^\d\. /gm) ?? []).length, 5, 'five, the daily limit');
  assert.match(prompt, /CAPTCHA/);
  assert.match(gw.to('aang').at(-1)!.content!, /Sending 5 to apply, 2 more wait/);
  assert.equal(gw.to('applied').length, 5, 'one line per job in #applied');
  gw.press('deck:apply', OWNER); await tick();
  assert.match(gw.to('aang').at(-1)!.content!, /limit of 5 is used/);
  assert.equal(core.submits.length, 1, 'a second tap sends nothing');

  gw.say('aang', OWNER, 'cap 8 today'); await tick();
  assert.match(gw.to('aang').at(-1)!.content!, /limit is 8/);
  gw.press('deck:apply', OWNER); await tick();
  assert.equal(core.submits.length, 2);
  assert.equal((core.submits[1]!.text.match(/^\d\. /gm) ?? []).length, 2);
  gw.say('aang', OWNER, 'cap 9'); await tick();
  assert.match(gw.to('aang').at(-1)!.content!, /most I will send in a day is 8/);
});

test('files sent from his phone are saved on the PC; programs and huge files are refused; a photo with no words is not sent to the model', async () => {
  const { gw, core, dir } = await makeJobs();
  gw.downloads['https://cdn.discordapp.com/a/photo.jpg'] = Buffer.from('JPEG');
  gw.downloads['https://cdn.discordapp.com/a/evil.exe'] = Buffer.from('MZ');
  const m = gw.say('capture', OWNER, '', 'att1');
  (m as any).attachments = [
    { name: 'photo.jpg', url: 'https://cdn.discordapp.com/a/photo.jpg', size: 4 },
    { name: 'evil.exe', url: 'https://cdn.discordapp.com/a/evil.exe', size: 2 },
    { name: 'movie.mov', url: 'https://cdn.discordapp.com/a/movie.mov', size: 40 * 1048576 },
  ];
  await (gw as any).msgCb(m); await tick(); await tick();
  const reply = gw.to('capture').map(x => x.content).join('\n');
  assert.match(reply, /Saved to the PC:[\s\S]*photo\.jpg/);
  assert.match(reply, /evil\.exe: it is a kind of file that can run/);
  assert.match(reply, /movie\.mov: it is 40\.0 MB/);
  assert.equal(readFileSync(path.join(dir, 'in', '2026-09-22', 'photo.jpg'), 'utf8'), 'JPEG');
  assert.equal(existsSync(path.join(dir, 'in', '2026-09-22', 'evil.exe')), false);
  assert.equal(core.submits.length, 0);
});
