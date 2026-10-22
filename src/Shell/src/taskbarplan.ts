// Pop-outs on Samara's taskbar, the thinking part (sheet 66 A, docs/TASKBAR-POPOUTS-RESEARCH.md "DECIDED"). No Electron
// in here, so the unit tests load it as it is (test/taskbarplan.test.ts); taskbar.ts does what this says.
//
// His picks (2026-10-22): every pop-out (video, Claude jobs, the mini player, notes, timers, pinned snips) rides on Samara's
// lantern. A loose one has its own picture in the hover row, with its own buttons; a SNAPPED GROUP is ONE picture of the
// whole group, named like "Video + Job + Player", its other members kept off the taskbar while joined; it carries the
// player's buttons when the player is in it. A running Claude job draws its % under the lantern.

export interface Box { x: number; y: number; width: number; height: number }

/** The order kinds are named in a group's label (his example: "Video + Job + Player") and the order a lead is picked in. */
export const KIND_ORDER = ['video', 'job', 'player', 'timer', 'note', 'snip'] as const;
const LEAD_ORDER = ['video', 'player', 'job', 'timer', 'note', 'snip'];
export const KIND_WORD: Record<string, [string, string]> = {
  video: ['Video', 'Videos'], job: ['Job', 'Jobs'], player: ['Player', 'Players'],
  timer: ['Timer', 'Timers'], note: ['Note', 'Notes'], snip: ['Snip', 'Snips'],
};
const rank = (order: readonly string[], k: string) => { const i = order.indexOf(k); return i < 0 ? order.length : i; };

/** "Video + Job + Player"; two of a kind: "Video + 2 Jobs". Unknown kinds are left out of the name. */
export function groupLabel(kinds: string[]): string {
  const n = new Map<string, number>();
  for (const k of kinds) if (KIND_WORD[k]) n.set(k, (n.get(k) ?? 0) + 1);
  const parts = [...n.keys()].sort((a, b) => rank(KIND_ORDER, a) - rank(KIND_ORDER, b))
    .map((k) => (n.get(k)! > 1 ? `${n.get(k)} ${KIND_WORD[k]![1]}` : KIND_WORD[k]![0]));
  return parts.join(' + ') || 'Pop-outs';
}

