// Instant answers (2026-11-01, his "go big", plan step 6.16's brain half): small talk, plain knowledge and snips he
// asks about are answered by the local model on his card in a fraction of a second; everything that touches his
// stuff still goes to Claude.
//
// Picked by measurement on his RTX 2000 Ada (Documents/Aang/reports/scoreboard/lineup 2026-11-01.md):
//   at the desk  MiniCPM-V 4.7 35B-A3B (2-bit, with its eyes): first word 0.17 s, 57 words/s, routes 63/72 of his real
//                messages right, 20/20 tool jobs deep into one long chat (Qwen3.5 35B: 13/20, twice), reads snips 15/15
//   in a game    Qwen3.5 4B: 3.3 GB beside the game, the best small router (65/72); small talk only, the rest to Claude
// The two big ones never share the card (13 + 3 GB on 13.5 free), so a game swaps them.
//
// THE LINE (local.ts rule 1, unchanged): the local lane has NO TOOLS. It reads and writes text; it cannot open, send,
// run or remember anything, so nothing it reads can talk it into acting. Whatever needs a tool is Claude's, and the
// local model hands anything it cannot answer back with the word HANDOFF, which Core turns into a Smart turn.
//
// Routing order, cheapest first:
//   1. rules in code (no model): a request to DO something, a short follow-up to Claude's last answer, hard work,
//      plain small talk. Measured: a router miss that sends "check my email" to a model with no tools is the dangerous
//      one, so anything the rules can see goes to Claude without asking the router at all.
//   2. the local router: one plain word (talk, know, mine, deep), 0.2 s on the big model, 0.4 s on the small one. One
//      word, not JSON: the same answers in half the time (routerace.mjs, 2026-11-01).
//   3. anything unclear, slow or broken: today's pickLane() choice, so a sick Ollama only ever costs speed.
import { readFileSync, statSync } from 'node:fs';
import { HARD, isSmallTalk } from './route.ts';
import type { LaneEvent } from './lane.ts';
import { LOCAL_CTX, stripThinking } from './local.ts';

const URL = process.env.AANG_OLLAMA ?? 'http://127.0.0.1:11434';
/** At the desk: the main local brain, built from MiniCPM-V 4.7 i1-IQ2_M and its Q8 eyes (lineup 2026-11-01.md). */
export const DESK_BRAIN = { model: process.env.AANG_LOCAL_BRAIN ?? 'minicpm-v47-eyes', label: 'MiniCPM', eyes: true };
/** While a game owns the card. */
export const GAME_BRAIN = { model: process.env.AANG_GAME_BRAIN ?? 'qwen3.5:4b', label: 'Qwen', eyes: false };
export type Brain = typeof DESK_BRAIN;

export type Route = 'talk' | 'know' | 'mine' | 'deep';
const ROUTES: Route[] = ['talk', 'know', 'mine', 'deep'];

/** The last answer: who gave it and when, for spotting follow-ups ("and times 2?") that belong to the same lane. */
export interface LastTurn { lane: string; at: number }
const FOLLOW_UP_MS = 5 * 60_000;
const FOLLOW_UP = /^(and|also|plus|what about|how about|then|so|but|yes|yeah|yep|yup|no|nope|nah|ok|okay|sure|do it|go ahead|it|that|this|those|they|them|he|she|why|which one)\b/i;
/**
 * Plainly asking Aang to DO something. Narrower than route.ts ACT on purpose: ACT was written to keep Haiku away from
 * anything that might need a tool, so it also catches "book", "get", "find", "where", "latest" and sent "who wrote the
 * book Dune?" to Claude. Here the router (65/72 on his real messages) judges those; the rule only takes what cannot be
 * anything else. Typos he really makes ("oput on", "opne") are in the list.
 */
export const DO_IT = /\b(open|opne|oepn|launch|start|run|close|quit|kill|play|paly|plya|pause|skip|put\s*(?:it|that|this|some|something)?\s*on|[a-z]pu?t on|stream|watch|send|snd|sned|e-?mail|text|message|dm|reply|draft|remind|reminder|timer|alarm|note (?:this|that|down)|save|remember|forget|make (?:a|me|the)|create|write (?:a|me|the) (?:file|note|page)|move|rename|copy|delete|remove|download|install|uninstall|set (?:a|an|the|up)|turn (?:on|off)|schedule|cancel|undo|screenshot|search (?:my|for|the web)|look (?:it )?up|check (?:my|if|the|on)|show me|pull up|navigate|directions|take me to)\b/i;
/**
 * Games: guides, places, quests, items, builds. Measured 2026-11-01: the local model answered "fastest way from Undercity
 * to Thunder Bluff" with a zeppelin that does not exist and put BotW's Warm Doublet in Akkala, both confidently, where
 * Claude (with look_up_web and his WoW Forever notes) was right. Games are what he asks about most, and a wrong game
 * answer costs him a run across the map, so they are Claude's.
 */
