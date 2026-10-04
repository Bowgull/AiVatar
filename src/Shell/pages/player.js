// Driving whatever is playing, from Aang's own controls.
//
// The honest situation, and why this file is not simply "video.play()":
//
//   YouTube  has a documented way in. With enablejsapi=1 on the address, the player listens for
//            postMessage commands and sends its state back. Everything works: play, pause, seek,
//            volume, duration.
//   Twitch   has the same idea with a different vocabulary, and its live streams have nowhere to seek
//            to, so the scrub groove is full and unmoving (sheet 4 says exactly this).
//   A paid   service is NOT in this page at all: it refuses to be framed, so it is a separate view
//   service  underneath, and this page cannot reach it. The main process drives it instead, by asking
//            its own <video> element directly.
//
// A control that cannot work is DIMMED, never hidden and never faked. He should be able to see that a
// button exists and that it is not available here, rather than press something that silently does
// nothing.
const el = id => document.getElementById(id);

export class Player {
  constructor() {
    this.kind = 'none';          // 'youtube' | 'twitch' | 'elsewhere' | 'none'
    this.frame = null;
    this.state = { playing: false, at: 0, length: 0, volume: 1, muted: false, live: false };
    this.onUpdate = () => {};
    window.addEventListener('message', e => this.hear(e));
  }

  /** Point at a new video. `frame` is the iframe, or null when the video is a separate view. */
  attach(kind, frame, live) {
    this.kind = kind;
    this.frame = frame;
    this.state = { playing: true, at: 0, length: 0, volume: 1, muted: false, live: Boolean(live) };
    if (kind === 'youtube') this.listenYouTube();
    this.onUpdate(this.state);
  }

  /** Whether this player will answer at all. The controls dim themselves from this. */
  get canDrive() { return this.kind === 'youtube' || this.kind === 'twitch'; }
  /** A live stream has nowhere to seek to. */
  get canSeek() { return this.canDrive && !this.state.live && this.state.length > 0; }

  // ---------------------------------------------------------------- YouTube
  listenYouTube() {
    // The player only starts talking once it is told someone is listening.
    const hello = () => this.post({ event: 'listening', id: 1, channel: 'widget' });
    hello();
    // It can miss the first one while it is still loading, so ask again for a few seconds.
    let tries = 0;
    const again = setInterval(() => { hello(); if (++tries > 10 || this.state.length) clearInterval(again); }, 500);
  }

  post(message) {
    try { this.frame?.contentWindow?.postMessage(JSON.stringify(message), '*'); } catch { /* gone */ }
  }

  /** Send a command in whichever vocabulary this player speaks. */
  command(func, args = []) {
    if (this.kind === 'youtube') this.post({ event: 'command', func, args, id: 1, channel: 'widget' });
    else if (this.kind === 'twitch') this.post({ namespace: 'twitch-embed-player-proxy', eventName: func, params: args[0] });
  }

  hear(e) {
    let data = e.data;
    if (typeof data === 'string') { try { data = JSON.parse(data); } catch { return; } }
    if (!data || typeof data !== 'object') return;

    // YouTube sends its state as it changes.
    if (data.event === 'infoDelivery' && data.info) {
      const i = data.info;
      if (typeof i.currentTime === 'number') this.state.at = i.currentTime;
      if (typeof i.duration === 'number' && i.duration > 0) this.state.length = i.duration;
      if (typeof i.volume === 'number') this.state.volume = i.volume / 100;
      if (typeof i.muted === 'boolean') this.state.muted = i.muted;
      if (typeof i.playerState === 'number') this.state.playing = i.playerState === 1;
      this.onUpdate(this.state);
    }
  }

  // ---------------------------------------------------------------- what the controls call
  playPause() {
    if (!this.canDrive) return;
    this.state.playing = !this.state.playing;
    this.command(this.state.playing ? 'playVideo' : 'pauseVideo');
    this.onUpdate(this.state);
  }

  seekTo(fraction) {
    if (!this.canSeek) return;
    const to = Math.max(0, Math.min(1, fraction)) * this.state.length;
    this.state.at = to;
    this.command('seekTo', [to, true]);
    this.onUpdate(this.state);
  }

  setVolume(v) {
    if (!this.canDrive) return;
    this.state.volume = Math.max(0, Math.min(1, v));
    this.state.muted = this.state.volume === 0;
    this.command('setVolume', [Math.round(this.state.volume * 100)]);
    this.onUpdate(this.state);
  }

  toggleMute() {
    if (!this.canDrive) return;
    this.state.muted = !this.state.muted;
    this.command(this.state.muted ? 'mute' : 'unMute');
    this.onUpdate(this.state);
  }
}

export const clock = s => {
  if (!Number.isFinite(s) || s < 0) s = 0;
  const m = Math.floor(s / 60);
  const sec = String(Math.floor(s % 60)).padStart(2, '0');
  return m >= 60 ? `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}:${sec}` : `${m}:${sec}`;
};

export { el };
