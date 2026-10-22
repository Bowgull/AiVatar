// Spotify Connect for the mini player (2026-10-22). His question, using it: "How does the music player pick up something
// in Spotify if it's playing on my phone or my Mac or my smart speakers?" Windows' now-playing (the pet's `media.now`)
// only sees THIS PC. So, while the player window is open and showing and nothing plays on the PC, the brain asks
// Spotify's Web API what is playing on his account (/me/player) every 5 s and the player shows that, with the device it
// is on; its keys then steer that device through the Web API (Premium, which he has). The PC's own feed always wins
// when the PC is playing: it is instant and costs nothing.
//
// Three small parts, no network of their own (the Spotify class is injected), so the tests drive them with fakes:
//   readPlayback: Spotify's answer -> what the player needs (RemoteNow);
//   chooseSource: the PC or the remote device;
//   ConnectPoller: when to ask (visible + PC quiet), the back-off, 429's Retry-After, one plain line when it fails;
//   MediaMux: the ONE `media.now` stream the Shell sees, from whichever source is chosen.
import type { MediaNow } from './media.ts';
import { MediaState } from './media.ts';

export type DeviceKind = 'phone' | 'computer' | 'speaker' | 'tv' | 'car' | 'other';
/** Spotify's device types, folded into the player's six pixel icons. */
export function deviceKind(type: unknown): DeviceKind {
  const t = String(type ?? '').toLowerCase();
  if (t === 'smartphone' || t === 'tablet') return 'phone';
  if (t === 'computer') return 'computer';
  if (t === 'speaker' || t === 'avr' || t === 'stb' || t === 'audiodongle' || t === 'castaudio') return 'speaker';
  if (t === 'tv' || t === 'castvideo' || t === 'gameconsole') return 'tv';
  if (t === 'automobile') return 'car';
  return 'other';
}

export interface RemoteDevice { id: string; name: string; kind: DeviceKind; volume: number | null; thisPc: boolean }
export interface RemoteNow {
  device: RemoteDevice;
  playing: boolean;
  /** The track's id (or its name when it has none): a new one means a new cover. */
  track: string;
  title: string; artist: string; album: string;
  /** Seconds, true at `at` (unix ms). */
  position: number; duration: number; at: number;
  canSeek: boolean;
  /** The smallest cover at least 64 px (Spotify's image host), or null. */
  coverUrl: string | null;
}

const str = (x: unknown, max = 200) => (typeof x === 'string' ? x.slice(0, max) : '');
const sameName = (a: string, b: string) => !!a && !!b && a.trim().toLowerCase() === b.trim().toLowerCase();

/**
 * Spotify's /me/player answer as the player needs it, or null when there is nothing to show. `host` is this PC's name:
 * Spotify's desktop app names its device after the computer, so a device by that name is this PC (its feed is the pet's).
 */
export function readPlayback(j: any, now: number, host: string): RemoteNow | null {
  if (!j || typeof j !== 'object' || !j.device || typeof j.device !== 'object') return null;
  const d = j.device, it = j.item && typeof j.item === 'object' ? j.item : null;
  const id = str(d.id, 128);
  if (!id) return null;
  const vol = typeof d.volume_percent === 'number' && Number.isFinite(d.volume_percent) && d.supports_volume !== false ? Math.max(0, Math.min(100, d.volume_percent)) / 100 : null;
  const device: RemoteDevice = { id, name: str(d.name, 60) || 'Spotify', kind: deviceKind(d.type), volume: vol, thisPc: deviceKind(d.type) === 'computer' && sameName(str(d.name), host) };
  const images: any[] = Array.isArray(it?.album?.images) ? it.album.images : Array.isArray(it?.images) ? it.images : Array.isArray(it?.show?.images) ? it.show.images : [];
  const fit = images.filter((i) => i && typeof i.url === 'string').sort((a, b) => (Number(a.width) || 0) - (Number(b.width) || 0));
  const cover = fit.find((i) => (Number(i.width) || 0) >= 64) ?? fit.at(-1) ?? null;
  const artists = Array.isArray(it?.artists) ? it.artists.map((a: any) => str(a?.name)).filter(Boolean).join(', ') : str(it?.show?.name);
  const ts = typeof j.timestamp === 'number' && j.timestamp > 0 && Math.abs(now - j.timestamp) < 60_000 ? j.timestamp : now;
  return {
    device, playing: j.is_playing === true,
    track: str(it?.id, 64) || str(it?.uri, 128) || str(it?.name),
    title: str(it?.name), artist: artists, album: str(it?.album?.name) || str(it?.show?.name),
    position: Math.max(0, (Number(j.progress_ms) || 0) / 1000), duration: Math.max(0, (Number(it?.duration_ms) || 0) / 1000), at: ts,
    canSeek: j.actions?.disallows?.seeking !== true && !!it,
    coverUrl: cover ? String(cover.url) : null,
  };
}

