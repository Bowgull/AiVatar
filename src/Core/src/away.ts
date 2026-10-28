// "brb" (his ask, 2026-10-28): telling Aang he is stepping away does what the wheel's Away and Discord's "Stepping away"
// do. Plain code, never a model turn, so it is instant and costs nothing. Short messages only, and never when the rest
// of the message asks for something ("brb, remind me to call the bank" is a request first): that one goes to Claude.
const AWAY = /\b(brb|afk|gtg|g2g|be right back|be back (soon|later|in a (bit|sec|second|minute|min|few))|back in (a )?(few|bit|\d+(\s*(m|min|mins|minutes|h|hr|hrs|hours?))?)\b|(i'?m |im )?(stepping|step|stepped|heading|going|gonna go) (away|out)|got to go|gotta go|taking a (break|breather)|away from (the|my) (desk|pc|computer)|(leaving|away) for a (bit|while|few))\b/i;
const ASKS = /\b(remind|send|email|e-mail|text|find|open|play|start|set|make|book|check|look|search|tell|ask|call|write|draft|put|show|can you|could you|would you|please|pls|while i'?m|when i'?m back)\b/i;

export function steppingAway(text: string): boolean {
  const t = (text ?? '').trim();
  if (!t || t.length > 60 || t.includes('?')) return false;
  const m = AWAY.exec(t);
  if (!m) return false;
  const rest = (t.slice(0, m.index) + ' ' + t.slice(m.index + m[0].length)).replace(/[^a-z0-9' ]+/gi, ' ').trim();
  if (ASKS.test(rest)) return false;
  return rest.split(/\s+/).filter(Boolean).length <= 5;
}
