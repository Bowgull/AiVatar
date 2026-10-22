// Samara's taskbar right-click list (his ask, 2026-10-21: "my Samara app itself has no right click options on the
// taskbar icon, let's get a few").
//
// How it reaches SAMARA's button, not Aang's: Windows keeps one jump list per app id. This process's own id is 'Aang'
// (main.ts), while Samara's windows wear their own id, 'Aang.Samara' (browser.ts setAppDetails), so they get their own
// taskbar button. Electron writes the jump list for whatever the process id is at that moment, so main.ts switches the
// id to 'Aang.Samara' just long enough to write it, then straight back: Aang's windows and everything else keep 'Aang'.
// Windows keeps the list after Samara closes, so it is written once per start.
//
// Each item starts this same Shell again (the same engine, the same main.ts) with one --samara-task=... argument. A Shell
// already running gets it through the single-instance lock ('second-instance') and the copy just started steps aside; with
// no Shell running, the new one IS Samara, on its own, without Aang (like the Samara shortcut). Only the names below
// (five of Samara's, six pop-out ones) are ever acted on; anything else on the command line is ignored.
import path from 'node:path';
import { NEEDS_AANG, POPOUT_TASKS, type PopoutTask } from './taskbarplan.ts';

// Sheet 66 A (2026-10-22): a "Pop-outs" section above the Tasks (Show all, Hide all, Gather them by Aang, New note,
// Timer, Music player). Same door: main.ts hands these six to taskbar.ts instead of the browser.
export const SAMARA_TASKS = ['new-tab', 'new-window', 'mockups', 'settings', 'reopen', ...POPOUT_TASKS] as const;
export type SamaraTask = typeof SAMARA_TASKS[number];
const FLAG = '--samara-task=';

/** One of the five, or null. The only door: every other spelling, case or extra text is refused. */
export function samaraTask(x: unknown): SamaraTask | null {
  return typeof x === 'string' && (SAMARA_TASKS as readonly string[]).includes(x) ? x as SamaraTask : null;
}

/** The task on a command line: exactly one --samara-task=<name>. Two of them (or a bad name) and nothing happens. */
export function taskFromArgv(argv: unknown): SamaraTask | null {
  if (!Array.isArray(argv)) return null;
  const hits = argv.filter((a): a is string => typeof a === 'string' && a.startsWith(FLAG));
  return hits.length === 1 ? samaraTask(hits[0]!.slice(FLAG.length)) : null;
}

/** What the copy that steps aside hands over with the lock (cleaner than the raw command line, which Chromium may add to). */
export function taskFromLockData(data: unknown): SamaraTask | null {
  return data && typeof data === 'object' ? samaraTask((data as { samaraTask?: unknown }).samaraTask) : null;
}

const WORDS: Record<SamaraTask, [string, string]> = {
  'new-tab': ['New tab', 'Open a new tab in Samara'],
  'new-window': ['New window', 'Open a new Samara window'],
  'reopen': ['Reopen closed tab', 'Bring back the tab you just closed'],
  'mockups': ['Mockups', "Open the MOCKUPS trail, Claude's mockups"],
  'settings': ['Settings', "Samara's settings"],
  'popouts-show': ['Show all pop-outs', 'Bring every pop-out back on screen'],
  'popouts-hide': ['Hide all pop-outs', 'Put every pop-out away (Show all brings them back)'],
  'popouts-gather': ['Gather them by Aang', 'Snap every pop-out together next to Aang'],
  'new-note': ['New note', 'A new note, small and ready to type'],
  'timer': ['Timer', 'Set a timer'],
  'player': ['Music player', 'Open the music player'],
};

/** The pop-outs part: whether Aang runs (New note, Timer, Music need him), the icon file for each, and what he took off. */
export interface PopoutsSection { aang: boolean; icons: Partial<Record<PopoutTask, string>>; removed?: (args: string) => boolean }

/** The list itself: Pop-outs (when given), then Tasks, in the order he reads them. Exported for its test. */
export function jumpList(o: { exe: string; main: string; dir: string; icon: string; popouts?: PopoutsSection }): Electron.JumpListCategory[] {
  const item = (t: SamaraTask, icon = o.icon) => ({
    type: 'task' as const, title: WORDS[t][0], description: WORDS[t][1],
    program: o.exe, args: `"${o.main}" ${FLAG}${t}`, workingDirectory: o.dir,
    iconPath: icon, iconIndex: 0,
  });
  const order: SamaraTask[] = ['new-tab', 'new-window', 'reopen', 'mockups', 'settings'];
  const out: Electron.JumpListCategory[] = [];
  const p = o.popouts;
  if (p) {
    // An item he removed from the list can't be put back (Windows refuses the whole list), so it is left out.
    const items = POPOUT_TASKS.filter((t) => p.aang || !NEEDS_AANG.has(t)).map((t) => item(t, p.icons[t] || o.icon)).filter((i) => !p.removed?.(i.args));
    if (items.length) out.push({ type: 'custom', name: 'Pop-outs', items });
  }
  out.push({ type: 'tasks', items: order.map((t) => item(t)) });
  return out;
}

/** Write it under Samara's id. Never throws: a missing list must not stop Samara. Returns Electron's word for how it went. */
export function writeSamaraJumpList(app: Electron.App, o: { main: string; dir: string; icon: string; ownId: string; popouts?: Omit<PopoutsSection, 'removed'> }): string {
  if (process.platform !== 'win32') return 'not windows';
  try {
    app.setAppUserModelId('Aang.Samara');
    let removed: PopoutsSection['removed'];
    try { const r = app.getJumpListSettings().removedItems ?? []; removed = (args) => r.some((x) => x.args === args); } catch { /* none known */ }
    return String(app.setJumpList(jumpList({ exe: process.execPath, main: o.main, dir: o.dir, icon: o.icon, popouts: o.popouts ? { ...o.popouts, removed } : undefined })));
  } catch (e) { return 'error: ' + (e as Error).message; }
  finally { try { app.setAppUserModelId(o.ownId); } catch { /* keeps Samara's: harmless */ } }
}

export const SAMARA_JUMP_ICON = path.join(import.meta.dirname, '..', 'pages', 'art', 'samara', 'samara-open.ico');
