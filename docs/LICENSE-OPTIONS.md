# Licence options for AiVatar (not chosen yet)

Drafted 2026-11-19 for the repo scrub. **Joshua picks; nothing is applied until he does.** Today the repo has no
LICENSE file, which means "all rights reserved": anyone may read it on GitHub, nobody may legally reuse it.

## What constrains the choice

- **MPL-2.0 parts** (Ghostery adblocker, DuckDuckGo Autoconsent): file-level copyleft. Fine under every option
  below, as long as their own files are not modified, or changes to them are shared under MPL-2.0.
- **MIT and Apache-2.0 parts** (Electron, Dark Reader, tldts, ws, discord.js, Playwright MCP): fit every option.
- **OFL fonts**: may ship with software under any licence.
- **Claude Agent SDK**: proprietary. Depending on it is fine; the repo must not copy its code in, and the licence
  chosen cannot grant rights to it.
- **castLabs ECS / Widevine (uncertain)**: Samara's paid-video engine comes from castLabs and is signed through
  their EVS service under castLabs' terms. Whether a public repo may describe or script that signing, and whether
  Samara builds can be handed to others, has not been checked against castLabs' terms. Read them before shipping
  Samara to anyone but Joshua, whatever licence is picked.

## The choices

| Option | What it lets others do | Good for | Watch out |
|---|---|---|---|
| **A. No licence (as now) + a one-line README note** | Read only | Keeping full control while the repo stays public | Not open source; contributions are awkward |
| **B. MIT** | Anything, keep the notice | Simplest, most common | No patent grant; anyone may close-source a fork |
| **C. Apache-2.0** | Anything, keep notices, state changes | Same as MIT plus an explicit patent grant | A NOTICE file to keep |
| **D. MPL-2.0** | Use freely, but changed AiVatar files stay open | Matches Ghostery and Autoconsent; file-level copyleft | Slightly more to explain |
| **E. PolyForm Noncommercial 1.0** | Use and change, never commercially | Keeps a portfolio piece from being resold | Not OSI "open source" |

## Decision needed (for the master session to ask)

1. Which option, A to E?
2. Copyright line: "Copyright (c) 2026 Joshua Bocas" or the GitHub handle "Bowgull"?
3. Should Samara (the browser) be licensed differently from Aang (the companion), given the castLabs question?
