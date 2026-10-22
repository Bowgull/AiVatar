// Sheet 64 v3 (APPROVED 2026-10-22, "64 IS AMAZING"): every ask in the speech bubble says what KIND of ask it is.
//
//   Question       lavender   Aang or Claude wants an answer
//   Needs your OK  blue       nothing happens until he allows it (it shows "Exactly this", word for word)
//   Plan to OK     cream      steps waiting for Go
//   (no tag)                  plain news, a timer, a reminder, the brain restarting
//
// The tag (tag 1): the kind's colour taken deep, white bold words, a 9 x 9 pixel icon in the mark's own colour. The
// bubble's wood rim and tail and a faint paper glow take the mark's colour too. Every colour is the mark over Aang's
// head, src/Body/ClaudeMarks.cs ColorOf. Who is asking sits beside the tag: "Aang", or the Claude mark and
// "Claude · <project>", which is itself the door to that session (no separate Open in Claude link).
// Built with textContent only: project names are Claude's words.

/** The marks' colours (ClaudeMarks.cs) and the tag's deep ground (white on it: 6.9, 5.3 and 6.0 to 1). */
export const KINDS = {
  question: { mark: '#b07cff', deep: '#6b3fb8', word: 'Question', rim: 0.5 },
  ok: { mark: '#7cc4ff', deep: '#1f6fb0', word: 'Needs your OK', rim: 0.5 },
  plan: { mark: '#f3e2b8', deep: '#76602a', word: 'Plan to OK', rim: 0.7 },
};

/**
 * The kind of one of Aang's own asks (asks.js shapes them), or null for the ones that wait on no decision.
 * @param {Record<string, any> | null | undefined} m
 * @returns {'question'|'ok'|'plan'|null}
 */
export function kindOf(m) {
  if (!m || typeof m !== 'object') return null;
  switch (m.t) {
    case 'choice': case 'fact.ask': case 'send.ask': return 'question';
    case 'permission': case 'consent': case 'backup.ask': return 'ok';
    case 'plan': return 'plan';
    default: return null;
  }
}
/** A Claude session's wait (claudejobs.js readWait): permission is an OK. */
export function kindOfWait(w) {
  return w?.kind === 'permission' ? 'ok' : w?.kind === 'question' ? 'question' : w?.kind === 'plan' ? 'plan' : null;
}

// The 9 x 9 icons, drawn at exactly 2x (sheet 64's ICON9, verbatim).
const ICON9 = {
  question: ['..#####..', '.##...##.', '.##...##.', '.....##..', '....##...', '....##...', '.........', '....##...', '....##...'],
  ok: ['.........', '.........', '.###.....', '##.##....', '#...#####', '##.##.#.#', '.###..#.#', '.........', '.........'],
  plan: ['#########', '#.......#', '#.#.###.#', '#.......#', '#.#.###.#', '#.......#', '#.#.###.#', '#.......#', '#########'],
};
const NS = 'http://www.w3.org/2000/svg';
function icon(kind) {
  let d = '';
  ICON9[kind].forEach((r, y) => [...r].forEach((c, x) => { if (c === '#') d += `M${x} ${y}h1v1h-1z`; }));
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('class', 'kic'); svg.setAttribute('viewBox', '0 0 9 9'); svg.setAttribute('width', '18'); svg.setAttribute('height', '18');
  svg.setAttribute('shape-rendering', 'crispEdges'); svg.setAttribute('aria-hidden', 'true');
  const p = document.createElementNS(NS, 'path'); p.setAttribute('d', d); p.setAttribute('fill', KINDS[kind].mark);
  svg.append(p);
  return svg;
}

/**
 * The tag row: the kind, then who is asking. `who` is { name: 'Aang' } or { claude: true, project, open } where `open`
 * takes him to that exact session (the bubble closes with it). `who` may be null (the tag alone).
 * @param {'question'|'ok'|'plan'} kind
 * @param {{ name?: string, claude?: boolean, project?: string, open?: () => void } | null} who
 */
