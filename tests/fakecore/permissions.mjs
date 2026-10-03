// What the permission bubble actually says, as cases.
//   node permissions.mjs      (no Core, no Body, no Claude: costs nothing)
//
// Joshua, 2026-10-03: "im just seeing gibberish... i need them to surface as boomer proof easy to
// understand langauge but still very briefly explain the conctep of what hes doing". A question nobody
// can read is not a safeguard - it teaches him to click the button to make it go away. So these check
// the wording, and in particular that the exact command SURVIVES into what he is shown: the plain
// summary is there to be understood, never to replace the thing he is actually approving.
import { describeCall } from '../../src/Core/src/tools.ts';
import { meansOf } from '../../src/Core/src/plain.ts';
import { kindOf, programOf } from '../../src/Core/src/trust.ts';

const results = [];
const check = (name, ok, detail = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  ' + detail : ''}`); };

// Written with String.fromCharCode(92) so no shell or editor can quietly eat the backslashes - the
// exact fault this file exists to catch. (2026-10-02: a regex was mangled this way and still compiled.)
const B = String.fromCharCode(92);
const DOCS = `C:${B}Users${B}Shadow${B}Documents`;

console.log('--- the category a command is filed under ---');
// PowerShell 5.1 has no &&, so every real command here is `cd somewhere; thing` - which used to be
// filed as "run cd", both meaningless and far too broad.
check('cd then git is filed as git, not cd', programOf(`cd ${DOCS}; git status`) === 'git', programOf(`cd ${DOCS}; git status`));
check('the && form still works', programOf(`cd ${DOCS} && git status`) === 'git');
check('two cds in a row are both stripped', programOf(`cd ${DOCS}; cd AangApp; git log`) === 'git');
check('a quoted path with spaces is stripped', programOf(`cd "${DOCS}${B}My Folder"; git diff`) === 'git');
check('a bare command is unaffected', programOf('git status') === 'git');

console.log('--- the button he clicks to trust it for ever ---');
check('git reads as English', kindOf('PowerShell', { command: 'git status' })?.says === 'use git, which keeps the history of your code');
check('listing reads as English', kindOf('PowerShell', { command: 'Get-ChildItem .' })?.says === 'list what is in your folders');
check('the category itself stays exact', kindOf('PowerShell', { command: 'git status' })?.kind === 'run git');
check('deleting is never trusted in advance', kindOf('PowerShell', { command: 'rm -rf x' }) === null);
check('force quitting is never trusted in advance', kindOf('PowerShell', { command: 'Stop-Process -Name chrome -Force' }) === null);
check('installing is never trusted in advance', kindOf('PowerShell', { command: 'winget install x' }) === null);

console.log('--- the question itself ---');
check('a known command says what it does', describeCall('PowerShell', { command: 'cd x; git status' }) === 'look at what has changed in your code');
check('an unknown command is NOT dressed up', describeCall('PowerShell', { command: 'Invoke-RestMethod https://x/y' }).startsWith('run this: '));
check('a destructive one says so first', describeCall('PowerShell', { command: 'Stop-Process -Name chrome' }).includes('losing anything unsaved'));

console.log('--- the explanation underneath ---');
const m = meansOf('PowerShell', { command: `cd ${DOCS}; git status --short` });
check('it explains what a command even is', m.includes('typed straight to your computer'));
check('it carries the exact command', m.includes('git status --short'), m);
check('it drops the cd scaffolding from the exact text', !m.includes('cd ' + DOCS));
const unknown = meansOf('PowerShell', { command: 'Invoke-RestMethod https://x/y' });
check('an unrecognised command says so rather than bluffing', unknown.includes('I do not recognise this one'));

// The one that matters most: a path must survive intact, or he is approving something he cannot see.
const mv = meansOf('mcp__aang__run', { command: `Get-Content "${DOCS}${B}notes.txt"` });
check('a Windows path keeps its backslashes', mv.includes(`${DOCS}${B}notes.txt`), mv);

console.log('--- plain concepts for the non-command tools ---');
for (const [tool, want] of [
  ['mcp__aang__read_clipboard', 'might be a password'],
  ['mcp__aang__delete_file', '30 days'],
  ['mcp__aang__look_at_window', 'picture of your screen'],
  ['mcp__aang__mail_send', 'cannot be called back'],
  ['mcp__aang__mail_inbox', 'never send an email on my own'],
  ['Read', 'cannot change it'],
]) check(`${tool} explains the idea`, meansOf(tool, {}).includes(want), meansOf(tool, {}));

check('the delete question does not repeat its own explanation',
  !describeCall('mcp__aang__delete_file', { path: 'x.txt' }).includes('30 days'));

console.log(`\n${results.filter(Boolean).length}/${results.length} permission-wording checks passed`);
process.exit(results.every(Boolean) ? 0 : 1);
