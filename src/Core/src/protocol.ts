// Wire protocol between Core and Body (docs/PROTOCOL.md). Unknown `t` values are ignored by both sides.

export type Mode = 'auto' | 'quick' | 'smart' | 'deep';
export type QuotaLevel = 'ok' | 'warn' | 'offer' | 'saving';

export type ToBody =
  | { t: 'state'; state: string }
  | { t: 'bubble'; text: string; stream: boolean; id?: string; who?: string; proactive?: boolean }
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
  | { t: 'error'; id?: string; message: string; next: string };

export type FromBody =
  | { t: 'hello'; v: number; pid?: number }
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
  /** A picture of his window: base64 JPEG, and how much of it is black (protected video comes out black). */
  | { t: 'look'; id: string; ok: boolean; data?: string | null; w?: number; h?: number; black?: number; error?: string | null };

export function parseFromBody(raw: string): FromBody | null {
  try {
    const v = JSON.parse(raw);
    if (v && typeof v === 'object' && typeof v.t === 'string') return v as FromBody;
  } catch { /* fall through */ }
  return null;
}
