// Wire protocol between Core and Body (docs/PROTOCOL.md). Unknown `t` values are ignored by both sides.

import type { BusySession } from './claudemark.ts';
import type { MediaCmd, MediaNow } from './media.ts';

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
/**
 * Sheet 48 (2026-10-21, his pick): what kind of row a message is, so the cockpit can lay it on its own paper.
 * 'claude' = news from a Claude Code session (with `project`, its folder's name); 'action' = a chat reply in which
 * Aang really changed something for him (a tool that did more than look, or an email that went). Set by the brain
 * where it KNOWS, never guessed from the words. Ordinary chat and rows saved before 2026-10-21 have none.
 */
export type RowKind = 'claude' | 'action' | 'note.notice';
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
  /** Only mail where a person is waiting on him (2026-10-14, briefmail.ts): `why` is what they want, `id` the email. */
  unread: { from: string; subject: string; at: number; logo?: string; job?: boolean; id?: string; why?: string }[];
  /** Sheet 24: the day as morning, afternoon and evening, and when the rain starts. */
  parts?: { part: 'morn' | 'aftn' | 'eve'; temp: number; sky: 'sun' | 'moon' | 'partly' | 'cloud' | 'fog' | 'rain' | 'snow' | 'storm' }[];
  rainFrom?: string | null;
  rainIsSnow?: boolean;
  jobsNew: number;
  /** Today in Toronto, from Open-Meteo. Absent when the service did not answer. */
  weather?: { now: number; high: number; low: number; words: string; rain: number };
  week: number | null;
  weekResetsAt: number | null;
  /** Sheet 21: what is waiting on him (Claude jobs that need him, a question), for the Discord card's second section. */
  waiting?: string[];
  /** Samara's engine, when a newer castLabs one is out (2026-10-14): the brief shows a row with an Update button. */
  engine?: { title: string };
  /** Sheet 65: the Addons slip (addonbrief.ts), from CurseForge's own list. Absent when nothing has an update or errors. */
  addons?: import('./addonbrief.ts').AddonsSection;
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
  /** A full tab in his PC's Aang browser, brought to the front ("put it on, full browser"). */
  | { t: 'browser.open'; url: string }
  /** Passed straight through from the Body, to the Shell only (step 6.10b). The C# pet ignores it. */
  | PetAt
  /** What is playing (media.ts): from the pet to the Shell as it came. `media.cmd` goes the other way, checked, to the pet only. */
  | MediaNow
  | MediaCmd
  /** The mini player (2026-10-22): open it ("show the music player"). */
  | { t: 'player.open' }
  /**
   * The Shell owns the hotkey when the new front end is on (6.12b), opens its own typing box at once,
   * and tells the pet only to come out from the edge (`summon`) or go back (`dismiss`).
   */
  | { t: 'summon' } | { t: 'dismiss' } | { t: 'refocus' }
  /** The pet was clicked and the new front end is on, so the Shell opens its typing box. */
  | { t: 'typebox' }
  /** 2026-10-21: Claude's mark was clicked. The Shell shows its link jobs, else these older hook-tracked sessions,
   *  else says nothing is running. `what` is the prompt it is working on, or what it is waiting for. */
  /** 2026-10-21: exactly the sessions lighting the mark, every source (claudemark.ts claudeBusy). */
  | { t: 'mark.click'; sessions: BusySession[] }
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
  | { t: 'settings.set'; key: 'quietGame' | 'mute' | 'seeWindow' | 'usage' | 'autostart' | 'chimes'; on: boolean }
  | { t: 'settings.do'; what: 'hotkey' | 'undock' }
  /** C5 (2026-10-21): the wooden chimes' loudness, 0-100. The pet owns it, like the switches. */
  | { t: 'settings.volume'; volume: number }
  | { t: 'settings'; quietGame: boolean; mute: boolean; seeWindow: boolean; usage: boolean; autostart: boolean; chimes?: boolean; chimeVolume?: number }
  /** He picked a mode in the new typing box. The PET writes it to body.json; nothing else may. */
  | { t: 'mode'; mode: Mode }
  /** The bubble was clicked on a message naming a window (a Claude session): bring it forward. */
  | { t: 'bubble.focus'; focus: string }
  /** Parity with the old pet (2026-10-11): the pet's gate for messages Aang starts himself. The Shell applies
   *  the same rule the pet does, so a proactive message never pops over WoW, past mute, or past hidden. */
  | { t: 'bubble.state'; quiet: boolean; hidden: boolean; muted: boolean }
  /** A line the pet says itself (notes, errors, hellos, a held message coming out). Drawn by the new bubble. */
  | { t: 'pet.say'; text: string; hold?: number; focus?: string; host?: 'mac'; link?: string;
      /** 2026-10-21: his hello on sliding out. Never "something he said", and dropped when the chat box opens. */
      greet?: boolean }
  /** He clicked somewhere that is not the pet (the pet's mouse hook sees it); the Shell decides if it was outside its windows. */
  | { t: 'outside.click'; x: number; y: number }
  /** Sheet 17's wheel: held on Aang, and let go (physical screen pixels); and the Quiet disc. */
  | { t: 'wheel.open'; x: number; y: number }
  | { t: 'wheel.release'; x: number; y: number }
  | { t: 'quiet.toggle' }
  /** Sheet 56 (2026-10-21): right-click on Aang, for the Shell to draw his menu at the mouse (physical pixels). The pet
   *  says what is ticked; the brain adds when a hush ends (`hushedUntil`, ms since 1970, 0 when not hushed). */
  | { t: 'menu.open'; x: number; y: number; state: MenuState }
  /** Sheet 56: what he picked in it, for the pet, which runs the same handler its old menu item ran. */
  | { t: 'menu.pick'; id: string }
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
  /** C2 (2026-10-21): every Claude session the aang-link mod reports (claudelink.ts Job), newest activity first. */
  | { t: 'claude.jobs'; jobs: import('./claudelink.ts').Job[] }
  /** C2: what is waiting on him, permissions first, then questions, then plans (claudelink.ts WaitItem). */
  | { t: 'claude.wait'; items: import('./claudelink.ts').WaitItem[];
      /** Sent while he is in the Claude app (claudefront.ts): nothing in it may pop up on its own (2026-10-21). */
      quiet?: boolean }
  /** C5 (2026-10-21): the one mark over his head and the chime to play, worked out by claudemark.ts. */
  | import('./claudemark.ts').MarkMsg
  /** C2: whether a claude.answer/send/pause/play/model was taken; `why` is the plain reason when it was not. */
  | { t: 'claude.said'; of: string; ok: boolean; why?: string }
  /** One quiet line beside his head (the cockpit's whisper size, 6.12): now playing, and the like.
   *  `controls: 'media'` adds back, play/pause and skip. */
  | { t: 'whisper'; text: string; controls?: 'media' }
  | { t: 'bubble'; text: string; stream: boolean; id?: string; who?: string; proactive?: boolean;
      /** The row this message was stored as, when it was stored. What a right-click acts on. */
      turn?: number;
      /** Sheet 48: the row's kind when the brain knows it (the same as the stored row's extra.kind/extra.project). */
      kind?: RowKind; project?: string;
      /** 2026-10-21: Claude news also says which session (its id) and, when the app knows it, its claude:// link, so a
       *  click on the message takes him to THAT session (his ask: "click into a done Claude task ... be taken to that job"). */
      session?: string; open?: string;
      /** Who or what it is about, on the row above the text (2026-10-14): a channel's picture, a site's or a sender's icon, as a data: address. */
      face?: { img: string; name: string };
      /** A reminder coming due (its id): the cockpit shows it as a short ask, Got it or Snooze 5 min (6.12). */
      reminder?: string;
      /** The morning brief as a card (6.15): the cockpit draws this instead of the text. */
      brief?: BriefCard;
      /** Sheet 65: Aang updating addons in CurseForge: icons for the names in the line, and the progress rows. */
      addons?: import('./addondesk.ts').AddonsLine;
      /** E7: links that go with it as buttons in Discord (Join, Open in Waze); at the desk they show as chips. */
      links?: { label: string; url: string }[];
      /** kind 'note.notice' (2026-10-22, notenotice.ts): Qwen noticed this line in that note. A click opens the note;
       *  sheet 60 will give it its own livelier look. */
      notice?: { noteId: string; line: string };
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
  | { t: 'bubble.dots'; who?: string; doing?: string }
  | { t: 'bubble.clear'; retry?: boolean }
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
      draft?: { to: string; subject: string; body: string; fresh: string; /** E6: CC and the files, as he will see them */ cc?: string; files?: string };
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
  /** C6 (2026-10-22): a Claude job before it is sent (asks.js draws it). `hash` is SHA-256 of `text`, echoed back on Go. */
  | { t: 'claude.start'; id: string; hash: string; words: string; line: string; folder: string; text: string; door: 'link' | 'door2' | 'prefill'; model?: string; quota?: boolean; resume?: { title: string; running: boolean } }
  /** Sheet 17: every running timer, after any change and when a Shell connects. Times are epoch ms. */
  | { t: 'timer.state'; timers: { id: string; label: string; total: number; end: number; paused: number; colour?: string; done?: number }[] }
  /** Sheet 17: every note, newest first, after any change and when a Shell connects. */
  | { t: 'notes.state'; notes: import('./notes.ts').Note[]; cats?: { builtin: string[]; own: string[] } }
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
  | { t: 'mac.brief'; id: string; prompt: string; facts: string[]; recent: { who: 'you' | 'Aang'; text: string }[]; talk: { who: 'you' | 'Aang'; text: string; ts: string }[];
      /** The Mac's morning brief when Shadow is off: what only the PC knows. */
      morning?: { sentDay: string; companies: string[]; jobsNew: number; waiting: string[] } }
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
  /** Sheet 21: a drawn card that goes with his question in Discord (his email, his week). Discord only. */
  /** E7: link buttons that go with his answer in Discord (Open in Waze, Join). */
  | { t: 'links.show'; id: string; links: { label: string; url: string }[] }
  | { t: 'card.show'; id: string; kind: 'inbox' | 'week' | 'email'; data: Record<string, unknown>;
      /** E3: the email the card is about, the buttons that apply to it, and a call's own link for Join. */
      email?: string; acts?: string[]; join?: string }
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
  /**
   * The scroll-back (2026-10-20): `kind` and `extra` ride on rows that were more than words when he first saw
   * them. kind 'say' = Aang spoke on his own (extra may hold face, about {url,title,thumb}, brief, research,
   * links, reminder, away); 'yes' = a permission he gave (extra.yes, see the turn.updated note); 'plan' and
   * 'shown' = what the Shell saved with shown.save. Both are absent for ordinary chat.
   * Sheet 48 (2026-10-21): extra.kind (a RowKind) and extra.project may ride on rows saved from then on.
   */
  | { t: 'history.reply'; q: string; items: { id: number; ts: string; who: 'you' | 'Aang'; text: string; kind?: string; extra?: Record<string, unknown> }[];
      /** Echoed back so the Body knows this is an older page and not a fresh search. */
      before?: number }
  /**
   * The database rows the exchange just became. Sent after a reply is stored so the Body can let Joshua
   * right-click what is on screen. `id` is the submit id it answers, which identifies the REQUEST; the
   * turn numbers identify the rows, and the two are not interchangeable.
   */
  | { t: 'turn.saved'; id: string; userTurn: number; aangTurn: number }
  /**
   * The answer to turn.undo, to the socket that pressed it. `said` is always one plain sentence for him. When
   * something really was undone, `extra.yes.undone` is set ({ at, said, revoked? }) and the row should redraw
   * from this `extra`; otherwise `extra` is the row as it was and `said` explains why nothing changed.
   *
   * extra.yes is { question, choice: 'once' | 'always', did, ok, note, at, kindKey?, undo?: number, cant?: string,
   * undone? }: `undo` means an Undo can be offered, `kindKey` means an "always" that can be taken back, and
   * `cant` is the plain reason when neither is possible.
   */
  | { t: 'turn.updated'; id: number; kind: string | null; extra: any; said: string }
  /** shown.save worked: `id` is the new row, `ref` echoes the Shell's own reference when it sent one. */
  | { t: 'shown.saved'; id: number; ref?: string }
  /** The morning brief, worked out without the model. */
  | { t: 'brief.reply'; text: string }
  /** Something only the desktop can do to its windows. Sent only after Joshua has agreed to it. */
  | { t: 'hands.request'; id: string; action: 'close' | 'forcequit' | 'arrange' | 'media' | 'clipset'; what?: string; how?: string }
  | { t: 'error'; id?: string; message: string; next: string };

export type FromBody =
  /** media.ts: the pet's now-playing feed, and the player window's buttons. */
  | MediaNow
  | MediaCmd
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
  /** 2026-10-21: the click was on Claude's mark over his head (the pet works that out from its own drawing). */
  | { t: 'mark.click' }
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
  | { t: 'settings.set'; key: 'quietGame' | 'mute' | 'seeWindow' | 'usage' | 'autostart' | 'chimes'; on: boolean }
  | { t: 'settings.do'; what: 'hotkey' | 'undock' }
  /** C5 (2026-10-21): the wooden chimes' loudness, 0-100. The pet owns it, like the switches. */
  | { t: 'settings.volume'; volume: number }
  | { t: 'settings'; quietGame: boolean; mute: boolean; seeWindow: boolean; usage: boolean; autostart: boolean; chimes?: boolean; chimeVolume?: number }
  /** He picked a mode in the new typing box. The PET writes it to body.json; nothing else may. */
  | { t: 'mode'; mode: Mode }
  /** The bubble was clicked on a message naming a window (a Claude session): bring it forward. */
  | { t: 'bubble.focus'; focus: string }
  /** Parity with the old pet (2026-10-11): the pet's gate for messages Aang starts himself. The Shell applies
   *  the same rule the pet does, so a proactive message never pops over WoW, past mute, or past hidden. */
  | { t: 'bubble.state'; quiet: boolean; hidden: boolean; muted: boolean }
  /** A line the pet says itself (notes, errors, hellos, a held message coming out). Drawn by the new bubble. */
  | { t: 'pet.say'; text: string; hold?: number; focus?: string; host?: 'mac'; link?: string;
      /** 2026-10-21: his hello on sliding out. Never "something he said", and dropped when the chat box opens. */
      greet?: boolean }
  /** He clicked somewhere that is not the pet (the pet's mouse hook sees it); the Shell decides if it was outside its windows. */
  | { t: 'outside.click'; x: number; y: number }
  /** Sheet 17's wheel: held on Aang, and let go (physical screen pixels); and the Quiet disc. */
  | { t: 'wheel.open'; x: number; y: number }
  | { t: 'wheel.release'; x: number; y: number }
  | { t: 'quiet.toggle' }
  /** Sheet 56 (2026-10-21): right-click on Aang (from the pet) and his pick in the Shell's menu (to the pet). */
  | { t: 'menu.open'; x: number; y: number; state: MenuState }
  | { t: 'menu.pick'; id: string }
  /** The new bubble is showing something (or the typing box is open), so the pet must not tuck away under it. */
  | { t: 'bubble.busy'; on: boolean }
  /** The pet could not bring that Claude window forward: it was closed. */
  | { t: 'bubble.focus.failed' }
  /** The browser's Trail clean up asks Qwen to sort loose tabs (numbered site and title lines only). */
  | { t: 'tidy.ask'; id: number; prompt: string }
  /** 6.25a: the browser's answer to a driving step, and his STOP on a job. */
  | { t: 'drive.result'; id: number; ok: boolean; [k: string]: unknown }
  | { t: 'drive.stopped'; job: number }
  /** Samara's engine update is fully ready on this PC (sheet 35); the brain names it and tells him. */
  | { t: 'engine.ready'; version: string; major?: boolean }
  /** castLabs' signing tool needs him to sign in again before a new engine can play paid video. */
  | { t: 'engine.signin'; signIn: boolean }
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
  /** Sheet 24: a button under an opened brief row. `item` is its place in the brief Aang last sent; Aang writes the request. */
  | { t: 'brief.act'; item: number; act: 'through' | 'reply' | 'prep' | 'drive' | 'matches' }
  /** Sheet 65: "Update ticked" under the brief's Addons slip: the CurseForge project ids he left ticked. */
  | { t: 'addons.update'; ids: number[] }
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
  | { t: 'claude.start.reply'; id: string; hash: string; choice: 'go' | 'change' | 'no' }
  /** Sheet 17: a timer set on the dial, the keys on the hourglass, and "5 more" when one goes off. */
  | { t: 'timer.start'; ms: number; label: string; colour?: string }
  /** Sheet 67 v2: add (ms, default +1 min, minus too), pause, stop, again (ms = a new length), rename (label), colour. */
  | { t: 'timer.act'; id: string; action: 'add' | 'pause' | 'stop' | 'again' | 'rename' | 'colour'; ms?: number; label?: string; colour?: string }
  /** Sheet 17: a note saved from the editor, the screen, or a new one; and a note deleted. */
  | { t: 'notes.save'; note: unknown }
  | { t: 'notes.delete'; id: string }
  /** Sheet 62 (2026-10-22): "Keep as a note" on something he sent to Aang: its words (or name), the link and the site. */
  | { t: 'notes.keep'; text: string; url: string; site: string }
  /** The one switch for "Aang notices things in your notes" (notenotice.ts); its place in Settings comes with sheet 60. */
  | { t: 'notice.set'; on: boolean }
  /** Sheet 60: "+ Category" on the board, a category of his own (it takes the next colour). */
  | { t: 'notes.cat'; name: string }
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
  /** The scroll-back: Undo on a "You said yes" row (turn id). Answered with turn.updated. */
  | { t: 'turn.undo'; id: number }
  /**
   * Keep something the Shell showed him (a Claude or Samara plan) as a row, so the scroll-back can bring it
   * back. Desktop only. `text` at most 600 characters, `extra` at most 200 KB of JSON; `ref` (at most 80)
   * comes back on shown.saved so the Shell knows which of its things got which row.
   */
  | { t: 'shown.save'; kind: 'plan' | 'shown'; text: string; extra?: Record<string, unknown>; ref?: string }
  /** Replace the rich part of a row the Shell saved (a plan whose steps have moved on). Only 'plan'/'shown' rows. */
  | { t: 'shown.update'; id: number; extra: Record<string, unknown> }
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
  /**
   * C2 (2026-10-21): his answer to a waiting item (claude.wait). A permission or plan takes `decision`
   * (`message` with deny-message); a question takes `answers`, question text -> chosen label(s) or his own words.
   * Shell only; answered with claude.said. The wire format is in docs/COCKPIT-BUILD.md ("C1/C2 wire format").
   */
  | { t: 'claude.answer'; id: string; decision?: 'allow' | 'always' | 'deny' | 'deny-message'; message?: string; answers?: Record<string, string> }
  /** A message to a session: `now` slips in at Claude's next step; `after` waits for the task in progress to be ticked. */
  | { t: 'claude.send'; session: string; text: string; when: 'now' | 'after' }
  | { t: 'claude.pause'; session: string }
  /** 2026-10-22: he X'd a finished job's card, opened it in Claude, or said Nice on its pop-out: it is read (the teal tick goes with the last). */
  | { t: 'claude.ackdone'; id: string }
  /** Play: the session picks up again, with his words or a short "carry on". */
  | { t: 'claude.play'; session: string; text?: string }
  | { t: 'claude.model'; session: string; model: string }
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
/** Sheet 56 (2026-10-21): what the right-click menu shows ticked. */
export interface MenuState {
  muted?: boolean; quiet?: 'auto' | 'always' | 'never'; dock?: string; docked?: boolean; model?: string; saving?: boolean;
  models?: { id: string; label: string }[]; hushedUntil?: number; jobsRunning?: number;
  /** Sheet 60: "Let Aang bring up my notes" (notenotice.ts), shown ticked in Hush. */
  notesNotice?: boolean;
}
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
