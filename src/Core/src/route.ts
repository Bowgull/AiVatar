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
export const ACT = /\b(open|opne|oepn|play|paly|plya|put on|send|snd|sned|e-?mail|text|message|remind|note|log|save|make|create|move|rename|copy|delete|remove|tidy|clean up|organi[sz]e|find|look up|search|show me|get me|pull up|download|install|start|launch|run|close|quit|fix|set|turn (on|off)|book|schedule|add|draft|reply|directions|navigate|go to|check|screenshot|apply|cancel|undo)\b/i;

export interface Choice { lane: Lane; needsConsent: boolean }

/**
 * Auto stays on Quick for chat and escalates to Smart for work that needs it. While saving quota is on,
 * Smart and Deep are never chosen silently: an explicit request needs consent (`once`).
 */
export function pickLane(text: string, mode: Mode, saving: boolean, once: boolean): Choice {
  if (mode === 'quick') return { lane: 'quick', needsConsent: false };
  if (mode === 'smart' || mode === 'deep') {
    return { lane: mode, needsConsent: saving && !once };
  }
  if (saving) return { lane: 'quick', needsConsent: false };
  return { lane: text.length > 500 || HARD.test(text) || ACT.test(text) ? 'smart' : 'quick', needsConsent: false };
}
