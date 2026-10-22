// C6 (2026-10-22): "start and resume Claude jobs from Aang", the flow. Joshua says it to Aang (or right-clicks Aang ->
// "Start a Claude job", or "pick Waymark back up"); Aang shows a CARD in his bubble (one plain line, the folder, the
// model and effort, "What I'll send" folded); on Go, Aang SENDS it. Design: docs/C6-PROMPT-RESEARCH.md.
//
// The pieces: jobprompt.ts builds the prompt (code picks everything; Qwen, else Haiku, only tidies one paragraph);
// jobstart.ts keeps the lock (signed, single use, byte for byte); the aang-link mod does the sending in the session.
// This file joins them and is the only place that decides which door a start goes through:
//   - 'link'    (Door 1) open claude://code/new?folder=... with no text; the new session's mod claims the start.
//   - 'door2'   an open linked session starts it through the Claude app's own start_session tool.
//   - 'prefill' the old link with the text typed in: he presses Enter. Used until the probe proves a door, and said
//               honestly on the card.
// Which door is proven lives in c6-door.json (written by the probe, npm run c6-probe).
import path from 'node:path';
import { buildPrompt, cleanWords, guessFolder, projectsOf, tidyGuard, tidyInput, TIDY_SYSTEM } from './jobprompt.ts';
import type { Disk, JobPrompt, Recent } from './jobprompt.ts';
import { PROBE_TEXT, readDoor, sha256Hex, startBody, writeDoor } from './jobstart.ts';
import type { Card, Door, DoorFile, Start, StartBook } from './jobstart.ts';

/** What the flow needs from the brain; injected, so the tests drive it without a brain. */
export interface StarterDeps {
  stateDir: string;
  disk: Disk;
  book: StartBook;
  /** Linked sessions (claudelink.ts JobTracker): who is open, and the door to them. */
  tracker: {
    list(): { id: string; title?: string; project: string; cwd: string; phase: string; source?: string; open?: string | null }[];
    linked(session: string): boolean;
    host(): string | null;
    queue(session: string, kind: 'start' | 'caps' | 'door2', body: string): void;
  };
  /** His sessions by name (claudenames.ts), newest first. */
  names: { all(): { cli: string; title: string; open: string; at?: number }[] };
  /** Opens a claude:// link the way a click would. An error message, or null. */
  openLink(url: string): string | null;
  /** Qwen, one step, no tools, thinking off (local.ts askLocal). */
  askLocal(input: string, system: string): Promise<{ ok: boolean; text: string; why?: string }>;
  /** Haiku, one turn, no tools: the stand-in when a game holds the graphics card or Qwen is off. Null on failure. */
  askHaiku(input: string, system: string): Promise<string | null>;
  /** "Which one?" with keys; the index he picked, or -1 for none / not at the desk. */
  pickOne(question: string, options: string[]): Promise<number>;
  /** One line from Aang, unprompted (a start nobody picked up). */
  say(text: string): void;
  home?: string;
  now?: () => number;
}

/** A job he asked for, ready to show as a card. */
export interface Prepared { card: Card; prompt: JobPrompt | null; door: Door; line: string; modelLabel: string | null; quota: boolean }

/** What a session's title or folder shares with his ask, scored for "pick X back up". */
function scoreOf(words: string[], title: string, cwd: string): number {
  const t = `${title} ${path.basename(cwd || '')}`.toLowerCase();
  return words.filter(w => t.includes(w)).length;
}

const RESUME_NOISE = new Set(['pick', 'back', 'resume', 'continue', 'carry', 'with', 'finish', 'thing', 'the', 'and', 'get', 'to', 'up', 'on', 'my']);

