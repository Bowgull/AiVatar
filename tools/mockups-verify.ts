// Opens every version in a mockups history (mockups.json) from its page server, the way the trail does, and every file
// its page links (its helper folder, its art), and says which do not open. Read only.
//   node tools/mockups-verify.ts <mockups.json>
import { readFileSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { MockServer, srcOf, sheetKind, type MockVersion } from '../src/Shell/src/mockups.ts';
import { artOf, linksIn } from '../src/Shell/src/mockhome.ts';
import { isSamaraRepo } from '../src/Shell/src/mockfiling.ts';

const j = JSON.parse(readFileSync(process.argv[2]!, 'utf8'));
const repos: Record<string, string> = j.repos ?? {};
const srv = new MockServer('', (n) => repos[n] ?? null);
const home = repos.mockups;
const samara = Object.entries(repos).filter(([n]) => isSamaraRepo(n)).map(([, d]) => d);
// The same order as Samara's own (browser.ts mockArt): the art at the commit it was shown with, else as it is now.
srv.art = async (commit, rel) => {
  const at = home ? await artOf(home, commit) : '';
  for (const d of samara) { try { if (at) return execFileSync('git', ['-C', d, 'cat-file', 'blob', `${at}:${rel}`], { stdio: ['ignore', 'pipe', 'ignore'] }); } catch { /* not there */ } }
  for (const d of samara) { try { const f = path.join(d, rel); if (statSync(f).isFile()) return readFileSync(f); } catch { /* not there */ } }
  return null;
};
await srv.start();
let ok = 0, bad = 0, links = 0, missing = 0;
const misses: string[] = [];
for (const v of j.versions as MockVersion[]) {
  if (sheetKind(srcOf(v)) === 'live') { bad++; misses.push(`LIVE ${v.title} ${srcOf(v)}`); continue; }
  const url = srv.url(v.commit, srcOf(v));
  const r = await fetch(url);
  if (!r.ok) { bad++; misses.push(`PAGE ${r.status} ${v.title} ${srcOf(v)} @${v.commit.slice(0, 8)}`); continue; }
  ok++;
  for (const u of linksIn(await r.text())) {
    if (u.includes('..') && !/^(\.\.\/)+/.test(u)) continue;
    links++;
    const x = await fetch(new URL(u, url)).catch(() => null);
    if (!x?.ok) { missing++; misses.push(`  link ${x?.status} ${v.title}: ${u}`); }
  }
}
srv.close();
console.log(`${ok} of ${ok + bad} versions open; ${links - missing} of ${links} linked files open`);
console.log(misses.slice(0, 60).join('\n'));
