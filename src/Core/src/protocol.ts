// Wire protocol between Core and Body (docs/PROTOCOL.md). Unknown `t` values are ignored by both sides.

export type Mode = 'auto' | 'quick' | 'smart' | 'deep';
export type QuotaLevel = 'ok' | 'warn' | 'offer' | 'saving';

export type ToBody =
  | { t: 'state'; state: string }
  | { t: 'bubble'; text: string; stream: boolean; id?: string; who?: string; proactive?: boolean;
      /** Something he asked to be told about: shown even in quiet mode. */
      asked?: boolean;
      /** The window a click on the bubble brings forward, and the word in the text to mark as that link. */
      focus?: string; link?: string }
  | { t: 'bubble.dots' }
  | { t: 'bubble.clear' }
  | { t: 'quiet'; on: boolean }
  | { t: 'ping' }
  | { t: 'ack'; id: string }
  | { t: 'queued'; id: string; position: number }
  | { t: 'tool'; id: string; name: string; phase: 'start' | 'done'; label: string }
  | { t: 'quota'; five: number; week: number; fiveResetsAt: number; weekResetsAt: number; level: QuotaLevel }
  | { t: 'consent'; id: string; wanted: Mode }
  | { t: 'permission'; id: string; tool: string; question: string; remembers?: string }
  | { t: 'clipboard.request'; id: string }
  | { t: 'look.request'; id: string }
  /** Something only the desktop can do to its windows. Sent only after Joshua has agreed to it. */
  | { t: 'hands.request'; id: string; action: 'close' | 'forcequit' | 'arrange' | 'media'; what?: string; how?: string }
  | { t: 'error'; id?: string; message: string; next: string };

export type FromBody =
  /** `client` says who is on the other end; the desktop Body leaves it out. */
  | { t: 'hello'; v: number; pid?: number; client?: 'desktop' | 'discord' }
  /** The Body: whether Joshua has touched the keyboard or mouse lately, sent when that changes. */
  | { t: 'desk'; active: boolean }
  | { t: 'presence'; quiet: boolean; foreground: string; title?: string; watching?: boolean; hwnd?: number }
  | { t: 'poked' }
  | { t: 'moved'; x: number; y: number }
  | { t: 'pong' }
  | { t: 'submit'; id: string; text: string; mode?: Mode; once?: boolean }
  | { t: 'stop'; id?: string }
  | { t: 'saving'; on: boolean }
  | { t: 'rate'; id: string; value: 'up' | 'down' | 'none' }
  | { t: 'mute'; on: boolean }
  | { t: 'permission.reply'; id: string; allow: boolean }
  | { t: 'clipboard'; id: string; text: string | null }
  | { t: 'hands'; id: string; ok: boolean; detail: string }
  /** A picture of his window: base64 JPEG, and how much of it is black (protected video comes out black). */
  | { t: 'look'; id: string; ok: boolean; data?: string | null; w?: number; h?: number; black?: number; error?: string | null };

export function parseFromBody(raw: string): FromBody | null {
  try {
    const v = JSON.parse(raw);
    if (v && typeof v === 'object' && typeof v.t === 'string') return v as FromBody;
  } catch { /* fall through */ }
  return null;
}
