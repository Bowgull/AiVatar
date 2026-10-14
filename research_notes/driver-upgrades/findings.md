# Driver upgrades, stealth tools, Reddit API (2026-10-14)

## Accuracy: what the best agents do
- Playwright MCP: accessibility-tree snapshot with refs (e15, frames f2e7), scoped reads, find, sends only what changed ([playwright.dev](https://playwright.dev/mcp/snapshots)).
- browser-use: indexed elements, paint-order filtering, ~0.5 s network-quiet wait, vision only on demand; 89.1% WebVoyager ([report](https://browser-use.com/posts/sota-technical-report)).
- Stagehand: act / extract / observe, cached self-healing actions (v3 local) ([docs](https://www.mintlify.com/browserbase/stagehand/concepts/caching)).
- Skyvern: planner 68.7% -> + validator 85.85% WebVoyager ([blog](https://www.skyvern.com/blog/skyvern-2-0-state-of-the-art-web-navigation-with-85-8-on-webvoyager-eval/)).
- Agent-E: page views per step + change reports after each action, 73.2% ([arXiv](https://arxiv.org/abs/2407.13032v1)).
- Lightpanda: Zig headless browser, no rendering, no native Windows, separate engine without his session: not useful here ([GitHub](https://github.com/lightpanda-io/browser)).
- Text vs vision: text list of elements is the best way to pick an element (SeeAct, [arXiv](https://arxiv.org/html/2401.01614v1)); pictures help on visual tasks (VisualWebArena, WebVoyager). Text first, picture when unsure.
- Screenshot cost ~ w*h/750 tokens (1280x800 ~ 1,365) ([Anthropic](https://platform.claude.com/docs/en/build-with-claude/vision)).

## Upgrades, in order
1. Accessibility-tree read with roles and states. 2. Element numbers that survive between reads. 3. Check after every action, reporting what changed. 4. Wait for network quiet + DOM stable. 5. extract(schema) to JSON (job cards). 6. Diff reads. 7. Scroll-and-collect for virtualized lists. 8. select, keys (Esc/Tab/arrows), back/forward. 9. find(text) and scoped reads. 10. iframes + open shadow DOM. 11. Screenshot only when unsure, cropped, optional numbered boxes. 12. Per-site recipes, self-repairing.

## Stealth tools
puppeteer-extra-plugin-stealth (unmaintained), rebrowser-patches, undetected-chromedriver/nodriver, Camoufox. Not needed: Aang's browser is real Chromium with his own session; spoofing makes it less consistent and reads as deliberate evasion. LinkedIn 8.2 applies whether detected or not ([LinkedIn](https://www.linkedin.com/help/linkedin/answer/a1341387)).

## Reddit API
- Nov 2025 Responsible Builder Policy: new OAuth apps need manual approval; small personal projects often get no answer ([mirror](https://r.datuan.dev/r/redditdev/s/gquSJqMgrM), [redditapis.com](https://www.redditapis.com/blogs/reddit-data-api-2026)).
- If approved: script app, client id/secret + username/password, 100 req/min, user agent `<platform>:<app ID>:<version> (by /u/<name>)`. No training on Reddit data; on-demand reading not clearly banned.
- Logged-out .json returns 403 since late May 2026 ([DEV](https://dev.to/tonywangca/why-reddit-blocked-unauthenticated-json-in-2026-and-how-to-still-get-reddit-data-58b9)).
- MCP servers: karanb192/reddit-mcp-buddy (~854 stars, read-only), jordanburke/reddit-mcp-server (writes optional), adhikasp/mcp-reddit, Arindam200/reddit-mcp.
- Safest: request narrow read-only personal access; if approved use reddit-mcp-buddy. If refused, don't automate Reddit reading at scale.
