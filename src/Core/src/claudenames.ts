// What Joshua calls each Claude session, and the link that really opens it (2026-10-21, his catch: Samara's rune said
// "job hunt data yes build the fit as is from the research before phase 4" - the first thing typed - and Open in Claude
// said the session did not exist).
//
// Claude Code knows a session by its own id; the Claude desktop app gives the same session a different one
// ("local_<uuid>") and keeps the name he gave it. The app writes one small record per session under
// %LOCALAPPDATA%\Claude-Data\<install>\claude-code-sessions\...\local_<uuid>.json holding both ids and the title.
// Only those three fields are ever read here; the rest of the file (settings, connectors) is left alone and never kept.
// A session he started in a terminal has no record: it keeps its folder's name and has no link.
import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';

export interface SessionName { title: string; open: string }

const LOCAL_ID = /^local_[0-9a-f-]{36}$/;
const CLI_ID = /^[0-9a-f-]{36}$/;
const MAX_FILES = 2000;

/**
 * Every record under each install's claude-code-sessions folder (Claude-Data\<install>\claude-code-sessions\...),
 * searched a few levels deep there and nowhere else. 2026-10-21: it used to walk the whole of Claude-Data (the app's
 * caches too, ~17,000 entries on his PC), which held the brain for 2.4-3.2 s on every refresh, and a refresh ran inside
 * every jobs push for a session the app does not know (a terminal one, every 2 s): the progress bars froze for seconds.
 * Later the same day: even the narrow walk measured 166 ms of a frozen brain when the disk was cold, so it is
 * asynchronous now (fs/promises) and never runs inside a jobs push at all.
 */
async function recordFiles(root: string): Promise<string[]> {
  const out: string[] = [];
  const walk = async (dir: string, depth: number): Promise<void> => {
    if (out.length >= MAX_FILES || depth > 3) return;
    let names: import('node:fs').Dirent[] = [];
    try { names = await readdir(dir, { withFileTypes: true }); } catch { return; }
    for (const n of names) {
      const p = path.join(dir, n.name);
      if (/^local_[0-9a-f-]{36}\.json$/.test(n.name)) { out.push(p); continue; }
      if (n.name.includes('.')) continue;        // the records' folders are plain ids; a file is never a folder here
      if (n.isDirectory()) await walk(p, depth + 1);
    }
  };
  let installs: string[] = [];
  try { installs = await readdir(root); } catch { return out; }
  for (const i of installs) await walk(path.join(root, i, 'claude-code-sessions'), 0);
  return out;
}

/**
 * Reads the app's records into "Claude Code id -> his title and the app link", cached and refreshed at most every
 * `everyMs`. Anything malformed is skipped; a title is cut to 80 characters and stripped of control characters.
 * of() answers from the cache at once and starts a refresh in the background when one is due; `onChange` is told when
 * a refresh learned something, so the jobs list can be sent again with the new name (2026-10-21).
 */
export class SessionNames {
  private map = new Map<string, SessionName>();
  private readAt = 0;
  private seen = new Map<string, number>();
  private readonly root: string | null;
  private readonly everyMs: number;
  private running: Promise<void> | null = null;
  onChange: () => void = () => {};
  constructor(root: string | null = defaultRoot(), everyMs = 20_000) { this.root = root; this.everyMs = everyMs; }

  of(cliId: string, now = Date.now()): SessionName | null {
    if (!CLI_ID.test(cliId)) return null;
    if (now - this.readAt > this.everyMs || (!this.map.has(cliId) && now - this.readAt > 2_000)) void this.refresh(now);
    return this.map.get(cliId) ?? null;
  }

  /** Reads the records again (one at a time: a second call while one runs waits for that one). Never throws. */
  refresh(now = Date.now()): Promise<void> {
    if (this.running) return this.running;
    this.readAt = now;
    if (!this.root) return Promise.resolve();
    const root = this.root;
    this.running = (async () => {
      let changed = false;
      for (const f of await recordFiles(root)) {
        let m = 0;
        try { m = (await stat(f)).mtimeMs; } catch { continue; }
        if (this.seen.get(f) === m) continue;
        this.seen.set(f, m);
        try {
          const j = JSON.parse(await readFile(f, 'utf8'));
          const local = String(j?.sessionId ?? ''), cli = String(j?.cliSessionId ?? '');
          if (!LOCAL_ID.test(local) || !CLI_ID.test(cli)) continue;
          const title = String(j?.title ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, 80);
          const was = this.map.get(cli);
          if (was?.title === title) continue;
          this.map.set(cli, { title, open: `claude://claude.ai/epitaxy/${local}` });
          changed = true;
        } catch { /* a record mid-write: next time */ }
      }
      if (changed) { try { this.onChange(); } catch { /* the listener's own trouble */ } }
    })().catch(() => { /* gone or unreadable: next time */ }).finally(() => { this.running = null; });
    return this.running;
  }
}

function defaultRoot(): string | null {
  const base = process.env.LOCALAPPDATA;
  return base ? path.join(base, 'Claude-Data') : null;
}
