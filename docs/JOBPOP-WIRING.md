# Job pop-out: what main.ts adds (2026-10-21)

Sheet 52's pop-out is built and tested on its own (`src/Shell/src/jobpop.ts`, `jobpoppreload.cjs`,
`pages/jobpop.*`, `test/electron/jobpop-check.ts`). Nothing in main.ts or the bubble was touched, because the
bubble is being rebuilt. Once that lands, main.ts needs these lines:

```ts
import { JobPops } from './jobpop.ts';
let jobPops: JobPops | null = null, lastJobs: unknown = [], lastWaits: unknown = [];

// 1. Next to noteWins / timerWins, inside the new-bubble block:
jobPops = new JobPops({ origin: pages.origin, preloadPath: path.join(HERE, 'jobpoppreload.cjs'), iconPath: AANG_ICON,
  aangRects: () => { const b = bubble?.window(); return [b && !b.isDestroyed() && b.isVisible() ? b.getBounds() : null, petAt?.sprite ?? null]; },
  onAction: (m) => { if (m.t === 'jobpop.open') void shell.openExternal(m.url); else if (m.t === 'jobpop.ask' || m.t === 'jobpop.message') bubble?.send('jobpop:ask', m); else link?.send(m); },
  onPutBack: (id) => bubble?.send('jobpop:back', { id }), onNear: (id, near) => bubble?.send('jobpop:near', { id, near }) });

// 2. Where claude.jobs / claude.wait arrive (line ~374, beside aangBrowser?.claudeNews(m)):
if (m.t === 'claude.jobs') lastJobs = m.jobs; if (m.t === 'claude.wait') lastWaits = m.items; jobPops?.update(lastJobs, lastWaits);

// 3. The bubble's tear-off door (checked with fromBubble), and closing on quit:
ipcMain.on('bubble:jobpop', (e, id) => { if (fromBubble(e) && typeof id === 'string') jobPops?.open(id, screen.getCursorScreenPoint()); });
// in before-quit: jobPops?.dispose();
```

What the bubble side does with it (later): `jobpop:back` grows the job strip to take the job back (no empty
slot), `jobpop:near` lights Aang and the bubble while it is dragged close, `jobpop:ask` opens the bubble on that
session's question (`id` is the waiting item) or, for `jobpop.message`, points the typing box at the session.
`jobPops.open(id, at)` puts the card's top-left at `at`; with no `at` it goes back where he last left it this run.

Pause and Play arrive already checked by `claudeMessage` (claudewire.ts) and go to the brain as they are. Open in
Claude is only the brain's own link, checked by `claudeLink`. The page never names a session: the window's job id
is the one it was opened for.

Add a whats-new line when this is wired, not before.

WIRED (2026-10-21): main.ts, preload.cjs (jobPop / onJobPop) and the speech bubble (claudejobs.js holdToTear / tearOff /
putBack, bubble.js onJobPop) as above; Open in Claude is checked with claudeLink() again in main.ts; the pop-outs close
when Aang closes. Checked in speech-bubble-check.ts (the sheet 52 block).
