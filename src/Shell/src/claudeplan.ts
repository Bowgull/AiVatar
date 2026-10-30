// Sheet 37, the plan card (his picks, 2026-10-14): before a Claude session uses Samara it says what it will do: the
// task, the sites, the steps, what it will not do. He sees it where he is already looking: inside Claude when Claude's
// window is in front (a form Claude draws, answered by him), otherwise in Aang's bubble, or Samara's band on a Mac with
// no Aang yet. He can untick sites and type a change. A plan he allowed before (same task, no new sites) just goes.
// What he allows becomes the session's fence: his login only where his rules allow it, unticked sites never opened.
import { execFile } from 'node:child_process';
import path from 'node:path';
import { writeFileAtomic } from './atomic.ts';
import { readJson } from './store.ts';
import { siteKey } from './siterules.ts';
import type { AangBrowser } from './browser.ts';

export interface PlanAsk { task: string; sites: string[]; steps: string[]; wont: string; /** 2026-10-22: the session's folder name (WAYMARK), for the card's kicker */ from: string }
interface Allowed { task: string; sites: string[]; at: number }

// ------------------------------------------------------------------ pages on this computer (2026-10-22)
// His screenshot: a Waymark session asked him, on the plan card, to "Show Waymark motion" (a 127.0.0.1 page), with a
// SITES list of one address that is this PC. Pages on this computer hold nothing of his to protect, so a plan whose
// sites are all this PC and whose steps only open or look at pages is not a question: it starts at once, no card, and
// the pages open where he sees them, in Samara's Mockups trail (claudedoor.ts). Any other plan still asks.

/** The one key every address on this computer is kept under (localhost has no dot, so siteKey alone would drop it). */
export const LOCAL_SITE = '127.0.0.1';
/** Is this site (an address, or a bare host with or without a port) this computer? */
export function localSite(x: string): boolean {
  let host = String(x ?? '').trim().toLowerCase();
  try { if (/^[a-z]+:\/\//.test(host)) host = new URL(host).hostname; else host = host.startsWith('[') ? host.slice(0, host.indexOf(']') + 1) : host.split(/[/:?#]/)[0]!; } catch { return false; }
  return host === 'localhost' || host === '::1' || host === '[::1]' || /^127(\.\d{1,3}){3}$/.test(host);
}
/** A step that only opens or looks at something ("Open the Waymark motion recording page", "Take a picture of it"). */
const VIEW_STEP = /^(open|show|look|view|see|watch|load|preview|review|check|display|play|take a (picture|screenshot)|screenshot|capture|scroll|read)\b/i;
const ACT_WORD = /\b(click|press|type|fill|enter|submit|send|post|sign|log ?in|upload|delete|buy|pay|drag|select|apply|install)\b/i;
export const viewOnlyStep = (s: string): boolean => VIEW_STEP.test(s.trim()) && !ACT_WORD.test(s);
/** A plan that only shows him pages on this computer: no card. */
export const showOnlyPlan = (p: PlanAsk): boolean => p.sites.every((s) => s === LOCAL_SITE) && p.steps.every(viewOnlyStep);

/** The plan as sent, cleaned: plain words, a dozen sites and steps at most, every site a real web address. */
export function cleanPlan(a: Record<string, unknown>): PlanAsk | null {
  const task = String(a.task ?? '').replace(/\s+/g, ' ').trim().slice(0, 40);
  const sites = [...new Set((Array.isArray(a.sites) ? a.sites : []).map((x) => (localSite(String(x)) ? LOCAL_SITE : siteKey(String(x)))).filter(Boolean))].slice(0, 12);
  const steps = (Array.isArray(a.steps) ? a.steps : []).map((x) => String(x).replace(/\s+/g, ' ').trim().slice(0, 120)).filter(Boolean).slice(0, 12);
  const wont = String(a.wont ?? '').replace(/\s+/g, ' ').trim().slice(0, 160);
  // The session's folder name (sent by claude-door-mcp.mjs): plain letters only, short; '' when there is none.
  const from = String(a.from ?? '').replace(/[^A-Za-z0-9 ._-]+/g, '').replace(/\s+/g, ' ').trim().slice(0, 30);
  if (!task || !sites.length || !steps.length) return null;
  return { task, sites, steps, wont, from };
}

/** Plans he allowed, kept so the same plan never asks twice (his "ask once, remember" rule). */
export class PlanMemory {
  private list: Allowed[] = [];
  private readonly file: string;
  constructor(stateDir: string) {
    this.file = path.join(stateDir, 'claude-plans.json');
    const j = readJson<unknown>(this.file, null);   // none or broken: start empty
    if (Array.isArray(j)) this.list = j.filter((x) => x && typeof x.task === 'string' && Array.isArray(x.sites));
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
  /** Sheet 41's "Take it back": this plan asks him again next time. True when there was one to forget. */
  forget(task: string): boolean {
    const t = task.toLowerCase();
    const before = this.list.length;
    this.list = this.list.filter((x) => x.task !== t);
    if (this.list.length === before) return false;
    try { writeFileAtomic(this.file, JSON.stringify(this.list, null, 1)); } catch { /* next time */ }
    return true;
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
    const out = await b.drive('start', { kind: 'claude', name: p.task, plan: { login: keep.filter(login), denied: p.sites.filter((s) => !keep.includes(s)), steps: p.steps, allowed: keep } });
    if (out.ok === true && Number.isInteger(out.job) && card) b.planJob(out.job as number, card);
    return { ...out, ...(same ? { same: true } : {}), sites: keep, login: keep.filter(login) };
  };
  if (mem.known(p)) return start(p.sites, null, true);
  // Pages on this computer, only looked at (2026-10-22): nothing to ask.
  if (showOnlyPlan(p)) return { ...(await start(p.sites, null, false)), local: true };
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
  // A site on this computer travels marked local: the card leaves it out (his "sites, do I need this?", 2026-10-22).
  const a = await b.askPlan({ task: p.task, from: p.from, sites: p.sites.map((site) => ({ site, login: login(site), favicon: b.planIcon(site), ...(site === LOCAL_SITE ? { local: true } : {}) })), steps: p.steps, wont: p.wont });
  if (!a) return { ok: false, error: "Joshua wasn't there to answer the plan. Ask him in chat, then send it again." };
  if (a.change) return { ok: false, change: true, note: a.note, keep: a.keep };
  if (!a.go || !a.keep.length) return { ok: false, error: 'Joshua said not now.' };
  mem.remember(p.task, a.keep);
  return start(a.keep, a.card ?? null, false);
}
