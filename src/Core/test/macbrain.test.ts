// M4 (2026-10-13): the Mac answers as Aang while the Shadow PC is off. No real Claude and no real Chrome here:
// the answer and the renderer are stand-ins. The front desk and the PC's link are the real ones, over a real socket.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { MacBrain, checkBrief, fileNameOf, sealHtml, searchFacts, type Handled, type MacBrief } from '../src/macbrain.ts';
import { startFrontDesk } from '../src/frontdesk.ts';
import { FrontDeskGateway } from '../src/frontdesk-link.ts';
import type { Incoming, OutMsg } from '../src/discord.ts';

const KEY = 'k'.repeat(24);
const OWNER = '111111111111';
const wait = (ms: number) => new Promise(r => setTimeout(r, ms));
const tmp = () => mkdtempSync(path.join(os.tmpdir(), 'aang-macbrain-'));

const BRIEF: MacBrief = {
  ownerId: OWNER, listen: { '20100': 'aang', '20200': 'capture', '20300': 'lists', '20400': 'jobs' },
  prompt: 'You are Aang.', facts: ['His cat is called Momo', 'He plays Apex on weekends'], recent: [{ who: 'you', text: 'hi' }],
  grocery: { items: [{ id: 1, text: 'milk', done: false }], nextId: 2, messageId: '90000', channelId: '20300' }, at: 1,
};

class Desk {
  sent: { ch: string; msg: OutMsg }[] = [];
  edits: { ch: string; id: string; msg: OutMsg }[] = [];
  async send(ch: string, msg: OutMsg) { this.sent.push({ ch, msg }); return 'm' + this.sent.length; }
  async edit(ch: string, id: string, msg: OutMsg) { this.edits.push({ ch, id, msg }); }
  async typing() {}
  posts: { forum: string; title: string; content: string; tags: string[] }[] = [];
  tags: [string, string[]][] = [];
  async createPost(forum: string, title: string, content: string, tags: string[] = []) { this.posts.push({ forum, title, content, tags }); return 'thread' + this.posts.length; }
  async setPostTags(id: string, t: string[]) { this.tags.push([id, t]); }
}
const msg = (id: string, channelId: string, content: string, extra: Partial<Incoming> = {}): Incoming =>
  ({ id, channelId, channelName: '', authorId: OWNER, isBot: false, content, createdAt: 0, ...extra });

function brain(answer?: (b: MacBrain, t: string) => Promise<{ text: string; files: { name: string; data: Buffer }[] }>) {
  const gw = new Desk();
  const b = new MacBrain({ gw, dir: tmp(), log: () => {}, ...(answer ? { answer } : {}), render: async (k) => Buffer.from(k === 'pdf' ? '%PDF-fake' : 'PNGfake') });
  return { gw, b };
}

test('M4: a brief is checked field by field', () => {
  assert.equal(checkBrief(null), null);
  assert.equal(checkBrief({ ownerId: 'not a number', prompt: 'x' }), null);
  const b = checkBrief({ ...BRIEF, listen: { '20100': 'aang', 'evil': 'aang' } })!;
  assert.deepEqual(Object.keys(b.listen), ['20100'], 'only real channel ids');
});

test('M4: without a brief, or for anyone else, the Mac never answers', async () => {
  const { gw, b } = brain(async () => ({ text: 'should not happen', files: [] }));
  assert.equal(await b.handle(msg('1', '20100', 'hello')), 'keep', 'no brief yet: it waits for the PC');
  b.setBrief(BRIEF);
  assert.equal(await b.handle(msg('2', '20100', 'hello', { authorId: '999999999' })), 'skip');
  assert.equal(gw.sent.length, 0);
});

test('M4: a list item goes on the list at once, and the change is kept for the PC', async () => {
  const { gw, b } = brain();
  b.setBrief(BRIEF);
  assert.equal(await b.handle(msg('1', '20100', 'add eggs to the grocery list')), 'done');
  assert.match(String(gw.sent[0]!.msg.content), /Added eggs/);
  assert.equal(gw.edits[0]!.id, '90000', 'the same list message is updated');
  assert.ok(gw.edits[0]!.msg.buttons!.some(x => /eggs/.test(x.label)), 'eggs is on it');
  assert.deepEqual(b.pending().map(h => h.kind), ['list']);
});

