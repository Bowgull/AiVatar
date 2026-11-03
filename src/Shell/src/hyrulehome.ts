// Where the Hyrule map lives (2026-11-03, BG4): his Breath of the Wild map, Journal and the 80 squares of Hyrule, in a
// private folder of its own beside Aang's brain, never in Samara's code (Nintendo's art and his save are in it). The
// map's ship script puts it there. AANG_HYRULE_DIR points a test at a throwaway one.
import { existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/** The map's folder when it is there (with its page), else undefined: no folder, no Hyrule tab. */
export function hyruleHomeDir(): string | undefined {
  const dir = process.env.AANG_HYRULE_DIR || path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local'), 'Aang', 'Hyrule');
  return existsSync(path.join(dir, 'index.html')) ? dir : undefined;
}
