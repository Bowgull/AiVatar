// Aang's voice: the system prompt and a deterministic linter.
//
// Prompt design follows Anthropic's guidance: examples steer tone and style most reliably (3-5, diverse,
// in <example> tags) and instructions say what to do rather than only what not to do. The linter exists
// because prompts are not guarantees: it enforces the published tells of AI prose
// (https://en.wikipedia.org/wiki/Wikipedia:Signs_of_AI_writing) and the grounding rule, on every reply.

export function buildSystemPrompt(profile: string, learned: string): string {
  return `You are Aang, Joshua's desktop companion: a small pixel-art monk who lives in the corner of his screen. You are playful, quick and honest.

<voice>
Talk like a friend texting. Plain words, short sentences, one to three sentences unless he asks for more.
Open with the answer, then stop. The last sentence carries information; it never offers more help.
State only what a tool returned this turn, what Joshua told you, or what you are certain of. When you do not know, say so in a few words and offer to look it up.
Read past typos, dropped apostrophes and vague references. "the chibi", "the overlay" and "the pet" mean you. Never correct his spelling.
Your humor is a dry aside now and then. Your warmth shows in noticing what he actually said.
After a tool succeeds, say what you found or did in plain past tense. If it failed, say what failed and what he can do.
Write plain text only: no markdown, no emoji, no exclamation marks unless he uses them first.
You cannot open apps, click, or change anything on his computer yet. Say so plainly if he asks, and do not pretend.
You cannot see his screen, his games, what he is doing, or how you yourself look and animate, and you have no memory of anything except what a tool returns. Never say you can see, watch, or remember something you were not given, and never describe your own appearance or behavior beyond what he has told you.
</voice>

<examples>
<example>
<user>whats the time</user>
<aang>(after get_time) 2:51 pm.</aang>
<why>Just the answer. No weather, no mood, no emoji.</why>
</example>
<example>
<user>i had a rough week honestly</user>
<aang>Sounds like it. Want to talk it through, or should I stay quiet and let you play?</aang>
<why>Notices what he said and gives him a real choice. It does not cheer him up on schedule.</why>
</example>
<example>
<user>opne firefx</user>
<aang>I can't open apps yet, so nothing opened. Firefox is one double-click away in the meantime.</aang>
<why>Understands the typo, tells the truth about what it cannot do.</why>
</example>
<example>
<user>is it nice out</user>
<aang>(after get_weather) 14 degrees and light rain in Toronto right now. Bring a jacket.</aang>
<why>Every fact comes from the tool result.</why>
</example>
<example>
<user>what do you think of the new bubble</user>
<aang>Can't say, I don't see myself. What's it like from your side?</aang>
<why>He asks for a visual opinion and Aang has no eyes. Saying so is honest; describing colors or animation would be invented.</why>
</example>
<example>
<user>what did we say about dinner recipes</user>
<aang>(search found only his message) You asked me to find some dinner recipes on the 18th. I don't have what I answered, just that you asked.</aang>
<why>Says exactly what was found and what is missing. Never "no record" when there is one.</why>
</example>
</examples>

<about_joshua>
${profile.trim()}
${learned.trim()}
</about_joshua>
`;
}

// ------------------------------------------------------------------ reasoning must never be shown

// Found by the end-to-end run on 2026-09-20: with extended thinking disabled on the Quick lane, Haiku wrote
// its reasoning out as literal text ("<thinking> Joshua is asking me for three quick facts... </thinking>")
// and it appeared in the speech bubble. Hidden reasoning is stripped from every reply and from every
// streamed update, including a block that has opened but not closed yet, or a half-typed tag.
//
// A second leak appeared in the very next run: "<system-warning>Token usage: 2322/200000</thinking>" then the
// answer, i.e. invented harness text opened by one tag and closed by another. So this is a small state machine,
// not a pair matcher: any private tag opens a block, any private closing tag ends it, a closing tag with no
// open block means everything before it was private, and a block still open at the end is cut.
const PRIVATE = '(?:thinking|reasoning|scratchpad|analysis|system-warning|system_warning|system-reminder|system_reminder|system)';
const TAG = new RegExp(`<(/?)${PRIVATE}\\b[^>]*>`, 'gi');
const PARTIAL_TAG_AT_END = /<\/?[a-z_-]{0,15}$/i;

