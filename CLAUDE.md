# Aang / AiVatar

A desktop AI companion. Aang is the character; the repo/product name is **AiVatar** (settled 2026-09-20, never renamed).

Two processes talk over a local WebSocket (`ws://127.0.0.1:47831/body`):

- **Core** (`src/Core/`) — TypeScript/Node 24. The brain: Claude Agent SDK lanes, memory, tools, Discord, mail, job hunt.
- **Body** (`src/Body/`) — C# .NET 10 WinForms. The pet: layered per-pixel-alpha window, sprite animation, speech bubble, tray menu. Deliberately tiny (~12-13MB, <1% CPU) — never add a framework that changes that.
- **Panel** — on-demand window, opened from the Body, four tabs plus History/Settings.

Full docs live in `docs/`. **Start with [docs/FINAL-AANG-BUILD.md](docs/FINAL-AANG-BUILD.md), the FINAL AANG BUILD.** It is the one plan: the ordered, step-by-step build with per-step verify and rollback, the critical path, and (Appendix A) every decision behind the cockpit and the reasons. It is the authority on *what to build and in what order*, and its progress table says where the work currently stands. Since 2026-10-04 (decision 47) it has absorbed every older plan; when listing what is left, read its `[ ]` steps **and** its S, Q and K steps and its "Not doing" table, not only the 6.x headings. When Joshua says "the final build" or "FINAL AANG BUILD", he means this file. `docs/WHAT-IS-LEFT.md` and the other older plans (NEXT, ROADMAP, PORT-TO-MAC, PLAN, THE-PLAN) are **superseded history**; do not act on them. [docs/MEMORY-ARCHITECTURE.md](docs/MEMORY-ARCHITECTURE.md) holds the research verdict on the memory/personality/self-learning design; treat it as binding unless the user says otherwise.

## Standing rules

- **Security before features, as reconciled on 2026-10-04 (decision 47).** Of the old 19 items, 12 are real. S1 (the connection lock) and Q (the quota leaks) come before 6.2; S2 (eleven small fixes) before 6.25, when Aang starts reading signed-in browser tabs; S3 (Mac bridge) when Mac work resumes. The rest are in "Not doing" with reasons.
- **Interview before building anything non-trivial.** Ask in rounds until there are no questions left, rather than guessing. Plain English first, the real technical name in brackets after, so it's searchable.
- **Verify in the real UI.** A green test suite is not the same as looking at the actual running app. For visual/UX changes, build, restart the real `Aang.exe`, and look — don't report done from code alone.
- **Test what was just built, once.** Live test suites cost real quota. Don't re-run the full suite speculatively; run the targeted test for what changed.
- **No self-activating anything.** Aang may propose (skills, memory writes, config changes) into a holding pen; a human approves. This is deliberate, evidence-backed policy, not caution for its own sake.
- **Don't over-verify.** Do not add "double-check your work" / "verify this is correct" instructions to prompts or to yourself. Measured effect: it causes over-verification and wastes tokens with no quality gain. Trust test results and direct observation instead of re-checking reflexively.
- **Scope clamp.** Deliver what was asked, at the scope intended. Don't expand a task to cover adjacent things that weren't requested. Finish the whole task, then stop — don't add "while I'm here" work.

## Known landmines

- **`Aang.exe` locks the build.** `dotnet build src/Body` fails with `MSB3027` while the real app is running. Pattern: `Stop-Process` the PID → build → `Start-Process` → verify with `Get-Process` (StartTime/Responding).
- **PowerShell corrupts UTF-8.** `Get-Content`/`Set-Content` mangle non-ASCII content (em dashes, curly quotes) on this machine. Use the `Edit`/`Write` tools for any file with such characters, never PowerShell redirection.
- **Core test suite has pre-existing flakiness.** Several tests share hardcoded ports and collide under concurrency — this predates any given change (confirmed via `git stash` comparison against unmodified `main`). Don't assume a failing test you didn't touch is something you broke; the port collisions were fixed in c5c9432, so a new failure is more likely real than it used to be.
- **Session resume may not pick up prompt changes.** A resumed Claude Agent SDK session can silently keep using stale instructions after a `voice.ts` edit — confirmed via cache-token analysis, not yet root-caused. If a prompt change seems to have no effect, check whether the lane's session was actually fresh.
- **The MSIX sandbox has a private AppData copy.** Scripts run from inside the Claude desktop app see a different `%APPDATA%` than the real one Aang writes to. Setup scripts (Google, Discord) must run from a real terminal outside the app sandbox, or their output lands somewhere Aang never reads.

## Where things actually stand

Don't trust `docs/FEATURES.md`, `docs/PLAN.md`'s status table, or `docs/ROADMAP.md`'s order table for current state — all three are known stale in specific, documented ways (see `docs/WHAT-IS-LEFT.md` §9.1). `docs/FINAL-AANG-BUILD.md` is the one document kept current; when it disagrees with any older doc, it wins.
