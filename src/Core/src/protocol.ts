// Wire protocol between Core and Body (docs/PROTOCOL.md). Unknown `t` values are ignored by both sides.

export type Mode = 'auto' | 'quick' | 'smart' | 'deep';
export type QuotaLevel = 'ok' | 'warn' | 'offer' | 'saving';

/**
 * What kind of thing every row in one list is - never per row, a list is one kind (2026-09-24: an early draft
 * of the bubble redesign gave three job rows three different icons, which made the icon decorate the row
 * instead of naming it). Colour is the separate, per-row channel for how each one is doing (ChipTone below);
 * an icon never changes meaning and a colour never changes meaning. This same shape is meant to feed a
 * Discord card later (Phase 3) as well as the desktop bubble, so it lives in the wire protocol, not in either
 * side's own drawing code.
 */
export type ListIcon = 'job' | 'email' | 'meeting' | 'file' | 'deadline' | 'reminder' | 'session' | 'link' | 'memory';
/** good/normal/careful/stop/inactive, the same five-way vocabulary Theme.cs already uses everywhere else. */
export type ChipTone = 'good' | 'normal' | 'careful' | 'stop' | 'inactive';
export interface StructuredItem {
  title: string;
  subtitle?: string;
  /** A short label - a score, a status - never required: most rows have nothing worth a chip. */
  chipText?: string;
  chipTone?: ChipTone;
}
/**
 * The recessed header plaque (mockup D). Deliberately optional and deliberately rare: board E's rule is that
 * it "only appears when something is genuinely urgent, its colour saying which tier". A plaque on every list
 * is a banner, and a banner nobody can ignore is a banner nobody reads.
 */
export interface ListHeader {
  text: string;
  tone: ChipTone;
}
export interface StructuredList {
  icon: ListIcon;
  /** Shown as a carved plaque above the rows. Leave it out unless something here is actually urgent. */
  header?: ListHeader;
  /** Capped by the present_list tool's own schema (tools.ts), not here: this type just carries whatever it
   *  was given. */
  items: StructuredItem[];
  /** How many more exist beyond `items`, if the model said so - "12 more in Discord", not a silent cutoff. */
  moreCount?: number;
}

