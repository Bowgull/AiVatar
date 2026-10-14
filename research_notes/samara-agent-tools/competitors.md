# AI browsers and browser agents: feature matrix (as of 2026-10-14)

Written 2026-10-14 for Samara. Researched via web search and the vendors' own docs, blogs and changelogs, plus security write-ups.

Labels:
- **[docs]**: the vendor's own help page, changelog or blog. This is what they say ships, not something I tested.
- **[vendor]**: a marketing claim (speed, safety numbers). Not independently checked.
- **[secondary]**: news or review coverage that I could not confirm against a primary source.
- **[research]**: a published security finding by a third party, such as Brave, LayerX or Zenity.

Big picture, October 2026:
- **OpenAI killed Atlas.** It was announced on 9 Jul 2026 and stopped on 9 Aug 2026, 292 days after launch. Its features moved into the ChatGPT desktop app (built-in browser plus a cloud browser) and a Chrome extension.
- **Dia deleted its Memory feature** (1.50.0, 24 Sep 2026) and now relies on on-demand history and tool lookups.
- **Microsoft retired Edge "Copilot Mode"** (13 May 2026) and folded the pieces into ordinary Edge.
- **Arc** gets Chromium security updates only.

The market is consolidating into two shapes: the assistant lives in the big browser (Chrome, Edge), or an assistant app drives a browser (Claude Cowork, ChatGPT desktop, MCP connectors). Standalone "AI browsers" are struggling.

---

## 1. The matrix at a glance

