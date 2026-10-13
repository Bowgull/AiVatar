// E6 (his interview, 2026-10-13): Gmail filters, "always ask, show everything, in plain words". A filter is a standing
// rule: it acts on every NEW email that matches, without asking again. So it is said in full before his yes, it never
// forwards mail anywhere (that would be sending), it never deletes for good (Trash at most), and the last one can be undone.

export type FilterAction = 'archive' | 'read' | 'star' | 'important' | 'trash' | 'label';
export interface FilterAsk {
  from?: string; to?: string; subject?: string; words?: string; hasAttachment?: boolean;
  actions: FilterAction[];
  label?: string;
}

const clean = (v: unknown, n: number) => String(v ?? '').replace(/[\r\n\t]+/g, ' ').trim().slice(0, n);

/** Checked: at least one way to match and one thing to do; a label name only with "label". Null when fine. */
export function checkFilter(f: FilterAsk): string | null {
  if (![f.from, f.to, f.subject, f.words].some(x => clean(x, 200)) && !f.hasAttachment) return 'A filter needs something to match: who it is from, who it is to, words in the subject, or words in the email.';
  const acts = [...new Set(f.actions ?? [])].filter(a => ['archive', 'read', 'star', 'important', 'trash', 'label'].includes(a));
  if (!acts.length) return 'A filter needs something to do: archive, mark read, star, mark important, Trash, or a label.';
  if (acts.includes('label') && !clean(f.label, 60)) return 'Which label? Give its name.';
  if (acts.includes('trash') && acts.length > 1) return 'Trash on its own: a filter that trashes should not do anything else.';
  return null;
}

/** The filter in his words, exactly what it will do, from now on. */
export function describeFilter(f: FilterAsk): string {
  const match: string[] = [];
  if (clean(f.from, 200)) match.push(`from ${clean(f.from, 200)}`);
  if (clean(f.to, 200)) match.push(`sent to ${clean(f.to, 200)}`);
  if (clean(f.subject, 200)) match.push(`with "${clean(f.subject, 200)}" in the subject`);
  if (clean(f.words, 200)) match.push(`that says "${clean(f.words, 200)}"`);
  if (f.hasAttachment) match.push('with an attachment');
  const acts = [...new Set(f.actions)];
  const did: string[] = [];
  if (acts.includes('trash')) did.push('go straight to Trash (kept 30 days, then gone)');
  if (acts.includes('archive')) did.push('skip the inbox (still in All Mail)');
  if (acts.includes('read')) did.push('be marked read');
  if (acts.includes('star')) did.push('be starred');
  if (acts.includes('important')) did.push('be marked important');
  if (acts.includes('label')) did.push(`get the label "${clean(f.label, 60)}"`);
  const list = did.length > 1 ? `${did.slice(0, -1).join(', ')} and ${did[did.length - 1]}` : did[0];
  return `Every NEW email ${match.join(' and ')} will ${list}. Emails already in your inbox are not touched. It keeps doing this until you remove it.`;
}

/** The filter as Gmail's API takes it. `labelId` is the id of the named label (found or made by the caller). */
export function gmailFilter(f: FilterAsk, labelId?: string): { criteria: Record<string, unknown>; action: { addLabelIds: string[]; removeLabelIds: string[] } } {
  const criteria: Record<string, unknown> = {};
  if (clean(f.from, 200)) criteria.from = clean(f.from, 200);
  if (clean(f.to, 200)) criteria.to = clean(f.to, 200);
  if (clean(f.subject, 200)) criteria.subject = clean(f.subject, 200);
  if (clean(f.words, 200)) criteria.query = clean(f.words, 200);
  if (f.hasAttachment) criteria.hasAttachment = true;
  const add: string[] = [], remove: string[] = [];
  const acts = new Set(f.actions);
  if (acts.has('trash')) add.push('TRASH');
  if (acts.has('archive')) remove.push('INBOX');
  if (acts.has('read')) remove.push('UNREAD');
  if (acts.has('star')) add.push('STARRED');
  if (acts.has('important')) add.push('IMPORTANT');
  if (acts.has('label') && labelId) add.push(labelId);
  return { criteria, action: { addLabelIds: add, removeLabelIds: remove } };
}