const GAMES = /\b(wow|warcraft|azeroth|classic|forever|botw|totk|zelda|hyrule|cemu|undercity|orgrimmar|stormwind|ironforge|thunder ?bluff|darnassus|tirisfal|barrens|quests?|dungeons?|raids?|bosse?s?|mounts?|talents?|rotation|loot|drops?|gear|ilvl|item level|addons?|patch(?:es)?|zeppelin|flight path|hearth|shrines?|korok|elden|diablo|overwatch|valorant|league|hearthstone|minecraft|pokemon|apex)\b/i;
/** Asking about himself, his past, Aang's memory or the weather outside: the local model has none of it ("is it nice
 *  out" was the one live question the router sent to small talk, 2026-11-01). */
const HIS_STUFF = /\b(weather|forecast|nice out|cold out|hot out|raining|snowing|temperature|remember|you said|i said|i told you|did i|my (?:\w+ )?(?:email|mail|calendar|files?|folder|notes?|schedule|brief|status|address|job|interview|tracker|account)|last (?:time|message|week))\b/i;

/** Where a message goes by rule alone, or null when the rules cannot tell and the router should be asked. */
export function ruleRoute(text: string, last: LastTurn | null, now = Date.now()): Route | null {
  const t = text.trim();
  if (!t) return null;
  if (DO_IT.test(t) || HIS_STUFF.test(t) || GAMES.test(t)) return 'mine';
  // "thanks", "lol nice": instant even right after a Claude answer.
  if (isSmallTalk(t)) return 'talk';
  // A short follow-up to something Claude just answered stays with Claude: it holds the conversation.
  if (last && last.lane !== 'local' && now - last.at < FOLLOW_UP_MS && (t.split(/\s+/).length <= 5 || FOLLOW_UP.test(t))) return 'mine';
  if (HARD.test(t)) return 'deep';
  return null;
}

const ROUTER_SYSTEM = `You route messages for Aang, a desktop assistant. Pick where this message goes.
talk: Small talk with Aang himself: a greeting, checking in, how are you, feelings, a joke or a line about Aang. Nothing to look up.
know: General knowledge or a short explanation anyone could answer from memory: facts, how-to, games, recipes. Nothing about Joshua himself, nothing live, nothing to do.
mine: Needs Joshua's own things or an action: his email, calendar, memory of past chats, files, apps to open or close, reminders, the weather, the web or anything recent, his Mac, Claude sessions.
deep: A big job: plan, build, research, compare several things or go through many items, with several steps.
If unsure between two, pick the later one in that list. Answer with one word.`;

/** Ask the local model for one word. Null on any failure or slowness: the caller falls back to today's routing. */
export async function routerRoute(brain: Brain, text: string, timeoutMs = 1500): Promise<Route | null> {
  try {
    const res = await fetch(`${URL}/api/chat`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, signal: AbortSignal.timeout(timeoutMs),
      body: JSON.stringify({ model: brain.model, stream: false, think: false, keep_alive: '2h',
        options: { temperature: 0, num_predict: 3, num_ctx: LOCAL_CTX },
        messages: [{ role: 'system', content: ROUTER_SYSTEM }, { role: 'user', content: `Message: "${text.slice(0, 1500)}"\nWhich route? One word: talk, know, mine, deep.` }] }),
    });
    if (!res.ok) return null;
    const j = await res.json() as { message?: { content?: string } };
    const word = String(j.message?.content ?? '').toLowerCase().match(/talk|know|mine|deep/)?.[0];
    return (word && ROUTES.includes(word as Route)) ? word as Route : null;
  } catch { return null; }
}

