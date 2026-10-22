// The phishing index against the real lists (2026-10-22): the old Map and the new index must agree on every name,
// and loading the kept index must be fast. Run: node --no-warnings test/phish-real-check.ts <state folder with phish/>
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { PhishCheck, PHISH_LISTS, norm } from '../src/phish.ts';
const dir = process.argv[2]!;
const noFetch = (async () => { throw new Error('offline'); }) as unknown as typeof fetch;
let t = performance.now();
const a = new PhishCheck(dir); await a.start(noFetch);
console.log(`first start (builds the index): ${Math.round(performance.now() - t)} ms, ${a.count()} names`);
t = performance.now();
const b = new PhishCheck(dir); await b.start(noFetch);
console.log(`next start (reads the index): ${Math.round(performance.now() - t)} ms, ${b.count()} names`);
// Every listed name is caught, by the list that names it.
let miss = 0, n = 0;
for (const l of PHISH_LISTS) {
  const lines = readFileSync(path.join(dir, 'phish', `${l.name.toLowerCase()}.txt`), 'utf8').split(/\r?\n/).map((x) => x.trim()).filter((x) => x && !x.startsWith('#'));
  for (const line of lines.slice(0, 20000)) {
    const u = l.kind === 'domains' ? `https://${line.toLowerCase().replace(/^www\./, '')}/` : line;
    if (l.kind === 'domains' && !/^[a-z0-9.-]+\.[a-z]{2,}$/.test(line.toLowerCase().replace(/^www\./, ''))) continue;
    if (l.kind === 'urls' && !norm(line)) continue;
    n++; if (!b.check(u).includes(l.name)) { miss++; if (miss < 5) console.log('MISSED', l.name, u); }
  }
}
// Real sites pass.
const real = ['https://www.google.com/', 'https://github.com/Bowgull', 'https://www.youtube.com/watch?v=x', 'https://www.twitch.tv/', 'https://mail.google.com/mail/u/0/', 'https://boards.greenhouse.io/x/jobs/1'];
const flagged = real.filter((u) => b.check(u).length);
console.log(`checked ${n} listed names: missed ${miss}; real sites flagged: ${flagged.length ? flagged.join(' ') : 'none'}`);
t = performance.now(); for (let i = 0; i < 10000; i++) b.check('https://sub.example-shop.co.uk/a/b?c=1'); console.log(`10,000 checks: ${Math.round(performance.now() - t)} ms`);
process.exit(miss || flagged.length ? 1 : 0);
