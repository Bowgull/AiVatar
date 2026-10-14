// Sheet 37, the plan card (his picks, 2026-10-14): before a Claude session uses Samara it says what it will do: the
// task, the sites, the steps, what it will not do. He sees it where he is already looking: inside Claude when Claude's
// window is in front (a form Claude draws, answered by him), otherwise in Aang's bubble, or Samara's band on a Mac with
// no Aang yet. He can untick sites and type a change. A plan he allowed before (same task, no new sites) just goes.
// What he allows becomes the session's fence: his login only where his rules allow it, unticked sites never opened.
import { execFile } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { writeFileAtomic } from './atomic.ts';
import { siteKey } from './siterules.ts';
import type { AangBrowser } from './browser.ts';

export interface PlanAsk { task: string; sites: string[]; steps: string[]; wont: string }
interface Allowed { task: string; sites: string[]; at: number }

/** The plan as sent, cleaned: plain words, a dozen sites and steps at most, every site a real web address. */
export function cleanPlan(a: Record<string, unknown>): PlanAsk | null {
  const task = String(a.task ?? '').replace(/\s+/g, ' ').trim().slice(0, 40);
  const sites = [...new Set((Array.isArray(a.sites) ? a.sites : []).map((x) => siteKey(String(x))).filter(Boolean))].slice(0, 12);
  const steps = (Array.isArray(a.steps) ? a.steps : []).map((x) => String(x).replace(/\s+/g, ' ').trim().slice(0, 120)).filter(Boolean).slice(0, 12);
  const wont = String(a.wont ?? '').replace(/\s+/g, ' ').trim().slice(0, 160);
  if (!task || !sites.length || !steps.length) return null;
  return { task, sites, steps, wont };
}

/** Plans he allowed, kept so the same plan never asks twice (his "ask once, remember" rule). */
export class PlanMemory {
  private list: Allowed[] = [];
  private readonly file: string;
  constructor(stateDir: string) {
    this.file = path.join(stateDir, 'claude-plans.json');
    try { if (existsSync(this.file)) { const j = JSON.parse(readFileSync(this.file, 'utf8')); if (Array.isArray(j)) this.list = j.filter((x) => x && typeof x.task === 'string' && Array.isArray(x.sites)); } } catch { /* start empty */ }
  }
  /** Same task, and every site already allowed for it. */
  known(p: PlanAsk): boolean {
    const t = p.task.toLowerCase();
    return this.list.some((x) => x.task === t && p.sites.every((s) => x.sites.includes(s)));
  }
  remember(task: string, sites: string[]): void {
    const t = task.toLowerCase();
    const old = this.list.find((x) => x.task === t);
    if (old) { old.sites = [...new Set([...old.sites, ...sites])].slice(0, 40); old.at = Date.now(); }
    else this.list.push({ task: t, sites: sites.slice(0, 40), at: Date.now() });
    this.list = this.list.sort((a, b) => b.at - a.at).slice(0, 100);
    try { writeFileAtomic(this.file, JSON.stringify(this.list, null, 1)); } catch { /* next time */ }
  }
}

/** Is a Claude window (the desktop app, or the terminal it runs in) the one in front on this machine? */
export function claudeInFront(): Promise<boolean> {
  const CLAUDE = /^(claude|windowsterminal|terminal|iterm2?|code|cursor|wezterm|alacritty|warp|powershell|pwsh|cmd|ghostty|kitty)$/i;
  return new Promise((done) => {
    const finish = (e: Error | null, out: string) => done(!e && CLAUDE.test(String(out).trim()));
    if (process.platform === 'darwin') {
      execFile('/usr/bin/osascript', ['-e', 'tell application "System Events" to get name of first application process whose frontmost is true'], { timeout: 4000 }, (e, out) => finish(e, out));
      return;
    }
    if (process.platform === 'win32') {
      const ps = 'Add-Type -Name F -Namespace W -MemberDefinition \'[DllImport("user32.dll")] public static extern System.IntPtr GetForegroundWindow(); [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(System.IntPtr h, out uint p);\'; '
        + '$p = 0; [void][W.F]::GetWindowThreadProcessId([W.F]::GetForegroundWindow(), [ref]$p); (Get-Process -Id $p).ProcessName';
      execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', ps], { timeout: 6000, windowsHide: true }, (e, out) => finish(e, out));
      return;
    }
    done(false);
  });
}

export type PlanOut = Record<string, unknown>;

/**
 * One plan, start to answer. `elicit`: Claude's window can show a form. `decided`: his answer from that form, which only
 * counts for the plan that was just sent to it. Returns the started session, or why not.
 */
export async function runPlan(b: AangBrowser, mem: PlanMemory, p: PlanAsk, o: { elicit: boolean; decided?: { keep: string[]; note: string; go: boolean } | null; pending: Map<string, number> }): Promise<PlanOut> {
  const key = JSON.stringify([p.task.toLowerCase(), p.sites]);
  const login = (s: string) => b.planLogin(p.task, s);
  const start = async (keep: string[], card: string | null, same: boolean): Promise<PlanOut> => {
    const out = await b.drive('start', { kind: 'claude', name: p.task, plan: { login: keep.filter(login), denied: p.sites.filter((s) => !keep.includes(s)), steps: p.steps } });
    if (out.ok === true && Number.isInteger(out.job) && card) b.planJob(out.job as number, card);
    return { ...out, ...(same ? { same: true } : {}), sites: keep, login: keep.filter(login) };
  };
  if (mem.known(p)) return start(p.sites, null, true);
  // His answer from the form inside Claude: only for the plan that form showed, within ten minutes.
  if (o.decided) {
    const at = o.pending.get(key);
    o.pending.delete(key);
    if (!at || Date.now() - at > 10 * 60_000) return { ok: false, error: 'That answer is not for a plan that was just shown. Send the plan again.' };
    const keep = o.decided.keep.filter((s) => p.sites.includes(s));
    if (o.decided.note) return { ok: false, change: true, note: o.decided.note.slice(0, 500), keep };
    if (!o.decided.go || !keep.length) return { ok: false, error: 'Joshua said not now.' };
    mem.remember(p.task, keep);
    return start(keep, null, false);
  }
  // Inside Claude only when nothing in the plan would use his login: a setting in Claude can answer its form for him.
  if (o.elicit && !p.sites.some(login) && await claudeInFront()) {
    o.pending.set(key, Date.now());
    return { ok: false, needs: 'elicit', plan: p };
  }
  const a = await b.askPlan({ task: p.task, sites: p.sites.map((site) => ({ site, login: login(site), favicon: b.planIcon(site) })), steps: p.steps, wont: p.wont });
  if (!a) return { ok: false, error: "Joshua wasn't there to answer the plan. Ask him in chat, then send it again." };
  if (a.change) return { ok: false, change: true, note: a.note, keep: a.keep };
  if (!a.go || !a.keep.length) return { ok: false, error: 'Joshua said not now.' };
  mem.remember(p.task, a.keep);
  return start(a.keep, a.card ?? null, false);
}
