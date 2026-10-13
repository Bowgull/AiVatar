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

/**
 * Where the pet is (step 6.10b). ONE definition, used in both directions: the Body sends it and the
 * Core passes it to the Shell unchanged, so a field added to one cannot go missing from the other.
 */
export interface PetAt {
  t: 'pet.at';
  /** The SPRITE's rectangle in screen pixels, already scaled - not the window's. */
  sprite: { x: number; y: number; width: number; height: number };
  /** The working area of the display he is on, so nothing lands under the taskbar. */
  screen: { x: number; y: number; width: number; height: number };
  scale: number;
  edge: 'none' | 'left' | 'right' | 'top' | 'bottom';
  /** Docked and collapsed to his head. */
  peeking: boolean;
}

/** See `brief.card`. `logo` is a data URL or absent (the page draws the first letter). */
export interface BriefCard {
  day: string;
  events: { title: string; start: string | null; end: string | null; allDay: boolean; where: string }[];
  unread: { from: string; subject: string; at: number; logo?: string; job?: boolean }[];
  jobsNew: number;
  /** Today in Toronto, from Open-Meteo. Absent when the service did not answer. */
  weather?: { now: number; high: number; low: number; words: string; rain: number };
  week: number | null;
  weekResetsAt: number | null;
  /** Sheet 21: what is waiting on him (Claude jobs that need him, a question), for the Discord card's second section. */
  waiting?: string[];
  error?: string;
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
  /** Passed straight through from the Body, to the Shell only (step 6.10b). The C# pet ignores it. */
  | PetAt
  /**
   * The Shell owns the hotkey when the new front end is on (6.12b), opens its own typing box at once,
   * and tells the pet only to come out from the edge (`summon`) or go back (`dismiss`).
   */
  | { t: 'summon' } | { t: 'dismiss' } | { t: 'refocus' }
  /** The pet was clicked and the new front end is on, so the Shell opens its typing box. */
  | { t: 'typebox' }
  /** Window 2 (6.15): the pet's Panel menu with the new front end on, so the Shell opens the desk. */
  | { t: 'desk.open'; tab?: number }
  /** 6.17: Snipit from the pet's menu, passed to the Shell, which does the snipping. */
  | { t: 'snip' }
  /** 6.20: open Aang's browser, from the pet's menu. */
  | { t: 'browser' }
  /** 6.17 Highlight from the pet's menu: read what he has selected in the app in front. */
  | { t: 'highlight' }
  /** 6.17 the drop: a file is being dragged over the pet (on) or has left (off). */
  | { t: 'drop.hover'; on: boolean }
  /** 6.17: files dropped on the pet, paths only. The brain checks them before anything reads them. */
  | { t: 'drop'; files: string[] }
  /** 6.17: "Remember it" on a dropped file, from the bubble. */
  | { t: 'drop.keep'; path: string }
  /** 6.18: one search over everything, from window 2. */
  | { t: 'search'; q: string }
  /** 6.18: the answer, grouped by where it lives. Every index is on this PC: searching costs nothing. */
  | { t: 'search.reply'; q: string;
      facts: { id: number; text: string }[];
      talk: { ts: string; who: 'you' | 'Aang'; text: string; how: 'words' | 'meaning' }[];
      vault: { title: string; path: string; head: string; how: 'words' | 'meaning' }[];
      jobs: { id: string; title: string; company: string; status: string }[];
      addons: { title: string; version: string }[] }
  /** 6.17: the brain's verdict, so the balloon can airbend it in (or spit it back out). */
  | { t: 'drop.go'; name: string; refused?: string; folder?: boolean }
  /** 6.17: what Qwen made of it. `summary` is empty when Qwen could not read it (in a game, or not running). */
  | { t: 'drop.done'; name: string; path: string; summary: string; kb: number; from: string; more: number }
  /** Window 2's Settings (6.15 pass 2): the pet owns the switches; the Shell asks, sets and is told. */
  | { t: 'settings.get' }
  | { t: 'settings.set'; key: 'quietGame' | 'mute' | 'seeWindow' | 'usage' | 'autostart'; on: boolean }
  | { t: 'settings.do'; what: 'hotkey' | 'undock' }
  | { t: 'settings'; quietGame: boolean; mute: boolean; seeWindow: boolean; usage: boolean; autostart: boolean }
  /** He picked a mode in the new typing box. The PET writes it to body.json; nothing else may. */
  | { t: 'mode'; mode: Mode }
  /** The bubble was clicked on a message naming a window (a Claude session): bring it forward. */
  | { t: 'bubble.focus'; focus: string }
  /** Parity with the old pet (2026-10-11): the pet's gate for messages Aang starts himself. The Shell applies
   *  the same rule the pet does, so a proactive message never pops over WoW, past mute, or past hidden. */
  | { t: 'bubble.state'; quiet: boolean; hidden: boolean; muted: boolean }
  /** A line the pet says itself (notes, errors, hellos, a held message coming out). Drawn by the new bubble. */
  | { t: 'pet.say'; text: string; hold?: number; focus?: string; host?: 'mac'; link?: string }
  /** He clicked somewhere that is not the pet (the pet's mouse hook sees it); the Shell decides if it was outside its windows. */
  | { t: 'outside.click'; x: number; y: number }
  /** Sheet 17's wheel: held on Aang, and let go (physical screen pixels); and the Quiet disc. */
  | { t: 'wheel.open'; x: number; y: number }
  | { t: 'wheel.release'; x: number; y: number }
  | { t: 'quiet.toggle' }
  /** The new bubble is showing something (or the typing box is open), so the pet must not tuck away under it. */
  | { t: 'bubble.busy'; on: boolean }
  /** The pet could not bring that Claude window forward: it was closed. */
  | { t: 'bubble.focus.failed' }
  /** The browser's Trail clean up: Qwen's grouping, or why there is none ('game' means wait until WoW is closed). */
  | { t: 'tidy.answer'; id: number; ok: boolean; text?: string; why?: string }
  /** 6.25a: one driving step for the browser (open, read, click, type, scroll, picture, start, finish). */
  | { t: 'drive'; id: number; op: string; a: Record<string, unknown> }
  /** An ask he never answered ran out (the brain said no for him): take it off the bubble. */
  | { t: 'ask.expired'; id: string }