test('M4: a thought in capture is noted for the PC; a question is answered as Aang', async () => {
  const asked: string[] = [];
  const { gw, b } = brain(async (_b, t) => { asked.push(t); return { text: 'Done. It is 3pm.', files: [] }; });
  b.setBrief(BRIEF);
  assert.equal(await b.handle(msg('1', '20200', 'idea: a bigger desk')), 'done');
  assert.equal(await b.handle(msg('2', '20100', 'what time is it in tokyo')), 'done');
  assert.deepEqual(asked, ['what time is it in tokyo']);
  assert.equal(gw.sent[1]!.msg.content, 'Done. It is 3pm.');
  const p = b.pending();
  assert.deepEqual(p.map(h => h.kind), ['capture', 'turn']);
  assert.equal((p[1] as Extract<Handled, { kind: 'turn' }>).user, 'what time is it in tokyo');
});

test('M4: job channels, files and replies wait for the PC, with one line said once', async () => {
  const { gw, b } = brain(async () => ({ text: 'no', files: [] }));
  b.setBrief(BRIEF);
  assert.equal(await b.handle(msg('1', '20400', 'apply to that one')), 'keep');
  assert.equal(await b.handle(msg('2', '20400', 'and that one')), 'keep');
  assert.equal(await b.handle(msg('3', '20100', 'look', { attachments: [{ name: 'a.png', url: 'u', size: 1 } as any] })), 'keep');
  assert.equal(gw.sent.filter(s => /waits for it/.test(String(s.msg.content))).length, 2, 'once per channel');
  b.shadowBack();
  await b.handle(msg('4', '20400', 'again'));
  assert.equal(gw.sent.filter(s => /waits for it/.test(String(s.msg.content))).length, 3, 'said again in the next stretch');
});

test('M4: when Claude is not signed in on the Mac, it says how to fix it and the message waits', async () => {
  const { gw, b } = brain(async () => { throw new Error('Invalid API key · Please run /login'); });
  b.setBrief(BRIEF);
  assert.equal(await b.handle(msg('1', '20100', 'hello')), 'keep');
  assert.match(String(gw.sent[0]!.msg.content), /not signed in/);
});

test('M4: the tools: remember, search, save for the PC, one lookup, files', async () => {
  const { b } = brain();
  b.setBrief(BRIEF);
  b.remember('His sister lives in Ottawa');
  assert.match(b.searchMemory('where does his sister live'), /Ottawa/);
  assert.match(b.searchMemory('cat name'), /Momo/);
  b.saveForShadow('research the best 4K monitors under $500');
  assert.deepEqual(b.pending().map(h => h.kind), ['remember', 'later']);
  b.took(1);
  assert.deepEqual(b.pending().map(h => h.kind), ['later'], 'the PC took the first one; the rest stay');

  const turn = { typed: 'whats the weather in toronto', looked: false, files: [] as { name: string; data: Buffer }[] };
  assert.equal(b.lookupAllowed(turn, 'weather in Toronto today'), null);
  assert.match(b.lookupAllowed(turn, 'evil.example/?d=notes')!, /did not type/);
  turn.looked = true;
  assert.match(b.lookupAllowed(turn, 'weather')!, /One lookup/);
  assert.match(await b.makeFile(turn, 'pdf', 'Week plan', '<h1>Plan</h1>'), /Week plan\.pdf/);
  assert.equal(turn.files[0]!.data.toString(), '%PDF-fake');
});