export class JobStarter {
  private readonly d: StarterDeps;
  /** The probe's Door 1 starts and what came back for each; and the last capability check / Door 2 try. */
  private probes = new Map<string, { claimed: boolean; started: boolean; sent: boolean; session: string }>();
  private caps: Record<string, unknown> | null = null;
  private door2Last: Record<string, unknown> | null = null;
  /** Starts handed to Door 1 or Door 2, by start id: what he called it, for the "it did not start" line. */
  private live = new Map<string, { line: string; folder: string; timer: NodeJS.Timeout | null }>();
  constructor(d: StarterDeps) {
    this.d = d;
    d.book.onClaim = (s) => { const p = this.probes.get(s.id); if (p) p.claimed = true; };
  }

  private now(): number { return this.d.now?.() ?? Date.now(); }
  door(): DoorFile { return readDoor(this.d.stateDir); }

  /**
   * His words become a card. `seed` is what the chat model passed as the task: used as the goal's raw material only
   * when the turn read nothing from outside (`clean`), and his own words are always what "Joshua's words" quotes.
   */
  async prepare(said: string, opts: { legacy?: string; where?: string; seed?: string; clean?: boolean } = {}): Promise<Prepared | { error: string }> {
    const words = cleanWords(said) || (opts.clean ? cleanWords(opts.seed ?? '') : '');
    if (!words) return { error: 'Tell me what the job is, in your own words.' };
    const door = this.door().door;

    // "Pick Waymark back up": the session itself, when there is one.
    if (/\bpick\b.{1,60}\bback up\b|\b(resume|carry on with|continue with|get back to)\b/i.test(words)) {
      const found = await this.findSession(words);
      if (found && 'error' in found) return found;
      if (found) {
        const text = this.resumeText(words);
        const card = this.d.book.card({ words, folder: found.cwd, text, model: null, effort: null, resume: { session: found.session, title: found.title, open: found.open, running: found.running } }, this.now());
        return { card, prompt: null, door, line: `Continue ${found.title}: ${words.length > 60 ? words.slice(0, 57) + '...' : words}`, modelLabel: null, quota: false };
      }
    }

    // The folder: one he named (only from a clean turn), a project word, his recent sessions; asked only when unsure.
    let folder: string;
    const legacyWhere = opts.clean && opts.where?.trim() ? opts.where.trim() : '';
    if (legacyWhere && path.isAbsolute(legacyWhere) && this.d.disk.exists(legacyWhere)) folder = legacyWhere;
    else {
      const recent: Recent[] = this.d.tracker.list().map(j => ({ title: j.title || j.project, cwd: j.cwd }));
      const g = guessFolder(words, this.d.disk, { home: this.d.home, recent });
      if (g.sure) folder = g.folder;
      else {
        const pick = await this.d.pickOne('Not sure where this belongs. Which one?', g.options.map(o => o.label));
        if (pick < 0 || !g.options[pick]) return { error: 'No folder was picked, so nothing was started.' };
        folder = g.options[pick]!.folder;
      }
    }

    // The tidy paragraph: Qwen, else Haiku, else his words (the template). Guarded in code either way.
    const names = this.d.disk.list(folder).slice(0, 40);
    const shapeOnly = buildPrompt(words, folder, this.d.disk, { legacy: opts.legacy });
    const input = tidyInput(opts.clean && opts.seed && opts.seed.trim() !== words ? `${words}\n(Aang understood it as: ${opts.seed.trim().slice(0, 400)})` : words, folder, [...shapeOnly.hints, ...names]);
    let goal: string | null = null, by: 'qwen' | 'haiku' | undefined;
    try {
      const q = await this.d.askLocal(input, TIDY_SYSTEM);
      if (q.ok) { goal = tidyGuard(q.text, folder, this.d.disk); by = 'qwen'; }
    } catch { /* Haiku next */ }
    if (!goal) {
      try { const h = await this.d.askHaiku(input, TIDY_SYSTEM); if (h) { goal = tidyGuard(h, folder, this.d.disk); by = 'haiku'; } } catch { /* the template */ }
    }
    const prompt = buildPrompt(words, folder, this.d.disk, { legacy: opts.legacy, goal, ...(by ? { goalBy: by } : {}), hints: shapeOnly.hints });
    const card = this.d.book.card({ words, folder, text: prompt.text, model: prompt.model.model, effort: prompt.model.effort, resume: null }, this.now());
    return { card, prompt, door, line: prompt.line, modelLabel: prompt.model.label, quota: prompt.model.quota };
  }

