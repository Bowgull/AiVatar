// 6.25a: the driving rules (decision 42) as pure functions, testable without Electron.

/** What a click or a key would do, judged from the element itself. */
export type Weight = 'free' | 'lever' | 'never';

/** Words on a control that mean it sends, posts or changes something for him: the held lever. */
const LEVER = /\b(send|post|publish|reply|comment|tweet|share|apply|submit|sign ?in|log ?in|sign ?up|register|join|subscribe|unsubscribe|follow|delete|remove|discard|confirm|save|update|accept|agree|continue to|book|reserve|vote|upload|message)\b/i;
/** Words that mean money: never. */
const NEVER = /\b(buy|purchase|checkout|check out|place (your )?order|pay|payment|add to (cart|bag|basket)|donate|subscribe and pay|order now|complete order|billing)\b/i;

/** The pure judgement, testable without a page. */
export function weigh(it: { kind: string; label: string; search?: boolean; formSearch?: boolean }): Weight {
  const label = String(it.label ?? '');
  if (it.kind === 'password' || it.kind === 'payment') return 'never';
  if (NEVER.test(label)) return 'never';
  if (it.kind === 'link') return LEVER.test(label) && /delete|remove|unsubscribe|sign ?out|log ?out/i.test(label) ? 'lever' : 'free';
  if (it.kind === 'search') return 'free';
  if (it.kind === 'text' || it.kind === 'select') return 'free';                  // typing is free; sending it is not
  if (it.kind === 'submit') return it.formSearch ? 'free' : 'lever';
  if (it.kind === 'button') return LEVER.test(label) ? 'lever' : 'free';
  return 'free';
}

/** A job's name for its trail: his words, short, in capitals like his trails. */
export function cleanName(s: string): string {
  const w = String(s ?? '').replace(/[^\p{L}\p{N}' ]+/gu, ' ').replace(/\s+/g, ' ').trim();
  return (w || 'AANG').slice(0, 24).toUpperCase();
}
