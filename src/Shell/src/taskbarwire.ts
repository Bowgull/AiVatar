// Pop-outs on Samara's taskbar, plugged in (sheet 66 A, 2026-10-22). main.ts calls wireTaskbarPops once, after the window
// family, and passes every brain message through `hear`; taskbar.ts does the work. Kept here so main.ts gains a few lines,
// not a section: what each pop-out is called and what its thumbnail buttons do.
import type { BrowserWindow } from 'electron';
import { wireTaskbar, type FamilyLike, type TaskbarPops } from './taskbar.ts';
import * as P from './taskbarplan.ts';
import { checkPlayerCmd } from './playercmd.ts';
import type { Popout } from './popout.ts';
import type { JobPops } from './jobpop.ts';
import type { PinSnips } from './pinsnip.ts';

export function wireTaskbarPops(o: {
  family: FamilyLike;
  popout: () => Popout | null;
  jobs: () => JobPops | null;
  snips: () => PinSnips | null;
  samara: () => BrowserWindow | null;
  /** The brain's lists as main.ts last had them. */
  jobList: () => unknown;
  notes: () => { id: string; title: string }[];
  aang: () => P.Box | null;
  open: { note: () => void; timer: () => void; player: () => void };
  /** To the brain (media keys, timer keys, Claude pause and play: each checked here first). */
  send: (m: Record<string, unknown>) => void;
  log?: (s: string) => void;
}): { taskbar: TaskbarPops | null; hear: (m: Record<string, unknown>) => void } {
  let media: { title?: string; artist?: string; status?: string } = {};
  let timers: P.Timer[] = [];
  let video: { playing?: boolean } = {};
  const hear = (m: Record<string, unknown>) => {
    if (m.t === 'media.now') media = m.app === null ? {} : { ...media, ...(typeof m.title === 'string' ? { title: m.title } : {}), ...(typeof m.artist === 'string' ? { artist: m.artist } : {}), ...(typeof m.status === 'string' ? { status: m.status } : {}) };
    else if (m.t === 'timer.state' && Array.isArray(m.timers)) timers = (m.timers as P.Timer[]).filter((t) => t && typeof t.id === 'string').slice(0, 20);
    else if (m.t === 'watch.state') video = { playing: m.playing === true };
  };
  const jobOf = (id: string) => { const l = o.jobList(); return (Array.isArray(l) ? l : []).find((j) => (j as { id?: unknown } | null)?.id === id) as Record<string, unknown> | undefined; };

  const info = (id: string, kind: string): { label: string; state: P.MemberState } => {
    const now = Date.now();
    if (kind === 'job') { const j = P.jobNow(jobOf(id.slice(4)), now); return { label: P.memberLabel('job', { job: j }), state: { paused: j.phase === 'paused', active: j.active } }; }
    if (kind === 'timer') { const t = timers.find((x) => 'timer:' + x.id === id); return { label: t ? P.memberLabel('timer', { timer: t, now }) : 'Timer', state: { paused: !!t && t.paused > 0 } }; }
    if (kind === 'player') return { label: P.memberLabel('player', media), state: { playing: media.status === 'playing' } };
    if (kind === 'note') return { label: P.memberLabel('note', { title: o.notes().find((n) => 'note:' + n.id === id)?.title }), state: {} };
    if (kind === 'video') { const p = o.popout(); return { label: P.memberLabel('video', { title: p?.nowTitle }), state: { pinned: !!p?.pinned, playing: video.playing } }; }
    if (kind === 'snip') return { label: P.memberLabel('snip', { title: o.snips()?.titleOf(id) ?? '' }), state: {} };
    return { label: P.memberLabel(kind, {}), state: {} };
  };

  const act = (id: string, kind: string, b: number) => {
    if (kind === 'player') {
      const op = b === P.BTN.prev ? 'prev' : b === P.BTN.next ? 'next' : b === P.BTN.playpause ? 'toggle' : null;
      const c = op ? checkPlayerCmd({ op }) : null;
      if (c) o.send(c as unknown as Record<string, unknown>);
      return;
    }
    if (kind === 'job') {
      // jobpop.ts rebuilds Pause / Play / Open from the window's own job id and checks them (claudewire.ts), as for its page.
      const jid = id.slice(4);
      if (b === P.BTN.jobOpen) { o.jobs()?.act(jid, 'open'); return; }
      if (b === P.BTN.jobPause) o.jobs()?.act(jid, jobOf(jid)?.phase === 'paused' ? 'play' : 'pause');
      return;
    }
    if (kind === 'timer') {
      const action = b === P.BTN.timerPause ? 'pause' : b === P.BTN.timerAdd ? 'add' : b === P.BTN.timerStop ? 'stop' : null;
      const tid = id.slice(6);
      if (action && timers.some((t) => t.id === tid)) o.send({ t: 'timer.act', id: tid, action });
      return;
    }
    if (kind === 'video') {
      if (b === P.BTN.videoPlay) o.popout()?.togglePlay();
      else if (b === P.BTN.videoPin) o.popout()?.togglePin();
    }
  };

  const taskbar = wireTaskbar(o.family, { samara: o.samara, info, act, jobs: o.jobList, aang: o.aang, open: o.open, log: o.log });
  return { taskbar, hear };
}