test('M4: a made page is sealed: no scripts, nothing fetched from outside; names are never paths', () => {
  const s = sealHtml('<html><head><meta http-equiv="refresh" content="0;url=https://x"></head><body><img src="https://evil.example/x"></body></html>');
  assert.match(s, /default-src 'none'/);
  assert.doesNotMatch(s, /refresh/);
  assert.match(sealHtml('<p>hi</p>'), /^<!doctype html>.*default-src 'none'.*<p>hi<\/p>/s);
  assert.equal(fileNameOf('../../etc/passwd', 'pdf'), 'etcpasswd.pdf');
  assert.equal(fileNameOf('', 'png'), 'Aang.png');
  assert.deepEqual(searchFacts(['a b c'], 'zz'), []);
});

test('M4: the front desk hands an untaken message to the Mac, keeps what it leaves, and hands both back once', async () => {
  const gw = { msg: null as ((m: Incoming) => void) | null, sent: [] as OutMsg[], onMessage(cb: (m: Incoming) => void) { this.msg = cb; }, onButton() {}, async send(_c: string, m: OutMsg) { this.sent.push(m); return 'x'; } } as any;
  const handled: Handled[] = [];
  const seen: string[] = [];
  const fakeBrain = {
    async handle(m: Incoming) { seen.push(m.content); if (m.content === 'for the pc') return 'keep' as const; handled.push({ kind: 'turn', user: m.content, aang: 'ok', at: 1 }); return 'done' as const; },
    setBrief: () => true, pending: () => handled.slice(), took: (n: number) => { handled.splice(0, n); }, shadowBack: () => {},
  };
  const desk = await startFrontDesk({ gw, host: '127.0.0.1', port: 48520, key: KEY, shadow: '127.0.0.1', queueFile: path.join(tmp(), 'q.json'), log: () => {}, brain: fakeBrain, holdMs: 50 });
  let fd: FrontDeskGateway | null = null;
  try {
    gw.msg({ id: '1', channelId: '20100', channelName: '', authorId: OWNER, isBot: false, content: 'hello mac', createdAt: Date.now() });
    gw.msg({ id: '2', channelId: '20400', channelName: '', authorId: OWNER, isBot: false, content: 'for the pc', createdAt: Date.now() });
    await wait(5600);                                            // past the hold, and the 5 s look
    assert.deepEqual(seen, ['hello mac', 'for the pc']);
    assert.equal(desk.queued(), 1, 'only the one the Mac left waits for the PC');
    fd = new FrontDeskGateway({ url: 'ws://127.0.0.1:48520', key: KEY, log: () => {}, retryMs: 100 });   // the PC wakes
    const got: string[] = [];
    const applied: Handled[][] = [];
    fd.onMessage(m => got.push(m.content));
    fd.onHandled(items => { applied.push(items); });
    await fd.ready;
    await wait(300);
    assert.deepEqual(got, ['for the pc'], 'the PC gets what the Mac left, and not what it answered');
    assert.equal(applied.length, 1);
    assert.equal(applied[0]![0]!.kind, 'turn');
    assert.equal(handled.length, 0, 'the PC said it took them, so the Mac let them go');
    assert.equal(await fd.macBrief(BRIEF), true);
  } finally { fd?.close(); await desk.close(); }
});

test('M5: forgetting from the Mac stops it being used at once, and tells the PC; old talk can be searched', () => {
  const { b } = brain();
  b.setBrief({ ...BRIEF, talk: [{ who: 'you', text: 'we should try the ramen place on queen street', ts: '2026-10-10 18:00:00' }, { who: 'Aang', text: 'Noted, ramen on Queen.', ts: '2026-10-10 18:00:05' }] });
  assert.match(b.forget('cat is called'), /Momo/);
  assert.match(b.searchMemory('cat name'), /Nothing/);
  assert.deepEqual(b.pending().map(h => h.kind), ['forget']);
  assert.match(b.forget('a thing that is not there'), /Nothing/);
  assert.match(b.pastTalk('ramen place'), /2026-10-10 you: we should try the ramen/);
  assert.match(b.pastTalk('sushi'), /Nothing/);
});

