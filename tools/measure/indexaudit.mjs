// Confirm or deny, against the real database and the real files. No opinions.
//
// Four claims to test:
//   1. 1,077 of 1,188 notes are session transcripts
//   2. the real hand-written corpus is ~111 notes and under a megabyte
//   3. the search index covers ~0.33% of the text
//   4. transcripts crowd real notes out of search results
import path from 'node:path';
import { Memory } from '../../src/Core/src/memory.ts';
import { searchDocs } from '../../src/Core/src/docs.ts';

const dataDir = path.join(process.env.USERPROFILE ?? 'C:\\Users\\Shadow', 'Documents', 'Aang');
const memory = new Memory(dataDir);
const db = memory.handle();
if (!db) { console.error('memory did not open'); process.exit(1); }

const q = (sql, ...a) => db.prepare(sql).get(...a);
const all = (sql, ...a) => db.prepare(sql).all(...a);

// --- 1 and 2: what is actually in there
const total = q('SELECT count(*) c, sum(bytes) b FROM docs');
const handoff = q("SELECT count(*) c, sum(bytes) b FROM docs WHERE path LIKE '%Handoff%' OR path LIKE '%Session History%' OR path LIKE '%archive-90%'");
const real = q("SELECT count(*) c, sum(bytes) b FROM docs WHERE NOT (path LIKE '%Handoff%' OR path LIKE '%Session History%' OR path LIKE '%archive-90%')");
const mb = n => (Number(n || 0) / 1048576).toFixed(2) + ' MB';

console.log('CLAIM 1+2: what the corpus is');
console.log(`  all notes      : ${total.c}  ${mb(total.b)}`);
console.log(`  transcripts    : ${handoff.c}  ${mb(handoff.b)}   (${(handoff.c / total.c * 100).toFixed(1)}% of notes, ${(handoff.b / total.b * 100).toFixed(1)}% of bytes)`);
console.log(`  his own notes  : ${real.c}  ${mb(real.b)}`);

// --- 3: how much of the text is actually indexed
const heads = q('SELECT sum(length(head)) h FROM docs');
console.log('\nCLAIM 3: index coverage');
console.log(`  indexed text   : ${mb(heads.h)} of ${mb(total.b)}  = ${(heads.h / total.b * 100).toFixed(2)}%`);
const realHeads = q("SELECT sum(length(head)) h FROM docs WHERE NOT (path LIKE '%Handoff%' OR path LIKE '%Session History%' OR path LIKE '%archive-90%')");
console.log(`  of HIS notes   : ${mb(realHeads.h)} of ${mb(real.b)}  = ${(realHeads.h / real.b * 100).toFixed(1)}%`);

// --- 4: do transcripts crowd out real notes
const isTranscript = p => /Handoff|Session History|archive-90/.test(p);
const queries = [
  'what did I decide about the interaction model',
  'anti drift law',
  'how should the UI look',
  'vector database',
  'job hunt',
  'what are my projects',
];
console.log('\nCLAIM 4: do transcripts crowd out real notes in the top 8?');
let crowded = 0;
for (const query of queries) {
  const hits = await searchDocs(db, query, 8);
  const t = hits.filter(h => isTranscript(h.path)).length;
  if (t > hits.length / 2) crowded++;
  console.log(`  ${String(t).padStart(2)}/${hits.length} transcripts  ${query}`);
  const top = hits[0];
  if (top) console.log(`        top: ${isTranscript(top.path) ? '[transcript]' : '[his note] '} ${top.title.slice(0, 64)}`);
}
console.log(`\n  majority-transcript results in ${crowded} of ${queries.length} queries`);

// --- how near-duplicate are the transcripts really
const sample = all("SELECT head FROM docs WHERE path LIKE '%Handoff%' LIMIT 200");
const words = s => new Set(String(s).toLowerCase().split(/\W+/).filter(w => w.length > 3));
let pairs = 0, sum = 0;
for (let i = 0; i < sample.length; i += 7) {
  for (let j = i + 1; j < Math.min(i + 8, sample.length); j++) {
    const a = words(sample[i].head), b = words(sample[j].head);
    const inter = [...a].filter(w => b.has(w)).length;
    const union = new Set([...a, ...b]).size;
    if (union) { sum += inter / union; pairs++; }
  }
}
console.log(`\n  transcript word overlap (sampled ${pairs} pairs): ${(sum / pairs * 100).toFixed(1)}% average`);

memory.close();