export function tagRow(kind, who) {
  const row = document.createElement('div');
  row.className = 'ktag';
  row.dataset.kind = kind;
  const t = document.createElement('span');
  t.className = 'kt';
  t.append(icon(kind), KINDS[kind].word);
  row.append(t);
  if (who?.claude) {
    const a = document.createElement('a');
    a.className = 'kwho door';
    a.setAttribute('role', 'link');
    a.tabIndex = 0;
    a.title = 'Open this session in Claude';
    const img = document.createElement('img'); img.src = 'art/claude-icon.png'; img.alt = '';
    a.append(img, `Claude · ${String(who.project || 'Claude').slice(0, 40)}`);
    const go = (e) => { e.preventDefault(); e.stopPropagation(); who.open?.(); };
    a.addEventListener('click', go);
    a.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') go(e); });
    row.append(a);
  } else if (who?.name) {
    const s = document.createElement('span');
    s.className = 'kwho';
    s.textContent = who.name;
    row.append(s);
  }
  return row;
}

/** "Exactly this:" and the thing quoted, word for word (OKs only). */
export function exactBlock(text, el = document.createElement('div')) {
  el.classList.add('kq');
  const sm = document.createElement('small'); sm.textContent = 'Exactly this:';
  el.replaceChildren(sm, document.createTextNode('“' + String(text) + '”'));
  return el;
}

/**
 * What a Claude tool call would actually do, for "Exactly this": the command, the file, the site. The wire's `input`
 * is the tool's JSON (claudejobs.js readWait cuts it to 2000); anything unreadable is shown as it came, shortened.
 * @param {string} input
 */
export function exactOfInput(input) {
  const raw = String(input ?? '').trim();
  if (!raw) return '';
  let o = null;
  try { o = JSON.parse(raw); } catch { /* not JSON: shown as it came */ }
  if (o && typeof o === 'object') {
    for (const k of ['command', 'file_path', 'url', 'notebook_path', 'path', 'pattern', 'query', 'prompt']) {
      if (typeof o[k] === 'string' && o[k].trim()) return o[k].trim().slice(0, 600);
    }
    const vals = Object.values(o).filter((v) => typeof v === 'string' && v.trim());
    if (vals.length) return String(vals[0]).trim().slice(0, 600);
  }
  return raw.slice(0, 600);
}

/**
 * The wood rim and its tail washed in the kind's colour (sheet 64 v1 B, kept in v3): a flood of the mark composited
 * over balloon.js's own g.rim, so the wood's grain stays, tinted. Called after every skin paint.
 * @param {SVGSVGElement} skin
 * @param {'question'|'ok'|'plan'|null} kind
 */
export function tintRim(skin, kind) {
  skin.querySelector('#ktf')?.remove();
  const rim = skin.querySelector('g.rim');
  if (!rim) return;
  if (!kind || !skin.classList.contains('rimmed')) { rim.removeAttribute('filter'); return; }
  const k = KINDS[kind];
  const f = document.createElementNS(NS, 'filter');
  f.id = 'ktf'; f.setAttribute('color-interpolation-filters', 'sRGB');
  const flood = document.createElementNS(NS, 'feFlood'); flood.setAttribute('flood-color', k.mark); flood.setAttribute('flood-opacity', String(k.rim)); flood.setAttribute('result', 'c');
  const comp = document.createElementNS(NS, 'feComposite'); comp.setAttribute('in', 'c'); comp.setAttribute('in2', 'SourceGraphic'); comp.setAttribute('operator', 'in'); comp.setAttribute('result', 't');
  const blend = document.createElementNS(NS, 'feBlend'); blend.setAttribute('in', 't'); blend.setAttribute('in2', 'SourceGraphic'); blend.setAttribute('mode', 'normal');
  f.append(flood, comp, blend);
  skin.prepend(f);
  rim.setAttribute('filter', 'url(#ktf)');
}

/** How long the mouse rests on the bubble before the answer keys come (sheet 64 section 4). */
export const KEYS_AFTER_MS = 1500;
