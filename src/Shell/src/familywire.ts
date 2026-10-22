// The window family, plugged in (2026-10-22). main.ts makes the pop-out, the note and timer windows and the Claude job
// pop-outs as before and calls wireFamily once; from then on each of them registers its windows with the family and
// hands it their drag. Kept in its own file so main.ts gains one line, not a section.
import { FamilyHost } from './familywin.ts';
import type { Popout } from './popout.ts';
import type { NoteWindows } from './notewin.ts';
import type { TimerWindows } from './timerwin.ts';
import type { JobPops } from './jobpop.ts';
import type { PinSnips } from './pinsnip.ts';

export function wireFamily(o: {
  origin: string;
  iconPath?: string;
  popout?: Popout | null;
  notes?: NoteWindows | null;
  timers?: TimerWindows | null;
  jobs?: JobPops | null;
  /** Pinned snips (sheet 62), a member since part 2: they keep their picture's shape when they join a side. */
  snips?: PinSnips | null;
  /** F5: where the group layouts are kept (default: family-layout.json in the Shell's user data). */
  saveFile?: string | null;
}): FamilyHost {
  const host = new FamilyHost({ origin: o.origin, iconPath: o.iconPath, saveFile: o.saveFile === undefined ? FamilyHost.defaultSaveFile() : o.saveFile });
  if (o.notes) o.notes.family = host;
  if (o.timers) o.timers.family = host;
  if (o.jobs) o.jobs.family = host;
  if (o.snips) o.snips.family = host;
  if (o.popout) { o.popout.family = host; o.popout.joinFamily(); }
  // Made now, hidden, so the first right-click on a joined window opens the menu at once.
  host.overlay.warm();
  return host;
}
