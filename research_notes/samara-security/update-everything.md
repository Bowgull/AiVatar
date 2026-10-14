# One UPDATE for everything (plan, 2026-10-14)

His asks, same day: engine updates surface as UPDATE, plain words, tick boxes to opt in or out, the same smooth
update, the version names and types he picked (MAJOR.MINOR.PATCH, a new character only on a major), and "these
updates should span everything aang uses, electron etc, covers everything samara uses".

## What "everything" is (inventory)
| Part | Where | Today |
|---|---|---|
| Samara's engine (castLabs Electron, paid video) | PC + Mac | 44.5.1, newest castLabs; pinned by hand |
| Samara's libraries (adblocker, Dark Reader, ws) | PC + Mac | pinned in package.json |
| Aang's brain libraries (Claude agent SDK, Discord, zod, ws, unpdf, chrono, Playwright MCP) | PC + Mac front desk | pinned; the Claude SDK update is what Opus 5.5 waits on |
| Node.js (runs Aang's brain and the Mac front desk) | PC v24.19.0, Mac in Aang's folder | by hand |
| Bitwarden's tool | PC by hand, Mac pinned 2026.9.0 | by hand |
| The pet's runtime (.NET 10) | PC | by hand |
| Samara's own code | both | DONE: the UPDATE key (Mac); Claude restarts on the PC |
| Phishing and ad-block lists | both | DONE: refreshed daily, no key needed |

## How it works (one design for every part)
1. **Watch, daily.** Each part has a check: what runs here, what is newest (npm registry, GitHub releases with
   their published fingerprints, castLabs, Bitwarden, nodejs.org, dotnet).
2. **Cool-down.** A new library or tool is only taken once it has been out a while (his standing rule: two weeks),
   so a poisoned release is caught by the world first. Security-only engine releases: his call (see the question).
3. **Prepare quietly, at low priority.** Download, check the fingerprint, put it beside the old one, run Aang's
   tests on it. Libraries: install into a copy, run the test suites. Engine: set the switches (login lock, closed
   back doors), re-sign for video with his castLabs account (cached sign-in), run the call/video checks.
4. **Only when everything passed, UPDATE lights up** (warm pulse), on the machine it is for, and Aang says so once;
   the morning brief gets a row with the lantern and an Update button.
5. **The tray:** "Version 1.1.0: Gojo", then one line per part in plain words, each with a tick box. Unticking a
   part leaves it out of this update (it waits for the next). Safety-critical lines are ticked and fixed.
6. **Restart now** swaps in what was ticked. A part that fails to start is rolled back by itself and reported to
   Claude (the update report). The changelog gets every line.
7. **Versions:** a new engine family or a new Node/.NET major = MAJOR (new name); a new engine or library feature
   release = MINOR; fixes only = PATCH.

## Critical path
1. Engine (castLabs) on the PC: prepare, switches, re-sign, test, tray with tick boxes. (in progress)
2. The parts framework in the brain: watch + cool-down + one release label for the PC and one for the Mac.
3. Libraries (Samara, Aang's brain, the Mac front desk) with test runs, including the Claude SDK (unblocks Opus 5.5).
4. Engine on the Mac: signed on the PC, delivered in the Mac's update.
5. Node, Bitwarden's tool, .NET.
