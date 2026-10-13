import type { Mode } from './protocol.ts';

export type Lane = 'quick' | 'smart' | 'deep';

export const MODELS: Record<Lane, { model: string; label: string }> = {
  quick: { model: 'claude-haiku-4-5-20251001', label: 'Quick' },
  smart: { model: 'claude-sonnet-5', label: 'Smart' },
  deep: { model: 'claude-opus-5', label: 'Deep' },
};

const HARD = /\b(write|code|debug|refactor|research|compare|analy[sz]e|plan|architecture|explain (why|how)|step by step|in detail|pros and cons|design)\b/i;

/**
 * A request to DO something, not to chat. These went to Quick (Haiku, no thinking) and came back as "plug it into
 * Maps yourself" and "I can't write to logs", with the tool to do it sitting right there (2026-09-22). Picking the
 * right one of 45 tools is where the small model fails, so doing goes to Smart; chat stays cheap on Quick.
 */
// 2026-10-12: + get, fastest, route, map, watch, "how do I get", "where is": "whats the fastest way from undercity to
// thunder bluff?" and "get anderson paak tiny desk on youtube" both went to Quick, which fumbled them.
export const ACT = /\b(open|opne|oepn|play|paly|plya|put on|get|fastest|quickest|route|map|watch|stream|latest|news|price|how (do|can|would|should) i (get|go|reach|make|fix)|where('?s| is| are| can i| do i)|send|snd|sned|e-?mail|text|message|remind|note|log|save|make|create|move|rename|copy|delete|remove|tidy|clean up|organi[sz]e|find|look up|search|show me|get me|pull up|download|install|start|launch|run|close|quit|fix|set|turn (on|off)|book|schedule|add|draft|reply|directions|navigate|go to|check|screenshot|apply|cancel|undo)\b/i;

/**
 * Everyday idioms that happen to contain an ACT word but plainly are not a request - found live (2026-09-22):
 * "on that note", "went for a run" and "want to go to bed" all escalated to Smart for nothing. A short,
 * explicit list of the actual idioms, not a general "sounds like a first-person aside" guess: a broad rule
 * ("starts with I...") would just as happily have swallowed "I need to set a reminder", a real request that
 * has to keep escalating (Quick fumbling exactly these was the whole reason ACT exists).
 */
const KNOWN_ASIDE = /\bon that note\b|\b(went|going|go)\s+for\s+a\s+run\b|\bgo(ing)?\s+to\s+(bed|sleep)\b|\b(so|pretty|really)\s+close\b|\bi'?m\s+close\b/i;

/**
 * "put on" as he actually types it fast (2026-10-12: "camn you oput on naruto?" went to Quick, which has no watch
 * tool, and came back as a generic question): a stray letter before it, or the space in the wrong place.
 */
const PUT_ON = /\b[a-z]?pu+t+\s*(it\s+|that\s+|this\s+|some\s+|something\s+)?on\b|\bpu ton\b/i;

function actsOnIt(text: string): boolean {
  return (ACT.test(text) || PUT_ON.test(text)) && !KNOWN_ASIDE.test(text);
}

export interface Choice { lane: Lane; needsConsent: boolean }

/** Where the message came from. Discord means he is away from the PC; the desktop bubble means he is at it. */
export type Channel = 'desktop' | 'discord';

/**
 * Auto stays on Quick for chat and escalates to Smart for work that needs it. While saving quota is on,
 * Smart and Deep are never chosen silently: an explicit request needs consent (`once`).
 *
 * The strongest routing signal is not the words, it is WHERE he asked (2026-09-22, after reading the
 * research rather than guessing). Keyword matching only ever guesses at how hard a message is, and the
 * independent benchmark of twelve real routers (RouterArena) found most of them barely beat "always use the
 * big model" at that. The channel is not a guess: on Discord he is away, waiting on his phone, and 444 ms
 * of first token buys him nothing - but a wrong "I can't do that" costs him the whole errand. In the bubble
 * he is at the PC, usually mid-game, and speed is the point. So Discord gets Smart outright.
 *
 * It also keeps the model STABLE per channel, which matters more than it looks: the prompt cache is
 * per-model, so a router that flips models between turns throws the cache away each time and can cost more
 * of his week than never routing at all.
 *
 * Saving quota still wins over all of this: it is his own explicit "spend less" and is never overridden.
 */
export function pickLane(text: string, mode: Mode, saving: boolean, once: boolean, channel: Channel = 'desktop'): Choice {
  if (mode === 'quick') return { lane: 'quick', needsConsent: false };
  if (mode === 'smart' || mode === 'deep') {
    return { lane: mode, needsConsent: saving && !once };
  }
  if (saving) return { lane: 'quick', needsConsent: false };
  if (channel === 'discord') return { lane: 'smart', needsConsent: false };
  return { lane: text.length > 500 || HARD.test(text) || actsOnIt(text) ? 'smart' : 'quick', needsConsent: false };
}
