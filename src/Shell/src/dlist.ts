// The browser's downloads (his design, 2026-10-12). Every file the browser saved, newest last, kept 200 deep for the
// Downloads page. The tray in the band shows only this run's newest 5, and its key shows only while there is
// something in it: it hides when the browser closes, after an hour with no new download, or on Clear list.
import path from 'node:path';
import { writeFileAtomic } from './atomic.ts';
import { readJson } from './store.ts';

export interface Dl { id: number; name: string; file: string; site: string; size: number; at: number; state: 'going' | 'done' | 'stopped' | 'failed' }

export const TRAY_SIZE = 5;
export const TRAY_IDLE = 60 * 60_000;
const KEEP = 200;

/** Which kind of file, for the little paper icon's colour. */
export function kindOf(name: string): 'zip' | 'pdf' | 'img' | 'exe' | 'doc' | 'av' | 'file' {
  const e = path.extname(name).toLowerCase();
  if (/^\.(zip|rar|7z|gz|tar|bz2|xz)$/.test(e)) return 'zip';
  if (e === '.pdf') return 'pdf';
  if (/^\.(png|jpe?g|gif|webp|bmp|svg|ico|avif|heic)$/.test(e)) return 'img';
  if (/^\.(exe|msi|msix|appx|bat|cmd|ps1|vbs|js|jar|scr|com|reg|lnk)$/.test(e)) return 'exe';
  if (/^\.(docx?|xlsx?|pptx?|odt|ods|txt|rtf|csv|md)$/.test(e)) return 'doc';
  if (/^\.(mp3|mp4|mkv|mov|wav|flac|ogg|m4a|webm|avi)$/.test(e)) return 'av';
  return 'file';
}

/**
 * The tray: this run's downloads since he last cleared it, newest first, at most 5. Empty (and the key hidden) once
 * an hour has gone by since the newest one, unless one is still coming in.
 */
export function trayOf(list: Dl[], since: number, now: number): Dl[] {
  const mine = list.filter((d) => d.at >= since).sort((a, b) => b.at - a.at);
  if (!mine.length) return [];
  if (!mine.some((d) => d.state === 'going') && now - mine[0].at > TRAY_IDLE) return [];
  return mine.slice(0, TRAY_SIZE);
}

export class Downloads {
  list: Dl[] = [];
  private seq = 0;
  private readonly fileName: string;
  constructor(fileName: string) {
    this.fileName = fileName;
    try {
      const a = readJson<unknown>(fileName, null);
      if (Array.isArray(a)) this.list = a.filter((d: Partial<Dl>) => Number.isInteger(d?.id) && typeof d?.file === 'string' && path.isAbsolute(d.file) && typeof d?.name === 'string')
        // A download still coming in when the browser closed never finished.
        .map((d: Dl) => ({ id: d.id, name: d.name.slice(0, 260), file: d.file, site: String(d.site ?? '').slice(0, 200), size: Number(d.size) || 0, at: Number(d.at) || 0,
          state: d.state === 'going' ? 'failed' : (['done', 'stopped', 'failed'].includes(d.state) ? d.state : 'failed') as Dl['state'] })).slice(-KEEP);
    } catch { /* none yet */ }
    this.seq = this.list.reduce((m, d) => Math.max(m, d.id), 0);
  }
  start(file: string, site: string, size: number): Dl {
    const d: Dl = { id: ++this.seq, name: path.basename(file), file, site, size, at: Date.now(), state: 'going' };
    this.list.push(d);
    if (this.list.length > KEEP) this.list.splice(0, this.list.length - KEEP);
    this.save();
    return d;
  }
  get(id: number): Dl | undefined { return this.list.find((d) => d.id === id); }
  remove(id: number): void { this.list = this.list.filter((d) => d.id !== id); this.save(); }
  save(): void { try { writeFileAtomic(this.fileName, JSON.stringify(this.list)); } catch (e) { console.error('shell: downloads list not saved: ' + (e as Error).message); } }
}
