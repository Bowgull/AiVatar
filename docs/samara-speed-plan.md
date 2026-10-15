# Samara speed plan (2026-10-15, not built yet)

Goal: Claude drives Samara fast, without slowing his computer, losing any ability, or getting him flagged.

## Why the WoW search lagged
- Claude's logged-out pages had no ad blocker (driver.ts guestSession: `guardRequests(g, ..., null)`).
- `settle()` (driver.ts:605) waits up to 12s for loading to stop, then up to 3.5s of "quiet" that counts every file loaded. Ad pages never stop: ~15s per step. The 12s listener is never removed (the MaxListeners warning in the Mac log).

## The fixes, in order
| # | Fix | Speed | Loses ability? | Ban risk |
|---|---|---|---|---|
| 1 | New "page ready" check: like Chrome DevTools MCP (navigation within ~100ms, max 3s; then 100ms of no page changes, max 3s). Remove the listener on timeout. | Biggest (est. 5-10x on ad sites) | No | None |
| 2 | Ad/tracker blocker on Claude's logged-out pages (network only, safety guard first) | Big, less CPU | No | Low |
| 3 | `browser_batch`: several steps per trip, stops on first error, every step keeps its checks (plan sites, pace, STOP); human-like gaps on LinkedIn/Indeed/Glassdoor | Big on Claude's side | No (Chrome extension has it) | Low if paced |
| 4 | `browser_wait_for`: wait for some text to appear/go | Fewer blind waits | Adds ability | None |
| 5 | Close idle tabs after ~10 min; max 2 tabs per site | CPU/memory | No | Lowers it |
| 6 | Read option: controls only / one section | Fewer tokens | No | None |
| 7 | Honest-browser check: client hints say "Google Chrome" like the UA; detach debugger after network watching; one run on a fingerprint test page | - | No | Lowers it |

Later, maybe: fetch-first reading for public pages through Chromium's own network (never plain Node fetch, never logged-in or paced sites).

## Not doing
- Blocking images/CSS/fonts (breaks pages, odd fingerprint).
- Waiting for "network idle" (never settles on ad sites).
- Screenshots by default.
- Faking fingerprints (camoufox, injection), stealth script patches, CAPTCHA solvers (Botright). Samara stops at bot checks, never gets past them.
- Stealth libraries (patchright, rebrowser-patches, puppeteer stealth, nodriver): built for Playwright/Puppeteer/Chrome, not Electron; Samara already avoids the leak they fix (`Runtime.enable`).

## Already better than the Chrome extension
Smaller reads with "only what changed", stable control numbers, "nothing changed" warnings, hidden tabs, plan + site limits, pacing, stop at bot checks.

Sources: playwright.dev/docs/api/class-page, github.com/ChromeDevTools/chrome-devtools-mcp, github.com/vercel-labs/agent-browser, github.com/microsoft/playwright-mcp, developers.cloudflare.com/bots/concepts/bot-detection-engines, linkedin.com/help/linkedin/answer/a1341387, electronjs.org/docs/tutorial/offscreen-rendering.
