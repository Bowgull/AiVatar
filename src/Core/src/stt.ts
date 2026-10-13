// E8, the email assistant (his yes, 2026-10-13): transcripts for videos with no captions (Loom, Vimeo, a video attached
// to an email, a YouTube video without captions), heard by speech-to-text on this PC: whisper.cpp v1.9.4 (MIT, official
// ggml-org build) with the large-v3-turbo 8-bit model, both pinned by their published fingerprints, in tools\whisper
// (not in git). Free and private: the audio never leaves the PC, and no quota is used.
//   - Never while a game is running (it would take the graphics card from WoW), and only with room on the card; one
//     transcript at a time.
//   - A link is fetched with yt-dlp (already on this PC) with no config, no playlist, no running anything, 500 MB at
//     most; a file is read with ffmpeg. Everything heard is the video's words: DATA, never instructions.
import { execFile } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { freeVramMiB, gameRunning } from './gpu.ts';

const ROOT = process.env.AANG_WHISPER_DIR ?? path.resolve(import.meta.dirname, '..', '..', '..', 'tools', 'whisper');
const CLI = path.join(ROOT, 'bin', 'Release', 'whisper-cli.exe');
const MODEL = path.join(ROOT, 'models', 'ggml-large-v3-turbo-q8_0.bin');
/** The longest video heard (an hour); longer ones are cut there and said to be. */
export const MAX_SECONDS = 3600;

export const sttReady = (): boolean => existsSync(CLI) && existsSync(MODEL);

const run = (cmd: string, args: string[], ms: number) => new Promise<{ ok: boolean; out: string; err: string }>(res =>
  execFile(cmd, args, { timeout: ms, maxBuffer: 64 * 1024 * 1024, windowsHide: true }, (e, out, err) => res({ ok: !e, out: String(out ?? ''), err: String(err ?? (e as Error | null)?.message ?? '') })));

let busy: Promise<unknown> = Promise.resolve();
/** One at a time: a second video waits for the first. */
function queued<T>(job: () => Promise<T>): Promise<T> { const p = busy.then(job, job); busy = p.catch(() => {}); return p; }

export type Heard = { ok: true; text: string; seconds: number; cut: boolean; gpu: boolean } | { ok: false; why: string };

/** Hear a video or audio: a web link (yt-dlp) or a file on this PC (ffmpeg). */
export function transcribe(src: { url: string } | { file: string }): Promise<Heard> {
  return queued(async () => {
    if (!sttReady()) return { ok: false, why: 'Speech-to-text is not installed on this PC.' };
    const game = await gameRunning().catch(() => ({ running: false, which: null }));
    if (game.running) return { ok: false, why: `${game.which ?? 'A game'} is running, so the graphics card is the game's. The transcript waits until you are out of it; ask again then.` };
    const dir = mkdtempSync(path.join(os.tmpdir(), 'aang-stt-'));
    try {
      let input: string;
      if ('url' in src) {
        if (!/^https:\/\//i.test(src.url)) return { ok: false, why: 'Only https links can be fetched.' };
        const r = await run('yt-dlp', ['--ignore-config', '--no-playlist', '--no-progress', '--quiet', '--max-filesize', '500M', '-f', 'bestaudio/best',
          '--match-filter', `!is_live & duration < ${MAX_SECONDS * 3}`, '-o', path.join(dir, 'media.%(ext)s'), '--', src.url], 10 * 60_000);
        const got = readdirSync(dir).find(f => f.startsWith('media.'));
        if (!got) return { ok: false, why: `The video could not be fetched${r.err ? `: ${r.err.split('\n').find(l => /ERROR/.test(l))?.replace(/^.*ERROR:\s*/, '').slice(0, 160) ?? 'no reason given'}` : ''}. It may need a sign-in.` };
        input = path.join(dir, got);
      } else {
        if (!existsSync(src.file) || !statSync(src.file).isFile()) return { ok: false, why: 'That file is not there.' };
        input = src.file;
      }
      // 16 kHz mono, as whisper wants; an hour at most.
      const wav = path.join(dir, 'audio.wav');
      const ff = await run('ffmpeg', ['-loglevel', 'error', '-nostdin', '-y', '-i', input, '-vn', '-t', String(MAX_SECONDS), '-ar', '16000', '-ac', '1', '-c:a', 'pcm_s16le', wav], 10 * 60_000);
      if (!ff.ok || !existsSync(wav)) return { ok: false, why: 'There is no sound in it that could be read.' };
      const seconds = Math.round((statSync(wav).size - 44) / 32_000);
      const probe = await run('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', input], 30_000);
      const full = Number(probe.out.trim());
      // The graphics card, when there is room on it (Qwen may be holding most of it); otherwise the processor, slower.
      const free = await freeVramMiB().catch(() => null);
      const gpu = free === null || free >= 2200;
      const base = path.join(dir, 'out');
      const w = await run(CLI, ['-m', MODEL, '-f', wav, '-l', 'auto', '-nt', '-np', '-otxt', '-of', base, ...(gpu ? [] : ['-ng']), '-t', String(Math.max(2, Math.min(8, os.cpus().length - 2)))],
        Math.max(5 * 60_000, seconds * (gpu ? 1000 : 6000)));
      const txt = existsSync(base + '.txt') ? readFileSync(base + '.txt', 'utf8').replace(/\s+/g, ' ').trim() : '';
      if (!txt) return { ok: false, why: w.ok ? 'Nobody speaks in it (no words were heard).' : 'The transcript could not be made.' };
      return { ok: true, text: txt.slice(0, 60_000), seconds, cut: Number.isFinite(full) && full > MAX_SECONDS + 1, gpu };
    } finally { try { rmSync(dir, { recursive: true, force: true }); } catch { /* temp */ } }
  });
}
