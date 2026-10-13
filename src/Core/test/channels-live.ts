// Read-only look at his Discord server through the Mac front desk: every channel, its group and kind. Changes nothing.
// Run by hand: node --no-warnings test/channels-live.ts
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { FrontDeskGateway } from '../src/frontdesk-link.ts';
const dir = path.join(process.env.APPDATA ?? '', 'Aang');
const c = JSON.parse(readFileSync(path.join(dir, 'frontdesk.json'), 'utf8'));
const fd = new FrontDeskGateway({ url: `ws://${c.mac}:${c.port}`, key: readFileSync(path.join(dir, 'frontdesk.key'), 'utf8').trim(), log: () => {} });
const t = setTimeout(() => { console.log('no answer'); process.exit(1); }, 20000);
await fd.ready;
const all = await fd.channelList();
const cats = new Map(all.filter(x => x.kind === 'category').map(x => [x.id, x.name]));
for (const x of all.filter(x => x.kind !== 'category').sort((a, b) => String(cats.get(a.parentId ?? '')).localeCompare(String(cats.get(b.parentId ?? ''))))) {
  console.log(`${String(cats.get(x.parentId ?? '') ?? '(none)').padEnd(12)} ${x.kind.padEnd(6)} ${x.id} ${x.name}${x.tags ? '  tags: ' + x.tags.join(', ') : ''}`);
}
clearTimeout(t); fd.close(); process.exit(0);
