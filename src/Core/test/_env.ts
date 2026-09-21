// Imported first by tests that change files: sends the undo copies and the trash to throwaway folders, so a test
// never writes into Joshua's real %LOCALAPPDATA%\Aang. (Not a test itself: node --test only runs *.test.ts.)
import { mkdtempSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

process.env.AANG_UNDO_DIR ??= mkdtempSync(path.join(os.tmpdir(), 'aang-undo-'));
process.env.AANG_TRASH_DIR ??= mkdtempSync(path.join(os.tmpdir(), 'aang-trash-'));
