// Aang's notes in Joshua's Obsidian vault.
//
// WHAT THIS IS FOR: Joshua wanted one place where he can see his projects, his repos and Aang himself,
// connected in the graph, without maintaining it by hand. Aang lived only inside CereBro documents before
// this; he was a feature of another project rather than a thing in his own right.
//
// TWO RULES, both from what he said on 2026-10-02:
//
//  1. HE ONLY READS THESE. They are generated output, not a place he writes. That is what makes this safe:
//     every note is rewritten WHOLE every time, never appended to. Nothing of his can be buried, because
//     nothing of his is ever in these files. Delete them all and the next run restores them exactly.
//
//  2. WRITES STOP AT THIS FOLDER. Enforced in files.ts, not here, so a future caller cannot forget. The
//     documented failure mode for agents in vaults is editing the note NEXT to the one they meant.
//
// Regenerating rather than appending is also the only thing the memory-pollution paper actually supports:
// its result was about unbounded growth, and this cannot grow.

import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { VAULT_WRITABLE } from './files.ts';
import type { Memory } from './memory.ts';

/** Written into every note, so it is obvious at a glance which files are his and which are Joshua's. */
function frontmatter(title: string, summary: string): string {
  return [
    '---',
    `title: ${title}`,
    'source: aang',
    'type: generated',
    `generated_at: ${new Date().toISOString()}`,
    'canonical_status: regenerated_each_run',
    `llm_summary: ${summary}`,
    'tags:',
    '  - aang',
    '  - generated',
    '---',
    '',
    '> [!warning] Written by Aang',
    '> This note is rewritten from scratch every time. Anything you type here will be lost.',
    '> Edit the thing it describes instead, not this.',
    '',
  ].join('\n');
}

const esc = (s: string) => String(s ?? '').replace(/\r/g, '').trim();

export interface VaultWrite { wrote: string[]; detail: string }

/**
 * Write every Aang note. Whole files, every time.
 *
 * @param facts  what he currently knows, already approved. Pending ones are deliberately excluded: this
 *               note says what he knows, and a pending fact is precisely something he does not know yet.
 */
export function writeVaultNotes(memory: Memory, opts: { buildState?: string } = {}): VaultWrite {
  const dir = VAULT_WRITABLE;
  const wrote: string[] = [];
  try {
    mkdirSync(dir, { recursive: true });
  } catch (e) {
    return { wrote, detail: `I could not open my folder in your vault: ${(e as Error).message}` };
  }

  const put = (name: string, body: string) => {
    try { writeFileSync(path.join(dir, name), body, 'utf8'); wrote.push(name); }
    catch (e) { console.error(`vault: could not write ${name}:`, (e as Error).message); }
  };

  // ---- the hub. Links outward to his real projects, which is what puts him in the graph; Obsidian draws
  // an edge from an outgoing link whether or not the other note links back, and the other notes are his.
  put('Aang.md', frontmatter('Aang', 'Hub note for the Aang desktop companion, generated from his own state.') + [
    '# Aang',
    '',
    'The desktop companion. Runs on this PC: a TypeScript core holding the conversation and the memory,',
    'and a C# body drawing the sprite and the speech bubble over whatever else is on screen.',
    '',
    '## His notes',
    '',
    '- [[What He Knows]] - the facts he holds about you',
    '- [[Build State]] - what is built and what is next',
    '- [[How He Works]] - architecture, rules, and what he refuses to do',
    '- [[Conversations]] - what the two of you have actually said',
    '',
    '## Related',
    '',
    '- [[CereBro]] - the agent system he is the companion of',
    '- [[GitHub Project Map]] - where your repositories are mapped',
    '',
    '## Repository',
    '',
    'Code lives in `Bowgull/AiVatar`. This vault holds the map, not the terrain.',
    '',
  ].join('\n'));

  // ---- what he knows
  const facts = memory.list(300);
  const pending = memory.pendingCount();
  put('What He Knows.md', frontmatter('What He Knows', `The ${facts.length} facts Aang currently holds about Joshua.`) + [
    '# What He Knows',
    '',
    facts.length === 0
      ? 'Nothing yet. He has learned no facts about you.'
      : `${facts.length} ${facts.length === 1 ? 'thing' : 'things'}, newest first.`,
    '',
    ...facts.map(f => `- ${esc(f.text)}${f.source ? `  <sub>(${esc(f.source)})</sub>` : ''}`),
    '',
    pending > 0
      ? `\n## Waiting on you\n\n${pending} more ${pending === 1 ? 'fact is' : 'facts are'} waiting for you to approve or reject. He will ask.\n`
      : '',
    '',
    'To remove one, tell him to forget it. He will, and "undo that" brings it back.',
    '',
  ].join('\n'));

  // ---- conversations
  const recent = memory.history('', 40);
  put('Conversations.md', frontmatter('Conversations', 'The most recent exchanges between Joshua and Aang.') + [
    '# Conversations',
    '',
    recent.length === 0 ? 'Nothing recorded yet.' : `The last ${recent.length} turns. Everything is searchable in his Panel.`,
    '',
    ...recent.slice().reverse().map(t => {
      const who = t.who === 'you' ? '**You**' : 'Aang';
      const when = esc(t.ts).slice(0, 16);
      const text = esc(t.text).replace(/\n+/g, ' ').slice(0, 300);
      return `- \`${when}\` ${who}: ${text}`;
    }),
    '',
  ].join('\n'));

  // ---- build state
  put('Build State.md', frontmatter('Build State', 'What is built in Aang and what is next.') + [
    '# Build State',
    '',
    opts.buildState?.trim() || 'No build state was supplied on this run.',
    '',
    'The authority on order is `docs/FINAL-AANG-BUILD.md` (the FINAL AANG BUILD) in the AiVatar repository.',
    'This note is a mirror of it and is always the copy to distrust.',
    '',
  ].join('\n'));

  // ---- how he works
  put('How He Works.md', frontmatter('How He Works', 'Aang architecture, rules and refusals.') + [
    '# How He Works',
    '',
    '## Shape',
    '',
    '- **Core** - TypeScript, holds the conversation, the memory and the tools.',
    '- **Body** - C#, draws the sprite and the bubble over the screen as one hand-painted layered window.',
    '- They talk over a local socket. Nothing listens outside this machine.',
    '',
    '## Memory',
    '',
    '- A SQLite database next to this vault, not in it.',
    '- Facts about you are kept separately from the conversation.',
    '- Forgetting hides rather than deletes, so undo always works.',
    '',
    '## What he will not do',
    '',
    '- He does not read anything belonging to anyone else. That list is in code, not convention.',
    '- He does not write to this vault outside this folder.',
    '- After reading anything from outside - an email, a web page, a document - he asks again before acting.',
    '- The local model that reads your documents has no tools at all. A reader that cannot act cannot be',
    '  talked into acting by something written in a document.',
    '',
    '## The graphics card',
    '',
    'The local model is 13 GB on a 15.3 GB card. If a game is running, he will not load it, and gives the',
    'card back if he is already holding it.',
    '',
  ].join('\n'));

  return { wrote, detail: `Wrote ${wrote.length} notes to 10_Projects/Aang.` };
}