| Product | Sees | Does | Permission model | Memory | Research | Dev hooks | Status |
|---|---|---|---|---|---|---|---|
| Claude in Chrome (+ Claude Code `--chrome`, Cowork) | Current tab; tabs you drag into its tab group; screenshots; console, network and DOM | Click, type, forms, tabs, uploads, downloads; background in-tab work; **scheduled shortcuts**; workflow recording | Per-site allow-once / always / decline; modes run from ask-each to "Automatically approve" (classifier-checked) to "Skip all approvals"; hard blocks | Claude account memory; no browsing memory | Multi-tab reading; Claude's research tools in Cowork | Claude Code drives it; Cowork skills, plugins and connectors | Shipping, all paid plans, Chrome or Edge only |
| ChatGPT Atlas | Current tab; history via browser memories | Agent mode: multi-step, supervised | Paused on sensitive sites; logged-out option | Opt-in "browser memories" (summaries; raw pages deleted) | Sidebar Q&A | Extensions | **Dead since 9 Aug 2026** |
| ChatGPT desktop app + extension (Atlas's successor) | Built-in browser tabs; cloud browser | Agent browses in a **cloud** browser; user approves, watches screenshots, can take over | Approve actions; take-over control | ChatGPT memory | ChatGPT deep research | Codex adds WebMCP (Aug 2026) [secondary] | New, Jul 2026 |
| Perplexity Comet | Current tab, open tabs, history (claimed) | Assistant does multi-step tasks; **Background Assistant** (Max, rolling to Pro); "Computer in Comet Assistant" (Jul 2026) [secondary] | Classifier layers; enterprise admins limit actions | Roadmap promised it; reviews say recall is still unreliable | Strongest: Perplexity search, citations, Deep Research | MDM; community MCP wrappers only | Shipping on desktop, Android and iOS |
| Dia (Atlassian) | Tabs (@-mention), history by date, title or domain; past chats | Mostly chat plus SaaS tool calls (Slack, Outlook, Teams, Figma, Loom, Atlassian); little web-acting | Not documented | **Memory removed**; history plus past-chat search instead | Chat with tabs; Morning Brief | Connected SaaS "tools"; Skills (saved prompts) | Mac; Windows 1.0 shipped 6 Oct 2026 |
| Opera Neon | Tabs; Tasks (sandboxed workspaces) | Neon Do (acts), Make (builds apps), ODRA (deep research), Cards | Not well documented | Task contexts | ODRA deep research, 1-minute research | **Built-in MCP server**: Claude Code and Codex can drive your live session (31 Mar 2026) | Paid, $19.90/mo |
| Gemini in Chrome | Current tab by default; tabs you add with +; select-to-ask | **Auto browse**: click, scroll, type, forms, sign-in via Password Manager if you allow | Plan shown first; confirms before buy, post, sign-in; **User Alignment Critic** (second model vets each step); origin sets | Opt-in Personal Intelligence (past chats plus Gmail, Photos and others) | Multi-tab compare; YouTube summaries; Connected Apps | **Skills** (saved prompts, /); WebMCP coming (origin trial Chrome 149–156) | Free; auto browse needs AI Pro/Ultra, US only |
| Edge Copilot | Multi-tab with permission; history with permission; screen via Vision | "Browse with Copilot" (the old Actions): M365 Premium, US only, usage-capped | Per-capability toggles; visual cues for acting, listening or viewing | Long-term memory of past chats; **Journeys** (history turned into topic cards) | Multi-tab reasoning; tabs-to-podcast; quizzes | WebMCP behind a flag [secondary] | Shipping |
| Brave Leo + AI browsing | Current tab and tabs | Agentic mode in an **isolated, empty profile** | Separate profile with no cookies; guardrail model; Brave calls it "inherently dangerous" | Leo memory (optional) | Summaries | BYO model; experimental WebMCP [secondary] | Agent is a flag-gated test |
| Arc / Arc Search | Arc Search "Browse for me" builds a page from results | None | n/a | n/a | Browse-for-me pages | n/a | Maintenance only |
| Fellou | Logged-in sessions | Plans multi-step workflows; **you edit the plan before it runs** | Intervene at any step | "Agentic memory" from history and notes [vendor] | Deep search reports | n/a | Free tier, $20+/mo |
| Genspark browser | Tabs | Autopilot; Super Agent (calls, bookings, emails) | Not documented | n/a | Strong research and slides | **MCP Store (700+ tools)**; 169 on-device open models [vendor] | Credits |
| Sigma | Tabs | SigmaGPT forms and data extraction | n/a | Local by default [vendor] | n/a | n/a | Free, thin coverage |

---

## 2. Product details

### 2.1 Claude in Chrome, the Claude Code integration and Cowork (Anthropic)

**What it sees** [docs]
- The current page, plus multiple tabs once you drag them into Claude's tab group.
- Screenshots, region captures and uploaded images.
- The console, network requests and DOM state.

**What it does** [docs]
- Click, type, navigate, fill forms, and open, switch and close tabs.
- Upload images to forms and download files.
- Desktop notifications when it finishes or needs you.
- Keeps working in the background when you switch tabs, as long as Chrome is open.
- **Shortcuts**: saved prompts run with `/`.
- **Scheduled tasks**: daily, weekly, monthly or yearly, via the clock icon. Chrome must be open.
- **Workflow recording**: you show it the steps once and it saves them as a shortcut. Classic side panel only.

**How it asks** [docs]
- **Per site**: the first time it acts on a site you choose allow once, always allow, or decline.
- **Always asks** before downloads, entering sensitive data, or granting authorizations, even on approved sites.
- **Modes**: the side panel defaults to "Automatically approve", where a safety classifier checks every action and it pauses when needed. "Skip all approvals" also exists.
- **The 26 Aug 2026 change** to classifier-validated autonomy is reported by nohacks [secondary].
- **Hard blocks** [secondary]: trades, CAPTCHAs, card and SSN fields.
- **1Password beta**: you approve each login with biometrics and Claude never sees the secret.
- **Admins**: Team and Enterprise get site allowlists and blocklists.

**Claude Code** [docs]
- Start with `claude --chrome` or `/chrome`. It needs Chrome or Edge, extension 1.0.36 or later, and Claude Code 2.0.73 or later.
- It opens its own tabs and reuses your logins.
- It pauses on login pages and CAPTCHAs so you handle them.
- It does not work in Brave, Arc or WSL.

**Cowork** [docs]
- On Max and Team the side panel is now a Cowork session. It is saved to history, crosses devices, and has skills, plugins and connectors.
- Cowork can also use a built-in browser instead of Chrome.

**Memory**
- Claude account memory and chat history only. It does not build memory from your browsing.

**Speed and reliability claims** [vendor]
- Prompt-injection attack success was 23.6% with no mitigations and 11.2% with them (Aug 2025, 123 cases).
- The later "prompt injection defenses" post claims about 1% against an adaptive best-of-N attacker on Opus 4.5. Anthropic itself says 1% "still represents meaningful risk".
- The two numbers are not comparable.

**Incidents** [research]
- **Zenity (5 Aug 2026)**: a zero-click chain. "Summarize my emails" reads a planted email, which makes the agent run JS that watches Gmail for magic links or codes. That gave account takeover of Slack, X and Claude.ai, including all of the victim's connectors.
- Zenity says the reports were closed as out of scope in Jan 2026. SecurityWeek's coverage said the issues were unpatched.
- **"BragJack" (Sep 2026)**: a malicious extension hijacks the built-in agent. Claude in Chrome was one of five vendors listed as fixed [secondary].

### 2.2 ChatGPT Atlas, now the ChatGPT desktop browser (OpenAI)

**Atlas, Oct 2025 to Aug 2026**
- **Sidebar**: the "Ask ChatGPT" side panel.
- **Browser memories** (opt-in) [docs]:
  - Page summaries are made on OpenAI's servers. The raw page is deleted after summarizing and the summary within 7 days. The facts derived from them persist in ChatGPT memory.
  - Per-page visibility toggle, a history wipe, and parental controls.
- **Agent mode**: preview for Plus, Pro and Business.
  - It could not run code, download files or install extensions.
  - It paused on banks.
  - It had a logged-out mode.
  - "More persistent on long tasks" from 24 Feb 2026.
- **Benchmark** [vendor]: the CUA model scored 87% on WebVoyager.

**Atlas incidents** [research]
- **Tainted Memories (LayerX)**: a CSRF wrote persistent instructions into ChatGPT memory, and they follow the user across devices.
- **Omnibox injection**: a crafted fake URL got treated as a trusted prompt.
- **"Grand Theft Atlas" (Zenity, Aug 2026)**: a zero-click hijack.

**Successor, Jul 2026** [secondary, several outlets]
- **ChatGPT desktop app** for Mac, Windows and Linux preview, with a built-in browser: tabs, downloads, passwords, passkeys.
- **Cloud browser** for ChatGPT Work agents: approve actions, watch screenshots, take over.
- **Extension** for Chrome, Edge, Brave and Opera.
- **Lesson**: OpenAI concluded a whole browser was not worth maintaining, citing "browsers require ongoing security maintenance". The agent now lives in the assistant app.

### 2.3 Perplexity Comet

**Sees**: current and open tabs.

**Does**
- Multi-step tasks: booking, email, forms.
- **Background Assistant** [secondary]: Max, rolling out to Pro, for things like a daily 8:30 email-and-meetings summary.
  - One reviewer calls it "check back later" rather than true background work.
  - Users report memory spikes.
- **Voice mode** on GPT Realtime 1.5 keeps the conversation going across tab switches [docs].
- Android launched Nov 2025, iOS Mar 2026, enterprise with MDM.

**Research**: this is Perplexity's core. Cited answers, Deep Research, comparison across sites.

**Memory**
- Promised on the roadmap ("remembers past activities, sessions, workflows").
- A Feb 2026 review: it "still can't reliably recall past browsing sessions" [secondary].

**Security** [vendor]
- Layered ML classifiers run every time new content is fetched (Perplexity post, 22 Oct 2025).

**Incidents** [research]. Comet is the most-attacked product in the category.
- **Brave, hidden Reddit text**: led to OTP theft. The fixes were later bypassed.
- **Brave, screenshot-text injection.**
- **CometJacking (LayerX)**: instructions in a URL parameter exfiltrated Gmail and Calendar, base64-encoded. Perplexity said "no security impact".
- **Straiker**: an email triggered deletion of Google Drive files.
- **PleaseFix**: credential theft.
- **Phished in under 4 minutes.**
- **LayerX**: "85% more vulnerable to phishing than Chrome" [research, LayerX's own metric].
- **Legal**: an Amazon suit over agent shopping. The Ninth Circuit vacated the injunction on 4 Aug 2026 [secondary].

### 2.4 Dia (The Browser Company, owned by Atlassian since Oct 2025, $610M)

**Sees** [docs]
- Tabs, which you @-mention.
- History, searchable by date, title or domain.
- Past chats and artifacts it made.

**Does**
- Mostly chat plus tools in your SaaS apps: Slack (including images and voice notes), Outlook, SharePoint, Teams, Figma, Loom, Atlassian, plus "request any of the top 400 SaaS apps".
- Live Calendar and Morning Brief.
- Interrupt and steer mid-reply without cancelling tool calls (1.51).
- No documented web-clicking agent in the recent changelogs.

**Skills**
- Saved prompts that can call each other and reference tabs.

**Memory** [docs]
- 1.50.0, 24 Sep 2026: "We're phasing out Dia's memory feature and deleting existing memory data". It moved to on-demand tools instead.
- The earlier memory was an optional 7-day local browsing memory, off by default.

**Platforms**: Windows 1.0 shipped 6 Oct 2026.

**Lesson**: a polished team did ambient memory and removed it. On-demand recall (history search plus chat search) won.

### 2.5 Opera Neon

**Agents**
- **Do**: browses and acts.
- **Make**: builds small apps and documents in a sandbox.
- **ODRA**: deep research.
- **Chat**.
- **Tasks**: isolated workspaces that hold tabs and context.
- **Cards**: reusable, chainable prompts with a community gallery.

**Reviews** [secondary]
- Make is praised.
- Do is unreliable. It picked a worse product, couldn't be course-corrected mid-run, and was often slower than doing it by hand.

**MCP Connector** [docs, 31 Mar 2026]
- Neon is an MCP server.
- Claude, Claude Code, ChatGPT, Codex, n8n and others can drive your **live logged-in session**: navigate, extract, screenshot, fill forms, open tabs, search.
- Auth is a secret server URL plus a persistent proxy.
- **This is the closest commercial analogue to Samara's Claude door.**

**Price**: $19.90/mo. The free tier has none of the AI.

### 2.6 Gemini in Chrome (Google)

**Sees**
- The current tab by default. A Oct 2026 report says it is on by default.
- Other tabs only when you add them with +.
- Select-to-ask and pointer prompting.
- YouTube video summaries.

**Does**: auto browse (Jan 2026, Gemini 3) clicks, scrolls, types and fills forms.
- It shows a plan first; you confirm the page context and personal info, then start it.
- It stops before buying or posting.
- It signs in with Password Manager only if you allow.
- Requirements: AI Pro or Ultra, US, 18+, not in Incognito. Android since Aug 2026.

**Safety architecture** [docs, Dec 2025 Chrome security post]
- **User Alignment Critic**: a separate Gemini model sees only metadata about the proposed action, never raw web content, and vetoes misaligned steps. Repeated vetoes hand control back to the user.
- **Agent Origin Sets**: limit which origins a task can touch.
- A prompt-injection detector.
- Confirmations for banking, health, sign-in, purchases and posts.
- A bounty of up to $20k.

**Memory**
- Opt-in Personal Intelligence: past chats plus Gmail, Photos, YouTube and Search.
- Chats are kept in Gemini Apps Activity.

**Connected Apps**: Gmail, Calendar, YouTube, Maps, Shopping, Flights. Asks before sending email or creating events.

**Skills**: saved prompts run with / on any page and its added tabs. There is a library; en-US only.

**Hooks**: WebMCP (sites expose tools to the agent) is in an origin trial in Chrome 149–156. The spec is a draft and the API name is moving to `document.modelContext`.

**Weak spots** [secondary]
- Google's agent ignores robots.txt.
- Bookings fail with JS disabled.
- Google calls auto browse "transitional" on the way to MCP and agent commerce.

### 2.7 Microsoft Edge Copilot (Copilot Mode retired 13 May 2026)

All from the Edge blog [docs]:
- **Multi-tab reasoning** with permission.
- **History use** with permission.
- **Long-term memory** of past chats.
- **Journeys**: history turned into topic cards with summaries and "next steps" on the new tab page.
- **Vision and Voice**: share your screen, with visible "acting, listening, viewing" cues.
- **Study mode**, quizzes and flashcards, and **tabs-to-podcast**.
- **"Browse with Copilot"**, the old Actions: M365 Premium, US only, usage limits.

**Incident**: CoSnitch (CVE-2026-24301), where one click auto-ran an attacker's prompt. Patched [secondary].

### 2.8 Brave Leo and AI browsing

**Leo**: a chat sidebar with summaries and a choice of models. Optional memory.

**AI browsing** (test since Dec 2025, flag-gated) [docs/secondary]
- Runs in an **isolated profile** with no cookies or logins.
- A guardrail model checks actions against intent and never sees raw web content.
- Brave warns it is "inherently dangerous" and not for critical tasks.

**Lesson**: the safe default is no logins. That means it can't do the useful logged-in work.

### 2.9 Arc and Arc Search

- Maintenance mode; Chromium updates only.
- Arc Search's "Browse for me" is still a good pattern: one tap turns search results into a single generated page.

### 2.10 Newcomers

**Fellou**
- **Its best idea: an editable plan before execution.** You see the steps and change them, then it runs.
- Logged-in sessions on LinkedIn, Salesforce and Reddit.
- Weak on odd layouts. No extensions.
- Brave showed it obeys page instructions just by being navigated to a page.

**Genspark**
- An AI workspace dressed as a browser.
- MCP Store with 700+ tools; 169 on-device open models [vendor].
- Credit pricing is disliked.

**Sigma**: free and cross-platform, local by default [vendor]. Little independent testing.

**Atlas-style cloud agents** (ChatGPT Work cloud browser, Browserbase, Stagehand): run the agent in a remote browser you can watch and take over.

---

## 3. Cross-cutting findings

1. **Nobody has solved prompt injection.** The best published number is about 1% under adaptive attack (Anthropic, vendor). Every product has had a published hijack. The defences that recur:
   - A second model that sees only the action, never the page (Google's Critic, Brave's guardrail).
   - Origin limits per task (Google).
   - An isolated profile (Brave).
   - Confirm-before-irreversible (everyone).
   - A secret never shown to the model (1Password plus Claude).
2. **Memory is retreating to on-demand.**
   - Dia deleted its memory.
   - Atlas memories died with Atlas.
   - Comet's never worked reliably.
   - Edge and Gemini kept "memory of past chats" plus opt-in history use.
   - Memory poisoning (Tainted Memories) is a demonstrated attack.
3. **Everyone converged on saved prompts**: Chrome Skills, Dia Skills, Neon Cards, Claude shortcuts. Only Claude schedules them, and only while Chrome is open. Comet's background assistant is paywalled and patchy.
4. **"Let my own agent drive my real browser" is the 2026 hook.** Examples: Opera Neon's MCP server, Claude Code `--chrome`, Codex plus WebMCP, the ChatGPT extension. Samara already has this.
5. **Speed is still the weak spot.** Reviewers repeatedly found agents slower than a human on short tasks (Neon Do, Comet). The vendors themselves recommend watching rather than walking away.
6. **Research is Perplexity's moat.** The others offer multi-tab compare plus citations; deep research mostly lives in the chat app, not the browser.
7. **Gaming and video**: no AI browser does anything specific here. YouTube summaries (Gemini, Edge) are the only video feature.

---

## 4. What this means for Samara

What Samara already has (from `src/Shell/src/claude-door-mcp.mjs` and the samara-security notes):
- A Claude-door MCP with these tools: open, read, find, click, type, select, key, scroll, upload, picture, history, note, back/forward/close, check_form, collect_jobs, jobs, check_companies, sweep, sweep_status.
- Aang's `browse` tool, with a HOLD/trust list and a taint flag.
- Visits history that excludes banking sites.
- Tailscale sync between PC and Mac.
- castLabs Widevine (DRM video), Ghostery and Dark Reader.

### 4a. Table stakes Samara lacks (or should confirm it has)

1. **A visible "AI is driving" state with a big Stop and Take-over control.**
   - Everyone has one: Edge's acting cues, Claude's tab group, ChatGPT's watch-and-take-over.
   - Hidden tabs being driven with no live indicator is below the bar.
2. **Per-site permission memory**: allow once, always allow, or never, kept per site, plus an always-ask list for send, buy, post, delete and sign-in.
   - Samara has a HOLD list. It should become a visible, editable per-site list the user can review.
3. **A plan before the run** for multi-step tasks, which the user can edit (Fellou, Gemini).
4. **Ask about the tabs I choose**: pick 2–5 tabs and get a comparison with citations back to each tab. Chrome, Edge, Dia and Comet all have it.
5. **Saved prompts on `/` with a schedule** (Chrome Skills, Claude shortcuts). Aang already runs scheduled work, so this is mostly plumbing.
6. **PDF and video understanding in the tab**: summarize the PDF or YouTube video I'm on, with timestamps.
7. **Notification when a background task finishes or needs input.** It should come through Aang's bubble, not a toast.
8. **Search my history by meaning.** Dia: "the page about X from last Tuesday". Samara has `browser_history`; it needs a fuzzy, by-date, by-topic recall that the user can call.
9. **A second-model action check (critic)** for Aang-initiated writes. The Google and Brave pattern: a small local model (Qwen) sees only "about to type X into field Y on site Z for task T" and vetoes. This is cheap given local models.

### 4b. What would make Samara clearly better than all of them, for one power user

1. **Memory that compounds, but on-demand and owned.**
   - Aang's long-term memory plus Samara's visits gives cross-session recall nobody ships: "you looked at this company in August, here's what you noted, the role you rejected and why".
   - Keep it local, inspectable and editable. Pull it on demand, never inject it ambiently. That is the lesson from Dia's retreat and Atlas's memory poisoning.
2. **Job hunting as a first-class mode.** No competitor has this.
   - Samara already has `collect_jobs`, `check_companies`, `check_form` and `sweep`.
   - Add: an application tracker that writes itself from pages visited, "already applied / already seen" badges on job pages, company dossiers built from tabs plus email (Aang has email access), and form pre-fill that always stops before submit.
3. **Research that ends in a file, not a chat.**
   - Multi-tab synthesis with per-tab citations, saved as a note Aang can recall later.
   - Use Claude Code's power: it can write the report to disk, diff it against last week's, and schedule a re-check.
4. **Email and calendar plus browser in one brain.** Gemini and Dia only reach this through Google or Atlassian SaaS. Samara gets it through Aang:
   - "The interview invite in my inbox: open the company page, prep me, add travel time."
5. **Local-first lane.**
   - Qwen does page summaries, the critic and history search for free.
   - Claude is used only for the hard parts.
   - Nobody else pairs a local model with a frontier one inside the browser in a way the user controls; Genspark's on-device models are a credits product.
6. **Gaming and video awareness.**
   - Patch-note watching for WoW (Aang already knows the endpoints).
   - Recaps of YouTube or Twitch with timestamps.
   - "Pause AI when the game has focus".
   - The popout player with Widevine.
   - Nobody else has a gaming lane at all.
7. **Two agents, one browser, with a clear lane split.**
   - Claude Code is for work-shaped tasks (code, scraping, reports).
   - Aang is for life-shaped tasks (email, jobs, recall).
   - Both go through the same door, the same permission list and the same audit log.
   - Opera's MCP server is a single anonymous pipe by comparison.
8. **An audit log the user can read**: every action the AI took, on which site, why, and what it saw, as a timeline. No competitor exposes this well. It also makes injection incidents debuggable.

### 4c. Deliberately do NOT copy

1. **Ambient browsing memory that auto-ingests every page** (Atlas browser memories, early Dia). It is a poisoning surface, deleted or abandoned by the vendors, and creepy. Use on-demand recall plus explicit notes.
2. **"Skip all approvals" or full autonomy on logged-in sites.** Every zero-click account takeover (Zenity on Claude and Atlas, CometJacking, Straiker on Comet) needed an agent free to act in logged-in sessions while reading attacker text. Keep the always-ask list for send, buy, post, delete, sign-in and any money site.
3. **Running page JavaScript on the model's say-so.** The Zenity chain on Claude in Chrome turned a summary request into JS that watched Gmail for login codes. The AI should not get a general "execute JS" tool on logged-in tabs.
4. **Following instructions found in URL parameters or the address bar** (CometJacking, the Atlas omnibox). Treat any URL text as data.
5. **Reading the inbox and acting on the web in the same unattended run.** This is the exact Zenity and Straiker pattern. Split them, or require a confirm between "read email" and "act on another site".
6. **Becoming a general-purpose AI browser.** OpenAI quit, citing the security-maintenance burden. Samara should stay a personal tool around Aang and Claude Code, not chase Make-style app builders, podcasts, quizzes, shopping agents or Cards galleries.
7. **Agent shopping and checkout.** It is legally contested (Amazon v. Perplexity), the most-attacked flow, and low value for this user.
8. **Credit-metered AI and paywalled basics** (Genspark, Neon, Comet Max). Samara's AI should use the subscription and local models, not invent a meter.
9. **Cloud-browser agents.** They lose his logins, his Widevine and his privacy, which are the very things that make Samara his.

---

## 5. Sources

**Vendor**
- Claude in Chrome help: https://support.claude.com/en/articles/12012173-get-started-with-claude-in-chrome
- Claude Code Chrome docs: https://code.claude.com/docs/en/chrome
- Anthropic, Claude for Chrome launch: https://www.anthropic.com/news/claude-for-chrome
- Anthropic, prompt injection defenses: https://www.anthropic.com/research/prompt-injection-defenses
- Dia changelog: https://www.diabrowser.com/changelog
- Edge blog, 13 May 2026: https://blogs.windows.com/msedgedev/2026/05/13/new-updates-to-edge-across-desktop-and-mobile/
- Opera Neon MCP Connector: https://operaneon.com/news/opera-neon-adds-mcp-connector-to-the-browser
- Opera Neon MCP coverage: https://www.neowin.net/news/opera-neon-now-lets-external-ai-agents-like-chatgpt-and-claude-control-your-browser/
- Perplexity, mitigating prompt injection in Comet: https://www.perplexity.ai/hub/blog/mitigating-prompt-injection-in-comet
- Comet "what's new": https://www.perplexity.ai/comet/whats-new/releases-2.25.26

**Coverage and guides**
- Gemini in Chrome guide (Oct 2026): https://chromestory.com/2026/10/gemini-in-chrome-ai-features-guide/
- Gemini on Android: https://9to5google.com/2026/08/18/gemini-chrome-android-us/
- Google's User Alignment Critic: https://9to5google.com/2025/12/08/gemini-chrome-agentic-security/
- Critic coverage: https://www.bleepingcomputer.com/news/security/google-chrome-adds-new-security-layer-for-gemini-ai-agentic-browsing/
- Atlas shutdown: https://www.eweek.com/news/openai-atlas-browser-shutdown-chatgpt/
- Atlas shutdown: https://cybernews.com/ai-news/openai-shutters-atlas-ai/
- Atlas guide: https://www.ai-toolbox.co/chatgpt-management-and-productivity/chatgpt-atlas-browser-guide-2026
- Agentic browser landscape: https://nohacks.co/blog/agentic-browser-landscape-2026
- Brave AI browsing: https://www.bleepingcomputer.com/news/artificial-intelligence/brave-browser-starts-testing-agentic-ai-mode-for-automated-tasks/
- Opera Neon review: https://www.thurrott.com/a-i/328065/opera-neon-first-impressions
- Opera Neon review: https://toolchase.com/tool/opera-neon/
- Comet review: https://aitoolanalysis.com/comet-browser-review/
- Claude in Chrome vs Comet: https://www.usecarly.com/blog/claude-in-chrome-vs-comet/

**Security research**
- Zenity, Claude in Chrome account takeover: https://labs.zenity.io/post/claude-in-chrome-from-alert-to-full-account-takeover
- SecurityWeek on Zenity: https://www.securityweek.com/zero-click-ai-browser-hacking-claude-and-chatgpt-atlas-hijacked-via-emails-x-posts/
- Brave, unseeable prompt injections: https://brave.com/blog/unseeable-prompt-injections/
- Simon Willison on agentic browser security: https://simonwillison.net/2025/Aug/25/agentic-browser-security/
- CometJacking: https://www.bleepingcomputer.com/news/security/commetjacking-attack-tricks-comet-browser-into-stealing-emails/
- Straiker, Comet Drive wiper: https://www.straiker.ai/blog/from-inbox-to-wipeout-perplexity-comets-ai-browser-quietly-erasing-google-drive
- BioShocking: https://www.securityweek.com/bioshocking-attack-tricks-ai-browsers-into-stealing-credentials/
- Wiz 2025 year-end review: https://www.wiz.io/blog/agentic-browser-security-2025-year-end-review

**WebMCP**
- https://mcpplaygroundonline.com/blog/what-is-webmcp
- https://studiomeyer.io/en/blog/webmcp-reality-check-may-2026

---

## 6. Twelve-line summary

1. The AI-browser field is shrinking: OpenAI killed Atlas in August, Dia deleted its memory, and Edge folded Copilot Mode away.
2. What survived is an assistant that drives a real browser. Samara already does this with Claude Code and Aang, so its architecture is on the right side.
3. Missing basics: a visible "AI is driving" bar with Stop and Take over, and per-site allow/ask/never rules that you can see and edit.
4. Also missing: a plan shown before multi-step runs, "compare these tabs" with citations, and in-tab PDF and YouTube summaries.
5. Saved prompts on "/" that can run on a schedule are now everywhere. Aang can already schedule, so this is cheap to add.
6. The biggest win is memory that grows but stays on-demand: Aang recalls what you saw, noted and decided, and you can see and edit it.
7. Job hunting is wide open. No competitor has seen/applied badges, a tracker that fills itself, company dossiers, or pre-fill that stops before Submit.
8. Research should end in a saved file Aang remembers and Claude can re-check next week, not a chat that vanishes.
9. Email, calendar and browser in one brain beats Gemini and Dia: "prep me for this interview invite" end to end.
10. Use Qwen locally as a free second opinion on every AI action, the same idea as Google's critic. Also use it for summaries and history search.
11. Gaming and video are untouched by everyone: patch watching, stream recaps with timestamps, and AI that goes quiet while WoW has focus.
12. Don't copy: auto-memory of every page, skip-all-approvals, AI-run page JavaScript, URL-borne instructions, email-then-act unattended, shopping agents, or credits.