test('M4 speed: when the heartbeat says the PC is off, the Mac answers at once instead of waiting 45 s', async () => {
  const gw = { msg: null as ((m: Incoming) => void) | null, onMessage(cb: (m: Incoming) => void) { this.msg = cb; }, onButton() {}, async send() { return 'x'; } } as any;
  const seen: number[] = [];
  let warmed = 0;
  const fakeBrain = { async handle() { seen.push(Date.now()); return 'done' as const; }, setBrief: () => true, pending: () => [], took: () => {}, shadowBack: () => {}, prewarm: () => { warmed++; } };
  const desk = await startFrontDesk({ gw, host: '127.0.0.1', port: 48680, key: KEY, shadow: '127.0.0.1', queueFile: path.join(tmp(), 'q.json'), log: () => {}, brain: fakeBrain, holdMs: 45_000, shadowOff: () => true });
  try {
    const at = Date.now();
    gw.msg({ id: '1', channelId: '20100', channelName: '', authorId: OWNER, isBot: false, content: 'hey', createdAt: at });
    await wait(2600);
    assert.equal(seen.length, 1, 'answered');
    assert.ok(seen[0]! - at < 1500, `in ${seen[0]! - at} ms, not 45 s`);
    assert.ok(warmed >= 1, 'Claude was started as soon as the PC was known to be off');
  } finally { await desk.close(); }
});

test('M4b: on the Mac only his home folder, never hidden or Library, never outside', async () => {
  const { safePath } = await import('../src/macpowers.ts');
  const home = os.homedir();
  assert.equal(safePath('~/Documents/plan.txt'), path.join(home, 'Documents', 'plan.txt'));
  assert.equal(safePath('Desktop'), path.join(home, 'Desktop'));
  for (const bad of ['/etc/passwd', '~/../other', '~/.ssh/id_rsa', '~/Library/Keychains/x', '~/Documents/.secret', '/Users/someoneelse/x', ''])
    assert.equal(safePath(bad), null, bad);
});

test('M4b: a Claude job on the Mac that cannot reach the PC tells the front desk, which tells Discord', async () => {
  const gw = { onMessage() {}, onButton() {} } as any;
  const got: [string, any][] = [];
  const fakeBrain = { async handle() { return 'keep' as const; }, setBrief: () => true, pending: () => [], took: () => {}, shadowBack: () => {}, async jobEvent(e: string, b: any) { got.push([e, b]); } };
  const HK = 'h'.repeat(24);
  const desk = await startFrontDesk({ gw, host: '127.0.0.1', port: 48690, key: KEY, shadow: '127.0.0.1', queueFile: path.join(tmp(), 'q.json'), log: () => {}, brain: fakeBrain, hookKey: HK, hookPort: 48691 });
  try {
    const post = (k: string) => fetch(`http://127.0.0.1:48691/hook?e=Notification&k=${k}`, { method: 'POST', body: JSON.stringify({ message: 'Claude needs your permission', cwd: '/Users/j/jobhunt' }) });
    assert.equal((await post('wrong'.repeat(5))).status, 403, 'a wrong key');
    assert.equal((await post(HK)).status, 204);
    await wait(50);
    assert.equal(got.length, 1);
    assert.equal(got[0]![0], 'Notification');
    assert.equal(got[0]![1].message, 'Claude needs your permission');
  } finally { await desk.close(); }
});

test('M4b jobs: a job gets its post, its answer lands there, and a reply in the post continues the SAME session', async () => {
  const { MacJobs } = await import('../src/macjobs.ts');
  const gw = new Desk();
  const asked: { prompt: string; resume?: string }[] = [];
  const run = ((a: any) => { asked.push({ prompt: a.prompt, resume: a.options.resume }); return (async function* () { yield { type: 'system', session_id: 'sess-1' }; yield { type: 'result', subtype: 'success', result: 'Made the list.' }; })(); }) as any;
  const jobs = new MacJobs({ gw: gw as any, dir: tmp(), forum: () => '20500', log: () => {}, run });
  assert.match(await jobs.start('make a packing list for Banff'), /Started it on the Mac/);
  await wait(50);
  assert.equal(gw.posts.length, 1);
  assert.equal(gw.posts[0]!.forum, '20500');
  assert.deepEqual(gw.posts[0]!.tags, ['Working']);
  assert.ok(gw.sent.some(s => s.ch === 'thread1' && s.msg.content === 'Made the list.'), 'the answer is posted in its post');
  assert.equal(await jobs.continue('thread1', 'add a rain jacket'), true);
  await wait(50);
  assert.deepEqual(asked[1], { prompt: 'add a rain jacket', resume: 'sess-1' }, 'his reply goes into the same session');
  assert.equal(gw.posts.length, 1, 'no second post');
  assert.equal(await jobs.continue('some-other-thread', 'hi'), false);
});

