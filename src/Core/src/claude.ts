// Starting a Claude Code session for Joshua in the Claude desktop app, and following it.
//
// Aang does not do long jobs himself. Claude Code already does them well - the job hunt runs as a skill with
// Claude in Chrome - and Joshua works in the Claude desktop app's Code tab, where he sees artifacts, the
// browser and his sessions. So Aang opens a new session THERE, with the request already typed, and then
// follows it through the hook events Claude Code sends him, which fire in the desktop app the same as in a
// terminal (code.claude.com/docs/en/hooks: "the same hook events wherever it runs ... the Desktop app").
//
// The link is claude://code/new?q=<prompt>&folder=<folder> (support.claude.com, "Open Claude Desktop with a
// link"). It fills in the message; Joshua presses Enter. The app also asks him to confirm the folder the
// first time. Both are good: nothing applies to a job until he has seen the request go.
//
// An earlier version opened a terminal and ran the CLI there. That was the wrong place - Joshua said so
// ("when I say open Claude Code I mean THIS APP") - and the desktop app's own claude.exe is not even visible
// outside the app, which is a packaged Windows app with its own private view of AppData.
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export type JobKind = 'job hunt' | 'browse' | 'self' | 'task';
/** waiting: typed in, he has not pressed Enter yet. ended: the session closed, or a newer job took its folder. */
export type JobState = 'waiting' | 'working' | 'needs you' | 'done' | 'ended';

export interface Launched {
  /** What Joshua calls it: "job hunt". */
  name: string;
  kind?: JobKind;
  state?: JobState;
  /** The last thing he was told about it. */
  last?: string;
  updatedAt?: number;
  /** The folder the session works in - how its hook events are recognised, since the app picks the id. */
  cwd: string;
  /** The Claude session id, once its first hook event has said it. */
  sessionId: string | null;
  startedAt: number;
  /** He was already told this one has gone quiet - so it is said once, not every sweep. */
  staleNudged?: boolean;
}

/** Folders he names by what they are for. */
export function folderFor(where: string | undefined): string {
  const w = (where ?? '').trim();
  if (!w) return os.homedir();
  if (/job/i.test(w) && !/[\\/]/.test(w)) return path.join(os.homedir(), 'job-hunt-data');
  return path.isAbsolute(w) ? w : path.join(os.homedir(), w);
}

/** Aang's own code: where "add X to yourself" is worked on. */
export const AANG_REPO = path.join(os.homedir(), 'Documents', 'AangApp');

/**
 * What a kind of job means, written into the request so the session keeps to it. Browsing goes through Claude in
 * Chrome and asks before anything that commits him. A change to Aang himself is made on its own branch, tested,
 * and never merged by the session: Joshua reviews and merges it.
 */
export function frameJob(kind: JobKind, task: string, where?: string): { prompt: string; cwd: string } {
  const t = task.trim();
  if (kind === 'self') {
    return {
      cwd: AANG_REPO,
      prompt: `${t}\n\nThis is a change to Aang himself (this repo). Rules: work on a new git branch named aang/<a short name>, never on main, and do not merge it. ` +
        `Run npm test in src/Core, and dotnet build -c Release in src/Body if you change the Body, before you finish. ` +
        `Finish with what you changed, how you checked it, and the branch name, so Joshua can review and merge it himself.`,
    };
  }
  if (kind === 'browse') {
    return {
      cwd: folderFor(where),
      prompt: `${t}\n\nUse Claude in Chrome for the browsing. Ask me before you submit a form, buy or pay for anything, sign in, or post or send anything. ` +
        `Finish with a short summary of what you found or did, with links.`,
    };
  }
  return { cwd: folderFor(kind === 'job hunt' ? where || 'job hunt' : where), prompt: t };
}

/** What one hook event does to a job's state. */
export function nextState(ev: any, news: string | null, was: JobState): JobState {
  const name = String(ev?.hook_event_name ?? '');
  if (name === 'SessionEnd') return 'ended';
  if (news && /^Need input/.test(news)) return 'needs you';
  if (name === 'Stop') return 'done';
  if (name === 'UserPromptSubmit' || name === 'PreToolUse' || name === 'PostToolUse' || name === 'SessionStart') return 'working';
  return was;
}

/** The app link that opens a new Code session with the message typed in and the folder set. */
export function newSessionLink(prompt: string, folder: string): string {
  return `claude://code/new?q=${encodeURIComponent(prompt.slice(0, 12000))}&folder=${encodeURIComponent(folder)}`;
}