export type Source = 'pc' | 'remote' | 'none';
/**
 * Which feed the player shows. The PC when it plays (instant, free); else a remote device that plays; else what is on
 * the PC, paused; else the remote device, paused. A remote "device" that is this very PC is the PC's (the pet sees it).
 */
export function chooseSource(pc: MediaNow | null, remote: RemoteNow | null): Source {
  const pcHas = !!pc && pc.app !== null;
  const pcPlaying = pcHas && pc!.status === 'playing';
  const rem = remote && !remote.device.thisPc ? remote : null;
  if (pcPlaying) return 'pc';
  if (rem?.playing) return 'remote';
  if (pcHas) return 'pc';
  if (rem && rem.title) return 'remote';
  return 'none';
}

// ------------------------------------------------------------------------------------------------ when to ask

export interface PollerError { kind?: string; retryAfter?: number }
export interface PollerOptions {
  fetch: () => Promise<RemoteNow | null>;
  onState: (r: RemoteNow | null) => void;
  /** One plain line for the player, or null when all is well again. */
  onNote: (text: string | null) => void;
  everyMs?: number;
  /** Replaced by tests. */
  setTimer?: (f: () => void, ms: number) => unknown;
  clearTimer?: (t: unknown) => void;
}
export const POLL_MS = 5000, MAX_BACKOFF_MS = 60_000;

/**
 * Asks Spotify only while it is worth it: the player window is open AND showing, and the PC itself is not playing.
 * Every 5 s; after a failure 10, 20, 40, then every 60 s, with one plain line in the player; a 429 waits what Spotify
 * said (Retry-After) and never less than 5 s. A sign-in that is gone stops it (the line says what to do) until the window
 * is opened again. Hidden or PC playing: nothing is asked at all.
 */
export class ConnectPoller {
  private readonly o: Required<Omit<PollerOptions, 'everyMs'>> & { everyMs: number };
  private timer: unknown = null;
  private busy = false;
  private visible = false;
  private pcPlaying = false;
  private dead = false;
  private failures = 0;
  /** The last wait chosen (ms), for the tests and the log. */
  lastDelay = 0;
  constructor(o: PollerOptions) {
    this.o = {
      ...o, everyMs: o.everyMs ?? POLL_MS,
      setTimer: o.setTimer ?? ((f, ms) => { const t = setTimeout(f, ms); (t as { unref?: () => void }).unref?.(); return t; }),
      clearTimer: o.clearTimer ?? ((t) => clearTimeout(t as NodeJS.Timeout)),
    };
  }
  get running(): boolean { return this.timer !== null || this.busy; }
  private get wanted(): boolean { return this.visible && !this.pcPlaying && !this.dead; }

  /** The player window showing or not. Showing again also gives a stopped sign-in another go. */
  setVisible(v: boolean): void {
    if (v && !this.visible) { this.dead = false; this.failures = 0; }
    this.visible = v;
    this.kick(0);
  }
  /** The PC's own feed says it is playing: its feed is used and Spotify is not asked. */
  setPcPlaying(p: boolean): void {
    if (p === this.pcPlaying) return;
    this.pcPlaying = p;
    this.kick(p ? 0 : 300);
  }
  /** Just after a key acted on the remote device: look again soon, so the player follows. */
  soon(ms = 700): void { if (this.wanted && !this.busy && this.failures === 0) this.kick(ms); }

  private stop(): void { if (this.timer !== null) { this.o.clearTimer(this.timer); this.timer = null; } }
  private kick(ms: number): void {
    this.stop();
    if (this.wanted && !this.busy) this.later(ms);
  }
  private later(ms: number): void {
    this.lastDelay = ms;
    this.timer = this.o.setTimer(() => { this.timer = null; void this.run(); }, ms);
  }
  async run(): Promise<void> {
    if (!this.wanted || this.busy) return;
    this.busy = true;
    let next = this.o.everyMs;
    try {
      const r = await this.o.fetch();
      this.failures = 0;
      this.o.onNote(null);
      this.o.onState(r);
    } catch (e) {
      const err = (e ?? {}) as PollerError;
      if (err.kind === 'none' || err.kind === 'signin') {
        this.dead = true;
        this.o.onNote(err.kind === 'none' ? 'Spotify isn’t connected (tools\\spotify-setup.cmd)' : 'Spotify sign-in expired (run tools\\spotify-setup.cmd)');
        this.o.onState(null);
      } else if (err.kind === 'rate') {
        next = Math.max(this.o.everyMs, Math.round((err.retryAfter ?? 30) * 1000));
      } else {
        this.failures++;
        next = Math.min(MAX_BACKOFF_MS, this.o.everyMs * 2 ** this.failures);
        this.o.onNote('Can’t reach Spotify right now');
      }
    } finally {
      this.busy = false;
    }
    this.stop();
    if (this.wanted) this.later(next);
  }
}

