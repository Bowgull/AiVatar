// Write Aang's notes into Joshua's vault, from his real memory.
//
//   node tools/measure/writevault.mjs
//
// Whole files, every time. Safe to run repeatedly; it cannot grow and cannot touch anything outside
// 10_Projects/Aang, because files.ts refuses.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { Memory } from '../../src/Core/src/memory.ts';
import { writeVaultNotes } from '../../src/Core/src/vault.ts';

const dataDir = process.env.AANG_DATA_DIR
  ?? path.join(process.env.USERPROFILE ?? 'C:\\Users\\Shadow', 'Documents', 'Aang');

// Pull the phase headings straight out of the plan, so this note cannot drift from it by hand.
function buildState() {
  const plan = path.join(path.dirname(new URL(import.meta.url).pathname.slice(1)), '..', '..', 'docs', 'AIVATAR-BUILD-PLAN-1.0.md');
  let text;
  try { text = readFileSync(plan, 'utf8'); } catch { return 'The build plan could not be read on this run.'; }

  const lines = [];
  let phase = '';
  for (const raw of text.split('\n')) {
    const p = /^#\s+(PHASE \d.*)$/.exec(raw.trim());
    if (p) { phase = p[1]; lines.push('', `### ${phase}`, ''); continue; }
    const s = /^###\s+`\[([ x~])\]`\s+(.+)$/.exec(raw.trim());
    if (s) {
      const mark = s[1] === 'x' ? 'x' : s[1] === '~' ? '/' : ' ';
      const title = s[2].replace(/\*\*/g, '').replace(/\s+DONE.*$/, '').replace(/\s+PASSED.*$/, '').trim();
      lines.push(`- [${mark}] ${title}`);
    }
  }
  const done = lines.filter(l => l.startsWith('- [x]')).length;
  const open = lines.filter(l => l.startsWith('- [ ]')).length;
  return [`**${done} done, ${open} still open.**`, ...lines].join('\n');
}

const memory = new Memory(dataDir);
try {
  const r = writeVaultNotes(memory, { buildState: buildState() });
  console.log(r.detail);
  for (const f of r.wrote) console.log('  ' + f);
} finally {
  memory.close();
}
