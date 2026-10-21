// What Joshua calls each Claude session, and the link that really opens it (2026-10-21, his catch: Samara's rune said
// "job hunt data yes build the fit as is from the research before phase 4" - the first thing typed - and Open in Claude
// said the session did not exist).
//
// Claude Code knows a session by its own id; the Claude desktop app gives the same session a different one
// ("local_<uuid>") and keeps the name he gave it. The app writes one small record per session under
// %LOCALAPPDATA%\Claude-Data\<install>\claude-code-sessions\...\local_<uuid>.json holding both ids and the title.
// Only those three fields are ever read here; the rest of the file (settings, connectors) is left alone and never kept.
// A session he started in a terminal has no record: it keeps its folder's name and has no link.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

export interface SessionName { title: string; open: string }

const LOCAL_ID = /^local_[0-9a-f-]{36}$/;
const CLI_ID = /^[0-9a-f-]{36}$/;
const MAX_FILES = 2000;

/** Every claude-code-sessions folder under Claude-Data (one per install), searched a few levels deep. */
function recordFiles(root: string): string[] {
  const out: string[] = [];
  const walk = (dir: string, depth: number) => {
    if (out.length >= MAX_FILES || depth > 4) return;
    let names: string[] = [];
    try { names = readdirSync(dir); } catch { return; }
    for (const n of names) {
      const p = path.join(dir, n);
      if (/^local_[0-9a-f-]{36}\.json$/.test(n)) { out.push(p); continue; }
      try { if (statSync(p).isDirectory()) walk(p, depth + 1); } catch { /* gone */ }
    }
  };
  walk(root, 0);
  return out;
}

/**
 * Reads the app's records into "Claude Code id -> his title and the app link", cached and refreshed at most every
 * `everyMs`. Anything malformed is skipped; a title is cut to 80 characters and stripped of control characters.
 */
export class SessionNames {
  private map = new Map<string, SessionName>();
  private readAt = 0;
  private seen = new Map<string, number>();
  private readonly root: string | null;
  private readonly everyMs: number;
  constructor(root: string | null = defaultRoot(), everyMs = 20_000) { this.root = root; this.everyMs = everyMs; }

  of(cliId: string, now = Date.now()): SessionName | null {
    if (!CLI_ID.test(cliId)) return null;
    if (now - this.readAt > this.everyMs || (!this.map.has(cliId) && now - this.readAt > 2_000)) this.refresh(now);
    return this.map.get(cliId) ?? null;
  }

  private refresh(now: number): void {
    this.readAt = now;
    if (!this.root) return;
    for (const f of recordFiles(this.root)) {
      let m = 0;
      try { m = statSync(f).mtimeMs; } catch { continue; }
      if (this.seen.get(f) === m) continue;
      this.seen.set(f, m);
      try {
        const j = JSON.parse(readFileSync(f, 'utf8'));
        const local = String(j?.sessionId ?? ''), cli = String(j?.cliSessionId ?? '');
        if (!LOCAL_ID.test(local) || !CLI_ID.test(cli)) continue;
        const title = String(j?.title ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, 80);
        this.map.set(cli, { title, open: `claude://claude.ai/epitaxy/${local}` });
      } catch { /* a record mid-write: next time */ }
    }
  }
}

function defaultRoot(): string | null {
  const base = process.env.LOCALAPPDATA;
  return base ? path.join(base, 'Claude-Data') : null;
}
