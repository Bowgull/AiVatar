// Where Aang's brain starts (the pet runs this file, src/Body/CoreSupervisor.cs). On the PC (2026-11-01): the brain from
// its installed release when there is one (pcbrain.ts), so the code folder Claude works in never runs as the real
// Aang, as on the Mac. Everywhere else, with AANG_BRAIN_HERE=1, or before the first release is in: this folder's brain.ts.
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const here = path.resolve(import.meta.dirname, '..');
let started = false;
if (process.platform === 'win32' && !process.env.AANG_BRAIN_HERE) {
  const pc = await import('./pcbrain.ts');
  const root = pc.brainRoot();
  // Only from the code folder: an installed brain's own index.ts is never what the pet runs.
  const b = root && !here.toLowerCase().startsWith(path.join(root, 'versions').toLowerCase()) ? pc.pick(root) : null;
  if (b) {
    process.env.AANG_CODE_DIR ||= path.resolve(here, '..', '..');
    process.env.AANG_BRAIN_VERSION = b.version;
    console.log(`brain: running ${b.version} from its installed release`);
    await import(pathToFileURL(path.join(b.dir, 'src', 'brain.ts')).href);
    started = true;
  }
}
if (!started) await import('./brain.ts');
