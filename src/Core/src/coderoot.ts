// His code folder (AangApp), for the few things the brain finds there: git, the mockup folders, the screen reader and
// whisper. On the PC the brain runs from its installed release (pcbrain.ts), and index.ts says where the code folder
// is before that brain loads; run from the code folder, it is three up from here.
import path from 'node:path';

export const CODE_ROOT = process.env.AANG_CODE_DIR || path.resolve(import.meta.dirname, '..', '..', '..');