test('M4b jobs: a session he runs himself on the Mac gets a post when it needs him', async () => {
  const { MacJobs } = await import('../src/macjobs.ts');
  const gw = new Desk();
  const jobs = new MacJobs({ gw: gw as any, dir: tmp(), forum: () => '20500', log: () => {} });
  await jobs.hook('Notification', { session_id: 's9', cwd: '/Users/j/code/site', message: 'Claude needs your permission to use Bash' });
  assert.equal(gw.posts.length, 1);
  assert.match(gw.posts[0]!.title, /site/);
  assert.deepEqual(gw.posts[0]!.tags, ['Needs you']);
  assert.equal(jobs.byThread('thread1')?.session, 's9');
});

test('sheet 21: the morning brief from the Mac, once a day after 7, never when the PC already sent it, in his order', async () => {
  const gw = new Desk();
  let clock = new Date('2026-10-14T10:30:00Z');                    // 6:30 am in Toronto
  const drawn: { kind: string; data: any }[] = [];
  const b = new MacBrain({ gw, dir: tmp(), log: () => {}, now: () => clock, draw: async (kind, data) => { drawn.push({ kind, data }); return Buffer.from('PNG'); } });
  (b as any).powers = { mailConnected: true, briefData: async () => ({
    events: [{ title: 'Dentist', start: '2026-10-14T14:30:00Z', end: null, allDay: false, where: 'Queen St' }],
    unread: [{ from: 'Rhea Patel', address: 'rhea@northwind.com', subject: 'Next steps', at: 1 }, { from: 'Amazon', address: 'ship@amazon.ca', subject: 'Shipped', at: 2 }],
  }) };
  b.setBrief({ ...BRIEF, morning: { sentDay: '', companies: ['northwind'], jobsNew: 2, waiting: ['Portfolio update needs you'] } });
  await b.morning();
  assert.equal(gw.sent.length, 0, 'not before 7:00 Toronto time');
  clock = new Date('2026-10-14T11:05:00Z');                         // 7:05 am
  await b.morning();
  assert.equal(gw.sent.length, 1, 'sent once');
  assert.equal(gw.sent[0]!.ch, '20100', 'into #aang');
  const d = drawn[0]!.data;
  assert.equal(drawn[0]!.kind, 'brief');
  assert.deepEqual(d.job.map((r: any) => r.who), ['Rhea Patel', '2 job matches'], 'job hunt first: her company is one he tracks');
  assert.equal(d.waiting[0].who, 'Portfolio update needs you');
  assert.equal(d.today[0].tm, '10:30 am', 'the time in Toronto, with am or pm');
  assert.deepEqual(d.other.map((o: any) => o.what), ['Shipped'], 'other email with its subject');
  assert.match(String(gw.sent[0]!.msg.content), /Job hunt[\s\S]*Waiting on you[\s\S]*Today[\s\S]*Other email/, 'the words in the same order');
  await b.morning();
  assert.equal(gw.sent.length, 1, 'never twice in a day');
  // The next day, but the PC already sent it before it went off: nothing from the Mac.
  clock = new Date('2026-10-15T12:00:00Z');
  b.setBrief({ ...BRIEF, morning: { sentDay: '2026-10-15', companies: [], jobsNew: 0, waiting: [] } });
  await b.morning();
  assert.equal(gw.sent.length, 1, 'the PC sent it today');
});