  /** The bubble's message for a card (asks.js 'claude.start'). */
  message(p: Prepared): Record<string, unknown> {
    const c = p.card;
    return {
      t: 'claude.start', id: c.id, hash: c.hash, words: c.words, line: p.line, folder: c.folder, text: c.text, door: p.door,
      ...(p.modelLabel ? { model: p.modelLabel } : {}), ...(p.quota ? { quota: true } : {}),
      ...(c.resume ? { resume: { title: c.resume.title, running: c.resume.running } } : {}),
    };
  }

  /** What a resume sends: his words, framed as a pick-up. */
  resumeText(words: string): string {
    return `Pick this back up. Start by reading where it stands (the last commits and any handoff notes) and tell me in 3 lines what is done and what is left, then carry on. Keep your to-do list ticked; commit and push when done. Replies short and plain.\n\nJoshua's words: "${words.replace(/\s+/g, ' ').replace(/"/g, "'")}"`;
  }

  /** The session he means by "pick X back up": open ones first, then the app's named ones; asks on a tie. */
  async findSession(words: string): Promise<{ session: string; title: string; open: string | null; running: boolean; cwd: string } | { error: string } | null> {
    const asked = (words.toLowerCase().match(/[a-z0-9]+/g) ?? []).filter(w => w.length >= 3 && !RESUME_NOISE.has(w));
    if (!asked.length) return null;
    const cands: { session: string; title: string; open: string | null; running: boolean; cwd: string; score: number; rank: number }[] = [];
    const seen = new Set<string>();
    this.d.tracker.list().forEach((j, i) => {
      const title = j.title || j.project;
      const s = scoreOf(asked, title, j.cwd);
      seen.add(j.id);
      if (s > 0) cands.push({ session: j.id, title, open: j.open ?? null, running: this.d.tracker.linked(j.id), cwd: j.cwd, score: s, rank: i });
    });
    this.d.names.all().forEach((n, i) => {
      if (seen.has(n.cli)) return;
      const s = scoreOf(asked, n.title, '');
      if (s > 0) cands.push({ session: n.cli, title: n.title, open: n.open, running: false, cwd: '', score: s, rank: 1000 + i });
    });
    if (!cands.length) return null;
    cands.sort((a, b) => b.score - a.score || a.rank - b.rank);
    const top = cands.filter(c => c.score === cands[0]!.score);
    let pick = top[0]!;
    if (top.length > 1) {
      const opts = top.slice(0, 3);
      const n = await this.d.pickOne(`${opts.map(o => o.title).join(' or ')}?`, opts.map(o => o.title));
      if (n < 0 || !opts[n]) return { error: 'No session was picked, so nothing was sent.' };
      pick = opts[n]!;
    }
    const { score: _s, rank: _r, ...out } = pick;
    // A named session whose folder the brain does not know: the guessed project folder, for the card's line only.
    if (!out.cwd) out.cwd = projectsOf(this.d.home ?? '').find(p => p.re.test(out.title))?.folder ?? '';
    return out;
  }

  /**
   * His answer to a card. Go checks the hash (byte for byte) and sends it through the proven door. Returns one line for
   * the chat model to pass on; `launched` is set when a new session was opened (so core.ts can follow it).
   */
  answer(id: string, hash: string, choice: 'go' | 'change' | 'no'): { text: string; launched?: { folder: string; door: Door } } {
    if (choice !== 'go') {
      this.d.book.drop(id);
      return { text: choice === 'change' ? 'He wants to change it: his words are back in his typing box. Nothing was sent. Say so in one short line.' : 'He said not now. Nothing was sent. Say so in one short line.' };
    }
    const r = this.d.book.go(id, hash, this.now());
    if ('error' in r) return { text: `Nothing was sent: ${r.error} Tell him in one short line.` };
    const c = r.card;
    if (c.resume) {
      const body = startBody({ text: c.text, hash: c.hash, model: null, effort: null });
      if (c.resume.running && this.d.tracker.linked(c.resume.session)) {
        this.d.tracker.queue(c.resume.session, 'start', body);
        return { text: `Sent to "${c.resume.title}" in Claude. Tell him in one short line.` };
      }
      if (!c.resume.open) return { text: `"${c.resume.title}" is closed and I have no link to open it. Tell him to open it in Claude; nothing was sent.` };
      this.d.book.queueFor(c.resume.session, c, this.now());
      const err = this.d.openLink(c.resume.open);
      if (err) return { text: `Could not open "${c.resume.title}": ${err}` };
      return { text: `Opening "${c.resume.title}" in Claude; the message goes in as soon as it opens. Tell him in one short line.` };
    }
    return this.send(c, this.door());
  }

