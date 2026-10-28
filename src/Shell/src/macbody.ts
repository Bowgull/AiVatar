// What the PC pet's hands and eyes do, the Mac way (2026-10-28, the full port). On the PC the brain asks the C# pet
// (hands.request, clipboard.request, look.request) and the Shell (drive, popout.open, browser.open). The Mac app said
// hello as a shell but answered none of them, so every one of those tools sat 10 to 45 seconds and then failed.
//
// Each request gets an answer here, straight away: done the Mac way where macOS allows it without a new permission,
// and an honest "not on the Mac yet" where it does not. Every command runs with execFile (no shell), app names are
// checked to plain characters first, and the brain has already asked him for the tool itself.
import { clipboard, shell } from 'electron';
import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';

export interface MacBodyOptions {
  /** To the brain. */
  send: (m: Record<string, unknown>) => void;
  /** Where aang-look lives (mac/look.swift, built by tools/install-mac-aang.sh). */
  binDir: string;
  /** Samara.app, where links and the pop-out go on this Mac. */
  samara: string;
}

/** An app name as he would say it: letters, digits, spaces and . & ' - only, so it can never be read as anything else. */
export function appName(raw: unknown): string | null {
  const s = String(raw ?? '').trim();
  return /^[\p{L}\p{N} .&'-]{1,60}$/u.test(s) ? s : null;
}

function run(file: string, args: string[], ms = 8000): Promise<{ ok: boolean; out: string; err: string }> {
  return new Promise((resolve) => {
    execFile(file, args, { timeout: ms, maxBuffer: 32 * 1024 * 1024 }, (e, out, err) => resolve({ ok: !e, out: String(out), err: String(err || e?.message || '') }));
  });
}
const osa = (lines: string[], args: string[] = []) => run('/usr/bin/osascript', [...lines.flatMap((l) => ['-e', l]), ...args]);

/** The media keys: Spotify's own play/pause/skip (the app he plays on), the Mac's own volume. */
async function media(key: string): Promise<{ ok: boolean; detail: string }> {
  if (key === 'volumeup' || key === 'volumedown') {
    const d = key === 'volumeup' ? '+ 8' : '- 8';
    const r = await osa([`set volume output volume ((output volume of (get volume settings)) ${d})`]);
    return r.ok ? { ok: true, detail: key === 'volumeup' ? 'Turned it up.' : 'Turned it down.' } : { ok: false, detail: 'The volume could not be changed.' };
  }
  if (key === 'mute') {
    const r = await osa(['set volume output muted (not (output muted of (get volume settings)))']);
    return r.ok ? { ok: true, detail: 'Toggled mute.' } : { ok: false, detail: 'Mute could not be changed.' };
  }
  const verb = { playpause: 'playpause', stop: 'pause', next: 'next track', previous: 'previous track' }[key];
  if (!verb) return { ok: false, detail: 'That is not a media key.' };
  const r = await osa(['if application "Spotify" is running then', `tell application "Spotify" to ${verb}`, 'return "ok"', 'end if', 'return "off"']);
  if (r.ok && r.out.trim() === 'ok') return { ok: true, detail: 'Done, on Spotify.' };
  if (r.ok) return { ok: false, detail: 'Spotify is not open on this Mac, so nothing was playing to press.' };
  // The first time, macOS asks him whether Aang may control Spotify; a no lands here.
  return { ok: false, detail: 'macOS did not let Aang control Spotify (System Settings, Privacy & Security, Automation).' };
}

async function hands(action: string, what: unknown, how: unknown): Promise<{ ok: boolean; detail: string }> {
  if (action === 'clipset') { clipboard.writeText(String(what ?? '').slice(0, 100_000)); return { ok: true, detail: 'It is on the clipboard.' }; }
  if (action === 'media') return media(String(what ?? ''));
  const name = appName(what);
  if (!name) return { ok: false, detail: 'Say the app by its name.' };
  if (action === 'close') {
    // Running first, by process: AppleScript naming an app that is not installed pops up macOS's "Where is ...?" picker.
    if (!(await run('/usr/bin/pgrep', ['-xi', '--', name])).ok) return { ok: false, detail: `${name} is not open.` };
    const r = await osa(['on run argv', 'tell application (item 1 of argv) to quit', 'end run'], [name]);
    return r.ok ? { ok: true, detail: `Asked ${name} to quit. If it had unsaved work, it asks you first.` } : { ok: false, detail: `${name} could not be closed: ${r.err.trim().slice(0, 120) || 'no reason given'}.` };
  }
  if (action === 'forcequit') {
    const r = await run('/usr/bin/killall', ['-KILL', name]);
    return r.ok ? { ok: true, detail: `Force quit ${name}. Anything unsaved in it is gone.` } : { ok: false, detail: `No app called ${name} is running.` };
  }
  if (action === 'arrange') {
    const r = await run('/usr/bin/open', ['-a', name]);
    if (!r.ok) return { ok: false, detail: `No app called ${name} was found.` };
    return how === 'front' || how === 'restore'
      ? { ok: true, detail: `Brought ${name} to the front.` }
      : { ok: true, detail: `Brought ${name} to the front. Resizing and snapping windows is not on the Mac yet, so that part was not done.` };
  }
  return { ok: false, detail: 'That is not something Aang can do with windows.' };
}

/** Links and the pop-out go to Samara on this Mac (it has its own pop-out); the default browser if Samara is not there. */
function openInSamara(url: string, samara: string): void {
  if (!/^https?:\/\//i.test(url)) return;
  if (existsSync(samara)) execFile('/usr/bin/open', ['-a', samara, url], () => {});
  else void shell.openExternal(url);
}

/**
 * The handler: true when the message was one of these and is answered (the caller does nothing more with it).
 */
export function macBodyAnswers(o: MacBodyOptions): (m: Record<string, unknown>) => boolean {
  let looking = false;
  return (m) => {
    switch (m.t) {
      case 'hands.request':
        void hands(String(m.action ?? ''), m.what, m.how).then((r) => o.send({ t: 'hands', id: String(m.id ?? ''), ...r }));
        return true;
      case 'clipboard.request':
        o.send({ t: 'clipboard', id: String(m.id ?? ''), text: clipboard.readText() || null });
        return true;
      case 'look.request': {
        const id = String(m.id ?? '');
        const bin = path.join(o.binDir, 'aang-look');
        if (looking || !existsSync(bin)) { o.send({ t: 'look', id, ok: false, error: looking ? 'a picture is already being taken' : 'the picture helper is not installed' }); return true; }
        looking = true;
        void run(bin, [], 10_000).then((r) => {
          looking = false;
          let j: Record<string, unknown> = {};
          try { j = JSON.parse(r.out); } catch { j = { ok: false, error: 'the picture helper did not answer' }; }
          o.send({ t: 'look', id, ok: j.ok === true, data: typeof j.data === 'string' ? j.data : null, w: Number(j.w) || 0, h: Number(j.h) || 0, black: Number(j.black) || 0, error: typeof j.error === 'string' ? j.error : null });
        });
        return true;
      }
      // Aang driving the browser (browse, browser_history) is Samara on the PC; the Mac's Samara does not take it yet.
      case 'drive':
        o.send({ t: 'drive.result', id: Number(m.id) || 0, ok: false, error: 'driving the browser is not on the Mac yet; Samara on the PC does it' });
        return true;
      case 'popout.open': case 'browser.open':
        openInSamara(String(m.url ?? ''), o.samara);
        return true;
      default:
        return false;
    }
  };
}
