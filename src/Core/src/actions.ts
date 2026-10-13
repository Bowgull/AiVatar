// 9.A0 (his yes, 2026-10-10; built 2026-10-13): one list of everything Aang can do.
//
// Until now Aang's 61 actions were reachable only by a Claude model, so every button in Discord or the bubble cost a
// whole Claude turn. This registry holds the SAME action objects the model calls (tools.ts makeTools), already
// wrapped in their gates: asking first after outside content, marking the turn when old words come back, the
// activity log, and every ask-once and ask-every-time rule that lives inside the actions themselves. The bubble,
// Discord (9.D), the phone and Qwen call actions by name here; nothing is rewritten and no path skips a check.
//
// Parameters are checked against each action's own schema before it runs, so a button can never send an action
// something its schema would not have let the model send.
import { z } from 'zod';
import { TOOL_LABELS, type AangTool } from './tools.ts';

export interface ActionInfo {
  name: string;
  /** a few words for a button or a log line */
  label: string;
  description: string;
  /** JSON schema of its parameters */
  params: unknown;
}
export interface ActionResult { ok: boolean; text: string; image?: { data: string; mimeType: string } }

export class Actions {
  private readonly byName = new Map<string, AangTool>();
  constructor(tools: AangTool[]) { for (const t of tools) this.byName.set(t.name, t); }

  /** Everything Aang can do, by name, in a stable order. */
  list(): ActionInfo[] {
    return [...this.byName.values()].map(t => ({
      name: t.name,
      label: TOOL_LABELS[t.name] ?? t.name.replace(/_/g, ' '),
      description: t.description,
      params: z.toJSONSchema(z.object(t.inputSchema)),
    })).sort((a, b) => a.name.localeCompare(b.name));
  }

  has(name: string): boolean { return this.byName.has(name); }

  /** Run one action by name. Unknown names and wrong parameters are refused before anything happens. */
  async run(name: string, args: unknown): Promise<ActionResult> {
    const t = this.byName.get(name);
    if (!t) return { ok: false, text: `I have no action called "${String(name).slice(0, 60)}".` };
    const parsed = z.object(t.inputSchema).strict().safeParse(args ?? {});
    if (!parsed.success) return { ok: false, text: `That is not how ${TOOL_LABELS[name] ?? name} is used: ${parsed.error.issues.map(i => `${i.path.join('.') || 'input'} ${i.message}`).join('; ').slice(0, 300)}` };
    try {
      const r = await t.handler(parsed.data, {});
      const text = r.content.filter(c => c.type === 'text').map(c => c.text ?? '').join('\n');
      const img = r.content.find(c => c.type === 'image' && c.data && c.mimeType);
      return { ok: r.isError !== true, text, ...(img ? { image: { data: img.data!, mimeType: img.mimeType! } } : {}) };
    } catch (e) {
      return { ok: false, text: `${TOOL_LABELS[name] ?? name} failed: ${(e as Error).message}` };
    }
  }
}