  /** Whether any Claude Code session Aang is following (a job hunt, a self-change, anything opened through
   *  start_claude) is currently working or waiting on him, right now - continuous, not a point-in-time
   *  message. Joshua, 2026-09-23: asked to run a job search, could not tell it was doing anything. Sent
   *  once on connect and again only when it changes. */
  | { t: 'claude.working'; working: boolean;
      /** What it is, in his words ("job hunt"), so a click on the icon can say so rather than just glow. */
      what?: string;
      /** Set when the session is on the MacBook, so the click routes there instead of to a window here. */
      host?: 'mac' }
  /** One quiet line beside his head (the cockpit's whisper size, 6.12): now playing, and the like.
   *  `controls: 'media'` adds back, play/pause and skip. */
  | { t: 'whisper'; text: string; controls?: 'media' }
  | { t: 'bubble'; text: string; stream: boolean; id?: string; who?: string; proactive?: boolean;
      /** The row this message was stored as, when it was stored. What a right-click acts on. */
      turn?: number;
      /** A reminder coming due (its id): the cockpit shows it as a short ask, Got it or Snooze 5 min (6.12). */
      reminder?: string;
      /** The morning brief as a card (6.15): the cockpit draws this instead of the text. */
      brief?: BriefCard;
      /** The weekly sweep as a card (6.15b), with where its note was written. */
      research?: import('./watch.ts').ResearchCard & { file?: string };
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
  /**
   * A costlier model was asked for while saving quota is on: allowed once, or not at all.
   *
   * There is NO reply message for this, which is easy to get wrong. The turn has already stopped;
   * saying yes means submitting the same words again with `once: true`. `text` is carried so a window
   * that did not send the message can still answer it - the C# Body remembers what it submitted, and
   * the Shell's bubble cannot, because the typing box is still the Body's until 6.12b.
   */
  | { t: 'consent'; id: string; wanted: Mode; text: string }
  /** remembers, when set, is the standing-trust category (e.g. "open apps") that "Always allow" would grant. */
  | { t: 'permission'; id: string; tool: string; question: string; remembers?: string;
      /**
       * One short sentence explaining the CONCEPT, for someone who does not know the words - and for a
       * command, the exact text being run. Joshua, 2026-10-03: "im just seeing gibberish... still very
       * briefly explain the concept of what he's doing". Shown under the question, quieter, so it never
       * gets in the way once he already knows. Empty for anything that needs no explaining.
       */
      means?: string;
      /**
       * For a command, its exact text on its own. The cockpit keeps code out of the balloon and puts this
       * one tap away ("See the exact command", sheet 13); `means` still carries it for the old bubble and
       * Discord, which show it inline.
       */
      exact?: string;
      /** An email waiting to be sent (6.14, sheet 13): the cockpit shows the letter itself. `fresh` is any
       *  address he has never written to. The question and `means` still carry it for the old bubble. */
      draft?: { to: string; subject: string; body: string; fresh: string };
      /** C1 (sheet 21, his ask 2026-10-13): this one might use a lot of quota. What it is, the estimate as a share of his
       *  week (low and high, 0 to 1), where the week stands, and when it resets. Never an "always": asked every time. */
      quota?: { what: string; low: number; high: number; week: number | null; resetsAt: number };
      /**
       * This one has to be HELD, not clicked (sheet 5, section 2): it sends, buys, deletes, or closes
       * someone else's app. A reflex click must not be able to do it. Decided by the Core, never by the
       * window drawing the question.
       */
      hold?: boolean }
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
  /** 6.17: what Highlight read, for the typing box. Outside content: read, never obeyed. */
  | { t: 'highlight.got'; text: string; app: string }
  /** 6.13: the plan before he acts. `gate` per step: none, ask (asks him first) or lever (hold to confirm). */
  | { t: 'plan'; id: string; steps: { text: string; tool?: string; gate: 'none' | 'ask' | 'lever' }[] }
  /** Sheet 17: every running timer, after any change and when a Shell connects. Times are epoch ms. */
  | { t: 'timer.state'; timers: { id: string; label: string; total: number; end: number; paused: number }[] }
  /** Sheet 17: every note, newest first, after any change and when a Shell connects. */
  | { t: 'notes.state'; notes: import('./notes.ts').Note[] }
  /** Sheet 17: "show my notes": the bubble opens the board. */
  | { t: 'notes.board' }
  /** Sheet 17: "set a timer" with no time: the bubble shows the dial. */
  | { t: 'timer.setup' }
  /** Sheet 17: a timer ran out. The bubble asks Got it / 5 more. */
  | { t: 'timer.done'; id: string; label: string; total: number }
  /** Sheet 16: pick one of 2 to 4 options (the glove list), plus "Something else". */
  | { t: 'choice'; id: string; question: string; options: { label: string; hint?: string }[] }
  /** A remembered choice was used (or just saved): the reply gets a gold "change" link that forgets it. */
  | { t: 'choice.used'; key: string; pick: string; fresh: boolean }
  // 9.A0: the one list of everything Aang can do, and the answer to running one by name.
  | { t: 'card.png'; id: string; ok: boolean; png?: string; error?: string }
  | { t: 'home.data'; id: string; week: number | null; pace: string; running: number; waiting: string[] }
  | { t: 'mac.brief'; id: string; prompt: string; facts: string[]; recent: { who: 'you' | 'Aang'; text: string }[]; talk: { who: 'you' | 'Aang'; text: string; ts: string }[] }
  | { t: 'away.reply'; text: string }
  | { t: 'puton.reply'; text: string }
  | { t: 'away.set' }
  | { t: 'gaming.post'; kind: 'upload' | 'news'; videoId?: string; title: string; channel?: string; thumb?: string; link?: string; summary?: string }
  | { t: 'video.card'; id: string; ok: boolean; by?: string; title?: string; author?: string; seconds?: number | null; from?: string; d?: unknown; why?: string }
  | { t: 'action.list'; actions: { name: string; label: string; description: string; params: unknown }[] }
  | { t: 'action.result'; id: string; ok: boolean; text: string; image?: { data: string; mimeType: string } }
  /** The morning brief as a card (6.15): the brief's data plus what only the Core knows - logos, which
   *  senders are companies he is tracking, new job matches overnight, and his Claude week. */
  | { t: 'brief.card'; card: BriefCard }
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
               score: number; verdict: 'apply' | 'maybe' | 'skip'; reason: string; url: string; at: string }[];
      /** 6.18 charts: every job card by stage, and replies per week by who answered (Claude or Qwen). */
      jobStages?: Record<string, number>;
      usage?: { week: string; claude: number; qwen: number }[];
      /** His Claude week right now, 0..1, for the box above the use chart (one scale per chart, never two). */
      quotaWeek?: number }
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
  | { t: 'hello'; v: number; pid?: number; client?: 'desktop' | 'discord';
      /** Set by the Electron Shell, which is a desktop client like the pet but is the only one that can
       *  show the pop-out. Without this the brain could not tell them apart, and would say a video was
       *  on over his game when nothing was there to show it. */
      shell?: boolean;
      /** The Shell is drawing the replies (the new bubble), so desktop replies can keep their formatting. */
      bubble?: boolean }
  /** The Body: whether Joshua has touched the keyboard or mouse lately, sent when that changes. */
  | { t: 'desk'; active: boolean }
  | { t: 'presence'; quiet: boolean; foreground: string; title?: string; watching?: boolean; hwnd?: number }
  | { t: 'poked' }
  /**
   * The pop-out says playback changed (step 6.8). Sent ONLY when it changes: started, paused, resumed,
   * or ran out. There is deliberately no heartbeat, because Simkl's own session expires on its own and
   * polling it costs 45 to 135 times as much for the same answer.
   *
   * Seconds, not a percentage: the Core converts, because getting that wrong silently ticks off the
   * wrong amount of an episode.
   */
  | { t: 'watch.state'; playing: boolean; at: number; length: number;
      /** True once the video has genuinely run out, as opposed to being paused near the end. */
      ended?: boolean }
  /** The pop-out's "send to the MacBook" keycap (step 6.9). The Mac opens it in its own browser, which
   *  is the fallback for paid video that will not play on Shadow at all. */
  | { t: 'watch.tomac'; url: string }
  | { t: 'open.onmac'; url: string }
  | { t: 'summon' } | { t: 'dismiss' } | { t: 'refocus' }
  /** The pet was clicked and the new front end is on, so the Shell opens its typing box. */
  | { t: 'typebox' }
  | { t: 'desk.open'; tab?: number }
  /** 6.17: Snipit from the pet's menu, passed to the Shell, which does the snipping. */
  | { t: 'snip' }
  /** 6.20: open Aang's browser, from the pet's menu. */
  | { t: 'browser' }
  /** 6.17 Highlight from the pet's menu: read what he has selected in the app in front. */
  | { t: 'highlight' }
  /** 6.17 the drop: a file is being dragged over the pet (on) or has left (off). */
  | { t: 'drop.hover'; on: boolean }
  /** 6.17: files dropped on the pet, paths only. The brain checks them before anything reads them. */
  | { t: 'drop'; files: string[] }
  /** 6.17: "Remember it" on a dropped file, from the bubble. */
  | { t: 'drop.keep'; path: string }
  /** 6.18: one search over everything, from window 2. */
  | { t: 'search'; q: string }
  /** 6.18: the answer, grouped by where it lives. Every index is on this PC: searching costs nothing. */
  | { t: 'search.reply'; q: string;
      facts: { id: number; text: string }[];
      talk: { ts: string; who: 'you' | 'Aang'; text: string; how: 'words' | 'meaning' }[];
      vault: { title: string; path: string; head: string; how: 'words' | 'meaning' }[];
      jobs: { id: string; title: string; company: string; status: string }[];
      addons: { title: string; version: string }[] }
  /** 6.17: the brain's verdict, so the balloon can airbend it in (or spit it back out). */
  | { t: 'drop.go'; name: string; refused?: string; folder?: boolean }
  /** 6.17: what Qwen made of it. `summary` is empty when Qwen could not read it (in a game, or not running). */
  | { t: 'drop.done'; name: string; path: string; summary: string; kb: number; from: string; more: number }
  /** Window 2's Settings (6.15 pass 2): the pet owns the switches; the Shell asks, sets and is told. */
  | { t: 'settings.get' }
  | { t: 'settings.set'; key: 'quietGame' | 'mute' | 'seeWindow' | 'usage' | 'autostart'; on: boolean }
  | { t: 'settings.do'; what: 'hotkey' | 'undock' }
  | { t: 'settings'; quietGame: boolean; mute: boolean; seeWindow: boolean; usage: boolean; autostart: boolean }
  /** He picked a mode in the new typing box. The PET writes it to body.json; nothing else may. */
  | { t: 'mode'; mode: Mode }
  /** The bubble was clicked on a message naming a window (a Claude session): bring it forward. */
  | { t: 'bubble.focus'; focus: string }
  /** Parity with the old pet (2026-10-11): the pet's gate for messages Aang starts himself. The Shell applies
   *  the same rule the pet does, so a proactive message never pops over WoW, past mute, or past hidden. */
  | { t: 'bubble.state'; quiet: boolean; hidden: boolean; muted: boolean }
  /** A line the pet says itself (notes, errors, hellos, a held message coming out). Drawn by the new bubble. */
  | { t: 'pet.say'; text: string; hold?: number; focus?: string; host?: 'mac'; link?: string }
  /** He clicked somewhere that is not the pet (the pet's mouse hook sees it); the Shell decides if it was outside its windows. */
  | { t: 'outside.click'; x: number; y: number }
  /** Sheet 17's wheel: held on Aang, and let go (physical screen pixels); and the Quiet disc. */
  | { t: 'wheel.open'; x: number; y: number }
  | { t: 'wheel.release'; x: number; y: number }
  | { t: 'quiet.toggle' }
  /** The new bubble is showing something (or the typing box is open), so the pet must not tuck away under it. */
  | { t: 'bubble.busy'; on: boolean }
  /** The pet could not bring that Claude window forward: it was closed. */
  | { t: 'bubble.focus.failed' }
  /** The browser's Trail clean up asks Qwen to sort loose tabs (numbered site and title lines only). */
  | { t: 'tidy.ask'; id: number; prompt: string }
  /** 6.25a: the browser's answer to a driving step, and his STOP on a job. */
  | { t: 'drive.result'; id: number; ok: boolean; [k: string]: unknown }
  | { t: 'drive.stopped'; job: number }
  /**
   * Where the pet IS (step 6.10b), so the Shell can hang its windows off him. Sent by the C# Body when
   * he is dragged, docked, rescaled or moved between displays - on a change, never on a timer.
   *
   * The rectangle is the SPRITE's, not the window's: the pet window is mostly empty room for the bubble
   * to grow into, and its corner moves when display scaling changes while the sprite deliberately does
   * not. Screen pixels, already scaled, because the Body is the only side that knows the scale for
   * certain.
   */
  | PetAt
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
  /** 6.13: his answer to a plan. */
  | { t: 'plan.reply'; id: string; go: boolean }
  /** Sheet 17: a timer set on the dial, the keys on the hourglass, and "5 more" when one goes off. */
  | { t: 'timer.start'; ms: number; label: string }
  | { t: 'timer.act'; id: string; action: 'add' | 'pause' | 'stop' }
  /** Sheet 17: a note saved from the editor, the screen, or a new one; and a note deleted. */
  | { t: 'notes.save'; note: unknown }
  | { t: 'notes.delete'; id: string }
  /** His pick from a choice list: the option's index, or -1 for "Something else". */
  | { t: 'choice.reply'; id: string; pick: number }
  | { t: 'action.list' }
  | { t: 'card.draw'; id: string; kind: string; data?: unknown }
  | { t: 'claude.open'; cwd: string }
  | { t: 'home.data'; id: string }
  | { t: 'mac.brief'; id: string }
  | { t: 'mac.handled'; items: unknown[] }
  | { t: 'away' }
  | { t: 'puton'; words: string }
  | { t: 'video.watch'; id: string; url: string }
  | { t: 'idea.add'; text: string }
  | { t: 'action.run'; id: string; name: string; args?: Record<string, unknown> }
  /** The gold "change" link under a remembered choice: forget it, so Aang asks next time. */
  | { t: 'choice.forget'; key: string }
  /** Window 2's "Undo the last one" (6.15): the same undo stack the undo_last tool uses. His press is the yes. */
  | { t: 'undo.last' }
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
  /** His answer to a reminder: "Got it" ends it, "Snooze" brings the same words back in five minutes. */
  | { t: 'reminder.reply'; id: string; snooze: boolean }
  /** A media key pressed on the now-playing whisper. Goes through hands(), so it is asked once like media_key. */
  | { t: 'media'; key: 'playpause' | 'next' | 'previous' }
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