export type ToBody =
  | { t: 'state'; state: string }
  /**
   * Put a video on over his game (step 6.3, his decision 27). Only the Shell listens for this; the
   * C# window ignores it, which is why it is safe to send to everything.
   *
   * The Shell works out what to actually play: a YouTube or Twitch link becomes the right embed, and
   * anything else opens as its own page. An address that is not http or https is refused there.
   */
  | { t: 'popout.open'; url: string;
      /** What to show on the grab bar before the page says its own title. */
      title?: string }
  /** Put it away. The video stops; `popout.hide` is the one that keeps it playing. */
  | { t: 'popout.close' }

  /** Whether any Claude Code session Aang is following (a job hunt, a self-change, anything opened through
   *  start_claude) is currently working or waiting on him, right now - continuous, not a point-in-time
   *  message. Joshua, 2026-09-23: asked to run a job search, could not tell it was doing anything. Sent
   *  once on connect and again only when it changes. */
  | { t: 'claude.working'; working: boolean;
      /** What it is, in his words ("job hunt"), so a click on the icon can say so rather than just glow. */
      what?: string;
      /** Set when the session is on the MacBook, so the click routes there instead of to a window here. */
      host?: 'mac' }
  | { t: 'bubble'; text: string; stream: boolean; id?: string; who?: string; proactive?: boolean;
      /** The row this message was stored as, when it was stored. What a right-click acts on. */
      turn?: number;
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
      host?: 'mac';
      /** A short list to render as real rows under the text, not as dashes inside it (2026-09-24, the bubble
       *  redesign: "just a huge string of text with ** and --"). Set only when the model actually called
       *  present_list this turn; `text` stays short prose around it either way, never the list itself. */
      list?: StructuredList }
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
  | { t: 'permission'; id: string; tool: string; question: string; remembers?: string;
      /**
       * One short sentence explaining the CONCEPT, for someone who does not know the words - and for a
       * command, the exact text being run. Joshua, 2026-10-03: "im just seeing gibberish... still very
       * briefly explain the concept of what he's doing". Shown under the question, quieter, so it never
       * gets in the way once he already knows. Empty for anything that needs no explaining.
       */
      means?: string }
  /**
   * Something the local model read in one of Joshua's documents, offered for approval.
   *
   * Deliberately NOT a permission: a permission asks to do a thing and can be remembered as a standing
   * yes, which is the wrong shape entirely. This asks whether a claim is true, the answer applies to that
   * one fact, and nothing is remembered as a rule.
   */
  | { t: 'fact.ask'; id: number; text: string; fromDoc: string; left: number }
  /** The vault has changes and has not been backed up for a while. Offered, never done unasked. */
  | { t: 'backup.ask'; days: number; changed: number }
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
      sessions?: { name: string; kind: string; state: string; since: string; last: string }[];
      /** 4.5: jobs still waiting on him, newest first, for the card stack. Only status 'new': anything he
       *  has already decided on is not a decision he still owes. */
      jobs?: { id: string; title: string; company: string; location: string; salary: string;
               score: number; verdict: 'apply' | 'maybe' | 'skip'; reason: string; url: string; at: string }[] }
  /** The Panel's History tab: past turns, newest first, matching `q` (all of its words). */
  | { t: 'history.reply'; q: string; items: { id: number; ts: string; who: 'you' | 'Aang'; text: string }[];
      /** Echoed back so the Body knows this is an older page and not a fresh search. */
      before?: number }
  /**
   * The database rows the exchange just became. Sent after a reply is stored so the Body can let Joshua
   * right-click what is on screen. `id` is the submit id it answers, which identifies the REQUEST; the
   * turn numbers identify the rows, and the two are not interchangeable.
   */
  | { t: 'turn.saved'; id: string; userTurn: number; aangTurn: number }
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
  | { t: 'submit'; id: string; text: string; mode?: Mode; once?: boolean; ephemeral?: boolean;
      /**
       * The turn this message answers, chosen by Joshua from the scrollback. A real binding, not a guess:
       * recency heuristics demonstrably misattribute, which is why Slack has thread_ts and Discord has
       * message_reference. Nothing infers this.
       */
      replyTo?: number;
      /** Turns he pinned as context. They ride along with every message until he removes them. */
      context?: number[] }
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
  /**
   * 4.5: a decision on one job card, from the Panel's stack.
   *
   * `open` just opens the posting and decides nothing. `apply` and `skip` are the two real answers.
   * `undo` puts the last one back to undecided, which is what makes triaging by keyboard safe to do fast.
   */
  | { t: 'job.act'; id: string; action: 'open' | 'apply' | 'skip' | 'undo' }
  /**
   * 4.5: he pressed a file or link chip in the Panel's history.
   *
   * Deliberately NOT a `submit`. A chip is a button, and a button press must not cost a Claude turn -
   * at 87% of his week a few clicks would be real money. This opens the thing directly, and still goes
   * through `open`'s own permission gate and the activity log, so the Panel is not a side door.
   */
  | { t: 'open.thing'; what: string }
  /** Forget one turn of the conversation. Hidden, not deleted, so 'turn.unforget' can undo it. */
  | { t: 'forget.turn'; id: number }
  /** Yes this is true and worth keeping, or no it is not. Applies to this one fact. */
  | { t: 'fact.reply'; id: number; keep: boolean }
  | { t: 'backup.reply'; now: boolean }
  /** The Body is closing and is asking the Core to stop cleanly. Windows cannot send a real SIGTERM
   *  from .NET, so this socket is the only way to ask politely rather than terminate. */
  | { t: 'shutdown' }
  | { t: 'unforget.turn'; id: number }
  | { t: 'history'; q?: string;
      /** Only turns older than this row, so the bubble can page backwards for as long as he keeps scrolling. */
      before?: number }
  /** A reply to a Claude Code job's update in Discord: told to that job, as a fresh follow-up in its folder. */
  | { t: 'claude.reply'; cwd: string; text: string }
  /** He clicked an icon for a MacBook session: ask the Mac's one-job listener to bring Claude forward. */
  | { t: 'claude.front'; host: 'mac' }
  /** A picture of his window: base64 JPEG, and how much of it is black (protected video comes out black). */
  | { t: 'look'; id: string; ok: boolean; data?: string | null; w?: number; h?: number; black?: number; error?: string | null };

/**
 * 5.5: a message that cannot be read is DROPPED, and a drop used to leave no trace at all.
 *
 * That is the shape of fault that hides for a week: the Body sends something, the Core quietly
 * ignores it, and the only symptom is a button that does nothing. Saying so once is enough to turn
 * "it just does not work" into a one-line answer.
 *
 * Counted rather than printed every time, because a Body sending malformed messages would send a lot
 * of them, and a flood is as useless as silence. Loud once, then at each power of ten - the same rule
 * reportWriteFailure uses. The raw text is never logged: it may contain whatever he just typed.
 */
let dropped = 0;
export function parseFromBody(raw: string): FromBody | null {
  try {
    const v = JSON.parse(raw);
    if (v && typeof v === 'object' && typeof v.t === 'string') return v as FromBody;
    dropped++;
    if (dropped === 1 || Math.log10(dropped) % 1 === 0) console.error(`dropped a message from the Body (${dropped}x): no 't' field`);
    return null;
  } catch (e) {
    dropped++;
    if (dropped === 1 || Math.log10(dropped) % 1 === 0) console.error(`dropped a message from the Body (${dropped}x): ${(e as Error).message}`);
    return null;
  }
}