/** Open that link: Windows hands it to the Claude app, as a click on it would. */
export function openInClaude(prompt: string, opts: { name: string; cwd: string; now?: number }): Launched | { error: string } {
  try {
    // Windows' own "open this link" routine. explorer.exe was tried first and opened the Documents folder
    // instead of the Claude app; cmd's "start" would read the %20s in the link as variables.
    const child = spawn('rundll32.exe', ['url.dll,FileProtocolHandler', newSessionLink(prompt, opts.cwd)], { detached: true, stdio: 'ignore' });
    child.unref();
  } catch (e) { return { error: `Could not open the Claude app: ${(e as Error).message}` }; }
  return { name: opts.name, cwd: opts.cwd, sessionId: null, startedAt: opts.now ?? Date.now() };
}

const norm = (p: string) => path.resolve(String(p ?? '')).replace(/[\\/]+$/, '').toLowerCase();

/** Is this hook event from the session Aang opened? The folder, and after the first event the id, say so. */
export function isFrom(l: Launched, ev: any): boolean {
  const id = String(ev?.session_id ?? '');
  if (l.sessionId) return id === l.sessionId;
  return !!ev?.cwd && norm(ev.cwd) === norm(l.cwd);
}

/** The last thing Claude wrote in a session, from its transcript: its summary, or its question. */
export function lastAssistantText(transcriptPath: string): string {
  try {
    const lines = readFileSync(transcriptPath, 'utf8').trim().split(/\r?\n/);
    for (let i = lines.length - 1; i >= 0; i--) {
      let e: any; try { e = JSON.parse(lines[i]!); } catch { continue; }
      if (e?.type !== 'assistant') continue;
      const parts = Array.isArray(e.message?.content) ? e.message.content : [];
      const text = parts.filter((p: any) => p?.type === 'text').map((p: any) => String(p.text)).join('\n').trim();
      if (text) return text;
    }
  } catch { /* unreadable: say less rather than something wrong */ }
  return '';
}

/** Short enough for a bubble: the first few sentences, markdown stripped. */
export function brief(text: string, max = 320): string {
  // Underscores only where they are emphasis: inside a word they are a file name (job_pipeline.md).
  const plain = text.replace(/```[\s\S]*?```/g, ' ').replace(/[*`#>|]/g, '').replace(/(^|\s)_+|_+(?=\s|$|[.,;:!?])/g, '$1').replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/^\s*[-•]\s+/gm, '').replace(/\s+/g, ' ').trim();
  if (plain.length <= max) return plain;
  const cut = plain.slice(0, max);
  const end = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('? '), cut.lastIndexOf('! '));
  return (end > max * 0.5 ? cut.slice(0, end + 1) : cut.replace(/\s+\S*$/, '') + '...').trim();
}

/** Does the last message ask Joshua something he has to answer before it can go on? */
export function asksSomething(text: string): boolean {
  const t = text.trim();
  if (!t) return false;
  const tail = t.slice(-300);
  return /\?\s*$/.test(t) || /\b(should I|do you want|want me to|shall I|which (one|of)|let me know|confirm|approve|reply with)\b/i.test(tail);
}

/** The Claude app's window title, which a click on "Claude" brings forward. */
export const CLAUDE_WINDOW = 'Claude';

/** What to tell Joshua about the session, from one hook event. */
export function newsFor(l: Launched, ev: any): string | null {
  const name = String(ev?.hook_event_name ?? '');
  const where = `the ${l.name}`;
  if (name === 'Notification') {
    // Claude Code's own wording ("Claude needs your permission to use X") repeats the app's name; say what
    // it is waiting for in his terms instead.
    const why = String(ev?.message ?? '').trim()
      .replace(/^Claude needs your permission to use\s+/i, 'It wants permission to use ')
      .replace(/^Claude is waiting for your input\.?$/i, 'It is waiting for your answer.');
    return `Need input in Claude on ${where}.${why ? ' ' + brief(why, 140) : ''}`;
  }
  if (name === 'Stop') {
    const said = typeof ev?.transcript_path === 'string' ? lastAssistantText(ev.transcript_path) : '';
    if (asksSomething(said)) return `Need input in Claude on ${where}: ${brief(said, 260)}`;
    return said ? `${cap(l.name)} done. ${brief(said)} Details in Claude.` : `${cap(l.name)} finished. Details in Claude.`;
  }
  return null;
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
