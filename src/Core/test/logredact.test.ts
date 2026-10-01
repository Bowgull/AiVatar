import './_env.ts';
// What Aang writes down about what he did, and what he deliberately does not.
//
// WHY THIS EXISTS: finding M10 in PORT-TO-MAC.md - actions.jsonl was keeping full shell command
// lines and clipboard text. A command line is exactly where a token, a key or a password ends up,
// and actions.jsonl is a plain file that nothing rotates and nothing encrypts.
//
// The subtlety that makes this worth a test rather than a one-line edit: describeCall has two jobs
// pulling opposite ways. It writes the permission question Joshua answers, where the full command
// IS the point - "use PowerShell" with no command in it is a question nobody can answer, and that
// was itself a deliberate fix. And it writes the log, which persists. So the fix is a second
// function, and the thing most likely to go wrong later is someone "tidying" the two back together.
// These tests pin both halves: the question must stay complete, the receipt must not.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { describeCall, describeForLog } from '../src/tools.ts';

const TOKEN = 'ghp_SECRET0000000000000000000000000000';

test('a shell command keeps its name in the log but loses its arguments', () => {
  const input = { command: `git push https://user:${TOKEN}@github.com/x/y` };
  const logged = describeForLog('mcp__aang__run', input);
  assert.match(logged, /^run git/, 'the receipt must still say what was run, or "what did you do" is useless');
  assert.ok(!logged.includes(TOKEN), 'the log must not carry a credential out of the command line');
  assert.ok(!logged.includes('github.com'), 'nor the rest of the arguments');
  assert.match(logged, /\.\.\./, 'and it should be visible that something was left out');
});

test('the permission question still shows the whole command', () => {
  // The other half of the contract. If this ever regresses, Joshua is approving something he cannot
  // see, which is worse than the leak this change is fixing.
  const input = { command: 'Remove-Item C:/Users/Shadow/Documents/important -Recurse' };
  const asked = describeCall('mcp__aang__run', input);
  assert.match(asked, /Remove-Item/, 'he must see what he is agreeing to');
  assert.match(asked, /important/, 'including which path, which is the part that matters here');
});

test('a bare command with no arguments still reads sensibly', () => {
  assert.equal(describeForLog('mcp__aang__run', { command: 'git status' }), 'run git ...');
  assert.equal(describeForLog('mcp__aang__run', { command: 'whoami' }), 'run whoami');
  assert.equal(describeForLog('mcp__aang__run', { command: '' }), 'run a command');
});

test('leading cd scaffolding is not mistaken for the command', () => {
  // `cd somewhere && git push` is one command with a prefix; the receipt should say git, not cd.
  const logged = describeForLog('mcp__aang__run', { command: 'cd C:/repo && git push origin main' });
  assert.match(logged, /^run git/, 'the cd is scaffolding, not the thing that happened');
});

test('clipboard text is not written down', () => {
  const logged = describeForLog('mcp__aang__copy_to_clipboard', { text: `my password is ${TOKEN}` });
  assert.ok(!logged.includes(TOKEN));
  assert.ok(!logged.includes('password'));
  assert.match(logged, /clipboard/, 'it should still record that the clipboard was replaced');
});

test('what Aang READS from the clipboard was never logged, and still is not', () => {
  // Correcting M10 while here: it says clipboard text was logged, which is true only of what Aang
  // PUTS there. read_clipboard has always returned a fixed string with no content in it.
  const logged = describeForLog('mcp__aang__read_clipboard', { text: TOKEN });
  assert.ok(!logged.includes(TOKEN));
  assert.equal(logged, describeCall('mcp__aang__read_clipboard', {}), 'nothing to redact, so it passes straight through');
});

test('typed text is not written down, but the field and app are', () => {
  const input = { app: 'chrome', name: 'Password', text: TOKEN };
  const logged = describeForLog('mcp__aang__fill_control', input);
  assert.ok(!logged.includes(TOKEN), 'this is the one tool that can put a typed secret on disk');
  assert.match(logged, /Password/, 'which field was filled is the receipt');
  assert.match(logged, /chrome/, 'and which app');
});

test('everything else is logged exactly as before', () => {
  // The redaction must be surgical. Over-redacting would quietly gut the action log, which is what
  // answers "what did you just do" and backs the undo stack.
  for (const [tool, input] of [
    ['mcp__aang__open', { what: 'discord' }],
    ['mcp__aang__delete_file', { path: 'C:/Users/Shadow/notes.txt' }],
    ['mcp__aang__move_file', { from: 'C:/a.txt', to: 'C:/b.txt' }],
    ['mcp__aang__set_reminder', { text: 'stretch' }],
    ['mcp__aang__remember', { fact: 'He raids on Tuesdays' }],
    ['mcp__aang__press_control', { app: 'chrome', name: 'Send' }],
    ['mcp__aang__read_window', { app: 'firefox' }],
  ] as const) {
    assert.equal(describeForLog(tool, input as Record<string, unknown>), describeCall(tool, input as Record<string, unknown>),
      `${tool} should be untouched by the redaction`);
  }
});

test('the built-in shell tools are redacted too, not just Aang\'s own', () => {
  // They are in disallowedTools today, but a redaction that only covers one spelling of "run a
  // command" is the kind that stops working the moment something changes upstream.
  for (const tool of ['Bash', 'PowerShell']) {
    const logged = describeForLog(tool, { command: `curl -H "Authorization: Bearer ${TOKEN}" https://api.example.com` });
    assert.ok(!logged.includes(TOKEN), `${tool} leaked a token into the log`);
    assert.match(logged, /^run curl/);
  }
});
