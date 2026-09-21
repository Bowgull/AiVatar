// What Aang is allowed to do without asking again.
//
// Joshua's rule, in his words: "ask once per kind, then trust". Being asked the same question every time
// is what makes a permission prompt tiring, and a tiring prompt gets waved through without reading -
// which is worse than not asking at all.
//
// Kinds are deliberately coarse for opening things and narrow for running them. Saying yes to "open a
// folder" once is a small, reversible promise. Saying yes to "run anything in a shell" is not, so the
// shell is trusted one program at a time: agreeing to `git` says nothing about `rm`.
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { writeFileAtomic } from './atomic.ts';

export interface TrustRecord {
  kind: string;
  /** What he actually agreed to, kept so the list can be read back to him in his own terms. */
  example: string;
  since: string;
}

export class TrustStore {
  private readonly file: string;
  private data: Record<string, TrustRecord> = {};

  constructor(stateDir: string) {
    this.file = path.join(stateDir, 'trust.json');
    try {
      if (existsSync(this.file)) {
        const raw = JSON.parse(readFileSync(this.file, 'utf8'));
        if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
          for (const [k, v] of Object.entries(raw as Record<string, any>)) {
            if (v && typeof v.kind === 'string') this.data[k] = { kind: v.kind, example: String(v.example ?? ''), since: String(v.since ?? '') };
          }
        }
      }
    } catch { this.data = {}; }   // unreadable means trust nothing, which is the safe direction
  }

  private save(): void {
    try { writeFileAtomic(this.file, JSON.stringify(this.data, null, 2)); } catch { /* best effort */ }
  }

  allowed(kind: string): boolean { return kind in this.data; }

  allow(kind: string, example: string, now = new Date()): void {
    if (!kind || kind in this.data) return;
    this.data[kind] = { kind, example, since: now.toISOString().slice(0, 10) };
    this.save();
  }

  /** Everything he has agreed to, for the tray and for "what can you do without asking". */
  list(): TrustRecord[] { return Object.values(this.data).sort((a, b) => a.kind.localeCompare(b.kind)); }

  revoke(kind: string): boolean {
    if (!(kind in this.data)) return false;
    delete this.data[kind];
    this.save();
    return true;
  }

  revokeAll(): void { this.data = {}; this.save(); }
}

/** The first word of a shell command: the program being run, which is what gets trusted. */
export function programOf(command: string): string {
  const cleaned = (command ?? '').trim().replace(/^\s*cd\s+[^&]+&&\s*/i, '').trim();
  // A quoted path comes first and may contain spaces: "C:/Program Files/Git/bin/git.exe" is one token,
  // and splitting on whitespace made the trusted program "program".
  const quoted = cleaned.match(/^"([^"]+)"/) ?? cleaned.match(/^'([^']+)'/);
  const first = quoted ? quoted[1]! : (cleaned.split(/[\s|;&]+/)[0] ?? '');
  const base = first.split(/[\\/]/).pop() ?? '';
  return base.replace(/\.(exe|cmd|bat|ps1)$/i, '').toLowerCase();
}

/**
 * What kind of permission this call needs, and how to describe it to him. Returns null for anything that
 * must be asked every single time.
 */
export function kindOf(tool: string, input: Record<string, unknown>): { kind: string; says: string } | null {
  const s = (k: string) => typeof input?.[k] === 'string' ? String(input[k]) : '';
  switch (tool) {
    case 'Bash': case 'PowerShell': case 'mcp__aang__run': {
      const program = programOf(s('command'));
      if (!program) return null;
      // Things that delete or install are never trusted in advance, however often he says yes.
      if (/^(rm|del|rmdir|rd|format|diskpart|reg|shutdown|takeown|icacls|winget|choco|npm|pip|curl|wget)$/.test(program)) return null;
      return { kind: `run ${program}`, says: `run ${program} commands` };
    }
    case 'mcp__aang__open': {
      const what = s('what');
      if (/^https?:/i.test(what)) return { kind: 'open links', says: 'open links' };
      if (/[\\/]/.test(what)) return { kind: 'open files', says: 'open files and folders' };
      return { kind: 'open apps', says: 'open apps' };
    }
    case 'mcp__aang__read_clipboard': return { kind: 'read clipboard', says: 'read your clipboard' };
    case 'mcp__aang__read_window': return { kind: 'read windows', says: 'read what is in your windows' };
    case 'mcp__aang__look_at_window': return { kind: 'look at windows', says: 'take pictures of the window you are in' };
    case 'mcp__aang__start_claude': return { kind: 'start Claude sessions', says: 'start Claude sessions for you' };
    // Asked once, then trusted (his call, 2026-09-21). Every file change keeps the old version, so it can be undone.
    case 'mcp__aang__write_file': case 'mcp__aang__edit_file': case 'mcp__aang__undo_file_change':
      return { kind: 'write files', says: 'write and change files (I keep the old version so it can be undone)' };
    case 'mcp__aang__send_to_phone': return { kind: 'send to Discord', says: 'send files and pictures of your window to your Discord' };
    case 'mcp__aang__close_app': return { kind: 'close apps', says: 'close apps by asking them to close' };
    case 'mcp__aang__arrange_window': return { kind: 'arrange windows', says: 'move, minimise and maximise your windows' };
    case 'mcp__aang__media_key': return { kind: 'control media', says: 'press play, pause, next and the volume keys' };
    // mcp__aang__force_quit is deliberately absent: it destroys unsaved work, so it asks every single time.
    default: return null;
  }
}
