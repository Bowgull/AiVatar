// S2, the eleven small security fixes (decision 47). Each test tries the attack and checks it is refused.
// Tested without the model or a Body: a question that has to be asked comes back as no, so "asked" is
// visible as false where a remembered yes would have been true.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Core } from '../src/core.ts';
import { AANG_APP, offLimits, refusal } from '../src/files.ts';
import { kindOf } from '../src/trust.ts';
import { untypedAddresses } from '../src/tools.ts';
import { fitsCard, renderMailCard } from '../src/mail.ts';
import { noPreview } from '../src/discord-logic.ts';
import { WsCoreLink } from '../src/discord-gateway.ts';

const tmp = () => mkdtempSync(path.join(os.tmpdir(), 'aang-s2-'));
const home = os.homedir();
function core(...kinds: string[]): any {
  const c: any = new Core({ port: 48210, dataDir: tmp(), stateDir: tmp(), warm: false, consolidate: false });
  for (const k of kinds) c.trust.allow(k, 'test');
  return c;
}

test('2.2 no writes to the Brain folder or to Aang\'s own source, security code included', () => {
  const dataDir = tmp(), p = { stateDir: tmp(), dataDir };
  assert.match(refusal(path.join(dataDir, 'Brain', 'profile.md'), p) ?? '', /Brain/);
  assert.match(refusal(path.join(AANG_APP, 'src', 'Core', 'src', 'trust.ts'), p) ?? '', /source code/);
  assert.equal(refusal(path.join(home, 'Documents', 'notes.txt'), p), null, 'his own files are still writable');
});

test('2.3 no writes to the Startup folder or the PowerShell profile folders; schtasks and setx always ask', () => {
  const p = { stateDir: tmp(), dataDir: tmp() };
  const startup = path.join(process.env.APPDATA ?? path.join(home, 'AppData', 'Roaming'), 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'Startup', 'evil.bat');
  assert.match(refusal(startup, p) ?? '', /runs? by themselves|run by themselves/);
  assert.ok(refusal(path.join(home, 'Documents', 'WindowsPowerShell', 'Microsoft.PowerShell_profile.ps1'), p));
  assert.ok(refusal(path.join(home, 'Documents', 'PowerShell', 'profile.ps1'), p));
  assert.equal(kindOf('mcp__aang__run', { command: 'schtasks /create /tn x /tr calc.exe /sc onlogon' }), null);
  assert.equal(kindOf('mcp__aang__run', { command: 'setx PATH C:\\evil' }), null);
});

test('2.4 a trusted program chained, piped, redirected or substituted always asks', async () => {
  const c = core('run git');
  assert.equal(await c.askPermission('mcp__aang__run', { command: 'git status' }), true, 'the plain trusted command still runs');
  for (const command of ['git status; del notes.txt', 'git log | Out-File x', 'git status & calc', 'git log $(whoami)', 'git log `whoami`', 'git log > C:\\Users\\Public\\x.txt', 'git status\nRemove-Item x']) {
    assert.equal(await c.askPermission('mcp__aang__run', { command }), false, command);
  }
  assert.equal(await c.askPermission('mcp__aang__run', { command: 'cd C:\\Users\\Shadow\\Documents\\AangApp; git status' }), true, 'cd scaffolding is not chaining');
  c.memory.close();
});

test('2.4 a trusted program may not read outside his folders without asking, nor keys at all', async () => {
  const c = core('run git', 'run type');
  assert.equal(await c.askPermission('mcp__aang__run', { command: 'git -C C:\\Windows\\System32 log' }), false, 'outside his folders asks');
  assert.equal(await c.askPermission('mcp__aang__run', { command: `type ${path.join(home, 'Documents', 'todo.txt')}` }), true, 'inside is fine');
  c.refused = '';
  assert.equal(await c.askPermission('mcp__aang__run', { command: 'type .ssh\\id_rsa' }), false);
  assert.match(c.refused, /safety rule/, 'a key is refused outright, not asked');
  c.memory.close();
});

