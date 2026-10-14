# What Samara can borrow from open-source browser agents

Researched 2026-10-14. Star counts, licences and last-push dates come from `gh api` that day. Nothing was installed or run.

## 0. Where Samara already stands

Samara's driver (`src/Shell/src/driver.ts`, `driverrules.ts`, `claude-door-mcp.mjs`) already does most of what the big projects advertise:

- Reads pages as text plus numbered controls. The numbers live in an isolated world (`WORLD = 1061`), which matches Playwright MCP refs, Chrome DevTools MCP uids and agent-browser `@eN` refs. Samara's version is safer, because a page can't move the number.
- Diff reads (`changes: true`). agent-browser has the same idea as `--delta`.
- `find`, `within` scoping (Playwright MCP's `target`), and shadow-DOM walking.
- Set-of-marks pictures (`marks: true`), as in agent-browser `--annotate` and WebVoyager.
- Settling: wait for a load, then wait until the page goes quiet (QUIET_JS: no mutations or new resources for 350 ms, capped at 3.5 s). This is close to what browser-use and Stagehand do.
- Per-site notes (`browser_note`). This is a small version of the "site memory" in browser-use, Notte and Magentic-UI.
- Challenge detection that stops the job (never solves it), person pace, the free / lever / never split, a bank refusal list, and per-job allowed sites (`Job.sites`). That last one is Samara's version of Gemini-in-Chrome's "Agent Origin Sets".
- CDP file upload, cross-origin frame handling, and job tools.

So what is worth borrowing is not the basic loop. It is the **reading quality** (articles, PDFs), **debugging eyes** (console and network), **cheaper repeat work** (action cache, batching, tool profiles), **research mode**, **recording**, and **driving the visible tab with consent**.

## 1. Projects surveyed

| Project | URL | Stars | Licence | Last push / release | What is unique | How it shows a page to the model |
|---|---|---|---|---|---|---|
| browser-use | github.com/browser-use/browser-use | 118k | MIT | 0.13.11, 2026-10-07 | Biggest community. Its DOM serializer runs simplify → paint-order filtering (drops elements hidden under others, with blockers at opacity ≥0.8) → bounding-box filter → index. About 10k nodes become about 200 indexed controls (5–10 KB). Vision and DOM hybrid. | Indexed `[n]<tag>` tree plus an optional screenshot |
| workflow-use | github.com/browser-use/workflow-use | 4.2k | **AGPL-3.0** | 2026-10-09 | Records a run, then replays it without an LLM, with variables. Falls back to the agent when a step fails. Replay was broken on 0.13 in mid-2026. | Semantic steps (visible text, ARIA label) |
| Stagehand | github.com/browserbase/stagehand | 25.7k | MIT | v3.7.3, 2026-08-28 | `act` / `extract(schema)` / `observe`. Action cache (`cacheDir`) keyed by instruction + URL + page content. `variables` are keyed by name, so one cache entry serves many values. v4 adds `selfHeal`: re-infer and retry once when the cached selector is gone. | Accessibility tree with xpaths |
| Playwright MCP | github.com/microsoft/playwright-mcp | 38k | Apache-2.0 | v0.0.83, 2026-09-28 | ARIA snapshot with refs. `browser_fill_form` fills many fields in one call. `browser_handle_dialog`, `browser_wait_for`. `--secrets` masks known values in replies. `filename=` sends big output to a file. Opt-in capability groups (`--caps`). `--extension` drives the user's own Chrome. | `- role "name" [ref=e5]` YAML-ish tree |
| Chrome DevTools MCP | github.com/ChromeDevTools/chrome-devtools-mcp | 53.5k | Apache-2.0 | v1.10.1, 2026-09-23 | 59 tools: console with source-mapped stacks, network list/detail with bodies to file, performance traces with named insights (LCPBreakdown...), Lighthouse, screencast, heap snapshots, `wait_for(text[])`, `--slim` profile, and experimental **WebMCP** `list_webmcp_tools` / `execute_webmcp_tool`. | A11y snapshot with uids |
| agent-browser (Vercel) | github.com/vercel-labs/agent-browser | 44k | Apache-2.0 | v0.39.1, 2026-10-13 | Rust CLI + daemon. `snapshot -i -c --delta`. Stable tab ids `t1,t2` with labels. `batch`. `screenshot --if-changed`. `read` tries `Accept: text/markdown`, then a `.md` sibling, then `llms.txt`. Encrypted auth vault so the model never sees passwords. Domain allowlist that also blocks WebSocket, beacon and WebRTC. `record` to WebM/MP4. `core` tool profile. WebMCP tools treated as untrusted. | `@eN` refs, interactive-only, compact |
| Skyvern | github.com/Skyvern-AI/skyvern | 23k | **AGPL-3.0** | v1.0.56, 2026-10-14 | Vision + LLM. "Run with code": a successful run is turned into cached code (per workflow block), replayed with no LLM, and falls back to the agent and regenerates when it fails. "Clear cached scripts" API. | Screenshot + DOM elements |
| Nanobrowser | github.com/nanobrowser/nanobrowser | 14k | Apache-2.0 | v0.2.0, 2026-10-02 | Chrome extension. Planner / Navigator (/ Validator) split, with a different model for each role. | browser-use-style indexed DOM |
| Midscene | github.com/web-infra-dev/midscene | 15k | MIT | v1.15.4, 2026-10-14 | Pure-vision locating (UI-TARS / Qwen-VL). Caches located elements. Replay report as HTML. | Screenshot |
| Magentic-UI / MagenticLite | github.com/microsoft/magentic-ui | 10k | MIT | 2026-09-23 | Human-in-the-loop: co-planning, approve before high-stakes steps, take over at any time. Fara browser model. Sandbox VM. | Screenshot + a11y |
| Notte | github.com/nottelabs/notte | 2k | custom (SSPL-like) | 2026-10-14 | "Perception layer": the page becomes a short action list (`I1` input, `B3` button) in markdown. Hybrid: routine steps become frozen scripts. | Action-space markdown |
| Steel | github.com/steel-dev/steel-browser | 7.8k | Apache-2.0 | v0.5.4-beta | Browser-as-API: sessions, proxies, live view. Infra, little for Samara. | n/a |
| HyperAgent | github.com/hyperbrowserai/HyperAgent | 1.6k | custom | 2026-05 | Playwright + `page.ai()`. Hyperbrowser cloud. | a11y |
| LaVague | github.com/lavague-ai/LaVague | 6.4k | Apache-2.0 | **stale (2025-01)** | World model + action engine. Skip. | |
| Agent-E | github.com/EmergenceAI/Agent-E | 1.3k | MIT | 2026-05 | "DOM distillation" modes (text only / input fields / all fields) chosen per step. Planner + browser nav agents. The idea of choosing a distillation mode per step is worth taking. | 3 distillation levels |
| WebVoyager | github.com/MinorJerry/WebVoyager | 1.1k | Apache-2.0 | 2024 (paper code) | Set-of-marks screenshot, the origin of the "numbered boxes" idea. Samara already has it. | SoM screenshot |
| AgentQL | github.com/tinyfish-io/agentql | 1.5k | MIT (SDK; the service is paid) | 2026-10-08 | GraphQL-like query `{ products[] { name price(no sponsored) } }`: the query shape is the output shape. Natural-language hints in parentheses. | Server-side |
| Firecrawl | github.com/firecrawl/firecrawl | 191k | **AGPL-3.0** | 2026-10-14 | Scrape to markdown, crawl, search, `/extract` with schema, `/monitor` (dedupe + alerts). The Deep Research endpoint is deprecated in favour of Search + Agent. | Markdown |
| Jina Reader | github.com/jina-ai/reader | 12k | Apache-2.0 | 2026-05 | `r.jina.ai/<url>` to markdown. Readability + Turndown + headless Chrome. **Sending his URLs to a third party is a privacy leak; do it locally instead.** | Markdown |
| Jina node-DeepResearch | github.com/jina-ai/node-DeepResearch | 5.2k | Apache-2.0 | 2026-05 | Search → read → reason loop until a token budget runs out, with footnote citations. Clear design to copy. | |
| Mozilla Readability | github.com/mozilla/readability | 11.5k | Apache-2.0 | 2026-08 | Firefox Reader View algorithm. Battle-tested. | Article HTML |
| **Defuddle** | github.com/kepano/defuddle | 9.7k | **MIT** | 0.19.5, 2026-10-10 | Obsidian Web Clipper's extractor. Gentler than Readability. Uses mobile CSS to find clutter. Normalises footnotes, code and math. Pulls schema.org metadata (author, published date). The core bundle has no dependencies and runs in the page. | Markdown + metadata |
| Turndown | github.com/mixmark-io/turndown | 11.5k | MIT | 2026-09 | HTML → markdown (defuddle/full already includes markdown). | |
| trafilatura | github.com/adbar/trafilatura | 7k | Apache-2.0 | 2026-10 | The best benchmarked extractor, but it is Python. Use it only as a quality reference. | |
| pdf.js | github.com/mozilla/pdf.js | 54k | Apache-2.0 | v6.4.299, 2026-10-03 | `getDocument(bytes)` → `page.getTextContent()` gives text items with x/y, enough to rebuild lines and columns. `pdfjs-dist` is the npm build. | Text |
| markitdown | github.com/microsoft/markitdown | 190k | MIT | 2026-10 | DOCX/XLSX/PPTX/PDF → markdown. Python, so a pattern reference only. | |
| rrweb | github.com/rrweb-io/rrweb | 20k | MIT | 2026-10-14 | Records DOM mutations (not pixels) and replays them as a tiny, searchable session. Masks inputs by default. | |
| gifenc | github.com/mattdesl/gifenc | 342 | MIT | 2024 (done, stable) | Tiny pure-JS GIF encoder with quantize + palette. | |
| WebMCP (W3C) | github.com/webmachinelearning/webmcp | 4.6k | W3C | 2026-10-14 | Sites register tools via `document.modelContext` (old name `navigator.modelContext`). Chrome origin trial runs from 149 to 156. MCP-B (MiguelsPizza/WebMCP) is the older polyfill and is stale. | Tool list |
| OpenAI CUA sample | github.com/openai/openai-cua-sample-app | 1.9k | MIT | 2026-09 | Pure screenshot + x/y actions. `pending_safety_checks` (malicious instructions, irrelevant domain, sensitive domain) must be acknowledged by the user. | Screenshot |
| Anthropic computer-use demo | github.com/anthropics/claude-quickstarts | 18k | MIT | 2026-10 | Screenshot + xdotool. A reference for the zoom action and screenshot scaling. | Screenshot |
| Claude in Chrome (closed) | support.claude.com/en/articles/12902446 | n/a | n/a | | Modes: Manually approve, Auto (a classifier checks every action), Skip. Two classifiers: one on incoming content for injection, one on each action. Blocked categories. "Allow this site / this time / deny". Works in a tab group shown to the user. | a11y refs + screenshot |
| Gemini in Chrome (closed) | blog.google/security/architecting-security-for-agentic/ | n/a | n/a | | **User Alignment Critic**: a second model that sees only *metadata* about the proposed action (never page content) and vetoes actions that are off-task. **Agent Origin Sets** limit the agent to origins relevant to the task. Spotlighting. Confirmation before critical steps. | |

## 2. Borrowable items, with how each plugs into Samara

Effort: S = under a day, M = 1–3 days, L = a week or more.

### A. Reading quality

**A1. `browser_read mode:"article"`: clean markdown through Defuddle.** MIT, kepano/defuddle, core bundle.
Plug-in: inject `defuddle` core into WORLD 1061 (the same way `darkreader.js` is read from node_modules in browser.ts), run `new Defuddle(document).parse()`, and convert to markdown with defuddle/full or Turndown. Return title, author, published date, site and word count, then the markdown, marked as the page's words. Use this as the default for research and news pages, and keep the controls view for forms.
Effort **S**. Payoff **high**: long articles cost 3–10x fewer tokens than line dumps, and boilerplate (cookie text, nav, footers) disappears. Risk: low. Some pages extract badly, so fall back to lines when wordCount is under ~150. Pin the version.

**A2. `Accept: text/markdown` / `llms.txt` first (from agent-browser `read`).** Before rendering, try a markdown variant of the URL (docs sites, Mintlify, GitHub raw) and the site's `/llms.txt`.
Effort **S**. Payoff medium for docs research. Risk: none, it is a plain GET through the same session with the same refusal checks.

**A3. PDF text through pdf.js.** Apache-2.0, `pdfjs-dist`.
Samara opens PDFs in Chromium's built-in viewer, which exposes no text. Add `browser_read` on a PDF page: fetch the bytes in the main process with the session (`ses.fetch`), run `pdfjs-dist` (legacy Node build, no worker) → `getTextContent()` per page, join items into lines by y-position, and page through with `pages:"3-5"`. Cap the size (for example 30 MB, 300 pages).
Effort **M**. Payoff **high** for job descriptions, research papers and manuals. Risk: pdf.js has had CVEs (CVE-2024-4367 was arbitrary JS through font rendering). Use `isEvalSupported:false`, text only, no rendering, keep it up to date, and run it in the main process, never in a page.

**A4. Agent-E-style "distillation level" per read.** `browser_read` already has `within` and `changes`. Add `only:"controls" | "text" | "all"` so a form step pays only for controls and a reading step only for text.
Effort **S**. Payoff medium (tokens).

**A5. Occlusion filter (browser-use paint order).** When numbering controls, drop ones whose centre point `document.elementFromPoint` resolves to an unrelated element (a modal or a sticky header covering them). Mark them as `covered` instead of dropping them when a dialog is open.
Effort **S**. Payoff medium: fewer "clicked, nothing happened" moments. Risk: false positives on transparent overlays. browser-use uses opacity ≥0.8 as the blocker rule; do the same.

### B. Reliability

**B1. `browser_wait_for(text[] | gone[], timeout)`** (Chrome DevTools MCP, Playwright MCP). Wait until any of the texts appears (or disappears). It is cheaper and surer than "scroll and read again" after a submit or a search.
Effort **S**. Payoff **high**. Plugs into QUIET_JS's loop.

**B2. `browser_fill_form([{n, value}...])`** (Playwright MCP `browser_fill_form`, CDT MCP `fill_form`). One call types into many free fields, then returns one diff. It runs each field through the same `weigh()` rules, and still holds anything on the lever, like submit.
Effort **S**. Payoff **high** for applications: 10 tool calls become 1, which means real quota savings.

**B3. `browser_dialog` (accept/dismiss alert/confirm/beforeunload).** Electron offscreen windows can hang on `window.confirm`. Catch it through the `-will-prevent-unload` event and CDP `Page.javascriptDialogOpening`, report it in the next read, and treat accepting a "confirm delete/submit" as a lever action.
Effort **S–M**. Payoff medium: it removes a silent-hang failure mode.

**B4. Network-quiet settling.** Add to QUIET_JS a count of in-flight `fetch`/XHR from `session.webRequest` (or the CDP Network domain) per webContents, so "quiet" also means no open requests. This is what Playwright's `networkidle` and browser-use's wait do.
Effort **S**. Payoff medium on SPAs like LinkedIn and Workday. Risk: long-poll / websocket pages never go idle, so keep the 3.5 s cap and ignore websockets and EventSource.

**B5. Action cache + replay ("recipes")**, from Stagehand `cacheDir`, Skyvern "run with code" and workflow-use. Don't copy the code (Skyvern and workflow-use are AGPL); copy the idea:
- After a job succeeds, save each step as `{site, path pattern, step intent, control fingerprint (role + name + nearby label + tag), action, variable name}` to `recipes/<site>.json`.
- `browser_recipe run name vars` replays it: find each control by fingerprint (not by number). If a step can't find its control, or the diff after a step doesn't match what was recorded, stop and hand that step back to the model ("self-heal"), which then rewrites that step.
- Every lever step still asks Joshua, and so does every replay.

Effort **M–L**. Payoff **very high** for repeated tasks (job boards, the same ATS forms, a weekly check): a replay needs almost no tokens. Risks: replaying on a changed page can click the wrong thing, so fingerprints must be strict and the diff checked after every step. Never store typed values that are private; store variable names only. The workflow-use PRs about "credential and PII leaks in capture" show exactly this trap.

**B6. `browser_batch`** (agent-browser `batch`, which Claude-in-Chrome also has). Several free actions in one call, stopping at the first error or the first lever action.
Effort **S**. Payoff medium–high for tokens and round-trips.

### C. Debugging eyes

**C1. `browser_console`.** Electron gives `webContents.on('console-message')` with no CDP needed. Keep a ring buffer of 200 per page since the last navigation, filterable by level and pattern.
Effort **S**. Payoff medium for Samara's own pages, Aang's craft apps and form failures ("why did submit do nothing" is often a JS error). Risk: console text is the page's words, so mark it as data.

**C2. `browser_network` list + `browser_network_request id`** (CDT MCP). Use `wc.debugger.attach('1.3')` (already used for upload) → `Network.enable`. Keep method, URL, status, type and size, and hide static files by default (Playwright's `static:false`). The detail view gives headers with **cookies and Authorization redacted**, and writes the body to a file only on request.
Effort **M**. Payoff medium. It is the honest way to tell "the form posted and got a 422". Risk: **high privacy**. Tokens and cookies in headers must never reach the model. Redact by default, and never on bank sites (already refused).

**C3. Performance traces / Lighthouse / heap.** Skip for Samara's driver. If Aang ever debugs his own craft apps, point Claude Code at the real Chrome DevTools MCP instead of rebuilding it.

### D. Tokens and quota (matters a lot given his quota limit)

**D1. Tool profiles** (CDT MCP `--slim`, agent-browser `core`, Playwright `--caps`). `claude-door-mcp.mjs` advertises 20+ tool schemas on every session. Split them into `core` (open, read, find, click, type, key, scroll, close) and opt-in groups (`jobs`, `forms`, `debug`, `research`) chosen by an env var or the job kind. His memory note about quota says 82% of the cold-start prefix is tool definitions, and the same lesson applies here.
Effort **S**. Payoff **high**.

**D2. Big output to a file** (Playwright `filename=`). For long reads, sweeps and network logs, write to a file in the job folder and return the path plus the first N lines. `browser_jobs` already does this, so make it general.
Effort **S**. Payoff medium.

**D3. `browser_picture if_changed`** (agent-browser). Skip the image when the pixels haven't changed since the last picture, compared by perceptual hash.
Effort **S**. Payoff small–medium: about 1,400 tokens saved per skipped picture.

**D4. Secrets masking** (Playwright `--secrets`). Before any text leaves the door, replace known private strings (his phone number, email, address, from a local list) with `<his phone>` and so on. This protects transcripts and logs.
Effort **S**. Payoff medium (privacy). Note: Playwright says itself that this is not a security boundary.

### E. Research mode

**E1. `browser_research`: read many pages in parallel and cite them.** Jina node-DeepResearch's loop is the design to follow (Apache-2.0; read it, don't vendor it):
- Input: a list of URLs (or a query plus a search page).
- Open N hidden pages at a time (up to the 6-page cap), A1 article-read each one, and keep `{url, canonical (<link rel=canonical>), title, author, published, site, text hash}`.
- **Dedupe** by canonical URL and by near-duplicate text (simhash or MinHash over shingles; syndicated news is the common case).
- Return numbered sources `[1] title — site — date — url` plus their markdown, written to a file. Claude cites `[n]`.
- Optionally save to `research/<topic>/` as a small knowledge base: one markdown file per source with frontmatter, Obsidian-friendly (Defuddle is literally the Obsidian clipper).

Effort **M**. Payoff **high**: it is the biggest new capability. Risks: rate limits and ToS on news sites, so reuse the person-pace table and robots-style politeness. Paywalls: read only what his session can see, never try to get around one.

**E2. Extract with a schema** (Stagehand `extract`, AgentQL query shape, Firecrawl `/extract`). `browser_extract page schema` where the schema is a small JSON shape like `{items:[{name, price, url}]}`. Samara doesn't need its own LLM for this: return the article/lines plus the schema to Claude, or for repeated pages, save the mapping (selector per field) after the first success and replay it with no model, as `browser_jobs` already does for job cards. That generalises JOBS_JS.
Effort **M**. Payoff medium–high.

### F. Recording

**F1. GIF / short clip of a session** (Claude-in-Chrome `gif_creator`, CDT `screencast_start`, agent-browser `record`). Offscreen windows already render at a low frame rate. After each action, `wc.capturePage()` → downscale → frame list, then encode with **gifenc** (MIT, pure JS, no ffmpeg). Overlay the clicked control's number and a cursor dot. Cap it at about 60 frames.
Effort **S–M**. Payoff medium: it shows Joshua what Aang did ("show me"), and it is a trust feature.

**F2. rrweb DOM recording** (MIT). Records mutations instead of pixels, so it is tiny and searchable and can be replayed in a Samara page. Inputs are masked by default.
Effort **M**. Payoff low–medium. Prefer F1 unless he wants scrub-back replay.

### G. Driving his visible tab, with consent

**G1. "Lend this tab to Aang"**, from Claude in Chrome (tab group + "Allow this site / this time / deny" + Stop) and Gemini (origin sets + critic). Samara owns the whole browser, so this is easier than for an extension:
- He presses a button, or Aang asks and he approves in the bubble.
- That tab joins a job with `sites = {that tab's site}`, the same as `Job.sites`.
- A coloured edge and an "Aang is driving — Stop" strip are drawn by the browser chrome, not by the page.
- Input from him pauses the agent (he takes over); his typing always wins.
- On leaving the site set, or after N minutes idle, the tab goes back to him.

The same driver functions run against a visible webContents. No offscreen window is needed, and the isolated world still works.
Effort **M**. Payoff high ("do this on the page I'm looking at"). Risks: the agent acts on his real signed-in tab, so every lever rule stays. Never on bank sites (already refused). Never when a game is in the foreground (his "no synthetic keys into his game" rule). Use `sendInputEvent` into the webContents only, never OS-level keys.

**G2. A cheap "alignment check" on lever actions** (Gemini's User Alignment Critic, OpenAI CUA `pending_safety_checks`). Before a lever action is shown to Joshua, include the **task as he stated it** next to the action in the approval card ("You asked: apply to X. Aang wants to: click 'Submit' on careers.y.com"). Optionally, a small local Qwen call that sees only `{task, action, target name, host}` (never the page text) and flags a mismatch.
Effort **S** for the card, **M** for the Qwen check. Payoff medium (injection defence). Risk: none. It only adds friction to actions that already ask.

### H. WebMCP: sites exposing tools

**H1. `browser_site_tools` / `browser_site_tool`.** Read `document.modelContext` (and the old `navigator.modelContext`) on the page. Chrome origin trial 149–156; Samara's Electron Chromium version decides whether the API exists at all. List the tools a site registers and call one.
Effort **M**. Payoff **low today** (few sites have it), rising later. Risks: tool names and descriptions are written by the site, which makes this **a prompt-injection channel**. Treat them as page words (agent-browser and CDT keep this experimental and untrusted), and send every call through `weigh()` like a click. Revisit in 2027.

### I. Accessibility-tree read through CDP (for reference)

`Accessibility.getFullAXTree` / `queryAXTree` through `wc.debugger` gives Chrome's computed roles and names, which are what Playwright, CDT MCP and Claude-in-Chrome show. Samara computes roles itself in JS. Use the CDP version only as a fallback for odd custom widgets when a control has no name.
Effort **M**. Payoff low–medium. Not a priority.

## 3. Top 15 ranked by payoff ÷ effort

| # | Item | Effort | Payoff | Why first |
|---|---|---|---|---|
| 1 | D1 Tool profiles (core + opt-in groups) | S | High | Every session pays for every tool schema, and his quota is the main limit |
| 2 | A1 Article read through Defuddle (MIT) | S | High | 3–10x fewer tokens on reading pages; no third party involved |
| 3 | B2 `fill_form` many fields in one call | S | High | Application forms in 1 call instead of 10 |
| 4 | B1 `wait_for` text appears/disappears | S | High | Removes guess-and-reread loops after submits and searches |
| 5 | B6 `browser_batch` of free actions | S | Med–High | Fewer round-trips; stops at a lever action |
| 6 | C1 Console messages (Electron event, no CDP) | S | Medium | Explains "nothing happened" |
| 7 | A5 Occlusion check (covered controls) | S | Medium | Fewer clicks on things hidden behind a modal |
| 8 | A2 `llms.txt` / text/markdown first | S | Medium | Free clean docs |
| 9 | G2 Show "you asked / Aang wants" on approval cards | S | Medium | Cheap injection defence |
| 10 | D2 + D3 Output to file, picture-if-changed | S | Medium | Token hygiene |
| 11 | E1 Research mode: parallel read, dedupe, numbered citations, KB folder | M | High | The largest new capability |
| 12 | A3 PDF text through pdf.js | M | High | PDFs are currently unreadable to the driver |
| 13 | B5 Recipes: action cache + replay + self-heal | M–L | Very high | Repeat tasks at near-zero tokens; build after B1/B2 |
| 14 | G1 Lend his visible tab with a Stop strip | M | High | "Do it on this page"; reuses Job.sites |
| 15 | F1 GIF of what Aang did (gifenc) | S–M | Medium | Trust and "show me" |

Next tier: C2 network (privacy work first), E2 extract-with-schema, B3 dialogs, B4 network-quiet settle, D4 secrets masking. Later: H1 WebMCP, F2 rrweb, I CDP a11y tree.

**Don't vendor:** Firecrawl, Skyvern and workflow-use are AGPL-3.0. Copy ideas only. Notte and HyperAgent use custom licences. Jina Reader's hosted `r.jina.ai` and Firecrawl's cloud would send his URLs to a third party, so do the same work locally. LaVague is stale. **Safe to vendor:** Defuddle (MIT), Readability (Apache-2.0), Turndown (MIT), pdfjs-dist (Apache-2.0), gifenc (MIT), rrweb (MIT). Reading Playwright MCP, CDT MCP and agent-browser code is fine (Apache-2.0, keep the notices if you copy any).

## 4. Summary in plain English

1. Samara's driver already does the core of what the big projects do: numbered controls, change-only reads, settling, site notes and safety rules.
2. The biggest quick win is fewer tools per session. Show Claude a small core set and switch on the job, form, debug or research tools only when needed. That saves quota on every call.
3. Add a "read as article" mode using Defuddle (free, MIT). Articles come back as clean text at a fraction of the cost.
4. Add "fill these 10 fields in one go" for application forms, with the submit button still asking Joshua first.
5. Add "wait until this text shows up", so Aang stops guessing whether a page has finished.
6. Let Aang batch several safe clicks and scrolls into one call.
7. Let Aang read a page's error log, so "the button did nothing" gets a real answer.
8. Add PDF reading with Mozilla's pdf.js, text only, kept up to date for security.
9. Build a research mode: read several pages at once, drop duplicates, number the sources and save them as notes.
10. Later, let Aang remember the steps of a task that worked and replay them for almost no cost, falling back to thinking only when a site has changed.
11. Let Joshua lend Aang the tab he is looking at, with a clear "Aang is driving — Stop" strip, the same site limits and no bank sites.
12. Make a short GIF of what Aang did. Don't copy code from Firecrawl, Skyvern or workflow-use (their licences are viral); MIT and Apache projects are fine to use.