// ------------------------------------------------------------------------------------------------ one stream

export type PlayerNow = MediaNow & { source?: Source; device?: { name: string; kind: DeviceKind } | null };

/**
 * The ONE `media.now` stream the Shell gets. The pet's updates pass through as they came (cover only when it changes)
 * while the PC is the source; the remote device's state is turned into the same shape. Switching source sends the whole
 * picture (cover included), so the player never mixes a PC title with a phone's cover.
 */
export class MediaMux {
  readonly pc = new MediaState();
  private remote: RemoteNow | null = null;
  private src: Source = 'none';
  private coverFor = '';
  private coverData: string | null = null;
  private readonly send: (m: PlayerNow) => void;
  constructor(send: (m: PlayerNow) => void) { this.send = send; }

  get source(): Source { return this.src; }
  get remoteNow(): RemoteNow | null { return this.remote; }
  /** What the pet says: true when the PC is playing. */
  fromPc(m: MediaNow): void {
    this.pc.take(m);
    const s = chooseSource(this.pc.now(), this.remote);
    if (s !== this.src) { this.src = s; this.send(this.full()); return; }
    if (s === 'pc') this.send({ ...m, source: 'pc' });
  }
  get pcPlaying(): boolean { const p = this.pc.now(); return !!p && p.app !== null && p.status === 'playing'; }
  /** A fresh answer from Spotify (null: nothing playing on his account). Returns true when its cover is wanted. */
  fromRemote(r: RemoteNow | null): boolean {
    const was = this.remote;
    this.remote = r;
    const s = chooseSource(this.pc.now(), r);
    const newTrack = !!r && r.track !== this.coverFor;
    if (newTrack) { this.coverFor = r!.track; this.coverData = null; }
    if (s !== this.src) { this.src = s; this.send(this.full()); }
    else if (s === 'remote') this.send({ ...this.remoteMsg(r!), ...(newTrack || was?.device.id !== r!.device.id ? { thumb: this.coverData } : {}) });
    return newTrack && !!r?.coverUrl;
  }
  /** The cover of a remote track arrived (a data URL), shown if that track is still the one. */
  cover(track: string, data: string | null): void {
    if (track !== this.coverFor) return;
    this.coverData = data;
    if (this.src === 'remote' && this.remote) this.send({ ...this.remoteMsg(this.remote), thumb: data });
  }
  /** Everything, for a switch or a Shell that just connected. */
  full(): PlayerNow {
    if (this.src === 'remote' && this.remote) return { ...this.remoteMsg(this.remote), thumb: this.coverData };
    const p = this.pc.now();
    if (this.src === 'pc' && p) return { ...p, source: 'pc', device: null };
    return { t: 'media.now', v: 1, app: null, source: 'none', device: null };
  }
  private remoteMsg(r: RemoteNow): PlayerNow {
    return {
      t: 'media.now', v: 1, app: 'spotify', spotify: true, title: r.title, artist: r.artist, album: r.album,
      status: r.playing ? 'playing' : 'paused', position: r.position, duration: r.duration, at: r.at, canSeek: r.canSeek,
      volume: r.device.volume, source: 'remote', device: { name: r.device.name, kind: r.device.kind },
    };
  }
}

/** A device list for the player's menu: id, name, kind, the active one. Restricted ids and odd entries left out. */
export function readDevices(list: any[]): { id: string; name: string; kind: DeviceKind; active: boolean }[] {
  return (Array.isArray(list) ? list : [])
    .filter((d) => d && typeof d.id === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(d.id) && d.is_restricted !== true)
    .slice(0, 12)
    .map((d) => ({ id: d.id, name: str(d.name, 60) || 'Spotify', kind: deviceKind(d.type), active: d.is_active === true }));
}
/** A device id from the Shell, or null. */
export function checkDeviceId(x: unknown): string | null { return typeof x === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(x) ? x : null; }
