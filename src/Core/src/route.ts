import type { Mode } from './protocol.ts';

export type Lane = 'quick' | 'smart' | 'deep';

export const MODELS: Record<Lane, { model: string; label: string }> = {
  quick: { model: 'claude-haiku-4-5-20251001', label: 'Quick' },
  smart: { model: 'claude-sonnet-5', label: 'Smart' },
  deep: { model: 'claude-opus-5', label: 'Deep' },
};

const HARD = /\b(write|code|debug|refactor|research|compare|analy[sz]e|plan|architecture|explain (why|how)|step by step|in detail|pros and cons|design)\b/i;

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
  return { lane: text.length > 500 || HARD.test(text) ? 'smart' : 'quick', needsConsent: false };
}
