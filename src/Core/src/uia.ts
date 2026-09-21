// Acting inside other apps by control name (press "Save", fill the "Search" field), through UI Automation.
//
// The Windows side is AangReader.exe --act (src/Reader/Act.cs), its own process for the same reason the screen
// reader is: another app's accessibility code can hang or crash. This file runs it, and holds the rules that decide
// whether Joshua is asked, because those are the safety of the whole thing:
//   - asked once per APP the first time ("act in notepad"), then trusted for that app only;
//   - asked EVERY time for anything that cannot be taken back (Send, Pay, Delete, Submit, Sign in, Yes, OK...), and for
//     every control in a web browser, because a web page chooses what its buttons are called;
//   - a password field is never filled, in any app, whatever he says.
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { READER } from './screen.ts';

export interface Control { i: number; name: string; type: string; password: boolean; enabled: boolean }
export interface ActReply {
  ok: boolean;
  window?: { title: string; process: string };
  matches?: Control[];
  total?: number;
  done?: boolean;
  detail?: string | null;
  error?: string | null;
}
export interface ActArgs { app: string; do: 'find' | 'press' | 'fill'; name?: string; index?: number; text?: string }
export type ActRunner = (a: ActArgs) => Promise<ActReply>;

/** Run the reader in act mode and return its one JSON line. Never throws: a failure is an answer. */
export const runAct: ActRunner = a => new Promise(resolve => {
  if (!existsSync(READER)) return resolve({ ok: false, error: 'the window reader is not built' });
  const args = ['--act', '--app', a.app, '--do', a.do];
  if (a.name) args.push('--name', a.name);
  if (a.index !== undefined && a.index >= 0) args.push('--index', String(a.index));
  if (a.text !== undefined) args.push('--text-b64', Buffer.from(a.text, 'utf8').toString('base64'));
  let out = '';
  const child = spawn(READER, args, { windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] });
  const kill = setTimeout(() => { try { child.kill(); } catch { /* gone */ } }, 6000);
  kill.unref?.();
  child.stdout.on('data', d => { out += d; });
  child.on('error', e => { clearTimeout(kill); resolve({ ok: false, error: e.message }); });
  child.on('close', () => {
    clearTimeout(kill);
    const line = out.split(/\r?\n/).map(l => l.trim()).filter(l => l.startsWith('{')).at(-1);
    try { resolve(line ? JSON.parse(line) as ActReply : { ok: false, error: 'that app did not answer' }); }
    catch { resolve({ ok: false, error: 'that app gave an answer I could not read' }); }
  });
});

// ------------------------------------------------------------------ the rules

/** Apps that show web pages: every control there is named by whoever wrote the page. */
export const BROWSERS = ['chrome', 'msedge', 'firefox', 'brave', 'opera', 'vivaldi', 'iexplore', 'arc', 'chromium'];
export const isBrowser = (processName: string) => BROWSERS.includes((processName ?? '').toLowerCase());

/** Names of controls that cannot be taken back or that speak for him. Asked about every time, in any app. */
const RISKY = /\b(close|quit|exit|send|submit|pay|buy|purchase|place order|order now|confirm|delete|remove|erase|uninstall|install|sign in|sign up|log in|login|register|transfer|withdraw|donate|post|publish|apply|accept|agree|checkout|check out|book|reserve|subscribe|unsubscribe|reset|format|empty|clear all|discard|overwrite|yes|ok|allow|authorize|grant|share|invite|reply|forward|tweet|comment)\b/i;
export const isRisky = (controlName: string) => RISKY.test(controlName ?? '');

/** Does this action need his yes every time rather than once per app? */
export function needsCare(processName: string, controlName: string): { care: boolean; why: string } {
  if (isBrowser(processName)) return { care: true, why: 'it is a web page, and the page decides what its buttons are called' };
  if (isRisky(controlName)) return { care: true, why: 'it may not be something that can be taken back' };
  return { care: false, why: '' };
}

/** The one control he meant, from what a search returned: an exact name wins, then a single partial match. */
export function pickControl(matches: Control[], name: string): { control: Control } | { error: string } {
  const want = name.trim().toLowerCase();
  const exact = matches.filter(m => m.name.toLowerCase() === want);
  if (exact.length === 1) return { control: exact[0]! };
  if (exact.length > 1) return { error: `There are ${exact.length} controls called "${name}" in that window. ${describeMatches(exact)} Name one more precisely.` };
  const partial = matches.filter(m => m.name.toLowerCase().includes(want));
  if (partial.length === 1) return { control: partial[0]! };
  if (partial.length > 1) return { error: `"${name}" matches ${partial.length} controls. ${describeMatches(partial)} Use the full name of one.` };
  return { error: matches.length ? `There is no control called "${name}" in that window.` : `I found nothing called "${name}" in that window.` };
}

export const describeMatches = (ms: Control[], max = 8) =>
  'They are: ' + ms.slice(0, max).map(m => `"${m.name}" (${m.type})`).join(', ') + (ms.length > max ? `, and ${ms.length - max} more.` : '.');

/** A readable list of what can be done in a window, grouped so a long window stays short. */
export function listControlsText(reply: ActReply): string {
  if (!reply.ok) return reply.error ?? 'I could not look at that window.';
  const ms = reply.matches ?? [];
  if (!ms.length) return `${reply.window?.process ?? 'That app'} shows no controls I can use. It may not expose them (games and some custom apps do not).`;
  const by = new Map<string, Control[]>();
  for (const m of ms) { const g = by.get(m.type) ?? []; g.push(m); by.set(m.type, g); }
  const lines = [...by.entries()].map(([t, list]) => `${t}s: ${list.map(m => `"${m.name}"${m.password ? ' (password, never filled)' : ''}${m.enabled ? '' : ' (greyed out)'}`).join(', ')}`);
  return `Window "${reply.window?.title}" of ${reply.window?.process}. Controls he can use, by name:\n${lines.join('\n')}${(reply.total ?? ms.length) > ms.length ? `\n(${reply.total} in all; ${ms.length} shown. Ask about a name to narrow it.)` : ''}`;
}
