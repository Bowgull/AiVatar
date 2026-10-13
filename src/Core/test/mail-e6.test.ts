// E6 (his ask: "full email control"; his rule: never a mistake). CC and files are part of what he approves: a file that
// changes after he looked stops the send; programs are never attached; a forward quotes the original under his words.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { MailService, MailStore, hashDraft, mimeRaw, renderMailCard, shaOf } from '../src/mail.ts';

const tmp = () => mkdtempSync(path.join(os.tmpdir(), 'aang-mail6-'));
const b64 = (s: string) => Buffer.from(s).toString('base64url');
const decode = (raw: string) => Buffer.from(raw.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');

/** A Gmail that holds one email with one PDF attachment, and records what is sent. */
function fakeGoogle(pdf: Buffer) {
  const sent: string[] = [];
  const msg = { id: 'm1', threadId: 't1', internalDate: '1797000000000', payload: { mimeType: 'multipart/mixed', headers: [
    { name: 'From', value: 'Rhea Patel <rhea@northwind.com>' }, { name: 'To', value: 'bocas.joshua@gmail.com' }, { name: 'Subject', value: 'Next steps' }, { name: 'Date', value: 'Tue, 13 Oct 2026 08:41:00 -0400' }],
    parts: [{ mimeType: 'text/plain', body: { data: b64('See the brief. Rhea') } }, { mimeType: 'application/pdf', filename: 'Demo brief.pdf', body: { attachmentId: 'a1', size: pdf.length } }] } };
  const g: any = {
    account: 'bocas.joshua@gmail.com', connected: true, has: () => true,
    message: async () => msg, attachment: async () => pdf.toString('base64url'),
    send: async (raw: string) => { sent.push(raw); return { id: 'x' }; }, saveDraft: async () => ({ id: 'd' }),
  };
  return { g, sent };
}

test('CC and a file are part of the approved hash; a draft without them hashes exactly as before E6', () => {
  const plain = { to: ['a@b.co'], subject: 's', body: 'b' };
  assert.equal(hashDraft(plain), hashDraft({ ...plain, cc: [], files: [] }), 'old drafts still match their cards');
  assert.notEqual(hashDraft(plain), hashDraft({ ...plain, cc: ['c@d.co'] }));
  assert.notEqual(hashDraft({ ...plain, files: [{ name: 'x.pdf', sha: '1' }] }), hashDraft({ ...plain, files: [{ name: 'x.pdf', sha: '2' }] }), 'different bytes, different approval');
});

test('a reply with CC and the email\'s own attachment: the card shows both, and the message carries both', async () => {
  const pdf = Buffer.from('%PDF-1.4 brief');
  const { g, sent } = fakeGoogle(pdf);
  const svc = new MailService(g, new MailStore(path.join(tmp(), 'm.json')));
  const p = await svc.propose({ to: ['rhea@northwind.com'], cc: ['sam@studio.ca'], subject: 'Re: Next steps', body: 'Here it is.', replyToId: 'm1', attach: [{ emailId: 'm1', name: 'Demo brief.pdf' }] });
  assert.ok(p.ok);
  const d = p.draft;
  assert.deepEqual(d.cc, ['sam@studio.ca']);
  assert.deepEqual(d.newTo, ['sam@studio.ca'], 'a new CC address is flagged too');
  assert.equal(d.files?.[0]?.sha, shaOf(pdf));
  const card = renderMailCard(d).content;
  assert.match(card, /Cc: sam@studio\.ca/);
  assert.match(card, /Attached: Demo brief\.pdf \(1 KB\)/);
  await svc.act(d.id, d.hash, 'send');                      // first press: the new address is asked about
  const r = await svc.act(d.id, d.hash, 'send');
  assert.equal(r.draft?.status, 'sent');
  const raw = decode(sent[0]!);
  assert.match(raw, /^Cc: sam@studio\.ca\r$/m);
  assert.match(raw, /Content-Type: multipart\/mixed; boundary="aang-/);
  assert.match(raw, /Content-Disposition: attachment; filename\*=UTF-8''Demo%20brief\.pdf/);
  assert.ok(raw.includes(pdf.toString('base64')), 'the exact bytes');
});

test('a file that changed after he approved it stops the send', async () => {
  let bytes = Buffer.from('version one');
  const { g, sent } = fakeGoogle(Buffer.from('x'));
  const svc = new MailService(g, new MailStore(path.join(tmp(), 'm.json')));
  svc.readLocal = (p: string) => ({ ok: true, buf: bytes, name: path.basename(p) });
  const p = await svc.propose({ to: ['rhea@northwind.com'], subject: 'Plan', body: 'Attached.', attach: [{ path: 'C:\\Prep\\Demo plan.pdf' }] });
  assert.ok(p.ok);
  bytes = Buffer.from('version two');
  await svc.act(p.draft.id, p.draft.hash, 'send');
  const r = await svc.act(p.draft.id, p.draft.hash, 'send');
  assert.match(r.note, /changed after you approved it, so nothing was sent/);
  assert.equal(sent.length, 0);
});

test('programs are never attached, and nothing from this machine without its rules', async () => {
  const { g } = fakeGoogle(Buffer.from('x'));
  const svc = new MailService(g, new MailStore(path.join(tmp(), 'm.json')));
  const none = await svc.propose({ to: ['a@b.co'], subject: 's', body: 'b', attach: [{ path: 'C:\\x.pdf' }] });
  assert.ok(!none.ok && /cannot be attached here/.test(none.why));
  svc.readLocal = (p: string) => ({ ok: true, buf: Buffer.from('MZ'), name: path.basename(p) });
  const exe = await svc.propose({ to: ['a@b.co'], subject: 's', body: 'b', attach: [{ path: 'C:\\setup.exe' }] });
  assert.ok(!exe.ok && /never sends those/.test(exe.why));
});

test('a forward: "Fwd:", his words first, the original quoted under them, a new thread', async () => {
  const { g } = fakeGoogle(Buffer.from('x'));
  const svc = new MailService(g, new MailStore(path.join(tmp(), 'm.json')));
  const p = await svc.propose({ to: ['sam@studio.ca'], subject: '', body: 'FYI, see below.', forwardOf: 'm1' });
  assert.ok(p.ok);
  assert.equal(p.draft.subject, 'Fwd: Next steps');
  assert.match(p.draft.body, /^FYI, see below\.\n\n---------- Forwarded message ---------\nFrom: Rhea Patel <rhea@northwind\.com>\nDate: Tue, 13 Oct 2026 08:41:00 -0400\nSubject: Next steps/);
  assert.match(p.draft.body, /See the brief\. Rhea$/);
  assert.equal(p.draft.threadId, undefined);
  assert.match(renderMailCard(p.draft).content, /A forward/);
});

test('without files, the message is exactly the plain one it always was', () => {
  const d: any = { id: 'a', to: ['a@b.co'], subject: 'Hi', body: 'Hello', hash: 'h', status: 'pending', newTo: [], createdAt: 0 };
  const raw = decode(mimeRaw(d, 'me@x.co'));
  assert.match(raw, /Content-Type: text\/plain; charset="UTF-8"/);
  assert.equal(/multipart/.test(raw), false);
  assert.equal(/^Cc:/m.test(raw), false);
});
