// Simple sums in plain code (2026-10-28, his "it's not worth waiting that long for something like what's 6 times 7"). A
// model turn took 5 s for it; this answers at once and is always exact. Only plain arithmetic on numbers he typed:
// + - x * / ^, "times", "plus", "minus", "divided by", "to the power of", "squared", "percent of", brackets. Anything
// else (a word problem, units, "and then") is left to the model. Never eval: a tiny parser of its own.

const WORDS: [RegExp, string][] = [
  [/\bmultiplied by\b|\btimes\b|\bx\b|×/g, '*'],
  [/\bdivided by\b|\bover\b|÷/g, '/'],
  [/\bplus\b|\band\b/g, '+'],
  [/\bminus\b|\btake away\b/g, '-'],
  [/\bto the power of\b|\*\*/g, '^'],
  [/\bsquared\b/g, '^2'],
  [/\bcubed\b/g, '^3'],
];

const ASK = /^\s*(?:(?:hey|yo|aang|ok|so)[, ]+)*(?:what(?:'?s| is)|whats|calculate|compute|how much is|work out)?\s*(.+?)\s*[?.!=]*\s*$/i;

/** The answer as he would say it ("42", "3.5", "1,250"), or null when it is not a plain sum. */
export function quickMath(text: string): string | null {
  const m = ASK.exec(text);
  if (!m || text.length > 80) return null;
  let e = m[1]!.toLowerCase().replace(/,(?=\d{3}\b)/g, '');
  // "15% of 80", "15 percent of 80"
  const pct = /^(-?\d+(?:\.\d+)?)\s*(?:%|percent)\s+of\s+(-?\d+(?:\.\d+)?)$/.exec(e);
  if (pct) return say((Number(pct[1]) / 100) * Number(pct[2]));
  e = e.replace(/(\d)\s*x\s*(?=[\d(])/g, '$1*');                      // "6x7"
  for (const [re, op] of WORDS) e = e.replace(re, op);
  e = e.replace(/\s+/g, '');
  // Only numbers, operators and brackets, at least one operator between two numbers.
  if (!/^[\d.+\-*/^()]+$/.test(e) || !/\d[+\-*/^]/.test(e)) return null;
  try { const v = parse(e); return Number.isFinite(v) ? say(v) : null; } catch { return null; }
}

function say(v: number): string {
  const r = Math.round(v * 1e6) / 1e6;
  return Math.abs(r) >= 10000 ? r.toLocaleString('en-US', { maximumFractionDigits: 6 }) : String(r);
}

/** Recursive descent: sum := product (('+'|'-') product)*; product := power (('*'|'/') power)*; power := unary ('^' power)?. */
function parse(s: string): number {
  let i = 0;
  const peek = () => s[i];
  const num = (): number => {
    if (peek() === '(') { i++; const v = sum(); if (s[i++] !== ')') throw new Error('bracket'); return v; }
    const m = /^\d*\.?\d+/.exec(s.slice(i)); if (!m) throw new Error('number'); i += m[0].length; return Number(m[0]);
  };
  const unary = (): number => { if (peek() === '-') { i++; return -unary(); } if (peek() === '+') { i++; return unary(); } return num(); };
  const power = (): number => { const b = unary(); if (peek() === '^') { i++; return Math.pow(b, power()); } return b; };
  const product = (): number => { let v = power(); while (peek() === '*' || peek() === '/') { const op = s[i++]; const r = power(); if (op === '/' && r === 0) throw new Error('zero'); v = op === '*' ? v * r : v / r; } return v; };
  const sum = (): number => { let v = product(); while (peek() === '+' || peek() === '-') { const op = s[i++]; const r = product(); v = op === '+' ? v + r : v - r; } return v; };
  const v = sum();
  if (i !== s.length) throw new Error('left over');
  return v;
}
