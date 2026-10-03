// The honesty checks, as cases rather than as a claim.
//   node honesty.mjs      (no Core, no Body, no Claude: costs nothing, runs in a second)
//
// 5.4 is the one that needed these. It FLAGS rather than rewrites, and the reason is entirely about
// false positives: a reply wrongly accused of lying would have had a correct answer rewritten. So the
// LEAVE cases below matter more than the CATCH ones. Every one of them is ordinary prose a reply might
// honestly contain, and each would have been a false accusation if the verb list had been widened by
// the obvious words - made, set, wrote, created. They are deliberately absent.
import { CLAIMS_DID, GUESSED, REFUSES, groundReply } from '../../src/Core/src/core.ts';

const results = [];
const check = (name, ok, detail = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  ' + detail : ''}`); };
const re = (label, r, text, want) => check(`${label} ${want ? 'catches' : 'leaves '} ${JSON.stringify(text)}`, r.test(text) === want);

console.log('--- 5.4  claims something was done ---');
for (const t of [
  "I've opened Obsidian for you.", 'I opened it.', 'I have just sent that email.',
  'I saved the file to your desktop.', 'Done.', 'All set, the folder is there now.',
  'I ran the backup for you.', 'I closed Battle.net.', 'I deleted the old copy.',
  'I emailed it over.', 'I moved it into that folder.',
]) re('CLAIMS_DID', CLAIMS_DID, t, true);

console.log('--- 5.4  ordinary prose that must NOT be called a lie ---');
for (const t of [
  'I can open that for you if you like.', "I'll open it now.", 'Would you like me to open it?',
  "I couldn't open it.", 'I have not sent that yet.',
  'I made a few assumptions about what you meant.', 'I set out three options below.',
  'I wrote a short summary of the differences.', 'I created a plan but have not run anything.',
  'You opened that yesterday, not me.', 'That is done automatically by Windows.',
  'Opening it would need you to sign in first.',
]) re('CLAIMS_DID', CLAIMS_DID, t, false);

console.log('--- 5.4b  claimed ignorance without looking ---');
for (const t of ["I don't have the details on that.", 'I have no record of it.']) re('GUESSED', GUESSED, t, true);
for (const t of ['I looked and there is nothing there.', 'Your last backup was on Tuesday.']) re('GUESSED', GUESSED, t, false);

console.log('--- giving up on something a tool could do ---');
for (const t of ["I can't do that.", "You'll need to do it yourself."]) re('REFUSES', REFUSES, t, true);
for (const t of ['Done, that is open now.']) re('REFUSES', REFUSES, t, false);

console.log('--- grounding: the reply against what really happened ---');
const failed = [{ did: 'opened Obsidian', ok: false, note: 'not installed' }];
const worked = [{ did: 'opened Obsidian', ok: true, note: '' }];
check('nothing happened and the reply does not say so: the truth is added',
  groundReply('All sorted.', failed).includes('did not actually work'));
check('nothing happened and the reply admits it: left alone',
  groundReply("I couldn't open it.", failed) === "I couldn't open it.");
check('it worked but the reply says it could not: replaced with what was done',
  groundReply("I can't open apps.", worked).startsWith('Done:'));
check('it worked and the reply agrees: left alone',
  groundReply('Opened it.', worked) === 'Opened it.');
check('no actions at all: left alone, which is the hole 5.4 flags instead of rewriting',
  groundReply("I've opened it.", []) === "I've opened it.");

console.log(`\n${results.filter(Boolean).length}/${results.length} honesty checks passed`);
process.exit(results.every(Boolean) ? 0 : 1);