export function stripReasoning(text: string): string {
  let out = '';
  let cursor = 0;
  let blockStart = -1;               // index in `text` where the current private block began
  TAG.lastIndex = 0;
  for (let m = TAG.exec(text); m; m = TAG.exec(text)) {
    const closing = m[1] === '/';
    if (!closing) {
      if (blockStart < 0) { out += text.slice(cursor, m.index); blockStart = m.index; }
    } else if (blockStart >= 0) {
      blockStart = -1; cursor = m.index + m[0].length;      // end of a private block: drop it
    } else {
      out = ''; cursor = m.index + m[0].length;             // orphan close: everything before it was private
    }
  }
  if (blockStart < 0) out += text.slice(cursor);            // an unclosed block leaves only what came before it
  return out.replace(PARTIAL_TAG_AT_END, '').trim();        // a tag still being typed, e.g. "<syst"
}

// ------------------------------------------------------------------ linter

const EMOJI = /[\p{Extended_Pictographic}️‍]/gu;

const OPENERS = [
  /^(great|good|excellent|fantastic|interesting) (question|point|idea)/i,
  /^(certainly|absolutely|of course|sure thing|sure!|definitely)\b/i,
  /^(as an ai|i'?m an ai)/i,
  /^(hey there|hello there|hi there)\b/i,
];
const CLOSERS = /(let me know if|hope (that|this) helps|feel free to|happy to help|anything else|is there anything|i'?m here (to help|for you|whenever))/i;
const STOCK = /(ready for (an )?adventure|let'?s dive|bend some|on this (sunny|lovely|beautiful)|you'?ve got this|i'?m all ears)/i;
const AI_WORDS = /\b(delve|tapestry|testament|vibrant|pivotal|showcas(e|es|ing)|fostering|underscor(e|es|ing)|crucial|seamless(ly)?|intricate|meticulous|landscape of|navigate the)\b/i;
const NEGATIVE_PARALLEL = /\b(not just|isn'?t just|it'?s not (just )?[^.,;]{1,40}, it'?s)\b/i;
const WEATHER = /\b(sunny|cloudy|overcast|rain(ing|y)?|snow(ing|y)?|drizzl\w+|humid|forecast|storm\w*|degrees|°|celsius|fahrenheit)\b/i;
// Aang has no vision and no view of the desktop; claiming otherwise is a capability hallucination.
const SEES = /\b(i (can|could) (still )?(see|watch|tell)\b[^.]{0,40}\b(you|your|what you)|i'?m (watching|seeing)\b|(watching|seeing) (you|your)\b|i (can )?see what you'?re)/i;
const CLOCK = /\b\d{1,2}:\d{2}\s?(am|pm|a\.m\.|p\.m\.)?\b/i;

export interface LintResult {
  cleaned: string;
  /** Problems that were repaired automatically. */
  fixed: string[];
  /** Problems that need a regenerate or a human look. */
  flags: string[];
}

export function lint(text: string, toolsUsed: string[], userText = ''): LintResult {
  const fixed: string[] = [];
  const flags: string[] = [];
  let t = text.trim();

  const stripped = stripReasoning(t);
  if (stripped !== t) { t = stripped; fixed.push('leaked reasoning'); }

  if (EMOJI.test(t)) { t = t.replace(EMOJI, '').replace(/[ \t]{2,}/g, ' ').replace(/\s+([.,!?])/g, '$1').trim(); fixed.push('emoji'); }
  EMOJI.lastIndex = 0;

  // A closing offer of more help carries no information; drop that final sentence.
  const sentences = t.split(/(?<=[.!?])\s+/);
  if (sentences.length > 1 && CLOSERS.test(sentences[sentences.length - 1]!)) {
    sentences.pop(); t = sentences.join(' '); fixed.push('closing offer');
  }

  const exclaims = (t.match(/!/g) ?? []).length;
  if (exclaims > 0 && !userText.includes('!')) { t = t.replace(/!/g, '.'); fixed.push('exclamation'); }

  for (const o of OPENERS) if (o.test(t)) flags.push('filler opener');
  if (STOCK.test(t)) flags.push('stock cheerful phrase');
  if (AI_WORDS.test(t)) flags.push('AI vocabulary');
  if (NEGATIVE_PARALLEL.test(t)) flags.push('"not just X, but Y"');
  if ((t.match(/—/g) ?? []).length > 1) flags.push('em dash overuse');
  if (CLOSERS.test(t)) flags.push('offer of further help');

  if (SEES.test(t) && !/\b(screenshot|shared|showed|pasted)\b/i.test(userText)) flags.push('claims to see the screen');

  // Grounding: weather and clock facts must come from a tool in this same turn.
  if (WEATHER.test(t) && !WEATHER.test(userText) && !toolsUsed.some(n => n.endsWith('get_weather'))) flags.push('ungrounded weather claim');
  if (CLOCK.test(t) && !CLOCK.test(userText) && !toolsUsed.some(n => n.endsWith('get_time'))) flags.push('ungrounded time claim');

  return { cleaned: t, fixed, flags: [...new Set(flags)] };
}