  /** A new session, through the door the probe proved. */
  private send(c: Card, d: DoorFile): { text: string; launched?: { folder: string; door: Door } } {
    if (d.door === 'door2') {
      const host = this.d.tracker.host();
      if (host) {
        const s = this.d.book.arm(c, this.now());
        this.d.book.claim(c.folder, this.now());              // Door 2 does not wait for a claim: spend the folder start now
        const body = JSON.stringify({ ...JSON.parse(startBody(s)), folder: c.folder, args: d.door2Args ?? { folder: 'cwd', prompt: 'prompt' } });
        this.d.tracker.queue(host, 'door2', body);
        this.watch(s, c);
        return { text: 'Starting it in Claude now; it sends itself. Tell him in one short line.', launched: { folder: c.folder, door: 'door2' } };
      }
      // No open session to start it from: Door 1 if it was proven too, else the prefilled link.
    }
    if (d.door === 'link' || (d.door === 'door2' && d.note === 'link-ok')) {
      const s = this.d.book.arm(c, this.now());
      const err = this.d.openLink(`claude://code/new?folder=${encodeURIComponent(c.folder)}`);
      if (err) return { text: `It did not start: ${err}` };
      this.watch(s, c);
      return { text: 'Opened a new Claude session; once he confirms the folder in Claude (one click), it sends itself. Tell him that in one short line.', launched: { folder: c.folder, door: 'link' } };
    }
    const err = this.d.openLink(`claude://code/new?q=${encodeURIComponent(c.text.slice(0, 12000))}&folder=${encodeURIComponent(c.folder)}`);
    if (err) return { text: `It did not start: ${err}` };
    return { text: 'Opened a new Claude session with the request typed in. It has NOT started: he presses Enter in Claude to send it (and confirms the folder). Tell him that in one short line.', launched: { folder: c.folder, door: 'prefill' } };
  }

  /** A start nobody picked up in its two minutes: said once, honestly. */
  private watch(s: Start, c: Card): void {
    const timer = setTimeout(() => {
      this.live.delete(s.id);
      if (this.started.has(s.id)) return;
      this.d.say(`Claude did not pick up "${c.words.slice(0, 60)}" by itself, so nothing was sent. The new Claude window may still be waiting on its folder box.`);
    }, Math.max(1000, s.exp - this.now()) + 5000);
    timer.unref?.();
    this.live.set(s.id, { line: c.words, folder: c.folder, timer });
  }

  private started = new Set<string>();

