// The key that puts the pop-out away and brings it back, without stopping the video.
//
// Sheet 4, section 4, way 5. Default Ctrl+Shift+V, and he can change it.
//
// Registered by the Shell rather than the C# window, because the Shell is what owns the pop-out, and a
// key that works only when the pet happens to be alive would be worse than no key. A key Windows will
// not give us is reported rather than failing silently: the usual reason is that something else
// already has it, and in a game that is easy to do by accident.
import { globalShortcut } from 'electron';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

/** Sheet 4 shows Ctrl, Shift, V. Chosen to be unlikely to clash with anything in WoW. */
export const DEFAULT_HOTKEY = 'Control+Shift+V';

export const hotkeyFile = (stateDir: string) => path.join(stateDir, 'popout-hotkey.json');

/** What he has chosen, or the default. */
export function chosenHotkey(stateDir: string): string {
  try {
    const f = hotkeyFile(stateDir);
    if (!existsSync(f)) return DEFAULT_HOTKEY;
    const k = String(JSON.parse(readFileSync(f, 'utf8')).hotkey ?? '').trim();
    return k || DEFAULT_HOTKEY;
  } catch { return DEFAULT_HOTKEY; }
}

export interface Hotkey {
  /** What is actually registered, or null if Windows refused every attempt. */
  active: string | null;
  release(): void;
}

/**
 * Register the key, falling back to the default if his choice is taken.
 *
 * Returns what ended up registered so the caller can say so, rather than leaving him pressing a key
 * that does nothing and wondering which part is broken.
 */
export function holdHotkey(stateDir: string, onPress: () => void): Hotkey {
  const wanted = chosenHotkey(stateDir);
  const tries = wanted === DEFAULT_HOTKEY ? [wanted] : [wanted, DEFAULT_HOTKEY];

  for (const key of tries) {
    try {
      if (globalShortcut.register(key, onPress)) {
        if (key !== wanted) console.error(`shell: ${wanted} is taken by something else, so the pop-out key is ${key}`);
        return { active: key, release: () => { try { globalShortcut.unregister(key); } catch { /* already gone */ } } };
      }
    } catch (e) {
      console.error(`shell: ${key} is not a key Windows understands: ${(e as Error).message}`);
    }
  }

  console.error(`shell: could not take ${tries.join(' or ')}, so the pop-out has no hotkey. Something else is holding it.`);
  return { active: null, release: () => { /* nothing was taken */ } };
}
