#!/usr/bin/env node
// A stand-in for Bitwarden's command-line tool, for the autofill harness only (test/electron/autofill-check.ts). It keeps a
// tiny made-up vault in FAKE_BW_DIR, takes the master password "correct horse", and logs every create.
import { readFileSync, writeFileSync, existsSync, appendFileSync } from 'node:fs';
import path from 'node:path';
const dir = process.env.FAKE_BW_DIR, state = path.join(dir, 'state.json');
const SESSION = 'fakesessionkeyfakesessionkey0123456789';
const st = existsSync(state) ? JSON.parse(readFileSync(state, 'utf8')) : { unlocked: false };
const save = () => writeFileSync(state, JSON.stringify(st));
const items = [{ id: '11111111-1111-1111-1111-111111111111', type: 1, name: 'Northwind', login: { username: 'alex@example.com', password: 'opensesame', uris: [{ uri: 'https://shop.example' }] } }];
const [cmd, a1, ...rest] = process.argv.slice(2);
const ok = (o) => { process.stdout.write(typeof o === 'string' ? o : JSON.stringify(o)); process.exit(0); };
const live = () => st.unlocked && process.env.BW_SESSION === SESSION;
if (cmd === 'status') ok({ status: live() ? 'unlocked' : 'locked', userEmail: 'alex@example.com' });
if (cmd === 'unlock') { if (process.env.AANG_BW_UNLOCK === 'correct horse') { st.unlocked = true; save(); ok(SESSION); } process.exit(1); }
if (cmd === 'lock') { st.unlocked = false; save(); ok('locked'); }
if (cmd === 'sync') ok('synced');
if (!live()) process.exit(1);
if (cmd === 'list' && a1 === 'items') { const i = rest.indexOf('--url'); const u = i >= 0 ? rest[i + 1] : null; ok(u ? items.filter((x) => x.login.uris.some((y) => new URL(u).hostname === new URL(y.uri).hostname)) : items); }
if (cmd === 'get' && a1 === 'item') ok(items.find((x) => x.id === rest[0]) ?? process.exit(1));
if (cmd === 'create' && a1 === 'item') { let b = ''; process.stdin.on('data', (d) => { b += d; }); process.stdin.on('end', () => { appendFileSync(path.join(dir, 'created.log'), Buffer.from(b.trim(), 'base64').toString('utf8') + '\n'); ok('{"id":"new"}'); }); }
else process.exit(1);
