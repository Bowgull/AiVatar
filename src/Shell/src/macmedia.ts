// The mini player's music on the Mac (2026-10-28, the full port). On the PC the pet reads Windows' now-playing feed
// (NowPlaying.cs) and presses the media keys; the brain takes `media.now` only from the pet and sends `media.cmd` only to
// it. Here a second line to the brain says hello as the pet, reads Spotify (the app he plays on) through AppleScript and
// steers it the same way. Nothing else: every other message on that line is ignored, the main line does the rest.
//
// Cheap on purpose (this Mac is old): Spotify is asked nothing unless it is running (pgrep), once a second while the
// player shows and every five otherwise, and only a change goes to the brain. The cover is fetched once per track.
import { nativeImage, net } from 'electron';
import { execFile } from 'node:child_process';
import { CoreLink } from './link.ts';

type Now = { title: string; artist: string; album: string; status: 'playing' | 'paused' | 'stopped'; position: number; duration: number; volume: number; art: string };

function run(file: string, args: string[], ms = 4000): Promise<{ ok: boolean; out: string }> {
  return new Promise((resolve) => execFile(file, args, { timeout: ms }, (e, out) => resolve({ ok: !e, out: String(out) })));
}
// One line, tab-separated: the track's words, the state, where it is, how long, the volume and the cover's address.
const READ = [
  'tell application "Spotify"',
  'set t to current track',
  'return (name of t) & tab & (artist of t) & tab & (album of t) & tab & (player state as text) & tab & (player position as text) & tab & ((duration of t) as text) & tab & (sound volume as text) & tab & (artwork url of t)',
  'end tell',
];

export function readSpotify(line: string): Now | null {
  const p = line.replace(/\n$/, '').split('\t');
  if (p.length < 8) return null;
  const num = (s: string) => { const n = Number(String(s).replace(',', '.')); return Number.isFinite(n) ? n : 0; };
  const status = p[3] === 'playing' ? 'playing' : p[3] === 'paused' ? 'paused' : 'stopped';
  return { title: p[0]!.slice(0, 200), artist: p[1]!.slice(0, 200), album: p[2]!.slice(0, 200), status, position: num(p[4]!), duration: num(p[5]!) / 1000, volume: Math.max(0, Math.min(1, num(p[6]!) / 100)), art: /^https:\/\//.test(p[7]!) ? p[7]!.trim() : '' };
}

export class MacMedia {
  private readonly line: CoreLink;
  private last: Now | null = null;
  private sentArt = '';
  private running = false;
  private stopped = false;
  private timer: NodeJS.Timeout | null = null;
  /** The player window is showing: Spotify is read every second. */
  watching = false;

  constructor(port: number, stateDir: string) {
    this.line = new CoreLink({ port, stateDir, asPet: true, onMessage: (m) => { if (m.t === 'media.cmd') void this.cmd(m); }, onConnected: (up) => { if (up) { this.last = null; this.sentArt = ''; } } });
  }

  start(): void { this.line.start(); this.tick(); }
  stop(): void { this.stopped = true; if (this.timer) clearTimeout(this.timer); this.line.stop(); }
  /** Read now (after a key, so the player follows at once). */
  poke(): void { if (this.timer) clearTimeout(this.timer); this.timer = setTimeout(() => this.tick(), 250); }

  private async tick(): Promise<void> {
    if (this.stopped) return;
    try { await this.read(); } catch { /* next time */ }
    this.timer = setTimeout(() => this.tick(), this.watching ? 1000 : 5000);
  }

  private async read(): Promise<void> {
    const up = (await run('/usr/bin/pgrep', ['-x', 'Spotify'])).ok;
    if (!up) {
      if (this.running) { this.running = false; this.last = null; this.sentArt = ''; this.line.send({ t: 'media.now', v: 1, app: null } as never); }
      return;
    }
    this.running = true;
    const r = await run('/usr/bin/osascript', READ.flatMap((l) => ['-e', l]));
    const now = r.ok ? readSpotify(r.out) : null;
    if (!now) return;
    const was = this.last;
    // Only a change: a new track, play/pause, the volume, or a jump (more than 2 s off where it should be by now).
    const expected = was && was.status === 'playing' ? was.position + (this.watching ? 1 : 5) : was?.position ?? 0;
    const changed = !was || was.title !== now.title || was.artist !== now.artist || was.status !== now.status || Math.abs(was.volume - now.volume) > 0.01 || Math.abs(expected - now.position) > 2.5;
    this.last = now;
    if (!changed) return;
    const msg: Record<string, unknown> = { t: 'media.now', v: 1, app: 'spotify', spotify: true, title: now.title, artist: now.artist, album: now.album, status: now.status, position: now.position, duration: now.duration, at: Date.now(), canSeek: true, volume: now.volume };
    if (now.art !== this.sentArt) { this.sentArt = now.art; msg.thumb = now.art ? await cover(now.art) : null; }
    this.line.send(msg as never);
  }

  private async cmd(m: Record<string, unknown>): Promise<void> {
    const op = String(m.op ?? '');
    const say: Record<string, string> = { play: 'play', pause: 'pause', toggle: 'playpause', next: 'next track', prev: 'previous track' };
    let script: string | null = say[op] ? `tell application "Spotify" to ${say[op]}` : null;
    if (op === 'seek' && Number.isFinite(Number(m.position))) script = `tell application "Spotify" to set player position to ${Math.max(0, Number(m.position)).toFixed(1)}`;
    if (op === 'volume' && Number.isFinite(Number(m.volume))) script = `tell application "Spotify" to set sound volume to ${Math.round(Math.max(0, Math.min(1, Number(m.volume))) * 100)}`;
    if (!script || !(await run('/usr/bin/pgrep', ['-x', 'Spotify'])).ok) return;
    await run('/usr/bin/osascript', ['-e', script]);
    this.poke();
  }
}

/** The cover as a PNG data URL, 300 px at most (what the pet sends). Spotify's own image server, https only. */
async function cover(url: string): Promise<string | null> {
  try {
    const r = await net.fetch(url);
    if (!r.ok) return null;
    const img = nativeImage.createFromBuffer(Buffer.from(await r.arrayBuffer()));
    if (img.isEmpty()) return null;
    const s = img.getSize();
    return (s.width > 300 ? img.resize({ width: 300, quality: 'good' }) : img).toDataURL();
  } catch { return null; }
}
