// M4 in the omashu repo's MAC.md (his ask, 2026-11-15): WoW patch alerts for Omashu, the TV laptop, and the one-button patch.
//
//   - Omashu's watcher (wow-watch.ps1) keeps C:\Omashu\state\wow.json. About every 15 minutes Aang reads it over SSH.
//     Reading it is a plain file read: no Claude, no model, no quota (his rule: no wasted Claude usage).
//   - When claude is false and patch is none, ONE post in 🎮 gaming: what changed, with Patch it and Later. Only he can
//     press them (the adapter checks his id before anything here runs). After posting, claude is set true on Omashu,
//     and the post is remembered by the file's sig, so the same news is never posted twice.
//   - Patch it: patch = requested on Omashu, then ONE Claude job (the claude-jobs path, macjobs.ts) in the omashu repo
//     with the FIXED brief below. Nothing from the button, the post or wow.json goes into the prompt: the job reads
//     wow.json itself. Pressed twice, it runs once.
//   - When the job ends, the post is edited to Ready, or to the reason it failed.
//   - Later: nothing happens. The post keeps its Patch it button for when he wants it.
//
// Runs on the Mac (the bot lives there; see discord.ts). On the PC it is off.
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import path from 'node:path';
import os from 'node:os';
import { writeFileAtomic } from './atomic.ts';
import { readJson } from './store.ts';
import type { Button, ButtonPress, Gateway, OutMsg } from './discord.ts';

export const WOW_FILE = 'C:\\Omashu\\state\\wow.json';
export const POLL_MS = 15 * 60_000;
/** The omashu repo on the Mac, where the patch job runs. */
export const OMASHU_REPO = path.join(os.homedir(), 'projects', 'omashu');

export type Patch = 'none' | 'requested' | 'building' | 'ready' | 'failed';
export interface WowState {
  version: string; interface?: number; sig?: string;
  updatedFrom?: string | null; updatedAt?: string | null;
  addonsOutOfDate?: string[]; luaErrors?: string[];
  told?: boolean; claude?: boolean; patch?: Patch; patchReason?: string;
}
/** What Aang remembers about the one alert it posted. */
export interface Alert { sig: string; key: string; channelId: string; messageId: string; text: string; stage: 'asked' | 'later' | 'patching' | 'ready' | 'failed'; why?: string; at: number }

/**
 * The fixed brief. The ONLY prompt a Patch it press can start. Nothing in it comes from outside: it tells Claude to
 * read wow.json itself.
 */
export const PATCH_BRIEF = [
  'WoW Forever on Omashu (the TV laptop) was updated, or an Oma add-on threw a Lua error. Joshua pressed "Patch it" on Discord. Do this, and nothing else:',
  '1. In this repo (omashu), `git pull` first. Read CLAUDE.md and its WoW section.',
  '2. Read the state: `ssh omashu "type C:\\Omashu\\state\\wow.json"`. Set patch to "building" on Omashu (edit only that field, keep the file\'s UTF-8 JSON shape).',
  '3. Fix the Oma add-ons (OmaDoomed, OmaDemon, OmaPad, OmaChat, OmaGuide, OmaPointer): for each one in addonsOutOfDate, add the new `interface` number to its .toc `## Interface:` line; for each Oma Lua error in luaErrors, find the real cause and fix it. Work on the copies in this repo (scripts/wow, wow-addon); an add-on with no copy here is copied from Omashu first and kept here.',
  '4. Test: every changed .lua parses, every .toc lists the new interface number, nothing else changed.',
  '5. Install on Omashu ONLY when nobody is playing: check `ssh omashu "tasklist"` has no Wow.exe and no Cemu.exe. If one is running, wait (check every 5 minutes, up to 2 hours) and never close a game. Back up each add-on folder on Omashu before replacing it. Then run `ssh omashu "powershell -NoProfile -File C:\\Omashu\\wow-watch.ps1"` and check addonsOutOfDate is empty.',
  '6. Set patch to "ready" in wow.json on Omashu. If anything could not be done, set patch to "failed" and patchReason to one short plain sentence saying why.',
  '7. Add a row to CHANGES.md (what, why, how to undo), commit, push.',
  'Do not change anything else on Omashu or in this repo. Finish with one short sentence: what you fixed, or why it failed.',
].join('\n');