/** Pictures he attached (a snip, a dropped screenshot), from the note the Shell adds to his message. */
const DROPPED = /\[He dropped this file on me: (.+?\.(?:png|jpe?g|webp|gif))\. Read it with Read/gi;
const MAX_IMAGE_BYTES = 8 << 20;
export function attachedImages(text: string): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(DROPPED)) {
    try { if (statSync(m[1]).size <= MAX_IMAGE_BYTES) out.push(m[1]); } catch { /* gone or unreadable: Claude's Read will say so */ }
  }
  return out;
}
/** Any attached file at all (a PDF, a folder...): those are Claude's, which can read every kind. */
export const hasAttachment = (text: string) => /\[He dropped this file on me: /.test(text);

/**
 * The local lane: the same shape as a Claude Lane to Core (send, onEvent, interrupt, close), so streaming, the voice
 * check, memory and the "it said it can't, hand it to Smart" net all work unchanged. No tools, no session on disk: a
 * short history in memory (the recap Core adds on a lane switch covers the rest).
 */
export class LocalLane {
  private listener: (e: LaneEvent) => void = () => {};
  private history: { role: 'user' | 'assistant'; content: string }[] = [];
  private abort: AbortController | null = null;
  brain: Brain = DESK_BRAIN;
  /** Pictures for the next message only (a snip he asked about). */
  images: string[] = [];
  private readonly system: (brain: Brain) => string;
  constructor(system: (brain: Brain) => string) { this.system = system; }

  onEvent(cb: (e: LaneEvent) => void): void { this.listener = cb; }
  start(): void { void this.load(); }
  /** Load the model so his first message does not pay for it (Ollama keeps it 2 h, OLLAMA_KEEP_ALIVE). */
  async load(): Promise<void> {
    try { await fetch(`${URL}/api/generate`, { method: 'POST', body: JSON.stringify({ model: this.brain.model, keep_alive: '2h', options: { num_ctx: LOCAL_CTX } }), signal: AbortSignal.timeout(90_000) }); } catch { /* the first message will try again */ }
  }
  async warm(): Promise<null> { await this.load(); return null; }

  send(text: string): void { void this.run(text); }

  private async run(text: string): Promise<void> {
    const t0 = Date.now(); let first: number | null = null; let out = '';
    const pics = this.brain.eyes ? this.images.splice(0) : (this.images = [], []);
    this.abort = new AbortController();
    const timer = setTimeout(() => this.abort?.abort(), 45_000);
    try {
      const user: Record<string, unknown> = { role: 'user', content: text };
      if (pics.length) user.images = pics.map(p => readFileSync(p).toString('base64'));
      const res = await fetch(`${URL}/api/chat`, {
        method: 'POST', headers: { 'content-type': 'application/json' }, signal: this.abort.signal,
        body: JSON.stringify({ model: this.brain.model, stream: true, think: false, keep_alive: '2h',
          options: { temperature: 0.6, num_predict: 400, num_ctx: LOCAL_CTX },
          messages: [{ role: 'system', content: this.system(this.brain) }, ...this.history, user] }),
      });
      if (!res.ok || !res.body) throw new Error(`Ollama answered ${res.status}`);
      const dec = new TextDecoder(); let buf = '';
      for await (const chunk of res.body as unknown as AsyncIterable<Uint8Array>) {
        buf += dec.decode(chunk, { stream: true });
        let i; while ((i = buf.indexOf('\n')) >= 0) {
          const line = buf.slice(0, i); buf = buf.slice(i + 1);
          if (!line.trim()) continue;
          const piece = String((JSON.parse(line) as { message?: { content?: string } }).message?.content ?? '');
          if (!piece) continue;
          if (first === null) first = Date.now();
          out += piece;
          this.listener({ t: 'delta', text: piece, reset: false });
        }
      }
      const answer = stripThinking(out);
      // Only a real answer joins the history; a handoff is Smart's turn, not part of this conversation.
      if (answer && !/\bHANDOFF\b/.test(answer)) {
        this.history.push({ role: 'user', content: text.slice(0, 2000) }, { role: 'assistant', content: answer });
        while (this.history.length > 16) this.history.splice(0, 2);
      }
      this.listener({ t: 'result', ok: !!answer, text: answer, ms: Date.now() - t0, ttftMs: first === null ? null : first - t0,
        ctxTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, outTokens: 0, tools: [], subtype: 'success', served: [this.brain.model] });
    } catch (e) {
      this.listener({ t: 'result', ok: false, text: (e as Error).message, ms: Date.now() - t0, ttftMs: null,
        ctxTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, outTokens: 0, tools: [], subtype: 'error', served: [this.brain.model] });
    } finally { clearTimeout(timer); this.abort = null; }
  }

  async interrupt(): Promise<void> { this.abort?.abort(); }
  close(): void { this.abort?.abort(); }
}

/** The local answer asks to be handed on: Core turns this into a Smart turn, never shown. */
export const HANDED_OFF = /\bHANDOFF\b/;