  /** What the mods said: a start went in, the capability check, a Door 2 try. */
  onEvent(session: string, ev: Record<string, unknown>): void {
    const type = String(ev.type ?? '');
    if (type === 'started') {
      const id = String(ev.id ?? '').slice(0, 64);
      this.started.add(id);
      const t = this.live.get(id); if (t?.timer) clearTimeout(t.timer);
      const p = this.probes.get(id); if (p) { p.started = true; p.session = session; }
    } else if (type === 'turn.start' && typeof ev.prompt === 'string' && ev.prompt.startsWith(PROBE_TEXT.slice(0, 40))) {
      for (const p of this.probes.values()) if (p.started && (!p.session || p.session === session)) p.sent = true;
    } else if (type === 'caps') {
      this.caps = { at: this.now(), session, ccd: Array.isArray(ev.ccd) ? ev.ccd.slice(0, 30).map(String) : [], listOk: ev.listOk === true, ...(typeof ev.error === 'string' ? { error: ev.error.slice(0, 300) } : {}) };
    } else if (type === 'door2.result') {
      this.door2Last = { at: this.now(), ok: ev.ok === true, text: String(ev.text ?? '').slice(0, 600), ...(typeof ev.sid === 'string' ? { sid: ev.sid.slice(0, 60) } : {}) };
      const id = String(ev.id ?? '');
      if (ev.ok === true) { this.started.add(id); const p = this.probes.get(id); if (p) { p.started = true; p.sent = true; } }
    }
  }

  /**
   * npm run c6-probe (signed with this run's key; tools/c6-probe.ts). The probe's message is PROBE_TEXT, fixed here:
   * the request names an operation only, never words to send.
   */
  async probe(ask: Record<string, unknown>, probeFolder: string): Promise<Record<string, unknown>> {
    const op = String(ask.op ?? '');
    if (op === 'door1') {
      const hash = sha256Hex(PROBE_TEXT);
      const s = this.d.book.arm({ folder: probeFolder, text: PROBE_TEXT, hash, model: null, effort: null }, this.now(), true);
      this.probes.set(s.id, { claimed: false, started: false, sent: false, session: '' });
      return { ok: true, id: s.id, folder: probeFolder };
    }
    if (op === 'status') {
      const p = this.probes.get(String(ask.id ?? ''));
      return p ? { ok: true, ...p } : { ok: false, message: 'No such probe.' };
    }
    if (op === 'caps') {
      const host = this.d.tracker.host();
      if (!host) return { ok: false, message: 'No Claude session is linked to Aang right now. Open any Claude session and run it again.' };
      this.caps = null;
      this.d.tracker.queue(host, 'caps', '{}');
      return { ok: true, host };
    }
    if (op === 'caps.result') return { ok: true, caps: this.caps };
    if (op === 'door2') {
      const host = this.d.tracker.host();
      if (!host) return { ok: false, message: 'No Claude session is linked to Aang right now.' };
      const a = ask.args as { folder?: unknown; prompt?: unknown } | undefined;
      const args = { folder: typeof a?.folder === 'string' && /^\w{1,40}$/.test(a.folder) ? a.folder : 'cwd', prompt: typeof a?.prompt === 'string' && /^\w{1,40}$/.test(a.prompt) ? a.prompt : 'prompt' };
      const hash = sha256Hex(PROBE_TEXT);
      const s = this.d.book.arm({ folder: probeFolder, text: PROBE_TEXT, hash, model: null, effort: null }, this.now(), true);
      this.d.book.claim(probeFolder, this.now());
      this.probes.set(s.id, { claimed: true, started: false, sent: false, session: '' });
      this.door2Last = null;
      this.d.tracker.queue(host, 'door2', JSON.stringify({ text: PROBE_TEXT, hash, folder: probeFolder, args }));
      return { ok: true, id: s.id, host, args };
    }
    if (op === 'door2.result') return { ok: true, result: this.door2Last };
    if (op === 'save') {
      const door: Door = ask.door === 'link' || ask.door === 'door2' ? ask.door : 'prefill';
      const a = ask.door2Args as { folder?: unknown; prompt?: unknown } | undefined;
      const door2Args = door === 'door2' && typeof a?.folder === 'string' && typeof a?.prompt === 'string' && /^\w{1,40}$/.test(a.folder) && /^\w{1,40}$/.test(a.prompt) ? { folder: a.folder, prompt: a.prompt } : undefined;
      const note = ask.linkOk === true ? 'link-ok' : undefined;
      writeDoor(this.d.stateDir, { door, at: this.now(), ...(door2Args ? { door2Args } : {}), ...(note ? { note } : {}) });
      return { ok: true, door };
    }
    return { ok: false, message: 'Unknown probe step.' };
  }
}