export function parseWow(text: string): WowState | null {
  try {
    const j = JSON.parse(String(text).replace(/^\uFEFF/, '').trim());
    if (!j || typeof j !== 'object' || typeof j.version !== 'string' || !/^\d+(\.\d+){1,4}$/.test(j.version)) return null;
    const list = (x: unknown) => (Array.isArray(x) ? x.map(v => String(v)).slice(0, 20) : []);
    const patch: Patch = ['none', 'requested', 'building', 'ready', 'failed'].includes(j.patch) ? j.patch : 'none';
    return {
      version: j.version, ...(typeof j.interface === 'number' ? { interface: j.interface } : {}),
      sig: typeof j.sig === 'string' ? j.sig : j.version,
      updatedFrom: typeof j.updatedFrom === 'string' ? j.updatedFrom : null, updatedAt: typeof j.updatedAt === 'string' ? j.updatedAt : null,
      addonsOutOfDate: list(j.addonsOutOfDate), luaErrors: list(j.luaErrors),
      told: j.told === true, claude: j.claude === true, patch,
      ...(typeof j.patchReason === 'string' ? { patchReason: j.patchReason.slice(0, 300) } : {}),
    };
  } catch { return null; }
}

/** Words from the laptop's files, made safe to show: no mentions, no code fences, one line, short. */
const clean = (s: string, max: number) => s.replace(/[@`]/g, "'").replace(/\s+/g, ' ').trim().slice(0, max);

export function alertText(w: WowState): string {
  const lines = [w.updatedFrom ? `WoW Forever updated on Omashu: ${clean(w.updatedFrom, 30)} → ${clean(w.version, 30)}.` : `WoW Forever on Omashu (${clean(w.version, 30)}) needs a look.`];
  const behind = w.addonsOutOfDate ?? [];
  lines.push(behind.length ? `Add-ons behind: ${behind.map(a => clean(a, 40)).join(', ')}.` : 'Every Oma add-on already lists this version.');
  const errs = w.luaErrors ?? [];
  if (errs.length) lines.push(`Lua errors:\n${errs.slice(0, 6).map(e => '- ' + clean(e, 160)).join('\n')}`);
  lines.push('-# Patch it starts a Claude job that fixes them and installs when nobody is playing.');
  return lines.join('\n');
}

/** A PowerShell script that sets fields in wow.json and keeps everything else. Values travel as base64 JSON, never as code. */
export function setScript(fields: Partial<Pick<WowState, 'claude' | 'patch' | 'patchReason'>>): string {
  const data = Buffer.from(JSON.stringify(fields), 'utf8').toString('base64');
  return [
    "$ErrorActionPreference='Stop'",
    `$f='${WOW_FILE}'`,
    `$set=[Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${data}')) | ConvertFrom-Json`,
    '$j=Get-Content $f -Raw | ConvertFrom-Json',
    'foreach($p in $set.PSObject.Properties){ $j | Add-Member -NotePropertyName $p.Name -NotePropertyValue $p.Value -Force }',
    '$j | ConvertTo-Json -Depth 4 | Set-Content $f -Encoding utf8',
  ].join('; ');
}
/** For powershell -EncodedCommand: UTF-16LE, base64. */
export const encodePs = (script: string) => Buffer.from(script, 'utf16le').toString('base64');

const ssh = (cmd: string, timeoutMs: number) => new Promise<string>((res, rej) => {
  execFile('ssh', ['-o', 'BatchMode=yes', '-o', 'ConnectTimeout=10', 'omashu', cmd], { timeout: timeoutMs, maxBuffer: 1 << 20, windowsHide: true }, (e, out, err) => {
    if (e) rej(new Error(String(err || e.message).trim().split('\n')[0] || 'ssh failed')); else res(String(out));
  });
});
export const sshRead = () => ssh(`type ${WOW_FILE}`, 30_000);
export const sshWrite = async (fields: Parameters<typeof setScript>[0]) => { await ssh(`powershell -NoProfile -NonInteractive -EncodedCommand ${encodePs(setScript(fields))}`, 60_000); };

export interface WowDeps {
  gw: Pick<Gateway, 'send' | 'edit'>;
  /** 🎮 gaming's channel id */
  channel: () => string | undefined;
  dir: string;
  log?: (s: string) => void;
  read?: () => Promise<string>;
  write?: (fields: Parameters<typeof setScript>[0]) => Promise<void>;
  /**
   * Start the one Claude job with this brief; `done` is called once when it ends (what it said, or why it stopped).
   * Returns null when it started, else why it could not.
   */
  startJob: (brief: string, done: (said: string, why: string) => void) => Promise<string | null>;
}

export class WowPatch {
  alert: Alert | null = null;
  private readonly file: string;
  private readonly log: (s: string) => void;
  private readonly read: () => Promise<string>;
  private readonly write: (fields: Parameters<typeof setScript>[0]) => Promise<void>;
  /** A job started by THIS run of Aang is going. After a restart a 'patching' alert has none. */
  private running = false;
  private polling = false;
  private readonly o: WowDeps;
  constructor(o: WowDeps) {
    this.o = o;
    this.file = path.join(o.dir, 'wow-alert.json');
    this.log = o.log ?? (() => {});
    this.read = o.read ?? sshRead;
    this.write = o.write ?? sshWrite;
    this.alert = readJson<Alert | null>(this.file, null, (a: any) => (a && typeof a === 'object' && typeof a.sig === 'string' ? a as Alert : null));
  }
  private save() { try { writeFileAtomic(this.file, JSON.stringify(this.alert)); } catch { /* next time */ } }

  private buttons(a: Alert, later: boolean): Button[] {
    return [{ id: `wow:patch:${a.key}`, label: 'Patch it', style: 'primary' }, ...(later ? [{ id: `wow:later:${a.key}`, label: 'Later', style: 'secondary' as const }] : [])];
  }
  private view(a: Alert): OutMsg {
    const status = a.stage === 'later' ? '\n**Later.** Nothing was changed; Patch it is here when you want it.'
      : a.stage === 'patching' ? '\n**Patching.** A Claude job is on it (its post is in ⚙️ claude-jobs). It installs only when nobody is playing.'
      : a.stage === 'ready' ? '\n**Ready.** The add-ons are patched and installed on Omashu.'
      : a.stage === 'failed' ? `\n**It did not work:** ${clean(a.why || 'no reason was given', 300)}`
      : '';
    const buttons = a.stage === 'asked' ? this.buttons(a, true) : a.stage === 'later' || a.stage === 'failed' ? this.buttons(a, false) : [];
    return { content: (a.text + status).slice(0, 1900), buttons, silent: true };
  }
  private async show(a: Alert): Promise<void> {
    try { await this.o.gw.edit(a.channelId, a.messageId, this.view(a)); } catch (e) { this.log('wow: could not edit the post: ' + (e as Error).message); }
  }

  /** One look at wow.json. No model. */
  async poll(): Promise<void> {
    if (this.polling) return;
    this.polling = true;
    try {
      let w: WowState | null;
      try { w = parseWow(await this.read()); } catch (e) { this.log('wow: Omashu did not answer: ' + (e as Error).message); return; }
      if (!w) { this.log('wow: wow.json could not be read'); return; }
      const a = this.alert;
      if (a && a.stage === 'patching' && !this.running) {
        // The job is not ours to wait for (Aang restarted while it ran): settle it from the file.
        if (w.patch === 'ready' || w.patch === 'failed') await this.finish(w);
        else {
          const why = 'Aang restarted while the patch job was running, so it stopped. Press Patch it to try again.';
          await this.write({ patch: 'failed', patchReason: why }).catch(() => {});
          a.stage = 'failed'; a.why = why; this.save(); await this.show(a);
        }
        return;
      }
      if (w.claude || w.patch !== 'none') return;
      if (a && a.sig === w.sig) return;                       // already posted about this
      const channel = this.o.channel();
      if (!channel) { this.log('wow: there is no gaming channel to post in'); return; }
      const sig = w.sig ?? w.version;
      const next: Alert = { sig, key: createHash('sha256').update(sig).digest('hex').slice(0, 12), channelId: channel, messageId: '', text: alertText(w), stage: 'asked', at: Date.now() };
      this.alert = next; this.save();                         // first: never twice, even if the post below fails half way
      next.messageId = await this.o.gw.send(channel, this.view(next));
      this.save();
      this.log(`wow: posted the patch alert for ${w.version}`);
      await this.write({ claude: true }).catch(e => this.log('wow: could not set claude on Omashu: ' + (e as Error).message));
    } finally { this.polling = false; }
  }

  /** wow:patch:<key> or wow:later:<key>. The adapter has already checked it is him. */
  async press(b: Pick<ButtonPress, 'customId' | 'keep' | 'ack'>): Promise<boolean> {
    const m = /^wow:(patch|later):([a-f0-9]{12})$/.exec(b.customId);
    if (!m) return false;
    const a = this.alert;
    if (!a || a.key !== m[2]) { await b.ack('That alert is out of date; the newest one is the one to press.'); return true; }
    await b.keep();
    if (m[1] === 'later') {
      if (a.stage === 'asked') { a.stage = 'later'; this.save(); await this.show(a); }
      return true;
    }
    if (a.stage === 'patching' || a.stage === 'ready') return true;   // pressed twice: it runs once
    a.stage = 'patching'; delete a.why; this.save();                  // before any wait, so a second press sees it
    await this.show(a);
    try { await this.write({ patch: 'requested', patchReason: '' }); }
    catch (e) { return this.fail(a, `Omashu did not answer (${clean((e as Error).message, 120)}). Nothing was started; press Patch it again once it is on.`, false); }
    this.running = true;
    let why: string | null;
    try { why = await this.o.startJob(PATCH_BRIEF, (said, stopped) => { void this.jobDone(said, stopped); }); }
    catch (e) { why = (e as Error).message; }
    if (why) { this.running = false; return this.fail(a, `The Claude job did not start: ${why}`, true); }
    this.log('wow: started the patch job');
    return true;
  }

  private async fail(a: Alert, why: string, tellOmashu: boolean): Promise<true> {
    if (tellOmashu) await this.write({ patch: 'failed', patchReason: why }).catch(() => {});
    a.stage = 'failed'; a.why = why; this.save(); await this.show(a);
    return true;
  }

  private async jobDone(said: string, stopped: string): Promise<void> {
    this.running = false;
    let w: WowState | null = null;
    try { w = parseWow(await this.read()); } catch { /* the laptop went away */ }
    if (w && (w.patch === 'ready' || w.patch === 'failed')) { await this.finish(w); return; }
    // The job ended without saying ready or failed in the file: it failed, and why.
    const why = stopped ? `The Claude job stopped: ${stopped}` : `The Claude job finished without marking it ready${said ? ': ' + said : '.'}`;
    if (this.alert) await this.fail(this.alert, why, true);
  }

  private async finish(w: WowState): Promise<void> {
    const a = this.alert; if (!a) return;
    if (w.patch === 'ready') { a.stage = 'ready'; delete a.why; }
    else { a.stage = 'failed'; a.why = w.patchReason || 'the job did not say why'; }
    this.save(); await this.show(a);
    this.log(`wow: the patch is ${a.stage}`);
  }
}
