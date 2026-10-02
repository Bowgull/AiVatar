// The local model: text in, text out, on this machine, for free.
//
// Qwen3.5-35B-A3B won a measured race against three alternatives on this card (LOCAL-MODEL-PLAN.md).
// 35B total parameters but only 3B active per token, which is why a 13 GB quant runs fully on a 15.3 GB
// card at 47.6 words/sec. It exists for one job: reading the 1,225 documents Joshua has, so that work
// costs GPU time instead of his weekly Claude quota.
//
// THREE RULES, ALL FROM MEASUREMENTS, NONE OF THEM NEGOTIABLE BY THE MODEL:
//
//  1. NO TOOLS. It reads text and writes text, and that is the whole contract. Documents carry whatever
//     anyone wrote in them, and a reader that cannot act cannot be talked into acting. Only its summary
//     moves on, and it moves on marked as data. This is the reason the module exposes no tool plumbing at
//     all rather than exposing it and asking callers not to use it.
//
//  2. THINKING OFF. The same question took 78 seconds with thinking on and 2.8 seconds off. Ollama's
//     `think: false` asks for that, but some models ignore the switch, so the reply is also stripped of
//     any reasoning block it emits anyway, and a reply that is empty after stripping counts as a FAILURE
//     rather than as an empty answer. A silent empty string is how a skipped switch would otherwise look
//     exactly like a model with nothing to say.
//
//  3. THE FOUR-STEP RULE lives at the caller, not here. Measured: local handled jobs up to four steps
//     (3/3 at every count up to four) and scored 0/3 at five, failing the dangerous way every time by
//     stopping partway and answering as though it had finished. So a step budget must be COUNTED in code
//     and never left to the model's own account of whether it managed. Nothing in this file gives it more
//     than one step, which is the safest possible reading of that result.
//
// If Ollama is not running this returns a failure with a reason, exactly like embed.ts returning null:
// reading getting slower is acceptable, Aang breaking is not.

import { gameRunning } from './gpu.ts';

export const LOCAL_MODEL = process.env.AANG_LOCAL_MODEL ?? 'hf.co/unsloth/Qwen3.5-35B-A3B-GGUF:UD-IQ3_XXS';
const URL = process.env.AANG_OLLAMA ?? 'http://127.0.0.1:11434';

/** Why a local answer could not be used. Separated so a caller can tell "not running" from "said nothing". */
export type LocalFailure = 'offline' | 'no-model' | 'timeout' | 'empty' | 'error' | 'game';

export interface LocalResult {
  ok: boolean;
  /** The answer, already stripped of any reasoning block. Empty string when ok is false. */
  text: string;
  ms: number;
  why?: LocalFailure;
  /** One plain sentence, safe to show Joshua. Only set when ok is false. */
  detail?: string;
}

/**
 * Reasoning the model emitted despite being told not to.
 *
 * Qwen emits `<think>...</think>`; the others raced used the same convention. Stripped rather than
 * trusted, because rule 2 says an ignored switch must not pass silently.
 */
const THINK = /<think(?:ing)?>[\s\S]*?<\/think(?:ing)?>/gi;
/** An unterminated reasoning block: the model was cut off mid-thought. Everything after it is unusable. */
const THINK_OPEN = /<think(?:ing)?>[\s\S]*$/i;

export function stripThinking(raw: string): string {
  return (raw ?? '').replace(THINK, '').replace(THINK_OPEN, '').trim();
}

let warnedOffline = false;

/**
 * Ask the local model one question and get one answer.
 *
 * @param prompt   What to read or do. Document text goes here, never in `system`.
 * @param system   How to behave. Kept separate so document text can never be mistaken for instructions.
 * @param timeoutMs Generous by default: this reads whole documents, and it is GPU time, not quota.
 */
