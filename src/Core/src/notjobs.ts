// Sessions that are never Joshua's jobs (2026-10-22). A bench (test/leakbench.ts) ran real Claude sessions inside
// src/Core while his brain was up; the aang-link mod loads in every Claude Code session, so one of its questions
// ("how many legs does a spider have") landed in his jobs list as a finished "Core" card.
//
// The source fix is in lane.ts: every Lane (Aang's own and every test's) runs with AANG_LINK_OFF=1, which turns the
// mod inert. This is the brain's second wall, by folder, for any hook or link event that still arrives:
//   - Aang's own lane folder (.aang-self) and a test's own (.aang-test);
//   - anything inside AangApp's test folder (src/Core/test);
//   - anything inside a temp folder (tests make their scratch folders there).
// AangApp itself, and src/Core, stay his: he works in them. Mirrored in claude-link/hooks/link.ts (notHisCwd).
import os from 'node:os';

const NOT_HIS = [
  /[\\/]\.aang-(self|test)([\\/]|$)/i,
  /[\\/]src[\\/]Core[\\/]test([\\/]|$)/i,
  /[\\/]AppData[\\/]Local[\\/]Temp([\\/]|$)/i,
  // The Mac's temp folders (2026-10-28): /tmp is /private/tmp there, and each app's own is under /var/folders. Three
  // test runs in /private/tmp left a "done" mark on his head for an hour.
  /^\/(private\/)?tmp(\/|$)/,
  /^\/(private\/)?var\/folders\//,
];

const norm = (p: string) => p.replace(/\//g, '\\').replace(/\\+$/, '').toLowerCase();

/** True when a session in this folder is a test, a bench or Aang talking to himself, never one of his jobs. */
export function notHisCwd(cwd: unknown, selfCwd = '', tmp = os.tmpdir()): boolean {
  const c = typeof cwd === 'string' ? cwd.trim() : '';
  if (!c) return false;
  if (selfCwd && norm(c) === norm(selfCwd)) return true;
  if (NOT_HIS.some(r => r.test(c))) return true;
  const t = tmp ? norm(tmp) : '';
  return !!t && (norm(c) === t || norm(c).startsWith(t + '\\'));
}
