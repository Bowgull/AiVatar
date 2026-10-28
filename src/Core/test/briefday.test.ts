import './_env.ts';
// 2026-10-28: the day was marked done before the brief was made, so one failure halfway meant no brief at all that
// day. The day only counts once the brief exists.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { MailService, MailStore } from '../src/mail.ts';

test('a brief that fails does not use up the day; the next try makes it', async () => {
  const store = new MailStore(path.join(mkdtempSync(path.join(os.tmpdir(), 'brief-')), 'mail.json'));
  const nine = () => new Date('2026-10-28T13:00:00Z');                  // 9:00 in Toronto
  const svc = new MailService({ connected: true } as never, store, nine);
  let fail = true;
  (svc as unknown as { brief: () => Promise<string> }).brief = async () => { if (fail) throw new Error('Gmail timed out'); return 'the brief'; };
  await assert.rejects(svc.dailyBrief(7));
  assert.equal(store.briefDay, undefined, 'the failed try did not count');
  fail = false;
  assert.equal(await svc.dailyBrief(7), 'the brief');
  assert.equal(await svc.dailyBrief(7), null, 'once made, once a day');
});