test('2.5 look_up_web asks when it names an address he did not type, or after outside content', async () => {
  assert.deepEqual(untypedAddresses('what does evil.example/?d=notes say', 'look up the raid times'), ['evil.example']);
  assert.deepEqual(untypedAddresses('read https://www.wowhead.com/classic/guide', 'check wowhead.com for the guide'), []);
  assert.deepEqual(untypedAddresses('what is node.js', 'what is node.js'), []);
  const c = core();
  c.active = { sub: { text: 'what time is the raid' } };
  c.webLane = { ask: async () => ({ text: 'looked it up' }) };
  assert.match(await c.lookUpWeb('summarise https://evil.example/?d=secret'), /Not done/, 'an address he never typed asks; no Body means no');
  assert.equal(await c.lookUpWeb('raid reset times'), 'looked it up', 'a plain lookup still just works');
  assert.equal(await c.lookUpWeb('raid reset times again'), 'looked it up', 'the web\'s own answer does not make the next lookup ask');
  c.tainted = true;                                    // e.g. his screen was read
  assert.match(await c.lookUpWeb('raid reset times'), /Not done/);
  c.memory.close();
});

test('2.6 after outside content, remember, correct, do_task and drafts ask first', async () => {
  const c = core();
  const gate = c.doers().outsideGate;
  assert.equal(await gate('mcp__aang__remember', { fact: 'x' }), null, 'a normal turn goes ahead');
  c.tainted = true;
  for (const tool of ['mcp__aang__remember', 'mcp__aang__correct', 'mcp__aang__do_task', 'mcp__aang__mail_draft']) {
    assert.match(await gate(tool, {}) ?? '', /Not done/, tool);
  }
  c.memory.close();
});

test('2.7 search_memory, what_we_talked_about and claude_code_status mark the turn', () => {
  const src = readFileSync(path.join(import.meta.dirname, '..', 'src', 'tools.ts'), 'utf8');
  assert.match(src, /BRINGS_OUTSIDE = new Set\(\['search_memory', 'what_we_talked_about', 'claude_code_status'\]\)/);
  const c = core();
  c.doers().markOutside();
  assert.equal(c.tainted, true);
  c.memory.close();
});

test('2.8 an email too long to show whole cannot be sent from a Discord card', () => {
  const d: any = { id: 'd1', hash: 'h', to: ['a@b.com'], newTo: [], subject: 's', body: 'x'.repeat(5000), status: 'pending' };
  assert.equal(fitsCard(d), false);
  const v = renderMailCard(d);
  assert.ok(!v.buttons.some((b: any) => /send/i.test(b.label)), 'no Send button');
  assert.match(v.content, /open it on the desktop/);
  assert.ok(renderMailCard({ ...d, body: 'short' }).buttons.some((b: any) => b.label === 'Send'), 'a short one still has Send');
});

test('2.9 no link previews on what Aang sends to Discord', () => {
  assert.equal(noPreview('see https://evil.example/?d=x and <https://ok.example>'), 'see <https://evil.example/?d=x> and <https://ok.example>');
  const src = readFileSync(path.join(import.meta.dirname, '..', 'src', 'discord-gateway.ts'), 'utf8');
  assert.match(src, /MessageFlags\.SuppressEmbeds/);
});

test('2.11 a Discord yes means once, never always', () => {
  const sent: any[] = [];
  const link: any = Object.create(WsCoreLink.prototype);
  link.send = (o: any) => sent.push(o);
  link.permission('perm1', true);
  assert.deepEqual(sent[0], { t: 'permission.reply', id: 'perm1', choice: 'once' });
});

test('2.13 opening a program or a script asks every time, even after "open files"', async () => {
  const c = core('open files');
  assert.equal(await c.askPermission('mcp__aang__open', { what: path.join(home, 'Documents', 'notes.txt') }), true);
  for (const what of ['C:\\Users\\Shadow\\Downloads\\setup.exe', 'C:\\Users\\Shadow\\Downloads\\run.ps1', 'C:\\Users\\Shadow\\Downloads\\x.bat', 'C:\\Users\\Shadow\\Downloads\\a.lnk']) {
    assert.equal(await c.askPermission('mcp__aang__open', { what }), false, what);
  }
  c.memory.close();
});

test('2.19 his own tools may not read Aang\'s settings folder, where the Google token is', async () => {
  const state = process.env.AANG_STATE_DIR ?? path.join(process.env.APPDATA ?? path.join(home, 'AppData', 'Roaming'), 'Aang');
  assert.ok(offLimits(path.join(state, 'google.json')));
  const c = core('read files');
  assert.equal(await c.askPermission('Read', { file_path: path.join(state, 'google.json') }), false);
  assert.match(c.refused, /safety rule/);
  c.memory.close();
});