export async function askLocal(
  prompt: string,
  { system, timeoutMs = 120_000, maxTokens = 1024, evenInGame = false }:
    { system?: string; timeoutMs?: number; maxTokens?: number; evenInGame?: boolean } = {},
): Promise<LocalResult> {
  const started = Date.now();
  const text = (prompt ?? '').trim();
  if (!text) return { ok: false, text: '', ms: 0, why: 'empty', detail: 'There was nothing to read.' };

  // 3.2: the card belongs to the game. Checked here rather than at each caller, so a reading job added
  // later cannot forget to ask. `evenInGame` exists only for tests, which must be able to run either way.
  if (!evenInGame) {
    const game = await gameRunning();
    if (game.running) {
      // And give the card back if we are already holding it. Refusing to load is only half the rule when
      // Ollama keeps a model resident for five minutes after the last read.
      void unloadLocal();
      return {
        ok: false, text: '', ms: Date.now() - started, why: 'game',
        detail: `${game.which} is running, so the graphics card is busy. This waits until you quit.`,
      };
    }
  }

  try {
    const res = await fetch(`${URL}/api/chat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        model: LOCAL_MODEL,
        stream: false,
        // Rule 2. Ollama accepts this on thinking-capable models; the strip below covers it being ignored.
        think: false,
        messages: [
          ...(system ? [{ role: 'system', content: system }] : []),
          { role: 'user', content: text },
        ],
        options: {
          // Reading, not writing: near-deterministic so the same document gives the same facts twice.
          temperature: 0.2,
          num_predict: maxTokens,
        },
      }),
      signal: AbortSignal.timeout(timeoutMs),
    });

    if (!res.ok) {
      // 404 from Ollama means the model name is not pulled, which is a different problem from it being down.
      const why: LocalFailure = res.status === 404 ? 'no-model' : 'error';
      return {
        ok: false, text: '', ms: Date.now() - started, why,
        detail: why === 'no-model'
          ? `The local model ${LOCAL_MODEL} is not installed in Ollama.`
          : `The local model answered with ${res.status}.`,
      };
    }

    const body = await res.json() as { message?: { content?: string } };
    const answer = stripThinking(String(body?.message?.content ?? ''));
    if (!answer) {
      // Rule 2: this is a failure, not an empty answer. Almost always means it spent the whole budget
      // thinking, which is exactly the 78-second behaviour `think: false` exists to prevent.
      return {
        ok: false, text: '', ms: Date.now() - started, why: 'empty',
        detail: 'The local model returned nothing usable. It may have ignored the thinking switch.',
      };
    }
    warnedOffline = false;
    return { ok: true, text: answer, ms: Date.now() - started };
  } catch (e) {
    const timedOut = (e as Error).name === 'TimeoutError' || (e as Error).name === 'AbortError';
    if (!timedOut && !warnedOffline) {
      console.error('local model unreachable:', (e as Error).message);
      warnedOffline = true;
    }
    return {
      ok: false, text: '', ms: Date.now() - started,
      why: timedOut ? 'timeout' : 'offline',
      detail: timedOut
        ? `The local model took longer than ${Math.round(timeoutMs / 1000)}s and was given up on.`
        : 'Ollama is not running, so nothing can be read locally right now.',
    };
  }
}

/**
 * Give the card back.
 *
 * Ollama keeps a model resident for five minutes after the last request, so refusing to LOAD during a game
 * is only half the rule: a model loaded a minute before WoW starts would sit on 13 GB of a 15.3 GB card
 * through the whole raid. Measured right after the 3.1 tests: 923 MiB free, with nothing reading anything.
 *
 * `keep_alive: 0` unloads immediately. Safe to call when nothing is loaded.
 */
export async function unloadLocal(timeoutMs = 10_000): Promise<boolean> {
  try {
    const res = await fetch(`${URL}/api/generate`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ model: LOCAL_MODEL, keep_alive: 0 }),
      signal: AbortSignal.timeout(timeoutMs),
    });
    return res.ok;
  } catch {
    return false;      // Ollama is not running, so the card is already free of it
  }
}

/** Is the local model actually installed and reachable? Used before queueing a batch of reading. */
export async function localReady(timeoutMs = 4000): Promise<{ ready: boolean; detail: string }> {
  try {
    const res = await fetch(`${URL}/api/tags`, { signal: AbortSignal.timeout(timeoutMs) });
    if (!res.ok) return { ready: false, detail: `Ollama answered with ${res.status}.` };
    const body = await res.json() as { models?: { name?: string }[] };
    const names = (body.models ?? []).map(m => String(m.name ?? ''));
    if (!names.includes(LOCAL_MODEL)) {
      return { ready: false, detail: `Ollama is running but ${LOCAL_MODEL} is not pulled.` };
    }
    return { ready: true, detail: '' };
  } catch {
    return { ready: false, detail: 'Ollama is not running.' };
  }
}
