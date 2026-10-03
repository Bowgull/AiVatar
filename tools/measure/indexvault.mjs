// Index Joshua's vault so Aang can find a note without anything having to load it.
//
//   node tools/measure/indexvault.mjs ["search terms"]
//
// With no argument it indexes. With one, it searches what is already indexed.
// Read-only against the vault. Costs GPU time, no quota.
import path from 'node:path';
import { Memory } from '../../src/Core/src/memory.ts';
import { indexVault, searchDocs, docCount } from '../../src/Core/src/docs.ts';
import { VAULT_DIR } from '../../src/Core/src/files.ts';

const dataDir = process.env.AANG_DATA_DIR
  ?? path.join(process.env.USERPROFILE ?? 'C:\\Users\\Shadow', 'Documents', 'Aang');
const force = process.argv.includes('--force');
const query = process.argv.slice(2).filter(a => a !== '--force').join(' ').trim();

const memory = new Memory(dataDir);
const db = memory.handle();
if (!db) { console.error('memory did not open'); process.exit(1); }

try {
  if (query) {
    const hits = await searchDocs(db, query, 8);
    console.log(`${docCount(db)} notes indexed. Searching for: ${JSON.stringify(query)}\n`);
    if (hits.length === 0) console.log('nothing matched.');
    for (const h of hits) {
      console.log(`${h.score.toFixed(3)}  [${h.how}]  ${h.title}`);
      console.log(`        ${path.relative(VAULT_DIR, h.path)}`);
      console.log(`        ${h.head.replace(/\n/g, ' ').slice(0, 150)}...`);
      console.log();
    }
  } else {
    console.log(`indexing ${VAULT_DIR}`);
    console.log(`already indexed: ${docCount(db)}\n`);
    const r = await indexVault(db, VAULT_DIR, (done, total) => {
      process.stdout.write(`\r  ${done} / ${total}   `);
    }, force);
    console.log(`\n\nseen ${r.seen}, added ${r.added}, updated ${r.updated}, skipped ${r.skipped}, failed ${r.failed}`);
    console.log(`took ${Math.round(r.ms / 1000)}s. ${docCount(db)} notes are now searchable.`);
  }
} finally {
  memory.close();
}
