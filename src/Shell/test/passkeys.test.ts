// Phase 3 (2026-11-18): passkeys go to Chrome. Google's refusal page is recognised, Chrome is sent where he was going,
// and the go/no-go's test-only switch opens webauthn.io and nothing else, in passkeys.ts and tabpreload.cjs alike.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { googleRefused, passkeyTry, refusalTarget } from '../src/passkeys.ts';

test('Google refusal: by its address or by its words, on Google sign-in only', () => {
  assert.equal(googleRefused('https://accounts.google.com/v3/signin/rejected?continue=https%3A%2F%2Fmail.google.com'), true);
  assert.equal(googleRefused('https://accounts.google.com/signin/v2/deniedsigninrejected?flowName=GlifWebSignIn'), true);
  assert.equal(googleRefused('https://accounts.google.com/v3/signin/identifier', "Couldn't sign you in\nThis browser or app may not be secure. Learn more"), true);
  assert.equal(googleRefused('https://accounts.google.com/v3/signin/identifier', 'Sign in to continue to Gmail'), false);
  // The same words on any other site are not Google refusing anything.
  assert.equal(googleRefused('https://evil.example/v3/signin/rejected', 'This browser or app may not be secure'), false);
  assert.equal(googleRefused('http://accounts.google.com/v3/signin/rejected'), false);
  assert.equal(googleRefused('not an address', 'This browser or app may not be secure'), false);
});

test('Chrome goes where he was signing in to', () => {
  assert.equal(refusalTarget('https://accounts.google.com/v3/signin/rejected?continue=https%3A%2F%2Fmail.google.com%2Fmail%2F'), 'https://mail.google.com/mail/');
  assert.equal(refusalTarget('https://accounts.google.com/v3/signin/rejected', 'https://www.youtube.com/'), 'https://www.youtube.com/');
  // A continue that is not a web address, or a page he came from that is the refusal itself, falls back to Google.
  assert.equal(refusalTarget('https://accounts.google.com/v3/signin/rejected?continue=javascript%3Aalert(1)', ''), 'https://accounts.google.com/');
  assert.equal(refusalTarget('https://accounts.google.com/v3/signin/rejected', 'https://accounts.google.com/v3/signin/rejected'), 'https://accounts.google.com/');
  assert.equal(refusalTarget('https://accounts.google.com/v3/signin/rejected', 'file:///C:/x'), 'https://accounts.google.com/');
});

test('the go/no-go switch: webauthn.io only, only when set to 1', () => {
  assert.equal(passkeyTry('webauthn.io', '1'), true);
  assert.equal(passkeyTry('www.webauthn.io', '1'), true);
  assert.equal(passkeyTry('webauthn.io', undefined), false);
  assert.equal(passkeyTry('webauthn.io', 'true'), false);
  assert.equal(passkeyTry('webauthn.io.evil.com', '1'), false);
  assert.equal(passkeyTry('github.com', '1'), false);
  const pre = readFileSync(new URL('../src/tabpreload.cjs', import.meta.url), 'utf8');
  assert.match(pre, /process\.env\.SAMARA_PASSKEY_TRY === '1' && \/\^\(www\\\.\)\?webauthn\\\.io\$\/i\.test\(location\.hostname\)/, 'the preload keeps the same rule');
});

test('passkeys stay hidden everywhere else, and a real ask rings Samara', () => {
  const pre = readFileSync(new URL('../src/tabpreload.cjs', import.meta.url), 'utf8');
  assert.match(pre, /defineProperty\(window, 'PublicKeyCredential', \{ value: undefined/);
  assert.match(pre, /opts\.publicKey && opts\.mediation !== 'conditional'\) \{ try \{ wantPasskey\(\)/);
  assert.match(pre, /ipcRenderer\.send\('tab:passkey'\)/);
});
