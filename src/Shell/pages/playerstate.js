// The Spotify mini player's own sums (sheet 59, 2026-10-22). No drawing and no DOM: the page (miniplayer.js) and the
// unit tests (test/miniplayer.test.ts) both use these.
//
// The pet sends `media.now` only when something changes (play, pause, a new song, a seek, about once a second at most),
// each with the position that was true at `at` (unix ms). Between updates the time is worked out here, so the big time
// and the seek bead move smoothly every frame. A fresh update that is only a little off what is showing (Windows' feed
// lags by up to a second) is eased in over 400 ms instead of making the time jump back and forth; a real jump (a seek,
// a new song) is taken at once.

export const VIS = ['bars', 'scene', 'off'];
/** The VIS key: BARS -> SCENE -> OFF -> BARS. Anything unknown starts again at BARS. */
/** @param {string} v */
export function nextVis(v) { const i = VIS.indexOf(v); return VIS[(i + 1) % VIS.length]; }

export const SCENES = ['campfire', 'skate', 'rain', 'fishing'];
/** @param {string} s */
export function nextScene(s) { const i = SCENES.indexOf(s); return SCENES[(i + 1) % SCENES.length]; }

/** "1:42", "61:05", never negative, never NaN. */
/** @param {number} sec */
export function fmtTime(sec) {
  const s = Number.isFinite(sec) && sec > 0 ? Math.floor(sec) : 0;
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

const SMALL = 1.5;      // seconds: closer than this, ease in; further, jump
const EASE_MS = 400;

/**
 * @typedef {{ app: string | null, title: string, artist: string, album: string, status: string, position: number, duration: number,
 *   at: number, canSeek: boolean, volume: number | null, spotify: boolean }} PlayState
 */
export class Timeline {
  constructor() {
    /** @type {PlayState} */
    this.s = { app: null, title: '', artist: '', album: '', status: 'stopped', position: 0, duration: 0, at: 0, canSeek: false, volume: null, spotify: false };
    this.fix = 0;          // seconds still to ease away (shown minus true)
    this.fixAt = 0;
    /** @type {{ position: number, at: number, until: number } | null} */
    this.hold = null;      // an optimistic seek
  }
  get playing() { return this.s.status === 'playing'; }
  get state() { return this.s; }

  /** The true position now, from the last update. */
  /** @param {number} now */
  truth(now) {
    const s = this.s;
    let p = s.position;
    if (this.playing && s.at > 0) p += Math.max(0, now - s.at) / 1000;
    return s.duration > 0 ? Math.min(s.duration, Math.max(0, p)) : Math.max(0, p);
  }

  /** What to show now: the truth, plus whatever is still being eased away, or a seek he just made. */
  /** @param {number} now */
  shown(now) {
    if (this.hold && now < this.hold.until) {
      const p = this.hold.position + (this.playing ? (now - this.hold.at) / 1000 : 0);
      return this.s.duration > 0 ? Math.min(this.s.duration, p) : p;
    }
    this.hold = null;
    const k = this.fix ? Math.max(0, 1 - (now - this.fixAt) / EASE_MS) : 0;
    if (!k) this.fix = 0;
    const p = this.truth(now) + this.fix * k;
    return this.s.duration > 0 ? Math.min(this.s.duration, Math.max(0, p)) : Math.max(0, p);
  }

  /** Progress 0..1 for the seek bar. */
  /** @param {number} now */
  frac(now) { return this.s.duration > 0 ? Math.min(1, this.shown(now) / this.s.duration) : 0; }

  /**
   * A `media.now` from the brain. Returns what changed: 'song' (new title, or nothing playing), 'status', 'time', or ''.
   * Fields the update leaves out keep their last value (the cover is handled by the page).
   */
  /** @param {any} m @param {number} now @returns {string} */
  take(m, now) {
    if (!m || typeof m !== 'object' || m.t !== 'media.now') return '';
    const before = this.shown(now), s = this.s;
    if (m.app === null) {
      const had = !!s.app;
      this.s = { ...s, app: null, title: '', artist: '', album: '', status: 'stopped', position: 0, duration: 0, at: 0, canSeek: false };
      this.fix = 0; this.hold = null;
      return had ? 'song' : '';
    }
    /** @type {(x: unknown, d: any) => any} */
    const str = (x, d) => (typeof x === 'string' ? x : d);
    /** @type {(x: unknown, d: number) => number} */
    const num = (x, d) => (typeof x === 'number' && Number.isFinite(x) ? x : d);
    const next = {
      app: str(m.app, s.app), spotify: m.spotify === undefined ? s.spotify : m.spotify === true,
      title: str(m.title, s.title), artist: str(m.artist, s.artist), album: str(m.album, s.album),
      status: typeof m.status === 'string' ? m.status : s.status,
      position: num(m.position, s.position), duration: Math.max(0, num(m.duration, s.duration)), at: num(m.at, s.at || now),
      canSeek: m.canSeek === undefined ? s.canSeek : m.canSeek === true,
      volume: m.volume === undefined ? s.volume : (typeof m.volume === 'number' && Number.isFinite(m.volume) ? Math.max(0, Math.min(1, m.volume)) : null),
    };
    const song = next.title !== s.title || next.artist !== s.artist || next.app !== s.app;
    const status = next.status !== s.status;
    this.s = next;
    if (song) { this.fix = 0; this.hold = null; return 'song'; }
    // A seek he made is kept until the feed agrees (or 2 s pass).
    if (this.hold && Math.abs(this.truth(now) - this.hold.position - (this.playing ? (now - this.hold.at) / 1000 : 0)) < SMALL) this.hold = null;
    const gap = before - this.truth(now);
    if (Math.abs(gap) < SMALL && Math.abs(gap) > 0.01) { this.fix = gap; this.fixAt = now; } else this.fix = 0;
    return status ? 'status' : 'time';
  }

  /** He let go of the seek bead: show it there at once, the feed catches up. */
  /** @param {number} position @param {number} now */
  seekTo(position, now) {
    const d = this.s.duration;
    const p = Math.max(0, d > 0 ? Math.min(d, position) : position);
    this.hold = { position: p, at: now, until: now + 2000 };
    this.fix = 0;
    return p;
  }
}

/**
 * The title marquee (sheet 59 motion 1): 1 px every 60 ms after a 1.5 s rest at the start, only when the title is wider
 * than its window; it runs round with a gap and rests again each time it comes back to the start. Whole pixels.
 */
/** @param {number} ms @param {number} textW @param {number} boxW */
export function marqueeOffset(ms, textW, boxW, gap = 36) {
  if (!(textW > boxW) || !(ms > 0)) return 0;
  const lap = textW + gap, REST = 1500, STEP = 60;
  const lapMs = REST + lap * STEP;
  const inLap = ms % lapMs;
  return inLap < REST ? 0 : Math.floor((inLap - REST) / STEP) % lap;
}

/** A spring (response / damping fraction, like the family's): where it is, 0..1, at t seconds. */
/** @param {number} t */
export function spring(t, response = 0.5, zeta = 0.825) {
  if (t <= 0) return 0;
  const w = 2 * Math.PI / response, wd = w * Math.sqrt(1 - zeta * zeta);
  return 1 - Math.exp(-zeta * w * t) * (Math.cos(wd * t) + zeta / Math.sqrt(1 - zeta * zeta) * Math.sin(wd * t));
}

/**
 * The bars (Winamp's, sheet 59 motion 2): 14 bars that drop fast while their peak caps hang 300 ms then fall slowly.
 * There is no sound to read (Windows' feed has none), so the levels are a calm made-up dance that only moves while playing.
 */
/** @param {number} t */
export function barLevels(t, n = 14, seed = 7) {
  /** @type {number[]} */
  const out = [];
  for (let i = 0; i < n; i++) {
    const base = 0.78 - (i / n) * 0.45;
    const a = Math.sin(t * (2.1 + (i * 7 + seed) % 5 * 0.37) + i * 1.7), b = Math.sin(t * (5.3 + (i * 3) % 4 * 0.61) + i * 0.9);
    out.push(Math.max(0.06, Math.min(1, base + a * 0.18 + b * 0.12)));
  }
  return out;
}
export class Peaks {
  constructor(n = 14) { /** @type {number[]} */ this.p = new Array(n).fill(0); this.hold = new Array(n).fill(0); }
  /** dt in seconds; levels 0..1. Returns the caps. */
  /** @param {number[]} levels @param {number} dt */
  step(levels, dt) {
    for (let i = 0; i < levels.length; i++) {
      if (levels[i] >= this.p[i]) { this.p[i] = levels[i]; this.hold[i] = 0.3; }
      else if (this.hold[i] > 0) this.hold[i] -= dt;
      else this.p[i] = Math.max(levels[i], this.p[i] - dt * 0.6);
    }
    return this.p.slice();
  }
}
