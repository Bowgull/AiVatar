// Wire protocol between Core and Body (docs/PROTOCOL.md). Unknown `t` values are ignored by both sides.

export type Mode = 'auto' | 'quick' | 'smart' | 'deep';
export type QuotaLevel = 'ok' | 'warn' | 'offer' | 'saving';

export type ToBody =
  | { t: 'state'; state: string }
  /** Whether any Claude Code session Aang is following (a job hunt, a self-change, anything opened through
   *  start_claude) is currently working or waiting on him, right now - continuous, not a point-in-time
   *  message. Joshua, 2026-09-23: asked to run a job search, could not tell it was doing anything. Sent
   *  once on connect and again only when it changes. */
  | { t: 'claude.working'; working: boolean }
  | { t: 'bubble'; text: string; stream: boolean; id?: string; who?: string; proactive?: boolean;
      /** Something he asked to be told about: shown even in quiet mode. */
      asked?: boolean;
      /** The window a click on the bubble brings forward, and the word in the text to mark as that link. */
      focus?: string; link?: string;
      /** A Claude Code job this update is about (its folder): lets Discord remember the message so a reply continues that job. */
      jobCwd?: string;
      /** A picture of what it is doing right now, taken only while he is away and only once he has already trusted pictures to Discord. */
      image?: { data: string; mimeType: string };
      /** Genuinely stuck waiting on a decision, not just news. Joshua, 2026-09-22: found out mid-raid, no idea Claude needed
       *  him. This is the Avatar State tier: breaks through hidden (never mute), peeks further while docked or a brief
       *  gesture while standing, a glow, and a sound - the one channel that can reach him even in a fullscreen game. */
      blocking?: boolean;
      /** A session he started finished on its own, nothing left for him to answer - its own quieter tier, Joshua
       *  2026-09-22: "aang needs to tell me its done", like ChatGPT's pet on a finished background task. Same
       *  glow motion as blocking, a different colour, and never a sound - it should never feel as urgent as
       *  actually being stuck waiting on him. */
      done?: boolean;
      /** The session is on his MacBook (its hooks came over Tailscale): a click on the icon brings Claude forward there. */
      host?: 'mac' }
  | { t: 'bubble.dots' }
  | { t: 'bubble.clear' }
  | { t: 'quiet'; on: boolean }
  | { t: 'ping' }
  | { t: 'ack'; id: string }
  | { t: 'queued'; id: string; position: number }
  | { t: 'tool'; id: string; name: string; phase: 'start' | 'done'; label: string }
  | { t: 'quota'; five: number; week: number; fiveResetsAt: number; weekResetsAt: number; level: QuotaLevel }
  | { t: 'consent'; id: string; wanted: Mode }
  /** remembers, when set, is the standing-trust category (e.g. "open apps") that "Always allow" would grant. */
  | { t: 'permission'; id: string; tool: string; question: string; remembers?: string }
  | { t: 'clipboard.request'; id: string }
  | { t: 'look.request'; id: string }
  /** A file or picture for Discord (base64). Only the Discord connection is sent these. */
  | { t: 'attach'; name: string; mime: string; data: string; caption?: string }
  /** The answer to a `status` request: plain text, worked out without the model. */
  | { t: 'status.reply'; text: string }
  /** Whether `mac.run` reached the Mac and typed it into a new chat there. */
  | { t: 'mac.run.reply'; ok: boolean }
  /** Whether `job.hunt` ended up running on the Mac or, falling back, on his own worker here. */
  | { t: 'job.hunt.reply'; onMac: boolean }
  /** A job scored outside #job-inbox (an email, a link pasted in chat): Discord turns this into the same kind
   *  of card. Only the Discord connection acts on it - nowhere else has anywhere to put a job card. */
  | { t: 'job.card'; url: string; title: string; company: string; location: string; salary: string; score: number; verdict: 'apply' | 'maybe' | 'skip'; reason: string }
  /** One line for the receipt book (#log): something Aang just did on the machine. */
  | { t: 'action'; text: string }
  | { t: 'actions.reply'; text: string }
  /** What he may do without asking, for review and revoke. */
  | { t: 'trust.reply'; items: { kind: string; example: string; since: string }[] }
  | { t: 'hush.reply'; text: string }
  /** An email draft waiting for his tap (or its new state), for Discord. `id` is the draft; the buttons carry its hash. */
  | { t: 'mail.card'; id: string; content: string; buttons: { id: string; label: string; style: 'primary' | 'secondary' | 'success' | 'danger' }[] }
  /** Everything the Panel shows, worked out without the model. `notice`: something to say at the top (a draft that would not send). */
  | { t: 'panel.reply'; facts: { id: number; text: string; seen: string; times: number }[]; trust: { kind: string; example: string; since: string }[]; actions: string;
      drafts: { id: string; hash: string; to: string[]; subject: string; body: string; status: string; newTo: string[] }[]; mail: boolean; notice?: string;
      /** Claude Code sessions he started through Aang, newest first. */
      sessions?: { name: string; kind: string; state: string; since: string; last: string }[] }
  /** The Panel's History tab: past turns, newest first, matching `q` (all of its words). */
  | { t: 'history.reply'; q: string; items: { id: number; ts: string; who: 'you' | 'Aang'; text: string }[] }
  /** The morning brief, worked out without the model. */
  | { t: 'brief.reply'; text: string }
  /** Something only the desktop can do to its windows. Sent only after Joshua has agreed to it. */
  | { t: 'hands.request'; id: string; action: 'close' | 'forcequit' | 'arrange' | 'media' | 'clipset'; what?: string; how?: string }
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
  /** `ephemeral`: a job Aang set himself (vetting a link). Not kept in memory, since Joshua did not say it. */
  | { t: 'submit'; id: string; text: string; mode?: Mode; once?: boolean; ephemeral?: boolean }
  | { t: 'stop'; id?: string }
  | { t: 'saving'; on: boolean }
  | { t: 'rate'; id: string; value: 'up' | 'down' | 'none' }
  | { t: 'mute'; on: boolean }
  /** once: do it, do not remember. always: do it and trust the whole kind from now on. no: refused. */
  | { t: 'permission.reply'; id: string; choice: 'once' | 'always' | 'no' }
  | { t: 'clipboard'; id: string; text: string | null }
  | { t: 'hands'; id: string; ok: boolean; detail: string }
  /** Type text into a new chat in the Claude app on the Mac (2026-09-22), or say it could not be reached -
   *  never a shell command, never anything Aang did not already have the text for. */
  | { t: 'mac.run'; text: string }
  /** Start the job hunt: the Mac's Claude app when a Mac is known, his own worker here otherwise. The desktop
   *  tray's "Job hunt now" - Discord's button reaches the same place through mac.run + its own fallback. */
  | { t: 'job.hunt' }
  /** "How are things?" No model is involved: the Core answers from what it already knows. */
  | { t: 'status' }
  | { t: 'actions' }
  | { t: 'trust' }
  | { t: 'revoke'; kind: string }
  /** Hold everything unprompted for this many minutes (0 ends it); it is delivered afterwards, not lost. */
  | { t: 'hush'; minutes: number }
  /** A button on an email draft card. The Core acts only if the hash is the wording on the card. */
  | { t: 'mail.act'; id: string; hash: string; action: 'send' | 'save' | 'discard' }
  | { t: 'brief' }
  /** The Panel opened or refreshed; and its Forget button on one remembered fact. */
  | { t: 'panel' }
  | { t: 'forget.fact'; id: number }
  | { t: 'history'; q?: string }
  /** A reply to a Claude Code job's update in Discord: told to that job, as a fresh follow-up in its folder. */
  | { t: 'claude.reply'; cwd: string; text: string }
  /** He clicked an icon for a MacBook session: ask the Mac's one-job listener to bring Claude forward. */
  | { t: 'claude.front'; host: 'mac' }
  /** A picture of his window: base64 JPEG, and how much of it is black (protected video comes out black). */
  | { t: 'look'; id: string; ok: boolean; data?: string | null; w?: number; h?: number; black?: number; error?: string | null };

export function parseFromBody(raw: string): FromBody | null {
  try {
    const v = JSON.parse(raw);
    if (v && typeof v === 'object' && typeof v.t === 'string') return v as FromBody;
  } catch { /* fall through */ }
  return null;
}
