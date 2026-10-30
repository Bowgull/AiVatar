// Sheet 17 notes (his design, 2026-10-12): sticky notes he makes by saying so, keeps on a board in the bubble,
// edits in place, and can pull out onto his screen. Aang always knows them.
//
// "hey make a note for raid: flasks, food, repair" is decided in plain code, like the timers and the grocery
// list: no model is asked, so making a note costs nothing.
//
// A note's text is HTML from his own editor (bold, lists, ticks, fonts). It is rebuilt here from scratch on
// every save, keeping only the handful of tags and styles the editor can make, so nothing else can ride in.
import path from 'node:path';
import { writeFileAtomic } from './atomic.ts';
import { readJson } from './store.ts';

/** The colours notes had before sheet 60 v4 (2026-10-22). Read only to drop them: colour now comes from the category. */
export const OLD_COLOURS = ['parchment', 'sage', 'rose', 'sky', 'plum', 'stone'] as const;
/**
 * Sheet 60 v4/v5 (his note, 2026-10-22: "shouldn't notes be different colours by their category rather than giving me
 * another thing to pick?"). A note has no colour of its own any more: no category = a plain note (butter paper); each
 * of these owns one paper; a category he makes takes the next free colour (pages/notecats.js draws them).
 */
export const BUILTIN_CATS = ['To-do', 'Idea', 'Reference', 'For Claude'] as const;
export const MAX_OWN_CATS = 12;
/** A category name as kept: plain words, no markup, at most 24 characters. Empty = a plain note. */
export function cleanCat(raw: unknown): string {
  return String(raw ?? '').replace(/[<>#\u0000-\u001f]/g, '').replace(/\s+/g, ' ').trim().slice(0, 24);
}
export const FONTS = ['figtree', 'caveat', 'patrick', 'cinzel', 'fell', 'elite', 'silk', 'vt', 'arcade'] as const;
export const SIZES = ['s', 'm', 'l'] as const;

export interface Note {
  id: string; title: string; html: string; font: string; size: string;
  /** Sheet 60: its category ('' or absent = a plain note). The colour follows from it; nothing else to pick. */
  cat?: string | undefined;
  /** The title's own font and size, when he changed them. */
  tfont?: string | undefined; tsize?: string | undefined;
  /** On his screen: where, how big, how see-through, pinned. Absent: on the board only. */
  out?: { x: number; y: number; w: number; h: number; opacity: number; pinned: boolean } | undefined;
  /** Sheet 62 (2026-10-22): where a kept note came from ("Keep as a note" after a Send to Aang): the page and its site. */
  src?: { url: string; site: string } | undefined;
  /** "Aang can bring this up" (2026-10-22, notenotice.ts). On by default: stored only as `false` when he turns it off,
   *  so every note saved before this existed is on, with no migration step beyond tidy(). */
  notice?: false | undefined;
  updated: number;
}

/** A note's source link: http(s) only, not absurdly long, and its site (short). Anything else is no source. */
export function cleanSrc(raw: unknown): { url: string; site: string } | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const r = raw as Record<string, unknown>;
  const u = String(r.url ?? '').trim();
  if (!u || u.length > 2048) return undefined;
  let host = '';
  try { const x = new URL(u); if (x.protocol !== 'http:' && x.protocol !== 'https:') return undefined; host = x.hostname.replace(/^www\./, ''); } catch { return undefined; }
  const site = String(r.site ?? '').replace(/[<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, 80) || host;
  return { url: u, site };
}

export const MAX_NOTES = 60;
const MAX_HTML = 20_000;

// ------------------------------------------------------------------ keeping the HTML to what the editor makes

const TAGS = new Set(['div', 'br', 'b', 'strong', 'i', 'em', 'u', 's', 'strike', 'h3', 'ul', 'ol', 'li', 'span']);
const FONT_CSS: Record<string, string> = {
  figtree: 'Figtree', caveat: 'Caveat', patrick: 'Patrick Hand', cinzel: 'Cinzel', fell: 'IM Fell English',
  elite: 'Special Elite', silk: 'Silkscreen', vt: 'VT323', arcade: 'Press Start 2P',
};
const FAMILIES = new Set(Object.values(FONT_CSS).map(f => f.toLowerCase()));
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const unesc = (s: string) => s.replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');

/** The style a span may carry: one of the note fonts, and a size between 10 and 28 px. Nothing else. */
function cleanStyle(style: string): string {
  const out: string[] = [];
  const fam = /font-family\s*:\s*["']?([a-z0-9 ]+)/i.exec(style);
  if (fam && FAMILIES.has(fam[1]!.trim().toLowerCase())) out.push(`font-family:'${fam[1]!.trim()}'`);
  const size = /font-size\s*:\s*(\d{1,2})px/i.exec(style);
  if (size) { const n = Number(size[1]); if (n >= 10 && n <= 28) out.push(`font-size:${n}px`); }
  return out.join(';');
}

/**
 * Rebuild a note's HTML from scratch: only the editor's own tags, only `class="cl"`/`"cl done"` on a line and a
 * font or size on a span, every other attribute dropped, all text escaped, and every tag closed. Anything else
 * (a script, an image, a link, an event handler, a comment) simply is not copied across.
 */
export function cleanHtml(html: string): string {
  const src = String(html ?? '').slice(0, MAX_HTML * 2);
  let out = '';
  const open: string[] = [];
  const re = /<!--[\s\S]*?-->|<(\/?)([a-zA-Z][a-zA-Z0-9]*)\b([^>]*)>|([^<]+)|</g;
  let m: RegExpExecArray | null;
  let skip = 0;                                   // inside a <script> or <style>: drop until it closes
  while ((m = re.exec(src))) {
    if (m[0].startsWith('<!--')) continue;
    if (m[4] !== undefined || m[0] === '<') { if (!skip) out += esc(unesc(m[4] ?? '<')); continue; }
    const closing = m[1] === '/', tag = m[2]!.toLowerCase(), attrs = m[3] ?? '';
    if (tag === 'script' || tag === 'style') { skip += closing ? -1 : 1; if (skip < 0) skip = 0; continue; }
    if (skip || !TAGS.has(tag)) continue;
    if (tag === 'br') { out += '<br>'; continue; }
    const t = tag === 'strong' ? 'b' : tag === 'em' ? 'i' : tag === 'strike' ? 's' : tag;
    if (closing) {
      const at = open.lastIndexOf(t);
      if (at < 0) continue;
      while (open.length > at) out += `</${open.pop()}>`;
      continue;
    }
    let a = '';
    if (t === 'div') { const c = /class\s*=\s*["']([^"']*)["']/i.exec(attrs)?.[1] ?? ''; if (/\bcl\b/.test(c)) a = /\bdone\b/.test(c) ? ' class="cl done"' : ' class="cl"'; }
    if (t === 'span') { const sm = /style\s*=\s*(?:"([^"]*)"|'([^']*)')/i.exec(attrs); const st = cleanStyle(sm?.[1] ?? sm?.[2] ?? ''); if (st) a = ` style="${st}"`; }
    out += `<${t}${a}>`;
    open.push(t);
  }
  while (open.length) out += `</${open.pop()}>`;
  return out.slice(0, MAX_HTML);
}

/** The note as plain lines, for Aang's knowledge and the board's previews. Ticked lines say so. */
export function plainOf(html: string): string[] {
  const lines: string[] = [];
  for (const block of cleanHtml(html).split(/<\/?(?:div|li|h3|br|ul|ol)[^>]*>/)) {
    const text = unesc(block.replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim();
    if (text) lines.push(text);
  }
  // Ticked lines: find them again by their markup so "(done)" can be added.
  const done = new Set<string>();
  for (const m of cleanHtml(html).matchAll(/<div class="cl done">([\s\S]*?)<\/div>/g)) done.add(unesc(m[1]!.replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim());
  return lines.map(l => done.has(l) ? `${l} (done)` : l);
}

// ------------------------------------------------------------------ what he typed

export type NoteCommand =
  | { op: 'make'; title: string; lines: string[] }
  | { op: 'add'; to: string; lines: string[] }
  | { op: 'show' };

const LEAD = String.raw`^(?:hey\s+|ok\s+|okay\s+)?(?:aang[,!]?\s+)?(?:can you\s+|could you\s+|please\s+)?`;
const cap = (s: string) => s ? s[0]!.toUpperCase() + s.slice(1) : '';
/** "flasks, food and repair" -> three lines. A single sentence stays one line. */
export function splitLines(raw: string): string[] {
  const t = raw.trim().replace(/[.!]+$/, '');
  if (!t) return [];
  const parts = t.split(/\s*(?:,|;|\n|\band\b)\s*/i).map(s => s.trim()).filter(Boolean);
  // Commas make a list only when the pieces are short; a long sentence with a comma is still one sentence.
  if (parts.length > 1 && parts.every(p => p.split(' ').length <= 6)) return parts.map(cap);
  return [cap(t)];
}

export function parseNoteCommand(text: string): NoteCommand | null {
  const t = text.trim();
  if (t.length > 1000) return null;
  let m: RegExpExecArray | null;
  if (new RegExp(`${LEAD}(?:show|open|see)\\s+(?:me\\s+)?(?:my\\s+)?(?:notes|sticky notes|note board)\\s*[.!?]?$`, 'i').test(t) || /^notes\s*[.!?]?$/i.test(t)) return { op: 'show' };
  // "add potions to my raid note"
  if ((m = new RegExp(`${LEAD}(?:add|put)\\s+([\\s\\S]+?)\\s+(?:to|on|onto)\\s+(?:my|the)\\s+([\\w' -]{1,30}?)\\s+note\\s*[.!]?$`, 'i').exec(t))) {
    const lines = splitLines(m[1]!);
    return lines.length ? { op: 'add', to: m[2]!.trim(), lines } : null;
  }
  // "make a note for raid: flasks, food", "make a note: call mom", "take a note that ...", "note: ...", "jot down ..."
  if ((m = new RegExp(`${LEAD}(?:make|take|write|start|create)\\s+(?:me\\s+)?(?:a\\s+)?(?:new\\s+)?(?:sticky\\s+)?note\\s+(?:for|about|on|called)\\s+([^:]{1,40}?)\\s*:\\s*([\\s\\S]+)$`, 'i').exec(t))) {
    const lines = splitLines(m[2]!);
    return lines.length ? { op: 'make', title: cap(m[1]!.trim()), lines } : null;
  }
  if ((m = new RegExp(`${LEAD}(?:make|take|write|create)\\s+(?:me\\s+)?(?:a\\s+)?(?:new\\s+)?(?:sticky\\s+)?note\\s*(?::|that|saying|to say|of)\\s*([\\s\\S]+)$`, 'i').exec(t))
    || (m = /^(?:note|sticky)\s*:\s*([\s\S]+)$/i.exec(t))
    || (m = new RegExp(`${LEAD}jot\\s+(?:down\\s+)?(?:that\\s+)?([\\s\\S]+)$`, 'i').exec(t))) {
    const lines = splitLines(m[1]!);
    if (!lines.length) return null;
    const first = lines[0]!;
    const words = first.split(' ').slice(0, 4);
    while (words.length > 1 && /^(?:the|a|an|to|of|for|about|and|my|on|at|in)$/i.test(words[words.length - 1]!)) words.pop();
    const title = lines.length > 1 ? 'Note' : words.join(' ');
    return { op: 'make', title: cap(title), lines };
  }
  return null;
}

/** Lines as the editor's HTML: a list becomes ticks, one sentence stays plain text. */
export function linesHtml(lines: string[]): string {
  const cls = lines.length > 1 ? ' class="cl"' : '';
  return lines.map(l => `<div${cls}>${esc(l)}</div>`).join('');
}

// ------------------------------------------------------------------ the store

export class Notes {
  private all: Note[] = [];
  private seq = 0;
  private readonly file: string;
  /** His own categories, in the order he made them: that order is which colour each one gets. Kept beside the notes. */
  private own: string[] = [];
  private readonly catsFile: string;
  constructor(file: string) {
    this.file = file;
    this.catsFile = path.join(path.dirname(file), 'note-cats.json');
    this.own = readJson(this.catsFile, this.own, (raw) => (Array.isArray(raw) ? this.cleanOwn(raw) : null));
    this.all = readJson(file, this.all, (raw) => (Array.isArray(raw) ? (raw as Note[]).map(n => this.tidy(n)).filter((n): n is Note => n !== null).slice(0, MAX_NOTES) : null));
    // A category a note carries that is in neither list (an older file, a hand edit) joins his own, in note order.
    const before = this.own.length;
    for (const n of [...this.all].sort((a, b) => a.updated - b.updated)) if (n.cat) n.cat = this.canonCat(n.cat, false);
    if (this.own.length !== before) this.saveCats();
  }
  /** Built-in categories first, then his own in the order he made them. */
  cats(): { builtin: string[]; own: string[] } { return { builtin: [...BUILTIN_CATS], own: [...this.own] }; }
  /** "+ Category" on the board: a new one of his own, with no note in it yet. Its name as kept, or '' when refused. */
  addCat(name: unknown): string { return this.canonCat(cleanCat(name)); }
  /** The spelling already known (any case), else a new one of his own (up to MAX_OWN_CATS); '' = plain. */
  private canonCat(raw: unknown, save = true): string {
    const c = cleanCat(raw);
    if (!c) return '';
    const k = c.toLowerCase();
    const known = [...BUILTIN_CATS, ...this.own].find(x => x.toLowerCase() === k);
    if (known) return known;
    if (this.own.length >= MAX_OWN_CATS) return '';
    this.own.push(c);
    if (save) this.saveCats();
    return c;
  }
  private cleanOwn(raw: unknown[]): string[] {
    const out: string[] = [];
    for (const r of raw) { const c = cleanCat(r); if (c && ![...BUILTIN_CATS, ...out].some(x => x.toLowerCase() === c.toLowerCase())) out.push(c); }
    return out.slice(0, MAX_OWN_CATS);
  }
  private saveCats(): void { try { writeFileAtomic(this.catsFile, JSON.stringify(this.own)); } catch { /* best effort */ } }
  /** Newest first, as the board shows them. */
  list(): Note[] { return [...this.all].sort((a, b) => b.updated - a.updated).map(n => ({ ...n, ...(n.out ? { out: { ...n.out } } : {}) })); }
  make(title: string, html: string, cat = '', now = Date.now()): Note | null {
    if (this.all.length >= MAX_NOTES) return null;
    const c = this.canonCat(cat);
    const n: Note = { id: `n${now.toString(36)}${++this.seq}`, title: title.slice(0, 60) || 'Note', html: cleanHtml(html), font: 'figtree', size: 'm', ...(c ? { cat: c } : {}), updated: now };
    this.all.push(n); this.save(); return { ...n };
  }
  /**
   * Sheet 62 (his pick, 2026-10-22): "Keep as a note" on something he sent to Aang. "A plain note in the default colour
   * with the link it came from": titled with the site, the words (or the page's name) as plain lines, then the link as a
   * line of its own, and the link kept on the note (src) for Samara's notes key (sheet 60). The words are a web page's:
   * escaped like everything else on a note, never markup.
   */
  keep(text: string, url: string, site: string, now = Date.now()): Note | null {
    const src = cleanSrc({ url, site });
    const lines = String(text ?? '').replace(/\r\n?/g, '\n').split('\n').map(l => l.replace(/\s+/g, ' ').trim()).filter(Boolean).slice(0, 40).map(l => l.slice(0, 400));
    if (!lines.length && !src) return null;
    const title = (src?.site || String(site ?? '').replace(/[<>]/g, '').trim() || 'Sent to Aang').slice(0, 60);
    const html = lines.map(l => `<div>${esc(l)}</div>`).join('') + (src ? `<div>${esc(src.url)}</div>` : '');
    const n = this.make(title, html, '', now);
    if (!n || !src) return n;
    const at = this.all.findIndex(x => x.id === n.id);
    if (at >= 0) { this.all[at] = { ...this.all[at]!, src }; this.save(); }
    return { ...n, src };
  }
  /** Find a note by the name he says: "my raid note" finds "Raid night". */
  find(name: string): Note | null {
    const k = name.toLowerCase().replace(/\s+note$/, '').trim();
    if (!k) return null;
    const by = this.all.filter(n => n.title.toLowerCase() === k);
    const loose = by.length ? by : this.all.filter(n => n.title.toLowerCase().includes(k) || k.includes(n.title.toLowerCase()));
    return loose.sort((a, b) => b.updated - a.updated)[0] ?? null;
  }
  append(id: string, lines: string[], now = Date.now()): Note | null {
    const n = this.all.find(x => x.id === id);
    if (!n) return null;
    // Added to a list as more ticks; to plain text as plain lines.
    const isList = /class="cl/.test(n.html);
    n.html = cleanHtml(n.html + lines.map(l => `<div${isList ? ' class="cl"' : ''}>${esc(l)}</div>`).join(''));
    n.updated = now; this.save(); return { ...n };
  }
  /** A save from the editor or the screen. Only known fields, each checked. */
  save1(raw: unknown, now = Date.now()): Note | null {
    const r = this.tidy({ ...(raw as object), updated: now } as Note);
    if (!r) return null;
    if (r.cat) r.cat = this.canonCat(r.cat);
    if (!r.cat) delete r.cat;
    const at = this.all.findIndex(x => x.id === r.id);
    // A note's source link is the Shell's to set (Keep as a note), never lost because an editor did not send it back.
    if (at >= 0 && !r.src && this.all[at]!.src) r.src = this.all[at]!.src;
    if (at < 0) { if (this.all.length >= MAX_NOTES) return null; this.all.push(r); } else this.all[at] = r;
    this.save(); return { ...r };
  }
  remove(id: string): boolean { const n = this.all.length; this.all = this.all.filter(x => x.id !== id); if (n !== this.all.length) { this.save(); return true; } return false; }

  /** For Aang: every note as a few plain lines. Short on purpose; it rides along with his messages. */
  forAang(max = 1500): string {
    let out = '';
    for (const n of this.list()) {
      const block = `- ${n.title}: ${plainOf(n.html).join('; ')}\n`;
      if (out.length + block.length > max) { out += '- (more notes on his board)\n'; break; }
      out += block;
    }
    return out.trim();
  }

  private tidy(n: Note): Note | null {
    if (!n || typeof n.id !== 'string' || !/^n[a-z0-9]{1,20}$/.test(n.id)) return null;
    // Sheet 60 migration: an old note's own colour (`col`) is dropped, not mapped: a sky note was never a to-do, so it
    // becomes a plain note (butter) until he gives it a category. Its words, font, size and place are all kept.
    const cat = cleanCat(n.cat);
    const font = (FONTS as readonly string[]).includes(n.font) ? n.font : 'figtree';
    // S/M/L from before, or any size from 10 to 28 px (his ask, 2026-10-12: finer than three sizes).
    const px = Number(n.size);
    const size = (SIZES as readonly string[]).includes(n.size) ? n.size : Number.isInteger(px) && px >= 10 && px <= 28 ? String(px) : 'm';
    const num = (v: unknown, lo: number, hi: number, d: number) => { const x = Number(v); return Number.isFinite(x) ? Math.max(lo, Math.min(hi, Math.round(x))) : d; };
    const o = n.out && typeof n.out === 'object' ? n.out : undefined;
    return {
      id: n.id, title: String(n.title ?? '').replace(/[<>]/g, '').slice(0, 60) || 'Note', html: cleanHtml(n.html), font, size,
      ...(cat ? { cat } : {}),
      ...((FONTS as readonly string[]).includes(String(n.tfont)) ? { tfont: String(n.tfont) } : {}),
      ...(Number.isInteger(Number(n.tsize)) && Number(n.tsize) >= 10 && Number(n.tsize) <= 28 ? { tsize: String(Number(n.tsize)) } : {}),
      ...(o ? { out: { x: num(o.x, -20000, 20000, 100), y: num(o.y, -20000, 20000, 100), w: num(o.w, 170, 900, 220), h: num(o.h, 120, 900, 170), opacity: Math.max(0.25, Math.min(1, Number(o.opacity) || 1)), pinned: o.pinned === true } } : {}),
      ...(cleanSrc(n.src) ? { src: cleanSrc(n.src) } : {}),
      ...(n.notice === false ? { notice: false as const } : {}),
      updated: Number.isFinite(n.updated) ? n.updated : Date.now(),
    };
  }
  private save(): void { writeFileAtomic(this.file, JSON.stringify(this.all)); }
}