/** The window that stands for a group: the video, else the player, else a job, timer, note, snip; ties by id. */
export function leadOf(members: { id: string; kind: string }[]): string {
  const s = [...members].sort((a, b) => rank(LEAD_ORDER, a.kind) - rank(LEAD_ORDER, b.kind) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return s[0]?.id ?? '';
}

export interface Seen { id: string; kind: string; visible: boolean; group: string[] }
export interface Group { lead: string; ids: string[]; kinds: string[]; label: string }
export interface Plan { loose: string[]; groups: Group[]; hidden: string[] }

/**
 * Who goes where on the taskbar. Only shown windows count: a joined member that is hidden is neither in its group's
 * picture nor on the taskbar. A group of one shown member is just loose.
 */
export function planTaskbar(seen: Seen[]): Plan {
  const shown = new Map(seen.filter((s) => s.visible).map((s) => [s.id, s]));
  const done = new Set<string>();
  const plan: Plan = { loose: [], groups: [], hidden: seen.filter((s) => !s.visible).map((s) => s.id) };
  for (const s of [...shown.values()].sort((a, b) => (a.id < b.id ? -1 : 1))) {
    if (done.has(s.id)) continue;
    const ids = [...new Set([s.id, ...s.group])].filter((x) => shown.has(x)).sort();
    for (const x of ids) done.add(x);
    if (ids.length < 2) { plan.loose.push(s.id); continue; }
    const m = ids.map((id) => ({ id, kind: shown.get(id)!.kind }));
    const kinds = m.map((x) => x.kind);
    plan.groups.push({ lead: leadOf(m), ids, kinds, label: groupLabel(kinds) });
  }
  return plan;
}

// ---------------------------------------------------------------- names under each picture

/** 6:52, 1:05:00. */
export function fmtLeft(ms: number): string {
  const s = Math.max(0, Math.ceil((Number.isFinite(ms) ? ms : 0) / 1000));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = s % 60;
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(x).padStart(2, '0')}` : `${m}:${String(x).padStart(2, '0')}`;
}
const clean = (v: unknown, n = 60) => (typeof v === 'string' ? v.replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n) : '');

export interface Timer { id: string; label: string; total: number; end: number; paused: number }
/** Left on a timer: what it held when paused, else to its end. */
export const timerLeft = (t: Timer, now: number) => (t.paused > 0 ? t.paused : Math.max(0, t.end - now));

/** One job's state for the taskbar, from the brain's claude.jobs entry. */
export interface JobNow { title: string; active: boolean; phase: string; pct: number | null; stalled: boolean }
export function jobNow(j: Record<string, unknown> | null | undefined, now: number): JobNow {
  if (!j || typeof j !== 'object') return { title: 'Claude', active: false, phase: 'idle', pct: null, stalled: false };
  const phase = typeof j.phase === 'string' ? j.phase : 'idle';
  const title = clean(j.title) || clean(j.project) || 'Claude';
  const pr = j.progress as { done?: unknown; total?: unknown } | null | undefined;
  let pct: number | null = null;
  if (Number.isFinite(j.percent)) pct = Number(j.percent);
  else if (pr && Number(pr.total) > 0 && Number.isFinite(Number(pr.done))) pct = (Number(pr.done) / Number(pr.total)) * 100;
  if (pct !== null) pct = Math.max(0, Math.min(100, Math.round(pct)));
  // The bubble's own stall rule (claudejobs.js stalledNoList): nothing heard for longer than the brain's own limit.
  const a = j.activity as { aliveAt?: unknown; stallMs?: unknown; now?: unknown } | null | undefined;
  const waiting = /^Waiting for/.test(String(a?.now ?? ''));
  const stalled = phase === 'working' && !waiting && !!a && Number.isFinite(a.aliveAt) && Number.isFinite(a.stallMs) && now - Number(a.aliveAt) > Number(a.stallMs);
  return { title, active: phase === 'working' || phase === 'paused', phase, pct, stalled };
}

/** What a loose pop-out is called in the hover row (sheet 66: "Waymark · 50%", "Flask · 6:52", the song, the note). */
export function memberLabel(kind: string, info: { title?: string; artist?: string; job?: JobNow; timer?: Timer; now?: number }): string {
  const now = info.now ?? Date.now();
  if (kind === 'job' && info.job) return info.job.pct !== null && info.job.active ? `${info.job.title} · ${info.job.pct}%` : info.job.title;
  if (kind === 'timer' && info.timer) return `${clean(info.timer.label, 40) || 'Timer'} · ${fmtLeft(timerLeft(info.timer, now))}`;
  if (kind === 'player') { const t = clean(info.title), a = clean(info.artist, 40); return t ? (a ? `${t} · ${a}` : t) : 'Music'; }
  return clean(info.title, 80) || (KIND_WORD[kind]?.[0] ?? 'Pop-out');
}

// ---------------------------------------------------------------- the bar under the lantern

export interface Bar { value: number; mode: 'none' | 'normal' | 'paused' | 'indeterminate' }
/**
 * One bar per button (Windows' own rule): a paused or stalled job wins (amber), then the job FURTHEST BEHIND (Windows'
 * rule between two normal bars); a running job with no % yet is the moving bar; no running job, no bar.
 */
export function barFor(jobs: JobNow[]): Bar {
  const act = jobs.filter((j) => j.active);
  if (!act.length) return { value: -1, mode: 'none' };
  const slow = act.filter((j) => j.phase === 'paused' || j.stalled);
  const pick = (l: JobNow[]) => l.filter((j) => j.pct !== null).sort((a, b) => a.pct! - b.pct!)[0];
  if (slow.length) { const j = pick(slow); return { value: Math.max(0.03, (j?.pct ?? 50) / 100), mode: 'paused' }; }
  const j = pick(act);
  return j ? { value: Math.max(0.01, j.pct! / 100), mode: 'normal' } : { value: 1, mode: 'indeterminate' };
}

// ---------------------------------------------------------------- the buttons under a picture

/** Button ids (the helper's spec takes 1..99) and the icon each one wears (taskbaricons.ts GLYPHS). */
export const BTN = {
  prev: 1, playpause: 2, next: 3, jobPause: 4, jobOpen: 5, timerPause: 6, timerAdd: 7, timerStop: 8, videoPlay: 9, videoPin: 10,
} as const;
export interface Button { id: number; icon: string; tip: string }

export interface MemberState { playing?: boolean; paused?: boolean; pinned?: boolean; active?: boolean }
/** His list (sheet 66 A): player prev / play-pause / next, job pause / open, timer pause / +1 min / stop; the video its play and pin. */
export function buttonsFor(kind: string, s: MemberState = {}): Button[] {
  if (kind === 'player') return [
    { id: BTN.prev, icon: 'prev', tip: 'Previous' },
    s.playing ? { id: BTN.playpause, icon: 'pause', tip: 'Pause' } : { id: BTN.playpause, icon: 'play', tip: 'Play' },
    { id: BTN.next, icon: 'next', tip: 'Next' },
  ];
  if (kind === 'job') return [
    ...(s.active === false ? [] : [s.paused ? { id: BTN.jobPause, icon: 'play', tip: 'Resume' } : { id: BTN.jobPause, icon: 'pause', tip: 'Pause' }]),
    { id: BTN.jobOpen, icon: 'open', tip: 'Open in Claude' },
  ];
  if (kind === 'timer') return [
    s.paused ? { id: BTN.timerPause, icon: 'play', tip: 'Go on' } : { id: BTN.timerPause, icon: 'pause', tip: 'Pause' },
    { id: BTN.timerAdd, icon: 'plus', tip: 'One more minute' },
    { id: BTN.timerStop, icon: 'stop', tip: 'Stop' },
  ];
  if (kind === 'video') return [
    s.playing === false ? { id: BTN.videoPlay, icon: 'play', tip: 'Play' } : { id: BTN.videoPlay, icon: 'pause', tip: 'Pause' },
    { id: BTN.videoPin, icon: 'pin', tip: s.pinned ? 'Unpin' : 'Pin on top' },
  ];
  return [];
}

/** Whose buttons a group's picture carries: the player's if it is in the group, else the lead's own. */
export function groupButtonsOwner(g: { lead: string; ids: string[] }, kindOf: (id: string) => string): string {
  return g.ids.find((id) => kindOf(id) === 'player') ?? g.lead;
}

// ---------------------------------------------------------------- the group's one picture

/**
 * Where each member goes in a picture at most maxW x maxH: the group's own arrangement (its panels as they sit on the
 * screen), shrunk to fit and never grown past `cap` (1 = its real size). Whole pixels; the picture is just big enough.
 */
export function fitLayout(boxes: Box[], maxW: number, maxH: number, cap = 1): { width: number; height: number; scale: number; rects: Box[] } {
  if (!boxes.length || !(maxW > 0) || !(maxH > 0)) return { width: 1, height: 1, scale: 0, rects: boxes.map(() => ({ x: 0, y: 0, width: 0, height: 0 })) };
  const L = Math.min(...boxes.map((b) => b.x)), T = Math.min(...boxes.map((b) => b.y));
  const R = Math.max(...boxes.map((b) => b.x + b.width)), B = Math.max(...boxes.map((b) => b.y + b.height));
  const W = Math.max(1, R - L), H = Math.max(1, B - T);
  const scale = Math.min(maxW / W, maxH / H, cap);
  const width = Math.max(1, Math.min(maxW, Math.round(W * scale))), height = Math.max(1, Math.min(maxH, Math.round(H * scale)));
  // Edges, not sizes, are rounded, so neighbours stay flush in the picture as they are on the screen.
  const rects = boxes.map((b) => {
    const x0 = Math.round((b.x - L) * scale), y0 = Math.round((b.y - T) * scale);
    const x1 = Math.min(width, Math.round((b.x + b.width - L) * scale)), y1 = Math.min(height, Math.round((b.y + b.height - T) * scale));
    return { x: x0, y: y0, width: Math.max(0, x1 - x0), height: Math.max(0, y1 - y0) };
  });
  return { width, height, scale, rects };
}

/** The bounding box of some boxes (the group on the screen). */
export function boundsOf(boxes: Box[]): Box {
  const L = Math.min(...boxes.map((b) => b.x)), T = Math.min(...boxes.map((b) => b.y));
  return { x: L, y: T, width: Math.max(...boxes.map((b) => b.x + b.width)) - L, height: Math.max(...boxes.map((b) => b.y + b.height)) - T };
}

/**
 * Copy one premultiplied BGRA picture into another at (x, y), over what is there (src + dst * (1 - a)). Clipped to the
 * destination. Members never overlap, so this is mostly a plain copy.
 */
export function blit(dst: Uint8Array, dw: number, dh: number, src: Uint8Array, sw: number, sh: number, x: number, y: number): void {
  for (let r = 0; r < sh; r++) {
    const ty = y + r;
    if (ty < 0 || ty >= dh) continue;
    for (let c = 0; c < sw; c++) {
      const tx = x + c;
      if (tx < 0 || tx >= dw) continue;
      const si = (r * sw + c) * 4, di = (ty * dw + tx) * 4, a = src[si + 3]!;
      if (a === 255) { dst[di] = src[si]!; dst[di + 1] = src[si + 1]!; dst[di + 2] = src[si + 2]!; dst[di + 3] = 255; continue; }
      if (a === 0) continue;
      const k = 1 - a / 255;
      for (let ch = 0; ch < 4; ch++) dst[di + ch] = Math.min(255, Math.round(src[si + ch]! + dst[di + ch]! * k));
    }
  }
}

// ---------------------------------------------------------------- the right-click list's Pop-outs section

export const POPOUT_TASKS = ['popouts-show', 'popouts-hide', 'popouts-gather', 'new-note', 'timer', 'player'] as const;
export type PopoutTask = typeof POPOUT_TASKS[number];
/** New note, Timer and Music player need Aang (notes and timers are his): listed only while he runs. */
export const NEEDS_AANG: ReadonlySet<PopoutTask> = new Set(['new-note', 'timer', 'player']);
export const isPopoutTask = (t: unknown): t is PopoutTask => typeof t === 'string' && (POPOUT_TASKS as readonly string[]).includes(t);
